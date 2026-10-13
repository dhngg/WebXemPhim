# Sprint 0.1 — Prisma và Neon

## Mục tiêu và phạm vi

Thay TypeORM bằng Prisma ORM, thiết lập Prisma 7/NestJS/Neon và kiểm tra database an toàn mà không tạo schema nghiệp vụ.

## Đã triển khai

- Prisma CLI, Client và PostgreSQL adapter phiên bản 7.10.0.
- `PrismaModule` và `PrismaService` cho NestJS.
- Runtime sử dụng pooled `DATABASE_URL`; CLI dùng direct `DIRECT_URL`.
- Validation endpoint/database/user/TLS/channel binding; secret local bị Git ignore.
- Scripts generate, validate, inspect, migrate status/dev/deploy, Studio và Neon probe.

## Kết quả thực tế

- Prisma validate/generate: PASS.
- Neon direct host: truy cập được database `Apartment`.
- `prisma db pull --print`: P4001, xác nhận database trống.
- `prisma migrate status`: chưa có migration.
- Không tạo baseline, bảng giả, Prisma business model hoặc migration.

## Hướng dẫn bàn giao

Khi database design và PART nghiệp vụ được duyệt, thay đổi Prisma schema phải đi kèm migration review trên database development/test riêng. Không dùng `db push`, `migrate reset`, drop hoặc xóa dữ liệu.

Chi tiết vận hành tại [06-prisma-neon-setup](06-prisma-neon-setup.md).
