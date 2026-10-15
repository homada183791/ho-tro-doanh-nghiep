
import React, { useState, useEffect } from 'react';
import { BusinessInfo } from '../types';
import { analyzeBusinessInput, extractIdCardInfo, updateAdministrativeDivisions, lookupIndustryCodes, suggestRelatedIndustryCodes, translateBusinessName, lookupWard } from '../services/gemini';
import { aiErrorMessage } from '../services/aiClient';

/** Báo lỗi kèm lý do thật (hết lượt, sai key, mất mạng...) thay vì câu chung chung. */
const showAiError = (title: string, e: unknown) => {
  console.error(title, e);
  alert(`${title}\n\nLý do: ${aiErrorMessage(e)}`);
};

/**
 * AI có thể viết loại hình theo nhiều cách ("TNHH MTV", "Công ty TNHH một thành viên"...).
 * Đưa về đúng 1 trong các loại hình của app, nếu không nhận ra thì trả null (giữ loại hình đang chọn).
 */
const normalizeCompanyType = (t?: string): string | null => {
  if (!t) return null;
  const s = t.toLowerCase().normalize('NFC');
  if (/cổ phần|co phan|\bjsc\b/.test(s)) return 'Công ty Cổ phần';
  if (/tư nhân|tu nhan|\bdntn\b/.test(s)) return 'Doanh nghiệp tư nhân';
  if (/hộ kinh doanh|ho kinh doanh|\bhkd\b/.test(s)) return 'Hộ kinh doanh';
  if (/tnhh|trách nhiệm hữu hạn|trach nhiem huu han|\bllc\b/.test(s)) {
    if (/(2|hai)\s*(tv|thành viên|thanh vien)|trở lên|tro len|nhiều thành viên/.test(s)) return 'Công ty TNHH 2 Thành viên trở lên';
    return 'Công ty TNHH 1 Thành viên';
  }
  return null;
};

/** Kiểu chủ sở hữu: AI có thể trả "Cá nhân"/"Tổ chức" thay vì individual/organization. */
const normalizeOwnerType = (t?: string): 'individual' | 'organization' | null => {
  if (!t) return null;
  const s = t.toLowerCase();
  if (/organi|tổ chức|to chuc|công ty|pháp nhân/.test(s)) return 'organization';
  if (/individual|cá nhân|ca nhan|person/.test(s)) return 'individual';
  return null;
};

/** AI trả về nhưng không đọc được trường nào -> báo cho người dùng thay vì im lặng. */
const warnIfEmpty = (extracted: Record<string, any>, mode: 'person' | 'organization') => {
  const keys = mode === 'person'
    ? ['name', 'dob', 'idNumber', 'idDate', 'idPlace']
    : ['name', 'orgName', 'idNumber', 'orgCode', 'authRepName', 'authRepIdNumber', 'orgLegalRepName'];
  if (!keys.some((k) => extracted?.[k])) {
    alert('AI không đọc được thông tin nào từ ảnh. Thử ảnh rõ hơn, chụp thẳng, đủ 4 góc; hoặc đổi sang model đọc ảnh tốt hơn (ví dụ Google Gemini) trong "Cài đặt API".');
  }
};
import { Upload, FileType, CheckCircle, Loader2, Download, Copy, FileText, Sparkles, ArrowLeft, PlusCircle, FilePenLine, Calendar, User, Users, PieChart, Briefcase, Store, IdCard, MapPin, Building2, UserCircle2, RefreshCw, Search, BookOpen, Globe, Mail, Phone, Landmark, Keyboard, Image as ImageIcon, ScanLine, Link, FileSpreadsheet, ExternalLink, Receipt, Files, Crown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import * as XLSX from 'xlsx';

type TaskType = 'new' | 'change';
type Step = 'task' | 'type' | 'form';

// Danh sách 34 Phòng Đăng ký kinh doanh thuộc Sở Tài chính theo tài liệu PDF
const REGISTRATION_OFFICES = [
  "Phòng Đăng ký Kinh doanh Sở Tài chính Thành phố Cần Thơ",
  "Phòng Doanh nghiệp và Đăng ký Kinh doanh Sở Tài chính Thành phố Đà Nẵng",
  "Phòng Đăng ký Kinh doanh và Tài chính Doanh nghiệp Sở Tài chính Thành phố Hà Nội",
  "Phòng Đăng ký Kinh doanh và Quản lý Doanh nghiệp Sở Tài chính Thành phố Hải Phòng",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Thành phố Hồ Chí Minh",
  "Phòng Doanh nghiệp – Hợp tác Đầu tư Sở Tài chính Tỉnh An Giang",
  "Phòng Đăng ký Kinh doanh và Quản lý Doanh nghiệp Sở Tài chính Tỉnh Bắc Ninh",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Cà Mau",
  "Phòng Quản lý Doanh nghiệp – Đăng ký Kinh doanh Sở Tài chính Tỉnh Cao Bằng",
  "Phòng Quản lý Doanh nghiệp Sở Tài chính Tỉnh Đắk Lắk",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Điện Biên",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Đồng Nai",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Đồng Tháp",
  "Phòng Doanh nghiệp và Kinh tế Tập thể Sở Tài chính Tỉnh Gia Lai",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Hà Tĩnh",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Hưng Yên",
  "Phòng Quản lý Doanh nghiệp Sở Tài chính Tỉnh Khánh Hòa",
  "Phòng Quản lý Doanh nghiệp và Đăng ký Kinh doanh Sở Tài chính Tỉnh Lai Châu",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Lạng Sơn",
  "Phòng Doanh nghiệp Sở Tài chính Tỉnh Lào Cai",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Lâm Đồng",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Nghệ An",
  "Phòng Doanh nghiệp Sở Tài chính Tỉnh Ninh Bình",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Phú Thọ",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Quảng Ngãi",
  "Phòng Quản lý Doanh nghiệp và Đăng ký Kinh doanh Sở Tài chính Tỉnh Quảng Ninh",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Quảng Trị",
  "Phòng Quản lý Doanh nghiệp và Đăng ký Kinh doanh Sở Tài chính Tỉnh Sơn La",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Tây Ninh",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Thái Nguyên",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Tỉnh Thanh Hóa",
  "Phòng Đăng ký Kinh doanh Sở Tài chính Thành phố Huế",
  "Phòng Doanh nghiệp và Đăng ký Kinh doanh Sở Tài chính Tỉnh Tuyên Quang",
  "Phòng Phát triển Doanh nghiệp và Kinh tế Tập thể Sở Tài chính Tỉnh Vĩnh Long"
];

const DocumentGenerator: React.FC = () => {
  const [step, setStep] = useState<Step>('task');
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  
  const [info, setInfo] = useState<BusinessInfo>({
    registrationOffice: '',
    name: '',
    nameEn: '',
    nameAbbr: '',
    capital: '',
    capitalInWords: '',
    type: 'Công ty TNHH 1 Thành viên',
    industry: '',
    subIndustries: '',
    industryCodes: [],
    docDate: new Date().toISOString().split('T')[0],
    
    phone: '',
    email: '',
    website: '',

    addressDetail: '',
    addressWard: '',
    addressCity: '',
    addressCountry: 'Việt Nam',

    ownerType: 'individual',

    ownerOrgName: '',
    ownerOrgCode: '',
    ownerOrgIssueDate: '',
    ownerOrgIssuePlace: '',
    ownerOrgAddressDetail: '',
    ownerOrgAddressWard: '',
    ownerOrgAddressCity: '',
    ownerOrgAddressCountry: 'Việt Nam',

    companyOwner: '',
    ownerPhone: '',
    ownerDob: '',
    ownerIdNumber: '',
    ownerIdDate: '',
    ownerIdPlace: '',
    ownerAddressDetail: '',
    ownerAddressWard: '',
    ownerAddressCity: '',
    ownerAddressCountry: 'Việt Nam',

    // Initialize hidden Org Legal Rep fields
    orgLegalRepName: '',
    orgLegalRepIdNumber: '',
    orgLegalRepDob: '',
    orgLegalRepIdDate: '',
    orgLegalRepIdPlace: '',
    orgLegalRepAddressDetail: '',
    orgLegalRepAddressWard: '',
    orgLegalRepAddressCity: '',
    orgLegalRepAddressCountry: 'Việt Nam',

    ownerGender: '',
    repGender: '',
    beneficialOwnerGender: '',
    orgLegalRepGender: '',

    ownerName: '', 
    repPhone: '',
    repTitle: '', 
    repDob: '',
    repIdNumber: '',
    repIdDate: '',
    repIdPlace: '',
    repAddressDetail: '',
    repAddressWard: '',
    repAddressCity: '',
    repAddressCountry: 'Việt Nam',
    
    ownerIdCard: {},
    repIdCard: {},

    beneficialOwnerType: 'auth_rep',
    beneficialOwnerName: '',
    beneficialOwnerDob: '',
    beneficialOwnerIdNumber: '',
    beneficialOwnerIdDate: '',
    beneficialOwnerIdPlace: '',
    beneficialOwnerAddressDetail: '',
    beneficialOwnerAddressWard: '',
    beneficialOwnerAddressCity: '',
    beneficialOwnerAddressCountry: 'Việt Nam',

    taxAddressDetail: '',
    taxAddressWard: '',
    taxAddressCity: '',
    taxAddressCountry: 'Việt Nam',
    taxPhone: '',
    taxEmail: '',
  });

  const [useHQAddress, setUseHQAddress] = useState({ owner: false, rep: false, tax: true });
  const [updatingAddress, setUpdatingAddress] = useState<Record<string, boolean>>({});
  const [lookingUpWard, setLookingUpWard] = useState<Record<string, boolean>>({});
  const [isLookingUpCodes, setIsLookingUpCodes] = useState(false);
  const [isSuggestingCodes, setIsSuggestingCodes] = useState(false);
  const [isAutoSyncingOffice, setIsAutoSyncingOffice] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  
  const [idInputMethod, setIdInputMethod] = useState<{ owner: 'image' | 'manual'; rep: 'image' | 'manual' }>({
    owner: 'image',
    rep: 'image'
  });

  const [rawInput, setRawInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractingId, setExtractingId] = useState({ owner: false, rep: false });
  
  const [sampleFile, setSampleFile] = useState<{ name: string; base64: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const businessTypes = [
    { id: 'Công ty TNHH 1 Thành viên', label: 'Công ty TNHH 1 Thành viên', icon: User, desc: 'Do 1 cá nhân hoặc tổ chức làm chủ sở hữu.' },
    { id: 'Công ty TNHH 2 Thành viên trở lên', label: 'Công ty TNHH 2 TV trở lên', icon: Users, desc: 'Từ 2 đến 50 thành viên góp vốn.' },
    { id: 'Công ty Cổ phần', label: 'Công ty Cổ phần', icon: PieChart, desc: 'Vốn chia thành cổ phần, tối thiểu 3 cổ đông.' },
    { id: 'Doanh nghiệp tư nhân', label: 'Doanh nghiệp tư nhân', icon: Briefcase, desc: 'Do 1 cá nhân làm chủ, chịu trách nhiệm vô hạn.' },
    { id: 'Hộ kinh doanh', label: 'Hộ kinh doanh', icon: Store, desc: 'Kinh doanh nhỏ lẻ, hộ gia đình.' },
  ];

  useEffect(() => {
    setInfo(prev => {
      let next = { ...prev };
      let changed = false;
      
      if (useHQAddress.owner) {
        if (next.ownerAddressDetail !== prev.addressDetail) { next.ownerAddressDetail = prev.addressDetail; changed = true; }
        if (next.ownerAddressWard !== prev.addressWard) { next.ownerAddressWard = prev.addressWard; changed = true; }
        if (next.ownerAddressCity !== prev.addressCity) { next.ownerAddressCity = prev.addressCity; changed = true; }
        if (next.ownerAddressCountry !== prev.addressCountry) { next.ownerAddressCountry = prev.addressCountry; changed = true; }
      }
      
      if (useHQAddress.rep) {
        if (next.repAddressDetail !== prev.addressDetail) { next.repAddressDetail = prev.addressDetail; changed = true; }
        if (next.repAddressWard !== prev.addressWard) { next.repAddressWard = prev.addressWard; changed = true; }
        if (next.repAddressCity !== prev.addressCity) { next.repAddressCity = prev.addressCity; changed = true; }
        if (next.repAddressCountry !== prev.addressCountry) { next.repAddressCountry = prev.addressCountry; changed = true; }
      }

      if (useHQAddress.tax) {
        if (next.taxAddressDetail !== prev.addressDetail) { next.taxAddressDetail = prev.addressDetail; changed = true; }
        if (next.taxAddressWard !== prev.addressWard) { next.taxAddressWard = prev.addressWard; changed = true; }
        if (next.taxAddressCity !== prev.addressCity) { next.taxAddressCity = prev.addressCity; changed = true; }
        if (next.taxAddressCountry !== prev.addressCountry) { next.taxAddressCountry = prev.addressCountry; changed = true; }
      }
      
      // Auto-fill Beneficial Owner if type matches
      if (next.ownerType === 'organization') {
          if (next.beneficialOwnerType === 'auth_rep') {
              next.beneficialOwnerName = next.companyOwner;
              next.beneficialOwnerGender = next.ownerGender || '';
              next.beneficialOwnerDob = next.ownerDob;
              next.beneficialOwnerIdNumber = next.ownerIdNumber;
              next.beneficialOwnerIdDate = next.ownerIdDate;
              next.beneficialOwnerIdPlace = next.ownerIdPlace;
              next.beneficialOwnerAddressDetail = next.ownerAddressDetail;
              next.beneficialOwnerAddressWard = next.ownerAddressWard;
              next.beneficialOwnerAddressCity = next.ownerAddressCity;
              next.beneficialOwnerAddressCountry = next.ownerAddressCountry;
              changed = true;
          } else if (next.beneficialOwnerType === 'legal_rep_org') {
              // Map from Organization Legal Representative fields (extracted from Business Registration Cert)
              next.beneficialOwnerName = next.orgLegalRepName || '';
              next.beneficialOwnerGender = next.orgLegalRepGender || '';
              next.beneficialOwnerIdNumber = next.orgLegalRepIdNumber || '';
              next.beneficialOwnerDob = next.orgLegalRepDob || '';
              next.beneficialOwnerIdDate = next.orgLegalRepIdDate || '';
              next.beneficialOwnerIdPlace = next.orgLegalRepIdPlace || '';
              next.beneficialOwnerAddressDetail = next.orgLegalRepAddressDetail || '';
              next.beneficialOwnerAddressWard = next.orgLegalRepAddressWard || '';
              next.beneficialOwnerAddressCity = next.orgLegalRepAddressCity || '';
              next.beneficialOwnerAddressCountry = next.orgLegalRepAddressCountry || 'Việt Nam';
              changed = true;
          }
      }

      return changed ? next : prev;
    });
  }, [
      info.addressDetail, info.addressWard, info.addressCity, info.addressCountry, useHQAddress,
      info.companyOwner, info.ownerGender, info.ownerDob, info.ownerIdNumber, info.ownerIdDate, info.ownerIdPlace, 
      info.ownerAddressDetail, info.ownerAddressWard, info.ownerAddressCity, info.ownerAddressCountry,
      // Add dependencies for Organization Legal Rep fields
      info.orgLegalRepName, info.orgLegalRepGender, info.orgLegalRepIdNumber, info.orgLegalRepDob, 
      info.orgLegalRepAddressDetail, info.orgLegalRepAddressWard, info.orgLegalRepAddressCity,
      info.beneficialOwnerType, info.ownerType
  ]);

  // Logic Tự động chọn Cơ quan ĐKKD dựa trên Tỉnh/Thành phố trụ sở
  useEffect(() => {
    if (info.addressCity) {
        setIsAutoSyncingOffice(true);
        const city = info.addressCity.trim();
        const normalizedCity = city
            .replace(/^(Tỉnh|Thành phố|TP\.|TP|Thành Phố|T\.)\s+/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        if (normalizedCity) {
            const matchedOffice = REGISTRATION_OFFICES.find(office => {
                const officeClean = office.toLowerCase();
                const cityLower = normalizedCity.toLowerCase();
                return officeClean.includes(cityLower);
            });
            
            if (matchedOffice && matchedOffice !== info.registrationOffice) {
                setInfo(prev => ({ ...prev, registrationOffice: matchedOffice }));
            }
        }
        setTimeout(() => setIsAutoSyncingOffice(false), 500);
    }
  }, [info.addressCity]);

  const toggleHQ = (field: 'owner' | 'rep' | 'tax', value: boolean) => {
     setUseHQAddress(prev => ({ ...prev, [field]: value }));
  };

  const handleTranslateName = async () => {
    if (!info.name.trim()) {
      alert("Vui lòng nhập tên công ty Tiếng Việt trước.");
      return;
    }
    setIsTranslating(true);
    try {
      const translated = await translateBusinessName(info.name);
      if (translated) {
        setInfo(prev => ({ ...prev, nameEn: translated }));
      }
    } catch (e) {
      showAiError("Dịch tự động thất bại.", e);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(',')[1];
        setSampleFile({
          name: file.name,
          base64: base64Data,
          mimeType: file.type
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleIdCardUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'ownerIdCard' | 'repIdCard', side: 'front' | 'back') => {
    const files = e.target.files;
    if (files && files.length > 0) {
        const filePromises = Array.from(files).map((file: File) => {
            return new Promise<{ base64: string, mimeType: string }>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64String = reader.result as string;
                    const base64Data = base64String.split(',')[1];
                    resolve({ base64: base64Data, mimeType: file.type });
                };
                reader.readAsDataURL(file);
            });
        });

        Promise.all(filePromises).then(async (uploadedImages) => {
            // If multiple files (e.g., Auth Rep ID Front+Back), use the first one for visual 'back' preview, but store all in extras
            const primaryImage = uploadedImages[0];
            const extraImages = uploadedImages.length > 1 ? uploadedImages : (files.length > 0 ? [primaryImage] : []);

            setInfo(prev => {
                const updatedInfo = {
                    ...prev,
                    [field]: {
                        ...prev[field],
                        [side]: primaryImage,
                        // If it's organization owner back side, assume these are Auth Rep docs
                        extras: (field === 'ownerIdCard' && prev.ownerType === 'organization' && side === 'back') ? uploadedImages : undefined
                    }
                };
                
                const isOwner = field === 'ownerIdCard';
                const extractFieldKey = isOwner ? 'owner' : 'rep';
                setExtractingId(prevExtract => ({ ...prevExtract, [extractFieldKey]: true }));

                const front = side === 'front' ? primaryImage : updatedInfo[field]?.front;
                const back = side === 'back' ? primaryImage : updatedInfo[field]?.back;
                const extras = updatedInfo[field]?.extras;

                const mode = isOwner && updatedInfo.ownerType === 'organization' ? 'organization' : 'person';
                extractIdCardInfo(front, back, extras, mode).then(extracted => {
                     warnIfEmpty(extracted, mode);
                     setInfo(current => {
                        let updates: any = {};
                        
                        if (isOwner) {
                            if (current.ownerType === 'organization') {
                                // Extract to Organization fields
                                updates.ownerOrgName = (extracted.orgName || extracted.name || current.ownerOrgName || '').toUpperCase();
                                updates.ownerOrgCode = extracted.orgCode || extracted.idNumber || current.ownerOrgCode;
                                updates.ownerOrgIssueDate = extracted.idDate || current.ownerOrgIssueDate;
                                updates.ownerOrgIssuePlace = extracted.idPlace || current.ownerOrgIssuePlace;
                                updates.ownerOrgAddressDetail = extracted.addressDetail || current.ownerOrgAddressDetail;
                                updates.ownerOrgAddressWard = extracted.addressWard || current.ownerOrgAddressWard;
                                updates.ownerOrgAddressCity = extracted.addressCity || current.ownerOrgAddressCity;
                                updates.ownerOrgAddressCountry = extracted.addressCountry || 'Việt Nam';

                                // Extract to Auth Rep fields if available
                                if (extracted.authRepName) updates.companyOwner = extracted.authRepName.toUpperCase();
                                if (extracted.authRepGender) updates.ownerGender = extracted.authRepGender;
                                if (extracted.authRepIdNumber) updates.ownerIdNumber = extracted.authRepIdNumber;
                                if (extracted.authRepIdDocumentType) updates.ownerIdDocumentType = extracted.authRepIdDocumentType;
                                if (extracted.authRepDob) updates.ownerDob = extracted.authRepDob;
                                if (extracted.authRepIdDate) updates.ownerIdDate = extracted.authRepIdDate;
                                if (extracted.authRepIdPlace) updates.ownerIdPlace = extracted.authRepIdPlace;
                                if (extracted.authRepAddressDetail) updates.ownerAddressDetail = extracted.authRepAddressDetail;
                                if (extracted.authRepAddressWard) updates.ownerAddressWard = extracted.authRepAddressWard;
                                if (extracted.authRepAddressCity) updates.ownerAddressCity = extracted.authRepAddressCity;
                                if (extracted.authRepAddressCountry) updates.ownerAddressCountry = extracted.authRepAddressCountry;

                                // Extract to Organization Legal Rep fields (for Beneficial Owner mapping)
                                if (extracted.orgLegalRepName) updates.orgLegalRepName = extracted.orgLegalRepName.toUpperCase();
                                if (extracted.orgLegalRepGender) updates.orgLegalRepGender = extracted.orgLegalRepGender;
                                if (extracted.orgLegalRepIdNumber) updates.orgLegalRepIdNumber = extracted.orgLegalRepIdNumber;
                                if (extracted.orgLegalRepIdDocumentType) updates.orgLegalRepIdDocumentType = extracted.orgLegalRepIdDocumentType;
                                if (extracted.orgLegalRepDob) updates.orgLegalRepDob = extracted.orgLegalRepDob;
                                if (extracted.orgLegalRepIdDate) updates.orgLegalRepIdDate = extracted.orgLegalRepIdDate;
                                if (extracted.orgLegalRepIdPlace) updates.orgLegalRepIdPlace = extracted.orgLegalRepIdPlace;
                                if (extracted.orgLegalRepAddressDetail) updates.orgLegalRepAddressDetail = extracted.orgLegalRepAddressDetail;
                                if (extracted.orgLegalRepAddressWard) updates.orgLegalRepAddressWard = extracted.orgLegalRepAddressWard;
                                if (extracted.orgLegalRepAddressCity) updates.orgLegalRepAddressCity = extracted.orgLegalRepAddressCity;
                                if (extracted.orgLegalRepAddressCountry) updates.orgLegalRepAddressCountry = extracted.orgLegalRepAddressCountry;

                            } else {
                                // Extract to Individual fields
                                updates.companyOwner = extracted.name ? extracted.name.toUpperCase() : (current.companyOwner || '');
                                updates.ownerGender = extracted.gender || current.ownerGender;
                                updates.ownerDob = extracted.dob || current.ownerDob;
                                updates.ownerIdNumber = extracted.idNumber || current.ownerIdNumber;
                                updates.ownerIdDocumentType = extracted.idDocumentType || current.ownerIdDocumentType;
                                updates.ownerIdDate = extracted.idDate || current.ownerIdDate;
                                updates.ownerIdPlace = extracted.idPlace || current.ownerIdPlace;
                                updates.ownerAddressDetail = extracted.addressDetail || current.ownerAddressDetail;
                                updates.ownerAddressWard = extracted.addressWard || current.ownerAddressWard;
                                updates.ownerAddressCity = extracted.addressCity || current.ownerAddressCity;
                                updates.ownerAddressCountry = extracted.addressCountry || 'Việt Nam';
                            }
                        } else {
                            // Extract to Legal Rep fields
                             updates.ownerName = extracted.name ? extracted.name.toUpperCase() : (current.ownerName || '');
                             updates.repGender = extracted.gender || current.repGender;
                             updates.repDob = extracted.dob || current.repDob;
                             updates.repIdNumber = extracted.idNumber || current.repIdNumber;
                             updates.repIdDocumentType = extracted.idDocumentType || current.repIdDocumentType;
                             updates.repIdDate = extracted.idDate || current.repIdDate;
                             updates.repIdPlace = extracted.idPlace || current.repIdPlace;
                             updates.repAddressDetail = extracted.addressDetail || current.repAddressDetail;
                             updates.repAddressWard = extracted.addressWard || current.repAddressWard;
                             updates.repAddressCity = extracted.addressCity || current.repAddressCity;
                             updates.repAddressCountry = extracted.addressCountry || 'Việt Nam';
                        }
                        
                        if (isOwner && current.ownerType === 'individual') {
                            toggleHQ('owner', false);
                        } else if (isOwner && current.ownerType === 'organization') {
                            // Only toggle off HQ if auth rep address was found
                            if (extracted.authRepAddressDetail) toggleHQ('owner', false);
                        } else if (!isOwner) {
                            toggleHQ('rep', false);
                        }

                        return { ...current, ...updates };
                    });
                }).catch(err => {
                    showAiError("Không tự đọc được thông tin từ ảnh giấy tờ. Bạn có thể bấm trích xuất lại sau.", err);
                }).finally(() => {
                    setExtractingId(prevExtract => ({ ...prevExtract, [extractFieldKey]: false }));
                });

                return updatedInfo;
            });
        });
    }
  };

  const handleManualExtract = async (target: 'owner' | 'rep') => {
      const field = target === 'owner' ? 'ownerIdCard' : 'repIdCard';
      const currentImages = info[field];

      if (!currentImages?.front && !currentImages?.back) {
          alert("Vui lòng tải ít nhất một mặt tài liệu trước khi trích xuất.");
          return;
      }

      setExtractingId(prev => ({ ...prev, [target]: true }));
      
      try {
          const mode = target === 'owner' && info.ownerType === 'organization' ? 'organization' : 'person';
          const extracted = await extractIdCardInfo(currentImages.front, currentImages.back, currentImages.extras, mode);
          warnIfEmpty(extracted, mode);
          setInfo(current => {
              let updates: any = {};
              
              if (target === 'owner') {
                  if (current.ownerType === 'organization') {
                      // Extract to Organization fields
                      updates.ownerOrgName = (extracted.orgName || extracted.name || current.ownerOrgName || '').toUpperCase();
                      updates.ownerOrgCode = extracted.orgCode || extracted.idNumber || current.ownerOrgCode;
                      updates.ownerOrgIssueDate = extracted.idDate || current.ownerOrgIssueDate;
                      updates.ownerOrgIssuePlace = extracted.idPlace || current.ownerOrgIssuePlace;
                      updates.ownerOrgAddressDetail = extracted.addressDetail || current.ownerOrgAddressDetail;
                      updates.ownerOrgAddressWard = extracted.addressWard || current.ownerOrgAddressWard;
                      updates.ownerOrgAddressCity = extracted.addressCity || current.ownerOrgAddressCity;
                      updates.ownerOrgAddressCountry = extracted.addressCountry || 'Việt Nam';

                       // Extract to Auth Rep fields if available
                      if (extracted.authRepName) updates.companyOwner = extracted.authRepName.toUpperCase();
                      if (extracted.authRepGender) updates.ownerGender = extracted.authRepGender;
                      if (extracted.authRepIdNumber) updates.ownerIdNumber = extracted.authRepIdNumber;
                      if (extracted.authRepIdDocumentType) updates.ownerIdDocumentType = extracted.authRepIdDocumentType;
                      if (extracted.authRepDob) updates.ownerDob = extracted.authRepDob;
                      if (extracted.authRepIdDate) updates.ownerIdDate = extracted.authRepIdDate;
                      if (extracted.authRepIdPlace) updates.ownerIdPlace = extracted.authRepIdPlace;
                      if (extracted.authRepAddressDetail) updates.ownerAddressDetail = extracted.authRepAddressDetail;
                      if (extracted.authRepAddressWard) updates.ownerAddressWard = extracted.authRepAddressWard;
                      if (extracted.authRepAddressCity) updates.ownerAddressCity = extracted.authRepAddressCity;
                      if (extracted.authRepAddressCountry) updates.ownerAddressCountry = extracted.authRepAddressCountry;

                      // Extract to Organization Legal Rep fields
                      if (extracted.orgLegalRepName) updates.orgLegalRepName = extracted.orgLegalRepName.toUpperCase();
                      if (extracted.orgLegalRepGender) updates.orgLegalRepGender = extracted.orgLegalRepGender;
                      if (extracted.orgLegalRepIdNumber) updates.orgLegalRepIdNumber = extracted.orgLegalRepIdNumber;
                      if (extracted.orgLegalRepIdDocumentType) updates.orgLegalRepIdDocumentType = extracted.orgLegalRepIdDocumentType;
                      if (extracted.orgLegalRepDob) updates.orgLegalRepDob = extracted.orgLegalRepDob;
                      if (extracted.orgLegalRepIdDate) updates.orgLegalRepIdDate = extracted.orgLegalRepIdDate;
                      if (extracted.orgLegalRepIdPlace) updates.orgLegalRepIdPlace = extracted.orgLegalRepIdPlace;
                      if (extracted.orgLegalRepAddressDetail) updates.orgLegalRepAddressDetail = extracted.orgLegalRepAddressDetail;
                      if (extracted.orgLegalRepAddressWard) updates.orgLegalRepAddressWard = extracted.orgLegalRepAddressWard;
                      if (extracted.orgLegalRepAddressCity) updates.orgLegalRepAddressCity = extracted.orgLegalRepAddressCity;
                      if (extracted.orgLegalRepAddressCountry) updates.orgLegalRepAddressCountry = extracted.orgLegalRepAddressCountry;

                  } else {
                       // Extract to Individual fields
                      updates.companyOwner = extracted.name ? extracted.name.toUpperCase() : (current.companyOwner || '');
                      updates.ownerGender = extracted.gender || current.ownerGender;
                      updates.ownerDob = extracted.dob || current.ownerDob;
                      updates.ownerIdNumber = extracted.idNumber || current.ownerIdNumber;
                      updates.ownerIdDocumentType = extracted.idDocumentType || current.ownerIdDocumentType;
                      updates.ownerIdDate = extracted.idDate || current.ownerIdDate;
                      updates.ownerIdPlace = extracted.idPlace || current.ownerIdPlace;
                      updates.ownerAddressDetail = extracted.addressDetail || current.ownerAddressDetail;
                      updates.ownerAddressWard = extracted.addressWard || current.ownerAddressWard;
                      updates.ownerAddressCity = extracted.addressCity || current.ownerAddressCity;
                      updates.ownerAddressCountry = extracted.addressCountry || 'Việt Nam';
                  }
              } else {
                   // Extract to Legal Rep fields
                   updates.ownerName = extracted.name ? extracted.name.toUpperCase() : (current.ownerName || '');
                   updates.repGender = extracted.gender || current.repGender;
                   updates.repDob = extracted.dob || current.repDob;
                   updates.repIdNumber = extracted.idNumber || current.repIdNumber;
                   updates.repIdDocumentType = extracted.idDocumentType || current.repIdDocumentType;
                   updates.repIdDate = extracted.idDate || current.repIdDate;
                   updates.repIdPlace = extracted.idPlace || current.repIdPlace;
                   updates.repAddressDetail = extracted.addressDetail || current.repAddressDetail;
                   updates.repAddressWard = extracted.addressWard || current.repAddressWard;
                   updates.repAddressCity = extracted.addressCity || current.repAddressCity;
                   updates.repAddressCountry = extracted.addressCountry || 'Việt Nam';
              }
              
              if (target === 'owner' && current.ownerType === 'individual') {
                  toggleHQ('owner', false);
              } else if (target === 'rep') {
                  toggleHQ('rep', false);
              }
              
              return { ...current, ...updates };
          });
      } catch (e) {
          showAiError("Không thể trích xuất thông tin từ giấy tờ.", e);
      } finally {
          setExtractingId(prev => ({ ...prev, [target]: false }));
      }
  };

  const handleWardLookupClick = async (fieldPrefix: string) => {
    let currentWard = '';
    let currentCity = '';

    if (fieldPrefix === 'hq') {
        currentWard = info.addressWard;
        currentCity = info.addressCity;
    } else if (fieldPrefix === 'owner') {
        currentWard = info.ownerAddressWard;
        currentCity = info.ownerAddressCity;
    } else if (fieldPrefix === 'rep') {
        currentWard = info.repAddressWard;
        currentCity = info.repAddressCity;
    } else if (fieldPrefix === 'tax') {
        currentWard = info.taxAddressWard;
        currentCity = info.taxAddressCity;
    }

    if (!currentWard) {
        alert("Vui lòng nhập tên Phường/Xã hiện tại.");
        return;
    }
    if (!currentCity) {
        alert("Vui lòng nhập Tỉnh/Thành phố trước để tra cứu sáp nhập.");
        return;
    }

    setLookingUpWard(prev => ({ ...prev, [fieldPrefix]: true }));
    try {
        const result = await lookupWard(currentWard, currentCity);
        if (result.updated) {
            setInfo(prev => {
                const next = { ...prev };
                if (fieldPrefix === 'hq') next.addressWard = result.ward;
                else if (fieldPrefix === 'owner') next.ownerAddressWard = result.ward;
                else if (fieldPrefix === 'rep') next.repAddressWard = result.ward;
                else if (fieldPrefix === 'tax') next.taxAddressWard = result.ward;
                return next;
            });
            alert(`Đã cập nhật: ${result.reason}`);
        } else {
            alert("Thông tin Phường/Xã hiện tại đã chính xác hoặc không có thay đổi sáp nhập.");
        }
    } catch (e) {
        showAiError("Có lỗi khi tra cứu đơn vị hành chính.", e);
    } finally {
        setLookingUpWard(prev => ({ ...prev, [fieldPrefix]: false }));
    }
  };

  const renderIdUploadBox = (field: 'ownerIdCard' | 'repIdCard', side: 'front' | 'back', label: string) => {
      const isOwner = field === 'ownerIdCard';
      const isLoading = isOwner ? extractingId.owner : extractingId.rep;
      const fileData = info[field]?.[side];
      
      const isPdf = fileData?.mimeType === 'application/pdf';

      // For Organization Owner Back side (Auth Rep ID), allow multiple files
      const isMultiUpload = field === 'ownerIdCard' && info.ownerType === 'organization' && side === 'back';
      const extraCount = (field === 'ownerIdCard' && info.ownerIdCard?.extras?.length) || 0;

      return (
          <div className="relative border border-dashed border-slate-300 rounded-lg p-3 text-center hover:bg-slate-50 transition cursor-pointer h-32 flex flex-col items-center justify-center group bg-white">
              <input 
                type="file" 
                multiple={isMultiUpload}
                accept="image/*,application/pdf" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                onChange={(e) => handleIdCardUpload(e, field, side)} 
              />
              {fileData ? (
                 <>
                   <div className="absolute inset-0 w-full h-full overflow-hidden rounded-lg group-hover:opacity-90 transition flex items-center justify-center bg-slate-50">
                       {isPdf ? (
                           <div className="flex flex-col items-center text-red-500 opacity-60">
                               <FileText className="w-10 h-10 mb-1" />
                               <span className="text-[10px] font-mono text-slate-500">PDF Document</span>
                           </div>
                       ) : (
                           <img src={`data:${fileData.mimeType};base64,${fileData.base64}`} className="w-full h-full object-cover opacity-40" alt={label} />
                       )}
                   </div>
                   <div className="relative z-0 flex flex-col items-center">
                       <CheckCircle className="w-6 h-6 text-emerald-500 mb-1 drop-shadow-sm" />
                       <span className="text-[10px] text-slate-700 font-medium bg-white/90 px-2 py-0.5 rounded backdrop-blur-sm shadow-sm">{label}</span>
                       {isMultiUpload && extraCount > 1 && (
                            <span className="mt-1 flex items-center gap-1 text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold shadow-sm">
                                <Files className="w-3 h-3" /> +{extraCount - 1} file khác
                            </span>
                       )}
                   </div>
                 </>
              ) : (
                <>
                    {isLoading ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin mb-1" /> : <IdCard className="w-5 h-5 text-slate-400 mb-1" />}
                    <span className="text-[10px] text-slate-400">{label}</span>
                    {isMultiUpload && <span className="text-[9px] text-blue-400">(Chọn nhiều file)</span>}
                </>
              )}
          </div>
      );
  }

  const renderManualIdInput = (fieldPrefix: 'owner' | 'rep') => {
      const isOwner = fieldPrefix === 'owner';
      const name = isOwner ? info.companyOwner : info.ownerName;
      const gender = isOwner ? info.ownerGender : info.repGender;
      const dob = isOwner ? info.ownerDob : info.repDob;
      
      const idNumber = isOwner ? info.ownerIdNumber : info.repIdNumber;
      const idDate = isOwner ? info.ownerIdDate : info.repIdDate;
      const idPlace = isOwner ? info.ownerIdPlace : info.repIdPlace;
      const setter = setInfo;

      return (
          <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                   <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Họ và tên (IN HOA)</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm uppercase" 
                            value={name} 
                            onChange={e => setter(prev => ({ ...prev, [isOwner ? 'companyOwner' : 'ownerName']: e.target.value.toUpperCase() }))}
                            placeholder="NGUYỄN VĂN A"
                        />
                   </div>
                   <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Giới tính</label>
                        <select 
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" 
                            value={gender} 
                            onChange={e => setter(prev => ({ ...prev, [isOwner ? 'ownerGender' : 'repGender']: e.target.value }))}
                        >
                            <option value="">Chọn</option>
                            <option value="Nam">Nam</option>
                            <option value="Nữ">Nữ</option>
                        </select>
                   </div>
                   <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Ngày sinh</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" 
                            value={dob} 
                            onChange={e => setter(prev => ({ ...prev, [isOwner ? 'ownerDob' : 'repDob']: e.target.value }))}
                            placeholder="DD/MM/YYYY"
                        />
                   </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                   <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Số giấy tờ (CCCD/CMND)</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" 
                            value={idNumber} 
                            onChange={e => setter(prev => ({ ...prev, [isOwner ? 'ownerIdNumber' : 'repIdNumber']: e.target.value }))}
                            placeholder="012345678910"
                        />
                   </div>
                   <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Ngày cấp</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" 
                            value={idDate} 
                            onChange={e => setter(prev => ({ ...prev, [isOwner ? 'ownerIdDate' : 'repIdDate']: e.target.value }))}
                            placeholder="DD/MM/YYYY"
                        />
                   </div>
                   <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Nơi cấp</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" 
                            value={idPlace} 
                            onChange={e => setter(prev => ({ ...prev, [isOwner ? 'ownerIdPlace' : 'repIdPlace']: e.target.value }))}
                            placeholder="Cục CS QLHC..."
                        />
                   </div>
               </div>
          </div>
      );
  };

  const handleAddressUpdate = async (fieldPrefix: string) => {
    let currentDetail = '';
    let currentWard = '';
    let currentCity = '';

    if (fieldPrefix === 'hq') {
        currentDetail = info.addressDetail;
        currentWard = info.addressWard;
        currentCity = info.addressCity;
    } else if (fieldPrefix === 'owner') {
        currentDetail = info.ownerAddressDetail;
        currentWard = info.ownerAddressWard;
        currentCity = info.ownerAddressCity;
    } else if (fieldPrefix === 'rep') {
        currentDetail = info.repAddressDetail;
        currentWard = info.repAddressWard;
        currentCity = info.repAddressCity;
    } else if (fieldPrefix === 'tax') {
        currentDetail = info.taxAddressDetail;
        currentWard = info.taxAddressWard;
        currentCity = info.taxAddressCity;
    }

    if (!currentWard && !currentCity) {
        alert("Vui lòng nhập địa chỉ trước khi cập nhật.");
        return;
    }

    setUpdatingAddress(prev => ({ ...prev, [fieldPrefix]: true }));
    try {
        const result = await updateAdministrativeDivisions(currentDetail, currentWard, currentCity);
        if (result.updated) {
             setInfo(prev => {
                const next = { ...prev };
                if (fieldPrefix === 'hq') {
                    next.addressDetail = result.detail;
                    next.addressWard = result.ward;
                    next.addressCity = result.city;
                } else if (fieldPrefix === 'owner') {
                    next.ownerAddressDetail = result.detail;
                    next.ownerAddressWard = result.ward;
                    next.ownerAddressCity = result.city;
                } else if (fieldPrefix === 'rep') {
                    next.repAddressDetail = result.detail;
                    next.repAddressWard = result.ward;
                    next.repAddressCity = result.city;
                 } else if (fieldPrefix === 'tax') {
                    next.taxAddressDetail = result.detail;
                    next.taxAddressWard = result.ward;
                    next.taxAddressCity = result.city;
                 }
                 return next;
             });
        } else {
             alert("Địa chỉ không thay đổi so với quy hoạch mới.");
        }
    } catch (e) {
        showAiError("Có lỗi khi kiểm tra địa chỉ.", e);
    } finally {
        setUpdatingAddress(prev => ({ ...prev, [fieldPrefix]: false }));
    }
  };

  const handleLookupIndustry = async () => {
     if (!info.industry.trim() && !info.subIndustries.trim()) {
         alert("Vui lòng nhập ngành nghề chính hoặc ngành nghề phụ.");
         return;
     }
     setIsLookingUpCodes(true);
     try {
         const codes = await lookupIndustryCodes(info.industry, info.subIndustries);
         setInfo(prev => ({ ...prev, industryCodes: codes }));
     } catch (e) {
         showAiError("Có lỗi khi tra cứu mã ngành.", e);
     } finally {
         setIsLookingUpCodes(false);
     }
  };

  const handleSuggestIndustry = async () => {
      if (info.industryCodes.length === 0) return;
      setIsSuggestingCodes(true);
      try {
          const newCodes = await suggestRelatedIndustryCodes(info.industryCodes);
          if (newCodes && newCodes.length > 0) {
              setInfo(prev => {
                  const existingCodesDict = new Set(prev.industryCodes.map(c => c.code));
                  const filteredNew = newCodes.filter(c => !existingCodesDict.has(c.code));
                  return {
                      ...prev,
                      industryCodes: [...prev.industryCodes, ...filteredNew]
                  };
              });
          } else {
              alert("Không tìm thấy thêm ngành nghề liên quan.");
          }
      } catch (e) {
          showAiError("Có lỗi khi gợi ý mã ngành liên quan.", e);
      } finally {
          setIsSuggestingCodes(false);
      }
  };

  const toggleMainIndustry = (index: number) => {
      setInfo(prev => {
          const newCodes = prev.industryCodes.map((item, idx) => ({
              ...item,
              isMain: idx === index 
          }));
          return { ...prev, industryCodes: newCodes };
      });
  };

  const handleAnalyze = async () => {
    if (!rawInput.trim() || !taskType) return;
    setIsAnalyzing(true);
    try {
      const analyzedInfo = await analyzeBusinessInput(rawInput, taskType);
      
      setInfo(prev => ({
        ...prev,
        ...analyzedInfo,
        type: normalizeCompanyType(analyzedInfo.type) || prev.type,
        docDate: analyzedInfo.docDate || prev.docDate,
        ownerType: normalizeOwnerType(analyzedInfo.ownerType) || prev.ownerType,
        addressCountry: prev.addressCountry || 'Việt Nam',
        ownerAddressCountry: prev.ownerAddressCountry || 'Việt Nam',
        repAddressCountry: prev.repAddressCountry || 'Việt Nam',
        ownerGender: analyzedInfo.ownerGender || prev.ownerGender,
        repGender: analyzedInfo.repGender || prev.repGender,
        name: analyzedInfo.name ? analyzedInfo.name.toUpperCase() : prev.name,
        nameEn: analyzedInfo.nameEn || prev.nameEn,
        nameAbbr: analyzedInfo.nameAbbr || prev.nameAbbr,
        ownerOrgName: analyzedInfo.ownerOrgName ? analyzedInfo.ownerOrgName.toUpperCase() : prev.ownerOrgName,
        companyOwner: analyzedInfo.companyOwner ? analyzedInfo.companyOwner.toUpperCase() : prev.companyOwner,
        ownerName: analyzedInfo.ownerName ? analyzedInfo.ownerName.toUpperCase() : prev.ownerName,
        repTitle: analyzedInfo.repTitle || prev.repTitle,
        subIndustries: analyzedInfo.subIndustries || prev.subIndustries,
        phone: analyzedInfo.phone || prev.phone,
        email: analyzedInfo.email || prev.email,
        website: analyzedInfo.website || prev.website,
        ownerPhone: analyzedInfo.ownerPhone || prev.ownerPhone,
        repPhone: analyzedInfo.repPhone || prev.repPhone,
        capitalInWords: analyzedInfo.capitalInWords || prev.capitalInWords
      }));
    } catch (error) {
      showAiError("Không thể phân tích thông tin.", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if (!taskType) return;
    setLoading(true);
    setResult(null);
    try {
      // Create a markdown summary instead of full legal document
      let summary = `### TỔNG HỢP THÔNG TIN HỒ SƠ\n\n`;
      summary += `Dưới đây là các thông tin sẽ được xuất ra file Excel. Vui lòng kiểm tra kỹ trước khi tải về.\n\n`;
      
      summary += `| Trường thông tin | Nội dung |\n|---|---|\n`;
      summary += `| **Loại hình** | ${info.type} |\n`;
      summary += `| **Tên Tiếng Việt** | ${info.name} |\n`;
      summary += `| **Tên Tiếng Anh** | ${info.nameEn} |\n`;
      summary += `| **Tên Viết Tắt** | ${info.nameAbbr} |\n`;
      const exportCapital = info.capital ? info.capital.replace(/đồng/gi, '').trim() : '';
      summary += `| **Vốn điều lệ** | ${exportCapital} (${info.capitalInWords}) |\n`;
      summary += `| **Trụ sở chính** | ${info.addressDetail}, ${info.addressWard}, ${info.addressCity} |\n`;
      summary += `| **Người đại diện** | ${info.ownerName} (${info.repGender ? info.repGender + ' - ' : ''}${info.repTitle}) |\n`;
      summary += `| **Chủ sở hữu** | ${info.companyOwner} ${info.ownerGender ? '(' + info.ownerGender + ')' : ''} |\n`;
      
      summary += `\n\n*Dữ liệu đã sẵn sàng. Nhấn nút **Tải về (.xlsx)** bên dưới để lấy file Excel.*`;
      
      setResult(summary);
    } catch (err) {
      alert("Có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    try {
        const wb = XLSX.utils.book_new();

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

        // Process Industry List -> Split into columns
        const industryHeaders: string[] = [];
        const industryValues: string[] = [];

        if (info.industryCodes && info.industryCodes.length > 0) {
            info.industryCodes.forEach((code, index) => {
                const idx = index + 1;
                industryHeaders.push(`TEN_NGANH_${idx}`, `MA_NGANH_${idx}`);
                industryValues.push(code.name, code.code);
            });
        } else {
            // Fallback for manual input
            if (info.industry) {
                industryHeaders.push("TEN_NGANH_1", "MA_NGANH_1");
                industryValues.push(info.industry, ""); // No code available
            }
            if (info.subIndustries) {
                // Split sub industries by newline or comma if possible, but for now treat as one block or 2nd item
                industryHeaders.push("TEN_NGANH_2", "MA_NGANH_2");
                industryValues.push(info.subIndustries, "");
            }
        }

        // Header Row (Standardized Field Names)
        const headers = [
            // Thông tin chung
            "CQ_DK_KD", "NGAY_THANG_NAM", "NGAY", "THANG", "NAM",
            "LOAI_HINH", "TEN_TV", "TEN_TA", "TEN_VT",
            "VON_SO", "VON_CHU",
            // Trụ sở chính
            "TS_DIA_CHI", "TS_PHUONG_XA", "TS_TINH_TP", "TS_QUOC_GIA", "TS_FULL",
            "DT_CTY", "EMAIL", "WEBSITE",
            // Ngành nghề (Dynamic Columns)
            ...industryHeaders,
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
            "THUE_DIA_CHI", "THUE_PHUONG_XA", "THUE_TINH_TP", "THUE_SDT", "THUE_EMAIL"
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
            // Ngành nghề (Dynamic Values)
            ...industryValues,
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
            // Thuế
            info.taxAddressDetail, info.taxAddressWard, info.taxAddressCity, info.taxPhone, info.taxEmail
        ];

        // 2. Create Sheet with 2 rows: Header and Data
        const ws = XLSX.utils.aoa_to_sheet([headers, values]);

        XLSX.utils.book_append_sheet(wb, ws, "Data_MailMerge");

        // Export
        const fileName = `MailMerge_${info.nameAbbr || 'Data'}_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, fileName);
    } catch (e) {
        console.error("Export Excel Error", e);
        alert("Có lỗi khi xuất file Excel. Vui lòng thử lại.");
    }
  };

  const copyToClipboard = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      alert("Đã sao chép vào bộ nhớ tạm!");
    }
  };

  const handleBack = () => {
    if (step === 'form') {
      setStep('type');
      setResult(null);
    } else if (step === 'type') {
      setStep('task');
      setTaskType(null);
    }
  };

  const handleTaskSelect = (type: TaskType) => {
    setTaskType(type);
    setStep('type');
  };

  const handleTypeSelect = (typeId: string) => {
    setInfo(prev => ({ ...prev, type: typeId }));
    setStep('form');
  };

  const setOwnerType = (type: 'individual' | 'organization') => {
    setInfo(prev => ({ ...prev, ownerType: type }));
  };

  if (step === 'task') {
    return (
      <div className="max-w-5xl mx-auto pb-12">
         <header className="mb-12 text-center">
          <h2 className="text-4xl font-bold text-slate-800 mb-4">Bạn muốn thực hiện thủ tục gì?</h2>
          <p className="text-slate-500 text-lg">Chọn loại hồ sơ bạn cần soạn thảo để AI hỗ trợ chính xác nhất.</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <button onClick={() => handleTaskSelect('new')} className="group relative bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 text-left">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 rounded-t-2xl"></div>
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors duration-300">
               <PlusCircle className="w-8 h-8 text-blue-600 group-hover:text-white transition-colors" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-3 group-hover:text-blue-600 transition-colors">Thành Lập Mới</h3>
            <p className="text-slate-500 leading-relaxed">Soạn thảo trọn bộ hồ sơ thành lập doanh nghiệp, bao gồm Giấy đề nghị, Điều lệ và Danh sách thành viên.</p>
          </button>
          <button onClick={() => handleTaskSelect('change')} className="group relative bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 text-left">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 rounded-t-2xl"></div>
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-600 transition-colors duration-300">
               <FilePenLine className="w-8 h-8 text-emerald-600 group-hover:text-white transition-colors" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-3 group-hover:text-emerald-600 transition-colors">Thay Đổi Thông Tin</h3>
            <p className="text-slate-500 leading-relaxed">Soạn thảo hồ sơ thay đổi nội dung đăng ký kinh doanh như: đổi tên, địa chỉ, tăng vốn, thay đổi ngành nghề.</p>
          </button>
        </div>
      </div>
    );
  }

  if (step === 'type') {
    return (
      <div className="max-w-5xl mx-auto pb-12">
        <header className="mb-8">
           <button onClick={handleBack} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 mb-4 transition-colors font-medium text-sm">
            <ArrowLeft className="w-4 h-4" /> Quay lại chọn thủ tục
          </button>
          <h2 className="text-3xl font-bold text-slate-800">Chọn Loại Hình Doanh Nghiệp</h2>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {businessTypes.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => handleTypeSelect(t.id)} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all text-left flex flex-col h-full">
                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4 text-blue-600">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{t.label}</h3>
                <p className="text-sm text-slate-500">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-12 px-4">
      <header className="mb-8">
        <button onClick={handleBack} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 mb-4 transition-colors font-medium text-sm">
          <ArrowLeft className="w-4 h-4" /> Quay lại chọn loại hình
        </button>
        <div className="flex items-center gap-3">
           <h2 className="text-3xl font-bold text-slate-800">{taskType === 'new' ? 'Soạn Hồ Sơ Thành Lập' : 'Soạn Hồ Sơ Thay Đổi'}</h2>
           <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">{info.type}</span>
        </div>
        <p className="text-slate-500 mt-2">Điền thông tin doanh nghiệp để AI tự động tạo bộ hồ sơ.</p>
      </header>

      <div className="mb-8 bg-gradient-to-r from-indigo-50 to-blue-50 border border-blue-100 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles className="w-24 h-24 text-blue-600" /></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
             <div className="p-2 bg-white rounded-lg shadow-sm text-blue-600"><Sparkles className="w-5 h-5" /></div>
             <h3 className="font-bold text-slate-800">Nhập liệu thông minh</h3>
          </div>
          <p className="text-sm text-slate-600 mb-4">Dán thông tin thô (email, tin nhắn...) vào đây để AI tự động điền.</p>
          <div className="flex gap-4 items-start">
             <textarea value={rawInput} onChange={(e) => setRawInput(e.target.value)} placeholder="VD: Công ty TNHH ABC, vốn 1 tỷ, Giám đốc Nguyễn Văn A..." className="flex-1 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none bg-white text-sm" />
             <button onClick={handleAnalyze} disabled={isAnalyzing || !rawInput.trim()} className="flex flex-col items-center justify-center gap-2 px-6 h-24 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed min-w-[120px]">
                {isAnalyzing ? (
                    <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="text-xs">Xử lý...</span>
                    </>
                ) : (
                    <>
                        <Sparkles className="w-6 h-6" />
                        <span className="text-xs">Tự động điền</span>
                    </>
                )}
             </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
             <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    Ngày soạn hồ sơ
                </label>
                <div className="flex flex-col items-end gap-1">
                    <input type="date" className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={info.docDate} onChange={e => setInfo({ ...info, docDate: e.target.value })} />
                    {info.docDate && (
                        <span className="text-xs text-slate-500 italic">
                            {(() => {
                                const parts = info.docDate.split('-');
                                if (parts.length === 3) {
                                    return `ngày ${parts[2]} tháng ${parts[1]} năm ${parts[0]}`;
                                }
                                return '';
                            })()}
                        </span>
                    )}
                </div>
             </div>
          </div>

          {info.type === 'Công ty TNHH 1 Thành viên' && (
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold mb-4 text-slate-800 flex items-center gap-2">
                  <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs"><IdCard className="w-3 h-3" /></span>
                  Giấy tờ định danh
                </h3>
                
                <div className="mb-6 pb-6 border-b border-slate-100">
                    <div className="flex flex-col gap-2 mb-3">
                         <div className="flex justify-between items-center">
                            <div className="text-xs font-bold text-slate-700 uppercase">
                                1. CHỦ SỞ HỮU
                            </div>
                            <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                <button onClick={() => setOwnerType('individual')} className={`px-2 py-1 text-[10px] rounded-md transition-all ${info.ownerType === 'individual' ? 'bg-white shadow text-blue-600 font-medium' : 'text-slate-500'}`}>Cá nhân</button>
                                <button onClick={() => setOwnerType('organization')} className={`px-2 py-1 text-[10px] rounded-md transition-all ${info.ownerType === 'organization' ? 'bg-white shadow text-blue-600 font-medium' : 'text-slate-500'}`}>Tổ chức</button>
                            </div>
                         </div>
                         <div className="flex justify-end">
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button onClick={() => setIdInputMethod(prev => ({...prev, owner: 'image'}))} className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md transition-all ${idInputMethod.owner === 'image' ? 'bg-white shadow text-blue-600 font-medium' : 'text-slate-500'}`}>
                                    <ImageIcon className="w-3 h-3"/> Tải tài liệu (AI)
                                </button>
                                <button onClick={() => setIdInputMethod(prev => ({...prev, owner: 'manual'}))} className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md transition-all ${idInputMethod.owner === 'manual' ? 'bg-white shadow text-blue-600 font-medium' : 'text-slate-500'}`}>
                                    <Keyboard className="w-3 h-3"/> Nhập tay
                                </button>
                            </div>
                         </div>
                    </div>
                    
                    {idInputMethod.owner === 'image' ? (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-1">
                                    {renderIdUploadBox('ownerIdCard', 'front', info.ownerType === 'individual' ? 'CCCD Mặt trước' : 'Giấy phép ĐKKD')}
                                </div>
                                <div className="col-span-1">
                                    {renderIdUploadBox('ownerIdCard', 'back', info.ownerType === 'individual' ? 'CCCD Mặt sau' : 'Quyết định / CCCD Người đại diện')}
                                </div>
                            </div>
                            <div className="flex justify-center">
                                <button
                                    onClick={() => handleManualExtract('owner')}
                                    disabled={extractingId.owner || (!info.ownerIdCard?.front && !info.ownerIdCard?.back)}
                                    className="text-xs flex items-center justify-center gap-1 text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-100"
                                >
                                    {extractingId.owner ? <Loader2 className="w-3 h-3 animate-spin"/> : <ScanLine className="w-3 h-3"/>}
                                    Trích xuất thông tin
                                </button>
                            </div>
                        </div>
                    ) : (
                        renderManualIdInput('owner')
                    )}
                </div>

                <div>
                    <div className="flex justify-between items-center mb-3">
                         <div className="text-xs font-bold text-slate-700 uppercase">
                             2. Giám đốc / Đại diện pháp luật
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                             <button onClick={() => setIdInputMethod(prev => ({...prev, rep: 'image'}))} className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md transition-all ${idInputMethod.rep === 'image' ? 'bg-white shadow text-blue-600 font-medium' : 'text-slate-500'}`}>
                                <ImageIcon className="w-3 h-3"/> Tải tài liệu (AI)
                             </button>
                             <button onClick={() => setIdInputMethod(prev => ({...prev, rep: 'manual'}))} className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md transition-all ${idInputMethod.rep === 'manual' ? 'bg-white shadow text-blue-600 font-medium' : 'text-slate-500'}`}>
                                <Keyboard className="w-3 h-3"/> Nhập tay
                             </button>
                        </div>
                    </div>

                    {idInputMethod.rep === 'image' ? (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-1">
                                    {renderIdUploadBox('repIdCard', 'front', 'Mặt trước / Tài liệu 1')}
                                </div>
                                <div className="col-span-1">
                                    {renderIdUploadBox('repIdCard', 'back', 'Mặt sau / Tài liệu 2')}
                                </div>
                            </div>
                            <div className="flex justify-center">
                                <button
                                    onClick={() => handleManualExtract('rep')}
                                    disabled={extractingId.rep || (!info.repIdCard?.front && !info.repIdCard?.back)}
                                    className="text-xs flex items-center justify-center gap-1 text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-100"
                                >
                                    {extractingId.rep ? <Loader2 className="w-3 h-3 animate-spin"/> : <ScanLine className="w-3 h-3"/>}
                                    Trích xuất thông tin
                                </button>
                            </div>
                        </div>
                    ) : (
                        renderManualIdInput('rep')
                    )}
                </div>
                
                { (idInputMethod.owner === 'image' || idInputMethod.rep === 'image') && (
                     <p className="text-[10px] text-slate-500 mt-3 text-center italic">* Hỗ trợ file ảnh và PDF (CCCD, Hộ chiếu, Giấy phép ĐKKD, VNeID...)</p>
                )}
             </div>
          )}

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold mb-4 text-slate-800 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs">1</span>
              Thông tin chi tiết
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2 bg-blue-50/50 p-3 rounded-xl border border-blue-100 mb-2">
                   <div className="flex items-center justify-between mb-1">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <Landmark className="w-4 h-4 text-blue-600" />
                            Cơ quan đăng ký kinh doanh
                        </label>
                        {info.addressCity && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-100/50 px-2 py-0.5 rounded-full animate-pulse">
                                <Link className="w-2 h-2" /> Tự động
                            </span>
                        )}
                   </div>
                   <select 
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white transition-all"
                    value={info.registrationOffice}
                    onChange={(e) => setInfo({ ...info, registrationOffice: e.target.value })}
                   >
                       <option value="">-- Chọn cơ quan nhận hồ sơ --</option>
                       {REGISTRATION_OFFICES.map((office, idx) => (
                           <option key={idx} value={office}>
                               {office}
                           </option>
                       ))}
                   </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên Doanh Nghiệp (Tiếng Việt)</label>
                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase font-bold text-slate-800" placeholder="VD: CÔNG TY TNHH ABC" value={info.name} onChange={e => setInfo({ ...info, name: e.target.value.toUpperCase() })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-slate-700">Tên Tiếng Anh</label>
                      <button 
                        onClick={handleTranslateName}
                        disabled={isTranslating || !info.name}
                        className="text-[10px] text-blue-600 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100 transition-all disabled:opacity-50"
                      >
                        {isTranslating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Globe className="w-2.5 h-2.5" />}
                        Dịch tự động
                      </button>
                    </div>
                    <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="VD: ABC COMPANY LIMITED" value={info.nameEn} onChange={e => setInfo({ ...info, nameEn: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tên Viết Tắt</label>
                    <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="VD: ABC CO.,LTD" value={info.nameAbbr} onChange={e => setInfo({ ...info, nameAbbr: e.target.value })} />
                  </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Vốn Điều Lệ (Số)</label>
                    <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" placeholder="VD: 1.000.000.000 đồng" value={info.capital} onChange={e => setInfo({ ...info, capital: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Vốn Điều Lệ (Chữ)</label>
                    <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" placeholder="VD: Một tỷ đồng" value={info.capitalInWords} onChange={e => setInfo({ ...info, capitalInWords: e.target.value })} />
                  </div>
              </div>
              
              <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <MapPin className="w-4 h-4 text-blue-600"/>
                        Địa chỉ trụ sở chính
                    </label>
                    <button onClick={() => handleAddressUpdate('hq')} disabled={updatingAddress['hq']} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        {updatingAddress['hq'] ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3"/>}
                        Cập nhật 2025
                    </button>
                </div>
                <div>
                    <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Số nhà, đường/phố/thôn" value={info.addressDetail} onChange={e => setInfo({ ...info, addressDetail: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                     <div className="relative">
                        <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Phường/Xã" value={info.addressWard} onChange={e => setInfo({ ...info, addressWard: e.target.value })} />
                        <a href="https://sapnhap.bando.com.vn/" target="_blank" rel="noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-700 p-1 bg-white rounded shadow-sm border border-slate-100" title="Tra cứu sáp nhập">
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                     </div>
                     <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Tỉnh/Thành phố" value={info.addressCity} onChange={e => setInfo({ ...info, addressCity: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Phone className="w-4 h-4 text-blue-600"/>
                        Thông tin liên hệ
                    </label>
                    <div>
                        <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Số điện thoại bàn/hotline" value={info.phone} onChange={e => setInfo({ ...info, phone: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                         <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Email (nếu có)" value={info.email} onChange={e => setInfo({ ...info, email: e.target.value })} />
                         <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Website (nếu có)" value={info.website} onChange={e => setInfo({ ...info, website: e.target.value })} />
                    </div>
              </div>

               <div className="space-y-3">
                    <div className="flex justify-between items-center">
                         <label className="block text-sm font-medium text-slate-700">Ngành Nghề</label>
                         <button 
                            onClick={handleLookupIndustry}
                            disabled={isLookingUpCodes}
                            className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition flex items-center gap-1"
                        >
                            {isLookingUpCodes ? <Loader2 className="w-3 h-3 animate-spin"/> : <BookOpen className="w-3 h-3" />}
                            Tra cứu VSIC
                        </button>
                    </div>
                    <textarea className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-16 resize-none text-sm" placeholder="Ngành chính..." value={info.industry} onChange={e => setInfo({ ...info, industry: e.target.value })} />
                    <textarea className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-20 resize-none text-sm" placeholder="Các ngành nghề khác..." value={info.subIndustries} onChange={e => setInfo({ ...info, subIndustries: e.target.value })} />

                    {info.industryCodes.length > 0 && (
                        <div className="overflow-hidden border border-slate-200 rounded-lg">
                            <table className="w-full text-[11px] text-left">
                                <thead className="bg-slate-50 text-slate-500 uppercase">
                                    <tr>
                                        <th className="px-2 py-2 w-8 text-center border-r border-slate-200">STT</th>
                                        <th className="px-2 py-2">Tên ngành nghề</th>
                                        <th className="px-2 py-2 w-14 text-center border-l border-slate-200">Mã</th>
                                        <th className="px-2 py-2 w-10 text-center border-l border-slate-200">Chính</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {info.industryCodes.map((code, index) => (
                                        <tr key={index} className="hover:bg-slate-50 cursor-pointer" onClick={() => toggleMainIndustry(index)}>
                                            <td className="px-2 py-2 text-center text-slate-400 border-r border-slate-100">{index + 1}</td>
                                            <td className="px-2 py-2 text-slate-800 font-medium leading-tight">{code.name}</td>
                                            <td className="px-2 py-2 text-center font-mono text-slate-600 bg-slate-50/50 border-l border-slate-100">{code.code}</td>
                                            <td className="px-2 py-2 text-center border-l border-slate-100">
                                                <input type="radio" checked={code.isMain} onChange={() => toggleMainIndustry(index)} className="text-blue-600 focus:ring-blue-500" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {info.industryCodes.length > 0 && (
                                <div className="p-2 border-t border-slate-100 bg-white">
                                    <button
                                        onClick={handleSuggestIndustry}
                                        disabled={isSuggestingCodes}
                                        className="w-full py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors flex items-center justify-center gap-1"
                                    >
                                        {isSuggestingCodes ? <Loader2 className="w-3 h-3 animate-spin"/> : <PlusCircle className="w-3 h-3" />}
                                        Thêm các mã ngành liên quan
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
               </div>

               <div className="space-y-4 pt-4 border-t border-slate-100">
                     <h4 className="font-semibold text-sm text-slate-800">Chi tiết nhân sự</h4>
                     
                    <div className="space-y-3 pb-4 border-b border-slate-100">
                        <div className="flex items-center justify-between">
                            <h5 className="font-semibold text-xs text-blue-700 bg-blue-50 p-2 rounded-lg">
                                {info.ownerType === 'individual' ? 'Thông tin Chủ Sở Hữu (Cá nhân)' : 'Thông tin Chủ Sở Hữu (Tổ chức)'}
                            </h5>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button onClick={() => setOwnerType('individual')} className={`px-2 py-1 text-[10px] rounded-md transition-all ${info.ownerType === 'individual' ? 'bg-white shadow text-blue-600 font-medium' : 'text-slate-500'}`}>Cá nhân</button>
                                <button onClick={() => setOwnerType('organization')} className={`px-2 py-1 text-[10px] rounded-md transition-all ${info.ownerType === 'organization' ? 'bg-white shadow text-blue-600 font-medium' : 'text-slate-500'}`}>Tổ chức</button>
                            </div>
                        </div>

                        {info.ownerType === 'organization' && (
                            <div className="space-y-3 p-3 border border-blue-100 rounded-xl bg-blue-50/50 mb-4">
                                <h5 className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase">
                                    <Building2 className="w-3 h-3" /> Thông tin tổ chức
                                </h5>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Tên tổ chức (IN HOA)</label>
                                    <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm uppercase" placeholder="CÔNG TY CP ĐẦU TƯ..." value={info.ownerOrgName} onChange={e => setInfo({ ...info, ownerOrgName: e.target.value.toUpperCase() })} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">Mã số thuế / QĐ</label>
                                        <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="0101234567" value={info.ownerOrgCode} onChange={e => setInfo({ ...info, ownerOrgCode: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">Ngày cấp</label>
                                        <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="DD/MM/YYYY" value={info.ownerOrgIssueDate} onChange={e => setInfo({ ...info, ownerOrgIssueDate: e.target.value })} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700 mb-1">Nơi cấp</label>
                                    <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Sở KHĐT TP. Hà Nội" value={info.ownerOrgIssuePlace} onChange={e => setInfo({ ...info, ownerOrgIssuePlace: e.target.value })} />
                                </div>
                                
                                <div className="space-y-2 bg-white p-2 rounded-lg border border-slate-200">
                                    <label className="block text-xs font-medium text-slate-700">Địa chỉ trụ sở tổ chức</label>
                                    <div>
                                        <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Số nhà, đường/phố" value={info.ownerOrgAddressDetail} onChange={e => setInfo({ ...info, ownerOrgAddressDetail: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="relative">
                                            <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Phường/Xã" value={info.ownerOrgAddressWard} onChange={e => setInfo({ ...info, ownerOrgAddressWard: e.target.value })} />
                                            <a href="https://sapnhap.bando.com.vn/" target="_blank" rel="noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-700 p-1 bg-white rounded shadow-sm border border-slate-100" title="Tra cứu sáp nhập">
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </div>
                                        <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Tỉnh/Thành phố" value={info.ownerOrgAddressCity} onChange={e => setInfo({ ...info, ownerOrgAddressCity: e.target.value })} />
                                    </div>
                                    <div>
                                        <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Quốc gia" value={info.ownerOrgAddressCountry} onChange={e => setInfo({ ...info, ownerOrgAddressCountry: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {info.ownerType === 'organization' && (
                            <h5 className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase mt-4 mb-2">
                                <UserCircle2 className="w-3 h-3" /> Người đại diện theo ủy quyền
                            </h5>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Họ và tên (IN HOA)</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm uppercase" placeholder="NGUYỄN VĂN A" value={info.companyOwner} onChange={e => setInfo({ ...info, companyOwner: e.target.value.toUpperCase() })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Giới tính</label>
                                <select 
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm bg-white" 
                                    value={info.ownerGender} 
                                    onChange={e => setInfo({ ...info, ownerGender: e.target.value })}
                                >
                                    <option value="">Chọn</option>
                                    <option value="Nam">Nam</option>
                                    <option value="Nữ">Nữ</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Ngày sinh</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="DD/MM/YYYY" value={info.ownerDob} onChange={e => setInfo({ ...info, ownerDob: e.target.value })} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Số điện thoại (nếu có)</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="09xxxxxxx" value={info.ownerPhone} onChange={e => setInfo({ ...info, ownerPhone: e.target.value })} />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Số giấy tờ</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="CCCD/CMND" value={info.ownerIdNumber} onChange={e => setInfo({ ...info, ownerIdNumber: e.target.value })} />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Ngày cấp</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="DD/MM/YYYY" value={info.ownerIdDate} onChange={e => setInfo({ ...info, ownerIdDate: e.target.value })} />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Nơi cấp</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Cục CS QLHC..." value={info.ownerIdPlace} onChange={e => setInfo({ ...info, ownerIdPlace: e.target.value })} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-medium text-slate-700">Địa chỉ liên lạc</label>
                                {!useHQAddress.owner && (
                                    <button
                                        onClick={() => handleAddressUpdate('owner')}
                                        className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition"
                                        disabled={updatingAddress['owner']}
                                    >
                                        {updatingAddress['owner'] ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3" />}
                                        Cập nhật 2025
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-4 mb-3">
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input type="radio" name="ownerAddressType" checked={!useHQAddress.owner} onChange={() => toggleHQ('owner', false)} className="text-blue-600 focus:ring-blue-500" />
                                    Địa chỉ thường trú
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input type="radio" name="ownerAddressType" checked={useHQAddress.owner} onChange={() => toggleHQ('owner', true)} className="text-blue-600 focus:ring-blue-500" />
                                    Địa chỉ trụ sở
                                </label>
                            </div>
                            <div className={`space-y-2 p-2 rounded-lg border border-slate-200 ${useHQAddress.owner ? 'bg-slate-50' : ''}`}>
                                <div>
                                    <input type="text" readOnly={useHQAddress.owner} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.owner ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Số nhà, đường/phố" value={info.ownerAddressDetail} onChange={e => setInfo({ ...info, ownerAddressDetail: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="relative">
                                        <input type="text" readOnly={useHQAddress.owner} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.owner ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Phường/Xã" value={info.ownerAddressWard} onChange={e => setInfo({ ...info, ownerAddressWard: e.target.value })} />
                                        <a href="https://sapnhap.bando.com.vn/" target="_blank" rel="noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-700 p-1 bg-white rounded shadow-sm border border-slate-100" title="Tra cứu sáp nhập">
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    </div>
                                    <input type="text" readOnly={useHQAddress.owner} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.owner ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Tỉnh/Thành phố" value={info.ownerAddressCity} onChange={e => setInfo({ ...info, ownerAddressCity: e.target.value })} />
                                </div>
                                <div>
                                    <input type="text" readOnly={useHQAddress.owner} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.owner ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Quốc gia" value={info.ownerAddressCountry} onChange={e => setInfo({ ...info, ownerAddressCountry: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        {/* Beneficial Owner Section - Only for Organizations */}
                        {info.ownerType === 'organization' && (
                            <div className="mt-4 pt-4 border-t border-slate-100 bg-purple-50/50 p-3 rounded-xl border border-purple-100">
                                <h5 className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase mb-3">
                                    <Crown className="w-3 h-3 text-purple-600" /> Chủ sở hữu hưởng lợi (Người kiểm soát)
                                </h5>
                                
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-2">Chọn đối tượng:</label>
                                        <select 
                                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white"
                                            value={info.beneficialOwnerType}
                                            onChange={(e) => setInfo({ ...info, beneficialOwnerType: e.target.value as any })}
                                        >
                                            <option value="auth_rep">Là Người đại diện theo ủy quyền (như trên)</option>
                                            <option value="legal_rep_org">Là Người đại diện pháp luật của tổ chức (trong ĐKKD)</option>
                                            <option value="other">Là Người khác (Nhập tay)</option>
                                        </select>
                                    </div>

                                    {/* Beneficial Owner Form Fields */}
                                    <div className={`space-y-3 ${info.beneficialOwnerType !== 'other' ? 'opacity-70 pointer-events-none' : ''}`}>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-medium text-slate-700 mb-1">Họ và tên (IN HOA)</label>
                                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm uppercase" 
                                                    value={info.beneficialOwnerName} 
                                                    onChange={e => setInfo({ ...info, beneficialOwnerName: e.target.value.toUpperCase() })} 
                                                    placeholder="NGUYỄN VĂN A"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">Giới tính</label>
                                                <select 
                                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm bg-white" 
                                                    value={info.beneficialOwnerGender} 
                                                    onChange={e => setInfo({ ...info, beneficialOwnerGender: e.target.value })}
                                                >
                                                    <option value="">Chọn</option>
                                                    <option value="Nam">Nam</option>
                                                    <option value="Nữ">Nữ</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">Ngày sinh</label>
                                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm" 
                                                    value={info.beneficialOwnerDob} 
                                                    onChange={e => setInfo({ ...info, beneficialOwnerDob: e.target.value })} 
                                                    placeholder="DD/MM/YYYY"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">Số giấy tờ</label>
                                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm" 
                                                    value={info.beneficialOwnerIdNumber} 
                                                    onChange={e => setInfo({ ...info, beneficialOwnerIdNumber: e.target.value })} 
                                                    placeholder="CCCD/CMND"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">Ngày cấp</label>
                                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm" 
                                                    value={info.beneficialOwnerIdDate} 
                                                    onChange={e => setInfo({ ...info, beneficialOwnerIdDate: e.target.value })} 
                                                    placeholder="DD/MM/YYYY"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-700 mb-1">Nơi cấp</label>
                                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm" 
                                                    value={info.beneficialOwnerIdPlace} 
                                                    onChange={e => setInfo({ ...info, beneficialOwnerIdPlace: e.target.value })} 
                                                    placeholder="Cục CS QLHC..."
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2 bg-white p-2 rounded-lg border border-slate-200">
                                            <label className="block text-xs font-medium text-slate-700">Địa chỉ thường trú</label>
                                            <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm" 
                                                value={info.beneficialOwnerAddressDetail} 
                                                onChange={e => setInfo({ ...info, beneficialOwnerAddressDetail: e.target.value })} 
                                                placeholder="Số nhà, đường/phố"
                                            />
                                            <div className="grid grid-cols-2 gap-2">
                                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm" 
                                                    value={info.beneficialOwnerAddressWard} 
                                                    onChange={e => setInfo({ ...info, beneficialOwnerAddressWard: e.target.value })} 
                                                    placeholder="Phường/Xã"
                                                />
                                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm" 
                                                    value={info.beneficialOwnerAddressCity} 
                                                    onChange={e => setInfo({ ...info, beneficialOwnerAddressCity: e.target.value })} 
                                                    placeholder="Tỉnh/Thành phố"
                                                />
                                            </div>
                                            <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-sm" 
                                                value={info.beneficialOwnerAddressCountry} 
                                                onChange={e => setInfo({ ...info, beneficialOwnerAddressCountry: e.target.value })} 
                                                placeholder="Quốc gia"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        <h4 className="font-semibold text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg">Thông tin Người Đại Diện Pháp Luật</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Họ và tên (IN HOA)</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm uppercase" placeholder="NGUYỄN VĂN A" value={info.ownerName} onChange={e => setInfo({ ...info, ownerName: e.target.value.toUpperCase() })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Giới tính</label>
                                <select 
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm bg-white" 
                                    value={info.repGender} 
                                    onChange={e => setInfo({ ...info, repGender: e.target.value })}
                                >
                                    <option value="">Chọn</option>
                                    <option value="Nam">Nam</option>
                                    <option value="Nữ">Nữ</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Chức danh</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="VD: Giám đốc" value={info.repTitle} onChange={e => setInfo({ ...info, repTitle: e.target.value })} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Ngày sinh</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="DD/MM/YYYY" value={info.repDob} onChange={e => setInfo({ ...info, repDob: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Số điện thoại (nếu có)</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="09xxxxxxx" value={info.repPhone} onChange={e => setInfo({ ...info, repPhone: e.target.value })} />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Số giấy tờ</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="CCCD/CMND" value={info.repIdNumber} onChange={e => setInfo({ ...info, repIdNumber: e.target.value })} />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Ngày cấp</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="DD/MM/YYYY" value={info.repIdDate} onChange={e => setInfo({ ...info, repIdDate: e.target.value })} />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Nơi cấp</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Cục CS QLHC..." value={info.repIdPlace} onChange={e => setInfo({ ...info, repIdPlace: e.target.value })} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-medium text-slate-700">Địa chỉ liên lạc</label>
                                {!useHQAddress.rep && (
                                    <button
                                        onClick={() => handleAddressUpdate('rep')}
                                        className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition"
                                        disabled={updatingAddress['rep']}
                                    >
                                        {updatingAddress['rep'] ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3" />}
                                        Cập nhật 2025
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-4 mb-3">
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input type="radio" name="repAddressType" checked={!useHQAddress.rep} onChange={() => toggleHQ('rep', false)} className="text-blue-600 focus:ring-blue-500" />
                                    Địa chỉ thường trú
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input type="radio" name="repAddressType" checked={useHQAddress.rep} onChange={() => toggleHQ('rep', true)} className="text-blue-600 focus:ring-blue-500" />
                                    Địa chỉ trụ sở
                                </label>
                            </div>
                            <div className={`space-y-2 p-2 rounded-lg border border-slate-200 ${useHQAddress.rep ? 'bg-slate-50' : ''}`}>
                                <div>
                                    <input type="text" readOnly={useHQAddress.rep} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.rep ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Số nhà, đường/phố" value={info.repAddressDetail} onChange={e => setInfo({ ...info, repAddressDetail: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="relative">
                                        <input type="text" readOnly={useHQAddress.rep} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.rep ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Phường/Xã" value={info.repAddressWard} onChange={e => setInfo({ ...info, repAddressWard: e.target.value })} />
                                        <a href="https://sapnhap.bando.com.vn/" target="_blank" rel="noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-700 p-1 bg-white rounded shadow-sm border border-slate-100" title="Tra cứu sáp nhập">
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    </div>
                                    <input type="text" readOnly={useHQAddress.rep} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.rep ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Tỉnh/Thành phố" value={info.repAddressCity} onChange={e => setInfo({ ...info, repAddressCity: e.target.value })} />
                                </div>
                                <div>
                                    <input type="text" readOnly={useHQAddress.rep} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.rep ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Quốc gia" value={info.repAddressCountry} onChange={e => setInfo({ ...info, repAddressCountry: e.target.value })} />
                                </div>
                            </div>
                        </div>
                    </div>
               </div>

                <div className="mt-6 pt-6 border-t border-slate-100">
                    <h4 className="font-semibold text-sm text-slate-800 flex items-center gap-2 mb-4">
                        <span className="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs"><Receipt className="w-3 h-3" /></span>
                        Thông tin đăng ký thuế
                    </h4>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Giám đốc / Tổng giám đốc</label>
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-sm flex items-center gap-2">
                                <User className="w-4 h-4" />
                                <span className="font-semibold">{info.ownerName || 'Chưa có thông tin'}</span>
                                <span className="text-slate-400">|</span>
                                <span className="italic">{info.repTitle || 'Chức danh'}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 italic">* Mặc định giống thông tin người đại diện pháp luật</p>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium text-slate-700">Địa chỉ nhận thông báo thuế</label>
                                {!useHQAddress.tax && (
                                    <button
                                        onClick={() => handleAddressUpdate('tax')}
                                        className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition"
                                        disabled={updatingAddress['tax']}
                                    >
                                        {updatingAddress['tax'] ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3" />}
                                        Cập nhật 2025
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-4 mb-3">
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input type="radio" checked={useHQAddress.tax} onChange={() => toggleHQ('tax', true)} className="text-blue-600 focus:ring-blue-500" />
                                    Giống địa chỉ trụ sở chính
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input type="radio" checked={!useHQAddress.tax} onChange={() => toggleHQ('tax', false)} className="text-blue-600 focus:ring-blue-500" />
                                    Địa chỉ khác (Nhập tay)
                                </label>
                            </div>
                            
                            <div className={`space-y-2 p-2 rounded-lg border border-slate-200 ${useHQAddress.tax ? 'bg-slate-50' : ''}`}>
                                <div>
                                    <input type="text" readOnly={useHQAddress.tax} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.tax ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Số nhà, đường/phố" value={info.taxAddressDetail} onChange={e => setInfo({ ...info, taxAddressDetail: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="relative">
                                        <input type="text" readOnly={useHQAddress.tax} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.tax ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Phường/Xã" value={info.taxAddressWard} onChange={e => setInfo({ ...info, taxAddressWard: e.target.value })} />
                                        {!useHQAddress.tax && (
                                            <a href="https://sapnhap.bando.com.vn/" target="_blank" rel="noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-700 p-1 bg-white rounded shadow-sm border border-slate-100" title="Tra cứu sáp nhập">
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        )}
                                    </div>
                                    <input type="text" readOnly={useHQAddress.tax} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.tax ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Tỉnh/Thành phố" value={info.taxAddressCity} onChange={e => setInfo({ ...info, taxAddressCity: e.target.value })} />
                                </div>
                                <div>
                                    <input type="text" readOnly={useHQAddress.tax} className={`w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm ${useHQAddress.tax ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} placeholder="Quốc gia" value={info.taxAddressCountry} onChange={e => setInfo({ ...info, taxAddressCountry: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại kế toán/thuế</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="Để trống nếu dùng SĐT cty" value={info.taxPhone} onChange={e => setInfo({ ...info, taxPhone: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Email nhận thông báo thuế</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="email@example.com" value={info.taxEmail} onChange={e => setInfo({ ...info, taxEmail: e.target.value })} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
            <div className="sticky top-6">
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-green-600" />
                            Kết quả hồ sơ
                        </h3>
                        <div className="flex gap-2">
                             <button onClick={handleGenerate} disabled={loading} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/30 transition-all flex items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed">
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                {loading ? 'Đang xử lý...' : 'Tạo Hồ Sơ'}
                             </button>
                        </div>
                    </div>
                    
                    {result ? (
                        <div className="prose prose-slate max-w-none p-6 bg-slate-50 rounded-xl border border-slate-200 h-[600px] overflow-y-auto custom-scrollbar">
                             <ReactMarkdown>{result}</ReactMarkdown>
                        </div>
                    ) : (
                        <div className="h-[600px] bg-slate-50 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400">
                            <FileText className="w-16 h-16 mb-4 opacity-20" />
                            <p>Điền thông tin và nhấn "Tạo Hồ Sơ" để xem trước và xuất Excel</p>
                        </div>
                    )}

                    {result && (
                        <div className="flex gap-3 mt-6 pt-6 border-t border-slate-100">
                            <button onClick={copyToClipboard} className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition flex items-center justify-center gap-2">
                                <Copy className="w-4 h-4" /> Sao chép tóm tắt
                            </button>
                            <button onClick={handleDownloadExcel} className="flex-1 py-3 bg-green-50 text-green-700 border border-green-200 font-medium rounded-xl hover:bg-green-100 transition flex items-center justify-center gap-2 shadow-sm">
                                <Download className="w-4 h-4" /> Tải về (.xlsx)
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentGenerator;
