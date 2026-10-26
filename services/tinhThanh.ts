/**
 * Tỉnh/thành phố sau sắp xếp đơn vị hành chính (Nghị quyết 202/2025/QH15, từ 01/07/2025): 34 đơn vị.
 * Dùng để quy địa chỉ (kể cả tên tỉnh cũ) về tỉnh/thành mới, chọn nơi ký và cơ quan đăng ký kinh doanh.
 */

/** Tỉnh/thành mới -> các tỉnh/thành cũ hợp nhất vào. Thành phố trực thuộc trung ương ghi đủ "Thành phố ...". */
const SAP_NHAP: Record<string, string[]> = {
  'Thành phố Hà Nội': ['Hà Nội'],
  'Thành phố Huế': ['Huế', 'Thừa Thiên Huế', 'Thừa Thiên - Huế'],
  'Lai Châu': ['Lai Châu'],
  'Điện Biên': ['Điện Biên'],
  'Sơn La': ['Sơn La'],
  'Lạng Sơn': ['Lạng Sơn'],
  'Quảng Ninh': ['Quảng Ninh'],
  'Thanh Hóa': ['Thanh Hóa'],
  'Nghệ An': ['Nghệ An'],
  'Hà Tĩnh': ['Hà Tĩnh'],
  'Cao Bằng': ['Cao Bằng'],
  'Tuyên Quang': ['Hà Giang', 'Tuyên Quang'],
  'Lào Cai': ['Yên Bái', 'Lào Cai'],
  'Thái Nguyên': ['Bắc Kạn', 'Thái Nguyên'],
  'Phú Thọ': ['Vĩnh Phúc', 'Hòa Bình', 'Phú Thọ'],
  'Bắc Ninh': ['Bắc Giang', 'Bắc Ninh'],
  'Hưng Yên': ['Thái Bình', 'Hưng Yên'],
  'Thành phố Hải Phòng': ['Hải Dương', 'Hải Phòng'],
  'Ninh Bình': ['Hà Nam', 'Nam Định', 'Ninh Bình'],
  'Quảng Trị': ['Quảng Bình', 'Quảng Trị'],
  'Thành phố Đà Nẵng': ['Quảng Nam', 'Đà Nẵng'],
  'Quảng Ngãi': ['Kon Tum', 'Quảng Ngãi'],
  'Gia Lai': ['Bình Định', 'Gia Lai'],
  'Khánh Hòa': ['Ninh Thuận', 'Khánh Hòa'],
  'Lâm Đồng': ['Đắk Nông', 'Bình Thuận', 'Lâm Đồng'],
  'Đắk Lắk': ['Phú Yên', 'Đắk Lắk'],
  'Thành phố Hồ Chí Minh': ['Hồ Chí Minh', 'HCM', 'TPHCM', 'Sài Gòn', 'Bà Rịa - Vũng Tàu', 'Bà Rịa Vũng Tàu', 'Vũng Tàu', 'Bình Dương'],
  'Đồng Nai': ['Bình Phước', 'Đồng Nai'],
  'Tây Ninh': ['Long An', 'Tây Ninh'],
  'Thành phố Cần Thơ': ['Sóc Trăng', 'Hậu Giang', 'Cần Thơ'],
  'Vĩnh Long': ['Bến Tre', 'Trà Vinh', 'Vĩnh Long'],
  'Đồng Tháp': ['Tiền Giang', 'Đồng Tháp'],
  'Cà Mau': ['Bạc Liêu', 'Cà Mau'],
  'An Giang': ['Kiên Giang', 'An Giang'],
};

/** Bỏ dấu, chữ thường, bỏ tiền tố "tỉnh/thành phố/tp." để so sánh. */
const chuan = (s: string) =>
  (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/^\s*(tinh|thanh pho|tp\.?|t\.p\.?)\s*/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const BANG: { cu: string; moi: string }[] = Object.entries(SAP_NHAP)
  .flatMap(([moi, cus]) => cus.map((cu) => ({ cu: chuan(cu), moi })))
  .sort((a, b) => b.cu.length - a.cu.length); // ưu tiên tên dài trước (vd "thua thien hue" trước "hue")

/**
 * Quy tên tỉnh/thành (cũ hoặc mới, có thể kèm "Tỉnh", "TP.", hoặc cả chuỗi địa chỉ) về tỉnh/thành mới.
 * Trả về "" nếu không nhận ra.
 */
export const tinhMoi = (diaChi: string): string => {
  const c = chuan(diaChi);
  if (!c) return '';
  // Khớp cả chuỗi trước, rồi tới phần cuối địa chỉ (tỉnh/thành thường nằm cuối)
  const exact = BANG.find((x) => x.cu === c);
  if (exact) return exact.moi;
  const parts = (diaChi || '').split(',').map(chuan).filter(Boolean).reverse();
  for (const p of parts) {
    const m = BANG.find((x) => x.cu === p);
    if (m) return m.moi;
  }
  const contain = BANG.find((x) => (' ' + c + ' ').includes(' ' + x.cu + ' '));
  return contain ? contain.moi : '';
};

/** Nơi ký trên văn bản: "TP. Hồ Chí Minh", "TP. Hà Nội", "Tỉnh Tây Ninh"... */
export const noiKyTheoTinh = (tinh: string): string => {
  if (!tinh) return '';
  // Thành phố trực thuộc trung ương: "TP. Hồ Chí Minh"; tỉnh: ghi đủ "Tỉnh Tây Ninh"
  if (/^Thành phố\s+/.test(tinh)) return tinh.replace(/^Thành phố\s+/, 'TP. ');
  return `Tỉnh ${tinh}`;
};

/** Chọn cơ quan đăng ký kinh doanh trong danh sách theo tỉnh/thành mới. */
export const coQuanDangKy = (tinh: string, danhSach: string[]): string => {
  if (!tinh) return '';
  const ten = chuan(tinh);
  return danhSach.find((o) => chuan(o.replace(/^.*Sở Tài chính\s+/i, '')) === ten) || '';
};
