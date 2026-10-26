/**
 * Đổi file PDF thành ảnh từng trang ngay trên trình duyệt trước khi gửi cho AI.
 *
 * Vì sao: nhiều PDF xuất từ Cổng thông tin đăng ký doanh nghiệp (Microsoft Reporting Services) có lớp chữ
 * bị lỗi mã phông (chép ra thành ký tự lạ). Gửi nguyên PDF thì AI đọc lẫn lớp chữ hỏng này và "đoán" tên,
 * ví dụ "DƯ HUỆ QUÂN" thành "ĐỖ HỮU QUÂN". Gửi ảnh thì AI chỉ đọc đúng những gì nhìn thấy.
 */
export type AnhTrang = { base64: string; mimeType: string; name: string; preview?: string };

const MAX_TRANG = 8;          // tối đa số trang lấy từ một file PDF
const RONG_PX = 2000;         // độ rộng ảnh mỗi trang (đủ nét cho chữ nhỏ)

const docDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

const laPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** Đọc một file: ảnh giữ nguyên; PDF đổi thành ảnh JPEG từng trang. */
export const fileThanhAnh = async (file: File): Promise<AnhTrang[]> => {
  if (!laPdf(file)) {
    const url = await docDataUrl(file);
    return [{ base64: url.split(',')[1] || '', mimeType: file.type || 'image/jpeg', name: file.name, preview: url }];
  }
  try {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const out: AnhTrang[] = [];
    const n = Math.min(pdf.numPages, MAX_TRANG);
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, RONG_PX / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const url = canvas.toDataURL('image/jpeg', 0.9);
      out.push({ base64: url.split(',')[1], mimeType: 'image/jpeg', name: `${file.name} - trang ${i}`, preview: url });
      page.cleanup();
    }
    await pdf.destroy();
    if (!out.length) throw new Error('PDF không có trang nào');
    return out;
  } catch (e) {
    console.warn('[pdf] Không đổi được PDF thành ảnh, gửi nguyên file PDF', e);
    const url = await docDataUrl(file);
    return [{ base64: url.split(',')[1] || '', mimeType: 'application/pdf', name: file.name }];
  }
};

/** Đọc nhiều file, trả về danh sách ảnh theo đúng thứ tự (PDF nhiều trang thành nhiều ảnh). */
export const filesThanhAnh = async (files: File[]): Promise<AnhTrang[]> =>
  (await Promise.all(files.map(fileThanhAnh))).flat();
