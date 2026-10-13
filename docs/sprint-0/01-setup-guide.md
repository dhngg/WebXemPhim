# Sprint 0 — Hướng dẫn setup

## Môi trường

- Node.js 24 LTS và npm 11.
- Windows PowerShell có thể dùng `npm.cmd` nếu execution policy chặn `npm.ps1`.
- Repository dùng npm workspaces: `apps/api`, `apps/web`, `packages/shared`.

```powershell
Set-Location C:\Apartment-app
npm.cmd ci
npm.cmd run dev
```

Ở chế độ mặc định, database tắt và readiness trả `database: disabled`.

## Biến môi trường API

Tạo `apps/api/.env` từ file mẫu. File thật đã được `.gitignore` loại trừ.

| Biến                   | Mặc định             | Ý nghĩa                                           |
| ---------------------- | -------------------- | ------------------------------------------------- |
| `NODE_ENV`             | `development`        | `development`, `test`, `production`               |
| `HOST` / `PORT`        | `127.0.0.1` / `3000` | Địa chỉ API                                       |
| `SWAGGER_ENABLED`      | bật ngoài production | Chỉ nhận `true` hoặc `false`                      |
| `CORS_ORIGINS`         | hai origin local     | Danh sách origin HTTP(S), không wildcard          |
| `DATABASE_ENABLED`     | `false`              | Bật Prisma runtime                                |
| `DATABASE_ENVIRONMENT` | `development`        | Chốt an toàn: `development`, `test`, `production` |
| `DATABASE_URL`         | rỗng                 | Neon pooled URL cho ứng dụng                      |
| `DIRECT_URL`           | rỗng                 | Neon direct URL cho Prisma CLI                    |

Ứng dụng xác thực protocol, hostname, database, user, TLS và channel binding mà không in URL hoặc mật khẩu trong lỗi.

## Thiết lập Neon development

1. Điền URL thật vào `apps/api/.env`; không đưa URL vào Git, tài liệu hay frontend.
2. Giữ `DATABASE_ENVIRONMENT=development`.
3. Đặt `DATABASE_ENABLED=true`.
4. Chạy `npm.cmd run prisma:check-neon`.
5. Chạy `npm.cmd run prisma:inspect` để xem schema hiện có trước mọi migration.
6. Chỉ tạo migration khi schema Prisma có thay đổi đã được review.

`DATABASE_URL` phải dùng pooled host. `DIRECT_URL` phải dùng direct host. Cả hai URL cần `sslmode=require&channel_binding=require`. Prisma Client dùng pool tối đa 5 kết nối, timeout kết nối 5 giây và bật channel binding trong PostgreSQL adapter.

## Prisma CLI

```powershell
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run prisma:inspect
npm.cmd run prisma:migrate:status
npm.cmd run prisma:migrate:dev -- --name describe_change
npm.cmd run prisma:migrate:deploy
npm.cmd run prisma:studio
```

`prisma.config.ts` dùng `DIRECT_URL` cho CLI và chỉ fallback sang `DATABASE_URL` nếu direct URL chưa có. Wrapper của các lệnh kết nối từ chối production, URL thiếu, endpoint sai hoặc tham số TLS/channel binding thiếu.

Không dùng `prisma db push`, `prisma migrate reset`, xóa bảng hoặc drop schema trong workflow này.

## Trạng thái baseline

`schema.prisma` hiện chỉ khai báo generator và PostgreSQL datasource, chưa có model nghiệp vụ. Prisma đã introspect Neon direct database `Apartment`: P4001 xác nhận database trống, còn `prisma migrate status` xác nhận chưa có migration. Không tạo baseline, bảng giả hoặc migration rỗng cho trạng thái này.

## Khắc phục lỗi thường gặp

- Thiếu URL: kiểm tra `apps/api/.env`, sau đó bật `DATABASE_ENABLED=true`.
- Host hoặc database bị từ chối: dùng đúng hai endpoint Neon và database `Apartment`.
- Prisma Client chưa sinh: chạy `npm.cmd run prisma:generate`.
- Port bận: đổi `PORT` và Vite proxy tương ứng.
- Thiếu Chromium: chạy `npx.cmd playwright install chromium`.
