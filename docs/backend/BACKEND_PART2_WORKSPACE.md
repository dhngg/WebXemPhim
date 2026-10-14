# P02 — Workspace & RBAC

**Trạng thái:** P02-01–P02-06 WORKSPACE/RBAC FOUNDATION IMPLEMENTED — MIGRATION APPLIED ON NEON DEVELOPMENT

## Quyết định đã chốt

- Role theo từng workspace gồm `OWNER`, `MANAGER`, `STAFF`; không có global `LANDLORD` role.
- Mỗi workspace có đúng một `OWNER` ở trạng thái đã commit.
- Tạo workspace và membership OWNER chạy trong cùng transaction `Serializable`.
- Chuyển OWNER khóa row workspace, hạ role owner hiện tại rồi nâng member đích trong cùng transaction. Transaction lỗi sẽ rollback toàn bộ.
- Workspace dùng `ACTIVE`/`ARCHIVED` và `archived_at`; hard delete bị database trigger chặn.
- Foreign key membership tới user/workspace dùng `RESTRICT`, không cascade xóa dữ liệu membership cần audit.

## Database guard

Partial unique index trên `workspace_memberships(workspace_id) WHERE role = 'OWNER'` ngăn hai OWNER, kể cả ghi đồng thời. Deferred constraint triggers trên workspace và membership kiểm tra đúng một OWNER tại cuối transaction. Nhờ deferred check, transaction tạo workspace hoặc chuyển quyền có thể thay đổi nhiều row nhưng không thể commit trạng thái không có OWNER.

Migration `202610140002_p02_workspace_membership_foundation` đã được áp dụng lên Neon development Apartment ngày 14/10/2026. Metadata và hành vi constraint trực tiếp đã PASS: workspace + OWNER hợp lệ, OWNER thứ hai bị chặn, workspace thiếu OWNER bị chặn, hard delete bị chặn và chuyển OWNER atomic hợp lệ. Mọi dữ liệu kiểm tra được rollback. Concurrency stress test nhiều connection vẫn NOT RUN và cần database test tách biệt trước khi đánh giá production readiness.

## API đã triển khai

| Method | Path                                                 | Quyền                             | Kết quả                                            |
| ------ | ---------------------------------------------------- | --------------------------------- | -------------------------------------------------- |
| POST   | `/api/v1/workspaces`                                 | User ACTIVE                       | Tạo workspace và OWNER atomic                      |
| GET    | `/api/v1/workspaces`                                 | User ACTIVE                       | Danh sách workspace lấy từ membership trong DB     |
| GET    | `/api/v1/workspaces/:id`                             | OWNER/MANAGER/STAFF của workspace | Chi tiết kèm role hiện tại                         |
| PATCH  | `/api/v1/workspaces/:id/archive`                     | OWNER                             | Archive, giữ nguyên membership và dữ liệu          |
| PATCH  | `/api/v1/workspaces/:id/restore`                     | OWNER                             | Khôi phục workspace                                |
| GET    | `/api/v1/workspaces/:id/members`                     | OWNER                             | Danh sách membership và user liên kết              |
| POST   | `/api/v1/workspaces/:id/members`                     | OWNER, workspace ACTIVE           | Thêm user ACTIVE bằng email với role MANAGER/STAFF |
| PATCH  | `/api/v1/workspaces/:id/members/:membershipId`       | OWNER, workspace ACTIVE           | Đổi role MANAGER/STAFF                             |
| DELETE | `/api/v1/workspaces/:id/members/:membershipId`       | OWNER, workspace ACTIVE           | Xóa membership không phải OWNER                    |
| POST   | `/api/v1/workspaces/:workspaceId/transfer-ownership` | OWNER, workspace ACTIVE           | OWNER cũ thành MANAGER, target ACTIVE thành OWNER  |

POST yêu cầu Origin/CSRF giống Auth. DTO tạo workspace chỉ nhận `name`; role do server gán. Detail kiểm tra membership từ database và trả `WORKSPACE_NOT_FOUND` khi user không có quyền, tránh xác nhận workspace tồn tại.

Archive/restore khóa row workspace rồi kiểm tra lại OWNER trong cùng transaction `Serializable`, tránh race giữa guard và update. Hai thao tác idempotent và không ghi lại khi workspace đã ở trạng thái đích. Workspace ARCHIVED vẫn đọc được; workspace guard mặc định chặn mọi HTTP write trên workspace archived bằng `WORKSPACE_ARCHIVED`. Chỉ hai lifecycle route được đánh dấu cho phép đổi trạng thái, và repository vẫn kiểm tra OWNER trong transaction.

P02-05 chuẩn hóa email trước lookup và chỉ thêm user ACTIVE. Unique `(workspace_id, user_id)` cùng mapping `WORKSPACE_MEMBER_ALREADY_EXISTS` bảo vệ request trùng/concurrent. DTO chỉ nhận `MANAGER`/`STAFF`; repository từ chối update/delete membership OWNER và khóa workspace trước mọi write. OWNER được kiểm tra cả ở guard lẫn trong transaction. List là read-only nên vẫn dùng được khi workspace archived.

Kiểm tra P02-05: lint, format, monorepo typecheck, API build, 135 backend unit/static tests, 50 API tests và 5 shared contract tests PASS. Không chạy migration hoặc kết nối Neon; frontend không thay đổi và frontend tests NOT RUN.

P02-06 tái sử dụng transaction `Serializable`, row lock và constraint đúng một OWNER. Request nhận `targetMembershipId`; transaction kiểm tra lại OWNER hiện tại, workspace ACTIVE, target thuộc workspace và user target ACTIVE. OWNER cũ luôn thành MANAGER trước khi target thành OWNER; mọi lỗi rollback toàn bộ. Request cạnh tranh thua được ánh xạ thành `WORKSPACE_OWNER_CONFLICT`.

Kiểm tra P02-06: API typecheck/build PASS; 15 unit test repository/service và 15 API test workspace PASS. Concurrency được mô phỏng ở transaction/API; PostgreSQL stress test nhiều connection vẫn NOT RUN. Không chạy migration, không kết nối Neon và không sửa frontend.

## Chưa triển khai

- Luồng mời người chưa có tài khoản; P02-05 chỉ thêm bằng email đã đăng ký.
- Permission matrix chi tiết giữa MANAGER và STAFF.
- PostgreSQL concurrency stress test nhiều connection; migration deployment trên Neon development đã hoàn thành.
- Frontend workspace selector/member management.
