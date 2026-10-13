# Sprint 0.1 — Acceptance checklist

Ngày kiểm tra: **13/10/2026 (Asia/Saigon)**.

## Chuyển ORM

| Tiêu chí                         | Trạng thái | Bằng chứng                                                                    |
| -------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| Gỡ TypeORM và NestJS integration | PASS       | Không còn package, source, script hoặc hướng dẫn vận hành TypeORM             |
| Prisma packages cùng phiên bản   | PASS       | `prisma`, `@prisma/client`, `@prisma/adapter-pg` 7.10.0                       |
| Prisma 7 config                  | PASS       | `apps/api/prisma.config.ts`; URL không nằm trong schema                       |
| Prisma schema                    | PASS       | PostgreSQL datasource, generator CJS, chưa có business model                  |
| NestJS integration               | PASS       | Global `PrismaModule`, lifecycle `PrismaService`                              |
| Layer boundaries                 | PASS       | Controller → Service → Repository → Prisma                                    |
| npm workspace scripts            | PASS       | generate, validate, format, migrate dev/deploy/status, inspect, studio, probe |
| Migration rỗng không cần thiết   | PASS       | Không tạo migration khi schema chưa có model                                  |

## Neon và an toàn dữ liệu

| Tiêu chí                         | Trạng thái    | Bằng chứng                                                                             |
| -------------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| Runtime dùng pooled URL          | PASS          | `PrismaService` nhận `DATABASE_URL`                                                    |
| CLI dùng direct URL              | PASS          | `prisma.config.ts` ưu tiên `DIRECT_URL`                                                |
| TLS và channel binding           | PASS cấu hình | URL validator bắt buộc hai tham số; adapter bật channel binding                        |
| Secret bị Git ignore             | PASS          | `git check-ignore apps/api/.env` khớp `.gitignore`                                     |
| Frontend không có secret         | PASS          | Không có biến `VITE_DATABASE_*`; API URL không được bundle                             |
| Production guard                 | PASS          | Wrapper chỉ cho `development`/`test` và endpoint đã phê duyệt                          |
| Neon direct connection và target | PASS          | Prisma CLI truy cập đúng database `Apartment` trên Neon direct host                    |
| Introspection trước baseline     | PASS (P4001)  | `prisma db pull` xác nhận database trống; P4001 là kết quả mong đợi khi chưa có schema |
| Migration status                 | PASS          | `prisma migrate status` xác nhận chưa có migration                                     |
| Migration apply                  | NOT RUN       | Database trống, không có model/migration nghiệp vụ và không tạo baseline               |
| Reset/drop/db push               | NOT RUN       | Không thực hiện thao tác phá hủy                                                       |

## Kết quả lệnh

| Lệnh                            | Kết quả                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `npm ci`                        | PASS, exit 0                                                 |
| `npm run lint`                  | PASS, exit 0                                                 |
| `npm run format:check`          | PASS, exit 0                                                 |
| `npm run typecheck`             | PASS, exit 0                                                 |
| `npm test`                      | PASS, 27/27                                                  |
| `npm run test:api`              | PASS, 9/9                                                    |
| `npm run test:e2e`              | PASS, 6/6                                                    |
| `npm run build`                 | PASS, exit 0                                                 |
| `npm run prisma:validate`       | PASS, schema valid                                           |
| `npm run prisma:generate`       | PASS, Prisma Client 7.10.0                                   |
| `npm audit --json`              | PASS, 0 advisory                                             |
| `npm run prisma:inspect`        | PASS kết nối; Prisma trả P4001 vì database `Apartment` trống |
| `npm run prisma:migrate:status` | PASS; chưa có migration                                      |

Các trạng thái PASS chỉ phản ánh lệnh đã chạy ở máy local. GitHub-hosted CI chưa chạy vì task không push repository.

P4001 trong lần introspection này không phải lỗi cần khắc phục: database chưa có bảng hoặc schema để Prisma pull. Không tạo bảng giả, baseline hoặc migration để thay đổi kết quả đó.

## Phạm vi

- Không bắt đầu Authentication hoặc Sprint 1.
- Không tạo business entities.
- Không sửa giao diện frontend.
- Không reset, drop hoặc xóa dữ liệu.
- Không push GitHub.
