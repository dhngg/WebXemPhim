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

#### Quyết định Product Owner cho hóa đơn V1.0 (P08-01)

- **Kỳ:** tháng dương lịch theo `Asia/Ho_Chi_Minh`; chỉ số điện/nước kỳ M tính vào hóa đơn tháng M; mỗi hợp đồng tối đa một hóa đơn mỗi kỳ.
- **Tiền thuê:** lấy từ hợp đồng; nếu hợp đồng bắt đầu/kết thúc giữa tháng thì `tiền thuê × số ngày thuê thực tế / số ngày thực tế của tháng`; không tính ngoài thời gian hiệu lực.
- **Điện/nước:** lượng tiêu thụ từ Meter Readings × đơn giá Building Rates có hiệu lực trong kỳ. Nước tính theo `CUBIC_METER` hoặc `PERSON`, không tính trùng hai phương thức. Không ước tính chỉ số thiếu.
- **Wifi, rác, dịch vụ khác:** đơn giá và đơn vị từ Building Rates (`ROOM`, `FIXED`, `PERSON`, `VEHICLE`). Chỉ tính các dịch vụ được cấu hình áp dụng cho phòng (Room Services, có ngày hiệu lực và lịch sử); Building Rate chưa gán cho phòng thì không bao giờ được tính.
- **Đơn giá đổi giữa kỳ:** phí cố định theo phòng (`ROOM`/`FIXED`) được chia thành từng dòng theo khoảng hiệu lực của từng mức giá, tính theo số ngày thực tế / số ngày của tháng. Dịch vụ theo lượng (điện, nước, người, xe) cần một mức giá phủ trọn cả tháng: lượng dùng trong từng khoảng không xác định được nên hóa đơn giữ DRAFT thiếu và nêu lý do, không chia hay ước tính.
- **Gửi xe:** `số xe × đơn giá VEHICLE`, thu nguyên tháng, không prorate. Số xe là xe của Tenant thuộc hợp đồng được khai báo trước thời điểm chốt kỳ và chưa ngừng hiệu lực tại hoặc trước thời điểm chốt (đầu tháng kế tiếp, giờ Việt Nam). Snapshot lưu số lượng, biển số và đơn giá. Xe thuộc Tenant nên chỉ tính trên một hóa đơn mỗi kỳ: Tenant chỉ có một hợp đồng trong kỳ thì tính trên hợp đồng đó; có nhiều hợp đồng thì quản lý phải chọn hóa đơn tính xe (`billVehicles`), chưa chọn thì DRAFT thiếu `VEHICLE_BILLING_AMBIGUOUS`, và cơ sở dữ liệu chặn hai hóa đơn cùng nhận xe của một Tenant trong một kỳ.
- **Theo người:** dùng số người do quản lý nhập và xác nhận cho kỳ (`occupantCount`); hệ thống lưu người xác nhận, thời điểm xác nhận và snapshot trong dòng hóa đơn. Thiếu thì DRAFT đánh dấu thiếu, không suy đoán.
- **Làm tròn:** `ROUND_HALF_UP` về 1 VND ở từng dòng; tổng hóa đơn bằng tổng các dòng đã làm tròn; snapshot lưu số lượng, đơn giá, thành tiền và quy tắc làm tròn.
- **Vòng đời:** `DRAFT` (có thể thiếu dữ liệu, chỉ nêu khoản thiếu và không có tổng cuối) → `ISSUED` (bắt buộc đủ dữ liệu, bất biến, không hard-delete). Điều chỉnh sau phát hành xử lý ở module Invoice Adjustments (P09).

#### Điều chỉnh hóa đơn đã phát hành (P08-02)

- Hóa đơn ISSUED và các dòng của nó không bao giờ bị sửa; mọi thay đổi số tiền là một adjustment mới, dương (tính thêm) hoặc âm (giảm trừ), có lý do bắt buộc, người tạo và thời điểm.
- `adjustedTotal = originalTotal + tổng adjustments`, không được âm. Số tiền nhận tối đa 4 chữ số thập phân và làm tròn `ROUND_HALF_UP` về 1 VND (0,5 làm tròn ra xa số 0); adjustment làm tròn về 0 bị từ chối.
- Adjustment đã ghi không sửa, không xóa. Sửa sai bằng adjustment mới tham chiếu adjustment cũ cùng hóa đơn; mỗi adjustment chỉ được sửa sai một lần.
- OWNER/MANAGER tạo, STAFF chỉ đọc, Tenant chỉ xem adjustment của hóa đơn ISSUED mình được phép xem.

#### Thanh toán thủ công và công nợ (P08-03)

- Chỉ hóa đơn ISSUED nhận thanh toán. OWNER/MANAGER xác nhận đã nhận tiền; STAFF chỉ đọc; Tenant chỉ xem thanh toán của hóa đơn mình được phép xem và không được xác nhận.
- Mỗi lần xác nhận ghi số tiền VND nguyên dương, phương thức `CASH` hoặc `BANK_TRANSFER`, thời điểm nhận tiền (không ở tương lai), ghi chú và người xác nhận. Hỗ trợ trả nhiều lần.
- `amountDue = totalAmount + tổng adjustments`; `paidTotal = tổng thanh toán − tổng đảo`; `outstanding = amountDue − paidTotal`. Tổng thanh toán không được vượt `amountDue`, nên `outstanding` không bao giờ âm.
- Sổ thanh toán bất biến: không sửa, không xóa. Xác nhận nhầm được đảo bằng một giao dịch đảo toàn phần (`REVERSAL`) có lý do bắt buộc và người thực hiện; mỗi thanh toán chỉ đảo được một lần.
- Adjustment không được hạ `amountDue` xuống dưới số tiền đã nhận (sẽ tạo công nợ âm). Hệ thống từ chối với lỗi rõ ràng; quản lý phải đảo thanh toán hoặc xử lý hoàn tiền trước. Quy trình hoàn tiền/tiền thừa chưa được thiết kế (cần Product Owner quyết).

#### Tiền cọc theo hợp đồng (P08-04)

- Tiền cọc là sổ riêng theo Contract, tách khỏi tiền thuê, hóa đơn và thanh toán hóa đơn; hệ thống không tự lấy tiền cọc trả hóa đơn.
- Bốn loại giao dịch: `COLLECTION` (đã thu cọc), `DEDUCTION` (khấu trừ, bắt buộc có lý do và thông tin tham chiếu, ví dụ biên bản hư hỏng), `REFUND` (đã hoàn tiền thực tế cho người thuê, bắt buộc có lý do, phương thức, thời điểm và tham chiếu hoàn tiền như mã chuyển khoản hoặc số biên nhận tiền mặt) và `REVERSAL` (đảo một ghi nhận nhầm). `REFUND` chỉ ghi nhận việc quản lý đã hoàn tiền; hệ thống không chuyển tiền và không tự giả định đã chuyển.
- Số dư = thu − khấu trừ − hoàn, trong đó giao dịch bị đảo không còn được tính; số dư không bao giờ âm. Tiền VND nguyên dương.
- Sổ chỉ thêm: không sửa/xóa. Sửa sai bằng `REVERSAL` đảo toàn phần có lý do, người thực hiện và thời điểm; mỗi giao dịch chỉ đảo một lần, giao dịch đảo không đảo lại được, và không đảo khoản thu nếu tiền đã bị khấu trừ/hoàn khiến số dư âm.
- OWNER/MANAGER ghi, STAFF chỉ đọc, Tenant chỉ xem cọc của hợp đồng thuộc tenant mình được liên kết. Dữ liệu được giữ nguyên sau khi hợp đồng kết thúc.
- **Quyết định PO V1 về hoàn cọc:** hoàn một phần hoặc toàn bộ được phép khi hợp đồng còn `ACTIVE` hoặc đã `ENDED`, tối đa bằng số dư còn lại. Khi Building hoặc Workspace đã archive, chỉ OWNER được ghi `REFUND` cho phần cọc còn lại; `COLLECTION`, `DEDUCTION` và `REVERSAL` mới đều bị chặn, MANAGER và STAFF không ghi được. `REFUND` chỉ ghi nhận việc đã hoàn tiền thực tế và người xác nhận; hệ thống không chuyển tiền. Khác với `REVERSAL` (sửa một ghi nhận nhầm), `REFUND` làm giảm số dư thật.

### Bảo trì (P09)

- Tenant có tài khoản liên kết hợp lệ (chưa bị thu hồi) và hợp đồng `ACTIVE` gửi được yêu cầu cho phòng của hợp đồng đó; chỉ xem yêu cầu do chính mình gửi, cùng trạng thái, ghi chú xử lý và lịch sử. Tenant không thấy người được giao hay nhân sự đổi trạng thái, và không sửa/đóng/hủy được yêu cầu.
- OWNER/MANAGER tạo thay (liên kết hợp đồng `ACTIVE` của phòng nếu có), cập nhật tiêu đề/mô tả/mức ưu tiên/người xử lý, và chuyển trạng thái; STAFF chỉ đọc.
- Trạng thái chỉ đi tiến: `OPEN → IN_PROGRESS → RESOLVED → CLOSED`. `IN_PROGRESS` cần người xử lý là thành viên workspace; `RESOLVED` cần ghi chú xử lý; `CLOSED` đóng băng yêu cầu. Mức ưu tiên: `LOW`, `MEDIUM`, `HIGH`, `URGENT`.
- Mọi thay đổi (tạo, trạng thái, ưu tiên, người xử lý) ghi một dòng lịch sử chỉ-thêm với người thực hiện, thời điểm và ghi chú; không hard-delete yêu cầu hay lịch sử. Workspace/Building/Room archived chặn ghi nhưng vẫn đọc được.
- Tài liệu chưa yêu cầu hủy/từ chối hay mở lại nên V1 không có; chưa quy định SLA, đính kèm ảnh và thông báo (P11).

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
- P02–P13 và mọi nghiệp vụ trong tài liệu này: trạng thái triển khai theo [CURRENT_STATUS](../CURRENT_STATUS.md).
- Smart Rental Assistant: PRODUCT FEATURE PROPOSAL.

## 9. V1 Account Onboarding & Landlord Approval — ĐÃ CHỐT

- User đăng ký bằng Auth chung; role/quyền được tổng hợp từ quan hệ database hiện tại, không lấy từ JWT.
- User ACTIVE muốn tạo Workspace mới phải gửi landlord application và được PLATFORM_ADMIN duyệt. PLATFORM_ADMIN được cấp qua cơ chế vận hành hiện có; approval không cấp Platform Admin.
- OWNER đã tồn tại trước migration tiếp tục giữ nguyên Workspace và quyền; không backfill/chuyển role hoặc thu hồi tài nguyên hiện có.
- Một application PENDING tối đa cho mỗi user; tối đa 3 application trong 365 ngày và chờ 30 ngày sau từ chối. Quyết định một lần, chống tự duyệt và ghi audit.
- Mỗi application APPROVED chưa dùng cho phép user mới khởi tạo Workspace đầu tiên; thao tác tạo Workspace và tiêu thụ approval cùng transaction. Mỗi user được sở hữu tối đa một Workspace ACTIVE. OWNER có nhiều Workspace từ trước được giữ nguyên nhưng không thể tạo thêm; khôi phục Workspace ARCHIVED hoặc transfer OWNER bị chặn nếu vượt giới hạn. Các thao tác tạo/khôi phục/transfer tuần tự hóa theo user row để chống race condition; không dùng quota theo cửa sổ thời gian thay cho giới hạn tổng.
- OWNER/MANAGER có thể cấp tenant invitation bằng token ngẫu nhiên, lưu hash, hết hạn 7 ngày, dùng một lần. Tenant user phải đăng nhập và chủ động chấp nhận token. Giữ luồng tenant link request hiện tại.
- Tenant chỉ đọc hợp đồng gắn với Tenant profile có link ACTIVE của chính mình; list/detail lọc quyền ở backend và hỗ trợ trạng thái/phân trang.
- Migration onboarding là additive ngoài việc đổi `tenant_user_links.link_request_id` sang nullable và bổ sung nguồn invitation; SQL cần được duyệt trước deploy.

Trạng thái kỹ thuật sống được duy trì tại [CURRENT_STATUS](../CURRENT_STATUS.md); lộ trình tại [MASTER_ROADMAP](../MASTER_ROADMAP.md).
