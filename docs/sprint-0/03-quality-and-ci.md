# Sprint 0 — Quality và CI

## Lệnh kiểm tra

| Lệnh                        | Phạm vi                                                 |
| --------------------------- | ------------------------------------------------------- |
| `npm ci`                    | Cài đúng lockfile và chạy Prisma generate ở postinstall |
| `npm run lint`              | ESLint toàn monorepo                                    |
| `npm run format:check`      | Prettier check                                          |
| `npm run typecheck`         | TypeScript ở shared, API và web                         |
| `npm test`                  | Shared tests, API unit tests, frontend component tests  |
| `npm run test:api`          | Supertest API tests, database tắt                       |
| `npm run test:e2e`          | Playwright Chromium                                     |
| `npm run build`             | Build shared, NestJS và Vite                            |
| `npm run prisma:validate`   | Validate Prisma schema/config                           |
| `npm run prisma:generate`   | Sinh Prisma Client                                      |
| `npm run prisma:check-neon` | Probe database/user/TLS qua Prisma Client               |
| `npm audit --json`          | Dependency advisories                                   |

Không coi một kiểm tra là PASS nếu lệnh chưa chạy hoặc bị chặn vì thiếu secret.

## CI

Workflow `.github/workflows/ci.yml` pin Node 24 và npm 11.17.0, sau đó chạy install, lint, format, typecheck, Prisma validate/generate, tests và build. Playwright report chỉ được upload khi lỗi.

CI đặt:

```dotenv
NODE_ENV=test
DATABASE_ENABLED=false
DATABASE_ENVIRONMENT=development
DATABASE_URL=
DIRECT_URL=
```

Do đó CI không thể vô tình kết nối database production. Integration test với database thật cần một workflow và Neon branch test riêng nếu được bổ sung sau này.

## Dependency policy

Prisma packages được pin cùng phiên bản 7.10.0. Root overrides khóa `deepmerge-ts` và `mysql2` ở bản đã vá vì chúng là dependency gián tiếp của Prisma CLI. Không dùng `npm audit fix --force`.

Generated Prisma Client nằm tại `apps/api/src/generated/prisma`, được tạo lại trong postinstall/prebuild/pretest/pretypecheck và không commit.
