# Quy tắc bộ hồ sơ (LegalBiz) — chốt theo mẫu thực tế

> Ghi lại các quy tắc đã thống nhất để lần sau sửa code chiếu theo, giữ nhất quán.

## Thành lập mới TNHH 1TV
Bộ gồm: **Giấy đề nghị ĐKDN (Mẫu 02) + Điều lệ + Giấy ủy quyền (cá nhân) + Danh sách CSH hưởng lợi**.
→ Đã đúng trong code (`MAU_TNHH_1TV`), không sửa.

## Hồ sơ thay đổi TNHH 1TV
Thành phần theo trường hợp đang chọn:
- **Mẫu 12** (Giấy đề nghị/Thông báo thay đổi): luôn có khi có bất kỳ thay đổi nào. Đổi người đại diện cũng tạo Mẫu 12 vì kéo theo thay đổi thông tin đăng ký thuế mục Giám đốc.
- **Mẫu 13** (Giấy đề nghị thay đổi người đại diện): khi chọn **đổi người đại diện**.
- **Quyết định của chủ sở hữu**: khi chọn **đổi tên / đổi địa chỉ / tăng vốn / giảm vốn / đổi ngành / đổi người đại diện**. Một file, Điều 1 gộp tất cả nội dung đang chọn (khối điều kiện). Không tạo cho trường hợp chỉ cập nhật Mục B hoặc chỉ bổ sung CSH.
- **Giấy ủy quyền (kiểu công ty)**: luôn kèm. Bên A = người đại diện + chức danh + "Là người đại diện theo pháp luật của CÔNG TY..." + địa chỉ trụ sở + số GCN ĐKDN + ngày cấp.
- **Danh sách CSH hưởng lợi**: chỉ khi tích **Thay đổi chủ sở hữu** hoặc **Chủ sở hữu hưởng lợi** (công ty lập trước 2026 chưa có CSH thì bổ sung).

Thứ tự file: Mẫu 12 → Mẫu 13 (nếu có) → Quyết định → Giấy ủy quyền → CSH (nếu có). (Thứ tự không bắt buộc.)

## Quy ước khác
- Số quyết định cố định: **01/QĐ**.
- Giấy ủy quyền thành lập mới = kiểu **cá nhân** (giữ nguyên); hồ sơ thay đổi = kiểu **công ty**.
- Mẫu 13: ô trong khung "không có số định danh" (Dân tộc, Quốc tịch, Hộ chiếu, Nơi thường trú) để trống thì điền **dấu chấm**.
- 2 trường nhập thêm cho hồ sơ thay đổi: **Số GCN ĐKDN** (trống = mã số DN) và **Ngày cấp GCN** (trống = ngày ĐK lần đầu).

## File mẫu / code liên quan
- `public/mau/Mau_QuyetDinh_MailMerge.docx` — Quyết định (tái dùng 2 bảng ngành của Mẫu 12).
- `public/mau/Mau_UyQuyen_ThayDoi_MailMerge.docx` — Ủy quyền kiểu công ty.
- `services/tronHoSo.ts` — `MAU_QUYET_DINH`, `MAU_UY_QUYEN_THAY_DOI`, `MAU_CSH_HUONG_LOI`.
- `services/changeData.ts` — trường `gcnNumber`, `gcnDate`; field `QD_SO`, `GCN_SO`, `GCN_NGAY_CAP`.
- `components/DocumentGenerator.tsx` — lắp ghép bộ hồ sơ thay đổi.
- `components/ChangeRequest.tsx` — ô nhập GCN.

## Chưa chốt / cần mẫu thật để đối chiếu
- Quyết định cho đổi tên / địa chỉ / vốn / đại diện: câu chữ đang soạn theo chuẩn chung (mẫu thực tế mới chỉ có trường hợp ngành). Cần mẫu thật để chỉnh cho khớp.
- Các loại giấy tờ xuất hiện ở đợt gửi sau (chưa làm): "ỦY QUYỀN HIỆU ĐÍNH", "VĂN BẢN CỬ NGƯỜI ĐẠI DIỆN THEO ỦY QUYỀN (phần vốn góp)" cho chủ sở hữu là tổ chức.
