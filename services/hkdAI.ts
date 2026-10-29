/**
 * AI cho trang Hộ kinh doanh: đọc một đoạn thông tin thô (tin nhắn, ghi chú...) thành các trường của form.
 */
import { Type, ThinkingLevel } from '@google/genai';
import { createAIClient } from './aiClient';

export interface HkdTrichXuat {
  tenHkd: string;
  truSoDetail: string; truSoWard: string; truSoCity: string;
  von: string;
  phone: string; email: string; website: string;
  nganhMoTa: string;
  soLaoDong: string;
  phuongPhapThue: string;
  chuTen: string; chuGioiTinh: string; chuNgaySinh: string; chuSoDinhDanh: string; chuPhone: string; chuEmail: string;
  chuDiaChiDetail: string; chuDiaChiWard: string; chuDiaChiCity: string;
}

const clean = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const t = String(v).trim();
  return /^(null|undefined|n\/?a|none|-+|không có|không rõ|không xác định|chưa rõ|trống)$/i.test(t) ? '' : t;
};

/** Gọi AI với suy nghĩ mức thấp (Gemini 3) cho nhanh; model không nhận tham số này thì gọi lại không kèm. */
const goiNhanh = async (ai: ReturnType<typeof createAIClient>, contents: any, config: any) => {
  const goi = (cfg: any) => ai.models.generateContent({ model: 'gemini-3-flash-preview', contents, config: cfg });
  try {
    return await goi({ ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } });
  } catch (e: any) {
    if (!/thinking/i.test(String(e?.message || e))) throw e;
    return await goi(config);
  }
};

const KEYS: (keyof HkdTrichXuat)[] = [
  'tenHkd', 'truSoDetail', 'truSoWard', 'truSoCity', 'von', 'phone', 'email', 'website', 'nganhMoTa', 'soLaoDong', 'phuongPhapThue',
  'chuTen', 'chuGioiTinh', 'chuNgaySinh', 'chuSoDinhDanh', 'chuPhone', 'chuEmail', 'chuDiaChiDetail', 'chuDiaChiWard', 'chuDiaChiCity',
];

export const trichXuatHkd = async (text: string): Promise<HkdTrichXuat> => {
  if (!text.trim()) throw new Error('Chưa có nội dung để đọc.');
  const ai = createAIClient();
  const prompt = `
Đoạn văn sau là thông tin khách gửi để đăng ký thành lập HỘ KINH DOANH tại Việt Nam:
"""${text}"""

Tách thành các trường (chỉ lấy đúng như trong đoạn văn, KHÔNG tự bịa; không có thì để chuỗi rỗng):
- tenHkd: tên hộ kinh doanh, giữ nguyên như đoạn văn (có hoặc không có chữ "Hộ kinh doanh" đều được).
- truSoDetail: số nhà/phòng, ngách/hẻm, ngõ/kiệt, đường/phố, tổ/xóm/ấp/thôn/khu phố của TRỤ SỞ (ví dụ "904/21 Nguyễn Kiệm").
- truSoWard: xã/phường/đặc khu của trụ sở, ghi đủ chữ "Phường"/"Xã" viết hoa chữ đầu (ví dụ "Phường Hạnh Thông"). Nếu đoạn văn có kèm quận/huyện thì GIỮ LẠI sau dấu phẩy.
- truSoCity: tỉnh/thành phố của trụ sở, viết đầy đủ (ví dụ "TP.HCM" -> "Thành phố Hồ Chí Minh").
- von: vốn kinh doanh, chỉ ghi chữ số (ví dụ "100.000.000 vnd" -> "100000000"; "1 tỷ" -> "1000000000"; "50 triệu" -> "50000000"). Đoạn văn có thể gọi là "vốn điều lệ".
- phone, email, website: liên lạc của hộ kinh doanh / trụ sở.
- nganhMoTa: ngành nghề kinh doanh, giữ nguyên lời mô tả trong đoạn văn (nhiều ngành thì nối bằng dấu chấm phẩy).
- soLaoDong: số lao động (chỉ chữ số).
- phuongPhapThue: "khoan" nếu ghi phương pháp khoán, "keKhai" nếu ghi kê khai, còn lại để rỗng.
- chuTen: họ tên chủ hộ IN HOA; chuGioiTinh: "Nam" hoặc "Nữ"; chuNgaySinh: dd/mm/yyyy; chuSoDinhDanh: số CCCD/định danh;
  chuPhone, chuEmail: liên lạc riêng của chủ hộ (nếu đoạn văn chỉ có một số điện thoại chung thì để ở phone, chuPhone để rỗng);
  chuDiaChiDetail, chuDiaChiWard, chuDiaChiCity: địa chỉ thường trú của chủ hộ (nếu có), cùng quy tắc như trụ sở.
`;
  const properties: Record<string, { type: Type }> = {};
  for (const k of KEYS) properties[k] = { type: Type.STRING };
  const response = await goiNhanh(ai, prompt, { responseMimeType: 'application/json', responseSchema: { type: Type.OBJECT, properties } });
  if (!response.text) throw new Error('AI không trả về kết quả. Vui lòng thử lại.');
  const raw = JSON.parse(response.text);
  const out = {} as HkdTrichXuat;
  for (const k of KEYS) out[k] = clean(raw?.[k]);
  return out;
};

/* ------------------------------------------------------------------ CCCD / Căn cước điện tử */
export interface CccdTrichXuat {
  name: string; gender: string; dob: string; idNumber: string; nationality: string; ethnicity: string;
  thuongTru: { detail: string; ward: string; city: string };
  hienTai: { detail: string; ward: string; city: string };
}

/**
 * Đọc nhanh giấy tờ cá nhân của chủ hộ: CCCD mặt trước/mặt sau và/hoặc ảnh chụp Căn cước điện tử (VNeID).
 * Prompt ngắn, model nhanh, suy nghĩ ở mức thấp để trả kết quả sớm.
 */
export const trichXuatCCCD = async (files: { base64: string; mimeType: string }[]): Promise<CccdTrichXuat> => {
  if (!files.length) throw new Error('Chưa có ảnh giấy tờ.');
  const ai = createAIClient();
  const prompt = `Các ảnh là giấy tờ của MỘT người Việt Nam: thẻ CCCD/Căn cước (mặt trước, mặt sau) và/hoặc ảnh chụp màn hình "Căn cước điện tử" trên VNeID.
Trả về JSON:
- name: họ và tên, chép NGUYÊN VĂN có dấu, IN HOA (đối chiếu dòng MRZ mặt sau nếu có, nhưng giữ dấu tiếng Việt).
- gender: "Nam" hoặc "Nữ". dob: dd/mm/yyyy. idNumber: số định danh/số CCCD 12 chữ số.
- nationality, ethnicity: quốc tịch, dân tộc (thẻ không ghi dân tộc thì để rỗng).
- thuongTru: nơi thường trú; hienTai: nơi ở hiện tại (VNeID không có "Nơi ở hiện tại" thì lấy "Nơi tạm trú"; chỉ có thẻ thì để rỗng).
  Mỗi địa chỉ tách: detail = số nhà, hẻm, đường, tổ/khu phố/ấp; ward = xã/phường/đặc khu (thẻ cũ có quận/huyện thì ghi kèm sau dấu phẩy, ví dụ "Phường 05, Quận Gò Vấp"); city = tỉnh/thành phố viết đủ (TP.HCM -> "Thành phố Hồ Chí Minh").
- Có cả thẻ và ảnh VNeID: địa chỉ lấy theo VNeID (đã theo đơn vị hành chính mới), các trường khác ưu tiên VNeID.
Không đọc được trường nào thì để chuỗi rỗng, không đoán.`;
  const addr = { type: Type.OBJECT, properties: { detail: { type: Type.STRING }, ward: { type: Type.STRING }, city: { type: Type.STRING } } };
  const parts: any[] = files.map((f) => ({ inlineData: { data: f.base64, mimeType: f.mimeType } }));
  parts.push({ text: prompt });
  const config: any = {
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING }, gender: { type: Type.STRING }, dob: { type: Type.STRING }, idNumber: { type: Type.STRING },
        nationality: { type: Type.STRING }, ethnicity: { type: Type.STRING }, thuongTru: addr, hienTai: addr,
      },
    },
  };
  const response = await goiNhanh(ai, { parts }, config);
  if (!response.text) throw new Error('AI không trả về kết quả. Vui lòng thử lại.');
  const raw = JSON.parse(response.text);
  const a = (x: any) => ({ detail: clean(x?.detail), ward: clean(x?.ward), city: clean(x?.city) });
  return {
    name: clean(raw?.name).toUpperCase(), gender: clean(raw?.gender), dob: clean(raw?.dob), idNumber: clean(raw?.idNumber).replace(/\D/g, ''),
    nationality: clean(raw?.nationality), ethnicity: clean(raw?.ethnicity), thuongTru: a(raw?.thuongTru), hienTai: a(raw?.hienTai),
  };
};

/** Thu nhỏ ảnh chụp điện thoại (thường 3-4 MB) trước khi gửi AI: cạnh dài tối đa 1600px, JPEG. */
export const thuNhoAnh = (f: { base64: string; mimeType: string }, max = 1600): Promise<{ base64: string; mimeType: string }> =>
  new Promise((resolve) => {
    if (!f.mimeType.startsWith('image/')) return resolve(f);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      if (k === 1 && f.base64.length < 1_500_000) return resolve(f);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      if (!ctx) return resolve(f);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve({ base64: c.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = () => resolve(f);
    img.src = `data:${f.mimeType};base64,${f.base64}`;
  });
