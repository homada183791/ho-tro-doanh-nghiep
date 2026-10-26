# LegalBiz AI – Trợ lý hồ sơ đăng ký doanh nghiệp

Web hỗ trợ soạn hồ sơ đăng ký doanh nghiệp: rút trích giấy tờ bằng AI, tra mã ngành VSIC 2025, cập nhật địa chỉ theo đơn vị hành chính mới, xuất file Excel trộn thư và trộn sẵn bộ hồ sơ Word ngay trên trình duyệt.

Công nghệ: React 19, Vite 6, TypeScript, Tailwind (CDN), `@google/genai`, `xlsx`.

---

## Mục lục

1. [Cài đặt và chạy](#1-cài-đặt-và-chạy)
2. [Cài đặt API (key chỉ nằm trên máy chủ)](#2-cài-đặt-api-key-chỉ-nằm-trên-máy-chủ)
3. [Soạn hồ sơ thành lập mới](#3-soạn-hồ-sơ-thành-lập-mới)
4. [Soạn hồ sơ thay đổi – Công ty TNHH 1 thành viên](#4-soạn-hồ-sơ-thay-đổi--công-ty-tnhh-1-thành-viên)
5. [Các công cụ AI dùng chung](#5-các-công-cụ-ai-dùng-chung)
6. [File Excel trộn thư](#6-file-excel-trộn-thư)
7. [Mẫu Word và cách trộn](#7-mẫu-word-và-cách-trộn)
8. [Tư vấn pháp lý và Thương hiệu](#8-tư-vấn-pháp-lý-và-thương-hiệu)
9. [Giao diện](#9-giao-diện)
10. [Cấu trúc thư mục](#10-cấu-trúc-thư-mục)
11. [Xử lý sự cố thường gặp](#11-xử-lý-sự-cố-thường-gặp)

---

## 1. Cài đặt và chạy

**Yêu cầu:** Node.js 18 trở lên (Windows).

### Chạy trên máy

```bat
npm install
npm run dev
```

Mở `http://localhost:3000`. Muốn chạy cổng khác: `npm run dev -- --port 5173`.

### Chạy và public ra Internet – `start-public.bat`

Nhấp đúp `start-public.bat`. File này tự làm 5 bước:

1. Cài thư viện nếu chưa có (`npm install`).
2. Tải `cloudflared.exe` vào thư mục `tools\` (lần đầu).
3. Hỏi mật khẩu khoá web (ít nhất 6 ký tự), lưu ở `tools\mat-khau.txt`. Muốn đổi mật khẩu thì xoá file này.
4. Mở cửa sổ **LegalBiz Server** (cổng 3000).
5. Mở Cloudflare Tunnel, in ra link `https://….trycloudflare.com` và **tự chép link vào clipboard**.

- Người ngoài vào link phải nhập mật khẩu; máy chủ (localhost) không cần.
- Link trycloudflare đổi mỗi lần chạy lại.
- Đóng cửa sổ chính sẽ tắt cả máy chủ và tunnel.

---

## 2. Cài đặt API (key chỉ nằm trên máy chủ)

Nút **Cài đặt API** ở thanh bên trái.

- **Chỉ máy chủ** (mở bằng `http://localhost:3000`) mới sửa được cấu hình. Các máy khác chỉ xem, và gọi AI **qua máy chủ** nên **không bao giờ thấy API key**.
- Cấu hình lưu trong `tools\ai-config.json`, khởi động lại vẫn còn. Hộp thoại hiện nhãn "Đã lưu: …" cho key đang dùng.
- Nếu chưa lưu trên web, máy chủ lấy từ `.env.local`:

```ini
# Google Gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_MODEL_STRONG=gemini-3.1-pro-preview

# Hoặc dịch vụ tương thích OpenAI (OpenRouter, Groq, máy chủ riêng...)
AI_PROVIDER=openai
AI_BASE_URL=https://.../v1
AI_API_KEY=...
AI_MODEL=...
AI_WIRE=responses        # hoặc chat
```

**Hai kiểu nhà cung cấp:**

| Kiểu | Ghi chú |
|---|---|
| Google Gemini | Gọi qua đường `/gemini-api` của máy chủ |
| Tương thích OpenAI | Gọi qua `/ai-api`; có ô Header thêm, chọn `chat` hoặc `responses`, chế độ JSON |

**Chống lỗi hạn mức:**
- Tự chờ và thử lại khi gặp lỗi 429. Góc màn hình có thông báo đếm ngược.
- Ô "Số yêu cầu/phút" (RPM) để giãn yêu cầu với gói miễn phí.
- Model mạnh (Pro) hết hạn mức thì tự chuyển sang model thường (Flash).
- Dịch vụ chỉ nhận chữ mà cần đọc ảnh thì tự chuyển phần đọc ảnh sang Gemini.
- Lỗi được báo rõ lý do (sai key, hết hạn mức, máy chủ lỗi…), không im lặng.
- Nút **Kiểm tra kết nối** để thử key ngay.

---

## 3. Soạn hồ sơ thành lập mới

Menu **Soạn hồ sơ → Thành lập mới →** chọn loại hình.

### Nhập liệu

- **Nhập liệu thông minh:** dán thông tin thô (tin nhắn, email) → AI tự điền form.
- **Rút trích giấy tờ:** tải CCCD/hộ chiếu của chủ sở hữu và người đại diện. Với chủ sở hữu là tổ chức, tải giấy tờ tổ chức. AI điền đúng ô, không lẫn giữa chủ sở hữu và người đại diện.
- **Tên tiếng Anh:** nút dịch tự động.
- **Cơ quan đăng ký kinh doanh:** tự chọn theo tỉnh/thành của trụ sở.
- **Địa chỉ:** nút **Cập nhật địa chỉ mới (AI)** ở mọi khối (xem [mục 5](#5-các-công-cụ-ai-dùng-chung)).
- **Ngành nghề:** tra mã theo VSIC 2025, gợi ý thêm ngành liên quan, đánh dấu ngành chính.
- **Chủ sở hữu hưởng lợi** (khi chủ sở hữu là tổ chức), **địa chỉ nhận thông báo thuế**.

### Kết quả (nút **Tạo hồ sơ**)

- Bảng tổng hợp để kiểm tra.
- **Tải về (.xlsx):** file Excel trộn thư đúng mẫu `MailMerge_Data_30nganh` (xem [mục 6](#6-file-excel-trộn-thư)).
- **Công ty TNHH 1 thành viên:** trộn sẵn 4 file Word, tải từng file hoặc **Tải trọn bộ (.zip)** (kèm file Excel):
  - Giấy đề nghị đăng ký doanh nghiệp
  - Điều lệ công ty
  - Giấy ủy quyền nộp hồ sơ
  - Danh sách chủ sở hữu hưởng lợi

---

## 4. Soạn hồ sơ thay đổi – Công ty TNHH 1 thành viên

Menu **Soạn hồ sơ → Thay đổi thông tin → Công ty TNHH 1 Thành viên**.

### Bước 1 – Doanh nghiệp đăng ký thay đổi

- Tải ảnh/PDF **Giấy chứng nhận đăng ký doanh nghiệp** (được nhiều trang) → **Rút trích GPKD**.
- Màn hình chỉ hiện **Tên doanh nghiệp**, **Mã số doanh nghiệp**, **Kính gửi**.
- **Kính gửi** và **nơi ký** ("Tỉnh Tây Ninh, ngày … tháng … năm …", "TP. Hồ Chí Minh, ngày …") tự chọn theo **tỉnh/thành mới** của trụ sở: lấy địa chỉ sau thay đổi (Mục A), hoặc địa chỉ cập nhật (Mục B), nếu không thì địa chỉ trên GPKD. Tên tỉnh cũ được quy đổi tự động (Long An → Tây Ninh, Bình Dương/Bà Rịa – Vũng Tàu → TP. Hồ Chí Minh…), danh sách 34 tỉnh/thành ở `services/tinhThanh.ts`.
- AI vẫn đọc ngầm vốn, địa chỉ, chủ sở hữu, người đại diện, số lần thay đổi để điền sẵn ở các bước sau. Lần thay đổi kế tiếp được tính tự động.

### Bước 2 – Chọn nội dung thay đổi (chọn được nhiều)

| # | Trường hợp | Ô nhập và công cụ |
|---|---|---|
| 1 | Đổi tên công ty | Tên tiếng Việt, tiếng nước ngoài (nút dịch), viết tắt |
| 2 | Thay đổi địa chỉ trụ sở chính | Rút trích từ hợp đồng thuê/sổ đỏ; **dán đoạn thông tin để AI tự điền**; cập nhật địa chỉ mới (AI); điện thoại, email, website |
| 3 | Thay đổi vốn điều lệ | Vốn cũ điền sẵn từ GPKD; vốn mới tự đọc thành chữ; tự tính tăng/giảm và chênh lệch; thời điểm và hình thức tăng/giảm vốn |
| 4 | Thay đổi ngành, nghề | Bổ sung: tả ngành để AI tra VSIC 2025 hoặc gõ mã; ngôi sao chọn ngành chính. Bỏ ngành: gõ mã, tên tự lấy theo VSIC (sửa được) |
| 5 | Thay đổi người đại diện theo pháp luật | Rút trích CCCD; chức danh, địa chỉ liên lạc, điện thoại, email; cập nhật địa chỉ mới (AI) |
| 6 | Thay đổi chủ sở hữu | Cá nhân: rút trích CCCD. Tổ chức: rút trích GPKD của tổ chức nhận chuyển nhượng |
| 7 | Bổ sung, cập nhật thông tin (Mục B) | Tick là tự lấy địa chỉ trụ sở, địa chỉ chủ sở hữu và người đại diện từ GPKD rồi **AI tự tra sang địa chỉ mới** (có nút "Tra địa chỉ mới cho tất cả" để tra lại, hiện địa chỉ trên GPKD để đối chiếu). Cập nhật địa chỉ trụ sở (dán thông tin/AI cập nhật địa chỉ). Cập nhật địa chỉ liên hệ của chủ sở hữu và người đại diện (tự lấy từ GPKD; cùng một người thì gộp "Là chủ sở hữu đồng thời là người đại diện pháp luật của doanh nghiệp"; tối đa 3 người) |

**Người ký:** để trống thì tự chọn. Có đổi người đại diện thì chủ sở hữu ký, các trường hợp khác người đại diện hiện tại ký.

### Bước 3 – Tạo hồ sơ

- Web báo cụ thể nếu còn thiếu thông tin.
- **Giấy đề nghị Mẫu số 12** (tạo khi chọn trường hợp 1, 2, 3, 4, 6 hoặc 7):
  - Trang đầu giữ nguyên như mẫu (phần A, tách/sáp nhập, ô Có/Không); số giấy đề nghị ghi `01/<chữ cái đầu tên công ty>-GĐN`, ví dụ "CÔNG TY TNHH NHỰA JUN CHENG VIỆT NAM" → `01/NJCVN-GĐN`; tên cơ quan Kính gửi in nghiêng; tên doanh nghiệp, mã số thuế, tên Giám đốc in đậm (cả Mẫu 12 và 13).
  - Các mục thay đổi chỉ giữ mục đã chọn.
  - Bảng ngành bổ sung/bỏ tự bỏ dòng trống, đánh lại STT, đánh dấu X ngành chính.
  - Bảng nguồn vốn và tài sản góp vốn tự điền (vốn tư nhân, Đồng Việt Nam 100%).
  - Giảm vốn thì có đoạn cam kết thanh toán nợ.
  - **Thông báo thay đổi thông tin đăng ký thuế:** không có thông tin thuế nào thay đổi thì bỏ cả mục; có ít nhất một thông tin thay đổi thì giữ **nguyên bảng 9 chỉ tiêu**, trong đó tự điền:
    - Chỉ tiêu 1 (Giám đốc): người đại diện mới khi đổi người đại diện; hoặc Giám đốc hiện tại (theo GPKD) khi Mục B cập nhật địa chỉ liên hệ của người đó.
    - Chỉ tiêu 3 (địa chỉ nhận thông báo thuế): **đổi trụ sở → theo địa chỉ sau thay đổi (Mục A); chỉ cập nhật → theo địa chỉ cập nhật (Mục B)**.
  - Mục B in đúng như mẫu: "1. Cập nhật địa chỉ trụ sở chính…", "2. Cập nhật địa chỉ liên hệ…".
- **Giấy đề nghị Mẫu số 13** – thay đổi người đại diện theo pháp luật (khi chọn trường hợp 5):
  - Định dạng theo Nghị định 30/2020.
  - Tự điền số định danh của Chủ tịch công ty (chủ sở hữu cá nhân).
  - Hộ chiếu thì điền khung "không có số định danh".
- **Giấy ủy quyền nộp hồ sơ** và **Danh sách chủ sở hữu hưởng lợi** luôn có trong bộ hồ sơ thay đổi:
  - Bên ủy quyền / người ký = người ký hồ sơ (chủ sở hữu khi đổi người đại diện, còn lại là người đại diện hiện tại), **địa chỉ theo thông tin đang đăng ký (địa chỉ cũ)**;
  - Chủ sở hữu hưởng lợi: chọn trong mục "Chủ sở hữu hưởng lợi" – Chủ sở hữu / Người đại diện theo pháp luật / Người khác (nhập, rút trích CCCD). GPKD không ghi chủ sở hữu cá nhân thì web nhắc chọn; địa chỉ dùng địa chỉ đã cập nhật ở Mục B nếu có;
  - Nơi ký theo tỉnh/thành mới.
- Tải từng file, **Tải trọn bộ (.zip)**, hoặc **Tải về (.xlsx)** dạng `MailMerge_ThayDoi_<MST>_….xlsx`.

> Mẫu số 12 không có mục khai chủ sở hữu mới; khi đổi chủ sở hữu, web hiện giữ mục "chủ sở hữu hưởng lợi". Mẫu thông báo thay đổi chủ sở hữu sẽ bổ sung khi có file mẫu.

---

## 5. Các công cụ AI dùng chung

| Công cụ | Làm gì |
|---|---|
| **Cập nhật địa chỉ mới (AI)** | Đổi địa chỉ sang đơn vị hành chính sau sắp xếp 2025 (34 tỉnh/thành, bỏ cấp quận/huyện), tra Nghị quyết bằng Google. Báo "Đã đổi", "Đã đổi, nên kiểm tra lại" (một phường cũ chia về nhiều phường mới) hoặc "Địa chỉ đã đúng". Tra có tìm kiếm web: đang dùng ChatGPT (kiểu `responses`) thì dùng công cụ `web_search` của OpenAI; không được thì mới dùng Gemini có Google Search (nếu có key), kèm nguồn tham chiếu và link **Kiểm tra trên Google** để tự đối chiếu; không tra được Google thì tự đánh dấu "nên kiểm tra lại". |
| **Tự động điền bằng AI** | Dán đoạn tin nhắn/email → tách số nhà, phường/xã, tỉnh/thành, điện thoại, email, website |
| **Rút trích GPKD** | Đọc Giấy chứng nhận đăng ký doanh nghiệp (nhiều trang), giữ nguyên nội dung như trên giấy |
| **PDF → ảnh** | File PDF được đổi thành ảnh từng trang ngay trên trình duyệt trước khi gửi AI (PDF từ Cổng thông tin thường có lớp chữ lỗi mã làm AI đọc sai tên, ví dụ "DƯ HUỆ QUÂN" thành "ĐỖ HỮU QUÂN"); AI được dặn chép nguyên văn họ tên |
| **Rút trích CCCD/hộ chiếu** | Đọc mặt trước, mặt sau và tự điền thông tin cá nhân |
| **Rút trích giấy tờ địa điểm** | Đọc địa chỉ mặt bằng từ hợp đồng thuê, sổ đỏ |
| **Tra mã ngành VSIC 2025** | AI chỉ được chọn mã có trong `data/vsic2025.json` (QĐ 36/2025/QĐ-TTg, 495 mã cấp 4), tên ngành chép nguyên văn; mã sai bị loại |
| **Đọc số thành chữ** | `2.050.000.000` → "Hai tỷ không trăm năm mươi triệu đồng" |

**Xem/sửa câu lệnh AI:** các prompt nằm trong `services/gemini.ts`:
- `updateAdministrativeDivisions`: địa chỉ mới
- `lookupIndustryCodes`: mã ngành
- `extractBusinessLicense`: đọc GPKD
- `extractIdCardInfo`: đọc CCCD
- `extractAddressFromText`: tách địa chỉ từ đoạn văn bản

---

## 6. File Excel trộn thư

Sheet `Data_MailMerge`: dòng 1 là tên trường, dòng 2 là dữ liệu, mọi ô dạng chữ.

**Hồ sơ thành lập** – đúng mẫu `MailMerge_Data_30nganh.xlsx`, 133 cột cố định:
- Luôn đủ 30 cặp `TEN_NGANH_n`/`MA_NGANH_n` + `NGANH_CHINH`.
- Có hơn 30 ngành thì phần dư thêm vào cuối bảng.

**Hồ sơ thay đổi** – các nhóm cột chính:

| Nhóm | Cột |
|---|---|
| Thông tin hiện tại | `CQ_DK_KD`, `NGAY`/`THANG`/`NAM`, `NOI_KY`, `MST`, `LAN_THAY_DOI`, `LAN_THAY_DOI_MOI`, `TEN_TV`, `TS_*`, `CHU_*`, `DAI_DIEN_*` |
| Đánh dấu trường hợp ("X") | `TD_MUC_A`, `TD_DOI_TEN`, `TD_DIA_CHI`, `TD_VON`, `TD_NGANH`, `TD_DAI_DIEN`, `TD_CHU_SO_HUU`, `TD_CAP_NHAT`, `TD_THUE`, `TD_DANH_SACH` |
| Tên mới | `TEN_MOI_TV`, `TEN_MOI_TA`, `TEN_MOI_VT` |
| Địa chỉ mới | `TS_MOI_*`, `DT_MOI`, `EMAIL_MOI`, `WEBSITE_MOI` |
| Vốn | `VON_CU_SO/CHU`, `VON_MOI_SO/CHU`, `VON_TANG_GIAM`, `VON_CHENH_LECH`, `VON_GIAM`, `VON_THOI_DIEM`, `VON_HINH_THUC`, `NV_*` |
| Ngành | `THEM_TEN_NGANH_n`, `THEM_MA_NGANH_n`, `THEM_CHINH_n` (×30), `THEM_NGANH_CHINH`, `RUT_TEN_NGANH_n`, `RUT_MA_NGANH_n` (×30) |
| Người đại diện mới | `DD_MOI_*` (họ tên, giấy tờ, địa chỉ, email, hộ chiếu…), `CHU_TICH_SO_GT` |
| Chủ sở hữu mới | `CSH_MOI_*` |
| Mục B | `CN_TRU_SO`, `CN_TS_*`, `CN_LIEN_HE`, `CN_LH_STT`, `CN_LH_TEN_n`, `CN_LH_DIA_CHI_n`, `CN_LH_VAI_TRO_n` (×3) |
| Thuế | `THUE_MOI`, `THUE_MOI_DIA_CHI/PHUONG_XA/TINH_TP/SDT/EMAIL` |
| Ký | `NGUOI_KY` |

---

## 7. Mẫu Word và cách trộn

Các mẫu nằm trong `public/mau/` (mở bằng Word để sửa):

| File | Dùng cho |
|---|---|
| `Mau_GDN_MailMerge.docx` | Giấy đề nghị đăng ký doanh nghiệp (thành lập) |
| `Mau_DieuLe_MailMerge.docx` | Điều lệ công ty |
| `Mau_UyQuyen_MailMerge.docx` | Giấy ủy quyền nộp hồ sơ |
| `Mau_CSH_HuongLoi_MailMerge.docx` | Danh sách chủ sở hữu hưởng lợi |
| `Mau_ThayDoi_MailMerge.docx` | Giấy đề nghị đăng ký thay đổi – Mẫu số 12 |
| `Mau13_DoiDaiDien_MailMerge.docx` | Giấy đề nghị thay đổi người đại diện – Mẫu số 13 (định dạng NĐ 30) |

### Bộ trộn (web và công cụ TronHoSo.py cho kết quả giống hệt)

- Điền `MERGEFIELD`, tính trường `IF` (kể cả lồng nhau).
- Bảng có cột "Mã ngành": tự xoá dòng trống, đánh lại STT.
- **Khối điều kiện:** `[[#TEN_TRUONG]]` … `[[/TEN_TRUONG]]`. Trường rỗng thì xoá cả khối, có giá trị thì chỉ xoá 2 dòng đánh dấu. Khối lồng nhau được.
- **Dòng bảng có điều kiện:** đoạn `[[?TEN_TRUONG]]` trong một ô. Trường rỗng thì xoá cả dòng (dùng khi cần tự thêm vào mẫu).
- Tự bỏ chú thích chân trang không còn được tham chiếu.
- Gỡ liên kết Mail Merge để mở file không bị Word hỏi nguồn dữ liệu.
- Tên file trong file .zip được bỏ dấu để mở đúng trên Windows.

> Nếu trộn bằng Mail Merge có sẵn của Word: các dòng `[[...]]` sẽ hiện ra và dòng ngành trống không tự xoá, phải xoá tay. Nên dùng web hoặc TronHoSo.

### TronHoSo.py (trộn ngoài web)

```bat
pip install openpyxl lxml
python TronHoSo.py data.xlsx Mau_ThayDoi_MailMerge.docx Mau13_DoiDaiDien_MailMerge.docx -o ketqua
```

Hoặc nhấp đúp `TronHoSo.bat` để mở giao diện chọn file.

---

## 8. Tư vấn pháp lý và Thương hiệu

- **Tư vấn pháp lý:** chat với AI về thủ tục doanh nghiệp, có sẵn câu hỏi gợi ý. Đổi cài đặt API thì cuộc trò chuyện làm mới.
- **Thương hiệu:** tạo logo/hình ảnh thương hiệu bằng AI (cần model hỗ trợ tạo ảnh).

---

## 9. Giao diện

- Phong cách sáng, chuyên nghiệp: tông xanh hồ sơ, dấu đỏ, font **Be Vietnam Pro**. Độ tương phản đạt WCAG AA.
- Dùng tốt trên điện thoại: thanh bên thu gọn thành nút Menu.
- Form một cột trải hết bề ngang; phần kết quả và nút tải nằm dưới cùng.

---

## 10. Cấu trúc thư mục

```
├── App.tsx, index.tsx, index.html, index.css
├── vite.config.ts          # Proxy /ai-api, /gemini-api, /__ai/config; khoá mật khẩu; giấu key
├── start-public.bat        # Chạy + public qua Cloudflare Tunnel
├── types.ts
├── components/
│   ├── DocumentGenerator.tsx   # Soạn hồ sơ thành lập/thay đổi, xuất Excel, trộn Word
│   ├── ChangeRequest.tsx       # Hồ sơ thay đổi: GPKD, 7 trường hợp, ô rút trích, AI địa chỉ
│   ├── ApiSettings.tsx         # Hộp thoại Cài đặt API
│   ├── Sidebar.tsx, LegalChat.tsx, BrandStudio.tsx, AiWaitToast.tsx
├── services/
│   ├── gemini.ts           # Mọi prompt/hàm AI
│   ├── aiClient.ts         # Gọi Gemini/OpenAI, thử lại khi 429, chuyển model, lọc JSON
│   ├── aiSettings.ts       # Đọc/lưu cấu hình máy chủ
│   ├── vsic.ts             # Tìm kiếm & kiểm tra mã VSIC 2025
│   ├── changeData.ts       # Dữ liệu hồ sơ thay đổi → cột Excel
│   ├── tronHoSo.ts         # Bộ trộn Word trên trình duyệt
│   └── soThanhChu.ts       # Đọc số tiền thành chữ
├── data/vsic2025.json      # Danh mục ngành VSIC 2025
├── public/mau/             # Mẫu Word trộn thư
└── tools/                  # (tự tạo, KHÔNG chia sẻ) ai-config.json, mat-khau.txt, cloudflared.exe
```

> Khi gửi code cho người khác, **không gửi** `.env.local` và thư mục `tools/` vì chứa API key và mật khẩu.

---

## 11. Xử lý sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Hộp Cài đặt API chỉ xem, không sửa được | Mở `http://localhost:3000` **trên máy chủ** (không dùng link trycloudflare) |
| Lỗi 429 / hết hạn mức | Chờ đếm ngược, giảm RPM, đổi sang model Flash hoặc key khác |
| `messages[0].content must be a string` | Dịch vụ chỉ nhận chữ: chọn kiểu `responses`, hoặc thêm key Gemini để đọc ảnh |
| Lỗi 502 khi gọi AI | Kiểm tra Base URL và mạng của máy chủ |
| Mất cấu hình sau khi khởi động lại | Lưu trên **máy chủ** để ghi vào `tools\ai-config.json`; đừng xoá thư mục `tools` |
| Chú thích chân trang lệch khi mở bằng LibreOffice | Đã xử lý trong bộ trộn; trộn lại bằng bản mới |
| Ô vuông tick X trong mẫu (ví dụ "đồng thời thay đổi địa chỉ nhận thông báo thuế") chưa được tick | Đây là hình vẽ trong mẫu gốc, tick tay trong Word |
