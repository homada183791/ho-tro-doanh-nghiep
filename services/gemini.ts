
// Fix: Updated imports to match recommended @google/genai usage
import { GoogleGenAI, Type } from "@google/genai";
import { createAIClient, ChatSession, generateGeminiImage } from "./aiClient";
import { BusinessInfo, ImageSettings, IndustryCode } from "../types";

// Helper to get client - ALWAYS create new to ensure API key freshness if it changes (though environment usually static)
// Fix: Correct initialization using named parameter
const getClient = () => createAIClient();
// Riêng tạo ảnh logo (BrandStudio) vẫn dùng Gemini vì API chuẩn OpenAI dạng chat không tạo ảnh.

/**
 * Helper function to remove Vietnamese accents/diacritics.
 */
const removeVietnameseTones = (str: string): string => {
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  // Some system encode combined accent as individual characters
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); // huyền, sắc, ngã, hỏi, nặng
  str = str.replace(/\u02C6|\u0306|\u031B/g, ""); // â, ê, ă, ơ, ư
  return str;
};

/**
 * Translates business name to English based on specific rules.
 */
export const translateBusinessName = async (vietnameseName: string): Promise<string> => {
  const ai = getClient();
  // Fix: Use gemini-3-flash-preview for basic text tasks
  const modelId = "gemini-3-flash-preview";

  const prompt = `
    Dịch tên doanh nghiệp Việt Nam này sang Tiếng Anh theo các quy tắc nghiêm ngặt sau:
    
    QUY TẮC BẮT BUỘC:
    1. TÊN RIÊNG (Proper name): Phải luôn đứng ở vị trí ĐẦU TIÊN của chuỗi kết quả.
    2. KÝ TỰ VIẾT TẮT (Acronyms/Abbreviations như: ABC, XYZ, VTP, FPT, CP, MTV...): 
       - PHẢI GIỮ NGUYÊN các ký tự này (không dịch sang từ tiếng Anh).
       - Viết lại chúng theo đúng THỨ TỰ TỪ TRÁI SANG PHẢI như trong văn bản gốc.
    3. NGOẠI LỆ CHO TỪ "TNHH":
       - Từ "TNHH" (viết tắt của Trách nhiệm hữu hạn) PHẢI ĐƯỢC DỊCH sang tiếng Anh (Ví dụ: "COMPANY LIMITED" hoặc "LIMITED LIABILITY COMPANY").
    4. CÁC THÀNH PHẦN CÒN LẠI (Công ty, Dịch vụ, Thương mại, Sản xuất...):
       - Dịch sang tiếng Anh tương ứng.
       - Sắp xếp thứ tự các thành phần đã dịch này từ SAU RA TRƯỚC.
    5. QUY TẮC KHÔNG DẤU (BẮT BUỘC): Kết quả cuối cùng PHẢI là chuỗi ký tự KHÔNG CÓ DẤU TIẾNG VIỆT. Loại bỏ hoàn toàn các dấu sắc, huyền, hỏi, ngã, nặng và các ký tự đặc biệt của tiếng Việt (đ, ê, ô, ư...).
    6. ĐỊNH DẠNG: Trả về duy nhất một chuỗi kết quả dưới dạng CHỮ IN HOA KHÔNG DẤU.

    Ví dụ minh họa: 
    - "CÔNG TY TNHH DỊCH VỤ ABC" -> "ABC SERVICE COMPANY LIMITED"
    - "CÔNG TY TNHH MTV THƯƠNG MẠI XYZ" -> "XYZ MTV TRADING COMPANY LIMITED"
    - "CÔNG TY CP ĐẦU TƯ VTP" -> "VTP CP INVESTMENT COMPANY"
    - "CÔNG TY TNHH SẢN XUẤT FPT" -> "FPT PRODUCTION COMPANY LIMITED"

    Tên cần dịch: "${vietnameseName}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });
    // Fix: Access .text property directly and ensure no accents via JS post-processing
    const translated = response.text || "";
    return removeVietnameseTones(translated).trim().toUpperCase();
  } catch (error) {
    console.error("Translation failed", error);
    throw error;
  }
};

/**
 * Analyzes unstructured text to extract business information.
 */
export const analyzeBusinessInput = async (text: string, taskType: 'new' | 'change'): Promise<BusinessInfo> => {
  const ai = getClient();
  
  // Fix: Use gemini-3-flash-preview for fast analysis and extraction
  const modelId = "gemini-3-flash-preview";

  let specificInstruction = "";
  if (taskType === 'change') {
    specificInstruction = `
      Đây là yêu cầu THAY ĐỔI thông tin đăng ký kinh doanh.
      Hãy trích xuất thông tin MỚI/CẬP NHẬT.
    `;
  } else {
    specificInstruction = `
      Đây là yêu cầu THÀNH LẬP MỚI doanh nghiệp.
      Hãy trích xuất đầy đủ thông tin.
    `;
  }

  const prompt = `
    Phân tích đoạn văn bản sau và trích xuất thông tin doanh nghiệp chi tiết.
    Văn bản nguồn: "${text}"

    ${specificInstruction}

    Yêu cầu xử lý chung:
    1. Trích xuất chính xác các trường cơ bản:
       - Tên công ty (Tiếng Việt): Viết IN HOA nếu có thể.
       - Tên công ty (Tiếng Anh): Nếu có. Đảm bảo trích xuất hoặc dịch sang tên KHÔNG DẤU.
       - Tên công ty (Viết tắt): Nếu có.
       - Loại hình.
       - Vốn điều lệ (capital): Viết dưới dạng số tiền đầy đủ kèm đơn vị (Ví dụ: 1.000.000.000 đồng).
       - Vốn điều lệ bằng chữ (capitalInWords): Viết bằng chữ số vốn này (Ví dụ: Một tỷ đồng).
       - Ngành nghề chính (industry).
       - Các ngành nghề kinh doanh khác (subIndustries): Liệt kê tất cả các ngành nghề còn lại dưới dạng danh sách hoặc đoạn văn.

    2. QUY TẮC TRÍCH XUẤT SỐ ĐIỆN THOẠI (QUAN TRỌNG):
       - MẶC ĐỊNH: Số điện thoại doanh nghiệp (phone), Số điện thoại chủ sở hữu (ownerPhone), và Số điện thoại người đại diện pháp luật (repPhone) LÀ GIỐNG NHAU.
       - Ưu tiên trích xuất bất kỳ số điện thoại nào tìm thấy làm "Số điện thoại doanh nghiệp" (phone).
       - Gán giá trị của "phone" cho cả "ownerPhone" và "repPhone".
       - NGOẠI LỆ: Chỉ khi văn bản GHI RÕ một số điện thoại riêng biệt cho Chủ sở hữu hoặc Giám đốc (ví dụ: "SĐT riêng Giám đốc là...", "Chủ sở hữu dùng số...") mà số đó KHÁC với số điện thoại chung của công ty, thì mới trích xuất các số khác nhau.

    3. ĐỊA CHỈ TRỤ SỞ: Phân tách địa chỉ thành 3 phần (Detail, Ward, City).
       - Từ Tỉnh/Thành phố của trụ sở, hãy suy ra "Cơ quan đăng ký kinh doanh" (registrationOffice). Ví dụ: Hà Nội -> "Phòng Đăng ký kinh doanh - Sở Kế hoạch và Đầu tư Thành phố Hà Nội".

    4. CHỦ SỞ HỮU (Owner):
       - Xác định xem chủ sở hữu là CÁ NHÂN (Individual) hay TỔ CHỨC (Organization).
       - Nếu là Tổ Chức: Trích xuất Tên tổ chức, Mã số thuế/QĐ, Ngày cấp, Nơi cấp, Địa chỉ trụ sở tổ chức. Đồng thời trích xuất thông tin Người đại diện theo ủy quyền (Auth Rep).
       - Nếu là Cá Nhân: Trích xuất thông tin cá nhân.
       - ĐỊA CHỈ LIÊN LẠC (Cá nhân/Đại diện): Phân tách thành 3 phần (Detail, Ward, City).

    5. NGƯỜI ĐẠI BIỆN PHÁP LUẬT (Legal Rep/Director):
       - Trích xuất: Tên, Chức danh (Giám đốc/Tổng giám đốc...), Ngày sinh, Số giấy tờ, Ngày cấp, Nơi cấp, Địa chỉ liên lạc.

    6. Nếu thông tin nào thiếu, hãy để chuỗi rỗng ("").
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            registrationOffice: { type: Type.STRING, description: "Tên đầy đủ của phòng ĐKKD (Ví dụ: Phòng Đăng ký kinh doanh - Sở Kế hoạch và Đầu tư Tỉnh X)"},
            name: { type: Type.STRING },
            nameEn: { type: Type.STRING },
            nameAbbr: { type: Type.STRING },
            capital: { type: Type.STRING },
            capitalInWords: { type: Type.STRING, description: "Vốn điều lệ viết bằng chữ" },
            type: { type: Type.STRING },
            
            // Company Contact
            phone: { type: Type.STRING },
            email: { type: Type.STRING },
            website: { type: Type.STRING },
            
            industry: { type: Type.STRING, description: "Ngành nghề kinh doanh chính" },
            subIndustries: { type: Type.STRING, description: "Các ngành nghề kinh doanh khác (phụ)" },
            docDate: { type: Type.STRING, description: "YYYY-MM-DD" },
            
            // HQ Address
            addressDetail: { type: Type.STRING },
            addressWard: { type: Type.STRING },
            addressCity: { type: Type.STRING },

            // Owner Type & Org Info
            ownerType: { type: Type.STRING, enum: ['individual', 'organization'] },
            ownerOrgName: { type: Type.STRING },
            ownerOrgCode: { type: Type.STRING },
            ownerOrgIssueDate: { type: Type.STRING },
            ownerOrgIssuePlace: { type: Type.STRING },
            ownerOrgAddressDetail: { type: Type.STRING },
            ownerOrgAddressWard: { type: Type.STRING },
            ownerOrgAddressCity: { type: Type.STRING },
            ownerOrgAddressCountry: { type: Type.STRING },

            // Owner Personal / Auth Rep
            companyOwner: { type: Type.STRING },
            ownerGender: { type: Type.STRING, description: "Giới tính (Nam/Nữ)" },
            ownerPhone: { type: Type.STRING, description: "SĐT cá nhân của chủ sở hữu/người ủy quyền" },
            ownerDob: { type: Type.STRING },
            ownerIdNumber: { type: Type.STRING },
            ownerIdDate: { type: Type.STRING },
            ownerIdPlace: { type: Type.STRING },
            
            // Owner/Auth Rep Address
            ownerAddressDetail: { type: Type.STRING },
            ownerAddressWard: { type: Type.STRING },
            ownerAddressCity: { type: Type.STRING },
            ownerAddressCountry: { type: Type.STRING },

            // Legal Rep
            ownerName: { type: Type.STRING },
            repGender: { type: Type.STRING, description: "Giới tính (Nam/Nữ)" },
            repPhone: { type: Type.STRING, description: "SĐT cá nhân của giám đốc/đại diện pháp luật" },
            repTitle: { type: Type.STRING },
            repDob: { type: Type.STRING },
            repIdNumber: { type: Type.STRING },
            repIdDate: { type: Type.STRING },
            repIdPlace: { type: Type.STRING },
            
            // Rep Address
            repAddressDetail: { type: Type.STRING },
            repAddressWard: { type: Type.STRING },
            repAddressCity: { type: Type.STRING },
            repAddressCountry: { type: Type.STRING },
          },
          required: ["name", "capital", "type", "ownerName", "industry"],
        }
      }
    });

    // Fix: Access .text property directly
    if (response.text) {
        const result = JSON.parse(response.text) as BusinessInfo;
        // Ensure nameEn is processed to remove tones even in extraction
        if (result.nameEn) {
          result.nameEn = removeVietnameseTones(result.nameEn).toUpperCase();
        }
        return result;
    }
    throw new Error("Empty response from AI");
  } catch (error) {
    console.error("Error analyzing input:", error);
    throw error;
  }
};

/**
 * Maps industry description to VSIC codes.
 */
export const lookupIndustryCodes = async (mainIndustry: string, subIndustries: string): Promise<IndustryCode[]> => {
    const ai = getClient();
    // Fix: Use gemini-3.1-pro-preview for accurate industry analysis with search grounding
    const modelId = "gemini-3.1-pro-preview";

    const prompt = `
      Bạn là chuyên gia về Hệ thống ngành kinh tế Việt Nam.
      
      Nhiệm vụ: Phân tích mô tả ngành nghề kinh doanh sau và chuyển đổi thành danh sách Mã ngành cấp 4 (4 chữ số) TÂN CẬP NHẬT THEO Quyết định số 36/2025/QĐ-TTg (ban hành ngày 29 tháng 9 năm 2025). 
      Tuyệt đối KHÔNG DÙNG Quyết định 27 cũ. Hãy dùng công cụ tìm kiếm nếu cần để đối chiếu mã ngành đúng theo VSIC mới nhất (36/2025/QĐ-TTg).

      Đầu vào:
      - Ngành nghề chính: "${mainIndustry}"
      - Ngành nghề phụ/khác: "${subIndustries}"

      Yêu cầu:
      1. Liệt kê TẤT CẢ các mã ngành phù hợp với mô tả.
      2. Xác định chính xác mã ngành nào tương ứng với "Ngành nghề chính" (isMain = true).
      3. Đặt tên ngành chính xác theo quy định pháp luật hiện hành (QĐ 36/2025/QĐ-TTg). CHÚ Ý QUAN TRỌNG: NẾU TRẢ VỀ HOẶC CÓ LIÊN QUAN ĐẾN MÃ 7020, TÊN BẮT BUỘC VÀ CHÍNH XÁC PHẢI LÀ: "Hoạt động tư vấn quản lý kinh doanh và hoạt động tư vấn quản lý khác".

      Output JSON format:
      [
        { "code": "1234", "name": "Tên ngành theo quy định", "isMain": boolean },
        ...
      ]
    `;

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                // Enable tool hybrid mode and add search tool
                tools: [{ googleSearch: {} }],
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            code: { type: Type.STRING },
                            name: { type: Type.STRING },
                            isMain: { type: Type.BOOLEAN },
                        },
                        required: ["code", "name", "isMain"]
                    }
                }
            }
        });

        // Fix: Access .text property directly
        if (response.text) {
            return JSON.parse(response.text) as IndustryCode[];
        }
        return [];
    } catch (e) {
        console.error("Industry lookup failed", e);
        throw e;
    }
}

export const suggestRelatedIndustryCodes = async (currentCodes: IndustryCode[]): Promise<IndustryCode[]> => {
    const ai = getClient();
    const modelId = "gemini-3.1-pro-preview";

    const prompt = `
      Bạn là chuyên gia về Hệ thống ngành kinh tế Việt Nam (VSIC) theo Quyết định số 36/2025/QĐ-TTg (ban hành ngày 29/09/2025).
      
      Nhiệm vụ: Dựa vào danh sách mã ngành hiện tại của doanh nghiệp, hãy suy luận logic và gợi ý THÊM các mã ngành liên quan THIẾT THỰC để mở rộng hệ sinh thái hoạt động theo đúng các quy tắc sau:
      - QUY TẮC 1: Nếu có mã ngành "Sản xuất" thì bắt buộc thêm mã "Bán buôn" cho mặt hàng sản xuất đó.
      - QUY TẮC 2: Nếu có mã ngành "Bán buôn" thì bắt buộc thêm mã ngành "Bán lẻ" cho mặt hàng đó và ngược lại (Bán lẻ -> thêm Bán buôn).
      - QUY TẮC 3: Nếu ngành hiện tại là "Xây dựng" (hoặc kinh doanh vật liệu xây dựng), THÊM CHỌN LỌC các mã ngành liên quan TRỰC TIẾP đến:
         * Xây dựng, thi công, thiết kế và thẩm tra công trình, nội thất.
         * Bán buôn, bán lẻ trực tiếp vật liệu xây dựng (gạch, ngói, xi măng, đá, cát, sàn gỗ, tre, nứa...) và thiết bị vệ sinh.
         * Lưu kho, bãi, và vận chuyển hàng hóa, vật liệu xây dựng.
      - QUY TẮC 4: Nếu ngành chính là một ngành "Dịch vụ", hãy THÊM các ngành về tư vấn, thiết kế, phục vụ trực tiếp cho dịch vụ đó.
      - QUY TẮC 5: CHỈ GỢI Ý NGÀNH CÓ LIÊN QUAN TRỰC TIẾP. Tuyệt đối KHÔNG ĐƯỢC trả về các mã ngành không liên quan (Ví dụ: Đang kinh doanh vật liệu xây dựng thì KHÔNG ĐƯỢC thêm Mã quảng cáo, Mã nhiếp ảnh, tư vấn quản lý... trừ khi thực sự phù hợp).
      
      LƯU Ý ĐẶC BIỆT QUAN TRỌNG (BUỘC PHẢI TUÂN THỦ): 
      + CHỈ SỬ DỤNG MÃ VÀ TÊN NGÀNH THEO QUYẾT ĐỊNH SỐ 36/2025/QĐ-TTg (mới nhất).
      + NẾU TRẢ VỀ HOẶC CÓ LIÊN QUAN ĐẾN MÃ 7020, TÊN NGÀNH BẮT BUỘC VÀ CHÍNH XÁC PHẢI LÀ: "Hoạt động tư vấn quản lý kinh doanh và hoạt động tư vấn quản lý khác" (Tuyệt đối không được dùng tên "Hoạt động tư vấn quản lý"). Đây là điều tối kỵ, không được sai lệch tên.
      + Trả về danh sách mở rộng tinh gọn, chính xác dưới dạng JSON list. Không trùng lặp các mã đã có ở đầu vào. isMain luôn bằng false.
      
      Danh sách mã ngành hiện tại:
      ${JSON.stringify(currentCodes, null, 2)}
      
      Output JSON format:
      [
        { "code": "Mã ngành 4 số (theo 36/2025)", "name": "Tên ngành chuẩn", "isMain": false }
      ]
    `;

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                tools: [{ googleSearch: {} }],
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            code: { type: Type.STRING },
                            name: { type: Type.STRING },
                            isMain: { type: Type.BOOLEAN },
                        },
                        required: ["code", "name", "isMain"]
                    }
                }
            }
        });

        if (response.text) {
            return JSON.parse(response.text) as IndustryCode[];
        }
        return [];
    } catch (e) {
        console.error("Suggestion lookup failed", e);
        throw e;
    }
}

/**
 * Updates address based on 2025 Administrative Unit Arrangement (Vietnam).
 */
export const updateAdministrativeDivisions = async (
  detail: string,
  ward: string,
  city: string
): Promise<{ detail: string; ward: string; city: string; updated: boolean; reason?: string }> => {
  const ai = getClient();
  // Fix: Use gemini-3-flash-preview for geographic updates
  const modelId = "gemini-3-flash-preview";

  // Data from PDF provided by user
  const provinceMapping = `
  Dữ liệu quy hoạch Sáp nhập Tỉnh/Thành phố (áp dụng từ 01/07/2025):
  - Tỉnh/Thành MỚI: Tuyên Quang <- Cũ: Hà Giang, Tuyên Quang
  - Tỉnh/Thành MỚI: Lào Cai <- Cũ: Yên Bái, Lào Cai
  - Tỉnh/Thành MỚI: Thái Nguyên <- Cũ: Bắc Kạn, Thái Nguyên
  - Tỉnh/Thành MỚI: Phú Thọ <- Cũ: Vĩnh Phúc, Hòa Bình, Phú Thọ
  - Tỉnh/Thành MỚI: Bắc Ninh <- Cũ: Bắc Giang, Bắc Ninh
  - Tỉnh/Thành MỚI: Hưng Yên <- Cũ: Thái Bình, Hưng Yên
  - Tỉnh/Thành MỚI: Hải Phòng <- Cũ: Hải Dương, Hải Phòng
  - Tỉnh/Thành MỚI: Ninh Bình <- Cũ: Hà Nam, Nam Định, Ninh Bình
  - Tỉnh/Thành MỚI: Quảng Trị <- Cũ: Quảng Bình, Quảng Trị
  - Tỉnh/Thành MỚI: Đà Nẵng <- Cũ: Quảng Nam, Đà Nẵng
  - Tỉnh/Thành MỚI: Quảng Ngãi <- Cũ: Kon Tum, Quảng Ngãi
  - Tỉnh/Thành MỚI: Gia Lai <- Cũ: Bình Định, Gia Lai
  - Tỉnh/Thành MỚI: Khánh Hòa <- Cũ: Ninh Thuận, Khánh Hòa
  - Tỉnh/Thành MỚI: Lâm Đồng <- Cũ: Đắk Nông, Bình Thuận, Lâm Đồng
  - Tỉnh/Thành MỚI: Đắk Lắk <- Cũ: Phú Yên, Đắk Lắk
  - Tỉnh/Thành MỚI: Thành phố Hồ Chí Minh <- Cũ: TP.HCM, Bà Rịa – Vũng Tàu, Bình Dương
  - Tỉnh/Thành MỚI: Đồng Nai <- Cũ: Bình Phước, Đồng Nai
  - Tỉnh/Thành MỚI: Tây Ninh <- Cũ: Long An, Tây Ninh
  - Tỉnh/Thành MỚI: Cần Thơ <- Cũ: Cần Thơ, Sóc Trăng, Hậu Giang
  - Tỉnh/Thành MỚI: Vĩnh Long <- Cũ: Bến Tre, Trà Vinh, Vĩnh Long
  - Tỉnh/Thành MỚI: Đồng Tháp <- Cũ: Tiền Giang, Đồng Tháp
  - Tỉnh/Thành MỚI: Cà Mau <- Cũ: Bạc Liêu, Cà Mau
  - Tỉnh/Thành MỚI: An Giang <- Cũ: Kiên Giang, An Giang
  - Các tỉnh giữ nguyên tên: Cao Bằng, Điện Biên, Hà Tĩnh, Lai Châu, Lạng Sơn, Nghệ An, Quảng Ninh, Thanh Hóa, Sơn La, Hà Nội, Huế.
  `;

  const prompt = `
    Bạn là chuyên gia về địa lý hành chính Việt Nam.
    Nhiệm vụ: Cập nhật và chuẩn hóa địa chỉ theo Quy hoạch sắp xếp đơn vị hành chính cấp tỉnh mới nhất (hiệu lực 01/07/2025).

    Dữ liệu đầu vào:
    - Detail: "${detail}"
    - Ward: "${ward}"
    - City: "${city}"

    ${provinceMapping}

    YÊU CẦU XỬ LÝ:
    1. QUAN TRỌNG NHẤT: Kiểm tra "City" (Tỉnh/Thành phố) đầu vào.
       - Nếu thuộc danh sách "Cũ", hãy đổi tên sang "Tỉnh/Thành MỚI" tương ứng trong danh sách quy hoạch trên.
       - Ví dụ: Input City="Bà Rịa - Vũng Tàu" -> Output City="Thành phố Hồ Chí Minh".
       - Ví dụ: Input City="Hà Giang" -> Output City="Tuyên Quang".
       - Ví dụ: Input City="Quảng Nam" -> Output City="Đà Nẵng".
    
    2. Nếu tên Tỉnh/Thành phố không thay đổi (hoặc đã đúng tên mới), giữ nguyên và chuẩn hóa (thêm tiền tố Tỉnh/Thành phố).

    3. XỬ LÝ QUẬN/HUYỆN: 
       - Nếu người dùng nhập Quận/Huyện trong trường "Ward" hoặc "City", hãy loại bỏ nó khỏi kết quả Output.
       - Chỉ giữ lại Xã/Phường/Thị trấn trong "ward" and Tỉnh/TP trong "city".
    
    4. Bổ sung Google Search (Mô phỏng): Nếu phát hiện thay đổi về đơn vị hành chính cấp Xã/Phường (sáp nhập xã), hãy tự động cập nhật tên mới nếu bạn có kiến thức (nếu không giữ nguyên).

    Output JSON format:
    {
      "detail": "string",
      "ward": "string (Tên Phường/Xã đầy đủ, KHÔNG có Quận/Huyện)",
      "city": "string (Tên Tỉnh/TP MỚI đầy đủ theo quy hoạch 2025)",
      "updated": boolean,
      "reason": "string (Giải thích ngắn gọn: 'Sáp nhập [Tên cũ] vào [Tên mới] theo quy hoạch 2025' hoặc 'Đã chuẩn hóa địa chỉ')"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detail: { type: Type.STRING },
            ward: { type: Type.STRING },
            city: { type: Type.STRING },
            updated: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          }
        }
      }
    });

    // Fix: Access .text property directly
    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("Empty response");
  } catch (error) {
    console.error("Address update failed", error);
    throw error;
  }
};

/**
 * Specifically lookups for Ward/Commune changes due to 2024-2025 mergers.
 */
export const lookupWard = async (ward: string, city: string): Promise<{ ward: string; updated: boolean; reason?: string }> => {
  const ai = getClient();
  const modelId = "gemini-3-flash-preview";

  const prompt = `
    Bạn là chuyên gia về sáp nhập đơn vị hành chính cấp xã/phường tại Việt Nam theo các Nghị quyết của Ủy ban Thường vụ Quốc hội (giai đoạn 2023-2025).
    
    Đầu vào:
    - Phường/Xã hiện tại: "${ward}"
    - Tỉnh/Thành phố: "${city}"
    
    Nhiệm vụ:
    1. Kiểm tra xem Phường/Xã này có bị sáp nhập, đổi tên hoặc chuyển sang đơn vị hành chính mới nào không theo quy hoạch mới nhất (có hiệu lực từ năm 2024 hoặc 2025).
    2. Nếu có thay đổi, hãy trả về tên Phường/Xã MỚI nhất chính xác theo văn bản quy phạm pháp luật.
    3. Nếu không có thay đổi hoặc đây đã là đơn vị hành chính mới nhất, giữ nguyên tên và báo updated = false.
    4. Sử dụng công cụ tìm kiếm nếu cần thiết để đảm bảo thông tin cập nhật từng ngày (ví dụ: việc sáp nhập xã ở Hà Nội, TP.HCM, Nam Định, Nghệ An...).
    
    Output JSON format:
    {
      "ward": "string (Tên Phường/Xã đầy đủ, ví dụ: 'Phường Phương Canh' hoặc 'Xã Hồng Phong')",
      "updated": boolean,
      "reason": "string (Giải thích ngắn gọn: 'Sáp nhập xã A vào xã B' hoặc 'Giữ nguyên')"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ward: { type: Type.STRING },
            updated: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          }
        },
        tools: [{ googleSearch: {} }]
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("Empty response");
  } catch (error) {
    console.error("Ward lookup failed", error);
    throw error;
  }
};

/**
 * Extracts information from ID Card images (Front and/or Back).
 */
/** Bỏ các giá trị "rỗng giả" model hay trả (null, N/A, "không có"...) để không ghi đè dữ liệu đang có. */
const cleanValue = (v: any): string => {
  if (v === null || v === undefined) return "";
  const t = String(v).trim();
  return /^(null|undefined|n\/?a|none|-+|không có|không rõ|không xác định|chưa rõ|trống)$/i.test(t) ? "" : t;
};

/**
 * Chuẩn hoá kết quả trích xuất: làm sạch giá trị, và với giấy tờ cá nhân thì nếu model lỡ điền vào
 * nhóm authRep* / orgLegalRep* (hoặc dùng tên khác) thì chuyển về đúng các trường name, dob, idNumber...
 */
const normalizeExtracted = (raw: any, mode: 'person' | 'organization') => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw && typeof raw === "object" ? raw : {})) out[k] = cleanValue(v);
  if (mode !== 'person') return out as any;
  const base = ["name", "gender", "dob", "idNumber", "idDate", "idPlace", "idDocumentType", "addressDetail", "addressWard", "addressCity", "addressCountry"];
  const alias: Record<string, string[]> = {
    name: ["fullName", "full_name", "hoTen"],
    dob: ["dateOfBirth", "birthDate", "ngaySinh"],
    idNumber: ["id", "idNo", "cccd", "number", "soGiayTo"],
    idDate: ["issueDate", "dateOfIssue", "ngayCap"],
    idPlace: ["issuePlace", "placeOfIssue", "noiCap"],
    gender: ["sex", "gioiTinh"],
  };
  for (const key of base) {
    if (out[key]) continue;
    const cap = key[0].toUpperCase() + key.slice(1);
    const candidates = [`authRep${cap}`, `orgLegalRep${cap}`, ...(alias[key] || [])];
    const found = candidates.map((c) => out[c]).find(Boolean);
    if (found) out[key] = found;
  }
  return out as any;
};

export const extractIdCardInfo = async (
  frontImage?: { base64: string, mimeType: string },
  backImage?: { base64: string, mimeType: string },
  extraFiles?: { base64: string, mimeType: string }[],
  // 'person': giấy tờ của MỘT cá nhân (chủ sở hữu cá nhân / người đại diện); 'organization': hồ sơ tổ chức
  mode: 'person' | 'organization' = 'organization'
): Promise<{
  name?: string;
  gender?: string;
  dob?: string;
  idNumber?: string;
  idDate?: string;
  idPlace?: string;
  idDocumentType?: string;
  addressDetail?: string;
  addressWard?: string;
  addressCity?: string;
  addressCountry?: string;
  // Auth Rep Fields (For Organization)
  orgName?: string;
  orgCode?: string;
  authRepName?: string;
  authRepGender?: string;
  authRepIdNumber?: string;
  authRepDob?: string;
  authRepIdDate?: string;
  authRepIdPlace?: string;
  authRepIdDocumentType?: string;
  authRepAddressDetail?: string;
  authRepAddressWard?: string;
  authRepAddressCity?: string;
  authRepAddressCountry?: string;
  // NEW: Organization Legal Representative (Explicitly extracted from Org Docs)
  orgLegalRepName?: string;
  orgLegalRepGender?: string;
  orgLegalRepIdNumber?: string;
  orgLegalRepDob?: string;
  orgLegalRepIdDate?: string;
  orgLegalRepIdPlace?: string;
  orgLegalRepIdDocumentType?: string;
  orgLegalRepAddressDetail?: string;
  orgLegalRepAddressWard?: string;
  orgLegalRepAddressCity?: string;
  orgLegalRepAddressCountry?: string;
}> => {
  const ai = getClient();
  // Fix: Use gemini-3-flash-preview for vision-based extraction
  const modelId = "gemini-3-flash-preview"; 

  const prompt = `
    Phân tích các tệp tin được cung cấp (Hình ảnh hoặc PDF).
    Đây có thể là:
    - Căn cước công dân (CCCD) / Chứng minh nhân dân (CMND).
    - Căn cước điện tử (VNeID).
    - Hộ chiếu (Passport).
    - Giấy chứng nhận đăng ký doanh nghiệp (đối với tổ chức).
    - Quyết định thành lập (đối với tổ chức).

    Nhiệm vụ: Trích xuất thông tin định danh chính xác nhất từ các tài liệu này.
    
    ĐẶC BIỆT LƯU Ý KHI CÓ NHIỀU TÀI LIỆU (Trường hợp Tổ chức):
    Nếu bạn thấy cả Giấy chứng nhận đăng ký doanh nghiệp VÀ Căn cước công dân/Hộ chiếu:
    1. Thông tin TỔ CHỨC (lấy từ ĐKKD/Quyết định):
       - name (orgName): Tên công ty/tổ chức.
       - idNumber (orgCode): Mã số doanh nghiệp/Mã số thuế.
       - idDate: Ngày cấp/Ngày thay đổi (Ưu tiên ngày thay đổi gần nhất).
       - address*: Địa chỉ trụ sở.
       
    2. Thông tin NGƯỜI ĐẠI DIỆN THEO PHÁP LUẬT CỦA TỔ CHỨC (Lấy từ ĐKKD):
       - Tìm mục "Người đại diện theo pháp luật" trong Giấy ĐKKD.
       - Trích xuất: orgLegalRepName (Họ tên), orgLegalRepIdNumber (Số giấy tờ), orgLegalRepAddress... (Địa chỉ).
       
    3. Thông tin NGƯỜI ĐẠI DIỆN THEO ỦY QUYỀN (thường lấy từ CCCD/Hộ chiếu đi kèm):
       - authRepName: Họ và tên người trong CCCD.
       - authRepIdNumber: Số CCCD/CMND.
       - authRepDob: Ngày sinh.
       - authRepIdDate, authRepIdPlace: Ngày cấp, Nơi cấp.
       - authRepAddress*: Địa chỉ thường trú.

    NẾU CHỈ CÓ MỘT LOẠI TÀI LIỆU (Cá nhân hoặc Tổ chức đơn lẻ):
    - Trích xuất vào các trường name, dob, idNumber như bình thường.

    CHI TIẾT TRƯỜNG DỮ LIỆU:

    1. TÊN (Full Name / Tên tổ chức): 
       - Chuyển tất cả sang CHỮ IN HOA.

    2. NGÀY SINH (Date of Birth) - Chỉ áp dụng cho cá nhân/người đại diện. Định dạng DD/MM/YYYY.

    3. SỐ ĐỊNH DANH (ID Number):
       - Cá nhân: Số CCCD, Số CMND, hoặc Số Hộ chiếu.
       - Tổ chức: MÃ SỐ DOANH NGHIỆP / MÃ SỐ THUẾ / SỐ QĐ THÀNH LẬP.

    4. LOẠI GIẤY TỜ PHÁP LÝ (Document Type):
       - Nếu là Căn cước công dân (CCCD) thì ghi chính xác là: "Căn cước công dân"
       - Nếu là Thẻ Căn cước (mẫu mới) thì ghi chính xác là: "Căn cước"
       - Nếu là Hộ chiếu thì ghi: "Hộ chiếu Việt Nam" hoặc "Hộ chiếu nước ngoài"
       - Tuyệt đối không ghi gộp "Căn cước công dân/căn cước". Phân biệt rõ ràng dựa trên tiêu đề của thẻ.

    5. NGÀY CẤP (Date of Issue): Định dạng DD/MM/YYYY.
       - Đối với Giấy chứng nhận đăng ký doanh nghiệp (quan trọng):
         + ƯU TIÊN SỐ 1: Tìm thông tin "Đăng ký thay đổi lần thứ...". Nếu tìm thấy ngày thay đổi gần nhất, BẮT BUỘC lấy ngày này làm ngày cấp.
         + ƯU TIÊN SỐ 2: Nếu KHÔNG tìm thấy thông tin đăng ký thay đổi (tức là chưa từng thay đổi hoặc văn bản không ghi), BẮT BUỘC phải lấy ngày "Đăng ký lần đầu...".
       - Cảnh báo: Tuyệt đối KHÔNG trích xuất mã số thuế vào trường ngày cấp.

    5. NƠI CẤP (Place of Issue):
       - CCCD gắn chip: "Cục Cảnh sát quản lý hành chính về trật tự xã hội".
       - Thẻ Căn cước (mới 2024): "Bộ Công an".
       - Hộ chiếu: "Cục Quản lý xuất nhập cảnh".
       - Giấy ĐKKD: Tên Sở Kế hoạch và Đầu tư cấp (Ví dụ: "Phòng Đăng ký kinh doanh - Sở KHĐT Hà Nội").

    6. ĐỊA CHỈ (Permanent Address / Trụ sở chính):
       - Phân tách thành: addressDetail (Số nhà, đường, thôn), addressWard (Phường/Xã), addressCity (Tỉnh/Thành phố).
       - addressCountry: Mặc định "Việt Nam" nếu không ghi rõ quốc gia khác.
       - QUAN TRỌNG: Loại bỏ tên Quận/Huyện khỏi các trường chi tiết.

    Nếu trường nào không tìm thấy trong tài liệu, trả về chuỗi rỗng.
  `;

  const isPerson = mode === 'person';
  const personNote = `
    QUAN TRỌNG: Các tệp dưới đây là giấy tờ của MỘT CÁ NHÂN (mặt trước và mặt sau của cùng một thẻ/hộ chiếu).
    Gộp thông tin của cả hai mặt và điền vào các trường: name, gender, dob, idNumber, idDocumentType, idDate, idPlace,
    addressDetail, addressWard, addressCity, addressCountry.
    KHÔNG dùng các trường bắt đầu bằng org, authRep, orgLegalRep (để trống các trường đó).
    Mặt trước thường có: họ tên, số, ngày sinh, giới tính, nơi thường trú. Mặt sau thường có: ngày cấp, nơi cấp (và nơi thường trú với thẻ Căn cước mẫu mới).
  `;
  const parts: any[] = [{ text: isPerson ? prompt + personNote : prompt }];
  
  if (frontImage) {
      parts.push({ inlineData: { data: frontImage.base64, mimeType: frontImage.mimeType }});
      parts.push({ text: isPerson ? "Mặt trước giấy tờ cá nhân" : "Tài liệu chính (Mặt trước / ĐKKD)" });
  }
  if (backImage) {
      parts.push({ inlineData: { data: backImage.base64, mimeType: backImage.mimeType }});
      parts.push({ text: isPerson ? "Mặt sau giấy tờ cá nhân" : "Tài liệu phụ 1 (Mặt sau / Quyết định / CCCD Auth Rep)" });
  }
  
  // Handle extra files (Multi-upload for Auth Rep)
  if (extraFiles && extraFiles.length > 0) {
      extraFiles.forEach((file, index) => {
          parts.push({ inlineData: { data: file.base64, mimeType: file.mimeType }});
          parts.push({ text: isPerson ? `Trang bổ sung ${index + 2} của giấy tờ cá nhân` : `Tài liệu bổ sung ${index + 2} (CCCD Auth Rep Mặt sau/Khác)` });
      });
  }

  if (parts.length === 1) return {}; // No images

  try {
     const response = await ai.models.generateContent({
        model: modelId,
        contents: { parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    gender: { type: Type.STRING, description: "Giới tính (Nam/Nữ)" },
                    dob: { type: Type.STRING },
                    idNumber: { type: Type.STRING },
                    idDate: { type: Type.STRING },
                    idPlace: { type: Type.STRING },
                    idDocumentType: { type: Type.STRING, description: "Loại giấy tờ: Căn cước công dân, Căn cước, Hộ chiếu Việt Nam, Hộ chiếu nước ngoài" },
                    addressDetail: { type: Type.STRING },
                    addressWard: { type: Type.STRING },
                    addressCity: { type: Type.STRING },
                    addressCountry: { type: Type.STRING },
                    
                    // Explicit Organization fields to avoid confusion
                    orgName: { type: Type.STRING },
                    orgCode: { type: Type.STRING },
                    
                    // Auth Rep fields (From ID cards)
                    authRepName: { type: Type.STRING },
                    authRepGender: { type: Type.STRING, description: "Giới tính (Nam/Nữ)" },
                    authRepIdNumber: { type: Type.STRING },
                    authRepDob: { type: Type.STRING },
                    authRepIdDate: { type: Type.STRING },
                    authRepIdPlace: { type: Type.STRING },
                    authRepIdDocumentType: { type: Type.STRING, description: "Loại giấy tờ: Căn cước công dân, Căn cước, Hộ chiếu Việt Nam, Hộ chiếu nước ngoài" },
                    authRepAddressDetail: { type: Type.STRING },
                    authRepAddressWard: { type: Type.STRING },
                    authRepAddressCity: { type: Type.STRING },
                    authRepAddressCountry: { type: Type.STRING },

                    // Organization Legal Rep fields (From Org Docs)
                    orgLegalRepName: { type: Type.STRING },
                    orgLegalRepGender: { type: Type.STRING, description: "Giới tính (Nam/Nữ)" },
                    orgLegalRepIdNumber: { type: Type.STRING },
                    orgLegalRepDob: { type: Type.STRING },
                    orgLegalRepIdDate: { type: Type.STRING },
                    orgLegalRepIdPlace: { type: Type.STRING },
                    orgLegalRepIdDocumentType: { type: Type.STRING, description: "Loại giấy tờ: Căn cước công dân, Căn cước, Hộ chiếu Việt Nam, Hộ chiếu nước ngoài" },
                    orgLegalRepAddressDetail: { type: Type.STRING },
                    orgLegalRepAddressWard: { type: Type.STRING },
                    orgLegalRepAddressCity: { type: Type.STRING },
                    orgLegalRepAddressCountry: { type: Type.STRING },
                }
            }
        }
     });

     if (!response.text) return {};
     const raw = JSON.parse(response.text);
     console.log("[AI] Kết quả trích xuất giấy tờ:", raw);
     return normalizeExtracted(raw, mode);
  } catch (e) {
      console.error("ID Extraction failed", e);
      throw e;
  }
}

/**
 * Generates a legal document based on business info and an optional uploaded sample.
 */
export const generateLegalDocument = async (
  info: BusinessInfo,
  taskType: 'new' | 'change',
  sampleFileBase64?: string,
  sampleMimeType?: string
): Promise<string> => {
  const ai = getClient();
  
  // Fix: Use gemini-3-pro-preview for complex reasoning and legal drafting
  const modelId = "gemini-3-pro-preview";

  let taskPrompt = "";
  if (taskType === 'change') {
    taskPrompt = `
      Mục tiêu: Soạn thảo bộ hồ sơ THAY ĐỔI nội dung đăng ký doanh nghiệp.
      Bộ hồ sơ thường bao gồm: 
      1. Thông báo thay đổi nội dung đăng ký doanh nghiệp.
      2. Biên bản họp (đối với cty TNHH 2TV trở lên/Cổ phần).
      3. Quyết định.
    `;
  } else {
    taskPrompt = `
      Mục tiêu: Soạn thảo bộ hồ sơ THÀNH LẬP MỚI doanh nghiệp.
      Bộ hồ sơ thường bao gồm:
      1. Giấy đề nghị đăng ký doanh nghiệp.
      2. Điều lệ công ty.
      3. Danh sách thành viên/cổ đông (nếu có).
    `;
  }

  // Format date correctly for Vietnam Legal Documents
  let dateStr = "ngày ... tháng ... năm ...";
  if (info.docDate) {
    const d = new Date(info.docDate);
    if (!isNaN(d.getTime())) {
      dateStr = `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
    }
  }

  // Helper to construct full address string
  const buildAddress = (detail: string, ward: string, city: string, country: string) => {
    return [detail, ward, city, country || "Việt Nam"]
      .filter(part => part && part.trim() !== "")
      .join(", ");
  };

  const fullAddressHQ = buildAddress(info.addressDetail, info.addressWard, info.addressCity, info.addressCountry);
  const fullAddressOwner = buildAddress(info.ownerAddressDetail, info.ownerAddressWard, info.ownerAddressCity, info.ownerAddressCountry);
  const fullAddressRep = buildAddress(info.repAddressDetail, info.repAddressWard, info.repAddressCity, info.repAddressCountry);
  
  const fullAddressOrg = info.ownerType === 'organization' 
    ? buildAddress(info.ownerOrgAddressDetail, info.ownerOrgAddressWard, info.ownerOrgAddressCity, info.ownerOrgAddressCountry)
    : "";

  let ownerInfoBlock = "";
  if (info.ownerType === 'organization') {
    ownerInfoBlock = `
    Thông tin CHỦ SỞ HỮU (TỔ CHỨC):
    - Tên tổ chức: ${info.ownerOrgName}
    - Mã số doanh nghiệp/QĐ thành lập: ${info.ownerOrgCode}
    - Ngày cấp: ${info.ownerOrgIssueDate} - Nơi cấp: ${info.ownerOrgIssuePlace}
    - Địa chỉ trụ sở chính của tổ chức: ${fullAddressOrg}
    
    Thông tin NGƯỜI ĐẠI DIỆN THEO ỦY QUYỀN của Chủ sở hữu (Đại diện vốn):
    - Họ tên: ${info.companyOwner}
    - SĐT Cá nhân: ${info.ownerPhone}
    - Ngày sinh: ${info.ownerDob}
    - Số giấy tờ (CCCD/CMND): ${info.ownerIdNumber}
    - Ngày cấp: ${info.ownerIdDate} - Nơi cấp: ${info.ownerIdPlace}
    - Địa chỉ liên lạc: ${fullAddressOwner}
    `;
  } else {
    ownerInfoBlock = `
    Thông tin CHỦ SỞ HỮU (CÁ NHÂN):
    - Họ tên: ${info.companyOwner}
    - SĐT Cá nhân: ${info.ownerPhone}
    - Ngày sinh: ${info.ownerDob}
    - Số giấy tờ (CCCD/CMND): ${info.ownerIdNumber}
    - Ngày cấp: ${info.ownerIdDate} - Nơi cấp: ${info.ownerIdPlace}
    - Địa chỉ liên lạc: ${fullAddressOwner}
    `;
  }

  // Format Industry Codes Table for insertion - Order: Mã ngành | Tên ngành
  let industryTableStr = "";
  if (info.industryCodes && info.industryCodes.length > 0) {
      industryTableStr = `
      DANH SÁCH NGÀNH NGHỀ KINH DOANH:
      | STT | Mã ngành | Tên ngành | Ngành chính |
      |-----|----------|-----------|-------------|
      ${info.industryCodes.map((c, i) => `| ${i + 1} | ${c.code} | ${c.name} | ${c.isMain ? 'X' : ''} |`).join('\n')}
      `;
  }

  let prompt = `
    Bạn là một chuyên gia pháp lý và luật sư giỏi tại Việt Nam. 
    ${taskPrompt}
    
    Thông tin chung:
    - Cơ quan tiếp nhận hồ sơ (Phần "Kính gửi"): ${info.registrationOffice}
    - Thời gian ký: ${dateStr}

    Thông tin doanh nghiệp:
    - Tên công ty (Tiếng Việt): ${info.name}
    - Tên công ty (Tiếng Anh): ${info.nameEn}
    - Tên công ty (Viết tắt): ${info.nameAbbr}
    - Loại hình: ${info.type}
    - Địa chỉ trụ sở chính: ${fullAddressHQ}
    - Điện thoại doanh nghiệp: ${info.phone}
    - Email doanh nghiệp: ${info.email}
    - Website: ${info.website}
    - Vốn điều lệ: ${info.capital}
    - Vốn điều lệ (bằng chữ): ${info.capitalInWords}
    - Ngành nghề chính: ${info.industry}
    - Các ngành nghề kinh doanh khác (phụ): ${info.subIndustries}
    ${industryTableStr}

    ${ownerInfoBlock}

    Thông tin NGƯỜI ĐẠI DIỆN THEO PHÁP LUẬT:
    - Họ tên: ${info.ownerName}
    - Chức danh: ${info.repTitle}
    - SĐT Cá nhân: ${info.repPhone}
    - Ngày sinh: ${info.repDob}
    - Số giấy tờ (CCCD/CMND): ${info.repIdNumber}
    - Ngày cấp: ${info.repIdDate} - Nơi cấp: ${info.repIdPlace}
    - Địa chỉ liên lạc: ${fullAddressRep}

    Yêu cầu đặc biệt về xử lý hình ảnh (nếu có):
    - Nếu có ảnh CCCD/Hộ chiếu tải lên, ưu tiên lấy thông tin chính xác từ ảnh để điền vào văn bản (thay thế thông tin nhập tay nếu ảnh rõ nét hơn).

    Yêu cầu đầu ra:
    Trình bày kết quả dưới dạng Markdown chuyên nghiệp.
    Tách biệt các loại giấy tờ rõ ràng (dùng heading ### Tên Giấy Tờ).
    Phần "Kính gửi" trong các đơn từ PHẢI SỬ DỤNG chính xác tên cơ quan: "${info.registrationOffice}".
    Phần ký tên sử dụng địa danh kèm thời gian: "[Địa danh], ${dateStr}" (Địa danh lấy từ Tỉnh/Thành phố trong địa chỉ trụ sở).
    Nếu có danh sách ngành nghề, hãy kẻ bảng rõ ràng trong văn bản Điều lệ hoặc Giấy đề nghị.
  `;

  // Construct parts array
  const parts: any[] = [{ text: prompt }];

  // Add Sample File if exists
  if (sampleFileBase64 && sampleMimeType) {
    parts.push({
      inlineData: {
        data: sampleFileBase64,
        mimeType: sampleMimeType
      }
    });
  }

  // Add Owner ID Card images if exists
  if (info.ownerIdCard) {
    const label = info.ownerType === 'organization' ? "Người đại diện ủy quyền" : "Chủ sở hữu";
    if (info.ownerIdCard.front) {
         parts.push({ inlineData: { data: info.ownerIdCard.front.base64, mimeType: info.ownerIdCard.front.mimeType } });
         parts.push({ text: `Tài liệu 1 (Mặt trước) của ${label}.` });
    }
    if (info.ownerIdCard.back) {
         parts.push({ inlineData: { data: info.ownerIdCard.back.base64, mimeType: info.ownerIdCard.back.mimeType } });
         parts.push({ text: `Tài liệu 2 (Mặt sau) của ${label}.` });
    }
    // Handle Extra Files in prompt
    if (info.ownerIdCard.extras && info.ownerIdCard.extras.length > 0) {
        info.ownerIdCard.extras.forEach((file, index) => {
            parts.push({ inlineData: { data: file.base64, mimeType: file.mimeType } });
            parts.push({ text: `Tài liệu bổ sung ${index + 1} của ${label}.` });
        });
    }
  }

  // Add Rep ID Card images if exists
  if (info.repIdCard) {
     const label = "Người đại diện pháp luật (Giám đốc)";
     if (info.repIdCard.front) {
         parts.push({ inlineData: { data: info.repIdCard.front.base64, mimeType: info.repIdCard.front.mimeType } });
         parts.push({ text: `Tài liệu 1 (Mặt trước) của ${label}.` });
    }
    if (info.repIdCard.back) {
         parts.push({ inlineData: { data: info.repIdCard.back.base64, mimeType: info.repIdCard.back.mimeType } });
         parts.push({ text: `Tài liệu 2 (Mặt sau) của ${label}.` });
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: {
        // Fix: Added thinking budget for Gemini 3 series reasoning
      }
    });
    // Fix: Access .text property directly
    return response.text || "Không thể tạo văn bản. Vui lòng thử lại.";
  } catch (error) {
    console.error("Error generating document:", error);
    throw error;
  }
};

/**
 * Creates a chat session for legal advice.
 */
export const createLegalChat = (): ChatSession => {
  const ai = getClient();
  return ai.chats.create({
    // Fix: Use gemini-3-pro-preview for complex chat tasks
    model: "gemini-3-pro-preview",
    config: {
      systemInstruction: "Bạn là LegalBiz AI, trợ lý pháp lý ảo chuyên nghiệp. Bạn có kiến thức sâu rộng về Luật Doanh nghiệp 2020, Luật Đầu tư, và các quy định hành chính tại Việt Nam. Nhiệm vụ của bạn là giải đáp thắc mắc, hướng dẫn thủ tục một cách ngắn gọn, chính xác và dễ hiểu. Luôn trích dẫn cơ sở pháp lý khi có thể.",
    },
  });
};

/**
 * Generates brand assets (Logos/Images) using Gemini 3 Pro Image.
 */
export const generateBrandAsset = async (settings: ImageSettings): Promise<string[]> => {
    // Ưu tiên gemini-3-pro-image-preview (hỗ trợ 1K/2K/4K); nếu key không có lượt thì thử model ảnh khác.
    // Key lấy từ "Cài đặt API" trên web (hoặc VITE_GEMINI_API_KEY trong .env.local).
    try {
        const response: any = await generateGeminiImage(
            ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
            (model) => ({
                contents: {
                    parts: [{ text: settings.prompt }]
                },
                config: {
                    imageConfig: model.startsWith("gemini-3")
                        ? { aspectRatio: settings.aspectRatio, imageSize: settings.size }
                        : { aspectRatio: settings.aspectRatio }
                }
            })
        );

        const images: string[] = [];
        // Fix: Iterate through all parts to find the image part correctly
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const base64 = part.inlineData.data;
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    images.push(`data:${mimeType};base64,${base64}`);
                }
            }
        }
        return images;
    } catch (error) {
        console.error("Generate brand asset failed", error);
        throw error;
    }
};
