# Thiết kế database mục tiêu

## Trạng thái triển khai

Migration P01-01 đã được áp dụng lên Neon **development** Apartment ngày 14/10/2026 theo P01-07. Prisma và PostgreSQL hiện có hai bảng Auth `users`, `auth_sessions`; metadata đã xác nhận unique/index, partial unique family, check email và foreign keys. Smoke Auth API trên database thật PASS; suite constraint/concurrency đầy đủ vẫn cần PostgreSQL test database riêng. 24 bảng P02–P13 còn lại chỉ ở mức thiết kế.

## Danh mục 26 bảng mục tiêu

| #   | Bảng mục tiêu           | Trách nhiệm chính                | Trạng thái                 |
| --- | ----------------------- | -------------------------------- | -------------------------- |
| 1   | `users`                 | Danh tính người dùng             | APPLIED — Neon development |
| 2   | `auth_sessions`         | Refresh session/revocation       | APPLIED — Neon development |
| 3   | `workspaces`            | Ranh giới sở hữu dữ liệu         | Thiết kế mục tiêu          |
| 4   | `workspace_memberships` | Role theo workspace              | Thiết kế mục tiêu          |
| 5   | `buildings`             | Tòa nhà/tài sản                  | Thiết kế mục tiêu          |
| 6   | `rooms`                 | Phòng cho thuê                   | Thiết kế mục tiêu          |
| 7   | `amenities`             | Danh mục tiện ích                | Thiết kế mục tiêu          |
| 8   | `room_amenities`        | Liên kết phòng-tiện ích          | Thiết kế mục tiêu          |
| 9   | `media_assets`          | Metadata hình ảnh/tệp            | Thiết kế mục tiêu          |
| 10  | `listings`              | Listing marketplace              | Thiết kế mục tiêu          |
| 11  | `viewing_requests`      | Lịch xem phòng                   | Thiết kế mục tiêu          |
| 12  | `tenants`               | Hồ sơ người thuê                 | Thiết kế mục tiêu          |
| 13  | `tenant_user_links`     | Liên kết tenant-user có xác minh | Thiết kế mục tiêu          |
| 14  | `vehicles`              | Phương tiện tenant               | Thiết kế mục tiêu          |
| 15  | `contracts`             | Hợp đồng thuê                    | Thiết kế mục tiêu          |
| 16  | `contract_members`      | Người ở theo hợp đồng            | Thiết kế mục tiêu          |
| 17  | `rate_plans`            | Đơn giá có hiệu lực              | Thiết kế mục tiêu          |
| 18  | `meter_readings`        | Chỉ số điện/nước                 | Thiết kế mục tiêu          |
| 19  | `invoices`              | Hóa đơn kỳ                       | Thiết kế mục tiêu          |
| 20  | `invoice_items`         | Dòng hóa đơn/snapshot            | Thiết kế mục tiêu          |
| 21  | `invoice_adjustments`   | Điều chỉnh có audit              | Thiết kế mục tiêu          |
| 22  | `payments`              | Thanh toán xác nhận              | Thiết kế mục tiêu          |
| 23  | `deposits`              | Tiền đặt cọc riêng               | Thiết kế mục tiêu          |
| 24  | `maintenance_requests`  | Yêu cầu bảo trì                  | Thiết kế mục tiêu          |
| 25  | `notifications`         | Thông báo tenant/workspace       | Thiết kế mục tiêu          |
| 26  | `audit_logs`            | Dấu vết thay đổi nhạy cảm        | Thiết kế mục tiêu          |

## Ràng buộc cần được phê duyệt trước migration

- Tất cả dữ liệu sở hữu phải có ranh giới workspace rõ ràng.
- Cấm overlap hợp đồng `ACTIVE` cho cùng phòng.
- Đơn giá version theo `effectiveFrom`; hóa đơn lưu snapshot bất biến.
- Payment phải idempotent và chỉ payment xác nhận mới thay đổi số dư.
- Tenant-user link cần luồng xác minh.
- Những index, foreign key, enum/status và retention policy cụ thể phải được chốt trong PART liên quan.

Danh mục 26 bảng là phân rã tài liệu mục tiêu từ master plan; tên bảng, cột và quan hệ chi tiết vẫn cần Product Owner/technical review trước khi trở thành Prisma model hoặc migration.

## Thiết kế P01 đã duyệt

- P01 chỉ tạo `users` và `auth_sessions`.
- `users` không chứa global role, workspace ID hoặc tenant ID.
- Mỗi login tạo một session family; mỗi refresh rotation tạo một generation mới.
- Refresh token thô không được lưu; database chỉ lưu SHA-256 digest.
- Rotation dùng transaction, conditional update và constraint tối đa một generation chưa bị thu hồi trong mỗi family.
- Workspace, membership và RBAC thuộc P02.

Cột, index, foreign key, expiry, revocation, cleanup và concurrency contract đầy đủ nằm tại [BACKEND_PART1_AUTH](backend/BACKEND_PART1_AUTH.md). Migration P01-01 đã chạy trên Neon development; metadata và smoke API đã được kiểm chứng trong P01-07.

## Tác động của cập nhật nghiệp vụ Marketplace/Admin

- Quyền Platform Admin kiểm duyệt listing không tạo quyền sửa/xóa room, contract, invoice, payment hoặc dữ liệu tài chính workspace.
- Gỡ/ẩn listing phải giữ nguyên dữ liệu room và nghiệp vụ gốc.
- Smart Rental Assistant là đề xuất P04 và sử dụng dữ liệu listing/building/room/amenity/rate công khai; tài liệu này chưa phê duyệt bảng mới.
- Nhu cầu lưu báo cáo/khiếu nại, moderation action, routing cache hoặc search history cần database design và retention/privacy review riêng trước khi thêm vào danh mục bảng.

Yêu cầu nghiệp vụ nguồn tại [BUSINESS_REQUIREMENTS](business/BUSINESS_REQUIREMENTS.md) và đề xuất tại [SMART_RENTAL_ASSISTANT](marketplace/SMART_RENTAL_ASSISTANT.md).
