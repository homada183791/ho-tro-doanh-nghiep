# Quy tắc bộ hồ sơ (LegalBiz) — chốt theo mẫu thực tế

> Ghi lại các quy tắc đã thống nhất để lần sau sửa code chiếu theo, giữ nhất quán.

## Thành lập mới TNHH 1TV
Bộ gồm: **Giấy đề nghị ĐKDN (Mẫu 02) + Điều lệ + Giấy ủy quyền (cá nhân) + Danh sách CSH hưởng lợi**.
→ Đã đúng trong code (`MAU_TNHH_1TV`), không sửa.

### Hồ sơ nộp tại Đồng Nai
- Đồng Nai là **Thành phố trực thuộc trung ương từ 30/4/2026**: ghi "Thành phố Đồng Nai" (cơ quan đăng ký: Phòng Đăng ký Kinh doanh Sở Tài chính Thành phố Đồng Nai). Chữ "Tỉnh Đồng Nai" trong dữ liệu được tự đổi.
- **Điều lệ** theo mẫu riêng chuyên viên Đồng Nai yêu cầu: `Mau_DieuLe_DongNai_MailMerge.docx` (từ file CtyMTV.CN.Sua, chủ sở hữu cá nhân). Tự chọn khi cơ quan đăng ký là Đồng Nai và chủ sở hữu là cá nhân; chủ sở hữu tổ chức vẫn dùng Điều lệ chung.

## Tạm ngừng kinh doanh (chỉ TNHH 1TV, doanh nghiệp)
- Chọn ở màn hình hồ sơ thay đổi, mục **9. Tạm ngừng kinh doanh**; làm riêng, không chọn cùng trường hợp khác.
- Bộ gồm: **Thông báo tạm ngừng** (số `01/<ký hiệu>-TB`, nơi ký ghi đủ "Thành phố …/Tỉnh …") + **Quyết định của chủ sở hữu** (`01/QĐ`) + **Giấy ủy quyền (kiểu công ty)**.
- Nhập: từ ngày, đến hết ngày (trống = tròn 1 năm, vd 01/10/2026 → 30/09/2027), lý do (mặc định "Kinh doanh không hiệu quả"), SĐT và email người đại diện (trống = dấu chấm).
- Kiểm tra: mỗi lần không quá 01 năm; ngày kết thúc không trước ngày bắt đầu.
- Quyết định: Điều 2 giao cho người ký hồ sơ; ký mục CHỦ SỞ HỮU = chủ sở hữu cá nhân.
- Phần chi nhánh/VPĐD/địa điểm và phần "tiếp tục kinh doanh trước thời hạn" để trống như mẫu.
- Mẫu: `Mau_TamNgung_ThongBao_MailMerge.docx`, `Mau_TamNgung_QuyetDinh_MailMerge.docx` (từ bộ Lê Hùng).
- Chưa làm: tạm ngừng cho TNHH 2TV, cổ phần, chi nhánh.

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
- `services/tronHoSo.ts` — `MAU_QUYET_DINH`, `MAU_UY_QUYEN_THAY_DOI`, `MAU_CSH_HUONG_LOI`, `MAU_TAM_NGUNG`, `MAU_TAM_NGUNG_QD`, `MAU_DIEU_LE_DONG_NAI`; chọn bộ mẫu: `mauThanhLapTNHH1TV`, `mauThayDoiTNHH1TV`.
- `services/thanhLapData.ts` — `buildThanhLapRow` (dòng trộn thư thành lập mới, tách khỏi DocumentGenerator).
- `services/changeData.ts` — trường `gcnNumber`, `gcnDate`; field `QD_SO`, `GCN_SO`, `GCN_NGAY_CAP`.
- `components/DocumentGenerator.tsx` — lắp ghép bộ hồ sơ thay đổi.
- `components/ChangeRequest.tsx` — ô nhập GCN.

## Chưa chốt / cần mẫu thật để đối chiếu
- Quyết định cho đổi tên / địa chỉ / vốn / đại diện: câu chữ đang soạn theo chuẩn chung (mẫu thực tế mới chỉ có trường hợp ngành). Cần mẫu thật để chỉnh cho khớp.
- Các loại giấy tờ xuất hiện ở đợt gửi sau (chưa làm): "ỦY QUYỀN HIỆU ĐÍNH", "VĂN BẢN CỬ NGƯỜI ĐẠI DIỆN THEO ỦY QUYỀN (phần vốn góp)" cho chủ sở hữu là tổ chức.

## Chốt ngày 05/11/2026 (đối chiếu 4 bộ thật: Kim Long Land, Bảo An, Ngọc Viễn Đông, Lê Hùng)
- **Mẫu 02**: vốn điều lệ ghi kèm "VNĐ" (dòng vốn, nguồn vốn, tài sản góp vốn); năm tài chính in sẵn "01/01 đến 31/12"; số lao động mặc định **01** (ô nhập "Tổng số lao động"); mục 10.1 có SĐT Giám đốc (ô "SĐT Giám đốc", trống = SĐT người đại diện; Giám đốc = người đại diện theo pháp luật).
- **Mẫu 12**: ô "Email nhận thông báo thuế" (trống = email công ty); bảng bỏ ngành tự ghi chú "Ngành, nghề kinh doanh bị xóa/bị thay đổi theo Quyết định số 36/2025/QĐ-TTg" (mã không còn trong VSIC 2025 = bị xóa, còn = bị thay đổi; có ô tích để tắt).
- **Quyết định** (thay đổi và tạm ngừng): căn cứ thêm "và được sửa đổi, bổ sung bởi Nghị định số 296/2026/NĐ-CP ngày 23 tháng 7 năm 2026 của Chính phủ" (bản thật ghi 269 là gõ nhầm).
- **Giấy ủy quyền**: Bên B ghi "Số định danh cá nhân:" (không ghi "CCCD:").
- Giữ theo web: số giấy đề nghị `01/<ký hiệu>-GĐN`, nơi ký "TP. …" hoặc "Thành phố …" đều được, STT tự đánh.

## Quy tắc trình bày mẫu Word
- **Ô vuông** dùng ký tự ☐/☒ (Wingdings 2, F0A3/F054) nằm trong dòng chữ; **không dùng hình vẽ nổi** (bị lệch, mất chữ X khi mở bằng chương trình khác).
- **Chữ ký**: 5 dòng trống giữa "(Ký và ghi họ tên)" và họ tên; khối chữ ký luôn đi liền 2 đoạn chữ cuối phía trên (keepNext), không để dòng trống thừa đẩy chữ ký sang trang trắng.
- **Giấy đề nghị / Quyết định**: lề trang trên 993, phải 992, dưới 851, trái 1134 (twip); bảng ngành: cột Tên ngành rộng (Mẫu 12/QĐ: 810/5000/1276/2600; bỏ ngành 810/4700/1276/2900; Mẫu 02: 810/5600/1276/2000).
- Mỗi lần sửa mẫu: điền thử bằng bộ hồ sơ thật, so số trang và xem ảnh các trang, gửi anh duyệt rồi mới chép code.
