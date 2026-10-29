/**
 * Gộp file Word/PDF theo TỪNG TRANG (chuyển từ tool merge_word_gui.py).
 * - PDF: tách trang và làm ảnh xem trước ngay trên trình duyệt (pdf.js).
 * - Word (.docx): máy chủ đổi sang PDF (LibreOffice, dự phòng Microsoft Word) qua /__docx-pdf.
 * - Gộp: chép đúng các trang theo thứ tự đã sắp vào 1 file PDF (pdf-lib), giữ nguyên chất lượng trang gốc.
 */
import { PDFDocument } from 'pdf-lib';

export interface NguonPdf { id: string; ten: string; bytes: Uint8Array; soTrang: number }
export interface TrangGop { key: string; nguonId: string; ten: string; trang: number; tong: number; anh: string }

let pdfjsP: Promise<any> | null = null;
const pdfjs = () => (pdfjsP ??= (async () => {
  const lib = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
})());

const laPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const laDocx = (f: File) => /\.docx$/i.test(f.name);
export const fileHopLe = (f: File) => (laPdf(f) || laDocx(f)) && !f.name.startsWith('~$');

/** Word -> PDF trên máy chủ. */
export const docxSangPdf = async (f: File): Promise<Uint8Array> => {
  const r = await fetch('/__docx-pdf', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name) }, body: f });
  const type = r.headers.get('content-type') || '';
  if (r.ok && type.includes('application/pdf')) return new Uint8Array(await r.arrayBuffer());
  let lyDo = `lỗi ${r.status}`;
  try { const j = await r.json(); lyDo = j.error || lyDo; } catch { /* bỏ qua */ }
  throw new Error(lyDo);
};

/** Đọc 1 file (PDF hoặc Word) thành nguồn PDF. */
export const docNguon = async (f: File): Promise<NguonPdf> => {
  const bytes = laPdf(f) ? new Uint8Array(await f.arrayBuffer()) : await docxSangPdf(f);
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: bytes.slice() }).promise;
  const soTrang = doc.numPages;
  await doc.destroy();
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ten: f.name, bytes, soTrang };
};

/** Vẽ ảnh 1 trang (cạnh dài tối đa `max` px), trả data URL JPEG. */
const veTrang = async (doc: any, so: number, max: number) => {
  const page = await doc.getPage(so);
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(4, max / Math.max(v1.width, v1.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return c.toDataURL('image/jpeg', 0.82);
};

/** Tách nguồn thành từng trang có ảnh xem trước. */
export const tachTrang = async (n: NguonPdf, max = 260): Promise<TrangGop[]> => {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: n.bytes.slice() }).promise;
  const out: TrangGop[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    out.push({ key: `${n.id}-${i}`, nguonId: n.id, ten: n.ten, trang: i, tong: doc.numPages, anh: await veTrang(doc, i, max) });
  }
  await doc.destroy();
  return out;
};

/** Ảnh nét để xem phóng to 1 trang. */
export const anhLon = async (n: NguonPdf, trang: number, max = 1600) => {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: n.bytes.slice() }).promise;
  try { return await veTrang(doc, trang, max); } finally { await doc.destroy(); }
};

/** Gộp các trang theo đúng thứ tự thành 1 file PDF. */
export const gopTrang = async (trang: TrangGop[], nguon: Map<string, NguonPdf>): Promise<Uint8Array> => {
  const out = await PDFDocument.create();
  const cache = new Map<string, PDFDocument>();
  for (const t of trang) {
    const n = nguon.get(t.nguonId);
    if (!n) continue;
    let src = cache.get(n.id);
    if (!src) { src = await PDFDocument.load(n.bytes, { ignoreEncryption: true }); cache.set(n.id, src); }
    const [p] = await out.copyPages(src, [t.trang - 1]);
    out.addPage(p);
  }
  if (!out.getPageCount()) throw new Error('Không có trang nào để gộp.');
  return out.save();
};
