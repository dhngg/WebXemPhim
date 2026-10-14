# Rental Platform V1.0 — Project Blueprint

## Phạm vi hiện tại

Sprint 0 cung cấp monorepo có thể cài đặt, kiểm thử và build. Sprint 0.1 chuyển toàn bộ ORM sang Prisma và chuẩn bị kết nối Neon. Authentication, authorization và các entity nghiệp vụ chưa được triển khai.

## Stack đã chốt

| Thành phần | Quyết định                                                  |
| ---------- | ----------------------------------------------------------- |
| Monorepo   | npm workspaces                                              |
| Backend    | NestJS 11 + TypeScript, REST `/api/v1`, Swagger             |
| Frontend   | React 19 + Vite                                             |
| Database   | Neon PostgreSQL                                             |
| ORM        | Prisma ORM 7.10.0 + `@prisma/adapter-pg`                    |
| Kiến trúc  | Modular Monolith + Layered Architecture                     |
| Tests      | Jest, Supertest, Vitest, Playwright                         |
| CI         | GitHub Actions; database tắt, không dùng production secrets |

## Ranh giới backend

Luồng phụ thuộc bắt buộc:

```text
Controller → Service → Repository → PrismaService → Neon PostgreSQL
```

- Controller chỉ nhận/trả HTTP và gọi service.
- Service chứa luồng nghiệp vụ.
- Repository đóng gói truy vấn và transaction qua Prisma.
- Module không truy cập repository nội bộ của module khác.
- `common`, `config` và `database` chỉ chứa hạ tầng dùng chung.

`HealthRepository` là ví dụ hiện tại. Không có Prisma model nghiệp vụ trong Sprint 0.1.

## Kết nối và migration

- Ứng dụng dùng Neon pooled connection từ `DATABASE_URL`.
- Prisma CLI dùng Neon direct connection từ `DIRECT_URL`.
- Prisma 7 đọc URL từ `apps/api/prisma.config.ts`; `schema.prisma` không chứa URL.
- PostgreSQL driver adapter là bắt buộc ở runtime Prisma 7.
- Migrations được chạy bằng lệnh vận hành riêng, không tự chạy khi API khởi động.
- Mọi lệnh kết nối từ repository từ chối database production và endpoint không được phê duyệt.

Không dùng `db push`, `migrate reset` hoặc thao tác phá hủy dữ liệu. Neon development `Apartment` ban đầu trống (P4001); P01-07 đã áp dụng migration P01-01 được review để tạo users và auth_sessions, không tạo baseline/bảng giả. Schema nghiệp vụ tiếp theo phải qua migration được review.

## Lộ trình module

| Giai đoạn      | Nội dung                                                                   |
| -------------- | -------------------------------------------------------------------------- |
| Sprint 0 / 0.1 | Health, config, Prisma/Neon infrastructure, CI                             |
| Sprint 1       | Thiết kế và triển khai Users/Auth/Workspaces/Memberships sau yêu cầu riêng |
| Sau Sprint 1   | Buildings, Rooms, Tenants, Contracts và các module nghiệp vụ tiếp theo     |

## Tham khảo chính thức

- [Prisma config](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference)
- [Prisma với PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)
- [Prisma Client generator](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)
- [NestJS fundamentals](https://docs.nestjs.com/)

Phiên bản cụ thể nằm trong `package.json` và `package-lock.json`; trạng thái kiểm tra nằm trong [checklist](../sprint-0/04-acceptance-checklist.md).
