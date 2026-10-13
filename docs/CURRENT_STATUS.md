# Trạng thái hiện tại

| Mục                        | Trạng thái                         | Bằng chứng / ghi chú                                                             |
| -------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| Sprint hiện tại            | Sprint 1 / P01 IN PROGRESS         | P01-01 database foundation hoàn thành ở mức schema/migration tĩnh                |
| Task vừa hoàn thành        | P01-01                             | Prisma models và migration SQL cho `users`/`auth_sessions` đã được tạo           |
| Task đang thực hiện        | Không có                           | Dừng chờ Product Owner nghiệm thu và giao P01-02                                 |
| Task BLOCKED               | Không có blocker kỹ thuật hiện tại | Chưa có PostgreSQL test riêng để thực thi/kiểm thử migration                     |
| Neon direct database       | UNCHANGED                          | Không chạy migration; trạng thái database trước task là trống                    |
| Schema/migration nghiệp vụ | CREATED — NOT APPLIED              | Hai Auth models và migration P01-01; chưa thực thi trên database                 |
| Thiết kế P01 Users/Auth    | DESIGN APPROVED                    | [BACKEND_PART1_AUTH](backend/BACKEND_PART1_AUTH.md); implementation NOT STARTED  |
| Smart Rental Assistant     | PRODUCT FEATURE PROPOSAL           | [SMART_RENTAL_ASSISTANT](marketplace/SMART_RENTAL_ASSISTANT.md); chưa triển khai |
| Test gần nhất              | PASS                               | 27 unit/component, 9 API, 6 E2E; xem `docs/sprint-0/04-acceptance-checklist.md`  |

## Quyết định đã duyệt

1. P01 chỉ tạo hai bảng `users` và `auth_sessions`; 24 bảng còn lại vẫn planned.
2. Contract register/login/me/refresh/logout/logout-all và chính sách Auth trong [BACKEND_PART1_AUTH](backend/BACKEND_PART1_AUTH.md).
3. JWT HS256 TTL 10 phút; refresh family 30 ngày, rotation atomic, grace 10 giây.
4. Password Argon2id 12–128 ký tự; deployment cùng site và chính sách cookie production đã chốt.

## Phụ thuộc còn mở trước implementation

1. Hostname/origin cụ thể cho từng môi trường.
2. PostgreSQL test database tách biệt để thực thi migration và kiểm thử constraint.
3. Secret management và quy trình rotation HS256.
4. Quyền/người chịu trách nhiệm chỉnh frontend cho tích hợp P01.
5. Product Owner nghiệm thu P01-01 và giao task P01-02 riêng.

Mô hình workspace membership và role chi tiết vẫn chờ duyệt trước P02. P01 đang triển khai từng task; toàn bộ P01 chưa hoàn thành và Auth flow chưa bắt đầu.

## Kết quả P01-01

- Prisma format/validate/generate: PASS.
- Static check schema/migration, enums, unique/index/FK/self-reference và partial unique family index: PASS.
- Lint, typecheck, build, 27 unit/component tests và 9 API tests: PASS.
- Migration execution và PostgreSQL constraint tests: NOT RUN vì không có test database tách biệt.
- Neon/database dùng chung: không kết nối và không thay đổi trong task.

## Quyết định nghiệp vụ đã ghi nhận

- Sản phẩm có Public Marketplace, Landlord Workspace, Tenant Portal và Platform Admin.
- User có nhiều vai trò theo ngữ cảnh; workspace membership quyết định quyền quản lý và tenant-user link cần xác minh.
- Platform Admin không mặc định được sửa dữ liệu tài chính/nghiệp vụ riêng của workspace; gỡ listing không xóa room/hợp đồng gốc.
- Yêu cầu chi tiết tại [BUSINESS_REQUIREMENTS](business/BUSINESS_REQUIREMENTS.md).

## Đề xuất và quyết định nghiệp vụ còn mở

1. Admin có được xem chi tiết hợp đồng/hóa đơn riêng tư để giải quyết khiếu nại hay không; mặc định hiện tại là không.
2. Product Owner có đưa Smart Rental Assistant vào scope triển khai P04/V1.0 hay không.
3. Budget mode mặc định, ranking weights, routing/geocoding provider, travel modes và chính sách vị trí.
4. Công thức/đơn vị tính chi tiết cho nước, dịch vụ, phí theo người/xe/phòng và tổng chi phí ước tính.
5. Contract gửi chứng từ thanh toán và quyền xem tiền cọc trong Tenant Portal.

**Cập nhật lần cuối:** 14/10/2026, Asia/Saigon.
