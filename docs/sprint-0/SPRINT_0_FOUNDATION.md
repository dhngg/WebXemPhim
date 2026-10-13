# Sprint 0 — Foundation

## Mục tiêu và phạm vi

Xây dựng nền tảng monorepo có thể cài đặt, chạy, kiểm tra và build; chưa triển khai tính năng nghiệp vụ.

## Đã triển khai

- npm workspaces, shared contracts và tooling chất lượng.
- NestJS API với health/readiness, Swagger, CORS, Helmet, validation và error filter.
- React shell với Home, 404 và trạng thái kết nối API.
- CI workflow, Git hooks và test toolchain.

## File và API liên quan

- API: `apps/api/src/modules/health/`.
- Web: `apps/web/src/app/` và `apps/web/src/components/health-status.tsx`.
- API hiện hữu: `GET /api/v1/health`, `GET /api/v1/health/ready`.

## Kiểm thử thực tế

Lint, format check, typecheck, build, 27 unit/component tests, 9 API tests và 6 Playwright tests đã PASS. Chi tiết tại [acceptance checklist](04-acceptance-checklist.md).

## Chưa triển khai và bàn giao

Authentication, business entities, migration nghiệp vụ và Sprint 1 chưa bắt đầu. Prisma/Neon được tách riêng trong [SPRINT_0_PRISMA_NEON](SPRINT_0_PRISMA_NEON.md).
