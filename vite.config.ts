import path from 'path';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Địa chỉ nội bộ (máy này, mạng LAN): không cho proxy gọi tới khi web được public. */
const isPrivateHost = (host: string) => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') ||
    h === '0.0.0.0' || h === '::' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)
  );
};

/**
 * Proxy /ai-api cho npm run dev (tránh lỗi CORS khi gọi API chuẩn OpenAI từ trình duyệt).
 * Địa chỉ đích lấy từ header x-ai-target (do "Cài đặt API" trên web gửi kèm),
 * nếu không có thì dùng VITE_AI_BASE_URL trong .env.local.
 * Dùng http/https của Node (giống proxy mặc định của Vite) để chạy ổn định trên Windows.
 */
const aiProxy = (fallbackBase: string): Plugin => ({
  name: 'legalbiz-ai-proxy',
  configureServer(server) {
    server.middlewares.use('/ai-api', (req, res) => {
      const targetHeader = req.headers['x-ai-target'];
      const base = String((Array.isArray(targetHeader) ? targetHeader[0] : targetHeader) || fallbackBase).replace(/\/+$/, '');
      let target: URL;
      try {
        target = new URL(base + (req.url || ''));
        if (!/^https?:$/.test(target.protocol)) throw new Error('bad protocol');
      } catch {
        res.statusCode = 400;
        res.end('Địa chỉ API không hợp lệ: ' + base);
        return;
      }
      if (isPrivateHost(target.hostname)) {
        res.statusCode = 403;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('Không cho phép gọi tới địa chỉ nội bộ: ' + target.hostname);
        return;
      }

      // Chỉ chuyển tiếp các header cần thiết (Authorization, Content-Type, header x-... riêng của nhà cung cấp)
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        const key = k.toLowerCase();
        const keep =
          ['authorization', 'content-type', 'accept', 'content-length'].includes(key) ||
          (key.startsWith('x-') && key !== 'x-ai-target' && !key.startsWith('x-forwarded'));
        if (keep) headers[key] = Array.isArray(v) ? v.join(', ') : v;
      }
      headers['host'] = target.host;

      const lib = target.protocol === 'https:' ? https : http;
      const upstream = lib.request(
        target,
        { method: req.method, headers, timeout: 300_000 },
        (up) => {
          res.statusCode = up.statusCode || 502;
          for (const [k, v] of Object.entries(up.headers)) {
            if (v !== undefined && !['connection', 'transfer-encoding'].includes(k)) res.setHeader(k, v as any);
          }
          up.pipe(res);
        }
      );
      upstream.on('timeout', () => upstream.destroy(Object.assign(new Error('Quá thời gian chờ (5 phút)'), { code: 'ETIMEDOUT' })));
      upstream.on('error', (e: any) => {
        console.error('[ai-proxy]', target.href, e);
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
      const fromTunnel = !!(req.headers['cf-ray'] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']);
      const remote = req.socket.remoteAddress || '';
      const isLocal = !fromTunnel && /^(::1|127\.|::ffff:127\.)/.test(remote);
      if (isLocal) return next();

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
      plugins: [passwordGate(password), react(), aiProxy(env.VITE_AI_BASE_URL || 'https://api.openai.com/v1')],
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      }
    };
});
