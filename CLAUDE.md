# Bàn giao cho phiên làm việc mới – LegalBiz AI

Đọc file này trước khi làm bất cứ việc gì. Chi tiết tính năng xem `README.md`, quy tắc hồ sơ đã chốt xem `docs/quy-tac-ho-so-thay-doi.md`.

## Dự án
- Web soạn hồ sơ đăng ký doanh nghiệp (React 19 + Vite + TS), trộn mẫu Word `.docx` ngay trên trình duyệt.
- Chủ dự án: Hồ Mạnh Đào – Công ty TNHH Tư vấn Dịch vụ Tín An. Trao đổi bằng tiếng Việt.
- Chạy online: https://ho-tro-doanh-nghiep.vercel.app (Vercel tự build khi nhánh `main` có commit mới).
- GitHub: `homada183791/tr-l-h-s-doanh-nghi-p`. Thư mục trên máy: `C:\Users\Admin\Downloads\legalbiz-ai-day-du`.

## Quy tắc làm việc (bắt buộc)
1. **Trước khi sửa code:** nhắc lại mình hiểu yêu cầu thế nào và hỏi xác nhận. Chưa được đồng ý thì không sửa.
2. **Sau khi điền thử:** gửi kết quả (file Word + ảnh các trang) và hỏi ý. Được duyệt rồi mới chép vào dự án hoặc đưa lên GitHub.
3. **Khi đề xuất sửa theo hồ sơ thật:** dẫn chứng hồ sơ nào, file nào, phần nào.
4. Không đưa mật khẩu, key, số CCCD vào file, commit hay tin nhắn. Thư mục `tools/` (key, cloudflared, mật khẩu) và `.env.development.local` đã gitignore, không được gửi hoặc commit.

## Cách kiểm tra một bộ hồ sơ thật
1. Giải nén bộ hồ sơ, đọc các file thật (GPKD, Mẫu 02/12/13, Quyết định, Ủy quyền, CSH hưởng lợi).
2. Điền đúng dữ liệu đó vào web hoặc chạy bằng script (`buildThanhLapRow`, `buildChangeRow`, `buildChangeWordRecord`, `mauThanhLapTNHH1TV`, `mauThayDoiTNHH1TV`, `tronFile` trong `services/`; chạy bằng `tsx` + `jsdom`; với `xlsx` thì trỏ alias sang `xlsx.mjs`).
3. So sánh với bản thật (pandoc ra chữ rồi so từng từ; LibreOffice ra PDF/PNG để xem trình bày).
4. Báo cáo khác biệt kèm dẫn chứng, chia ra: lỗi của web / lỗi của chính bản thật / việc cần chủ dự án chốt.

## Sửa mẫu Word (`public/mau/*.docx`)
- Trường trộn là MERGEFIELD. Khối điều kiện là đoạn riêng `[[#X]]…[[/X]]` (giữ khi X có giá trị), `[[^X]]` (giữ khi X trống), `[[?X]]` (xoá dòng bảng khi X trống).
- Ô vuông dùng ký tự Wingdings 2 nằm trong dòng (F054 ☒ / F0A3 ☐), không dùng hình vẽ nổi.
- Tên riêng in đậm. Chữ ký ở trang riêng kèm vài dòng chữ cuối, cách 5 dòng.
- Lưu file docx ra chỗ tạm rồi mới chép đè (ghi đè trực tiếp làm hỏng file).

## Đưa code lên
Commit trên máy (tác giả: Hồ Mạnh Đào) → chủ dự án nhấp đúp `day-len-github.bat` (`git push origin main`, file phải xuống dòng CRLF) → Vercel tự build. Git hay để lại file `.lock` thừa trong `.git`: đổi tên hoặc chuyển chỗ chúng thay vì xoá.

## Trạng thái hiện tại (11/11/2026)
- **Đã lên GitHub:** đợt 05/11 (tạm ngừng, Đồng Nai, Mẫu 02/12, NĐ 296, ☐/☒, chữ ký 5 dòng).
- **Đã commit trên máy, chờ chạy `day-len-github.bat`:** đợt 06/11 phần 1 (phần thuế luôn điền Giám đốc, Điều 1 Quyết định, cơ quan cấp GCN, chữ ký trang riêng).
- **Chưa được duyệt, chưa chép vào máy:**
  - Đổi người đại diện: Quyết định, chức danh "CHỦ TỊCH CÔNG TY", Mục B.
  - In đậm tên riêng, "Có/Không" xuống dòng, dấu chấm cho ô trống phần thuế, Số fax.
  - `README.md` mới và file `CLAUDE.md` này.
- **Chủ dự án đã chốt:**
  - Ký hiệu số giấy giữ như web (`01/<viết tắt>-GĐN`).
  - Ghi "TP." hay "Thành phố" đều được; ", Việt Nam" có hay không đều được.
  - Nghị định đúng là 296/2026 (bản thật ghi 269 là sai).
  - Số lao động do chủ dự án tự điền.
  - Không mở rộng quá 30 ngành.
  - Địa điểm kinh doanh tạm chưa làm.
- **Chưa làm:** công ty cổ phần, TNHH 2 thành viên, chi nhánh / văn phòng đại diện / địa điểm (Mẫu 19), trên 30 ngành.
- **Đã so 12 bộ thật:** Kim Long Land, Bảo An, Ngọc Viễn Đông, Lê Hùng, TNM Solutions, Lemar, Toàn Gia Phú, Bảo Sơn Phúc, Y Tế Quốc Tế, Nam Phong; bỏ qua Hoàng Hà (bản thật chép nhầm của bộ khác) và Mama Kitchen (Mẫu 19). Đồng Nai nộp hồ sơ dùng mẫu Điều lệ riêng.
