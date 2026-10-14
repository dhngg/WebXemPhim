# Lộ trình xây dựng Rental Platform V1.0

## Đang ở đâu?

**Sprint hiện tại:** Sprint 1 / P01 IN PROGRESS. P01-07 đã áp dụng migration P01-01 lên Neon development Apartment và smoke Auth API thật PASS; P01 chưa nghiệm thu toàn phần.

**Phần đã hoàn thành:** monorepo, health API, frontend shell, Prisma/Neon, CI; Neon development hiện có users và auth_sessions. Auth core/flows và local rate limiting đã có code, smoke flow chính PASS.

**Thiết kế tiếp theo đã được duyệt:** thiết kế P01 Users/Auth đã được chốt tại [BACKEND_PART1_AUTH](backend/BACKEND_PART1_AUTH.md).

**Bước tiếp theo cần chủ dự án phê duyệt/giao việc:** review P01-07, cung cấp PostgreSQL test riêng cho suite constraint/concurrency, rồi giao task nghiệm thu/hardening tiếp theo; không tự chuyển task.

Xem trạng thái cập nhật tại [CURRENT_STATUS](CURRENT_STATUS.md) và bối cảnh sản phẩm tại [PROJECT_CONTEXT](../PROJECT_CONTEXT.md).

## Cách đọc lộ trình

- **Sprint** là một giai đoạn phát triển theo một mục tiêu sản phẩm rõ ràng.
- **PART** là một đơn vị giao việc kỹ thuật trong Sprint. Một Sprint có thể gồm một hoặc nhiều PART.
- **Nghiệm thu** là bước xác nhận phần đã làm đáp ứng tiêu chí đã thống nhất, có source code và kết quả kiểm tra thực tế.
- **COMPLETED** nghĩa là đã có bằng chứng trong repository. **NOT STARTED** nghĩa là chưa bắt đầu triển khai.

P01–P13 không tự chuyển sang triển khai khi chưa có task được chủ dự án duyệt.

## Tổng quan theo Sprint

### Sprint 0 — Nền tảng dự án

**Mục tiêu:** tạo nền tảng để dự án có thể cài đặt, chạy, kiểm tra và tiếp tục phát triển an toàn.

**Người dùng làm được gì sau khi hoàn thành:** mở giao diện khung, xem trạng thái kết nối API và truy cập các endpoint kiểm tra hệ thống.

**Backend cần làm:** monorepo, NestJS health API, cấu hình Prisma/Neon, script database an toàn, kiểm tra chất lượng và CI.

**Frontend cần làm:** React shell, trang chủ, trang 404 và các trạng thái đang tải, lỗi và kết nối API.

**Trạng thái hiện tại:** **IN PROGRESS** ở P01. P01-01 migration đã áp dụng lên Neon development, Auth API flow chính đã smoke PASS; thiếu kiểm thử PostgreSQL test riêng và nghiệm thu toàn P01. P02 Workspace/RBAC vẫn **NOT STARTED**.

### Sprint 1 — Tài khoản và không gian quản lý

**Mục tiêu:** cho người dùng tạo tài khoản, đăng nhập và làm việc trong không gian quản lý có phân quyền.

**Người dùng làm được gì sau khi hoàn thành:** đăng ký, đăng nhập, đăng xuất, làm mới phiên đăng nhập, chọn không gian làm việc và quản lý thành viên theo quyền.

**Backend cần làm:** Users/Auth, phiên đăng nhập, refresh token, workspace membership và RBAC.

**Frontend cần làm:** trang đăng nhập/đăng ký, trạng thái đăng nhập, chặn trang cần quyền và giao diện chọn không gian, thành viên.

**Trạng thái hiện tại:** **IN PROGRESS** ở P01. P01-01 đã tạo Prisma schema/migration nhưng chưa chạy database; Auth flows chưa triển khai. P02 Workspace/RBAC vẫn **NOT STARTED**.

### Sprint 2 — Quản lý tòa nhà và phòng

**Mục tiêu:** giúp chủ quản lý dữ liệu tòa nhà, phòng, tiện ích và hình ảnh.

**Người dùng làm được gì sau khi hoàn thành:** tạo, sửa và quản lý tòa nhà, phòng, tiện ích và ảnh phòng.

**Backend cần làm:** dữ liệu building, room, amenity và media của P03.

**Frontend cần làm:** giao diện quản lý tòa nhà/phòng và tải ảnh.

**Trạng thái hiện tại:** **NOT STARTED**. Phụ thuộc Sprint 1.

### Sprint 3 — Tìm phòng và đặt lịch xem

**Mục tiêu:** đưa phòng ra khu vực tìm kiếm công khai và quản lý yêu cầu xem phòng.

**Người dùng làm được gì sau khi hoàn thành:** tìm phòng theo địa điểm, giá, diện tích, tiện ích và tình trạng; xem bản đồ, khoảng cách/thời gian di chuyển dự kiến, chi tiết listing và gửi yêu cầu xem phòng. Trợ lý tìm trọ thông minh đang là đề xuất mở rộng, chưa phải phạm vi triển khai đã chốt.

**Backend cần làm:** listing, tìm kiếm/lọc, bản đồ và viewing request của P04–P05. P04 được đề xuất phân rã thành P04-A search/filter/map cơ bản, P04-B smart recommendations và P04-C kiểm thử ranking/routing/hiệu năng.

**Frontend cần làm:** trang tìm kiếm, bản đồ, chi tiết phòng và đặt lịch xem.

**Trạng thái hiện tại:** **NOT STARTED**. Smart Rental Assistant có trạng thái **PRODUCT FEATURE PROPOSAL — CHƯA TRIỂN KHAI; CHƯA CHỐT TOÀN BỘ CHI TIẾT**. Phụ thuộc dữ liệu tòa nhà/phòng và workspace.

Chi tiết đề xuất tại [SMART_RENTAL_ASSISTANT](marketplace/SMART_RENTAL_ASSISTANT.md). Việc bổ sung này không thay đổi thứ tự P00–P13 hoặc số lượng nhóm chức năng V1.0 đã ghi nhận.

### Sprint 4 — Người thuê và hợp đồng

**Mục tiêu:** quản lý người thuê, phương tiện và hợp đồng thuê đúng sức chứa phòng.

**Người dùng làm được gì sau khi hoàn thành:** lưu hồ sơ người thuê, liên kết tài khoản và phương tiện; tạo hợp đồng, thành viên hợp đồng và theo dõi người ở.

**Backend cần làm:** tenant, liên kết user, vehicle, contract, contract member và occupancy của P06–P07.

**Frontend cần làm:** giao diện quản lý người thuê, phương tiện và hợp đồng.

**Trạng thái hiện tại:** **NOT STARTED**.

### Sprint 5 — Chỉ số, đơn giá và hóa đơn

**Mục tiêu:** tính tiền thuê và dịch vụ từ đơn giá, chỉ số điện nước và điều chỉnh hợp lệ.

**Người dùng làm được gì sau khi hoàn thành:** thiết lập đơn giá, ghi chỉ số, lập hóa đơn và xử lý các khoản điều chỉnh.

**Backend cần làm:** rate versioning, meter reading, invoice, invoice item và adjustment của P08–P09.

**Frontend cần làm:** giao diện đơn giá, chỉ số và hóa đơn.

**Trạng thái hiện tại:** **NOT STARTED**.

### Sprint 6 — Thanh toán và cổng người thuê

**Mục tiêu:** ghi nhận thanh toán, tiền cọc và cho người thuê xem đúng dữ liệu của mình.

**Người dùng làm được gì sau khi hoàn thành:** thanh toán một phần hoặc nhiều lần, theo dõi công nợ/tiền cọc; người thuê xem thông tin được cấp quyền và nhận thông báo.

**Backend cần làm:** payment, deposit, API giới hạn theo người thuê và notification của P10–P11.

**Frontend cần làm:** giao diện thanh toán, cổng người thuê và thông báo.

**Trạng thái hiện tại:** **NOT STARTED**.

### Sprint 7 — Vận hành, báo cáo và quản trị

**Mục tiêu:** hỗ trợ vận hành thường ngày, báo cáo quản trị và khả năng truy vết.

**Người dùng làm được gì sau khi hoàn thành:** tạo và theo dõi yêu cầu bảo trì, xem dashboard/báo cáo; Platform Admin quản lý tài khoản, nội dung công khai, báo cáo/khiếu nại, cấu hình chung và audit phù hợp.

**Backend cần làm:** maintenance, analytics, admin và audit log của P12. Admin không mặc định có quyền sửa dữ liệu tài chính/nghiệp vụ riêng của workspace.

**Frontend cần làm:** giao diện bảo trì, báo cáo, quản trị và lịch sử hoạt động.

**Trạng thái hiện tại:** **NOT STARTED**.

### Sprint 8 — Sẵn sàng phát hành

**Mục tiêu:** bảo đảm hệ thống đủ an toàn, ổn định và dễ dùng để triển khai.

**Người dùng làm được gì sau khi hoàn thành:** dùng sản phẩm với trải nghiệm hoàn thiện hơn, có kiểm tra luồng quan trọng và kế hoạch khôi phục khi có sự cố.

**Backend cần làm:** security hardening, hiệu năng, triển khai, backup và recovery của P13.

**Frontend cần làm:** accessibility, hoàn thiện UX và kiểm thử E2E.

**Trạng thái hiện tại:** **NOT STARTED**.

## Kế hoạch kỹ thuật — P00 đến P13

| PART | Sprint | Nội dung kỹ thuật (Backend / Frontend)                                                                | Phụ thuộc | Nghiệm thu | Trạng thái                      |
| ---- | ------ | ----------------------------------------------------------------------------------------------------- | --------- | ---------- | ------------------------------- |
| P00  | S0     | Monorepo, API health, Prisma/Neon, CI / app shell và trạng thái cơ bản                                | —         | G0         | COMPLETED                       |
| P01  | S1     | Users, Auth, session, register/login/refresh/logout / login, register, auth state, route guard        | P00       | G1         | IN PROGRESS (P01-07 smoke PASS) |
| P02  | S1     | Workspace, membership, RBAC, guard / chọn workspace, quản lý thành viên                               | P01       | G2         | NOT STARTED                     |
| P03  | S2     | Building, room, amenity, image/media / quản lý tòa nhà, phòng, tải ảnh                                | P02       | G3         | NOT STARTED                     |
| P04  | S3     | Listing, search/filter/map cơ bản; đề xuất smart recommendations/routing / tìm kiếm, bản đồ, chi tiết | P03       | G4         | NOT STARTED                     |
| P05  | S3     | Viewing request và vòng đời xử lý / đặt lịch và quản lý yêu cầu xem                                   | P04, P02  | G5         | NOT STARTED                     |
| P06  | S4     | Tenant, liên kết user, vehicle / giao diện người thuê và phương tiện                                  | P01, P02  | G6         | NOT STARTED                     |
| P07  | S4     | Contract, member, occupancy / giao diện hợp đồng                                                      | P03, P06  | G7         | NOT STARTED                     |
| P08  | S5     | Đơn giá theo phiên bản, chỉ số điện nước / giao diện đơn giá và chỉ số                                | P07       | G8         | NOT STARTED                     |
| P09  | S5     | Invoice, invoice item, adjustment / giao diện hóa đơn                                                 | P08       | G9         | NOT STARTED                     |
| P10  | S6     | Payment, thanh toán một phần, deposit / giao diện thanh toán                                          | P09       | G10        | NOT STARTED                     |
| P11  | S6     | Tenant portal API, notification / cổng người thuê                                                     | P06–P10   | G11        | NOT STARTED                     |
| P12  | S7     | Maintenance, analytics, admin, audit log / vận hành, báo cáo, quản trị                                | P02–P11   | G12        | NOT STARTED                     |
| P13  | S8     | Security, performance, deploy, backup/recovery / accessibility, UX polish, E2E                        | P01–P12   | G13        | NOT STARTED                     |

Ghi chú P01: P01-01 migration đã áp dụng trên Neon development trong P01-07; chỉ có users và auth_sessions. Auth flow chính đã smoke PASS, nhưng chưa đánh dấu P01/G1 hoàn thành.

## Quy tắc chuyển giai đoạn

Một PART chỉ được coi là hoàn thành khi có phần triển khai, kiểm tra phù hợp, tài liệu cập nhật và nghiệm thu theo gate tương ứng. Frontend có thể dùng dữ liệu giả trong lúc phát triển, nhưng tích hợp chỉ được xác nhận khi dùng API thật và kiểm thử E2E phù hợp.

Chi tiết quyết định sản phẩm và kỹ thuật được duy trì tại [PROJECT_CONTEXT](../PROJECT_CONTEXT.md). Trạng thái triển khai hiện tại được duy trì tại [CURRENT_STATUS](CURRENT_STATUS.md).
