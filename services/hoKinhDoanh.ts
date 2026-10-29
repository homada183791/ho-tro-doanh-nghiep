/**
 * Hồ sơ thành lập Hộ kinh doanh: dữ liệu form -> bản ghi trộn Word.
 * Mẫu nằm trong public/mau (Mau_HKD_*.docx); tên trường trộn ghi trong README, mục Hộ kinh doanh.
 */
import { tienBangChu, parseTien, dinhDangTien } from './soThanhChu';
import type { MauHoSo, MergeRecord } from './tronHoSo';

export const MAU_HKD: MauHoSo[] = [
  { file: '/mau/Mau_HKD_GDN_MailMerge.docx', ten: 'GiayDeNghi_HKD', nhan: 'Giấy đề nghị đăng ký hộ kinh doanh' },
  { file: '/mau/Mau_HKD_HopDongDichVu_MailMerge.docx', ten: 'HopDongDichVu', nhan: 'Hợp đồng cung cấp dịch vụ' },
  { file: '/mau/Mau_HKD_GiayGioiThieu_MailMerge.docx', ten: 'GiayGioiThieu', nhan: 'Giấy giới thiệu nộp hồ sơ' },
];

export const MAX_NGANH_HKD = 20;
export const MAX_THANH_VIEN_HKD = 5;

export interface DiaChi { detail: string; ward: string; city: string }
export const emptyDiaChi = (): DiaChi => ({ detail: '', ward: '', city: '' });
export const diaChiDayDu = (a: DiaChi) => [a.detail, a.ward, a.city].map((s) => (s || '').trim()).filter(Boolean).join(', ');

export interface NguoiHkd {
  name: string; gender: string; dob: string; idNumber: string; phone: string; email: string;
  ethnicity: string; nationality: string; thuongTru: DiaChi; hienTai: DiaChi; hienTaiGiongThuongTru: boolean;
}
export const emptyNguoi = (): NguoiHkd => ({
  name: '', gender: '', dob: '', idNumber: '', phone: '', email: '', ethnicity: 'Kinh', nationality: 'Việt Nam',
  thuongTru: emptyDiaChi(), hienTai: emptyDiaChi(), hienTaiGiongThuongTru: true,
});

export interface NganhHkd { name: string; detail: string; code: string; isMain: boolean }

export interface CongTyDichVu { ten: string; mst: string; diaChi: string; giamDoc: string; sdt: string; kyHieu: string }
export const CONG_TY_MAC_DINH: CongTyDichVu = {
  ten: 'CÔNG TY TNHH TƯ VẤN DỊCH VỤ TÍN AN', mst: '0319410716',
  diaChi: '889/3 Trần Xuân Soạn, Phường Tân Hưng, Thành phố Hồ Chí Minh', giamDoc: 'BÙI DUY LONG', sdt: '0917318039', kyHieu: 'TA',
};

export interface NguoiNop { name: string; gender: string; dob: string; idNumber: string; chucDanh: string; phone: string }
export const emptyNguoiNop = (): NguoiNop => ({ name: '', gender: 'Nam', dob: '', idNumber: '', chucDanh: 'Nhân viên Công ty', phone: '' });

/**
 * Người đi nộp mặc định trên Giấy giới thiệu. Đọc từ file .env.development.local (không đưa lên GitHub vì có số định danh):
 *   LEGALBIZ_PUBLIC_NGUOI_NOP_TEN, _GIOI_TINH, _NGAY_SINH, _SO_DD, _CHUC_DANH, _SDT
 */
export const nguoiNopMacDinh = (): NguoiNop => {
  const e = ((import.meta as any).env || {}) as Record<string, string | undefined>;
  const g = (k: string, d: string) => (e[`LEGALBIZ_PUBLIC_NGUOI_NOP_${k}`] || '').trim() || d;
  const base = emptyNguoiNop();
  return {
    name: g('TEN', base.name), gender: g('GIOI_TINH', base.gender), dob: g('NGAY_SINH', base.dob),
    idNumber: g('SO_DD', base.idNumber), chucDanh: g('CHUC_DANH', base.chucDanh), phone: g('SDT', base.phone),
  };
};

export interface HoKinhDoanhData {
  docDate: string;               // yyyy-mm-dd
  deTrongNgayGDN: boolean;       // Giấy đề nghị để trống ngày/tháng cho chủ hộ tự ghi khi ký
  keKhaiThem: boolean;           // kê khai dân tộc, quốc tịch, nơi thường trú, nơi ở (dùng khi CSDL dân cư gián đoạn)
  noiKy: string;
  coQuan: string;
  chu: NguoiHkd;
  ten: string; tenNN: string; tenVT: string;
  truSo: DiaChi; truSoGiongChoO: boolean; phone: string; email: string; website: string;
  khongTaiTruSo: boolean;
  nganh: NganhHkd[];
  von: string;
  thueKhacTruSo: boolean; thue: DiaChi; thuePhone: string; thueEmail: string;
  ngayBatDau: string;            // yyyy-mm-dd hoặc rỗng
  soLaoDong: string;
  phuongPhapThue: 'keKhai' | 'khoan';
  chuThe: 'caNhan' | 'hoGiaDinh';
  thanhVien: NguoiHkd[];         // thành viên khác ngoài chủ hộ
  soThuTu: string;               // số thứ tự Hợp đồng / Giấy giới thiệu trong năm
  congTy: CongTyDichVu;
  nguoiNop: NguoiNop;
}

export const emptyHoKinhDoanh = (): HoKinhDoanhData => ({
  docDate: new Date().toISOString().slice(0, 10), deTrongNgayGDN: true, keKhaiThem: true, noiKy: '', coQuan: '',
  chu: emptyNguoi(), ten: '', tenNN: '', tenVT: '',
  truSo: emptyDiaChi(), truSoGiongChoO: false, phone: '', email: '', website: '', khongTaiTruSo: false,
  nganh: [{ name: '', detail: '', code: '', isMain: true }],
  von: '', thueKhacTruSo: false, thue: emptyDiaChi(), thuePhone: '', thueEmail: '',
  ngayBatDau: '', soLaoDong: '01', phuongPhapThue: 'khoan', chuThe: 'caNhan', thanhVien: [],
  soThuTu: '', congTy: { ...CONG_TY_MAC_DINH }, nguoiNop: nguoiNopMacDinh(),
});

/** Tên hộ kinh doanh luôn bắt đầu bằng "HỘ KINH DOANH", in hoa. */
export const tenHkdDayDu = (ten: string) => {
  const t = (ten || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!t) return '';
  return /^HỘ KINH DOANH\b/.test(t) ? t : `HỘ KINH DOANH ${t}`;
};
export const tenHkdRutGon = (ten: string) => tenHkdDayDu(ten).replace(/^HỘ KINH DOANH\s*/, '');

/** Cơ quan đăng ký hộ kinh doanh cấp xã: phường -> Phòng Kinh tế, Hạ tầng và Đô thị; xã/đặc khu -> Phòng Kinh tế. */
export const coQuanHkd = (ward: string) => {
  const w = (ward || '').trim();
  if (!w) return '';
  return /^phường\b/i.test(w) ? `Phòng Kinh tế, Hạ tầng và Đô thị ${w}` : `Phòng Kinh tế ${w}`;
};

/** Nơi ký Giấy đề nghị: "Thành phố Hồ Chí Minh", "Tây Ninh"... (tỉnh/thành của trụ sở). */
export const noiKyHkd = (city: string) => (city || '').trim();

const ngayVN = (iso: string) => {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '').trim();
};
const xung = (gender: string) => (/nữ|nu\b|female/i.test(gender || '') ? 'Bà' : 'Ông');
const box = (on: boolean) => (on ? '☒' : '☐');
const or = (v: string, macDinh: string) => ((v || '').trim() ? v.trim() : macDinh);
const hai = (s: string) => { const t = (s || '').trim(); return /^\d$/.test(t) ? '0' + t : t; };

export const choOHienTai = (p: NguoiHkd): DiaChi => (p.hienTaiGiongThuongTru ? p.thuongTru : p.hienTai);
export const truSoThucTe = (d: HoKinhDoanhData): DiaChi => (d.truSoGiongChoO ? choOHienTai(d.chu) : d.truSo);

export const soHopDong = (d: HoKinhDoanhData) => {
  const nam = (d.docDate || '').slice(0, 4) || String(new Date().getFullYear());
  const kh = (d.congTy.kyHieu || 'TA').trim();
  const stt = (d.soThuTu || '').trim();
  return { hd: stt ? `${stt}/${nam}/HĐDV-${kh}` : '', ggt: stt ? `${stt}/${nam}/GGT-${kh}` : '' };
};

/** Kiểm tra trước khi tạo hồ sơ: trả về danh sách thiếu sót (rỗng = đủ). */
export const kiemTraHkd = (d: HoKinhDoanhData): string[] => {
  const loi: string[] = [];
  const ts = truSoThucTe(d);
  if (!d.chu.name.trim()) loi.push('Chưa có họ tên chủ hộ.');
  if (!d.chu.idNumber.trim()) loi.push('Chưa có số định danh cá nhân của chủ hộ.');
  if (!d.chu.dob.trim()) loi.push('Chưa có ngày sinh của chủ hộ.');
  if (!tenHkdDayDu(d.ten)) loi.push('Chưa có tên hộ kinh doanh.');
  if (!ts.detail.trim() || !ts.ward.trim() || !ts.city.trim()) loi.push('Địa chỉ trụ sở chưa đủ số nhà/đường, xã/phường, tỉnh/thành.');
  const nganh = d.nganh.filter((n) => n.name.trim() || n.code.trim());
  if (!nganh.length) loi.push('Chưa có ngành, nghề kinh doanh.');
  const chinh = nganh.filter((n) => n.isMain);
  if (nganh.length && chinh.length !== 1) loi.push('Cần chọn đúng một ngành, nghề kinh doanh chính.');
  if (chinh.length === 1 && !/^\d{4}$/.test(chinh[0].code.trim())) loi.push('Ngành chính phải có mã ngành cấp 4 (4 chữ số).');
  if (nganh.length > MAX_NGANH_HKD) loi.push(`Mẫu chỉ có ${MAX_NGANH_HKD} dòng ngành nghề.`);
  if (!parseTien(d.von)) loi.push('Chưa có vốn kinh doanh.');
  if (!d.coQuan.trim()) loi.push('Chưa có cơ quan đăng ký (Kính gửi).');
  if (d.chuThe === 'hoGiaDinh' && !d.thanhVien.some((t) => t.name.trim())) loi.push('Đã chọn "Các thành viên hộ gia đình" nhưng chưa nhập thành viên nào.');
  if (1 + d.thanhVien.length > MAX_THANH_VIEN_HKD && d.chuThe === 'hoGiaDinh') loi.push(`Bảng thành viên chỉ có ${MAX_THANH_VIEN_HKD} dòng (kể cả chủ hộ).`);
  return loi;
};

/** Dữ liệu form -> bản ghi trộn cho cả 3 mẫu. */
export const buildHkdRecord = (d: HoKinhDoanhData): MergeRecord => {
  const [nam, thang, ngay] = (d.docDate || '').split('-');
  const chu = d.chu;
  const them = d.keKhaiThem;
  const tt = them ? chu.thuongTru : emptyDiaChi();
  const ht = them ? choOHienTai(chu) : emptyDiaChi();
  const ts = truSoThucTe(d);
  const ten = tenHkdDayDu(d.ten);
  const so = soHopDong(d);
  const von = parseTien(d.von);
  const rec: MergeRecord = {
    NGAY: ngay || '', THANG: thang || '', NAM: nam || '',
    GDN_NGAY: d.deTrongNgayGDN ? '     ' : (ngay || ''),
    GDN_THANG: d.deTrongNgayGDN ? '     ' : (thang || ''),
    NOI_KY: or(d.noiKy, noiKyHkd(ts.city)),
    CQ_DK_KD: d.coQuan.trim(),
    CHU_TEN: chu.name.trim().toUpperCase(), CHU_XUNG: xung(chu.gender), CHU_GIOI_TINH: chu.gender,
    CHU_SINH_NGAY: ngayVN(chu.dob), CHU_SO_DD: chu.idNumber.trim(), CHU_SDT: chu.phone.trim(),
    CHU_EMAIL: or(chu.email, '………………'), CHU_DAN_TOC: them ? chu.ethnicity.trim() : '', CHU_QUOC_TICH: them ? chu.nationality.trim() : '',
    CHU_TT_SO_NHA: tt.detail, CHU_TT_PHUONG_XA: tt.ward, CHU_TT_TINH_TP: tt.city,
    CHU_HT_SO_NHA: ht.detail, CHU_HT_PHUONG_XA: ht.ward, CHU_HT_TINH_TP: ht.city,
    CHU_DIA_CHI: diaChiDayDu(choOHienTai(chu)),
    TEN_HKD: ten, TEN_TV: ten, TEN_HKD_RUT: tenHkdRutGon(d.ten), TEN_NN: d.tenNN.trim().toUpperCase(), TEN_VT: d.tenVT.trim().toUpperCase(),
    TS_SO_NHA: ts.detail, TS_PHUONG_XA: ts.ward, TS_TINH_TP: ts.city, TS_DIA_CHI: diaChiDayDu(ts),
    TS_SDT: d.phone.trim(), TS_EMAIL: d.email.trim(), WEBSITE: d.website.trim(),
    X_KHONG_TRU_SO: box(d.khongTaiTruSo),
    VON_SO: von ? dinhDangTien(von) : '', VON_CHU: tienBangChu(d.von),
    THUE_SO_NHA: d.thueKhacTruSo ? d.thue.detail : '', THUE_PHUONG_XA: d.thueKhacTruSo ? d.thue.ward : '',
    THUE_TINH_TP: d.thueKhacTruSo ? d.thue.city : '',
    THUE_SDT: d.thueKhacTruSo ? d.thuePhone.trim() : '', THUE_EMAIL: d.thueKhacTruSo ? d.thueEmail.trim() : '',
    NGAY_BD: d.ngayBatDau ? ngayVN(d.ngayBatDau) : '…../…../…….',
    SO_LAO_DONG: hai(d.soLaoDong),
    X_KE_KHAI: box(d.phuongPhapThue === 'keKhai'), X_KHOAN: box(d.phuongPhapThue === 'khoan'),
    X_CA_NHAN: box(d.chuThe === 'caNhan'), X_HO_GD: box(d.chuThe === 'hoGiaDinh'),
    NGANH_CHINH: '',
    SO_HD: so.hd, SO_GGT: so.ggt,
    CTY_TEN: d.congTy.ten.trim().toUpperCase(), CTY_MST: d.congTy.mst.trim(), CTY_DIA_CHI: d.congTy.diaChi.trim(),
    CTY_GD: d.congTy.giamDoc.trim().toUpperCase(), CTY_SDT: d.congTy.sdt.trim(),
    NV_TEN: d.nguoiNop.name.trim().toUpperCase(), NV_XUNG: xung(d.nguoiNop.gender), NV_SINH_NGAY: ngayVN(d.nguoiNop.dob),
    NV_SO_DD: d.nguoiNop.idNumber.trim(), NV_CHUC_DANH: d.nguoiNop.chucDanh.trim(), NV_SDT: d.nguoiNop.phone.trim(),
  };

  // Ngành nghề: dòng trống bị xoá khi trộn; ngành chính đánh dấu "x" theo mã
  const nganh = d.nganh.filter((n) => n.name.trim() || n.code.trim()).slice(0, MAX_NGANH_HKD);
  for (let i = 1; i <= MAX_NGANH_HKD; i++) {
    const n = nganh[i - 1];
    rec[`TEN_NGANH_${i}`] = n ? n.name.trim() : '';
    // "Chi tiết: …" là dòng riêng, in nghiêng trong mẫu (khối [[#CT_NGANH_n]]), không có thì tự bỏ
    rec[`CT_NGANH_${i}`] = n ? n.detail.trim() : '';
    rec[`MA_NGANH_${i}`] = n ? n.code.trim() : '';
  }
  const chinh = nganh.find((n) => n.isMain);
  rec.NGANH_CHINH = chinh ? chinh.code.trim() : '';

  // Bảng thành viên hộ gia đình: chỉ kê khai khi chủ thể là các thành viên hộ gia đình, dòng 1 là chủ hộ.
  // Theo chú thích của mẫu: đã có số định danh thì chỉ kê khai cột 1-5 và 10; cột 6-9 chỉ ghi cho người chưa có số định danh.
  const ds = d.chuThe === 'hoGiaDinh' ? [chu, ...d.thanhVien.filter((t) => t.name.trim())] : [];
  for (let i = 1; i <= MAX_THANH_VIEN_HKD; i++) {
    const t = ds[i - 1];
    const o = t ? choOHienTai(t) : emptyDiaChi();
    rec[`TV_${i}_TEN`] = t ? t.name.trim().toUpperCase() : '';
    rec[`TV_${i}_SINH_NGAY`] = t ? ngayVN(t.dob) : '';
    rec[`TV_${i}_SO_DD`] = t ? t.idNumber.trim() : '';
    rec[`TV_${i}_GIOI_TINH`] = t ? t.gender : '';
    const k = !!t && !t.idNumber.trim();
    rec[`TV_${i}_QUOC_TICH`] = k ? t.nationality.trim() : '';
    rec[`TV_${i}_DAN_TOC`] = k ? t.ethnicity.trim() : '';
    rec[`TV_${i}_THUONG_TRU`] = k ? diaChiDayDu(t.thuongTru) : '';
    rec[`TV_${i}_O_HIEN_TAI`] = k ? diaChiDayDu(o) : '';
  }
  return rec;
};
