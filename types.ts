
import React from 'react';

export interface IndustryCode {
  code: string;
  name: string;
  isMain: boolean;
}

export interface IdCardImages {
  front?: { base64: string; mimeType: string };
  back?: { base64: string; mimeType: string };
  // New field to support multiple files (e.g., Auth Rep ID Front + Back)
  extras?: { base64: string; mimeType: string }[];
}

export interface BusinessInfo {
  registrationOffice: string; // Cơ quan đăng ký kinh doanh (Kính gửi)
  name: string;
  nameEn: string;   // Tên tiếng Anh
  nameAbbr: string; // Tên viết tắt
  capital: string;
  capitalInWords: string; // Vốn điều lệ bằng chữ
  type: string;
  industry: string;      // Ngành nghề chính
  subIndustries: string; // Ngành nghề phụ (Tất cả ngành nghề khác)
  industryCodes: IndustryCode[]; // Danh sách mã ngành phân tích
  docDate: string; // YYYY-MM-DD format

  // Contact Info (Company Level)
  phone: string;
  email: string;
  website: string;

  // Address Details (Headquarters)
  addressDetail: string;   // Số nhà, tên đường/phố/thôn/xóm
  addressWard: string;     // Phường/Xã/Thị trấn
  addressCity: string;     // Tỉnh/Thành phố trực thuộc TW
  addressCountry: string;  // Mặc định: Việt Nam

  // Owner Type
  ownerType: 'individual' | 'organization';

  // Organization Specifics (If ownerType === 'organization')
  ownerOrgName: string;
  ownerOrgCode: string; // MSDN / So QD
  ownerOrgIssueDate: string;
  ownerOrgIssuePlace: string;
  ownerOrgAddressDetail: string;
  ownerOrgAddressWard: string;
  ownerOrgAddressCity: string;
  ownerOrgAddressCountry: string;

  // Company Owner Details (If Individual) OR Authorized Rep Details (If Organization)
  companyOwner: string; // Name
  ownerPhone: string;   // SĐT Cá nhân của Chủ sở hữu hoặc Người đại diện theo ủy quyền
  ownerDob: string;
  ownerIdNumber: string; // CMND/CCCD/Passport
  ownerIdDate: string;
  ownerIdPlace: string;
  ownerIdDocumentType?: string; // NEW: Căn cước công dân / Căn cước / Hộ chiếu
  
  // Owner/Auth Rep Address Structured
  ownerAddressDetail: string;
  ownerAddressWard: string;
  ownerAddressCity: string;
  ownerAddressCountry: string;

  // NEW: Organization Legal Representative Details (Người đại diện pháp luật CỦA TỔ CHỨC CHỦ SỞ HỮU)
  // Used for "Beneficial Owner" mapping
  orgLegalRepName?: string;
  orgLegalRepIdNumber?: string;
  orgLegalRepDob?: string;
  orgLegalRepIdDate?: string;
  orgLegalRepIdPlace?: string;
  orgLegalRepIdDocumentType?: string; // NEW: Căn cước công dân / Căn cước / Hộ chiếu
  orgLegalRepAddressDetail?: string;
  orgLegalRepAddressWard?: string;
  orgLegalRepAddressCity?: string;
  orgLegalRepAddressCountry?: string;

  // Legal Representative Details (Người đại diện pháp luật - Director of NEW Company)
  ownerName: string; // Legal Rep Name
  repPhone: string;  // SĐT Cá nhân của Người đại diện pháp luật
  repTitle: string;  // Chức danh (Giám đốc / Tổng giám đốc)
  repDob: string;
  repIdNumber: string;
  repIdDate: string;
  repIdPlace: string;
  repIdDocumentType?: string; // NEW: Căn cước công dân / Căn cước / Hộ chiếu

  // Rep Address Structured
  repAddressDetail: string;
  repAddressWard: string;
  repAddressCity: string;
  repAddressCountry: string;

  ownerGender?: string;
  repGender?: string;
  beneficialOwnerGender?: string;
  orgLegalRepGender?: string;

  ownerIdCard?: IdCardImages; // CCCD Owner/Auth Rep
  repIdCard?: IdCardImages;   // CCCD Legal Rep

  // Beneficial Owner (Chủ sở hữu hưởng lợi - Only for Organization Owner)
  beneficialOwnerType?: 'auth_rep' | 'legal_rep_org' | 'other'; // Loại: Đại diện ủy quyền | ĐDPL của tổ chức | Khác
  beneficialOwnerName?: string;
  beneficialOwnerDob?: string;
  beneficialOwnerIdNumber?: string;
  beneficialOwnerIdDate?: string;
  beneficialOwnerIdPlace?: string;
  beneficialOwnerIdDocumentType?: string; // NEW: Căn cước công dân / Căn cước / Hộ chiếu
  beneficialOwnerAddressDetail?: string;
  beneficialOwnerAddressWard?: string;
  beneficialOwnerAddressCity?: string;
  beneficialOwnerAddressCountry?: string;

  // Tax Information
  taxAddressDetail?: string;
  taxAddressWard?: string;
  taxAddressCity?: string;
  taxAddressCountry?: string;
  taxPhone?: string;
  taxEmail?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
}

export enum ModelType {
  FLASH = 'gemini-3-flash-preview',
  PRO = 'gemini-3-pro-preview'
}

export type ImageSize = '1K' | '2K' | '4K';

export interface ImageSettings {
  prompt: string;
  size: ImageSize;
  aspectRatio: '1:1' | '16:9' | '9:16' | '3:4' | '4:3';
}

export interface GeneratedDocument {
  title: string;
  content: string; // Markdown content
}

export interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
}
