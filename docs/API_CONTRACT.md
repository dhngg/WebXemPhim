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

| Method | Path                               | Mục đích                                            | Thành công | Lỗi chính                                                 |
| ------ | ---------------------------------- | --------------------------------------------------- | ---------- | --------------------------------------------------------- |
| POST   | `/workspaces`                      | Tạo workspace và OWNER trong một transaction        | 201        | UNAUTHORIZED, ACCOUNT_DISABLED, VALIDATION_ERROR          |
| GET    | `/workspaces`                      | Liệt kê workspace theo membership trong DB          | 200        | UNAUTHORIZED                                              |
| GET    | `/workspaces/:workspaceId`         | Xem workspace nếu có membership hợp lệ              | 200        | UNAUTHORIZED, WORKSPACE_NOT_FOUND                         |
| PATCH  | `/workspaces/:workspaceId/archive` | Archive workspace, giữ nguyên dữ liệu và membership | 200        | UNAUTHORIZED, CSRF_VALIDATION_FAILED, WORKSPACE_NOT_FOUND |
| PATCH  | `/workspaces/:workspaceId/restore` | Khôi phục workspace đã archive                      | 200        | UNAUTHORIZED, CSRF_VALIDATION_FAILED, WORKSPACE_NOT_FOUND |

Request tạo workspace chỉ nhận `name` đã trim, dài 1–100 ký tự. Role OWNER do backend gán; trường role/workspace ownership từ client bị validation từ chối. Response gồm thông tin workspace và `currentMembership.role`, không đưa role workspace vào access JWT.

POST dùng exact Origin allowlist và `X-CSRF-Protection: 1`. Detail sử dụng access JWT để xác định user rồi tra `(workspace_id, user_id)` tại database; user không có membership nhận 404 để không làm lộ workspace tồn tại. List lấy trực tiếp các membership của user và có thể trả cả workspace archived để phục vụ audit/lifecycle về sau.

Archive/restore chỉ cho OWNER theo membership trong database. Hai endpoint không nhận body, dùng Origin/CSRF như các request ghi khác và idempotent: archive workspace đã ARCHIVED hoặc restore workspace đã ACTIVE đều trả `200` với trạng thái hiện tại, không thay đổi lại timestamp. Archive chỉ cập nhật `status`/`archived_at`, không xóa membership hoặc dữ liệu. Workspace ARCHIVED vẫn đọc được theo membership; các thao tác ghi nghiệp vụ trả `409 WORKSPACE_ARCHIVED`.

Các endpoint quản lý thành viên (`GET/POST /workspaces/:workspaceId/members`, `PATCH/DELETE /workspaces/:workspaceId/members/:membershipId`) và `POST /workspaces/:workspaceId/transfer-ownership` đã **ngừng hoạt động trong V1** (404 cho mọi người, kể cả OWNER). V1 không có MANAGER/STAFF, không thêm nhân viên và không chuyển quyền OWNER. Migration 026 chặn tạo mới hoặc đổi role sang MANAGER/STAFF ở mức database; không xóa hay sửa membership lịch sử.

**Chính sách V1 (BE-V1-RBAC-02/03):** chỉ OWNER vận hành workspace. MANAGER/STAFF không có quyền runtime ở bất kỳ endpoint nào (nhận `WORKSPACE_NOT_FOUND`); membership lịch sử được giữ nguyên trong database và không còn ý nghĩa phân quyền. Capabilities và `GET /workspaces` chỉ trả membership OWNER.

## Building — P03-03 MANAGEMENT IMPLEMENTED

| Method | Path                                                     | Quyền | Thành công | Lỗi chính                                                                                        |
| ------ | -------------------------------------------------------- | ----- | ---------- | ------------------------------------------------------------------------------------------------ |
| POST   | `/workspaces/:workspaceId/buildings`                     | OWNER | 201        | VALIDATION_ERROR, WORKSPACE_NOT_FOUND, WORKSPACE_ARCHIVED                                        |
| GET    | `/workspaces/:workspaceId/buildings`                     | OWNER | 200        | UNAUTHORIZED, WORKSPACE_NOT_FOUND                                                                |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId`         | OWNER | 200        | UNAUTHORIZED, WORKSPACE_NOT_FOUND, BUILDING_NOT_FOUND                                            |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId`         | OWNER | 200        | VALIDATION_ERROR, WORKSPACE_NOT_FOUND, WORKSPACE_ARCHIVED, BUILDING_NOT_FOUND, BUILDING_ARCHIVED |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/archive` | OWNER | 200        | WORKSPACE_NOT_FOUND, WORKSPACE_ARCHIVED, BUILDING_NOT_FOUND                                      |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/restore` | OWNER | 200        | WORKSPACE_NOT_FOUND, WORKSPACE_ARCHIVED, BUILDING_NOT_FOUND                                      |

POST chỉ tạo Building `ACTIVE` trong workspace `ACTIVE`. Backend lấy workspace và role từ database, khóa workspace rồi kiểm tra lại quyền OWNER trong transaction; không nhận workspace ID, status hoặc country code từ body. Quốc gia mặc định và duy nhất trong MVP là `VN`. Latitude/longitude là cặp tùy chọn: nếu gửi phải có cả hai và nằm trong phạm vi hợp lệ.

GET list/detail luôn giới hạn bằng `workspace_id` và `building_id` phù hợp. Update chỉ áp dụng cho Building ACTIVE và không cho client đổi workspace, status hoặc country code. Archive/restore OWNER-only, idempotent, khóa row Building và không xóa dữ liệu. Mọi thao tác ghi bị chặn khi workspace ARCHIVED.

## Room & Amenities — P03-05 IMPLEMENTED

| Method | Path                                                                                | Quyền | Thành công |
| ------ | ----------------------------------------------------------------------------------- | ----- | ---------- |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/rooms`                              | OWNER | 201        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/rooms`                              | OWNER | 200        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId`                      | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId`                      | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/archive`              | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/restore`              | OWNER | 200        |
| POST   | `/workspaces/:workspaceId/amenities`                                                | OWNER | 201        |
| GET    | `/workspaces/:workspaceId/amenities`                                                | OWNER | 200        |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/amenities/:amenityId` | OWNER | 204        |
| DELETE | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/amenities/:amenityId` | OWNER | 204        |

Room code được trim/uppercase và unique trong từng Building. `areaSqm` và `monthlyRent` dùng decimal string; diện tích phải dương, giá thuê không âm. Client chỉ được đặt trạng thái `VACANT` hoặc `UNAVAILABLE`; `OCCUPIED` dành cho luồng hợp đồng sau này, còn `ARCHIVED` chỉ qua lifecycle API. Restore đưa Room về `VACANT`.

Mọi read đều giới hạn theo workspace/building/room. Mọi write kiểm tra lại membership từ database, khóa scope và bị chặn khi workspace hoặc Building archived; Room archived cũng chặn update và thay đổi tiện ích. Assign/unassign tiện ích idempotent. Lỗi chính: `ROOM_NOT_FOUND`, `ROOM_ARCHIVED`, `ROOM_CODE_CONFLICT`, `AMENITY_NOT_FOUND`, `AMENITY_ALREADY_EXISTS` cùng các lỗi workspace/building hiện có.

## Room Images — P03-06 IMPLEMENTED

| Method | Path                                                                           | Quyền | Thành công |
| ------ | ------------------------------------------------------------------------------ | ----- | ---------- |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/images`          | OWNER | 201        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/images`          | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/images/reorder`  | OWNER | 200        |
| DELETE | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/images/:imageId` | OWNER | 204        |

POST nhận URL HTTP/HTTPS và alt text tùy chọn; backend chỉ lưu metadata, không tải file và chưa tích hợp storage provider. Reorder nhận `imageIds` là toàn bộ ảnh hiện tại của Room, mỗi ID đúng một lần. Mọi write bị chặn khi workspace, Building hoặc Room archived. Lỗi riêng: `ROOM_IMAGE_NOT_FOUND`, `ROOM_IMAGE_ORDER_INVALID`; các lỗi scope/lifecycle hiện có tiếp tục áp dụng.

### Rate limiting P01-06A

Register/login/refresh trả `429 RATE_LIMITED` theo `ApiErrorResponse` và header `Retry-After` (số giây nguyên dương). Header được CORS expose và có trong OpenAPI. Mặc định: register 5/IP/900 giây; login 30/IP và 10/email đã trim/lowercase/900 giây; refresh 60/IP và 30/family/60 giây. Không công bố loại quota hoặc email có tồn tại trong response, không xóa cookie khi bị rate limit.

Quota và window cấu hình qua `AUTH_RATE_LIMIT_*` trong `.env.example`; proxy chỉ được tin qua `TRUSTED_PROXY_CIDRS` chứa IP/CIDR rõ ràng, mặc định không tin XFF. Limiter in-memory chỉ dùng local/single-instance, chưa có shared store và chưa production-ready distributed. Chi tiết, giới hạn bộ nhớ và yêu cầu triển khai tại [P01 Users/Auth — P01-06A](backend/BACKEND_PART1_AUTH.md#p01-06a--rate-limiting-đã-triển-khai).

## Public Marketplace — P04-01 IMPLEMENTED

| Method | Path                                                                   | Quyền  | Thành công |
| ------ | ---------------------------------------------------------------------- | ------ | ---------- |
| PUT    | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/listing` | OWNER  | 200        |
| GET    | `/listings`                                                            | Public | 200        |
| GET    | `/listings/:listingId`                                                 | Public | 200        |

PUT nhận `{ "published": boolean }` và là thao tác idempotent. Chỉ Room `VACANT` thuộc Workspace/Building ACTIVE và Room không archived mới được bật công khai; lỗi điều kiện trả `LISTING_NOT_ELIGIBLE`. Public list/detail luôn áp lại toàn bộ điều kiện công khai, nên listing tự biến mất khi Room không còn VACANT hoặc scope bị archive. Listing không tồn tại hoặc không còn đủ điều kiện trả `LISTING_NOT_FOUND` ở detail.

GET list hỗ trợ `city`, `district`, `ward`, `minPrice`, `maxPrice`, `amenityIds` dạng UUID phân cách bằng dấu phẩy, `page` và `limit` tối đa 50. Nhiều amenity dùng AND: Room phải có tất cả tiện ích yêu cầu. Response chỉ gồm dữ liệu Room, Building, giá, tiện ích và ảnh cần cho marketplace; không trả workspace membership, tenant, hợp đồng, hóa đơn hoặc dữ liệu quản trị. P04-01 chưa có bản đồ/routing hoặc Smart Rental Assistant; Viewing Requests được triển khai riêng ở P04-02.

## Viewing Requests — P04-02 IMPLEMENTED

| Method | Path                                                           | Quyền             | Thành công |
| ------ | -------------------------------------------------------------- | ----------------- | ---------- |
| POST   | `/listings/:listingId/viewing-requests`                        | User đã đăng nhập | 201        |
| GET    | `/viewing-requests/me`                                         | User đã đăng nhập | 200        |
| PATCH  | `/viewing-requests/:requestId/cancel`                          | Chủ yêu cầu       | 200        |
| GET    | `/workspaces/:workspaceId/viewing-requests`                    | OWNER             | 200        |
| PATCH  | `/workspaces/:workspaceId/viewing-requests/:requestId/confirm` | OWNER             | 200        |
| PATCH  | `/workspaces/:workspaceId/viewing-requests/:requestId/reject`  | OWNER             | 200        |

POST nhận `scheduledAt` ISO-8601 có timezone và `message` tùy chọn. Lịch phải ở tương lai và listing phải đang published với Room VACANT, Workspace/Building ACTIVE. Luồng trạng thái: `PENDING → CONFIRMED | REJECTED` do OWNER; chủ yêu cầu có thể chuyển `PENDING | CONFIRMED → CANCELLED`. Confirm kiểm tra lại toàn bộ điều kiện tại thời điểm quyết định.

Danh sách cá nhân luôn lọc bằng user ID từ access token; API hủy cũng yêu cầu đồng thời request ID và requester user ID. Danh sách quản lý luôn lọc theo workspace sau DB-backed RBAC. Lỗi chính: `VIEWING_REQUEST_NOT_FOUND`, `VIEWING_REQUEST_NOT_ELIGIBLE`, `VIEWING_REQUEST_INVALID_TRANSITION`, `VIEWING_REQUEST_CONFLICT`.

## Tenant Management — P05-01 IMPLEMENTED

| Method | Path                                         | Quyền | Thành công |
| ------ | -------------------------------------------- | ----- | ---------- |
| POST   | `/workspaces/:workspaceId/tenants`           | OWNER | 201        |
| GET    | `/workspaces/:workspaceId/tenants`           | OWNER | 200        |
| GET    | `/workspaces/:workspaceId/tenants/:tenantId` | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/tenants/:tenantId` | OWNER | 200        |

Create nhận `fullName` bắt buộc; `phone`, `email`, `dateOfBirth`, `address`, `notes` là tùy chọn. Update nhận ít nhất một trường và cho phép gửi `null` để xóa dữ liệu tùy chọn. Email được lowercase/trim, điện thoại được chuẩn hóa trước khi lưu; ngày sinh phải là ngày lịch hợp lệ, không ở tương lai. List hỗ trợ `status`, `page`, `limit` tối đa 50.

Mọi endpoint dùng access-token guard và membership đọc từ database. create/update yêu cầu Workspace ACTIVE và tenant ARCHIVED không được cập nhật. Response không chứa trường xác thực, user link hoặc định danh nhạy cảm ngoài hồ sơ được phép. Lỗi riêng: `TENANT_NOT_FOUND`, `TENANT_ARCHIVED`; các lỗi RBAC/workspace/validation hiện có tiếp tục áp dụng. Không có API delete, archive/restore, Tenant User Links hoặc Contract trong P05-01.

## Tenant Account Linking — P05-02 IMPLEMENTED

| Method | Path                                                               | Quyền               | Thành công |
| ------ | ------------------------------------------------------------------ | ------------------- | ---------- |
| POST   | `/tenants/:tenantId/link-requests`                                 | User đăng nhập      | 201        |
| GET    | `/tenant-link-requests/me`                                         | Chủ request         | 200        |
| GET    | `/tenants/me`                                                      | User có link ACTIVE | 200        |
| GET    | `/workspaces/:workspaceId/tenant-link-requests`                    | OWNER               | 200        |
| PATCH  | `/workspaces/:workspaceId/tenant-link-requests/:requestId/approve` | OWNER               | 200        |
| PATCH  | `/workspaces/:workspaceId/tenant-link-requests/:requestId/reject`  | OWNER               | 200        |
| PATCH  | `/workspaces/:workspaceId/tenant-user-links/:linkId/revoke`        | OWNER               | 200        |
| GET    | `/workspaces/:workspaceId/tenants/:tenantId/user-links`            | OWNER               | 200        |

`GET …/tenants/:tenantId/user-links` (FE-05.1) trả mảng liên kết ACTIVE (chưa thu hồi, tối đa 1) của hồ sơ người thuê trong workspace, mỗi phần tử gồm các trường của `TenantUserLinkResponse` (có `id` dùng cho revoke) và `user { id, email, displayName }`. Chỉ OWNER; tenant của workspace khác trả `TENANT_NOT_FOUND`; không trả token lời mời hay hash. Đọc được cả khi workspace đã archive.

Backend lấy requester từ access token và không tự xác minh theo email, tên hoặc số điện thoại. Chỉ request `PENDING` được duyệt/từ chối. Một Tenant chỉ có một request PENDING và một link ACTIVE; một User chỉ có một link ACTIVE trong mỗi Workspace. Duyệt tạo link và cập nhật request trong cùng transaction; thu hồi giữ audit record.

`GET /tenants/me` luôn lọc theo user ID trong token và link chưa thu hồi, không nhận Tenant/User ID từ client, không trả ghi chú nội bộ. Lỗi riêng: `TENANT_LINK_REQUEST_NOT_FOUND`, `TENANT_LINK_REQUEST_CONFLICT`, `TENANT_LINK_REQUEST_INVALID_TRANSITION`, `TENANT_LINK_NOT_FOUND`.

## Rental Contracts — P06-01 IMPLEMENTED

| Method | Path                                                 | Quyền | Thành công |
| ------ | ---------------------------------------------------- | ----- | ---------- |
| POST   | `/workspaces/:workspaceId/contracts`                 | OWNER | 201        |
| GET    | `/workspaces/:workspaceId/contracts`                 | OWNER | 200        |
| GET    | `/workspaces/:workspaceId/contracts/:contractId`     | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/contracts/:contractId`     | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/contracts/:contractId/end` | OWNER | 200        |

Create nhận `roomId`, `tenantId`, ngày bắt đầu/kết thúc, tiền thuê tháng và ghi chú tùy chọn. Ngày nghiệp vụ tính theo **Asia/Ho_Chi_Minh**, ngày kết thúc tính trong kỳ. Hợp đồng được phép **bắt đầu trong tương lai**; chỉ cần `startDate ≤ endDate` và `endDate ≥ hôm nay`. PostgreSQL exclusion constraint dùng khoảng ngày inclusive để chặn hai hợp đồng ACTIVE trùng Room (kể cả request đồng thời); nhiều hợp đồng nối tiếp trên một Room là hợp lệ khi khoảng ngày không giao nhau. Client không được gửi status hoặc thay Room/Tenant khi update.

**Mô hình hiệu lực (V1):** `status` lưu chỉ có `ACTIVE`/`ENDED`. Response có thêm `phase` **suy ra từ ngày**, không lưu và không có job: `UPCOMING` (ACTIVE, trước `startDate`), `IN_EFFECT` (ACTIVE, trong `[startDate, endDate]`), `OVERDUE` (ACTIVE, sau `endDate`, chờ OWNER kết thúc thủ công — không tự chuyển ENDED), `ENDED`, `CANCELLED` (ENDED trước `startDate`, chưa từng có hiệu lực).

Create khóa Room (Serializable). Room chỉ chuyển `VACANT → OCCUPIED` khi hợp đồng **đã bắt đầu**; hợp đồng tương lai chỉ giữ chỗ cho kỳ thuê, không đổi trạng thái Room. Create chấp nhận Room `VACANT` hoặc `OCCUPIED` (hợp đồng nối tiếp), từ chối `UNAVAILABLE`/`ARCHIVED`. `room.status` trả qua API được **suy ra theo ngày** khi đọc (có hợp đồng ACTIVE đã bắt đầu ⇒ `OCCUPIED`, kể cả quá hạn chưa kết thúc; chỉ có hợp đồng tương lai ⇒ không `OCCUPIED`); `ARCHIVED` và `UNAVAILABLE` thủ công giữ nguyên.

`PATCH .../end` là thao tác vòng đời duy nhất cho ACTIVE, nghĩa theo ngày: hợp đồng **đã bắt đầu** bắt buộc `endDate` (từ `startDate` đến hôm nay) và Room chỉ về `VACANT` khi không còn hợp đồng ACTIVE nào khác đã bắt đầu; hợp đồng **chưa bắt đầu** là **hủy**: bỏ trống `endDate` (gửi `endDate` ⇒ 409 `CONTRACT_NOT_ELIGIBLE`), hợp đồng thành `ENDED` với `endedAt` trước `startDate`, **giữ nguyên kỳ thuê đã đăng ký** (không đặt ngày giả), Room và tiền cọc không bị đụng tới. Thiếu `endDate` cho hợp đồng đã bắt đầu ⇒ 400 `VALIDATION_ERROR`. Update hợp đồng đã bắt đầu không được dời `startDate` về tương lai. Trigger database ngăn Room có hợp đồng ACTIVE **đã bắt đầu** rời OCCUPIED, ngăn archive Room/Building có hợp đồng ACTIVE (kể cả tương lai). Không có API delete.

Tenant đã liên kết xem được hợp đồng/sổ cọc của mình trước `startDate` (`/contracts/me`), nhưng không tạo được maintenance request từ hợp đồng chưa bắt đầu (409 `MAINTENANCE_NOT_ELIGIBLE`). Hóa đơn không tính cho thời gian trước `startDate` (kỳ không giao hợp đồng ⇒ `INVOICE_PERIOD_INVALID`; kỳ chứa `startDate` tính theo số ngày từ `startDate`); hợp đồng `CANCELLED` không lập được hóa đơn. Tiền cọc ghi nhận được trước `startDate` và không tự hoàn khi hủy. Dashboard `contracts` thêm `inEffect`/`upcoming`/`overdue` (`active` giữ nghĩa lifecycle ACTIVE) và đếm `rooms.occupied` theo hợp đồng đã bắt đầu. Public listing/viewing request loại các Room đã có hợp đồng ACTIVE bắt đầu; Room chỉ được giữ chỗ cho tương lai **chưa** bị ẩn (chính sách hiển thị chờ Product Owner duyệt).

Lỗi riêng: `CONTRACT_NOT_FOUND`, `CONTRACT_CONFLICT`, `CONTRACT_INVALID_TRANSITION`, `CONTRACT_NOT_ELIGIBLE`. Migration P06-01 đã deploy trên Neon development; smoke PostgreSQL thật PASS.

## Vehicle Management — P06-02 IMPLEMENTED

| Method | Path                                                | Quyền | Thành công |
| ------ | --------------------------------------------------- | ----- | ---------- |
| POST   | `/workspaces/:workspaceId/vehicles`                 | OWNER | 201        |
| GET    | `/workspaces/:workspaceId/vehicles`                 | OWNER | 200        |
| GET    | `/workspaces/:workspaceId/vehicles/:vehicleId`      | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/vehicles/:vehicleId`      | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/vehicles/:vehicleId/stop` | OWNER | 200        |

Create liên kết xe với Tenant ACTIVE trong cùng Workspace. Biển số được uppercase và bỏ dấu cách, dấu chấm, gạch nối trước validation; giá trị chuẩn hóa phải unique trong Workspace, kể cả xe INACTIVE, nhằm tránh nhập nhằng lịch sử tính phí sau này. `vehicleType` là chuỗi nghiệp vụ mở vì danh mục loại xe chưa được Product Owner chốt.

Update không cho đổi Tenant hoặc status và chỉ áp dụng cho xe ACTIVE có Tenant chưa archive. Stop idempotent, chuyển sang INACTIVE, lưu thời điểm/lý do và không xóa bản ghi. Lỗi riêng: `VEHICLE_NOT_FOUND`, `VEHICLE_ALREADY_EXISTS`, `VEHICLE_INACTIVE`, `VEHICLE_NOT_ELIGIBLE`. P06-02 chưa tính phí gửi xe hoặc tạo invoice.

## Building Rates — P07-01 IMPLEMENTED

| Method | Path                                                                    | Quyền | Thành công |
| ------ | ----------------------------------------------------------------------- | ----- | ---------- |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/rates`                  | OWNER | 201        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/rates`                  | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/rates/:ratePlanId`      | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/rates/:ratePlanId/stop` | OWNER | 200        |

Rate hỗ trợ ELECTRICITY, WATER, WIFI, TRASH, PARKING và OTHER. Client phải gửi rõ đơn vị KWH, CUBIC_METER, ROOM, PERSON, VEHICLE hoặc FIXED vì đơn vị mặc định chưa được Product Owner chốt. Tiền là decimal string và được lưu `DECIMAL(14,4)`.

PATCH không sửa phiên bản cũ: backend đóng phiên bản hiện tại tại `effectiveFrom` mới rồi tạo successor trong cùng transaction. Khoảng hiệu lực dùng `[effectiveFrom, effectiveTo)`, database cấm overlap theo Building và code. Stop đóng khoảng hiện hành, giữ nguyên lịch sử; không có hard-delete. Lỗi riêng: `RATE_PLAN_NOT_FOUND`, `RATE_PLAN_CONFLICT`, `RATE_PLAN_INACTIVE`, `RATE_PLAN_NOT_ELIGIBLE`.

## Meter Readings — P07-02 IMPLEMENTED

| Method | Path                                                                                            | Quyền | Thành công |
| ------ | ----------------------------------------------------------------------------------------------- | ----- | ---------- |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/meter-readings`                   | OWNER | 201        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/meter-readings`                   | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/meter-readings/:readingId/adjust` | OWNER | 200        |

POST nhận `meterType` (ELECTRICITY, WATER), `period` (`YYYY-MM`), `currentReading` và `previousReading` (bắt buộc ở kỳ đầu tiên; các kỳ sau lấy từ chỉ số cuối kỳ trước). Chỉ số là chuỗi Decimal tối đa 3 chữ số thập phân. GET lọc theo `meterType`, `period`, có phân trang và trả kèm lịch sử `adjustments`.

PATCH nhận `currentReading`, `reason` và `previousReading` (chỉ ở kỳ đầu tiên); chỉ kỳ mới nhất của room/công tơ được điều chỉnh. Mỗi lần điều chỉnh tăng `revision` và thêm một dòng audit append-only.

Lỗi: `METER_READING_NOT_FOUND` (404); `METER_READING_DUPLICATE` (409, trùng kỳ); `METER_READING_INVALID` (409, chỉ số giảm, sai thứ tự kỳ hoặc điều chỉnh kỳ cũ); `METER_READING_NOT_ELIGIBLE` (409, room/building archived); `WORKSPACE_ARCHIVED`; `ROOM_NOT_FOUND`.

## Invoices — P08-01 IMPLEMENTED

| Method | Path                                                                       | Quyền              | Thành công |
| ------ | -------------------------------------------------------------------------- | ------------------ | ---------- |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/invoices`                  | OWNER              | 201        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/invoices`                  | OWNER              | 200        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId`       | OWNER              | 200        |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId`       | OWNER              | 200        |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId/issue` | OWNER              | 200        |
| DELETE | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId`       | OWNER              | 204        |
| GET    | `/invoices/me`, `/invoices/me/:invoiceId`                                  | Tenant đã liên kết | 200        |

POST nhận `contractId`, `period` (`YYYY-MM`), tùy chọn `occupantCount` (số người do quản lý xác nhận; lưu `occupantCountConfirmedBy/At`), `billVehicles` (bắt buộc chọn khi Tenant có nhiều hợp đồng trong kỳ), `dueDate`, `notes`; tạo DRAFT và tính các dòng RENT, ELECTRICITY, WATER, SERVICE, VEHICLE từ hợp đồng, Building Rates, Meter Readings và Vehicles. PATCH chỉ DRAFT: cập nhật `occupantCount`/`dueDate`/`notes` và tính lại toàn bộ dòng từ dữ liệu hiện tại. `issue` tính lại lần cuối, từ chối nếu còn thiếu, rồi chốt `totalAmount`. DELETE chỉ xóa DRAFT.

Response: DRAFT có `missingItems[]` (`code`, `reason`, `detail`), `isComplete`, `provisionalAmount` (tổng tạm, không phải số tiền cuối) và `totalAmount = null`; ISSUED có `totalAmount` và `provisionalAmount = null`. Tiền là chuỗi VND nguyên; mỗi dòng có `quantity`, `unitPrice`, `prorationNumerator/Denominator`, `amount`, `ratePlanId`, `meterReadingId`/`meterRevision`, `details` (chỉ số, biển số, số người). Chỉ các dịch vụ gán cho phòng (Room Services bên dưới) mới được tính. Phí `ROOM`/`FIXED` có đơn giá đổi giữa kỳ được tách thành nhiều dòng (mỗi dòng có `prorationNumerator/Denominator` và `details.segmentFrom/segmentTo`). Lý do thiếu: `METER_READING_MISSING`, `OCCUPANT_COUNT_MISSING`, `RATE_MISSING`, `RATE_PERIOD_MISMATCH`, `RATE_SEGMENT_CONSUMPTION_UNKNOWN` (điện/nước đổi giá giữa kỳ), `RATE_CHANGE_NOT_SPLITTABLE`, `WATER_METHOD_CONFLICT`, `RATE_UNIT_UNSUPPORTED`, `VEHICLE_BILLING_AMBIGUOUS`. `billsVehicles` trả `null` khi chưa quyết định.

Tenant chỉ thấy hóa đơn ISSUED của hợp đồng thuộc tenant mà tài khoản đang liên kết (chưa revoke); hóa đơn không thuộc về họ trả `404`. Lỗi: `INVOICE_NOT_FOUND` (404), `CONTRACT_NOT_FOUND` (404), `INVOICE_DUPLICATE`, `INVOICE_NOT_EDITABLE`, `INVOICE_INCOMPLETE`, `INVOICE_PERIOD_INVALID`, `INVOICE_NOT_ELIGIBLE`, `INVOICE_VEHICLE_BILLING_CONFLICT` (hóa đơn khác của cùng Tenant đã nhận xe trong kỳ), `WORKSPACE_ARCHIVED` (409).

## Room Services — P08-01 IMPLEMENTED

| Method | Path                                                                                    | Quyền | Thành công |
| ------ | --------------------------------------------------------------------------------------- | ----- | ---------- |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/services`                 | OWNER | 201        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/services`                 | OWNER | 200        |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/services/:serviceId/stop` | OWNER | 200        |

POST gán một `rateCode` của Building Rates cho phòng từ `effectiveFrom`; mã phải tồn tại trong Building (nếu không: `RATE_PLAN_NOT_FOUND`). `stop` nhận `effectiveTo` (loại trừ) và giữ lịch sử, không xóa. Hai khoảng cùng mã của một phòng không được chồng lấn (`ROOM_SERVICE_CONFLICT`). Room/Building/Workspace archived trả `ROOM_SERVICE_NOT_ELIGIBLE` hoặc `WORKSPACE_ARCHIVED`. Thay đổi chỉ ảnh hưởng hóa đơn DRAFT khi tính lại; hóa đơn ISSUED giữ nguyên snapshot.

## Invoice Adjustments — P08-02 IMPLEMENTED

| Method | Path                                                                                           | Quyền              | Thành công                 |
| ------ | ---------------------------------------------------------------------------------------------- | ------------------ | -------------------------- |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId/adjustments`               | OWNER              | 201 (retry giống hệt: 200) |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId/adjustments`               | OWNER              | 200                        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId/adjustments/:adjustmentId` | OWNER              | 200                        |
| GET    | `/invoices/me/:invoiceId/adjustments`                                                          | Tenant đã liên kết | 200                        |

POST nhận `amount` (chuỗi có dấu, ví dụ `-50000`; tối đa 4 số thập phân, làm tròn `ROUND_HALF_UP` về 1 VND, không được là 0), `reason`, `idempotencyKey` (8–100 ký tự do client sinh) và tùy chọn `referenceAdjustmentId` (adjustment của cùng hóa đơn mà bản này sửa sai, mỗi adjustment chỉ được sửa một lần). Retry cùng key và cùng nội dung trả lại adjustment gốc (200) mà không ghi thêm; cùng key khác nội dung trả `INVOICE_ADJUSTMENT_IDEMPOTENCY_CONFLICT`. Response có `amount`, `requestedAmount` (số gốc client gửi), `reason`, `referenceAdjustmentId`, `createdBy`, `createdAt`. Không có endpoint sửa/xóa.

GET danh sách trả thêm `originalTotal`, `adjustmentsTotal`, `adjustedTotal`. Chi tiết hóa đơn ISSUED có thêm `adjustmentsTotal` và `adjustedTotal` (null với DRAFT); `totalAmount` luôn là số gốc khi phát hành. Lỗi 409: `INVOICE_ADJUSTMENT_INVALID` (bằng 0 sau làm tròn, làm adjustedTotal âm, hoặc tham chiếu sai), `INVOICE_ADJUSTMENT_NOT_ELIGIBLE` (hóa đơn chưa ISSUED hoặc building archived), `INVOICE_ADJUSTMENT_IDEMPOTENCY_CONFLICT`, `WORKSPACE_ARCHIVED`; 404: `INVOICE_ADJUSTMENT_NOT_FOUND`.

## Invoice Payments — P08-03 IMPLEMENTED

| Method | Path                                                                                             | Quyền              | Thành công                 |
| ------ | ------------------------------------------------------------------------------------------------ | ------------------ | -------------------------- |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId/payments`                    | OWNER              | 201 (retry giống hệt: 200) |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId/payments/:paymentId/reverse` | OWNER              | 201 (retry giống hệt: 200) |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId/payments`                    | OWNER              | 200                        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/invoices/:invoiceId/payments/:paymentId`         | OWNER              | 200                        |
| GET    | `/invoices/me/:invoiceId/payments`                                                               | Tenant đã liên kết | 200                        |

POST payments nhận `amount` (chuỗi VND nguyên > 0), `method` (`CASH`, `BANK_TRANSFER`), `receivedAt` (ISO 8601, không ở tương lai), `note` tùy chọn và `idempotencyKey` (8–100 ký tự). `reverse` nhận `reason` bắt buộc và `idempotencyKey`, tạo giao dịch `REVERSAL` đảo toàn phần; giao dịch gốc không đổi và hiển thị `reversedByPaymentId`. Retry cùng key và nội dung trả lại giao dịch gốc (200), cùng key khác nội dung trả `INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT`. Không có endpoint sửa/xóa.

GET danh sách trả thêm `amountDue`, `paidTotal`, `outstanding`, `paymentStatus` (`UNPAID`, `PARTIALLY_PAID`, `PAID`). Chi tiết hóa đơn ISSUED có thêm `paidTotal`, `outstanding`, `paymentStatus` (null với DRAFT). Lỗi 409: `INVOICE_PAYMENT_EXCEEDS_DUE`, `INVOICE_PAYMENT_INVALID` (thời điểm ở tương lai, đảo giao dịch không hợp lệ hoặc đã đảo), `INVOICE_PAYMENT_NOT_ELIGIBLE` (hóa đơn chưa ISSUED hoặc building archived), `INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT`, `WORKSPACE_ARCHIVED`; 404: `INVOICE_PAYMENT_NOT_FOUND`.

Adjustment (P08-02) giờ thêm lỗi 409 `INVOICE_ADJUSTMENT_BELOW_PAID` khi sẽ hạ `amountDue` xuống dưới số tiền đã nhận.

## Contract Deposits — P08-04 IMPLEMENTED

| Method | Path                                                                              | Quyền              | Thành công                 |
| ------ | --------------------------------------------------------------------------------- | ------------------ | -------------------------- |
| POST   | `/workspaces/:workspaceId/contracts/:contractId/deposit/entries`                  | OWNER              | 201 (retry giống hệt: 200) |
| POST   | `/workspaces/:workspaceId/contracts/:contractId/deposit/entries/:entryId/reverse` | OWNER              | 201 (retry giống hệt: 200) |
| GET    | `/workspaces/:workspaceId/contracts/:contractId/deposit`                          | OWNER              | 200                        |
| GET    | `/workspaces/:workspaceId/contracts/:contractId/deposit/entries/:entryId`         | OWNER              | 200                        |
| GET    | `/contracts/me/:contractId/deposit`                                               | Tenant đã liên kết | 200                        |

POST entries nhận `kind` (`COLLECTION`, `DEDUCTION`, `REFUND`), `amount` (VND nguyên > 0), `occurredAt` (ISO 8601, không ở tương lai), `idempotencyKey` (8–100 ký tự) và: `method` (`CASH`/`BANK_TRANSFER`, bắt buộc với COLLECTION và REFUND, không được có với DEDUCTION), `reason` + `reference` (bắt buộc với DEDUCTION và REFUND; với REFUND `reference` là mã chuyển khoản hoặc số biên nhận thực tế), `note` tùy chọn. `REFUND` chỉ ghi nhận khoản đã hoàn, không chuyển tiền; nó khác `reverse` (đảo ghi nhận nhầm). Khi Building hoặc Workspace đã archive, endpoint này chỉ nhận `REFUND` từ OWNER (COLLECTION/DEDUCTION nhận `WORKSPACE_ARCHIVED` hoặc `DEPOSIT_NOT_ELIGIBLE`); `reverse` luôn bị chặn khi archived. `reverse` nhận `reason` bắt buộc và `idempotencyKey`, tạo giao dịch `REVERSAL` đảo toàn phần; giao dịch gốc không đổi và hiển thị `reversedByEntryId`. Retry giống hệt trả bản gốc (200), cùng key khác nội dung trả `DEPOSIT_IDEMPOTENCY_CONFLICT`.

GET trả danh sách giao dịch kèm `collectedTotal`, `deductedTotal`, `refundedTotal` (đã trừ giao dịch bị đảo) và `balance`. Lỗi 409: `DEPOSIT_INSUFFICIENT_BALANCE`, `DEPOSIT_ENTRY_INVALID` (thiếu method/reason/reference, thời điểm ở tương lai, đảo không hợp lệ hoặc đã đảo), `DEPOSIT_NOT_ELIGIBLE` (building archived, trừ REFUND của OWNER), `DEPOSIT_IDEMPOTENCY_CONFLICT`, `WORKSPACE_ARCHIVED`; 404: `DEPOSIT_ENTRY_NOT_FOUND`, `CONTRACT_NOT_FOUND`.

## Maintenance — P09 IMPLEMENTED

| Method | Path                                                                                        | Quyền              | Thành công |
| ------ | ------------------------------------------------------------------------------------------- | ------------------ | ---------- |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/maintenance-requests`                       | OWNER              | 201        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/maintenance-requests`                       | OWNER              | 200        |
| GET    | `/workspaces/:workspaceId/buildings/:buildingId/maintenance-requests/:requestId`            | OWNER              | 200        |
| PATCH  | `/workspaces/:workspaceId/buildings/:buildingId/maintenance-requests/:requestId`            | OWNER              | 200        |
| POST   | `/workspaces/:workspaceId/buildings/:buildingId/maintenance-requests/:requestId/transition` | OWNER              | 200        |
| POST   | `/maintenance-requests/me`                                                                  | Tenant đã liên kết | 201        |
| GET    | `/maintenance-requests/me`, `/maintenance-requests/me/:requestId`                           | Tenant đã liên kết | 200        |

Tạo (OWNER) nhận `roomId`, `title`, `description`, `priority`; tạo (tenant) nhận `contractId` ACTIVE của chính mình thay cho `roomId`. PATCH nhận `title`, `description`, `priority`, `note`. `transition` nhận `toStatus`, `note` (bắt buộc với `RESOLVED`, thành ghi chú xử lý). V1 không có chức năng giao người phụ trách: OWNER tự xử lý, `IN_PROGRESS` và `RESOLVED` không cần assignee; request gửi `assigneeUserId` bị từ chối `VALIDATION_ERROR` (400). Assignee lịch sử được giữ nguyên, hiển thị trong chi tiết/history cho OWNER và không thể thay đổi. Chi tiết có `history[]` (`fromStatus`, `toStatus`, `priority`, `note`, thời điểm, và người thực hiện/được giao — ẩn với tenant); danh sách không kèm lịch sử.

Lỗi 409: `MAINTENANCE_INVALID_TRANSITION`, `MAINTENANCE_NOT_EDITABLE` (đã CLOSED), `MAINTENANCE_NOT_ELIGIBLE` (room/building archived), `MAINTENANCE_ASSIGNEE_INVALID`, `WORKSPACE_ARCHIVED`; 404: `MAINTENANCE_NOT_FOUND`, `CONTRACT_NOT_FOUND` (hợp đồng không phải của tenant hoặc không còn ACTIVE); 400 `VALIDATION_ERROR` khi thiếu ghi chú xử lý.

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
| Property        | media/image upload                                       | PARTIAL     |
| Marketplace     | map/routing, smart recommendation, viewing request       | PARTIAL     |
| Tenancy/finance | tenant, contract, rate, meter, invoice, payment, deposit | PARTIAL     |
| Operations      | maintenance, notification, analytics, audit              | NOT STARTED |

Mỗi endpoint nghiệp vụ phải có path, DTO, response/error status, authorization, pagination/idempotency khi cần, OpenAPI update và test trước khi được chuyển sang mục “đã triển khai”.

## Notifications & Dashboard (P10/P11)

| Method | Path                                                            | Quyền             | Mô tả                                                                   |
| ------ | --------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| GET    | `/notifications?unreadOnly=&page=&limit=`                       | User đã đăng nhập | Thông báo của chính user, mới nhất trước                                |
| GET    | `/notifications/unread-count`                                   | User đã đăng nhập | `{ unread }`                                                            |
| POST   | `/notifications/:notificationId/read`                           | User đã đăng nhập | Idempotent; của người khác → 404 `NOTIFICATION_NOT_FOUND`               |
| POST   | `/notifications/read-all`                                       | User đã đăng nhập | `{ updated }`                                                           |
| GET    | `/workspaces/:workspaceId/dashboard?buildingId=&period=YYYY-MM` | OWNER             | `DashboardResponse`; tiền là chuỗi VND nguyên, tiền cọc không được tính |

## Platform Admin (P12)

Chỉ user có dòng `platform_admins` (kiểm tra từ DB mỗi request); user thường nhận 403 `PLATFORM_ADMIN_REQUIRED`. Mọi POST yêu cầu `reason` (≤500 ký tự), Origin và `X-CSRF-Protection`.

| Method | Path                                                                     | Mô tả                                                                                                                 |
| ------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/users?status=&search=&page=&limit=`                              | Danh sách tài khoản                                                                                                   |
| GET    | `/admin/users/:userId`                                                   | Chi tiết, số membership/session, lý do kiểm duyệt gần nhất                                                            |
| POST   | `/admin/users/:userId/lock` · `/unlock`                                  | Khóa (thu hồi session)/mở khóa; không tự khóa, không khóa admin; 409 `ADMIN_TARGET_PROTECTED`/`ADMIN_STATE_UNCHANGED` |
| GET    | `/admin/listings?hidden=&published=&workspaceId=`                        | Listing kèm trạng thái kiểm duyệt (không có dữ liệu tenant/hợp đồng)                                                  |
| POST   | `/admin/listings/:listingId/hide` · `/restore`                           | Ẩn/khôi phục khỏi Marketplace, không đổi Room/giá/publish                                                             |
| GET    | `/admin/audit-logs?actorUserId=&action=&targetType=&targetId=&from=&to=` | Audit log bất biến, phân trang                                                                                        |

## V1 gap closure

| Method | Path                                                              | Quyền             | Mô tả                                                                        |
| ------ | ----------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| PATCH  | `/workspaces/:workspaceId/tenants/:tenantId/archive` · `/restore` | OWNER             | Idempotent; archive 409 `TENANT_HAS_ACTIVE_CONTRACT` khi còn hợp đồng ACTIVE |
| GET    | `/users/me`                                                       | User đã đăng nhập | Hồ sơ của chính mình                                                         |
| PATCH  | `/users/me`                                                       | User đã đăng nhập | Chỉ `displayName` (string 1–100 hoặc `null`); trường khác 400                |

| POST | `/maintenance-requests/me/:requestId/cancel` | Tenant đã liên kết | Hủy yêu cầu `OPEN` chưa phân công của chính mình, body `{ reason? }`; 409 `MAINTENANCE_NOT_CANCELLABLE`. Migration 022–023 đã deploy. |

## Forgot / Reset Password

| Method | Path                    | Body                                                                 | Response                                                                                                                  |
| ------ | ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/forgot-password` | `{ email }`                                                          | `202 { accepted: true }` — luôn giống nhau dù tài khoản có tồn tại, bị khóa hay không                                     |
| POST   | `/auth/reset-password`  | `{ token, newPassword }` (token 43 ký tự base64url, mật khẩu 12–128) | `204`, xóa cookie refresh; `400 PASSWORD_RESET_TOKEN_INVALID` cho token sai/hết hạn/đã dùng/bị thay thế/tài khoản bị khóa |

Cả hai cần Origin + `X-CSRF-Protection`; `429 RATE_LIMITED` kèm `Retry-After`.

- Token ngẫu nhiên 32 byte, hạn **20 phút**, DB chỉ lưu SHA-256 (có tiền tố tách miền), dùng một lần; mỗi tài khoản chỉ có một token còn hiệu lực (yêu cầu mới thay thế token cũ) và tối đa một token mới mỗi 60 giây.
- Link khôi phục: `PASSWORD_RESET_URL_BASE#token=<token>` (fragment nên token không tới server/proxy/log). Token không bao giờ có trong response hay log.
- Chỉ tài khoản `ACTIVE` nhận được link và đặt lại được; tài khoản `DISABLED` không dùng reset để vượt khóa.
- Reset đặt mật khẩu mới bằng Argon2id, thu hồi **mọi** refresh session của user và vô hiệu mọi token còn lại trong cùng transaction. Access JWT đã cấp vẫn hợp lệ tối đa 10 phút (cùng hành vi với logout-all).
- Giới hạn mặc định (mỗi 15 phút, process-local như limiter Auth hiện có): forgot 5/IP và 3/email; reset 10/IP và 5/token. Phản hồi forgot được đệm tối thiểu ~300 ms để không lộ tài khoản qua thời gian.

### Cấu hình email tối thiểu

```
EMAIL_PROVIDER=smtp                  # mặc định disabled: không gửi gì, cũng không tạo token
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false                    # true cho cổng 465
SMTP_USER=...                        # cặp SMTP_USER/SMTP_PASSWORD phải đi cùng nhau (bỏ trống nếu relay không cần auth)
SMTP_PASSWORD=...                    # chỉ đặt trong .env/secret manager, không commit
EMAIL_FROM="Rental <noreply@example.com>"
PASSWORD_RESET_URL_BASE=https://app.example.com/reset-password
```

`PASSWORD_RESET_URL_BASE` phải là URL http(s) không có query/fragment/credentials, origin phải nằm trong `CORS_ORIGINS` và là HTTPS ở production. Frontend đọc `token` từ `location.hash` rồi gọi `POST /auth/reset-password`. Biến rate limit: `AUTH_RATE_LIMIT_FORGOT_*`, `AUTH_RATE_LIMIT_RESET_*` (xem `apps/api/.env.example`).

## V1 Account Onboarding & Landlord Approval — IMPLEMENTED, MIGRATION APPLIED

Tất cả route dưới đây có prefix runtime `/api/v1`. Endpoint ghi yêu cầu Bearer access token, Origin nằm trong allowlist và `X-CSRF-Protection: 1`.

| Method     | Path                                                     | Quyền                                         | Mục đích                                                                                    |
| ---------- | -------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET        | `/users/me/capabilities`                                 | User hiện tại                                 | Workspace memberships/roles, tenant links, `isPlatformAdmin`, landlord application gần nhất |
| GET / POST | `/landlord-applications/me`                              | User hiện tại                                 | Xem lịch sử các yêu cầu của mình / gửi yêu cầu `{ reason }`                                 |
| GET        | `/admin/landlord-applications?status=&page=&limit=`      | PLATFORM_ADMIN                                | Duyệt danh sách yêu cầu, gồm lý do và quyết định trước đó                                   |
| POST       | `/admin/landlord-applications/:applicationId/approve`    | PLATFORM_ADMIN                                | Body `{ reason }`; lưu quyết định và audit                                                  |
| POST       | `/admin/landlord-applications/:applicationId/reject`     | PLATFORM_ADMIN                                | Body `{ reason }`; lưu quyết định và audit                                                  |
| POST       | `/workspaces`                                            | User ACTIVE đã được duyệt hoặc OWNER hiện hữu | Tạo Workspace cùng OWNER trong transaction                                                  |
| POST       | `/workspaces/:workspaceId/tenants/:tenantId/invitations` | OWNER                                         | Tạo token liên kết Tenant; token thô chỉ trả ở response tạo                                 |
| POST       | `/tenant-invitations/accept`                             | User đã đăng nhập                             | Body `{ token }`; chấp nhận token đúng một lần                                              |
| GET        | `/contracts/me?status=&page=&limit=`                     | User có Tenant link ACTIVE                    | Danh sách hợp đồng thuộc tenant link của chính user                                         |
| GET        | `/contracts/me/:contractId`                              | User có Tenant link ACTIVE                    | Chi tiết hợp đồng thuộc tenant link của chính user                                          |

Landlord application được giữ thành các dòng lịch sử; response lịch sử gồm lý do, trạng thái, người duyệt, thời điểm và ghi chú quyết định. Tối đa một yêu cầu PENDING mỗi user, tối đa 3 yêu cầu trong 365 ngày, và sau từ chối có cooldown 30 ngày. Không cho user tự duyệt, quyết định lại yêu cầu đã xử lý hoặc user không phải PLATFORM_ADMIN. Audit và trạng thái quyết định được ghi cùng transaction.

Để giữ tương thích, user đã có OWNER membership trước migration vẫn giữ nguyên workspace/quyền và được miễn bước application. User mới cần một application APPROVED chưa dùng để tạo workspace đầu tiên. Mỗi user được sở hữu tối đa một Workspace ACTIVE; OWNER cũ có nhiều Workspace được giữ nguyên nhưng không thể tạo thêm, và restore/chuyển OWNER cũng bị chặn nếu vượt giới hạn. Tạo/restore/chuyển OWNER khóa hàng user theo thứ tự ổn định để tuần tự hóa kiểm tra; workspace, membership và tiêu thụ approval nằm trong cùng transaction. APPROVED chỉ cho phép tạo Workspace, không cấp Platform Admin hay quyền duyệt listing. Lỗi giới hạn là `WORKSPACE_ACTIVE_LIMIT_REACHED` (409).

Tenant invitation token là 32 byte ngẫu nhiên, lưu SHA-256 digest có domain prefix, hạn 7 ngày, được khóa và đánh dấu accepted cùng transaction với việc tạo tenant-user link. Không dò tìm/ghép tenant theo email. Luồng tenant link request hiện tại vẫn giữ nguyên; migration làm `link_request_id` nullable và thêm `invitation_id`, với constraint bắt buộc mỗi link có đúng một nguồn request hoặc invitation.

Migration `202610150025_v1_account_onboarding` đã được người dùng deploy trên Neon development Apartment; `prisma:migrate:status` xác nhận 25/25 migrations và schema up to date. Smoke API/PostgreSQL sau deploy đã PASS cho capabilities, invitation, my contracts, landlord approval và giới hạn Workspace; tenant link request cũ vẫn hoạt động. SQL thay đổi `tenant_user_links.link_request_id` thành nullable và thêm `invitation_id` cùng constraint đúng một nguồn liên kết; smoke xác nhận dữ liệu hiện tại đáp ứng constraint. Không chạy lại migration trong lần kiểm tra này.
