/**
 * Khoá web trên Vercel: MỖI MÁY 1 MẬT KHẨU, mật khẩu khoá vào máy đăng nhập đầu tiên.
 *
 * Cần (Vercel > Settings > Environment Variables):
 *   ADMIN_PASSWORD  : mật khẩu trang quản lý /__quan-tri (thêm/xoá mật khẩu, gỡ máy)
 *   SESSION_SECRET  : chuỗi bí mật ngẫu nhiên để ký cookie (không có thì dùng ADMIN_PASSWORD)
 *   KV_REST_API_URL + KV_REST_API_TOKEN (hoặc UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN):
 *                     kho Upstash Redis (Vercel > Storage), Vercel tự thêm khi nối kho vào project.
 * Chưa có kho Redis thì dùng chế độ cũ: 1 mật khẩu chung SITE_PASSWORD (không đặt = không khoá).
 *
 * "Máy" = trình duyệt trên máy đó (nhận ra bằng cookie riêng lâu dài). Xoá dữ liệu duyệt web,
 * đổi trình duyệt hoặc mở ẩn danh sẽ bị coi là máy mới -> quản trị bấm "Gỡ máy" để đăng nhập lại.
 */
export const config = { matcher: '/:path*' };

const env = (k) => (process.env[k] || '').trim();
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const hmac = async (key, s) => {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(s))).slice(0, 40);
};
const ngauNhien = (n = 16) => hex(crypto.getRandomValues(new Uint8Array(n)));
const tiepTuc = () => new Response(null, { headers: { 'x-middleware-next': '1' } });
const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const docCookie = (req, ten) => {
  for (const p of (req.headers.get('cookie') || '').split(/;\s*/)) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i) === ten) return decodeURIComponent(p.slice(i + 1)); }
  return '';
};
const cookie = (ten, val, maxAge) => `${ten}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
const cho = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Upstash Redis (REST) ---------------- */
const REDIS_URL = () => env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL');
const REDIS_TOKEN = () => env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN');
const coKho = () => !!(REDIS_URL() && REDIS_TOKEN());
const redis = async (...lenh) => {
  const r = await fetch(REDIS_URL(), { method: 'POST', headers: { authorization: `Bearer ${REDIS_TOKEN()}` }, body: JSON.stringify(lenh) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
};
const docUser = async (id) => { const s = id && (await redis('GET', `lb:u:${id}`)); return s ? JSON.parse(s) : null; };
const ghiUser = (u) => redis('SET', `lb:u:${u.id}`, JSON.stringify(u));
const secret = () => env('SESSION_SECRET') || env('ADMIN_PASSWORD') || 'legalbiz';
const bamMk = (mk) => sha(`${secret()}|mk|${mk.trim()}`);

/** Mô tả ngắn máy/trình duyệt từ User-Agent + nơi truy cập (Vercel gửi kèm). */
const moTaMay = (req) => {
  const ua = req.headers.get('user-agent') || '';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Không rõ';
  const tr = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /CocCoc/.test(ua) ? 'Cốc Cốc' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt khác';
  const noi = decodeURIComponent(req.headers.get('x-vercel-ip-city') || '');
  return `${tr} trên ${os}${noi ? ` · ${noi}` : ''}`;
};

/* ---------------- Trang đăng nhập ---------------- */
const KIEU = `body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;padding:16px;box-sizing:border-box}
form,.hop{background:#fff;border-radius:16px;padding:28px;width:100%;max-width:360px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
h1{font-size:20px;margin:0 0 4px} p{margin:0 0 18px;color:#64748b;font-size:14px}
input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px}
input:focus{outline:2px solid #2563eb;border-color:#2563eb}
button{margin-top:12px;width:100%;padding:11px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.err{color:#b91c1c;font-size:13px;margin-top:10px;line-height:1.4}`;
const trangDangNhap = (loi = '', action = '/__login', tieuDe = 'Nhập mật khẩu của máy này để sử dụng') => `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Đăng nhập · LegalBiz AI</title><style>${KIEU}</style></head><body>
<form method="post" action="${action}">
  <h1>LegalBiz AI</h1><p>${tieuDe}</p>
  <input type="password" name="password" placeholder="Mật khẩu" autofocus required autocomplete="current-password">
  <button type="submit">Đăng nhập</button>
  ${loi ? `<div class="err">${loi}</div>` : ''}
</form></body></html>`;

/* ---------------- Phiên đăng nhập của máy ---------------- */
// Cookie lb_dev: mã máy (ngẫu nhiên, 10 năm). Cookie lb_s: "id.maMay.phienBan.chuKy" (30 ngày).
const NAM10 = 315360000, NGAY30 = 2592000;
const kyPhien = async (u, dev) => `${u.id}.${dev}.${u.ver}.${await hmac(secret(), `s|${u.id}|${dev}|${u.ver}`)}`;
const kiemPhien = async (req, canDocKho) => {
  const [id, dev, ver, ky] = docCookie(req, 'lb_s').split('.');
  if (!id || !dev || !ky || dev !== docCookie(req, 'lb_dev')) return null;
  if (ky !== (await hmac(secret(), `s|${id}|${dev}|${ver}`))) return null;
  if (!canDocKho) return { id };
  const u = await docUser(id);
  if (!u || u.khoa || u.maMay !== dev || String(u.ver) !== ver) return null;
  return u;
};
const laFileTinh = (p) => /^\/assets\/|\.(js|css|png|jpe?g|svg|ico|webp|woff2?|ttf|map)$/i.test(p);

/* ---------------- Trang quản trị ---------------- */
const kyAdmin = async (het) => `${het}.${await hmac(secret(), `admin|${het}|${await sha(env('ADMIN_PASSWORD'))}`)}`;
const laAdmin = async (req) => {
  const [het, ky] = docCookie(req, 'lb_ad').split('.');
  return !!(het && ky && Number(het) > Date.now() && ky === (await kyAdmin(het)).split('.')[1]);
};
const moiMk = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => a[b % a.length]).join(''); };

const trangQuanTri = () => `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Quản lý mật khẩu · LegalBiz AI</title>
<style>
:root{--bg:#f1f5f9;--card:#fff;--line:#e2e8f0;--text:#0f172a;--muted:#64748b;--blue:#2563eb;--red:#dc2626;--green:#16a34a;--amber:#b45309}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 60px} h1{font-size:24px;margin:0} .sub{color:var(--muted);font-size:14px;margin:6px 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:16px}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:end} label{font-size:12px;color:var(--muted);display:block;margin-bottom:4px}
input{padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;width:100%}
button{padding:9px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-size:13px;cursor:pointer;white-space:nowrap}
button.chinh{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:600} button.do{color:var(--red);border-color:#fecaca}
table{width:100%;border-collapse:collapse;font-size:14px} th{text-align:left;color:var(--muted);font-weight:500;font-size:12px;padding:8px;border-bottom:1px solid var(--line)}
td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top} .nho{font-size:12px;color:var(--muted)}
.tt{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600}
.tt.cho{background:#fef3c7;color:var(--amber)} .tt.gan{background:#dcfce7;color:var(--green)} .tt.khoa{background:#fee2e2;color:var(--red)}
.mk{font-family:ui-monospace,Consolas,monospace;font-size:18px;background:#eff6ff;border:1px dashed var(--blue);padding:10px 12px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.nut{display:flex;flex-wrap:wrap;gap:6px} .an{display:none} @media(max-width:700px){.anDt{display:none}}
</style></head><body><main>
<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h1>Quản lý mật khẩu từng máy</h1>
<div class="nut"><a href="/"><button>Mở web LegalBiz</button></a><form method="post" action="/__quan-tri/logout" style="margin:0"><button>Đăng xuất quản trị</button></form></div></div>
<p class="sub">Mỗi máy 1 mật khẩu. Mật khẩu tự gắn vào máy đăng nhập đầu tiên; máy khác nhập đúng mật khẩu cũng không vào được. Máy bị xoá dữ liệu trình duyệt, đổi trình duyệt hoặc máy mới: bấm <b>Gỡ máy</b> rồi đăng nhập lại trên máy đó.</p>
<div class="card"><div class="row">
  <div style="flex:2;min-width:180px"><label for="ten">Tên máy / người dùng</label><input id="ten" placeholder="VD: Máy chị Lan - kế toán"></div>
  <div style="flex:1;min-width:150px"><label for="mk">Mật khẩu (để trống = tự tạo)</label><input id="mk" placeholder="tự tạo"></div>
  <button class="chinh" id="them">Thêm mật khẩu</button></div>
  <div id="moi" class="an" style="margin-top:12px"><p class="nho" style="margin:0 0 6px">Mật khẩu của <b id="moiTen"></b> (chỉ hiện 1 lần, hãy gửi cho người dùng ngay):</p>
  <div class="mk"><span id="moiMk"></span><button id="chep">Chép</button></div></div>
  <p id="loi" class="nho" style="color:var(--red)"></p></div>
<div class="card" style="padding:0;overflow-x:auto"><table><thead><tr><th>Tên</th><th>Trạng thái</th><th class="anDt">Dùng lần cuối</th><th></th></tr></thead><tbody id="ds"><tr><td colspan="4" class="nho">Đang tải...</td></tr></tbody></table></div>
</main><script>
const $=(i)=>document.getElementById(i);
const tg=(t)=>t?new Date(t).toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'}):'—';
const e=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(p,b){const r=await fetch('/__quan-tri/api/'+p,{method:b?'POST':'GET',headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Lỗi '+r.status));return j;}
function hienMk(ten,mk){$('moiTen').textContent=ten;$('moiMk').textContent=mk;$('moi').classList.remove('an');}
async function tai(){try{const {ds}=await api('ds');$('ds').innerHTML=ds.length?ds.map(u=>{
 const tt=u.khoa?'<span class="tt khoa">Đã chặn</span>':u.maMay?'<span class="tt gan">Đã gắn máy</span>':'<span class="tt cho">Chưa dùng</span>';
 const may=u.maMay?'<div class="nho">'+e(u.moTaMay)+' · gắn lúc '+tg(u.ganLuc)+'</div>':'<div class="nho">Gắn vào máy đăng nhập đầu tiên</div>';
 return '<tr><td><b>'+e(u.ten)+'</b><div class="nho">Tạo '+tg(u.taoLuc)+'</div></td><td>'+tt+may+'</td><td class="anDt nho">'+tg(u.dungLuc)+'</td><td><div class="nut">'+
 (u.maMay?'<button data-a="go-may" data-id="'+u.id+'">Gỡ máy</button>':'')+
 '<button data-a="doi-mk" data-id="'+u.id+'">Đổi mật khẩu</button>'+
 '<button data-a="'+(u.khoa?'mo':'khoa')+'" data-id="'+u.id+'">'+(u.khoa?'Bỏ chặn':'Chặn')+'</button>'+
 '<button class="do" data-a="xoa" data-id="'+u.id+'" data-ten="'+e(u.ten)+'">Xoá</button></div></td></tr>';}).join(''):'<tr><td colspan="4" class="nho">Chưa có mật khẩu nào. Thêm mật khẩu cho từng máy ở trên.</td></tr>';
}catch(x){$('ds').innerHTML='<tr><td colspan="4" style="color:var(--red)">'+e(x.message)+'</td></tr>';}}
$('them').onclick=async()=>{$('loi').textContent='';const ten=$('ten').value.trim();if(!ten){$('loi').textContent='Nhập tên máy / người dùng.';return;}
 try{const r=await api('them',{ten,matKhau:$('mk').value});hienMk(ten,r.matKhau);$('ten').value='';$('mk').value='';tai();}catch(x){$('loi').textContent=x.message;}};
$('chep').onclick=()=>{navigator.clipboard.writeText($('moiMk').textContent);$('chep').textContent='Đã chép';setTimeout(()=>$('chep').textContent='Chép',1500);};
$('ds').onclick=async(ev)=>{const b=ev.target.closest('button[data-a]');if(!b)return;const a=b.dataset.a;
 if(a==='xoa'&&!confirm('Xoá mật khẩu "'+b.dataset.ten+'"? Máy đó sẽ bị đăng xuất ngay.'))return;
 if(a==='go-may'&&!confirm('Gỡ máy đang gắn? Lần đăng nhập tiếp theo (ở bất kỳ máy nào) sẽ gắn vào máy đó.'))return;
 try{const r=await api('sua',{id:b.dataset.id,hanhDong:a});if(r.matKhau)hienMk(r.ten,r.matKhau);tai();}catch(x){alert(x.message);}};
tai();
</script></body></html>`;

const xuLyQuanTri = async (req, url) => {
  const p = url.pathname;
  if (!env('ADMIN_PASSWORD')) return html(`<p style="font-family:sans-serif;padding:24px">Chưa đặt biến ADMIN_PASSWORD trên Vercel.</p>`, 503);
  if (!coKho()) return html(`<p style="font-family:sans-serif;padding:24px">Chưa nối kho Upstash Redis (Vercel &gt; Storage) vào project.</p>`, 503);

  if (p === '/__quan-tri/login' && req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    const mk = String(form?.get('password') || '');
    if ((await sha(mk)) !== (await sha(env('ADMIN_PASSWORD')))) { await cho(1000); return html(trangDangNhap('Mật khẩu quản trị không đúng.', '/__quan-tri/login', 'Trang quản lý mật khẩu'), 401); }
    const het = Date.now() + 12 * 3600_000;
    return new Response(null, { status: 303, headers: { location: '/__quan-tri', 'set-cookie': cookie('lb_ad', await kyAdmin(het), 12 * 3600) } });
  }
  if (p === '/__quan-tri/logout') return new Response(null, { status: 303, headers: { location: '/__quan-tri', 'set-cookie': cookie('lb_ad', '', 0) } });
  if (!(await laAdmin(req))) {
    return p.startsWith('/__quan-tri/api/') ? json({ error: 'Phiên quản trị đã hết, tải lại trang để đăng nhập.' }, 401)
      : html(trangDangNhap('', '/__quan-tri/login', 'Trang quản lý mật khẩu'), 401);
  }
  if (p === '/__quan-tri' || p === '/__quan-tri/') return html(trangQuanTri());

  try {
    if (p === '/__quan-tri/api/ds') {
      const ids = (await redis('SMEMBERS', 'lb:ds')) || [];
      const ds = (await Promise.all(ids.map(docUser))).filter(Boolean)
        .map(({ mkHash, ...u }) => u).sort((a, b) => (a.taoLuc || 0) - (b.taoLuc || 0));
      return json({ ds });
    }
    const body = await req.json().catch(() => ({}));
    if (p === '/__quan-tri/api/them' && req.method === 'POST') {
      const ten = String(body.ten || '').trim().slice(0, 80);
      if (!ten) return json({ error: 'Thiếu tên' }, 400);
      const mk = String(body.matKhau || '').trim() || moiMk();
      if (mk.length < 6) return json({ error: 'Mật khẩu cần ít nhất 6 ký tự' }, 400);
      const h = await bamMk(mk);
      if (await redis('EXISTS', `lb:pw:${h}`)) return json({ error: 'Mật khẩu này đã có người dùng, chọn mật khẩu khác' }, 400);
      const u = { id: ngauNhien(6), ten, mkHash: h, maMay: null, moTaMay: '', ganLuc: 0, dungLuc: 0, taoLuc: Date.now(), khoa: false, ver: 1 };
      await ghiUser(u); await redis('SET', `lb:pw:${h}`, u.id); await redis('SADD', 'lb:ds', u.id);
      return json({ ok: true, matKhau: mk });
    }
    if (p === '/__quan-tri/api/sua' && req.method === 'POST') {
      const u = await docUser(String(body.id || ''));
      if (!u) return json({ error: 'Không tìm thấy' }, 404);
      const a = body.hanhDong;
      if (a === 'xoa') {
        await redis('DEL', `lb:u:${u.id}`); await redis('DEL', `lb:pw:${u.mkHash}`); await redis('SREM', 'lb:ds', u.id);
        return json({ ok: true });
      }
      if (a === 'go-may') Object.assign(u, { maMay: null, moTaMay: '', ganLuc: 0, ver: u.ver + 1 });
      else if (a === 'khoa') Object.assign(u, { khoa: true, ver: u.ver + 1 });
      else if (a === 'mo') u.khoa = false;
      else if (a === 'doi-mk') {
        const mk = moiMk(), h = await bamMk(mk);
        await redis('DEL', `lb:pw:${u.mkHash}`); await redis('SET', `lb:pw:${h}`, u.id);
        Object.assign(u, { mkHash: h, ver: u.ver + 1 });
        await ghiUser(u);
        return json({ ok: true, matKhau: mk, ten: u.ten });
      } else return json({ error: 'Không rõ thao tác' }, 400);
      await ghiUser(u);
      return json({ ok: true });
    }
  } catch (e) {
    return json({ error: 'Lỗi kho dữ liệu: ' + (e?.message || e) }, 500);
  }
  return json({ error: 'Not found' }, 404);
};

/* ---------------- Chế độ cũ: 1 mật khẩu chung ---------------- */
const motMatKhau = async (req, url, password) => {
  const token = await sha('legalbiz:' + password);
  if (docCookie(req, 'lb_auth') === token) return tiepTuc();
  if (url.pathname === '/__login' && req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    if ((await sha(String(form?.get('password') || ''))) === (await sha(password))) {
      return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': cookie('lb_auth', token, NGAY30) } });
    }
    await cho(800);
    return html(trangDangNhap('Mật khẩu không đúng.', '/__login', 'Nhập mật khẩu để sử dụng'), 401);
  }
  const laTrang = req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html');
  return laTrang ? html(trangDangNhap('', '/__login', 'Nhập mật khẩu để sử dụng'), 401) : new Response('Cần đăng nhập', { status: 401 });
};

export default async function middleware(req) {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/__quan-tri')) return xuLyQuanTri(req, url);
  if (!coKho()) {
    const pw = env('SITE_PASSWORD');
    return pw ? motMatKhau(req, url, pw) : tiepTuc();
  }

  // Đăng nhập bằng mật khẩu của máy
  if (url.pathname === '/__login' && req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    const mk = String(form?.get('password') || '').trim();
    try {
      const id = mk && (await redis('GET', `lb:pw:${await bamMk(mk)}`));
      const u = await docUser(id);
      if (!u) { await cho(1000); return html(trangDangNhap('Mật khẩu không đúng.'), 401); }
      if (u.khoa) return html(trangDangNhap('Mật khẩu này đang bị chặn. Liên hệ người quản lý.'), 403);
      let dev = docCookie(req, 'lb_dev');
      if (!/^[0-9a-f]{32}$/.test(dev)) dev = ngauNhien(16);
      if (u.maMay && u.maMay !== dev) {
        return html(trangDangNhap(`Mật khẩu này đã được dùng trên máy khác (${esc(u.moTaMay)}).<br>Mỗi mật khẩu chỉ dùng được trên 1 máy. Liên hệ người quản lý để được gỡ máy cũ hoặc cấp mật khẩu riêng.`), 403);
      }
      if (!u.maMay) Object.assign(u, { maMay: dev, moTaMay: moTaMay(req), ganLuc: Date.now() });
      u.dungLuc = Date.now();
      await ghiUser(u);
      const h = new Headers({ location: '/', 'cache-control': 'no-store' });
      h.append('set-cookie', cookie('lb_dev', dev, NAM10));
      h.append('set-cookie', cookie('lb_s', await kyPhien(u, dev), NGAY30));
      return new Response(null, { status: 303, headers: h });
    } catch (e) {
      return html(trangDangNhap('Lỗi kho dữ liệu, thử lại sau: ' + esc(e?.message || e)), 500);
    }
  }
  if (url.pathname === '/__logout') {
    return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': cookie('lb_s', '', 0) } });
  }

  // File tĩnh (JS/CSS/ảnh): chỉ kiểm chữ ký cookie cho nhanh; trang và API: kiểm thêm trong kho (bị chặn/gỡ máy là mất quyền ngay)
  const tinh = req.method === 'GET' && laFileTinh(url.pathname);
  let u = null;
  try { u = await kiemPhien(req, !tinh); } catch { return new Response('Lỗi kho dữ liệu, thử lại sau', { status: 503 }); }
  if (u) {
    const laTrang = req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html');
    if (laTrang && u.dungLuc !== undefined && Date.now() - (u.dungLuc || 0) > 10 * 60_000) {
      u.dungLuc = Date.now();
      try { await ghiUser(u); } catch { /* bỏ qua */ }
    }
    return tiepTuc();
  }
  const laTrang = req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html');
  return laTrang ? html(trangDangNhap(), 401) : new Response('Cần đăng nhập', { status: 401 });
}
