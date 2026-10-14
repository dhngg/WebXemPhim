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
| Workspace       | workspace, membership, role                              | NOT STARTED |
| Property        | building, room, media, amenity                           | NOT STARTED |
| Marketplace     | listing, search, filter, viewing                         | NOT STARTED |
| Tenancy/finance | tenant, contract, rate, meter, invoice, payment, deposit | NOT STARTED |
| Operations      | maintenance, notification, analytics, audit              | NOT STARTED |

Mỗi endpoint nghiệp vụ phải có path, DTO, response/error status, authorization, pagination/idempotency khi cần, OpenAPI update và test trước khi được chuyển sang mục “đã triển khai”.
