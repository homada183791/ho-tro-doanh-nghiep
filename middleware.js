/**
 * Mật khẩu cho bản web trên Vercel (giống passwordGate trong vite.config.ts khi chạy start-public.bat).
 * Đặt biến SITE_PASSWORD trên Vercel (Settings > Environment Variables). Không đặt = không khoá.
 * Khoá cả trang web, file JS (có thông tin người nộp mặc định) và các API AI/mẫu.
 */
export const config = { matcher: '/:path*' };

const enc = new TextEncoder();
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

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

const html = (body, status) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
const tiepTuc = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

export default async function middleware(request) {
  const password = (process.env.SITE_PASSWORD || '').trim();
  if (!password) return tiepTuc();
  const token = await sha('legalbiz:' + password);
  const url = new URL(request.url);
  const cookie = request.headers.get('cookie') || '';
  if (cookie.split(/;\s*/).includes('lb_auth=' + token)) return tiepTuc();

  if (url.pathname === '/__login' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const given = String(form?.get('password') || '');
    if ((await sha(given)) === (await sha(password))) {
      return new Response(null, {
        status: 303,
        headers: { location: '/', 'set-cookie': `lb_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure` },
      });
    }
    await new Promise((r) => setTimeout(r, 800)); // làm chậm đoán mật khẩu
    return html(loginPage('Mật khẩu không đúng.'), 401);
  }
  const laTrang = request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html');
  return laTrang ? html(loginPage(), 401) : new Response('Cần đăng nhập', { status: 401 });
}
