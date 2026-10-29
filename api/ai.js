/**
 * Máy chủ AI khi chạy trên Vercel (thay cho phần /__ai/config, /ai-api, /gemini-api của vite.config.ts).
 * Key chỉ nằm trong Environment Variables của Vercel, không bao giờ gửi xuống trình duyệt.
 * Người dùng trên Vercel KHÔNG được sửa cấu hình (isAdmin = false); chỉ sửa trong Vercel.
 *
 * Biến môi trường (Vercel > Project > Settings > Environment Variables):
 *   Cách 1 (dễ nhất): AI_CONFIG_JSON = toàn bộ nội dung file tools/ai-config.json trên máy chủ.
 *   Cách 2: từng biến AI_PROVIDER, AI_BASE_URL, AI_API_KEY, AI_WIRE_API, AI_MODEL, AI_MODEL_STRONG,
 *           AI_REASONING, AI_JSON_MODE, AI_HEADERS, AI_RPM, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_MODEL_STRONG
 *   (Cách 1 được ưu tiên; biến ở cách 2 dùng cho phần còn thiếu.)
 */

const fromEnv = () => {
  const env = process.env;
  const g = (k) => env['AI_' + k] ?? env['VITE_AI_' + k] ?? '';
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

const load = () => {
  const base = fromEnv();
  const raw = process.env.AI_CONFIG_JSON;
  if (raw && raw.trim()) {
    try { return { ...base, ...JSON.parse(raw) }; } catch (e) { console.error('[ai] AI_CONFIG_JSON không phải JSON hợp lệ', e); }
  }
  return base;
};

const text = (res, status, msg) => {
  res.statusCode = status;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(msg);
};

const readBody = async (req) => {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
};

/** Header thêm phải là chữ ASCII một dòng; bỏ header sai. */
const sachHeader = (h) => {
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    const val = String(v ?? '');
    if (/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k) && !/[^\t\x20-\x7e]/.test(val)) out[k] = val;
  }
  return out;
};

const forward = async (req, res, target, headers) => {
  let up;
  try {
    up = await fetch(target, { method: req.method, headers: sachHeader(headers), body: await readBody(req) });
  } catch (e) {
    const c = e?.cause?.code || e?.code || '';
    return text(res, 502, `Proxy không kết nối được tới ${target.host}: ${c} ${e?.cause?.message || e?.message || e}`);
  }
  res.statusCode = up.status;
  const type = up.headers.get('content-type');
  if (type) res.setHeader('content-type', type);
  res.end(Buffer.from(await up.arrayBuffer()));
};

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://x');
  const kind = url.searchParams.get('kind');
  const sub = '/' + (url.searchParams.get('path') || '').replace(/^\/+/, '');
  url.searchParams.delete('kind');
  url.searchParams.delete('path');
  const qs = url.searchParams.toString();
  const cfg = load();

  if (kind === 'config') {
    if (req.method !== 'GET') return text(res, 403, 'Bản web trên Vercel không cho đổi cấu hình AI. Người quản trị sửa trong Environment Variables của Vercel.');
    const { apiKey, geminiKey, headers, baseUrl, ...rest } = cfg;
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    return res.end(JSON.stringify({ isAdmin: false, source: 'env', hasApiKey: !!apiKey, hasGeminiKey: !!geminiKey, settings: rest }));
  }

  if (kind === 'openai') {
    if (!cfg.apiKey) return text(res, 503, 'Máy chủ chưa có API key (thiếu AI_CONFIG_JSON hoặc AI_API_KEY trên Vercel).');
    let target;
    try {
      target = new URL(String(cfg.baseUrl).replace(/\/+$/, '') + sub + (qs ? '?' + qs : ''));
      if (!/^https?:$/.test(target.protocol)) throw new Error('bad protocol');
    } catch {
      return text(res, 500, 'Địa chỉ API trên máy chủ không hợp lệ: ' + cfg.baseUrl);
    }
    let extra = {};
    try { extra = cfg.headers && String(cfg.headers).trim() ? JSON.parse(cfg.headers) : {}; } catch { /* bỏ qua */ }
    const headers = { ...extra, authorization: `Bearer ${cfg.apiKey}` };
    for (const k of ['content-type', 'accept']) if (typeof req.headers[k] === 'string') headers[k] = req.headers[k];
    return forward(req, res, target, headers);
  }

  if (kind === 'gemini') {
    if (!cfg.geminiKey) return text(res, 503, 'Máy chủ chưa có Gemini API key (thiếu geminiKey trong AI_CONFIG_JSON hoặc GEMINI_API_KEY trên Vercel).');
    url.searchParams.delete('key');
    const q = url.searchParams.toString();
    const target = new URL('https://generativelanguage.googleapis.com' + sub + (q ? '?' + q : ''));
    const headers = { 'x-goog-api-key': cfg.geminiKey };
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v !== 'string') continue;
      if (['content-type', 'accept'].includes(k) || (k.startsWith('x-goog-') && k !== 'x-goog-api-key')) headers[k] = v;
    }
    return forward(req, res, target, headers);
  }

  return text(res, 404, 'Not found');
}
