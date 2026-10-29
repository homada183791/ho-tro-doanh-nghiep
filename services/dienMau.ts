/**
 * Hồ sơ sau thành lập: điền các mẫu Word có trường dạng {{TEN_TRUONG}} (chuyển từ tool dien_mau.py).
 *
 * - Trường có thể bị Word tách ra nhiều đoạn chữ (run): ghép cả đoạn văn để tìm, ghi giá trị vào run chứa
 *   đầu trường nên giữ nguyên định dạng (đậm, nghiêng, cỡ chữ) của chỗ đặt trường.
 * - Trường chưa có giá trị thì giữ nguyên {{...}} trong file và báo lại.
 * - Mẫu dùng chung đặt trong thư mục "mau-sau-thanh-lap" của dự án trên máy chủ (đọc qua /__mau-stl).
 */
import * as XLSX from 'xlsx';
import { Type } from '@google/genai';
import type { GpkdInfo } from './gemini';
import { createAIClient } from './aiClient';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
const PH = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;

/* ------------------------------------------------------------------ Danh sách trường */
export type NhomTruong = 'gp' | 'bs' | 'uq' | 'kt';
/** [mã, nhãn, nhóm, nhớ giá trị cho lần sau] — giống FIELDS của dien_mau.py */
export const TRUONG: [string, string, NhomTruong, boolean][] = [
  ['TEN_CONG_TY', 'Tên công ty', 'gp', false],
  ['TEN_TIENG_ANH', 'Tên tiếng nước ngoài', 'gp', false],
  ['TEN_VIET_TAT', 'Tên viết tắt', 'gp', false],
  ['MST', 'Mã số DN / MST', 'gp', false],
  ['NGAY_DK', 'Ngày cấp GP (ngày)', 'gp', false],
  ['THANG_DK', 'Ngày cấp GP (tháng)', 'gp', false],
  ['NAM_DK', 'Ngày cấp GP (năm)', 'gp', false],
  ['LOAI_HINH', 'Loại hình', 'gp', false],
  ['DIA_CHI', 'Địa chỉ trụ sở', 'gp', false],
  ['DIEN_THOAI', 'Điện thoại', 'gp', false],
  ['EMAIL', 'Email (GP trống thì lấy email nhớ)', 'gp', true],
  ['VON_DIEU_LE', 'Vốn điều lệ', 'gp', false],
  ['VON_BANG_CHU', 'Vốn bằng chữ', 'gp', false],
  ['CHU_SO_HUU', 'Chủ sở hữu', 'gp', false],
  ['NGUOI_DAI_DIEN', 'Người đại diện PL', 'gp', false],
  ['CHUC_DANH', 'Chức danh', 'gp', false],
  ['GIOI_TINH', 'Giới tính', 'gp', false],
  ['NGAY_SINH_GD', 'Ngày sinh GĐ', 'gp', false],
  ['QUOC_TICH', 'Quốc tịch', 'gp', false],
  ['CCCD_GD', 'Số định danh GĐ', 'gp', false],
  ['DIA_CHI_LIEN_LAC', 'Địa chỉ liên lạc GĐ', 'gp', false],
  ['NGAY', 'Ngày lập văn bản (ngày)', 'bs', false],
  ['THANG', 'Ngày lập văn bản (tháng)', 'bs', false],
  ['NAM', 'Ngày lập văn bản (năm)', 'bs', false],
  // Cơ quan thuế/BHXH khác nhau theo địa chỉ từng công ty: không nhớ, dùng nút AI tra theo trụ sở
  ['CO_QUAN_THUE', 'Cơ quan thuế quản lý (Kính gửi)', 'bs', false],
  ['CO_QUAN_BHXH', 'Cơ quan BHXH (Kính gửi)', 'bs', false],
  ['NGANH_HOAT_DONG', 'Ngành hoạt động (công văn)', 'bs', false],
  ['NGANH_KINH_TE', 'Ngành kinh tế cấp 3 (BHXH)', 'bs', false],
  ['DIA_CHI_THUONG_TRU', 'Địa chỉ thường trú GĐ', 'bs', false],
  ['DAN_TOC', 'Dân tộc GĐ', 'bs', true],
  ['LOAI_GIAY_TO', 'Loại giấy tờ GĐ', 'bs', true],
  ['NGAY_CAP_GD', 'Ngày cấp CCCD GĐ', 'bs', false],
  ['NOI_CAP_GD', 'Nơi cấp CCCD GĐ', 'bs', true],
  ['NGUOI_UQ', 'Họ tên', 'uq', true],
  ['CCCD_UQ', 'Số CCCD', 'uq', true],
  ['NGAY_CAP_UQ', 'Ngày cấp', 'uq', true],
  ['NOI_CAP_UQ', 'Nơi cấp', 'uq', true],
  ['DIA_CHI_UQ', 'Địa chỉ liên hệ', 'uq', true],
  ['KE_TOAN', 'Họ tên', 'kt', true],
  ['NGAY_SINH_KT', 'Ngày sinh', 'kt', true],
  ['CCCD_KT', 'Số CCCD', 'kt', true],
  ['NGAY_CAP_KT', 'Ngày cấp', 'kt', true],
  ['NOI_CAP_KT', 'Nơi cấp', 'kt', true],
];
export const NHOM: [NhomTruong, string][] = [
  ['gp', 'Thông tin từ giấy phép (tự đọc)'], ['bs', 'Thông tin bổ sung'],
  ['uq', 'Người được ủy quyền'], ['kt', 'Người phụ trách kế toán'],
];

/* ------------------------------------------------------------------ Nhớ giá trị */
// Lưu trên máy chủ (tools/sau-thanh-lap.json, cùng dạng config.json của tool cũ) để mọi máy dùng chung;
// không gọi được máy chủ thì dùng bộ nhớ của trình duyệt.
const LS = 'legalbiz.sauThanhLap.nho';
const NHO = new Set(TRUONG.filter(([, , , nho]) => nho).map(([k]) => k));
const docLS = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } };

export const docNho = async (): Promise<Record<string, string>> => {
  try {
    const r = await fetch('/__mau-stl/config', { cache: 'no-store' });
    if (r.ok) return { ...docLS(), ...(await r.json()) };
  } catch { /* dùng bộ nhớ trình duyệt */ }
  return docLS();
};

export const ghiNho = async (v: Record<string, string>) => {
  const moi: Record<string, string> = {};
  for (const k of NHO) if ((v[k] || '').trim()) moi[k] = v[k].trim();
  try { localStorage.setItem(LS, JSON.stringify({ ...docLS(), ...moi })); } catch { /* bỏ qua */ }
  try { await fetch('/__mau-stl/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(moi) }); } catch { /* bỏ qua */ }
};

/** Giá trị ban đầu: các trường nhớ + ngày hôm nay. */
export const giaTriBanDau = (nho: Record<string, string> = {}): Record<string, string> => {
  const d = new Date();
  const v: Record<string, string> = {};
  for (const [k, , , coNho] of TRUONG) v[k] = coNho ? nho[k] || '' : '';
  v.NGAY = String(d.getDate()).padStart(2, '0');
  v.THANG = String(d.getMonth() + 1).padStart(2, '0');
  v.NAM = String(d.getFullYear());
  return v;
};

/* ------------------------------------------------------------------ AI tra cơ quan Kính gửi */
export interface CoQuanTra { ten: string; diaChi: string; lyDo: string; canKiemTra: boolean; nguon: string[] }

/**
 * Tra cơ quan thuế quản lý / cơ quan bảo hiểm xã hội của doanh nghiệp theo địa chỉ trụ sở (đơn vị hành chính sau 01/7/2025).
 * Dùng tìm kiếm Google (Gemini) hoặc web_search (ChatGPT) như phần cập nhật địa chỉ mới.
 */
export const traCoQuan = async (loai: 'thue' | 'bhxh', diaChi: string, tenCty = ''): Promise<CoQuanTra> => {
  if (!diaChi.trim()) throw new Error('Chưa có địa chỉ trụ sở để tra.');
  const ai = createAIClient();
  const viec = loai === 'thue'
    ? `CƠ QUAN THUẾ QUẢN LÝ TRỰC TIẾP doanh nghiệp. Từ 01/7/2025 ngành thuế tổ chức lại: Thuế tỉnh/thành phố và các "Thuế cơ sở" (ví dụ "Thuế cơ sở 26 Thành phố Hồ Chí Minh"), mỗi Thuế cơ sở quản lý một số phường/xã. Tìm Thuế cơ sở quản lý địa bàn phường/xã của trụ sở (doanh nghiệp mới thành lập thường do Thuế cơ sở quản lý địa bàn).`
    : `CƠ QUAN BẢO HIỂM XÃ HỘI nơi doanh nghiệp đăng ký tham gia BHXH. Từ 2025 BHXH Việt Nam tổ chức lại thành Bảo hiểm xã hội khu vực và Bảo hiểm xã hội cơ sở; tìm cơ quan BHXH cấp cơ sở phụ trách phường/xã của trụ sở (ví dụ "Bảo hiểm xã hội phường Đông Hòa", "Bảo hiểm xã hội cơ sở ...").`;
  const prompt = `Bạn là chuyên viên thủ tục doanh nghiệp tại Việt Nam.
Doanh nghiệp: ${tenCty || '(không rõ)'}
Địa chỉ trụ sở (đơn vị hành chính mới, không còn quận/huyện): "${diaChi}"

Cần xác định: ${viec}

Dùng công cụ tìm kiếm, ưu tiên nguồn chính thức (thuế, bhxh.gov.vn, cổng thông tin tỉnh/thành, quyết định phân công địa bàn).
Trả về JSON:
- "ten": tên cơ quan đúng như ghi ở dòng "Kính gửi" của văn bản (không kèm chữ "Kính gửi").
- "diaChi": địa chỉ trụ sở cơ quan nếu tìm được.
- "lyDo": căn cứ ngắn gọn (văn bản/trang đã tra, phường nào thuộc cơ quan nào).
- "canKiemTra": true nếu không tìm thấy nguồn ghi rõ phường/xã này thuộc cơ quan đó. Không bịa tên cơ quan; không chắc thì vẫn ghi tên khả năng nhất và đặt canKiemTra = true.`;
  const response: any = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: { type: Type.OBJECT, properties: { ten: { type: Type.STRING }, diaChi: { type: Type.STRING }, lyDo: { type: Type.STRING }, canKiemTra: { type: Type.BOOLEAN } } },
      tools: [{ googleSearch: {} }],
    },
  });
  if (!response.text) throw new Error('AI không trả về kết quả. Vui lòng thử lại.');
  const raw = JSON.parse(response.text);
  const chunks: any[] = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const nguon = chunks.map((c) => c?.web?.title || c?.web?.uri).filter(Boolean).slice(0, 3);
  const ten = String(raw?.ten || '').trim().replace(/^kính gửi\s*:?\s*/i, '');
  if (!ten) throw new Error('AI không tìm được cơ quan phù hợp. Hãy nhập tay.');
  return {
    ten, diaChi: String(raw?.diaChi || '').trim(), lyDo: String(raw?.lyDo || '').trim(), nguon,
    canKiemTra: !!raw?.canKiemTra || !!response.noSearch,
  };
};

/* ------------------------------------------------------------------ Từ GPKD (AI) sang trường */
const hoaDau = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');
const noi = (...xs: (string | undefined)[]) => xs.map((x) => (x || '').trim()).filter(Boolean).join(', ');

export const truongTuGpkd = (g: GpkdInfo): Record<string, string> => {
  const d: Record<string, string> = {};
  const m = (g.firstRegDate || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const toChuc = /organi|tổ chức/i.test(g.ownerType || '');
  d.TEN_CONG_TY = (g.name || '').toUpperCase();
  d.TEN_TIENG_ANH = g.nameEn || '';
  d.TEN_VIET_TAT = g.nameAbbr || '';
  d.MST = (g.enterpriseCode || '').replace(/\D/g, '');
  if (m) { d.NGAY_DK = m[1].padStart(2, '0'); d.THANG_DK = m[2].padStart(2, '0'); d.NAM_DK = m[3]; }
  d.LOAI_HINH = hoaDau(g.companyType || '');
  d.LOAI_HINH_HOA = (g.companyType || '').toUpperCase();
  d.DIA_CHI = noi(g.addressDetail, g.addressWard, g.addressCity, g.addressCountry);
  d.DIEN_THOAI = g.phone || '';
  d.EMAIL = g.email || '';
  d.VON_DIEU_LE = g.capital || '';
  d.VON_BANG_CHU = g.capitalInWords || '';
  d.NGUOI_DAI_DIEN = (g.repName || '').toUpperCase();
  d.CHU_SO_HUU = ((toChuc ? g.ownerOrgName : g.ownerName) || g.repName || '').toUpperCase();
  d.CHUC_DANH = hoaDau(g.repTitle || '');
  d.GIOI_TINH = g.repGender || '';
  d.NGAY_SINH_GD = g.repDob || '';
  d.QUOC_TICH = g.repAddressCountry || (g.repName ? 'Việt Nam' : '');
  d.CCCD_GD = (g.repIdNumber || '').replace(/\D/g, '');
  d.DIA_CHI_LIEN_LAC = noi(g.repAddressDetail, g.repAddressWard, g.repAddressCity, g.repAddressCountry);
  d.DIA_CHI_THUONG_TRU = d.DIA_CHI_LIEN_LAC;
  d.LOAI_GIAY_TO = g.repIdDocumentType || '';
  d.NGAY_CAP_GD = g.repIdDate || '';
  d.NOI_CAP_GD = g.repIdPlace || '';
  return Object.fromEntries(Object.entries(d).filter(([, v]) => (v || '').trim()));
};

/* ------------------------------------------------------------------ Điền file Word */
const dec = new TextDecoder('utf-8');
const enc = new TextEncoder();
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
type Cfb = ReturnType<typeof XLSX.CFB.read>;
const entryName = (p: string) => p.replace(/^Root Entry\//, '');

/** Các thẻ w:t thuộc trực tiếp đoạn p (không lấy chữ trong textbox lồng bên trong). */
const chuCuaDoan = (p: Element): Element[] =>
  Array.from(p.getElementsByTagNameNS(W_NS, 't')).filter((t) => {
    let a = t.parentElement;
    while (a && !(a.namespaceURI === W_NS && a.localName === 'p')) a = a.parentElement;
    return a === p;
  });

const thayTrongDoan = (p: Element, vals: Record<string, string>, thieu: Set<string>) => {
  const ts = chuCuaDoan(p);
  if (!ts.length) return;
  const full = ts.map((t) => t.textContent || '').join('');
  if (!full.includes('{{')) return;
  const viec: [number, number, string][] = [];
  for (const m of full.matchAll(PH)) {
    const k = m[1];
    const v = vals[k];
    if (v !== undefined && String(v).trim() !== '') viec.push([m.index!, m.index! + m[0].length, String(v)]);
    else thieu.add(k);
  }
  // thay từ cuối lên để vị trí phía trước không đổi
  for (const [start, end, moi] of viec.sort((a, b) => b[0] - a[0])) {
    let pos = 0, si = -1, so = 0, ei = -1, eo = 0;
    ts.forEach((t, i) => {
      const L = (t.textContent || '').length;
      if (si < 0 && start < pos + L) { si = i; so = start - pos; }
      if (ei < 0 && end <= pos + L) { ei = i; eo = end - pos; }
      pos += L;
    });
    if (si < 0 || ei < 0) continue;
    if (si === ei) {
      const s = ts[si].textContent || '';
      ts[si].textContent = s.slice(0, so) + moi + s.slice(eo);
    } else {
      ts[si].textContent = (ts[si].textContent || '').slice(0, so) + moi;
      for (let k = si + 1; k < ei; k++) ts[k].textContent = '';
      ts[ei].textContent = (ts[ei].textContent || '').slice(eo);
    }
    for (let k = si; k <= ei; k++) ts[k].setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }
};

const moFile = (bytes: ArrayBuffer | Uint8Array): Cfb => XLSX.CFB.read(new Uint8Array(bytes as ArrayBuffer), { type: 'array' });
const docXml = (b: Uint8Array) => new DOMParser().parseFromString(dec.decode(b), 'application/xml');
const doanVan = (doc: Document) => Array.from(doc.getElementsByTagNameNS(W_NS, 'p'));

/** Liệt kê các trường {{...}} có trong một mẫu. */
export const truongTrongMau = (bytes: ArrayBuffer | Uint8Array): string[] => {
  const cfb = moFile(bytes);
  const out = new Set<string>();
  cfb.FileIndex.forEach((e: any, i: number) => {
    if (!PARTS.test(entryName(cfb.FullPaths[i])) || !e.content) return;
    for (const p of doanVan(docXml(e.content as Uint8Array))) {
      const full = chuCuaDoan(p).map((t) => t.textContent || '').join('');
      for (const m of full.matchAll(PH)) out.add(m[1]);
    }
  });
  return [...out];
};

/** Điền một mẫu; trả về file đã điền và các trường còn trống. */
export const dienFile = (bytes: ArrayBuffer | Uint8Array, vals: Record<string, string>): { bytes: Uint8Array; thieu: string[] } => {
  const cfb = moFile(bytes);
  const thieu = new Set<string>();
  cfb.FileIndex.forEach((e: any, i: number) => {
    if (!PARTS.test(entryName(cfb.FullPaths[i])) || !e.content) return;
    const doc = docXml(e.content as Uint8Array);
    if (doc.getElementsByTagName('parsererror').length) throw new Error(`Không đọc được ${entryName(cfb.FullPaths[i])} trong mẫu`);
    for (const p of doanVan(doc)) thayTrongDoan(p, vals, thieu);
    e.content = enc.encode(DECL + new XMLSerializer().serializeToString(doc.documentElement)) as any;
    e.size = (e.content as Uint8Array).length;
  });
  const out = XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }) as unknown as ArrayBuffer | number[];
  return { bytes: out instanceof ArrayBuffer ? new Uint8Array(out) : new Uint8Array(out as number[]), thieu: [...thieu].sort() };
};

/* ------------------------------------------------------------------ Mẫu trên máy chủ */
export interface MauSTL { ten: string; bytes: Uint8Array; nguon: 'mayChu' | 'tam' }

/** Đọc các mẫu .docx trong thư mục mau-sau-thanh-lap của máy chủ. */
export const taiMauMayChu = async (): Promise<{ mau: MauSTL[]; thuMuc: string }> => {
  const r = await fetch('/__mau-stl', { cache: 'no-store' });
  if (!r.ok) throw new Error(`Không đọc được thư mục mẫu trên máy chủ (lỗi ${r.status}).`);
  const j = (await r.json()) as { files: string[]; dir: string };
  const mau: MauSTL[] = [];
  for (const ten of j.files) {
    const f = await fetch(`/__mau-stl?file=${encodeURIComponent(ten)}`, { cache: 'no-store' });
    if (f.ok) mau.push({ ten, bytes: new Uint8Array(await f.arrayBuffer()), nguon: 'mayChu' });
  }
  return { mau, thuMuc: j.dir };
};

export const tenThuMucKetQua = (v: Record<string, string>) =>
  `${v.MST || ''} - ${v.TEN_CONG_TY || 'HO_SO'}`.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 120);

/* ------------------------------------------------------------------ Đọc PDF giấy phép không dùng AI */
/**
 * Gửi file PDF giấy phép cho máy chủ đọc thẳng lớp chữ (scripts/doc_gp.py, cùng cách tool dien_mau.py):
 * đúng từng chữ như trên giấy, không phụ thuộc AI. Trả null kèm lý do khi không đọc được (để dùng AI).
 */
export const docGpPdf = async (pdf: Uint8Array): Promise<{ fields: Record<string, string> | null; lyDo: string }> => {
  try {
    const r = await fetch('/__doc-gp', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf as unknown as BodyInit });
    if (!r.ok) return { fields: null, lyDo: `máy chủ chưa hỗ trợ đọc PDF trực tiếp (lỗi ${r.status})` };
    const j = await r.json();
    if (!j?.ok) {
      const lyDo = j?.error === 'khong_co_python' ? 'máy chủ chưa cài Python'
        : j?.error === 'thieu_thu_vien' ? 'máy chủ chưa cài thư viện pdfminer.six/fonttools (chạy lại start-public.bat)'
        : j?.error === 'khong_phai_pdf' ? 'file không phải PDF' : `không đọc được PDF (${j?.error || 'lỗi'})`;
      return { fields: null, lyDo };
    }
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(j.fields || {})) if (typeof v === 'string' && v.trim()) f[k] = v.trim();
    if (!f.TEN_CONG_TY || !f.MST) return { fields: null, lyDo: 'PDF không có lớp chữ đọc được (có thể là bản scan)' };
    return { fields: f, lyDo: '' };
  } catch (e) {
    return { fields: null, lyDo: 'không kết nối được máy chủ' };
  }
};
