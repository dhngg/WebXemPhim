# Trạng thái hiện tại

| Mục                        | Trạng thái                 | Bằng chứng                                                                                   |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| Sprint hiện tại            | Sprint 1 / P02 IN PROGRESS | P02-06 đã triển khai ownership transfer; P01 chưa nghiệm thu toàn phần                       |
| Neon development Apartment | MIGRATIONS APPLIED         | P01-01 và P02 migration áp dụng ngày 14/10/2026; schema hiện đã đồng bộ                      |
| Auth API                   | SMOKE PASS                 | Register, login, me, refresh, duplicate grace, logout, revoked refresh trên Neon development |
| Kiểm thử còn thiếu         | BLOCKED                    | Chưa có PostgreSQL test tách biệt để chạy constraint/concurrency suite đầy đủ                |
| P02 Workspace/RBAC         | P02-06 TRANSFER COMPLETE   | Workspace lifecycle, membership và ownership transfer đã có; stress DB còn thiếu             |

## Quyết định đã duyệt

1. P01 tạo hai bảng `users`, `auth_sessions`; P02 tạo và đã áp dụng hai bảng `workspaces`, `workspace_memberships` trên Neon development; 22 bảng P03–P13 còn lại vẫn planned.
2. Contract register/login/me/refresh/logout/logout-all và chính sách Auth trong [BACKEND_PART1_AUTH](backend/BACKEND_PART1_AUTH.md).
3. JWT HS256 TTL 10 phút; refresh family 30 ngày, rotation atomic, grace 10 giây.
4. Password Argon2id 12–128 ký tự; deployment cùng site và chính sách cookie production đã chốt.

## Phụ thuộc còn mở trước implementation

1. Hostname/origin cụ thể cho từng môi trường.
2. PostgreSQL test database tách biệt để chạy integration/concurrency stress test lặp lại mà không phụ thuộc Neon development.
3. Secret manager cụ thể, quyền quản trị key và quy trình vận hành rotation HS256.
4. Quyền/người chịu trách nhiệm chỉnh frontend cho tích hợp P01.

P01-03 dùng key ring có `kid`: ký bằng active key và verify bằng các key còn hiệu lực. Secret manager/nguồn cấp biến môi trường production chưa được tự giả định.

P02-01 dùng role theo từng membership, không đưa role chủ nhà vào `users`. P01 đã có code Auth và smoke test nhưng toàn bộ P01 vẫn chưa production-ready do còn thiếu concurrency stress test và distributed rate limiting.

## Kết quả P02-01–P02-06 — Workspace & RBAC Foundation

- Đã thêm Prisma models `Workspace`, `WorkspaceMembership`, enum role `OWNER`/`MANAGER`/`STAFF` và workspace status `ACTIVE`/`ARCHIVED`.
- Một user chỉ có một membership trong mỗi workspace qua unique `(workspace_id, user_id)`; có index `user_id` và `(workspace_id, role)` phục vụ tra cứu/phân quyền.
- Foreign key từ membership tới `users` và `workspaces` dùng `RESTRICT`; workspace có archive state và database trigger chặn hard delete.
- Partial unique index ngăn nhiều OWNER; deferred constraint triggers yêu cầu đúng một OWNER tại commit. Create và ownership transfer dùng transaction `Serializable`; transfer khóa row workspace trước khi đổi role.
- Migration `202610140002_p02_workspace_membership_foundation`: **APPLIED** trên Neon development Apartment trong P02-03; không reset, `db push` hoặc drop dữ liệu.
- Backend đã có `POST /workspaces`, `GET /workspaces`, `GET /workspaces/:workspaceId`, DTO/OpenAPI, service/repository và DB-backed membership guard. Client không được gửi role khi tạo workspace.
- P02-04 thêm `PATCH /workspaces/:workspaceId/archive` và `/restore`: OWNER-only, Origin/CSRF, row lock + recheck OWNER trong transaction, idempotent và không xóa membership/dữ liệu. Workspace archived vẫn đọc được; business write guard trả `WORKSPACE_ARCHIVED`.
- P02-05 thêm list/add/update-role/delete membership. OWNER được kiểm tra từ database; email được chuẩn hóa; chỉ user ACTIVE và role MANAGER/STAFF được thêm. OWNER không thể bị đổi role hoặc xóa qua các API này.
- P02-06 thêm `POST /workspaces/:workspaceId/transfer-ownership`: OWNER hiện tại chuyển quyền atomic cho target membership có user ACTIVE; OWNER cũ luôn thành MANAGER. Workspace, quyền và target được kiểm tra lại trong transaction sau row lock.
- Kiểm tra toàn repository: Prisma format/validate/generate, lint, format check, typecheck và build PASS; 113 backend unit/static, 5 shared, 4 frontend và 42 API tests PASS.
- Kiểm tra trực tiếp trên PostgreSQL: PASS cho metadata, tạo workspace cùng OWNER, chặn OWNER thứ hai, chặn workspace thiếu OWNER, chặn hard delete và chuyển OWNER atomic. Mọi dữ liệu kiểm tra được rollback.
- Concurrency stress test với nhiều connection đồng thời: NOT RUN; chưa được coi là đã chứng minh dưới tải cạnh tranh.
- Kiểm tra P02-04: lint, API typecheck/build, 123 backend unit/static tests và 45 API tests PASS. Shared/frontend tests NOT RUN vì không thay đổi trong task.
- Kiểm tra P02-05: lint, format, monorepo typecheck, API build, 135 backend unit/static tests, 50 API tests và 5 shared contract tests PASS. Frontend tests NOT RUN; frontend không thay đổi.
- Kiểm tra P02-06: API typecheck/build, 15 unit test repository/service và 15 API test workspace PASS. Concurrent request test PASS ở mock transaction/API; PostgreSQL stress nhiều connection NOT RUN.
- Chưa có permission matrix nghiệp vụ chi tiết MANAGER/STAFF; frontend không thay đổi.
- Chi tiết tại [BACKEND_PART2_WORKSPACE](backend/BACKEND_PART2_WORKSPACE.md).

## Kết quả P01-07 — Neon development

- Preflight đọc-only: xác nhận đúng direct host, database Apartment, user neondb_owner, môi trường development và schema public trống trước migration.
- `prisma migrate deploy`: PASS; áp dụng duy nhất `202610140001_p01_auth_foundation`. Không reset, db push hoặc sửa migration đã commit.
- PostgreSQL metadata: PASS; users, auth_sessions, 8 index được yêu cầu (kể cả partial unique family), primary/check/foreign key và migration history đều hiện diện. Đây là kiểm tra metadata, chưa phải suite constraint/concurrency đầy đủ.
- Auth local: AUTH_ENABLED=true, signing key ngẫu nhiên chỉ trong apps/api/.env bị Git ignore; không ghi credentials/token vào tài liệu.
- API thật trên Neon development: register 201, login 200, me 200, refresh 200, duplicate trong grace 409 TOKEN_ALREADY_ROTATED, logout 204, refresh bị thu hồi 401 REFRESH_TOKEN_INVALID, access JWT vẫn hợp lệ tới expiry: PASS. Tài khoản thử riêng được xóa sau smoke.
- Build API và Prisma generate: PASS. PostgreSQL test DB riêng và race/replay ngoài grace trên DB thật: NOT RUN. P01 toàn phần và production readiness: chưa nghiệm thu.

## Kết quả P01-01

- Prisma format/validate/generate: PASS.
- Static check schema/migration, enums, unique/index/FK/self-reference và partial unique family index: PASS.
- Lint, typecheck, build, 27 unit/component tests và 9 API tests: PASS.
- Migration execution và PostgreSQL constraint tests: NOT RUN vì không có test database tách biệt.
- Neon/database dùng chung: không kết nối và không thay đổi trong task.

## Kết quả P01-02

- Shared Auth request/response types và danh sách error code ổn định đã có trong `packages/shared`.
- NestJS có DTO validation, typed application exception, error mapping và OpenAPI cho sáu route `/api/v1/auth/*`.
- Route hiện trả `501 AUTH_NOT_IMPLEMENTED` với payload hợp lệ; không trả thành công hoặc token giả trước khi có nghiệp vụ.
- `PATCH /api/v1/users/me` chưa được duyệt và không có trong source; chỉ được ghi là đề xuất hoãn.
- Kiểm chứng migration trên PostgreSQL: `DB VALIDATION BLOCKED` vì không có test database riêng. Không dùng và không thay đổi Neon development.
- Prisma validate/generate, lint, format check, typecheck và build: PASS.
- Test: 43 unit/component, 11 API và 6 frontend E2E PASS.

## Kết quả P01-03

- Cấu hình Auth fail-fast khi `AUTH_ENABLED=true`; không hardcode hoặc ghi log signing key.
- Password hashing dùng Argon2id với baseline memory 19 MiB, time cost 2, parallelism 1; production vẫn cần benchmark trước khi điều chỉnh tăng.
- Access JWT dùng HS256, TTL 600 giây, `kid`, issuer/audience và allowlist claim/header nghiêm ngặt.
- Refresh token dùng CSPRNG 32 byte, base64url và SHA-256 digest 32 byte.
- Key ring hỗ trợ rotation có kiểm soát: thêm key, chuyển active key, giữ key cũ ít nhất qua TTL access token rồi mới gỡ.
- Tại thời điểm hoàn tất P01-03, business logic Auth chưa được triển khai. P01-04 sau đó bổ sung Register/Login; Neon vẫn không bị kết nối hoặc thay đổi.
- Prisma validate/generate, lint, format check, typecheck và build: PASS.
- Test: 61 unit/component, 11 API và 6 frontend E2E PASS.

## Kết quả P01-04

- Register chuẩn hóa email, hash mật khẩu bằng Argon2id và tạo đồng thời `users` ACTIVE cùng refresh session đầu tiên qua Prisma transaction.
- Login dùng thông báo `INVALID_CREDENTIALS` thống nhất, thực hiện dummy password verification khi email không tồn tại và chặn user `DISABLED`.
- Mỗi lần đăng ký/đăng nhập tạo refresh family 30 ngày, chỉ lưu SHA-256 digest; raw refresh token chỉ được gửi qua cookie HttpOnly. Access JWT có TTL 600 giây.
- Origin allowlist và header `X-CSRF-Protection` được kiểm tra cho request thay đổi trạng thái. CORS bật credentials khi Auth hoạt động; cookie production dùng Secure, SameSite=Lax, Path=/, không có Domain và tên `__Host-` bắt buộc.
- `AUTH_ENABLED=false` trả `AUTH_DISABLED`, không tạo đường bypass. Production fail-fast nếu Auth tắt, thiếu cấu hình Auth/database, dùng origin không HTTPS hoặc cookie không có tiền tố `__Host-`.
- Refresh/logout/logout-all/me vẫn là contract-only và trả `AUTH_NOT_IMPLEMENTED`; rate limiting chưa thuộc phần triển khai P01-04.
- Migration và PostgreSQL integration tests: `DB VALIDATION BLOCKED` vì chưa có database test tách biệt. Không kết nối hoặc thay đổi Neon.
- Prisma validate/generate, format check, lint, typecheck và build: PASS.
- Test: 76 workspace (68 backend unit/component, 4 shared, 4 frontend unit), 17 API và 6 frontend E2E PASS.

## Kết quả P01-05

- Refresh rotation dùng Prisma transaction và conditional update `revoked_at IS NULL`; generation thắng tạo đúng một generation kế tiếp cùng family và giữ nguyên absolute expiry.
- Request dùng lại token vừa rotate trong grace 10 giây trả `TOKEN_ALREADY_ROTATED` và không thu hồi family. Replay ngoài grace thu hồi generation đang active trong family với reason `REUSE`.
- Refresh token invalid/expired/revoked, user disabled và token reuse được ánh xạ sang error code công khai; cookie bị xóa cho lỗi kết thúc phiên, nhưng không xóa ở duplicate-within-grace để tránh ghi đè cookie của request thắng.
- Logout thu hồi family tìm được từ refresh token và có tính idempotent. Logout-all xác minh access JWT/user ACTIVE rồi thu hồi mọi session active của user; cả hai xóa cookie hiện tại.
- `/auth/me` dùng access guard kiểm tra Bearer JWT, issuer/audience/algorithm/expiry/claims và đọc trạng thái user hiện tại từ database; không nhận role/workspace từ client.
- Unit/API tests mô phỏng nhánh race, grace, replay, expiry/revocation, disabled user, logout và `/me`: PASS. Atomicity/concurrency trên PostgreSQL thật vẫn `DB VALIDATION BLOCKED` vì chưa có test database tách biệt.
- Không chạy migration, không kết nối hoặc thay đổi Neon; không sửa frontend.
- Prisma validate/generate, format check, lint, typecheck và build: PASS.
- Test: 92 workspace (84 backend unit/component, 4 shared, 4 frontend unit), 26 API và 6 frontend E2E PASS.

## Kết quả P01-06A

- Register: 5/IP/900 giây; login: 30/IP và 10/email trim/lowercase/900 giây; refresh: 60/IP và 30/family/60 giây. Các quota/window có environment config và validation số nguyên dương.
- HTTP `429 RATE_LIMITED` theo error contract, có `Retry-After`; OpenAPI/CORS đã bổ sung header. Không xác minh sự tồn tại của email trong limiter, không log password/token/email.
- `TRUSTED_PROXY_CIDRS` mặc định rỗng. Chỉ tin IP/CIDR cấu hình rõ ràng; kiểm thử XFF giả và chuỗi nhiều hop. IPv4-mapped IPv6 được chuẩn hóa, IPv6 gom /64.
- Bộ nhớ giới hạn bởi `AUTH_RATE_LIMIT_MAX_KEYS`, dọn bucket hết hạn, từ chối bucket mới khi đầy. Không giữ raw IP/email/family trong store; dùng HMAC với khóa riêng mỗi process.
- Chỉ local/single-instance: counters reset khi restart; chưa shared store, chưa production-ready distributed. Cần shared atomic store và test nhiều replica trước nghiệm thu production.
- Auth business logic, schema/migration và frontend không thay đổi. Không chạy migration hoặc kết nối Neon. PostgreSQL tests: NOT RUN, không cần cho task limiter; DB/concurrency P01-05 vẫn BLOCKED.
- PASS: lint, format check, typecheck, build toàn monorepo và `git diff --check`.
- PASS: `npm test` 113 test (105 backend, 4 shared, 4 frontend); `npm run test:api` 38 test. Bao gồm vượt ngưỡng, reset, IP/email/family độc lập, request đồng thời, proxy spoofing, lỗi lookup và HTTP/OpenAPI 429/Retry-After.
- Prisma generate PASS qua các script typecheck/test/build. Playwright E2E: NOT RUN trong P01-06A; frontend không thay đổi.

## Quyết định nghiệp vụ đã ghi nhận

- Sản phẩm có Public Marketplace, Landlord Workspace, Tenant Portal và Platform Admin.
- User có nhiều vai trò theo ngữ cảnh; workspace membership quyết định quyền quản lý và tenant-user link cần xác minh.
- Platform Admin không mặc định được sửa dữ liệu tài chính/nghiệp vụ riêng của workspace; gỡ listing không xóa room/hợp đồng gốc.
- Yêu cầu chi tiết tại [BUSINESS_REQUIREMENTS](business/BUSINESS_REQUIREMENTS.md).

## Đề xuất và quyết định nghiệp vụ còn mở

1. Admin có được xem chi tiết hợp đồng/hóa đơn riêng tư để giải quyết khiếu nại hay không; mặc định hiện tại là không.
2. Product Owner có đưa Smart Rental Assistant vào scope triển khai P04/V1.0 hay không.
3. Budget mode mặc định, ranking weights, routing/geocoding provider, travel modes và chính sách vị trí.
4. Công thức/đơn vị tính chi tiết cho nước, dịch vụ, phí theo người/xe/phòng và tổng chi phí ước tính.
5. Contract gửi chứng từ thanh toán và quyền xem tiền cọc trong Tenant Portal.

**Cập nhật lần cuối:** 14/10/2026, Asia/Saigon.
