# Sprint 0.1 — Bàn giao Prisma/Neon

Ngày bàn giao: **13/10/2026 (Asia/Saigon)**.

## Kết quả

Backend đã chuyển từ TypeORM sang Prisma ORM 7.10.0. Runtime dùng `@prisma/adapter-pg` và Neon pooled URL; Prisma CLI dùng direct URL. Health module giữ đúng tầng controller, service và repository. TypeORM đã được loại bỏ khỏi manifest, lockfile, source, scripts và tài liệu.

Prisma CLI đã truy cập đúng database `Apartment` trên Neon direct host. Introspection trả P4001 vì database hiện trống, và `prisma migrate status` xác nhận chưa có migration. Đây là trạng thái mong đợi: không tạo bảng giả, baseline rỗng hoặc migration. Sprint 1 chưa bắt đầu.

## Thành phần mới

```text
apps/api/
├── prisma.config.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/.gitkeep
├── scripts/
│   ├── check-neon.cjs
│   └── prisma-database-command.cjs
└── src/database/prisma/
    ├── check-neon.ts
    ├── prisma.module.ts
    └── prisma.service.ts
```

`apps/api/.env` local được Git ignore. Giá trị kết nối chỉ tồn tại cục bộ và không được ghi vào tài liệu hoặc Git.

## Phiên bản chính

| Thành phần                       | Phiên bản         |
| -------------------------------- | ----------------- |
| Node.js / npm                    | 24.19.0 / 11.17.0 |
| NestJS                           | 11.2.7            |
| Prisma CLI / Client / adapter-pg | 7.10.0            |
| PostgreSQL driver `pg`           | 8.23.1            |
| TypeScript                       | 5.9.3             |
| React / Vite                     | 19.3.0 / 7.3.7    |

## Kiểm tra

- Install, lint, format check, typecheck, build: PASS.
- Unit/component tests: 27/27 PASS.
- API tests: 9/9 PASS.
- Playwright: 6/6 PASS.
- Prisma validate và generate: PASS.
- Dependency audit: 0 advisory.
- Neon direct connection: PASS, nhận diện đúng database `Apartment`.
- Database inspection: P4001 xác nhận database trống; không có schema hoặc bảng nghiệp vụ.
- Migration status: PASS, chưa có migration.

Chi tiết từng lệnh nằm trong [acceptance checklist](04-acceptance-checklist.md).

## Việc còn lại

1. Giữ database trống và không có migration cho đến khi schema nghiệp vụ được duyệt.
2. Khi có thay đổi schema được phê duyệt, tạo migration riêng và review trước khi áp dụng.
3. Không tạo bảng giả, baseline database trống hoặc migration rỗng.

## Giới hạn bàn giao

GitHub Actions hosted chưa chạy vì không có push. Không có migration, bảng hoặc dữ liệu nào bị thay đổi trong task này.

Tham khảo quy trình chi tiết tại [Prisma và Neon](06-prisma-neon-setup.md).
