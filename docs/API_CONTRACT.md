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

Swagger development: `/api/docs`. Hai endpoint trên là API nghiệp vụ duy nhất đã có trong source.

## Auth — APPROVED DESIGN / NOT IMPLEMENTED

Các endpoint sau đã được phê duyệt về thiết kế P01 nhưng chưa tồn tại trong source:

| Method | Path               | Mục đích                        | Thành công | Lỗi application chính                                         |
| ------ | ------------------ | ------------------------------- | ---------- | ------------------------------------------------------------- |
| POST   | `/auth/register`   | Tạo user và phiên đầu tiên      | 201        | EMAIL_ALREADY_EXISTS, RATE_LIMITED                            |
| POST   | `/auth/login`      | Đăng nhập và tạo session family | 200        | INVALID_CREDENTIALS, ACCOUNT_DISABLED, RATE_LIMITED           |
| POST   | `/auth/refresh`    | Atomic refresh token rotation   | 200        | REFRESH_TOKEN_INVALID, TOKEN_REUSE_DETECTED, ACCOUNT_DISABLED |
| POST   | `/auth/logout`     | Thu hồi family hiện tại         | 204        | Idempotent                                                    |
| POST   | `/auth/logout-all` | Thu hồi mọi family của user     | 204        | Lỗi access token phù hợp                                      |
| GET    | `/auth/me`         | Trả danh tính user hiện tại     | 200        | ACCESS_TOKEN_EXPIRED, ACCOUNT_DISABLED                        |

Access JWT TTL 10 phút. Refresh token nằm trong cookie HttpOnly và không truyền trong JSON; response register/login/refresh trả access token, `expiresIn=600` và user summary. Logout/logout-all thu hồi refresh family nhưng access JWT đã phát hành có thể còn hợp lệ tới khi hết TTL.

Application error code phải nằm trong trường `code` của [`ApiErrorResponse`](../packages/shared/src/index.ts) hiện có, đồng thời giữ `statusCode`, `message`, `path`, `timestamp` và `requestId`. Chi tiết DTO, cookie, CORS/CSRF, rotation và test tại [P01 Users/Auth](backend/BACKEND_PART1_AUTH.md).

Không chuyển các endpoint trên vào “API đã triển khai” trước khi source, OpenAPI và test tương ứng tồn tại.

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
