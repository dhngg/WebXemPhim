# API Contract

## Quy ước

- Base path: `/api/v1`.
- Nội dung JSON; timestamp ISO 8601 UTC khi là thời điểm.
- Error response theo `ApiErrorResponse` trong `packages/shared`.
- Money truyền dạng decimal string khi triển khai tài chính.
- Không công bố endpoint dự kiến là endpoint đang hoạt động.

## API đã triển khai

| Method | Path            | Mô tả                              | Trạng thái |
| ------ | --------------- | ---------------------------------- | ---------- |
| GET    | `/health`       | Liveness của API                   | PASS       |
| GET    | `/health/ready` | Readiness, trả trạng thái database | PASS       |

Swagger development: `/api/docs`. Các Auth endpoint đã có trong source được mô tả bên dưới.

## Auth — P01-04/P01-05 FLOWS IMPLEMENTED

P01-04 đã triển khai register/login. P01-05 đã triển khai atomic refresh rotation, logout, logout-all, `/me` và access guard qua Prisma repository/Auth service. Khi `AUTH_ENABLED=false`, mọi Auth operation fail-closed bằng `503 AUTH_DISABLED`.

| Method | Path               | Mục đích                        | Thành công | Lỗi application chính                                                                |
| ------ | ------------------ | ------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| POST   | `/auth/register`   | Tạo user và phiên đầu tiên      | 201        | EMAIL_ALREADY_EXISTS, RATE_LIMITED                                                   |
| POST   | `/auth/login`      | Đăng nhập và tạo session family | 200        | INVALID_CREDENTIALS, ACCOUNT_DISABLED, RATE_LIMITED                                  |
| POST   | `/auth/refresh`    | Atomic refresh token rotation   | 200        | TOKEN_ALREADY_ROTATED, REFRESH_TOKEN_INVALID, TOKEN_REUSE_DETECTED, ACCOUNT_DISABLED |
| POST   | `/auth/logout`     | Thu hồi family hiện tại         | 204        | Idempotent                                                                           |
| POST   | `/auth/logout-all` | Thu hồi mọi family của user     | 204        | Lỗi access token phù hợp                                                             |
| GET    | `/auth/me`         | Trả danh tính user hiện tại     | 200        | ACCESS_TOKEN_EXPIRED, ACCOUNT_DISABLED                                               |

Mọi POST Auth yêu cầu exact `Origin` nằm trong `CORS_ORIGINS` và header `X-CSRF-Protection: 1`. Thiếu hoặc sai trả `403 CSRF_VALIDATION_FAILED`. Production bắt buộc Auth được bật, CORS origin dùng HTTPS và refresh cookie có prefix `__Host-`; cookie dùng `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` và không đặt `Domain`.

Access JWT TTL 10 phút. Refresh token nằm trong cookie HttpOnly và không truyền trong JSON; response register/login/refresh trả access token, `expiresIn=600` và user summary. Logout/logout-all thu hồi refresh family nhưng access JWT đã phát hành có thể còn hợp lệ tới khi hết TTL.

Application error code phải nằm trong trường `code` của [`ApiErrorResponse`](../packages/shared/src/index.ts) hiện có, đồng thời giữ `statusCode`, `message`, `path`, `timestamp` và `requestId`. Chi tiết DTO, cookie, CORS/CSRF, rotation và test tại [P01 Users/Auth](backend/BACKEND_PART1_AUTH.md).

`PATCH /api/v1/users/me` chưa nằm trong phạm vi P01 đã duyệt. Đây chỉ là đề xuất cập nhật hồ sơ người dùng và được hoãn tới khi Product Owner duyệt contract riêng.

Contract source dùng base prefix `/api/v1`, vì vậy path runtime đầy đủ là `/api/v1/auth/*`. P01-07 đã áp dụng migration trên Neon development và smoke test register/login/me/refresh/logout/revocation bằng API thật PASS. Suite PostgreSQL constraint/concurrency đầy đủ vẫn chưa chạy do thiếu test database riêng.

## Workspace — P02-06 OWNERSHIP TRANSFER IMPLEMENTED

| Method | Path                                             | Mục đích                                                 | Thành công | Lỗi chính                                                                                                                                             |
| ------ | ------------------------------------------------ | -------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/workspaces`                                    | Tạo workspace và OWNER trong một transaction             | 201        | UNAUTHORIZED, ACCOUNT_DISABLED, VALIDATION_ERROR                                                                                                      |
| GET    | `/workspaces`                                    | Liệt kê workspace theo membership trong DB               | 200        | UNAUTHORIZED                                                                                                                                          |
| GET    | `/workspaces/:workspaceId`                       | Xem workspace nếu có membership hợp lệ                   | 200        | UNAUTHORIZED, WORKSPACE_NOT_FOUND                                                                                                                     |
| PATCH  | `/workspaces/:workspaceId/archive`               | Archive workspace, giữ nguyên dữ liệu và membership      | 200        | UNAUTHORIZED, CSRF_VALIDATION_FAILED, WORKSPACE_NOT_FOUND                                                                                             |
| PATCH  | `/workspaces/:workspaceId/restore`               | Khôi phục workspace đã archive                           | 200        | UNAUTHORIZED, CSRF_VALIDATION_FAILED, WORKSPACE_NOT_FOUND                                                                                             |
| GET    | `/workspaces/:workspaceId/members`               | OWNER xem danh sách membership và user đã đăng ký        | 200        | UNAUTHORIZED, WORKSPACE_NOT_FOUND                                                                                                                     |
| POST   | `/workspaces/:workspaceId/members`               | OWNER thêm user ACTIVE bằng email với role MANAGER/STAFF | 201        | VALIDATION_ERROR, WORKSPACE_NOT_FOUND, WORKSPACE_ARCHIVED, WORKSPACE_MEMBER_NOT_FOUND, WORKSPACE_MEMBER_ALREADY_EXISTS                                |
| PATCH  | `/workspaces/:workspaceId/members/:membershipId` | OWNER đổi role MANAGER/STAFF                             | 200        | VALIDATION_ERROR, WORKSPACE_NOT_FOUND, WORKSPACE_ARCHIVED, WORKSPACE_MEMBER_NOT_FOUND, WORKSPACE_OWNER_PROTECTED                                      |
| DELETE | `/workspaces/:workspaceId/members/:membershipId` | OWNER xóa membership không phải OWNER                    | 204        | WORKSPACE_NOT_FOUND, WORKSPACE_ARCHIVED, WORKSPACE_MEMBER_NOT_FOUND, WORKSPACE_OWNER_PROTECTED                                                        |
| POST   | `/workspaces/:workspaceId/transfer-ownership`    | OWNER chuyển quyền cho member ACTIVE hiện có             | 204        | VALIDATION_ERROR, UNAUTHORIZED, CSRF_VALIDATION_FAILED, WORKSPACE_NOT_FOUND, WORKSPACE_ARCHIVED, WORKSPACE_MEMBER_NOT_FOUND, WORKSPACE_OWNER_CONFLICT |

Request tạo workspace chỉ nhận `name` đã trim, dài 1–100 ký tự. Role OWNER do backend gán; trường role/workspace ownership từ client bị validation từ chối. Response gồm thông tin workspace và `currentMembership.role`, không đưa role workspace vào access JWT.

POST dùng exact Origin allowlist và `X-CSRF-Protection: 1`. Detail sử dụng access JWT để xác định user rồi tra `(workspace_id, user_id)` tại database; user không có membership nhận 404 để không làm lộ workspace tồn tại. List lấy trực tiếp các membership của user và có thể trả cả workspace archived để phục vụ audit/lifecycle về sau.

Archive/restore chỉ cho OWNER theo membership trong database. Hai endpoint không nhận body, dùng Origin/CSRF như các request ghi khác và idempotent: archive workspace đã ARCHIVED hoặc restore workspace đã ACTIVE đều trả `200` với trạng thái hiện tại, không thay đổi lại timestamp. Archive chỉ cập nhật `status`/`archived_at`, không xóa membership hoặc dữ liệu. Workspace ARCHIVED vẫn đọc được theo membership; các thao tác ghi nghiệp vụ trả `409 WORKSPACE_ARCHIVED`.

Membership management chỉ cho OWNER. Email thêm thành viên được trim/lowercase và chỉ khớp user `ACTIVE`; email không tồn tại hoặc user không ACTIVE cùng trả `WORKSPACE_MEMBER_NOT_FOUND`. Request role chỉ nhận `MANAGER` hoặc `STAFF`. Không API nào trong P02-05 được đổi/xóa OWNER; các trường hợp này trả `WORKSPACE_OWNER_PROTECTED`, còn chuyển OWNER thuộc P02-06. List vẫn hoạt động khi workspace archived, nhưng POST/PATCH/DELETE bị chặn. Repository khóa workspace và kiểm tra lại OWNER/trạng thái trong transaction trước khi ghi.

Ownership transfer nhận `{ "targetMembershipId": "uuid" }` và chỉ OWNER hiện tại được gọi. Repository khóa row workspace, xác nhận workspace ACTIVE, kiểm tra lại OWNER hiện tại và target membership thuộc đúng workspace với user ACTIVE, rồi hạ OWNER cũ thành MANAGER và nâng target thành OWNER trong cùng transaction `Serializable`. Constraint database vẫn bảo vệ đúng một OWNER. Request cạnh tranh thua trả `WORKSPACE_OWNER_CONFLICT`; target thiếu/disabled trả `WORKSPACE_MEMBER_NOT_FOUND`. PostgreSQL concurrency stress nhiều connection vẫn chưa chạy.

### Rate limiting P01-06A

Register/login/refresh trả `429 RATE_LIMITED` theo `ApiErrorResponse` và header `Retry-After` (số giây nguyên dương). Header được CORS expose và có trong OpenAPI. Mặc định: register 5/IP/900 giây; login 30/IP và 10/email đã trim/lowercase/900 giây; refresh 60/IP và 30/family/60 giây. Không công bố loại quota hoặc email có tồn tại trong response, không xóa cookie khi bị rate limit.

Quota và window cấu hình qua `AUTH_RATE_LIMIT_*` trong `.env.example`; proxy chỉ được tin qua `TRUSTED_PROXY_CIDRS` chứa IP/CIDR rõ ràng, mặc định không tin XFF. Limiter in-memory chỉ dùng local/single-instance, chưa có shared store và chưa production-ready distributed. Chi tiết, giới hạn bộ nhớ và yêu cầu triển khai tại [P01 Users/Auth — P01-06A](backend/BACKEND_PART1_AUTH.md#p01-06a--rate-limiting-đã-triển-khai).

## Marketplace recommendation — API DESIGN PROPOSAL

Endpoint đang được xem xét cho P04:

| Method | Path                        | Mục đích                                         | Trạng thái                          |
| ------ | --------------------------- | ------------------------------------------------ | ----------------------------------- |
| POST   | `/listings/recommendations` | Lọc/xếp hạng listing theo ngân sách và di chuyển | PROPOSED — NOT APPROVED/IMPLEMENTED |

Input dự kiến gồm destination/place identifier, maximum budget, budget mode, travel mode, maximum travel minutes, required amenities và pagination. Output dự kiến gồm listing công khai hợp lệ, giá/phí công khai, distance/travel time nếu tính được, match score, lý do đề xuất và trạng thái thiếu dữ liệu.

Contract, provider bản đồ, travel modes, ranking weights và budget mode mặc định chưa được Product Owner phê duyệt. Xem [SMART_RENTAL_ASSISTANT](marketplace/SMART_RENTAL_ASSISTANT.md). Endpoint này không thuộc danh sách API đã triển khai.

## API được đề xuất, chưa phê duyệt hoặc chưa thiết kế chi tiết

| Nhóm            | Ví dụ phạm vi                                            | Trạng thái  |
| --------------- | -------------------------------------------------------- | ----------- |
| Property        | building, room, media, amenity                           | NOT STARTED |
| Marketplace     | listing, search, filter, viewing                         | NOT STARTED |
| Tenancy/finance | tenant, contract, rate, meter, invoice, payment, deposit | NOT STARTED |
| Operations      | maintenance, notification, analytics, audit              | NOT STARTED |

Mỗi endpoint nghiệp vụ phải có path, DTO, response/error status, authorization, pagination/idempotency khi cần, OpenAPI update và test trước khi được chuyển sang mục “đã triển khai”.
