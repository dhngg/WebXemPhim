# Prisma 7 và Neon PostgreSQL

## Kiến trúc kết nối

Prisma ORM 7.10.0 là ORM duy nhất của API.

| Luồng                                   | Biến           | Endpoint         |
| --------------------------------------- | -------------- | ---------------- |
| NestJS runtime / Prisma Client          | `DATABASE_URL` | Neon pooled host |
| Prisma CLI / introspection / migrations | `DIRECT_URL`   | Neon direct host |

Prisma 7 dùng `prisma.config.ts` cho datasource URL. `schema.prisma` chỉ mô tả provider và generator. Runtime khởi tạo Prisma Client với PostgreSQL driver adapter theo yêu cầu của Prisma 7.

## Cấu hình local

`apps/api/.env`:

```dotenv
DATABASE_ENABLED=true
DATABASE_ENVIRONMENT=development
DATABASE_URL=<Neon pooled URL, chỉ lưu trong apps/api/.env>
DIRECT_URL=<Neon direct URL, chỉ lưu trong apps/api/.env>
```

Không commit file này. Không sao chép URL vào Markdown, output CI hoặc biến `VITE_*`.

## Xác minh an toàn

```powershell
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run prisma:check-neon
npm.cmd run prisma:inspect
npm.cmd run prisma:migrate:status
```

`prisma:check-neon` dùng Prisma Client để kết nối, sau đó đọc `current_database()`, `current_user` và `pg_stat_ssl`. Lệnh chỉ báo PASS nếu đúng database, user và TLS; lỗi không in connection string.

`prisma:inspect` gọi `prisma db pull --print`, vì vậy chỉ in schema introspection và không ghi đè `schema.prisma`. Wrapper kiểm tra direct host, database, user, môi trường và query parameters trước khi Prisma CLI được chạy.

## Baseline migration

Trình tự sau khi có URL thật:

1. Chạy probe và introspection.
2. Nếu database có bảng, lưu kết quả để review và đối chiếu với owner; chưa chạy `migrate dev`.
3. Chọn baseline chỉ sau khi schema thực tế được xác nhận. Việc đánh dấu migration đã áp dụng phải là thay đổi riêng được review.
4. Nếu database rỗng và Prisma schema chưa có model, không tạo migration.
5. Khi có schema nghiệp vụ đã duyệt, tạo migration bằng:

```powershell
npm.cmd run prisma:migrate:dev -- --name describe_change
```

Deploy migration đã review:

```powershell
npm.cmd run prisma:migrate:deploy
```

Không chạy `prisma db push`, `prisma migrate reset`, drop table hoặc xóa dữ liệu.

## Trạng thái Neon ngày 13/10/2026

- Prisma validate: PASS.
- Prisma Client generate: PASS, phiên bản 7.10.0.
- `apps/api/.env`: tồn tại, bị Git ignore; không lưu giá trị kết nối trong repository.
- Neon direct connection: PASS; Prisma nhận diện đúng database `Apartment`.
- `prisma:inspect`: Prisma kết nối được và trả P4001 vì database trống. Không có schema để pull.
- `prisma:migrate:status`: PASS; chưa có migration.
- Baseline: không tạo baseline cho database trống.
- Migration: không có migration cần áp dụng; không chạy migration trong task này.

## Tài liệu chính thức

- [Prisma config reference](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference)
- [PostgreSQL connector](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)
- [Prisma Client generator](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)
- [Neon with Prisma](https://www.prisma.io/docs/orm/overview/databases/neon)
