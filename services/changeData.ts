/**
 * Hồ sơ đăng ký thay đổi (Công ty TNHH 1 thành viên): 6 trường hợp và dữ liệu xuất Excel trộn thư.
 * Thông tin HIỆN TẠI lấy từ form chính (đã rút trích từ GPKD); thông tin MỚI nằm trong ChangeData.
 */
import type { IndustryCode } from '../types';
import { tinhMoi, noiKyTheoTinh } from './tinhThanh';

export type ChangeCaseId = 'doiTen' | 'diaChi' | 'von' | 'nganh' | 'daiDien' | 'chuSoHuu' | 'capNhat' | 'chuHuongLoi';

export const CHANGE_CASES: { id: ChangeCaseId; label: string; col: string }[] = [
  { id: 'doiTen', label: 'Đổi tên công ty', col: 'TD_DOI_TEN' },
  { id: 'diaChi', label: 'Thay đổi địa chỉ trụ sở chính', col: 'TD_DIA_CHI' },
  { id: 'von', label: 'Thay đổi vốn điều lệ', col: 'TD_VON' },
  { id: 'nganh', label: 'Thay đổi ngành, nghề kinh doanh', col: 'TD_NGANH' },
  { id: 'daiDien', label: 'Thay đổi người đại diện theo pháp luật', col: 'TD_DAI_DIEN' },
  { id: 'chuSoHuu', label: 'Thay đổi chủ sở hữu', col: 'TD_CHU_SO_HUU' },
  { id: 'capNhat', label: 'Bổ sung, cập nhật thông tin (Mục B)', col: 'TD_CAP_NHAT' },
  { id: 'chuHuongLoi', label: 'Chủ sở hữu hưởng lợi', col: 'TD_CSH_HL' },
];

/** Mục B: người cần cập nhật địa chỉ liên hệ. */
export interface CapNhatNguoi { name: string; detail: string; ward: string; city: string; country: string; role: string; goc?: string }
export const MAX_CN_NGUOI = 3;
export const diaChiDayDu = (x: { detail: string; ward: string; city: string; country?: string }) =>
  [x.detail, x.ward, x.city, x.country || 'Việt Nam'].map((v) => (v || '').trim()).filter(Boolean).join(', ');

export interface PersonInfo {
  name: string; gender: string; title: string; dob: string;
  idType: string; idNumber: string; idDate: string; idPlace: string;
  addressDetail: string; addressWard: string; addressCity: string; country: string; phone: string; email: string;
}
export const emptyPerson = (): PersonInfo => ({
  name: '', gender: '', title: '', dob: '', idType: '', idNumber: '', idDate: '', idPlace: '',
  addressDetail: '', addressWard: '', addressCity: '', country: 'Việt Nam', phone: '', email: '',
});

export interface ChangeData {
  cases: Record<ChangeCaseId, boolean>;
  // 1. Đổi tên
  newName: string; newNameEn: string; newNameAbbr: string;
  // 2. Địa chỉ
  newAddressDetail: string; newAddressWard: string; newAddressCity: string; newPhone: string; newEmail: string; newWebsite: string;
  // 3. Vốn
  oldCapital: string; oldCapitalInWords: string;
  newCapital: string; newCapitalInWords: string; capitalChangeDate: string; capitalChangeForm: string;
  // 4. Ngành nghề
  addIndustryText: string; addIndustries: IndustryCode[]; removeIndustries: { code: string; name: string }[];
  // 5. Người đại diện mới
  newRep: PersonInfo;
  // 6. Chủ sở hữu mới
  newOwnerType: 'individual' | 'organization';
  newOwner: PersonInfo;
  newOwnerOrgCode: string;
  // 7. Mục B – bổ sung, cập nhật thông tin
  cnTruSo: boolean; cnTsDetail: string; cnTsWard: string; cnTsCity: string;
  cnLienHe: boolean; cnNguoi: CapNhatNguoi[];
  // Chủ sở hữu hưởng lợi (Danh sách chủ sở hữu hưởng lợi): lấy theo chủ sở hữu, người đại diện, hoặc nhập người khác
  hlNguon: '' | 'chu' | 'daiDien' | 'khac';
  hl: PersonInfo;
  // Số điện thoại nhập thêm (GPKD không ghi): Chủ tịch công ty/Giám đốc và công ty
  sdtGiamDoc: string;
  sdtCongTy: string;
  // 8. Chủ sở hữu hưởng lợi: thông báo trên Giấy đề nghị, chọn đoạn a) hoặc b)
  hlTB: 'a' | 'b';
  // Người ký giấy đề nghị (để trống: tự chọn)
  signer: string;
}

export const emptyChange = (): ChangeData => ({
  cases: { doiTen: false, diaChi: false, von: false, nganh: false, daiDien: false, chuSoHuu: false, capNhat: false, chuHuongLoi: false },
  newName: '', newNameEn: '', newNameAbbr: '',
  newAddressDetail: '', newAddressWard: '', newAddressCity: '', newPhone: '', newEmail: '', newWebsite: '',
  oldCapital: '', oldCapitalInWords: '',
  newCapital: '', newCapitalInWords: '', capitalChangeDate: '', capitalChangeForm: '',
  addIndustryText: '', addIndustries: [], removeIndustries: [],
  newRep: { ...emptyPerson(), title: 'Giám đốc' },
  newOwnerType: 'individual', newOwner: emptyPerson(), newOwnerOrgCode: '',
  cnTruSo: false, cnTsDetail: '', cnTsWard: '', cnTsCity: '',
  cnLienHe: false, cnNguoi: [],
  hlNguon: '', hl: emptyPerson(),
  sdtGiamDoc: '', sdtCongTy: '', hlTB: 'b',
  signer: '',
});

/**
 * Ký hiệu viết tắt từ tên công ty: bỏ phần loại hình, lấy chữ cái đầu mỗi từ, bỏ dấu.
 * "CÔNG TY TNHH NHỰA JUN CHENG VIỆT NAM" -> "NJCVN".
 */
export const kyHieuTen = (ten: string): string => {
  let t = (ten || '').normalize('NFC').toUpperCase().replace(/\s+/g, ' ').trim();
  const loaiHinh = [
    /^CÔNG TY TRÁCH NHIỆM HỮU HẠN( MỘT THÀNH VIÊN| HAI THÀNH VIÊN TRỞ LÊN| 1 THÀNH VIÊN| MTV)?\s+/,
    /^CÔNG TY TNHH( MỘT THÀNH VIÊN| HAI THÀNH VIÊN TRỞ LÊN| 1 THÀNH VIÊN| MTV)?\s+/,
    /^CÔNG TY CỔ PHẦN\s+/, /^CÔNG TY CP\s+/, /^CÔNG TY HỢP DANH\s+/, /^DOANH NGHIỆP TƯ NHÂN\s+/, /^CÔNG TY\s+/,
  ];
  for (const re of loaiHinh) { if (re.test(t)) { t = t.replace(re, ''); break; } }
  return t.split(/[\s\-–,.&()]+/).filter(Boolean)
    .map((w) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D').charAt(0))
    .filter((ch) => /[A-Z0-9]/.test(ch)).join('');
};

/** Người ký mặc định: đổi người đại diện thì chủ sở hữu (cá nhân) ký, ngược lại người đại diện hiện tại ký. */
export const nguoiKyMacDinh = (c: ChangeData, cur: Record<string, string>) =>
  c.signer.trim().toUpperCase() || (c.cases.daiDien && cur.CHU_LOAI !== 'Tổ chức' && cur.CHU_TEN ? cur.CHU_TEN : cur.DAI_DIEN_TEN || '');

/** Viết gọn tên tỉnh/thành để ghi nơi ký: "Thành phố Hồ Chí Minh" -> "TP. Hồ Chí Minh". */
export const noiKy = (city: string) => {
  const c = (city || '').trim();
  if (/^thành phố\s+/i.test(c)) return 'TP. ' + c.replace(/^thành phố\s+/i, '');
  return c.replace(/^tỉnh\s+/i, '');
};

const digits = (s: string) => Number(String(s || '').replace(/\D/g, '')) || 0;
const fmt = (n: number) => (n ? n.toLocaleString('de-DE') : '');

/** Loại giấy tờ theo số giấy tờ (giống cách xuất hồ sơ thành lập). */
const loaiGiayTo = (num: string, given: string) => {
  if (given) return given;
  const c = (num || '').trim().toUpperCase();
  if (!c) return '';
  if (/^[A-Z]\d{7}$/.test(c)) return 'Hộ chiếu Việt Nam';
  if (/[A-Z]/.test(c)) return 'Hộ chiếu nước ngoài';
  if (c.length === 9) return 'Chứng minh nhân dân';
  return 'Căn cước công dân';
};

const personCols = (prefix: string, p: PersonInfo, withTitle: boolean): [string, string][] => [
  [`${prefix}_TEN`, p.name.toUpperCase()],
  [`${prefix}_GIOI_TINH`, p.gender],
  ...(withTitle ? [[`${prefix}_CHUC_DANH`, p.title] as [string, string]] : []),
  [`${prefix}_SINH_NGAY`, p.dob],
  [`${prefix}_LOAI_GT`, loaiGiayTo(p.idNumber, p.idType)],
  [`${prefix}_SO_GT`, p.idNumber],
  [`${prefix}_NGAY_CAP`, p.idDate],
  [`${prefix}_NOI_CAP`, p.idPlace],
  [`${prefix}_DIA_CHI`, p.addressDetail],
  [`${prefix}_PHUONG_XA`, p.addressWard],
  [`${prefix}_TINH_TP`, p.addressCity],
  [`${prefix}_QUOC_GIA`, p.country],
  [`${prefix}_SDT`, p.phone],
];

/** Các cột thông tin hiện tại lấy lại từ dòng trộn thư của hồ sơ thành lập (cùng tên cột). */
const CURRENT_COLS = [
  'CQ_DK_KD', 'NGAY_THANG_NAM', 'NGAY', 'THANG', 'NAM', 'LOAI_HINH',
  'TEN_TV', 'TEN_TA', 'TEN_VT', 'VON_SO', 'VON_CHU',
  'TS_DIA_CHI', 'TS_PHUONG_XA', 'TS_TINH_TP', 'TS_QUOC_GIA', 'TS_FULL', 'DT_CTY', 'EMAIL', 'WEBSITE',
  'CHU_LOAI', 'CHU_TEN', 'CHU_GIOI_TINH', 'CHU_SINH_NGAY', 'CHU_LOAI_GT', 'CHU_MS_SO_GT', 'CHU_NGAY_CAP', 'CHU_NOI_CAP',
  'CHU_DIA_CHI', 'CHU_PHUONG_XA', 'CHU_TINH_TP', 'CHU_SDT',
  'DAI_DIEN_TEN', 'DAI_DIEN_GIOI_TINH', 'DAI_DIEN_CHUC_DANH', 'DAI_DIEN_SINH_NGAY', 'DAI_DIEN_LOAI_GT', 'DAI_DIEN_SO_GT',
  'DAI_DIEN_NGAY_CAP', 'DAI_DIEN_NOI_CAP', 'DAI_DIEN_DIA_CHI', 'DAI_DIEN_PHUONG_XA', 'DAI_DIEN_TINH_TP', 'DAI_DIEN_QUOC_TICH', 'DAI_DIEN_SDT',
];

const MAX_NGANH = 30;

/**
 * Dựng dòng trộn thư cho hồ sơ thay đổi.
 * `current` là bản ghi trộn thư của thông tin hiện tại (tên cột -> giá trị).
 */
export const buildChangeRow = (
  currentGoc: Record<string, string>,
  gpkd: { enterpriseCode?: string; firstRegDate?: string; changeCount?: string; lastChangeDate?: string },
  c: ChangeData
): { headers: string[]; values: string[] } => {
  // Số điện thoại nhập thêm ghi đè số trên GPKD: Giám đốc (người đại diện; chủ sở hữu nếu là cùng người) và công ty
  const sdtGd = (c.sdtGiamDoc || '').trim(), sdtCty = (c.sdtCongTy || '').trim();
  const cungNguoi = (a?: string, b?: string) => !!a && !!b && a.normalize('NFC').trim().toUpperCase() === b.normalize('NFC').trim().toUpperCase();
  const current: Record<string, string> = {
    ...currentGoc,
    DT_CTY: sdtCty || currentGoc.DT_CTY || '',
    DAI_DIEN_SDT: sdtGd || currentGoc.DAI_DIEN_SDT || '',
    CHU_SDT: (sdtGd && cungNguoi(currentGoc.CHU_TEN, currentGoc.DAI_DIEN_TEN) ? sdtGd : '') || currentGoc.CHU_SDT || '',
  };
  const cols: [string, string][] = [];
  const add = (k: string, v: string | undefined) => cols.push([k, v ?? '']);

  // Thông tin chung + giấy chứng nhận
  CURRENT_COLS.slice(0, 6).forEach((k) => add(k, current[k]));
  add('MST', gpkd.enterpriseCode);
  add('NGAY_DK_LAN_DAU', gpkd.firstRegDate);
  add('LAN_THAY_DOI', gpkd.changeCount);
  add('NGAY_THAY_DOI_GAN_NHAT', gpkd.lastChangeDate);
  // Nơi ký theo tỉnh/thành MỚI của trụ sở: địa chỉ sau thay đổi (Mục A) > địa chỉ cập nhật (Mục B) > địa chỉ trên GPKD
  const tpTruSo = (c.cases.diaChi && c.newAddressCity) || (c.cases.capNhat && c.cnTruSo && c.cnTsCity) || current.TS_TINH_TP || '';
  add('NOI_KY', noiKyTheoTinh(tinhMoi(tpTruSo)) || noiKy(tpTruSo));
  // Số giấy đề nghị: 01/<ký hiệu tên công ty>-GĐN, ví dụ 01/NJCVN-GĐN
  add('SO_GDN', `01/${kyHieuTen(current.TEN_TV)}-GĐN`);
  add('LAN_THAY_DOI_MOI', gpkd.changeCount ? String(Number(gpkd.changeCount) + 1) : '1');

  // Thông tin hiện tại
  CURRENT_COLS.slice(6).forEach((k) => add(k, current[k]));

  // Trường hợp thay đổi (X = có)
  CHANGE_CASES.forEach((cs) => add(cs.col, c.cases[cs.id] ? 'X' : ''));
  add('TD_MUC_A', CHANGE_CASES.some((cs) => cs.id !== 'capNhat' && c.cases[cs.id]) ? 'X' : '');
  add('TD_DANH_SACH', CHANGE_CASES.filter((cs) => c.cases[cs.id]).map((cs) => cs.label).join('; '));

  // 1. Tên mới
  const on = c.cases;
  add('TEN_MOI_TV', on.doiTen ? c.newName.toUpperCase() : '');
  add('TEN_MOI_TA', on.doiTen ? c.newNameEn.toUpperCase() : '');
  add('TEN_MOI_VT', on.doiTen ? c.newNameAbbr.toUpperCase() : '');

  // 2. Địa chỉ mới
  const addrParts = [c.newAddressDetail, c.newAddressWard, c.newAddressCity, 'Việt Nam'].filter(Boolean);
  add('TS_MOI_DIA_CHI', on.diaChi ? c.newAddressDetail : '');
  add('TS_MOI_PHUONG_XA', on.diaChi ? c.newAddressWard : '');
  add('TS_MOI_TINH_TP', on.diaChi ? c.newAddressCity : '');
  add('TS_MOI_QUOC_GIA', on.diaChi ? 'Việt Nam' : '');
  add('TS_MOI_FULL', on.diaChi && c.newAddressDetail ? addrParts.join(', ') : '');
  add('DT_MOI', on.diaChi ? c.newPhone || sdtCty : '');
  add('EMAIL_MOI', on.diaChi ? c.newEmail : '');
  add('WEBSITE_MOI', on.diaChi ? c.newWebsite : '');

  // 3. Vốn mới
  const vonCu = digits(c.oldCapital || current.VON_SO), vonMoi = digits(c.newCapital);
  const vonCuChu = c.oldCapitalInWords || current.VON_CHU;
  add('VON_CU_SO', on.von ? fmt(vonCu) : '');
  add('VON_CU_CHU', on.von ? vonCuChu : '');
  add('VON_MOI_SO', on.von ? fmt(vonMoi) : '');
  add('VON_MOI_CHU', on.von ? c.newCapitalInWords : '');
  add('VON_TANG_GIAM', on.von && vonMoi && vonCu ? (vonMoi > vonCu ? 'Tăng' : vonMoi < vonCu ? 'Giảm' : '') : '');
  add('VON_CHENH_LECH', on.von && vonMoi && vonCu ? fmt(Math.abs(vonMoi - vonCu)) : '');
  add('VON_GIAM', on.von && vonMoi && vonCu && vonMoi < vonCu ? 'X' : '');
  add('VON_THOI_DIEM', on.von ? c.capitalChangeDate : '');
  add('VON_HINH_THUC', on.von ? c.capitalChangeForm : '');
  // Nguồn vốn sau thay đổi (mặc định 100% vốn tư nhân)
  add('NV_TN_SO', on.von && vonMoi ? fmt(vonMoi) : '');
  add('NV_TN_TL', on.von && vonMoi ? '100' : '');
  // Các nguồn vốn khác để trống (giữ cột cho mẫu Word)
  ['NV_NN_SO', 'NV_NN_TL', 'NV_NG_SO', 'NV_NG_TL', 'NV_KHAC_SO', 'NV_KHAC_TL'].forEach((k) => add(k, ''));

  // 4. Ngành bổ sung / rút bớt (mỗi loại 30 cặp cột cố định)
  const them = on.nganh ? c.addIndustries : [];
  const rut = on.nganh ? c.removeIndustries : [];
  for (let i = 0; i < MAX_NGANH; i++) {
    add(`THEM_TEN_NGANH_${i + 1}`, them[i]?.name);
    add(`THEM_MA_NGANH_${i + 1}`, them[i]?.code);
    add(`THEM_CHINH_${i + 1}`, them[i]?.isMain ? 'X' : '');
  }
  add('THEM_NGANH_CHINH', them.find((x) => x.isMain)?.code || '');
  for (let i = 0; i < MAX_NGANH; i++) {
    add(`RUT_TEN_NGANH_${i + 1}`, rut[i]?.name);
    add(`RUT_MA_NGANH_${i + 1}`, rut[i]?.code);
  }

  // 5. Người đại diện mới
  personCols('DD_MOI', on.daiDien ? c.newRep : emptyPerson(), true).forEach(([k, v]) => add(k, on.daiDien ? v : ''));
  // Mẫu số 13: email, và khung "không có số định danh cá nhân" (dùng khi giấy tờ là hộ chiếu)
  const r = c.newRep;
  const hoChieu = on.daiDien && /hộ chiếu/i.test(loaiGiayTo(r.idNumber, r.idType));
  add('DD_MOI_EMAIL', on.daiDien ? r.email : '');
  add('DD_MOI_DAN_TOC', '');
  add('DD_MOI_QUOC_TICH', hoChieu ? r.country : '');
  add('DD_MOI_SO_HO_CHIEU', hoChieu ? r.idNumber : '');
  add('DD_MOI_HC_NGAY_CAP', hoChieu ? r.idDate : '');
  add('DD_MOI_HC_NOI_CAP', hoChieu ? r.idPlace : '');
  ['DD_MOI_TT_DIA_CHI', 'DD_MOI_TT_PHUONG_XA', 'DD_MOI_TT_TINH_TP', 'DD_MOI_TT_QUOC_GIA'].forEach((k) => add(k, ''));
  // Số định danh của Chủ tịch công ty (chủ sở hữu cá nhân) – kê khai khi ủy quyền nộp hồ sơ
  add('CHU_TICH_SO_GT', on.daiDien && current.CHU_LOAI !== 'Tổ chức' ? current.CHU_MS_SO_GT : '');

  // 6. Chủ sở hữu mới
  add('CSH_MOI_LOAI', on.chuSoHuu ? (c.newOwnerType === 'organization' ? 'Tổ chức' : 'Cá nhân') : '');
  personCols('CSH_MOI', on.chuSoHuu ? c.newOwner : emptyPerson(), false).forEach(([k, v]) => add(k, on.chuSoHuu ? v : ''));
  add('CSH_MOI_MS_TO_CHUC', on.chuSoHuu && c.newOwnerType === 'organization' ? c.newOwnerOrgCode : '');

  // 7. Mục B – bổ sung, cập nhật thông tin
  const cnTs = on.capNhat && c.cnTruSo;
  const cnLh = on.capNhat && c.cnLienHe ? c.cnNguoi.filter((x) => x.name.trim()) : [];
  add('CN_TRU_SO', cnTs ? 'X' : '');
  add('CN_TS_DIA_CHI', cnTs ? c.cnTsDetail : '');
  add('CN_TS_PHUONG_XA', cnTs ? c.cnTsWard : '');
  add('CN_TS_TINH_TP', cnTs ? c.cnTsCity : '');
  add('CN_LIEN_HE', cnLh.length ? 'X' : '');
  add('CN_LH_STT', cnLh.length ? (cnTs ? '2' : '1') : '');
  for (let i = 0; i < MAX_CN_NGUOI; i++) {
    const x = cnLh[i];
    add(`CN_LH_TEN_${i + 1}`, x ? x.name.toUpperCase() : '');
    add(`CN_LH_DIA_CHI_${i + 1}`, x ? diaChiDayDu(x) : '');
    add(`CN_LH_VAI_TRO_${i + 1}`, x ? x.role : '');
  }

  // Địa chỉ nhận thông báo thuế: đổi trụ sở (Mục A) thì theo địa chỉ mới; chỉ cập nhật (Mục B) thì theo địa chỉ cập nhật
  const thueA = on.diaChi && !!c.newAddressDetail.trim();
  const thueB = !thueA && cnTs && !!c.cnTsDetail.trim();
  add('THUE_MOI', thueA || thueB ? 'X' : '');
  add('THUE_MOI_DIA_CHI', thueA ? c.newAddressDetail : thueB ? c.cnTsDetail : '');
  add('THUE_MOI_PHUONG_XA', thueA ? c.newAddressWard : thueB ? c.cnTsWard : '');
  add('THUE_MOI_TINH_TP', thueA ? c.newAddressCity : thueB ? c.cnTsCity : '');
  add('THUE_MOI_SDT', thueA ? c.newPhone || sdtCty : thueB ? sdtCty : '');
  add('THUE_MOI_EMAIL', thueA ? c.newEmail : '');
  // Thuế – chỉ tiêu 1 (Giám đốc/Tổng giám đốc):
  //  - đổi người đại diện: điền người đại diện mới;
  //  - Mục B có cập nhật địa chỉ liên hệ của người đại diện hiện tại là Giám đốc/Tổng giám đốc: điền người đó (theo GPKD).
  const norm = (x: string) => (x || '').normalize('NFC').trim().toUpperCase().replace(/\s+/g, ' ');
  const laGiamDoc = (t: string) => !t.trim() || /giám đốc/i.test(t);
  const gdMoi = on.daiDien && laGiamDoc(c.newRep.title) ? c.newRep : null;
  const gdCapNhat = !gdMoi && cnLh.some((x) => norm(x.name) && norm(x.name) === norm(current.DAI_DIEN_TEN)) && laGiamDoc(current.DAI_DIEN_CHUC_DANH || '');
  add('GD_TEN', gdMoi ? gdMoi.name.toUpperCase() : gdCapNhat ? current.DAI_DIEN_TEN : '');
  add('GD_SINH_NGAY', gdMoi ? gdMoi.dob : gdCapNhat ? current.DAI_DIEN_SINH_NGAY : '');
  add('GD_GIOI_TINH', gdMoi ? gdMoi.gender : gdCapNhat ? current.DAI_DIEN_GIOI_TINH : '');
  add('GD_SO_GT', gdMoi ? gdMoi.idNumber : gdCapNhat ? current.DAI_DIEN_SO_GT : '');
  add('GD_SDT', gdMoi ? gdMoi.phone : gdCapNhat ? current.DAI_DIEN_SDT : '');
  add('TD_THUE', on.daiDien || thueA || thueB || gdCapNhat ? 'X' : '');

  // Thông báo thay đổi thông tin về chủ sở hữu hưởng lợi (Mẫu 12):
  //  - chọn mục 8: chỉ in đoạn a) hoặc b) đã chọn;
  //  - chỉ chọn "Thay đổi chủ sở hữu": in cả a) và b) như trước.
  const hl = on.chuHuongLoi;
  add('TB_HL', hl || on.chuSoHuu ? 'X' : '');
  add('TB_HL_A', hl ? (c.hlTB === 'a' ? 'X' : '') : on.chuSoHuu ? 'X' : '');
  add('TB_HL_B', hl ? (c.hlTB !== 'a' ? 'X' : '') : on.chuSoHuu ? 'X' : '');

  add('NGUOI_KY', nguoiKyMacDinh(c, current));

  // Quá 30 ngành: thêm cột ở cuối để không lệch vị trí
  them.slice(MAX_NGANH).forEach((x, i) => { add(`THEM_TEN_NGANH_${MAX_NGANH + i + 1}`, x.name); add(`THEM_MA_NGANH_${MAX_NGANH + i + 1}`, x.code); });
  rut.slice(MAX_NGANH).forEach((x, i) => { add(`RUT_TEN_NGANH_${MAX_NGANH + i + 1}`, x.name); add(`RUT_MA_NGANH_${MAX_NGANH + i + 1}`, x.code); });

  return { headers: cols.map(([k]) => k), values: cols.map(([, v]) => String(v ?? '')) };
};

/** Kiểm tra thiếu thông tin cho các trường hợp đã chọn. Trả về danh sách lỗi (rỗng = đủ). */
export const kiemTraThayDoi = (c: ChangeData, gpkd: { enterpriseCode?: string; name?: string; capital?: string }): string[] => {
  const err: string[] = [];
  if (!Object.values(c.cases).some(Boolean)) err.push('Chưa chọn trường hợp thay đổi nào.');
  if (!gpkd.name?.trim()) err.push('Chưa có tên doanh nghiệp (rút trích GPKD hoặc nhập tay).');
  if (!gpkd.enterpriseCode) err.push('Chưa có mã số doanh nghiệp (rút trích GPKD hoặc nhập tay).');
  if (c.cases.doiTen && !c.newName.trim()) err.push('Đổi tên: chưa nhập tên mới bằng tiếng Việt.');
  if (c.cases.diaChi && !(c.newAddressDetail.trim() && c.newAddressCity.trim())) err.push('Đổi địa chỉ: chưa nhập đủ địa chỉ mới.');
  if (c.cases.von && !digits(c.oldCapital || gpkd.capital || '')) err.push('Thay đổi vốn: chưa có vốn điều lệ đã đăng ký.');
  if (c.cases.von && !digits(c.newCapital)) err.push('Thay đổi vốn: chưa nhập vốn điều lệ mới.');
  if (c.cases.nganh && !c.addIndustries.length && !c.removeIndustries.length) err.push('Thay đổi ngành: chưa có ngành bổ sung hoặc rút bớt.');
  if (c.cases.daiDien && !c.newRep.name.trim()) err.push('Đổi người đại diện: chưa nhập họ tên người đại diện mới.');
  if (c.cases.chuSoHuu && !c.newOwner.name.trim()) err.push('Đổi chủ sở hữu: chưa nhập tên chủ sở hữu mới.');
  if (c.cases.capNhat) {
    if (!c.cnTruSo && !c.cnLienHe) err.push('Mục B: chưa chọn nội dung cập nhật.');
    if (c.cnTruSo && !(c.cnTsDetail.trim() && c.cnTsCity.trim())) err.push('Mục B: chưa nhập đủ địa chỉ trụ sở cập nhật.');
    if (c.cnLienHe && !c.cnNguoi.some((x) => x.name.trim())) err.push('Mục B: chưa có người cần cập nhật địa chỉ liên hệ.');
  }
  return err;
};

/**
 * Bản ghi trộn Word cho hồ sơ thay đổi = thông tin hiện tại (đủ cột như hồ sơ thành lập) + dòng dữ liệu thay đổi.
 * Thêm phần cho Giấy ủy quyền và Danh sách chủ sở hữu hưởng lợi:
 *  - DAI_DIEN_* = người ký hồ sơ (bên ủy quyền / người ký danh sách hưởng lợi);
 *  - CSH_HL_*   = chủ sở hữu hưởng lợi sau thay đổi (chủ sở hữu mới nếu đổi chủ sở hữu);
 *  - TS_TINH_TP = nơi ký (tỉnh/thành mới);
 *  - địa chỉ lấy theo địa chỉ liên hệ đã cập nhật ở Mục B nếu có.
 */
export const buildChangeWordRecord = (
  headers: string[], values: string[], c: ChangeData, currentFull: Record<string, string> = {}
): Record<string, string> => {
  const rec: Record<string, string> = {};
  for (const [k, v] of Object.entries(currentFull)) rec[k.toUpperCase()] = v ?? '';
  headers.forEach((h, i) => { rec[h.toUpperCase()] = values[i] ?? ''; });

  const norm = (x: string) => (x || '').normalize('NFC').trim().toUpperCase().replace(/\s+/g, ' ');
  const cnLh = c.cases.capNhat && c.cnLienHe ? c.cnNguoi.filter((x) => x.name.trim()) : [];
  const diaChiCapNhat = (ten: string) => cnLh.find((x) => norm(x.name) === norm(ten));
  const dat = (prefix: string, p: { ten: string; gioi: string; sinh: string; loai: string; so: string; ngay: string; noi: string; dc: string; px: string; tp: string; qg?: string }, dungDiaChiMoi = true) => {
    const cn = dungDiaChiMoi ? diaChiCapNhat(p.ten) : undefined;
    rec[`${prefix}_TEN`] = p.ten; rec[`${prefix}_GIOI_TINH`] = p.gioi; rec[`${prefix}_SINH_NGAY`] = p.sinh;
    rec[`${prefix}_LOAI_GT`] = p.loai; rec[`${prefix}_SO_GT`] = p.so; rec[`${prefix}_NGAY_CAP`] = p.ngay; rec[`${prefix}_NOI_CAP`] = p.noi;
    rec[`${prefix}_DIA_CHI`] = cn ? cn.detail : p.dc; rec[`${prefix}_PHUONG_XA`] = cn ? cn.ward : p.px; rec[`${prefix}_TINH_TP`] = cn ? cn.city : p.tp;
    if (p.qg !== undefined) rec[`${prefix}_QUOC_GIA`] = p.qg;
  };
  const tuChu = () => ({ ten: rec.CHU_TEN, gioi: rec.CHU_GIOI_TINH, sinh: rec.CHU_SINH_NGAY, loai: rec.CHU_LOAI_GT, so: rec.CHU_MS_SO_GT,
    ngay: rec.CHU_NGAY_CAP, noi: rec.CHU_NOI_CAP, dc: rec.CHU_DIA_CHI, px: rec.CHU_PHUONG_XA, tp: rec.CHU_TINH_TP, qg: 'Việt Nam' });
  const tuDaiDien = () => ({ ten: rec.DAI_DIEN_TEN, gioi: rec.DAI_DIEN_GIOI_TINH, sinh: rec.DAI_DIEN_SINH_NGAY, loai: rec.DAI_DIEN_LOAI_GT,
    so: rec.DAI_DIEN_SO_GT, ngay: rec.DAI_DIEN_NGAY_CAP, noi: rec.DAI_DIEN_NOI_CAP, dc: rec.DAI_DIEN_DIA_CHI, px: rec.DAI_DIEN_PHUONG_XA, tp: rec.DAI_DIEN_TINH_TP });

  const daiDienGoc = tuDaiDien();

  // Người ký hồ sơ -> DAI_DIEN_* (Giấy ủy quyền, chữ ký danh sách hưởng lợi).
  // Giấy ủy quyền ký theo thông tin ĐANG đăng ký, nên giữ địa chỉ cũ (không lấy địa chỉ cập nhật ở Mục B).
  const ky = norm(rec.NGUOI_KY);
  if (ky && ky === norm(rec.CHU_TEN) && rec.CHU_LOAI !== 'Tổ chức') dat('DAI_DIEN', tuChu(), false);
  else if (ky && ky === norm(rec.DAI_DIEN_TEN)) dat('DAI_DIEN', tuDaiDien(), false);
  else if (ky) dat('DAI_DIEN', { ten: rec.NGUOI_KY, gioi: '', sinh: '', loai: '', so: '', ngay: '', noi: '', dc: '', px: '', tp: '' });

  // Chủ sở hữu hưởng lợi
  const tuNguoi = (o: PersonInfo) => ({ ten: o.name.toUpperCase(), gioi: o.gender, sinh: o.dob, loai: loaiGiayTo(o.idNumber, o.idType), so: o.idNumber,
    ngay: o.idDate, noi: o.idPlace, dc: o.addressDetail, px: o.addressWard, tp: o.addressCity, qg: o.country || 'Việt Nam' });
  const trong = { ten: '', gioi: '', sinh: '', loai: '', so: '', ngay: '', noi: '', dc: '', px: '', tp: '', qg: '' };
  const nguon = c.hlNguon || 'chu';
  if (nguon === 'khac') {
    dat('CSH_HL', c.hl.name.trim() ? tuNguoi(c.hl) : trong);
  } else if (nguon === 'daiDien') {
    if (c.cases.daiDien && c.newRep.name.trim()) dat('CSH_HL', tuNguoi(c.newRep));
    else dat('CSH_HL', daiDienGoc.ten ? { ...daiDienGoc, qg: 'Việt Nam' } : trong);
  } else if (c.cases.chuSoHuu) {
    dat('CSH_HL', c.newOwnerType === 'individual' && c.newOwner.name.trim() ? tuNguoi(c.newOwner) : trong);
  } else if (rec.CHU_LOAI !== 'Tổ chức' && rec.CHU_TEN) {
    dat('CSH_HL', tuChu());
  } else {
    dat('CSH_HL', trong);
  }

  // Nơi ký theo tỉnh/thành mới
  if (rec.NOI_KY) rec.TS_TINH_TP = rec.NOI_KY;
  return rec;
};
