# Foundation — Sprint 0 và 0.1

## Đã hoàn thành

| Hạng mục           | Bằng chứng thực tế                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Monorepo           | npm workspaces cho API, web và shared package                                                                   |
| Backend foundation | NestJS 11, prefix `/api/v1`, Swagger theo môi trường, Helmet, CORS allowlist, validation và global error filter |
| Health API         | `GET /health` và `GET /health/ready`; readiness báo disabled/up/down qua repository                             |
| Frontend shell     | React/Vite, router, Home, 404, health loading/error/retry state                                                 |
| Shared package     | API prefix, health và error contracts xuất qua CJS/ESM                                                          |
| Prisma/Neon        | Prisma 7.10.0, `PrismaModule`, `PrismaService`, pooled runtime URL và direct CLI URL                            |
| Neon state         | Direct host truy cập được database `Apartment`; P4001 xác nhận database trống; chưa có migration                |
| Tooling            | ESLint, Prettier, Husky/lint-staged, Jest, Supertest, Vitest, Playwright, GitHub Actions                        |

## Kết quả kiểm tra đã ghi nhận

- `npm ci`: PASS.
- Lint, format check, typecheck và build: PASS.
- `npm test`: PASS, 27/27.
- `npm run test:api`: PASS, 9/9.
- `npm run test:e2e`: PASS, 6/6.
- Prisma validate/generate: PASS.
- `npm audit --json`: PASS, 0 advisory.
- `prisma:inspect`: kết nối thành công và trả P4001 do database trống.
- `prisma:migrate:status`: PASS, chưa có migration.

## Chưa triển khai

- Authentication, refresh session, authorization/RBAC và workspace membership.
- Business entities, Prisma models và migration nghiệp vụ.
- API nghiệp vụ, UI nghiệp vụ và integration workflow.
- Migration baseline: không tạo cho database trống.

## Bước tiếp theo cần duyệt

Trước PART P01 cần duyệt database design, API contract Users/Auth và phạm vi migration đầu tiên. Không tự chuyển sang Sprint 1.
