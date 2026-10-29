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

/**
 * Word -> PDF ngay trên trình duyệt (dùng khi máy chủ không đổi được, ví dụ bản trên Vercel).
 * Vẽ file Word bằng docx-preview trong khung ẩn, chụp từng trang thành ảnh rồi ghép thành PDF khổ A4.
 * Bố cục gần giống Word nhưng không tuyệt đối; muốn chuẩn như Word thì mở web trên máy chủ (localhost).
 */
export const docxSangPdfTrinhDuyet = async (f: File): Promise<Uint8Array> => {
  const [{ renderAsync }, { default: html2canvas }] = await Promise.all([import('docx-preview'), import('html2canvas')]);
  const khung = document.createElement('iframe');
  khung.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;visibility:hidden';
  document.body.appendChild(khung);
  try {
    const doc = khung.contentDocument!;
    doc.open(); doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"></body></html>'); doc.close();
    const noiDung = doc.createElement('div');
    const kieu = doc.createElement('div');
    doc.body.append(kieu, noiDung);
    await renderAsync(await f.arrayBuffer(), noiDung, kieu, {
      inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false, ignoreWidth: false, ignoreHeight: false,
      experimental: true, renderHeaders: true, renderFooters: true, useBase64URL: true,
    });
    await (doc as any).fonts?.ready;
    await new Promise((r) => setTimeout(r, 150));
    const trang = [...noiDung.querySelectorAll<HTMLElement>('section.docx')];
    if (!trang.length) throw new Error('Không đọc được nội dung file Word');
    const out = await PDFDocument.create();
    const A4 = [595.28, 841.89] as const;
    for (const s of trang) {
      s.style.margin = '0'; s.style.boxShadow = 'none';
      const c = await html2canvas(s, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, windowWidth: 900 });
      // Trang dài hơn khổ A4 (nội dung tự tràn): cắt thành nhiều trang A4
      const caoTrang = Math.round(c.width * (A4[1] / A4[0]));
      for (let y = 0; y < c.height; y += caoTrang) {
        const h = Math.min(caoTrang, c.height - y);
        if (y > 0 && h < caoTrang * 0.04) break; // bỏ mẩu thừa quá nhỏ
        const p = document.createElement('canvas');
        p.width = c.width; p.height = caoTrang;
        const ctx = p.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, p.width, p.height);
        ctx.drawImage(c, 0, y, c.width, h, 0, 0, c.width, h);
        const jpg = await out.embedJpg(await (await fetch(p.toDataURL('image/jpeg', 0.9))).arrayBuffer());
        out.addPage([...A4]).drawImage(jpg, { x: 0, y: 0, width: A4[0], height: A4[1] });
      }
    }
    return out.save();
  } finally {
    khung.remove();
  }
};

/** Word -> PDF: ưu tiên máy chủ (LibreOffice/Word, chuẩn nhất); máy chủ không có thì đổi trên trình duyệt. */
export const docxSangPdf = async (f: File): Promise<Uint8Array> => {
  let r: Response | null = null;
  try {
    r = await fetch('/__docx-pdf', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name) }, body: f });
  } catch { /* mất mạng tới máy chủ: đổi trên trình duyệt */ }
  if (r) {
    const type = r.headers.get('content-type') || '';
    if (r.ok && type.includes('application/pdf')) return new Uint8Array(await r.arrayBuffer());
    // 404/405: máy chủ không có chức năng này (bản Vercel). Lỗi khác: máy chủ có nhưng đổi hỏng -> báo lỗi rõ.
    if (![404, 405].includes(r.status)) {
      let lyDo = `lỗi ${r.status}`;
      try { const j = await r.json(); lyDo = j.error || lyDo; } catch { /* bỏ qua */ }
      try { return await docxSangPdfTrinhDuyet(f); } catch { throw new Error(lyDo); }
    }
  }
  return docxSangPdfTrinhDuyet(f);
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

/* ------------------------------------------------------------------ Cắt PDF */
/** Đọc "1-3, 5, 7-9" thành các nhóm trang (đánh số từ 1). Báo lỗi rõ nếu sai. */
export const docKhoangTrang = (chuoi: string, tong: number): number[][] => {
  const nhom: number[][] = [];
  for (const phan of chuoi.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = phan.match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
    if (!m) throw new Error(`"${phan}" không đúng dạng (ví dụ: 1-3, 5, 7-9)`);
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < 1 || a > tong || b > tong) throw new Error(`"${phan}": file chỉ có ${tong} trang`);
    const ds: number[] = [];
    for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) ds.push(i);
    nhom.push(ds);
  }
  if (!nhom.length) throw new Error('Chưa nhập khoảng trang');
  return nhom;
};

/** Nhóm trang từ các vết cắt: cat chứa số trang mà SAU nó có vết cắt. */
export const nhomTuVetCat = (tong: number, cat: Set<number>): number[][] => {
  const nhom: number[][] = [];
  let hien: number[] = [];
  for (let i = 1; i <= tong; i++) {
    hien.push(i);
    if (cat.has(i) || i === tong) { nhom.push(hien); hien = []; }
  }
  return nhom;
};

/** Ghi tắt nhóm trang: [1,2,3] -> "1-3", [5] -> "5", [1,3] -> "1_3". */
export const tenNhom = (ds: number[]) => {
  const lienTuc = ds.every((x, i) => i === 0 || x === ds[i - 1] + 1);
  return ds.length === 1 ? String(ds[0]) : lienTuc ? `${ds[0]}-${ds[ds.length - 1]}` : ds.join('_');
};

/** Cắt 1 file PDF thành nhiều file theo nhóm trang (giữ nguyên chất lượng trang gốc). */
export const catPdf = async (bytes: Uint8Array, nhom: number[][]): Promise<Uint8Array[]> => {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out: Uint8Array[] = [];
  for (const ds of nhom) {
    const d = await PDFDocument.create();
    const pages = await d.copyPages(src, ds.map((x) => x - 1));
    pages.forEach((p) => d.addPage(p));
    out.push(await d.save());
  }
  return out;
};

/** Bỏ ký tự không dùng được trong tên file Windows. */
export const tenFileSach = (s: string, macDinh: string) => (s.trim().replace(/\.(pdf|zip)$/i, '').replace(/[\\/:*?"<>|]+/g, '').trim() || macDinh);
