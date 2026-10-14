# Kiến trúc hệ thống

## Monorepo

```text
apps/api       NestJS API và Prisma infrastructure
apps/web       React/Vite application
packages/shared Contracts và constants dùng chung
docs           Tài liệu kiến trúc, trạng thái, roadmap và PART
```

## Backend

API là NestJS Modular Monolith dưới `/api/v1`. Mỗi module tuân theo:

```text
Controller → Service → Repository → PrismaService → PostgreSQL
```

Controller chịu HTTP/DTO/Swagger; Service điều phối use case; Repository đóng gói truy vấn; PrismaService quản lý kết nối. Module không truy cập repository nội bộ của module khác.

## Frontend

React Router quản lý route; TanStack Query quản lý request state và Axios làm HTTP client. Frontend chỉ nhận biến `VITE_*`; tuyệt đối không nhận database URL hoặc secret.

## Database và môi trường

- Runtime Prisma dùng `DATABASE_URL` pooled.
- Prisma CLI dùng `DIRECT_URL` direct.
- `apps/api/.env` là local-only và bị Git ignore.
- Prisma config nằm trong `apps/api/prisma.config.ts`; `schema.prisma` không chứa URL.
- CI tắt database để không phụ thuộc secret hoặc database production.
- Neon development hiện có migration P01 cho `users`, `auth_sessions` và migration P02 cho `workspaces`, `workspace_memberships`. P02 constraint behavior đã kiểm tra trực tiếp; concurrency stress nhiều connection chưa chạy.

## API, bảo mật và phân quyền

REST API dùng prefix `/api/v1`, Helmet, CORS allowlist, ValidationPipe và error contract thống nhất. P01 Auth và P02 workspace API foundation/lifecycle/membership/ownership transfer đã có trong source. Phân quyền workspace luôn tra membership từ database; role không nằm trong `users` hoặc access JWT và không được tin từ client. Workspace archived vẫn cho phép đọc theo quyền; route ghi nghiệp vụ phải yêu cầu workspace ACTIVE và repository tiếp tục kiểm tra OWNER/trạng thái trong transaction. API membership thường không được sửa hoặc xóa OWNER; chuyển OWNER là use case atomic riêng có row lock và database constraint.

Xem chi tiết source-truth hiện hữu tại [Project Blueprint](architecture/PROJECT_BLUEPRINT.md) và contract tại [API_CONTRACT](API_CONTRACT.md).
