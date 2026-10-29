import path from 'path';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Yêu cầu đến từ chính máy chủ (không qua đường link công khai). */
const isLocalRequest = (req: http.IncomingMessage) => {
  const fromTunnel = !!(req.headers['cf-ray'] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']);
  return !fromTunnel && /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
};

/* ------------------------------------------------------------------
 * Cấu hình AI phía máy chủ: key chỉ nằm ở đây, không bao giờ gửi xuống trình duyệt.
 * Nguồn: tools/ai-config.json (lưu từ hộp thoại "Cài đặt API" trên chính máy chủ),
 * nếu chưa có thì lấy từ .env.local (AI_* hoặc VITE_AI_*).
 * ------------------------------------------------------------------ */
type ServerAI = {
  provider: 'gemini' | 'openai';
  geminiKey: string; geminiModel: string; geminiModelStrong: string;
  baseUrl: string; apiKey: string; wire: 'chat' | 'responses';
  model: string; modelStrong: string; reasoning: string; jsonMode: string; headers: string; rpm: number;
};
const CONFIG_FILE = path.resolve('tools/ai-config.json');

const configFromEnv = (env: Record<string, string>): ServerAI => {
  const g = (k: string) => env['AI_' + k] ?? env['VITE_AI_' + k] ?? '';
  const geminiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
  const apiKey = g('API_KEY');
  const p = g('PROVIDER');
  return {
    provider: p === 'openai' || (p !== 'gemini' && apiKey && !geminiKey) ? 'openai' : 'gemini',
    geminiKey,
    geminiModel: env.GEMINI_MODEL || env.VITE_GEMINI_MODEL || '',
    geminiModelStrong: env.GEMINI_MODEL_STRONG || env.VITE_GEMINI_MODEL_STRONG || '',
    baseUrl: g('BASE_URL') || 'https://api.openai.com/v1',
    apiKey,
    wire: g('WIRE_API') === 'responses' ? 'responses' : 'chat',
    model: g('MODEL') || 'gpt-5.4-mini',
    modelStrong: g('MODEL_STRONG'),
    reasoning: ['low', 'medium', 'high'].includes(g('REASONING')) ? g('REASONING') : '',
    jsonMode: g('JSON_MODE') === 'json_object' ? 'json_object' : 'json_schema',
    headers: g('HEADERS').replace(/^'|'$/g, ''),
    rpm: Math.max(0, Number(g('RPM')) || 0),
  };
};

const maskKey = (k: string) => (!k ? '' : k.length <= 10 ? '•'.repeat(k.length) : `${k.slice(0, 5)}…${k.slice(-4)}`);

/** Gửi tiếp yêu cầu tới máy chủ AI thật (dùng http/https của Node, chạy ổn định trên Windows). */
const forward = (req: http.IncomingMessage, res: http.ServerResponse, target: URL, headers: Record<string, string>) => {
  headers['host'] = target.host;
  // Header thêm (từ Cài đặt API) phải là chữ ASCII một dòng; bỏ header sai để không làm sập yêu cầu
  for (const [k, v] of Object.entries(headers)) {
    const val = String(v ?? '');
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k) || /[^\t\x20-\x7e]/.test(val)) {
      console.warn('[ai-proxy] Bỏ header không hợp lệ:', k);
      delete headers[k];
    } else headers[k] = val;
  }
  const lib = target.protocol === 'https:' ? https : http;
  let upstream: http.ClientRequest;
  try {
  // autoSelectFamily: thử song song IPv4/IPv6, tránh treo khi mạng IPv6 hỏng
  upstream = lib.request(target, { method: req.method, headers, timeout: 300_000, autoSelectFamily: true } as any, (up) => {
    res.statusCode = up.statusCode || 502;
    for (const [k, v] of Object.entries(up.headers)) {
      if (v !== undefined && !['connection', 'transfer-encoding'].includes(k)) res.setHeader(k, v as any);
    }
    up.pipe(res);
  });
  } catch (e: any) {
    console.error('[ai-proxy]', target.host, e?.code || e);
    return sendText(res, 500, `Máy chủ không tạo được yêu cầu tới ${target.host}: ${e?.message || e}`);
  }
  upstream.on('timeout', () => upstream.destroy(Object.assign(new Error('Quá thời gian chờ (5 phút)'), { code: 'ETIMEDOUT' })));
  upstream.on('error', (e: any) => {
    console.error('[ai-proxy]', target.host, e?.code || e);
    if (res.headersSent) return res.end();
    res.statusCode = 502;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    const hint =
      e?.code === 'ENOTFOUND' ? ' (không tìm thấy tên miền, kiểm tra Địa chỉ API hoặc mạng)'
      : e?.code === 'ECONNREFUSED' ? ' (máy chủ từ chối kết nối)'
      : e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' ? ' (mạng chậm/bị chặn, thử tắt VPN/tường lửa hoặc thử lại)'
      : /certificate|CERT|SSL|TLS/i.test(String(e?.code || e?.message)) ? ' (lỗi chứng chỉ HTTPS, có thể do phần mềm diệt virus/proxy chặn)'
      : '';
    res.end(`Proxy không kết nối được tới ${target.host}: ${e?.code || ''} ${e?.message || e}${hint}`);
  });
  req.pipe(upstream);
  // Trình duyệt đóng kết nối (tắt tab, mất mạng): huỷ yêu cầu lên dịch vụ AI
  res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
};

const sendText = (res: http.ServerResponse, status: number, text: string) => {
  res.statusCode = status;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(text);
};
const sendJson = (res: http.ServerResponse, status: number, data: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
};
const readBody = (req: http.IncomingMessage, limit = 100_000) =>
  new Promise<string>((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const aiServer = (env: Record<string, string>): Plugin => ({
  name: 'legalbiz-ai-server',
  configureServer(server) {
    const load = (): { cfg: ServerAI; source: 'file' | 'env' } => {
      const base = configFromEnv(env);
      try {
        if (fs.existsSync(CONFIG_FILE)) return { cfg: { ...base, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }, source: 'file' };
      } catch (e) {
        console.error('[ai-config] Không đọc được tools/ai-config.json', e);
      }
      return { cfg: base, source: 'env' };
    };

    // Cấu hình cho trình duyệt: KHÔNG kèm key. Máy chủ (localhost) được xem thêm phần đầu/cuối key và có quyền sửa.
    server.middlewares.use('/__ai/config', async (req, res) => {
      const admin = isLocalRequest(req);
      if (req.method === 'GET') {
        const { cfg, source } = load();
        const { apiKey, geminiKey, headers, baseUrl, ...rest } = cfg;
        return sendJson(res, 200, {
          isAdmin: admin,
          source,
          hasApiKey: !!apiKey,
          hasGeminiKey: !!geminiKey,
          settings: admin ? { ...rest, headers, baseUrl } : rest,
          ...(admin ? { apiKeyHint: maskKey(apiKey), geminiKeyHint: maskKey(geminiKey) } : {}),
        });
      }
      if (!admin) return sendText(res, 403, 'Chỉ có thể đổi cấu hình AI trên máy chủ (mở http://localhost trên máy đó).');
      if (req.method === 'DELETE') {
        try { fs.rmSync(CONFIG_FILE, { force: true }); } catch { /* bỏ qua */ }
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req));
          const { cfg } = load();
          const allowed: (keyof ServerAI)[] = ['provider', 'geminiModel', 'geminiModelStrong', 'baseUrl', 'wire', 'model', 'modelStrong', 'reasoning', 'jsonMode', 'headers', 'rpm'];
          const next: ServerAI = { ...cfg };
          for (const k of allowed) if (body.settings && k in body.settings) (next as any)[k] = body.settings[k];
          // Key: để trống = giữ key cũ; "__clear__" = xoá
          if (typeof body.apiKey === 'string' && body.apiKey.trim()) next.apiKey = body.apiKey.trim() === '__clear__' ? '' : body.apiKey.trim();
          if (typeof body.geminiKey === 'string' && body.geminiKey.trim()) next.geminiKey = body.geminiKey.trim() === '__clear__' ? '' : body.geminiKey.trim();
          if (next.headers?.trim()) JSON.parse(next.headers);
          fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
          return sendJson(res, 200, { ok: true });
        } catch (e: any) {
          return sendText(res, 400, 'Cấu hình không hợp lệ: ' + (e?.message || e));
        }
      }
      return sendText(res, 405, 'Method not allowed');
    });

    // API chuẩn OpenAI: máy chủ tự gắn địa chỉ, key và header; bỏ qua mọi key/địa chỉ do trình duyệt gửi.
    server.middlewares.use('/ai-api', (req, res) => {
      const { cfg } = load();
      if (!cfg.apiKey) return sendText(res, 503, 'Máy chủ chưa có API key. Mở "Cài đặt API" trên máy chủ để nhập.');
      let target: URL;
      try {
        target = new URL(cfg.baseUrl.replace(/\/+$/, '') + (req.url || ''));
        if (!/^https?:$/.test(target.protocol)) throw new Error('bad protocol');
      } catch {
        return sendText(res, 500, 'Địa chỉ API trên máy chủ không hợp lệ: ' + cfg.baseUrl);
      }
      let extra: Record<string, string> = {};
      try { extra = cfg.headers?.trim() ? JSON.parse(cfg.headers) : {}; } catch { /* bỏ qua */ }
      const headers: Record<string, string> = { ...extra, authorization: `Bearer ${cfg.apiKey}` };
      for (const k of ['content-type', 'accept', 'content-length']) {
        const v = req.headers[k];
        if (typeof v === 'string') headers[k] = v;
      }
      forward(req, res, target, headers);
    });

    // Google Gemini: thư viện trên trình duyệt gọi /gemini-api/..., máy chủ thay bằng key thật.
    server.middlewares.use('/gemini-api', (req, res) => {
      const { cfg } = load();
      if (!cfg.geminiKey) return sendText(res, 503, 'Máy chủ chưa có Gemini API key. Mở "Cài đặt API" trên máy chủ để nhập.');
      const target = new URL('https://generativelanguage.googleapis.com' + (req.url || '/'));
      target.searchParams.delete('key');
      const headers: Record<string, string> = { 'x-goog-api-key': cfg.geminiKey };
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v !== 'string') continue;
        if (['content-type', 'accept', 'content-length'].includes(k) || (k.startsWith('x-goog-') && k !== 'x-goog-api-key')) headers[k] = v;
      }
      forward(req, res, target, headers);
    });
  },
});

/**
 * Mẫu Word cho "Hồ sơ sau thành lập": mọi file .docx trong thư mục mau-sau-thanh-lap của dự án.
 *  GET /__mau-stl            -> { dir, files: [tên file] }
 *  GET /__mau-stl?file=X.docx -> nội dung file
 *  GET/POST /__mau-stl/config -> thông tin nhớ dùng chung (người ủy quyền, kế toán, email...) lưu ở tools/sau-thanh-lap.json
 *  (tools/ không đưa lên GitHub vì có số định danh)
 */
const MAU_STL_DIR = path.resolve('mau-sau-thanh-lap');
const STL_CONFIG = path.resolve('tools/sau-thanh-lap.json');
const docStlConfig = (): Record<string, string> => {
  try { return fs.existsSync(STL_CONFIG) ? JSON.parse(fs.readFileSync(STL_CONFIG, 'utf8')) : {}; } catch { return {}; }
};
const mauSauThanhLap = (): Plugin => ({
  name: 'legalbiz-mau-sau-thanh-lap',
  configureServer(server) {
    server.middlewares.use('/__mau-stl', async (req, res) => {
      const url = new URL(req.url || '/', 'http://x');
      if (url.pathname === '/config') {
        if (req.method === 'GET') return sendJson(res, 200, docStlConfig());
        if (req.method === 'POST') {
          try {
            const moi = JSON.parse(await readBody(req)) as Record<string, unknown>;
            const cfg = docStlConfig();
            for (const [k, v] of Object.entries(moi)) if (/^[A-Z0-9_]+$/.test(k) && typeof v === 'string') cfg[k] = v;
            fs.mkdirSync(path.dirname(STL_CONFIG), { recursive: true });
            fs.writeFileSync(STL_CONFIG, JSON.stringify(cfg, null, 2), 'utf8');
            return sendJson(res, 200, cfg);
          } catch (e: any) { return sendJson(res, 400, { error: String(e?.message || e) }); }
        }
        return sendJson(res, 405, { error: 'Chỉ hỗ trợ GET, POST' });
      }
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Chỉ hỗ trợ GET' });
      const file = url.searchParams.get('file');
      try {
        if (!fs.existsSync(MAU_STL_DIR)) fs.mkdirSync(MAU_STL_DIR, { recursive: true });
        if (!file) {
          const files = fs.readdirSync(MAU_STL_DIR).filter((f) => /\.docx$/i.test(f) && !f.startsWith('~$')).sort((a, b) => a.localeCompare(b, 'vi'));
          return sendJson(res, 200, { dir: MAU_STL_DIR, files });
        }
        const ten = path.basename(file);
        const full = path.join(MAU_STL_DIR, ten);
        if (ten !== file || !/\.docx$/i.test(ten) || !fs.existsSync(full)) return sendJson(res, 404, { error: 'Không có mẫu này' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Cache-Control', 'no-store');
        res.end(fs.readFileSync(full));
      } catch (e: any) {
        sendJson(res, 500, { error: String(e?.message || e) });
      }
    });
  },
});

/**
 * Đọc PDF Giấy chứng nhận đăng ký doanh nghiệp KHÔNG dùng AI: chạy scripts/doc_gp.py (phần đọc PDF của tool dien_mau.py).
 *  POST /__doc-gp (thân = file PDF) -> { ok, fields, chars } | { ok:false, error }
 * Cần Python + pdfminer.six, fonttools (start-public.bat tự cài). Đặt biến PYTHON để chỉ định python.exe.
 */
const DOC_GP_SCRIPT = path.resolve('scripts/doc_gp.py');
const readRaw = (req: http.IncomingMessage, limit = 30_000_000) =>
  new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = []; let n = 0;
    req.on('data', (c: Buffer) => { n += c.length; if (n > limit) { reject(new Error('File quá lớn')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
const chayPython = (args: string[], timeoutMs = 90_000) => {
  const ung = [process.env.PYTHON, ...(process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'])].filter(Boolean) as string[];
  return new Promise<{ code: number; out: string; err: string }>((resolve, reject) => {
    const thu = (i: number) => {
      if (i >= ung.length) return reject(new Error('khong_co_python'));
      let out = '', err = '';
      const p = spawn(ung[i], args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      const t = setTimeout(() => p.kill(), timeoutMs);
      p.stdout.on('data', (d) => { out += d.toString('utf8'); });
      p.stderr.on('data', (d) => { err += d.toString('utf8'); });
      p.on('error', () => { clearTimeout(t); thu(i + 1); });
      p.on('close', (code) => { clearTimeout(t); resolve({ code: code ?? 1, out, err }); });
    };
    thu(0);
  });
};
const docGiayPhepPdf = (): Plugin => ({
  name: 'legalbiz-doc-gp',
  configureServer(server) {
    server.middlewares.use('/__doc-gp', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Chỉ hỗ trợ POST' });
      const tmp = path.join(os.tmpdir(), `legalbiz-gp-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
      try {
        const pdf = await readRaw(req);
        if (pdf.subarray(0, 5).toString() !== '%PDF-') return sendJson(res, 400, { ok: false, error: 'khong_phai_pdf' });
        fs.writeFileSync(tmp, pdf);
        const r = await chayPython([DOC_GP_SCRIPT, tmp]);
        try { return sendJson(res, 200, JSON.parse(r.out)); }
        catch { return sendJson(res, 200, { ok: false, error: 'doc_loi', detail: (r.err || r.out).slice(-500) }); }
      } catch (e: any) {
        return sendJson(res, 200, { ok: false, error: String(e?.message || e) });
      } finally {
        try { fs.unlinkSync(tmp); } catch { /* bỏ qua */ }
      }
    });
  },
});

/**
 * Đổi Word (.docx) sang PDF cho trang "Gộp file PDF" (như tool merge_word_gui.py):
 * ưu tiên LibreOffice, dự phòng Microsoft Word qua thư viện Python docx2pdf.
 *  POST /__docx-pdf (thân = file .docx) -> file PDF | { error }
 */
const timSoffice = () => {
  const ung = process.platform === 'win32'
    ? ['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe']
    : ['/usr/bin/soffice', '/usr/local/bin/soffice', '/opt/libreoffice/program/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'];
  return ung.find((x) => fs.existsSync(x)) || 'soffice';
};
const chay = (cmd: string, args: string[], timeoutMs = 120_000) =>
  new Promise<{ code: number; err: string }>((resolve) => {
    let err = '';
    const p = spawn(cmd, args, { windowsHide: true });
    const t = setTimeout(() => p.kill(), timeoutMs);
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, err: String(e) }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code: code ?? 1, err }); });
  });
const wordSangPdf = (): Plugin => ({
  name: 'legalbiz-docx-pdf',
  configureServer(server) {
    server.middlewares.use('/__docx-pdf', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Chỉ hỗ trợ POST' });
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legalbiz-gop-'));
      try {
        const docx = await readRaw(req);
        if (docx.subarray(0, 2).toString() !== 'PK') return sendJson(res, 400, { error: 'File không phải Word (.docx)' });
        const vao = path.join(dir, 'tai_lieu.docx');
        const ra = path.join(dir, 'tai_lieu.pdf');
        fs.writeFileSync(vao, docx);
        // 1) LibreOffice (hồ sơ người dùng riêng để chạy song song không bị khoá)
        const profile = pathToFileURL(path.join(dir, 'lo-profile')).href;
        const lo = await chay(timSoffice(), [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, vao]);
        // 2) Microsoft Word qua docx2pdf (Windows)
        let loiWord = '';
        if (!fs.existsSync(ra)) {
          try {
            const w = await chayPython(['-c', 'import sys\nfrom docx2pdf import convert\nconvert(sys.argv[1], sys.argv[2])', vao, ra], 180_000);
            loiWord = w.err.slice(-300);
          } catch (e: any) { loiWord = String(e?.message || e); }
        }
        if (!fs.existsSync(ra)) {
          return sendJson(res, 500, { error: `Không đổi được Word sang PDF: máy chủ cần LibreOffice hoặc Microsoft Word (+ pip install docx2pdf). ${lo.code === -1 ? 'Không tìm thấy LibreOffice.' : ''} ${loiWord}`.trim() });
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'no-store');
        res.end(fs.readFileSync(ra));
      } catch (e: any) {
        sendJson(res, 500, { error: String(e?.message || e) });
      } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* bỏ qua */ }
      }
    });
  },
});

/**
 * Khoá web bằng mật khẩu khi đặt biến APP_PASSWORD (file start-public.bat tự đặt).
 * - Truy cập từ chính máy này (localhost) không cần mật khẩu.
 * - Truy cập qua đường link công khai phải đăng nhập 1 lần, trình duyệt nhớ 30 ngày.
 */
const passwordGate = (password: string): Plugin => ({
  name: 'legalbiz-password-gate',
  configureServer(server) {
    if (!password) return;
    const token = crypto.createHash('sha256').update('legalbiz:' + password).digest('hex');
    const failures = new Map<string, { n: number; until: number }>();

    const loginPage = (error = '') => `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Đăng nhập · LegalBiz AI</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;padding:16px}
  form{background:#fff;border-radius:16px;padding:28px;width:100%;max-width:340px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
  h1{font-size:20px;margin:0 0 4px} p{margin:0 0 18px;color:#64748b;font-size:14px}
  input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px}
  input:focus{outline:2px solid #2563eb;border-color:#2563eb}
  button{margin-top:12px;width:100%;padding:11px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  .err{color:#b91c1c;font-size:13px;margin-top:10px}
</style></head><body>
<form method="post" action="/__login">
  <h1>LegalBiz AI</h1><p>Nhập mật khẩu để sử dụng</p>
  <input type="password" name="password" placeholder="Mật khẩu" autofocus required>
  <button type="submit">Đăng nhập</button>
  ${error ? `<div class="err">${error}</div>` : ''}
</form></body></html>`;

    server.middlewares.use((req, res, next) => {
      const remote = req.socket.remoteAddress || '';
      if (isLocalRequest(req)) return next();

      const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || remote).split(',')[0].trim();
      const cookie = String(req.headers.cookie || '');
      if (cookie.split(/;\s*/).includes('lb_auth=' + token)) return next();

      if (req.url?.startsWith('/__login') && req.method === 'POST') {
        const f = failures.get(ip);
        if (f && f.until > Date.now()) {
          res.statusCode = 429;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          return res.end(loginPage('Sai quá nhiều lần. Thử lại sau 10 phút.'));
        }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 10_000) req.destroy(); });
        req.on('end', () => {
          const given = new URLSearchParams(body).get('password') || '';
          const a = crypto.createHash('sha256').update(given).digest();
          const b = crypto.createHash('sha256').update(password).digest();
          if (crypto.timingSafeEqual(a, b)) {
            failures.delete(ip);
            const secure = req.headers['x-forwarded-proto'] === 'https' || !!req.headers['cf-ray'] ? '; Secure' : '';
            res.statusCode = 303;
            res.setHeader('set-cookie', `lb_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
            res.setHeader('location', '/');
            return res.end();
          }
          const cur = failures.get(ip) || { n: 0, until: 0 };
          cur.n += 1;
          if (cur.n >= 10) { cur.until = Date.now() + 10 * 60_000; cur.n = 0; }
          failures.set(ip, cur);
          res.statusCode = 401;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(loginPage('Mật khẩu không đúng.'));
        });
        return;
      }

      res.statusCode = 401;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(loginPage());
    });
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const password = process.env.APP_PASSWORD || env.APP_PASSWORD || '';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Cho phép mở qua đường link công khai (Cloudflare Tunnel / ngrok)
        allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app', '.loca.lt', ...(env.PUBLIC_HOSTS ? env.PUBLIC_HOSTS.split(',') : [])],
      },
      plugins: [passwordGate(password), react(), aiServer(env), mauSauThanhLap(), docGiayPhepPdf(), wordSangPdf()],
      // Không đưa biến VITE_* (chứa key) xuống trình duyệt; key chỉ đọc ở máy chủ.
      envPrefix: 'LEGALBIZ_PUBLIC_',
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      }
    };
});
