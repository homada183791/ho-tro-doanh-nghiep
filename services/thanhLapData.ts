import type { BusinessInfo } from '../types';

/** Đổi tên tỉnh đã lên thành phố trực thuộc trung ương: "Tỉnh Đồng Nai" -> "Thành phố Đồng Nai" (từ 30/4/2026). */
export const tenTinhMoi = (s: string) => s.replace(/Tỉnh\s+Đồng\s+Nai/gi, 'Thành phố Đồng Nai');

/**
 * Dòng trộn thư (tên cột -> giá trị) cho hồ sơ thành lập mới, lấy từ thông tin trên form.
 * Tách khỏi DocumentGenerator để dùng lại (hồ sơ thay đổi, tạm ngừng) và chạy thử ngoài trình duyệt.
 */
export const buildThanhLapRow = (info: BusinessInfo) => {
  const getIdDocumentType = (idNumber?: string, extractedType?: string, isOrg?: boolean) => {
      if (!idNumber) return "";
      if (isOrg) return "";
      
      // If AI successfully extracted the specific type, use it
      if (extractedType && (
          extractedType === "Căn cước công dân" || 
          extractedType === "Căn cước" || 
          extractedType === "Hộ chiếu Việt Nam" || 
          extractedType === "Hộ chiếu nước ngoài"
      )) {
          return extractedType;
      }

      // Fallback logic based on ID number format
      const cleaned = idNumber.trim().toUpperCase();
      if (/^[A-Z]\d{7}$/.test(cleaned)) {
          return "Hộ chiếu Việt Nam";
      }
      if (/[A-Z]/.test(cleaned)) {
          return "Hộ chiếu nước ngoài";
      }
      
      // If it's 12 digits, we can try to guess based on issue date if available, 
      // but without date, we default to CCCD as it's most common for 12 digits.
      // 9 digits is CMND.
      if (cleaned.length === 12) {
          // We can't definitively tell CCCD vs CC just from the 12-digit number without the issue date.
          // However, the prompt specifically asks for "Căn cước công dân" or "Căn cước".
          // If the AI didn't catch it, we default to "Căn cước công dân" as it's the majority currently.
          return "Căn cước công dân";
      }
      
      if (cleaned.length === 9) {
          return "Chứng minh nhân dân";
      }

      return "Căn cước công dân"; // Default fallback instead of combined string
  };

  // 1. Prepare Data for Mail Merge (Horizontal Format)
  
  // Process Date
  let dateFull = "";
  let day = "", month = "", year = "";
  if (info.docDate) {
       const parts = info.docDate.split('-');
       if (parts.length === 3) {
           day = parts[2];
           month = parts[1];
           year = parts[0];
           dateFull = `ngày ${day} tháng ${month} năm ${year}`;
       }
  }

  // Process Owner Info based on Type
  let chuTen = info.companyOwner;
  let chuSoGT = info.ownerIdNumber;
  let chuNgayCap = info.ownerIdDate;
  let chuNoiCap = info.ownerIdPlace;
  let chuDiaChi = info.ownerAddressDetail;
  let chuPhuong = info.ownerAddressWard;
  let chuTinh = info.ownerAddressCity;
  let chuGioiTinh = info.ownerGender || "";
  let chuSinhNgay = info.ownerDob || "";
  let chuSDT = info.ownerPhone || "";
  let chuLoaiGT = getIdDocumentType(info.ownerIdNumber, info.ownerIdDocumentType, false);

  // Prepare Authorized Representative Data (UQ_*)
  let uqTen = "", uqSoGT = "", uqNgayCap = "", uqNoiCap = "";
  let uqDiaChi = "", uqPhuong = "", uqTinh = "", uqQuocGia = "";
  let uqSinhNgay = "", uqSDT = "", uqGioiTinh = "", uqLoaiGT = "";

  // Prepare Beneficial Owner Data (CSH_HL_*)
  let cshHlTen = "", cshHlSoGT = "", cshHlNgayCap = "", cshHlNoiCap = "";
  let cshHlDiaChi = "", cshHlPhuong = "", cshHlTinh = "", cshHlQuocGia = "";
  let cshHlSinhNgay = "", cshHlGioiTinh = "", cshHlLoaiGT = "";

  if (info.ownerType === 'organization') {
      // If organization, CHU_* fields contain Org info
      chuTen = info.ownerOrgName;
      chuSoGT = info.ownerOrgCode;
      chuNgayCap = info.ownerOrgIssueDate;
      chuNoiCap = info.ownerOrgIssuePlace;
      chuDiaChi = info.ownerOrgAddressDetail;
      chuPhuong = info.ownerOrgAddressWard;
      chuTinh = info.ownerOrgAddressCity;
      chuGioiTinh = "";
      chuSinhNgay = "";
      chuSDT = "";
      chuLoaiGT = "";

      // And UQ_* fields contain Auth Rep info (from the person fields)
      uqTen = info.companyOwner;
      uqSoGT = info.ownerIdNumber;
      uqNgayCap = info.ownerIdDate;
      uqNoiCap = info.ownerIdPlace;
      uqDiaChi = info.ownerAddressDetail;
      uqPhuong = info.ownerAddressWard;
      uqTinh = info.ownerAddressCity;
      uqQuocGia = info.ownerAddressCountry;
      uqSinhNgay = info.ownerDob;
      uqSDT = info.ownerPhone;
      uqGioiTinh = info.ownerGender || "";
      uqLoaiGT = getIdDocumentType(info.ownerIdNumber, info.ownerIdDocumentType, false);

      // And CSH_HL_* fields contain Beneficial Owner info
      cshHlTen = info.beneficialOwnerName || "";
      cshHlSoGT = info.beneficialOwnerIdNumber || "";
      cshHlNgayCap = info.beneficialOwnerIdDate || "";
      cshHlNoiCap = info.beneficialOwnerIdPlace || "";
      cshHlDiaChi = info.beneficialOwnerAddressDetail || "";
      cshHlPhuong = info.beneficialOwnerAddressWard || "";
      cshHlTinh = info.beneficialOwnerAddressCity || "";
      cshHlQuocGia = info.beneficialOwnerAddressCountry || "";
      cshHlSinhNgay = info.beneficialOwnerDob || "";
      cshHlGioiTinh = info.beneficialOwnerGender || "";
      cshHlLoaiGT = getIdDocumentType(info.beneficialOwnerIdNumber, info.beneficialOwnerIdDocumentType, false);
  }

  // Chủ sở hữu là cá nhân: chủ sở hữu hưởng lợi chính là người đó (sở hữu 100% vốn điều lệ)
  if (info.ownerType !== 'organization') {
      cshHlTen = chuTen || "";
      cshHlGioiTinh = chuGioiTinh;
      cshHlSinhNgay = chuSinhNgay;
      cshHlLoaiGT = chuLoaiGT;
      cshHlSoGT = chuSoGT || "";
      cshHlNgayCap = chuNgayCap || "";
      cshHlNoiCap = chuNoiCap || "";
      cshHlDiaChi = chuDiaChi || "";
      cshHlPhuong = chuPhuong || "";
      cshHlTinh = chuTinh || "";
      cshHlQuocGia = info.ownerAddressCountry || "Việt Nam";
  }

  // Ngành nghề: luôn đủ 30 cặp cột TEN_NGANH_n / MA_NGANH_n như file mẫu MailMerge_Data_30nganh.xlsx
  const MAX_NGANH = 30;
  const industryList: { name: string; code: string }[] =
      info.industryCodes && info.industryCodes.length > 0
          ? info.industryCodes.map(c => ({ name: c.name, code: c.code }))
          : [
              ...(info.industry ? [{ name: info.industry, code: "" }] : []),
              ...(info.subIndustries ? [{ name: info.subIndustries, code: "" }] : []),
            ];
  const industryHeaders: string[] = [];
  const industryValues: string[] = [];
  for (let i = 0; i < MAX_NGANH; i++) {
      industryHeaders.push(`TEN_NGANH_${i + 1}`, `MA_NGANH_${i + 1}`);
      industryValues.push(industryList[i]?.name || "", industryList[i]?.code || "");
  }
  // Mã ngành chính (cột NGANH_CHINH)
  const nganhChinh = info.industryCodes?.find(c => c.isMain)?.code || "";
  // Quá 30 ngành: thêm cột ở cuối bảng để không làm lệch vị trí các cột theo mẫu
  const extraHeaders: string[] = [];
  const extraValues: string[] = [];
  industryList.slice(MAX_NGANH).forEach((c, i) => {
      extraHeaders.push(`TEN_NGANH_${MAX_NGANH + i + 1}`, `MA_NGANH_${MAX_NGANH + i + 1}`);
      extraValues.push(c.name, c.code);
  });

  // Header Row (Standardized Field Names)
  const headers = [
      // Thông tin chung
      "CQ_DK_KD", "NGAY_THANG_NAM", "NGAY", "THANG", "NAM",
      "LOAI_HINH", "TEN_TV", "TEN_TA", "TEN_VT",
      "VON_SO", "VON_CHU",
      // Trụ sở chính
      "TS_DIA_CHI", "TS_PHUONG_XA", "TS_TINH_TP", "TS_QUOC_GIA", "TS_FULL",
      "DT_CTY", "EMAIL", "WEBSITE",
      // Ngành nghề (30 cặp cột cố định) + mã ngành chính
      ...industryHeaders,
      "NGANH_CHINH",
      // Chủ sở hữu
      "CHU_LOAI", "CHU_TEN", "CHU_GIOI_TINH", "CHU_SINH_NGAY", "CHU_LOAI_GT", "CHU_MS_SO_GT", "CHU_NGAY_CAP", "CHU_NOI_CAP",
      "CHU_DIA_CHI", "CHU_PHUONG_XA", "CHU_TINH_TP", "CHU_SDT",
      // Người đại diện theo ủy quyền (Chỉ dùng khi chủ sở hữu là tổ chức)
      "UQ_TEN", "UQ_GIOI_TINH", "UQ_SINH_NGAY", "UQ_LOAI_GT", "UQ_SO_GT", "UQ_NGAY_CAP", "UQ_NOI_CAP",
      "UQ_DIA_CHI", "UQ_PHUONG_XA", "UQ_TINH_TP", "UQ_QUOC_GIA",
      "UQ_SDT",
      // Chủ sở hữu hưởng lợi (Chỉ dùng khi chủ sở hữu là tổ chức)
      "CSH_HL_TEN", "CSH_HL_GIOI_TINH", "CSH_HL_SINH_NGAY", "CSH_HL_LOAI_GT", "CSH_HL_SO_GT", "CSH_HL_NGAY_CAP", "CSH_HL_NOI_CAP",
      "CSH_HL_DIA_CHI", "CSH_HL_PHUONG_XA", "CSH_HL_TINH_TP", "CSH_HL_QUOC_GIA",
      // Người đại diện
      "DAI_DIEN_TEN", "DAI_DIEN_GIOI_TINH", "DAI_DIEN_CHUC_DANH", "DAI_DIEN_SINH_NGAY", "DAI_DIEN_LOAI_GT", "DAI_DIEN_SO_GT", 
      "DAI_DIEN_NGAY_CAP", "DAI_DIEN_NOI_CAP",
      "DAI_DIEN_DIA_CHI", "DAI_DIEN_PHUONG_XA", "DAI_DIEN_TINH_TP", "DAI_DIEN_QUOC_TICH", "DAI_DIEN_SDT",
      // Thuế
      "GD_SDT", "SO_LAO_DONG", "KY_CHUC_DANH",
      "THUE_DIA_CHI", "THUE_PHUONG_XA", "THUE_TINH_TP", "THUE_SDT", "THUE_EMAIL",
      // Ngành thứ 31 trở đi (nếu có)
      ...extraHeaders
  ];

  const exportCapital = info.capital ? info.capital.replace(/đồng/gi, '').trim() : '';
  const values = [
      // Thông tin chung
      info.registrationOffice, dateFull, day, month, year,
      info.type, info.name, info.nameEn, info.nameAbbr,
      exportCapital, info.capitalInWords,
      // Trụ sở chính
      info.addressDetail, info.addressWard, info.addressCity, info.addressCountry, 
      `${info.addressDetail}, ${info.addressWard}, ${info.addressCity}, ${info.addressCountry}`,
      info.phone, info.email, info.website,
      // Ngành nghề (30 cặp cột cố định) + mã ngành chính
      ...industryValues,
      nganhChinh,
      // Chủ sở hữu
      info.ownerType === 'individual' ? 'Cá nhân' : 'Tổ chức',
      chuTen, chuGioiTinh, chuSinhNgay, chuLoaiGT, chuSoGT, chuNgayCap, chuNoiCap,
      chuDiaChi, chuPhuong, chuTinh, chuSDT,
      // Người đại diện theo ủy quyền
      uqTen, uqGioiTinh, uqSinhNgay, uqLoaiGT, uqSoGT, uqNgayCap, uqNoiCap,
      uqDiaChi, uqPhuong, uqTinh, uqQuocGia,
      uqSDT,
      // Chủ sở hữu hưởng lợi
      cshHlTen, cshHlGioiTinh, cshHlSinhNgay, cshHlLoaiGT, cshHlSoGT, cshHlNgayCap, cshHlNoiCap,
      cshHlDiaChi, cshHlPhuong, cshHlTinh, cshHlQuocGia,
      // Người đại diện
      info.ownerName, info.repGender || "", info.repTitle, info.repDob, getIdDocumentType(info.repIdNumber, info.repIdDocumentType, false), info.repIdNumber,
      info.repIdDate, info.repIdPlace,
      info.repAddressDetail, info.repAddressWard, info.repAddressCity, info.repAddressCountry || "", info.repPhone || "",
      // Thuế: SĐT Giám đốc (mục 10.1, Giám đốc = người đại diện), tổng số lao động dự kiến (mặc định 01)
      (info.gdPhone || '').trim() || info.repPhone || "", (info.soLaoDong || '').trim() || "01", "NGƯỜI ĐẠI DIỆN THEO PHÁP LUẬT",
      info.taxAddressDetail, info.taxAddressWard, info.taxAddressCity, info.taxPhone, info.taxEmail,
      // Ngành thứ 31 trở đi (nếu có)
      ...extraValues
  ].map(v => tenTinhMoi(v === undefined || v === null ? "" : String(v)));

  return { headers, values, industryCount: industryList.length, extraCount: extraHeaders.length / 2 };
};
