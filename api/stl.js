/**
 * "Hồ sơ sau thành lập" khi chạy trên Vercel (thay cho /__mau-stl của vite.config.ts).
 *  GET /__mau-stl              -> { dir, files }  (các file .docx trong thư mục mau-sau-thanh-lap đã đưa lên GitHub)
 *  GET /__mau-stl?file=X.docx  -> nội dung file
 *  GET /__mau-stl/config       -> thông tin dùng chung, lấy từ biến STL_CONFIG_JSON trên Vercel
 *                                 (dán nguyên nội dung tools/sau-thanh-lap.json trên máy chủ)
 *  POST /__mau-stl/config      -> không lưu được trên Vercel (chỉ nhớ trên trình duyệt), trả lại cấu hình hiện có
 */
import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'mau-sau-thanh-lap');

const json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
};

const docConfig = () => {
  try { return JSON.parse(process.env.STL_CONFIG_JSON || '{}') || {}; } catch { return {}; }
};

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://x');
  if (url.searchParams.get('kind') === 'config') {
    if (req.method === 'GET' || req.method === 'POST') return json(res, 200, docConfig());
    return json(res, 405, { error: 'Chỉ hỗ trợ GET, POST' });
  }
  if (req.method !== 'GET') return json(res, 405, { error: 'Chỉ hỗ trợ GET' });
  try {
    const files = fs.existsSync(DIR)
      ? fs.readdirSync(DIR).filter((f) => /\.docx$/i.test(f) && !f.startsWith('~$')).sort((a, b) => a.localeCompare(b, 'vi'))
      : [];
    const file = url.searchParams.get('file');
    if (!file) return json(res, 200, { dir: 'mau-sau-thanh-lap (trên GitHub)', files });
    const ten = path.basename(file);
    if (ten !== file || !files.includes(ten)) return json(res, 404, { error: 'Không có mẫu này' });
    res.statusCode = 200;
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('cache-control', 'no-store');
    res.end(fs.readFileSync(path.join(DIR, ten)));
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) });
  }
}
