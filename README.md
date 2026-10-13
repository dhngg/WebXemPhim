# Rental Platform V1.0

Nền tảng quản lý cho thuê theo kiến trúc Modular Monolith. Repository hiện chỉ gồm nền tảng Sprint 0; Authentication và các module nghiệp vụ của Sprint 1 chưa được triển khai.

## Công nghệ

- Node.js 24 LTS, npm 11 workspaces, TypeScript 5.9.
- API: NestJS 11, Prisma ORM 7.10.0, PostgreSQL trên Neon.
- Web: React 19, Vite, React Router, TanStack Query.
- Kiểm thử: Jest, Supertest, Vitest, Playwright.

## Cài đặt và chạy local

```powershell
Set-Location C:\Apartment-app
npm.cmd ci
npm.cmd run dev
```

Database mặc định được tắt nên API, frontend và CI có thể chạy mà không cần secret. Các địa chỉ local:

| Địa chỉ                                     | Chức năng                                      |
| ------------------------------------------- | ---------------------------------------------- |
| `http://127.0.0.1:5173`                     | React SPA                                      |
| `http://127.0.0.1:3000/api/v1/health`       | Liveness                                       |
| `http://127.0.0.1:3000/api/v1/health/ready` | Readiness; trả `database: disabled` khi DB tắt |
| `http://127.0.0.1:3000/api/docs`            | Swagger trong development                      |

## Cấu hình Neon

Sao chép file mẫu và chỉ điền secret trong `apps/api/.env` đã được Git ignore:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

```dotenv
DATABASE_ENABLED=true
DATABASE_ENVIRONMENT=development
DATABASE_URL=<Neon pooled URL, chỉ lưu trong apps/api/.env>
DIRECT_URL=<Neon direct URL, chỉ lưu trong apps/api/.env>
```

`DATABASE_URL` dùng endpoint pooled cho Prisma Client lúc chạy ứng dụng. `DIRECT_URL` dùng endpoint direct cho introspection và migration. Không đặt hai biến này trong `apps/web/.env` hoặc biến có tiền tố `VITE_`.

Các lệnh database có lớp bảo vệ, chỉ chấp nhận môi trường `development`/`test`, đúng database `Apartment`, user và host Neon đã phê duyệt, cùng `sslmode=require&channel_binding=require`.

```powershell
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run prisma:check-neon
npm.cmd run prisma:inspect
npm.cmd run prisma:migrate:status
npm.cmd run prisma:migrate:dev -- --name describe_change
npm.cmd run prisma:migrate:deploy
npm.cmd run prisma:studio
```

Prisma đã truy cập Neon direct host và xác nhận database `Apartment` đang trống: `prisma:inspect` trả P4001 vì không có schema để pull, còn `prisma:migrate:status` xác nhận chưa có migration. Không dùng `prisma db push` hoặc `prisma migrate reset`; không tạo bảng giả, baseline hoặc migration rỗng.

## Kiểm tra chất lượng

```powershell
npm.cmd run lint
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:api
npm.cmd run test:e2e
npm.cmd run build
npm.cmd audit --json
```

CI chạy với `DATABASE_ENABLED=false`, `DATABASE_URL` và `DIRECT_URL` rỗng nên không phụ thuộc database production.

## Cấu trúc

```text
apps/api/             NestJS, Prisma, health module, Jest/Supertest
apps/api/prisma/      Prisma schema và thư mục migrations
apps/web/             React/Vite, Vitest/Playwright
packages/shared/      Constants và contracts dùng chung
docs/architecture/    Blueprint kiến trúc
docs/sprint-0/        Setup, chất lượng, nghiệm thu và bàn giao
.github/workflows/    CI
```

Backend giữ ranh giới `Controller → Service → Repository → Prisma → PostgreSQL`. Controller không truy vấn database trực tiếp.

## Tài liệu

- [Bối cảnh dự án](PROJECT_CONTEXT.md)
- [Foundation](FOUNDATION.md)
- [Trạng thái hiện tại](docs/CURRENT_STATUS.md)
- [Master roadmap](docs/MASTER_ROADMAP.md)
- [Kiến trúc hệ thống](docs/ARCHITECTURE.md)
- [Thiết kế database mục tiêu](docs/DATABASE_DESIGN.md)
- [API contract](docs/API_CONTRACT.md)
- [Project blueprint](docs/architecture/PROJECT_BLUEPRINT.md)
- [Setup guide](docs/sprint-0/01-setup-guide.md)
- [Kiến trúc](docs/sprint-0/02-architecture.md)
- [Quality và CI](docs/sprint-0/03-quality-and-ci.md)
- [Checklist nghiệm thu](docs/sprint-0/04-acceptance-checklist.md)
- [Bàn giao Sprint 0](docs/sprint-0/05-handover.md)
- [Prisma và Neon](docs/sprint-0/06-prisma-neon-setup.md)
- [Quy ước tài liệu PART](docs/parts/README.md)

Không có GitHub push hoặc triển khai production trong task này.
