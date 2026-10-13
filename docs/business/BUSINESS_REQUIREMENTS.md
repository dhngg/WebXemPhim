# Rental Platform V1.0 — Yêu cầu nghiệp vụ

**Vai trò tài liệu:** nguồn sự thật nghiệp vụ tổng hợp  
**Trạng thái:** các mục ghi “ĐÃ CHỐT” là quyết định của chủ dự án; các mục ghi “ĐỀ XUẤT” chưa phải lệnh triển khai  
**Trạng thái kỹ thuật:** Sprint 0/0.1 hoàn thành; các chức năng nghiệp vụ chưa được triển khai

## 1. Mô hình sản phẩm

Rental Platform V1.0 phục vụ chủ trọ quy mô nhiều khu/tòa và nhiều phòng, bao gồm trường hợp 30 phòng hoặc hơn. Sản phẩm có bốn không gian:

1. **Public Marketplace:** người dùng tìm phòng, xem thông tin công khai và đặt lịch xem.
2. **Landlord Workspace:** chủ trọ và nhân viên quản lý tài sản cho thuê.
3. **Tenant Portal:** người đang thuê xem dữ liệu của mình và gửi yêu cầu.
4. **Platform Admin:** đội vận hành tài khoản, nội dung công khai và cấu hình nền tảng.

Một User có thể tham gia nhiều vai trò theo ngữ cảnh. Không tạo global role LANDLORD trong bảng users. Quyền quản lý nhà trọ đến từ workspace membership. Tenant chỉ truy cập dữ liệu riêng sau khi tenant-user link được xác minh.

## 2. Nguyên tắc phân quyền

### 2.1. ĐÃ CHỐT — Workspace và tenant

- Workspace là ranh giới sở hữu dữ liệu của chủ trọ.
- Chủ workspace và nhân viên chỉ thao tác theo membership/role trong workspace.
- Backend luôn kiểm tra workspace, ownership và trạng thái nhạy cảm.
- Không tin workspace ID, role, giá tiền hoặc trạng thái do frontend tự khẳng định.
- Không tự liên kết tenant với User theo số điện thoại; phải có luồng xác minh.
- Tenant không xem dữ liệu riêng của phòng hoặc tenant khác nếu không có quyền hợp lệ.

### 2.2. ĐÃ CHỐT — Platform Admin được phép

- Quản lý tài khoản nền tảng.
- Khóa/mở tài khoản vi phạm theo chính sách.
- Kiểm duyệt, ẩn hoặc gỡ listing công khai.
- Tiếp nhận và xử lý báo cáo, khiếu nại.
- Xem thống kê tổng hợp toàn nền tảng.
- Quản lý cấu hình và danh mục chung.
- Xem audit log phù hợp quyền vận hành.

### 2.3. ĐÃ CHỐT — Platform Admin không được phép mặc định

- Sửa giá thuê, giá điện, nước hoặc phí dịch vụ của chủ trọ.
- Sửa chỉ số điện/nước.
- Tạo, sửa hoặc xóa hóa đơn thay chủ trọ.
- Xác nhận thanh toán hoặc điều chỉnh công nợ thay chủ trọ.
- Sửa hợp đồng, tiền cọc hoặc giao dịch tiền cọc.
- Tự ý chuyển tenant giữa các phòng.
- Xóa dữ liệu phòng/hợp đồng gốc chỉ vì listing bị gỡ.

Ẩn/gỡ **listing công khai** là quyền kiểm duyệt nền tảng. Sửa/xóa **room, contract, invoice hoặc payment** là nghiệp vụ workspace và không phải quyền Platform Admin mặc định.

### 2.4. CHỜ PHÊ DUYỆT

Admin có được xem chi tiết hợp đồng/hóa đơn riêng tư để xử lý khiếu nại hay không. Thiết kế mặc định là **không truy cập**. Chưa tạo cơ chế đặc quyền hỗ trợ, impersonation hoặc break-glass.

## 3. Landlord Workspace

### 3.1. Nhà trọ và phòng

- Một chủ trọ quản lý nhiều khu/tòa và nhiều phòng.
- Thêm/sửa thông tin phòng, giá thuê, diện tích, ảnh và tiện ích.
- Theo dõi trạng thái phòng trống, đang thuê hoặc không còn khả dụng.
- Chỉ đăng phòng đủ điều kiện lên Marketplace.

### 3.2. Người thuê và hợp đồng

- Quản lý hồ sơ tenant và thành viên đang ở.
- Liên kết User sau xác minh.
- Quản lý hợp đồng, ngày bắt đầu/kết thúc và trạng thái thuê.
- Theo dõi số người ở theo phòng và theo thời điểm khi cần tính phí.
- Một phòng không có hai hợp đồng ACTIVE chồng thời gian.
- Ngày kết thúc được tính trong kỳ hợp đồng.

### 3.3. Xe và chỗ đỗ

- Theo dõi xe gắn với tenant/hợp đồng/phòng theo thiết kế chi tiết sau này.
- Theo dõi số lượng xe và phí gửi xe.
- Phân biệt số xe đang có với khả năng còn chỗ đỗ cho tenant mới.

### 3.4. Điện, nước và dịch vụ

- Cấu hình giá điện, giá nước và khoản dịch vụ theo phiên bản có hiệu lực.
- Điện tính theo chỉ số công tơ.
- Nước có thể theo đồng hồ hoặc số người, tùy rule được duyệt.
- Dịch vụ có thể gồm Wifi, rác, vệ sinh, gửi xe và khoản phí khác.
- Phí cần xác định rõ đơn vị tính: theo phòng, người, xe hoặc khoản cố định.
- Hóa đơn lưu snapshot đơn giá; điều chỉnh phải có audit.

Chi tiết công thức, cách làm tròn, kỳ chốt, đơn vị tính mặc định và xử lý thiếu chỉ số vẫn cần Product Owner phê duyệt trước P08/P09.

### 3.5. Hóa đơn, thanh toán và tiền cọc

- Tạo/xem hóa đơn tháng và chi tiết tiền phòng, điện, nước, xe, dịch vụ.
- Theo dõi đã thanh toán, còn nợ và thanh toán một phần.
- Chủ trọ/nhân viên có quyền phù hợp xác nhận thanh toán thủ công.
- Chỉ payment đã xác nhận mới tác động số tiền đã thu.
- Tiền cọc được theo dõi riêng với doanh thu tiền thuê.

### 3.6. Thống kê chủ trọ

- Tổng số phòng, phòng trống và phòng đang thuê.
- Tỷ lệ lấp đầy.
- Doanh thu đã xác nhận theo tháng.
- Công nợ chưa thanh toán.
- Hợp đồng sắp hết hạn.
- Tổng hợp trạng thái yêu cầu bảo trì.

Dashboard chỉ dùng dữ liệu thật; không trình bày số giả định như dữ liệu vận hành.

## 4. Tenant Portal

Tenant có tenant-user link hợp lệ được:

- Xem phòng đang thuê, hợp đồng và thời hạn.
- Xem hóa đơn hiện tại và lịch sử.
- Xem tiền phòng, điện, nước, xe và dịch vụ.
- Theo dõi payment đã xác nhận và số tiền còn nợ.
- Gửi thông tin/chứng từ thanh toán để chủ trọ xác nhận nếu luồng này được duyệt.
- Xem thông tin tiền cọc theo quyền.
- Gửi yêu cầu bảo trì và theo dõi trạng thái.
- Nhận thông báo hóa đơn, thanh toán, hợp đồng và bảo trì.

Tenant không được:

- Sửa hóa đơn, chỉ số điện/nước hoặc đơn giá.
- Tự xác nhận đã thanh toán.
- Xem dữ liệu riêng của phòng/tenant khác khi không có quyền.

Luồng gửi chứng từ thanh toán và quyền xem chi tiết tiền cọc còn cần contract cụ thể trong P10/P11.

## 5. Public Marketplace

- Tìm phòng theo địa điểm, giá, diện tích, tiện ích và tình trạng.
- Xem ảnh, mô tả, giá và khoản phí được công khai.
- Xem vị trí trên bản đồ.
- So sánh khoảng cách tới địa điểm người dùng chọn.
- Xem quãng đường/thời gian di chuyển dự kiến theo phương tiện được nhà cung cấp hỗ trợ.
- Đặt lịch xem phòng.
- Chỉ hiển thị listing đủ điều kiện công khai.

Marketplace không công khai hợp đồng, hóa đơn, payment, tiền cọc hoặc thông tin riêng của tenant hiện tại. Gỡ listing không xóa room hay dữ liệu nghiệp vụ gốc.

## 6. Trợ lý tìm trọ thông minh

**Trạng thái:** PRODUCT FEATURE PROPOSAL — CHƯA TRIỂN KHAI; CHƯA CHỐT TOÀN BỘ CHI TIẾT.

Đây là đề xuất mở rộng P04, dùng hard filters và ranking có thể giải thích; V1.0 không cần LLM hoặc machine learning. Đặc tả đầy đủ tại [SMART_RENTAL_ASSISTANT](../marketplace/SMART_RENTAL_ASSISTANT.md).

## 7. Quy tắc dữ liệu và trạng thái

- Không biến dữ liệu ví dụ thành dữ liệu thật.
- Phân biệt rõ khoảng cách đường thẳng, khoảng cách theo đường đi và thời gian di chuyển dự kiến.
- Không khẳng định hỗ trợ routing xe máy khi chưa chọn nhà cung cấp và xác nhận capability.
- Không dùng dữ liệu riêng tư của tenant khác để ước tính chi phí công khai.
- Không âm thầm ưu tiên listing tài trợ trong điểm phù hợp; nội dung tài trợ tương lai phải có nhãn riêng.
- Các chức năng trong tài liệu nghiệp vụ không được xem là đã triển khai nếu source/API/migration chưa có bằng chứng.

## 8. Trạng thái triển khai

- Sprint 0/0.1: COMPLETED về nền tảng.
- P01 Users/Auth: DESIGN APPROVED — IMPLEMENTATION NOT STARTED.
- P02–P13 và mọi nghiệp vụ trong tài liệu này: NOT STARTED, trừ khi CURRENT_STATUS ghi khác trong tương lai.
- Smart Rental Assistant: PRODUCT FEATURE PROPOSAL.

Trạng thái kỹ thuật sống được duy trì tại [CURRENT_STATUS](../CURRENT_STATUS.md); lộ trình tại [MASTER_ROADMAP](../MASTER_ROADMAP.md).
