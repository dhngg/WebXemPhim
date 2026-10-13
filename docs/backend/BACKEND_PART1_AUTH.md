# P01 — Thiết kế Users/Auth

**Trạng thái:** DESIGN APPROVED — P01-01 SCHEMA/MIGRATION CREATED, NOT APPLIED  
**Ngày phê duyệt được ghi nhận:** 14/10/2026 (Asia/Saigon)  
**Phạm vi:** PART P01 — Users/Auth

Tài liệu này là nguồn sự thật kỹ thuật cho P01. P01-01 đã tạo Prisma models và migration SQL cho hai bảng Auth nhưng chưa chạy migration do chưa có PostgreSQL test database riêng. Neon database Apartment chưa bị thay đổi. Register/login/refresh/logout và các Auth flow vẫn chưa được triển khai.

## 1. Mục tiêu và phạm vi P01

P01 cung cấp danh tính người dùng và phiên đăng nhập:

- Đăng ký bằng email và mật khẩu.
- Đăng nhập và lấy thông tin người dùng hiện tại.
- Access token dạng JWT.
- Refresh token opaque, rotation và phát hiện reuse.
- Đăng xuất thiết bị hiện tại và đăng xuất tất cả thiết bị.
- Vô hiệu hóa tài khoản ở cấp hệ thống.
- Auth guard xác định user đã xác thực.

P01 không tạo workspace khi đăng ký, không triển khai workspace membership/RBAC, không xác minh email và không có forgot/reset password.

## 2. Các quyết định đã phê duyệt

- P01 chỉ tạo hai bảng users và auth_sessions.
- Mỗi lần login tạo một session family độc lập; mỗi rotation tạo một token generation mới trong cùng family.
- Access JWT có TTL 10 phút.
- Refresh family có absolute expiry 30 ngày.
- Refresh token có entropy tối thiểu 256 bit; database chỉ lưu SHA-256 digest.
- Rotation phải atomic; grace window cho concurrent refresh/retry là 10 giây.
- Token cũ không bao giờ được cấp thêm một generation mới.
- Reuse đáng ngờ sau grace window thu hồi family liên quan.
- Password dài 12–128 ký tự, hash bằng Argon2id và không áp đặt composition rule.
- JWT ký bằng HS256 với secret ngẫu nhiên tối thiểu 256 bit, riêng cho từng môi trường.
- JWT phải kiểm tra issuer, audience, expiry, type và algorithm allowlist.
- Deployment chọn mô hình frontend/API cùng site; hostname production cụ thể chưa được chốt.
- Refresh cookie production dùng prefix __Host-, Path=/, Secure, HttpOnly, SameSite=Lax và không đặt Domain.
- P01 có logout-all. Email verification và forgot/reset password được hoãn.

## 3. Ranh giới P01 và P02

| P01 — Users/Auth                     | P02 — Workspace/RBAC              |
| ------------------------------------ | --------------------------------- |
| User identity và password            | Workspace và membership           |
| Register, login, me                  | Tạo/chọn workspace                |
| Access JWT và refresh session        | Role và permission theo workspace |
| Auth guard trả authenticated user ID | Workspace/ownership guards        |
| Logout và logout-all                 | Quản lý thành viên                |

Không đưa global role, workspace ID, tenant ID hoặc workspace permission vào users hay JWT P01. P02 sử dụng user ID đã xác thực để tra workspace_memberships.

## 4. Database schema đã duyệt

Đây là schema P01-01 đã được biểu diễn trong Prisma và migration SQL reviewable. Migration chưa được thực thi trên database.

### 4.1. users

| Trường        | Kiểu mục tiêu | Null  | Ràng buộc và ý nghĩa                       |
| ------------- | ------------- | ----- | ------------------------------------------ |
| id            | UUID          | Không | Primary key, sinh phía server              |
| email         | varchar(254)  | Không | Email đã trim và lowercase                 |
| password_hash | text          | Không | Argon2id encoded hash                      |
| display_name  | varchar(100)  | Có    | Tên hiển thị, không dùng cho authorization |
| status        | enum/string   | Không | ACTIVE hoặc DISABLED; mặc định ACTIVE      |
| disabled_at   | timestamptz   | Có    | Thời điểm vô hiệu hóa                      |
| created_at    | timestamptz   | Không | Thời điểm tạo                              |
| updated_at    | timestamptz   | Không | Thời điểm cập nhật                         |

Ràng buộc:

- Unique index trên email.
- Backend chuẩn hóa email bằng trim và lowercase trước mọi truy vấn/ghi.
- Database cần check để email đã lưu luôn bằng lowercase(trim(email)); unique constraint là hàng rào cuối cho đăng ký đồng thời.
- Không lưu role, workspace ID hoặc tenant ID.

### 4.2. auth_sessions

Mỗi row là một refresh token generation. Các generation của cùng lần login dùng chung family_id.

| Trường                 | Kiểu mục tiêu                | Null  | Ràng buộc và ý nghĩa                                  |
| ---------------------- | ---------------------------- | ----- | ----------------------------------------------------- |
| id                     | UUID                         | Không | Primary key                                           |
| user_id                | UUID                         | Không | Foreign key đến users.id                              |
| family_id              | UUID                         | Không | Định danh phiên của một lần login/thiết bị            |
| token_hash             | bytea hoặc chuỗi hex cố định | Không | SHA-256 digest; unique                                |
| parent_session_id      | UUID                         | Có    | Self-FK đến generation trước                          |
| replaced_by_session_id | UUID                         | Có    | Self-FK đến generation kế tiếp                        |
| expires_at             | timestamptz                  | Không | Absolute expiry của family                            |
| last_used_at           | timestamptz                  | Có    | Lần refresh thành công gần nhất                       |
| revoked_at             | timestamptz                  | Có    | Thời điểm generation bị thu hồi                       |
| revoke_reason          | enum/string                  | Có    | ROTATED, LOGOUT, LOGOUT_ALL, REUSE hoặc USER_DISABLED |
| created_at             | timestamptz                  | Không | Thời điểm tạo                                         |

Index và constraint:

- Unique index trên token_hash.
- Index (user_id, revoked_at), (family_id, revoked_at) và expires_at.
- Self-FK cho parent_session_id và replaced_by_session_id.
- Partial unique index trên family_id với điều kiện revoked_at IS NULL để tối đa một generation chưa bị thu hồi trong mỗi family.
- Khi rotation, generation cũ phải bị thu hồi trước khi generation mới được insert trong cùng transaction.

Session hết hạn hoặc bị thu hồi được giữ thêm 30 ngày để hỗ trợ điều tra reuse, sau đó cleanup theo batch. Cleanup không chạy trong request login/refresh.

## 5. Auth flows

### 5.1. Register

1. Validate DTO và chuẩn hóa email.
2. Hash password bằng Argon2id.
3. Trong một transaction, tạo user và session family đầu tiên.
4. Trả access JWT, user summary và đặt refresh cookie.
5. Unique constraint xử lý race condition email trùng.

Register không tạo workspace, membership hoặc role.

### 5.2. Login

1. Chuẩn hóa email và tìm user.
2. Verify password theo đường xử lý không làm lộ user tồn tại hay không.
3. Chặn user có status DISABLED.
4. Tạo family mới cho lần login/thiết bị.
5. Trả access JWT, user summary và refresh cookie.

Mỗi thiết bị hoặc browser login có family độc lập.

### 5.3. Me

Auth guard kiểm tra JWT và trạng thái user. Response chỉ trả id, email, displayName, status và createdAt; không trả password hash, token hash, role hoặc workspace.

### 5.4. Disable user

User DISABLED bị chặn khi login, refresh và gọi protected API. Auth guard phải kiểm tra users.status trên mỗi protected request; quy mô V1.0 chấp nhận một database lookup. Khi disable, mọi refresh family của user bị thu hồi với reason USER_DISABLED.

### 5.5. Logout

- Logout thu hồi family hiện tại và xóa refresh cookie.
- Logout-all thu hồi mọi family của user và xóa cookie hiện tại.
- Cả hai idempotent.
- Access JWT đã phát hành vẫn có thể hợp lệ tới khi hết TTL 10 phút. P01 không dùng access-token denylist và không tuyên bố logout/logout-all vô hiệu JWT ngay lập tức.

## 6. JWT và refresh token rotation

### 6.1. Access JWT

JWT dùng HS256 và chỉ chấp nhận algorithm allowlist đã cấu hình. Claims tối thiểu:

| Claim | Giá trị                           |
| ----- | --------------------------------- |
| sub   | users.id                          |
| sid   | auth session family_id            |
| jti   | UUID riêng của access token       |
| iss   | Issuer cấu hình phía server       |
| aud   | API audience cấu hình phía server |
| iat   | Thời điểm phát hành               |
| exp   | Thời điểm hết hạn sau 10 phút     |
| typ   | Loại access token nội bộ          |

Không đưa role/permission workspace hoặc dữ liệu nhạy cảm vào JWT. Signing secret tối thiểu 256 bit, riêng cho từng môi trường, không nằm trong Git/log/Markdown và phải hỗ trợ rotation có kiểm soát.

### 6.2. Refresh token

- Token opaque được tạo bằng CSPRNG với entropy tối thiểu 256 bit và mã hóa base64url.
- Token thô chỉ được gửi qua cookie; database chỉ lưu SHA-256 digest.
- Token thô không được ghi log, response JSON hoặc localStorage.
- Absolute expiry của family là 30 ngày và không trượt vô hạn sau rotation.

### 6.3. Atomic rotation và concurrent refresh

Rotation thực hiện trong transaction:

1. Tính digest và tìm generation tương ứng.
2. Conditional update generation cũ với điều kiện revoked_at IS NULL và expires_at lớn hơn thời điểm hiện tại.
3. Request update thành công là request duy nhất thắng; generation cũ nhận revoked_at, last_used_at và reason ROTATED.
4. Insert generation mới cùng family_id và cùng absolute expires_at.
5. Ghi liên kết parent_session_id/replaced_by_session_id.
6. Commit rồi mới gửi refresh cookie mới.

Partial unique index bảo đảm một family không có hai generation chưa bị thu hồi. Token cũ không bao giờ tạo thêm generation thứ hai.

Xử lý retry/reuse:

- Token ROTATED được dùng lại trong 10 giây: trả lỗi refresh không hợp lệ nhưng không đánh dấu reuse và không thu hồi family. Frontend single-flight phải để request thắng cung cấp token mới cho các request đang chờ.
- Token ROTATED được dùng lại sau 10 giây: coi là reuse đáng ngờ, thu hồi generation đang active trong family và trả TOKEN_REUSE_DETECTED.
- Không lưu token mới dạng thô để phát lại. Nếu server commit rotation nhưng response thành công bị mất, client có thể không còn token mới và phải đăng nhập lại; grace window ngăn false-positive thu hồi family nhưng không thể khôi phục token thô đã mất.

## 7. Cookie, CORS và CSRF

### 7.1. Cookie production

Refresh cookie production:

- Tên có prefix __Host-.
- Path=/ vì prefix __Host- bắt buộc Path=/.
- Secure.
- HttpOnly.
- SameSite=Lax.
- Không đặt Domain.
- Max-Age không vượt quá absolute expiry còn lại của family.

Không kết hợp cookie __Host- với Path=/api/v1/auth vì browser có thể từ chối cookie không tuân thủ prefix.

Trên localhost/development qua HTTP, một số browser không chấp nhận đầy đủ cookie __Host-/Secure. Cấu hình development có thể dùng tên cookie riêng không có prefix và Secure=false; production luôn dùng chính sách ở trên. Không hardcode hostname/domain production khi chưa được duyệt.

### 7.2. Frontend và API cùng origin

- Browser gọi API bằng relative URL; không cần CORS cho luồng đó.
- Cookie vẫn dùng SameSite=Lax.
- Mọi POST Auth thay đổi trạng thái phải kiểm tra Origin khớp origin ứng dụng đã cấu hình.
- Yêu cầu custom header cố định cho request Auth từ JavaScript để ngăn form cross-site gửi request tương đương.

### 7.3. Frontend và API khác origin nhưng cùng site

- CORS dùng exact origin allowlist, không wildcard.
- Backend bật credentials cho origin đã duyệt.
- Axios dùng withCredentials cho request cần refresh cookie.
- Cho phép custom CSRF header trong preflight.
- Origin validation so khớp chính xác origin frontend đã cấu hình.
- SameSite=Lax vẫn áp dụng vì hai origin thuộc cùng site, nhưng same-site không đồng nghĩa same-origin.

CORS chỉ kiểm soát browser đọc response và gửi credential theo chính sách; CORS không phải cơ chế CSRF đầy đủ. Phòng vệ CSRF cho register, login, refresh, logout và logout-all gồm SameSite=Lax, exact Origin validation và custom header bắt buộc. GET /auth/me không thay đổi state.

## 8. API contract chi tiết

Tất cả endpoint dưới /api/v1. Đây là APPROVED DESIGN / NOT IMPLEMENTED.

### 8.1. POST /auth/register

- Request: email hợp lệ tối đa 254 ký tự; password 12–128 ký tự; displayName tùy chọn 1–100 ký tự.
- Thành công: 201, đặt refresh cookie và trả accessToken, expiresIn=600, user.
- Lỗi: VALIDATION_ERROR, EMAIL_ALREADY_EXISTS, RATE_LIMITED.

### 8.2. POST /auth/login

- Request: email và password theo giới hạn trên.
- Thành công: 200, đặt refresh cookie và trả accessToken, expiresIn=600, user.
- Lỗi: INVALID_CREDENTIALS, ACCOUNT_DISABLED, RATE_LIMITED.
- Email không tồn tại và password sai cùng dùng INVALID_CREDENTIALS.

### 8.3. POST /auth/refresh

- Không nhận refresh token trong body; đọc cookie HttpOnly.
- Thành công: 200, rotation cookie và trả accessToken, expiresIn=600, user.
- Lỗi: REFRESH_TOKEN_INVALID, TOKEN_REUSE_DETECTED, ACCOUNT_DISABLED, RATE_LIMITED.

### 8.4. POST /auth/logout

- Không cần body.
- Thu hồi family hiện tại và xóa cookie.
- Thành công: 204; idempotent.

### 8.5. POST /auth/logout-all

- Yêu cầu Bearer access JWT hợp lệ.
- Thu hồi tất cả family của user và xóa cookie hiện tại.
- Thành công: 204.
- Không bảo đảm access JWT đã phát hành bị vô hiệu ngay.

### 8.6. GET /auth/me

- Yêu cầu Bearer access JWT.
- Thành công: 200 với user summary.
- Lỗi: ACCESS_TOKEN_EXPIRED, ACCOUNT_DISABLED hoặc lỗi access token không hợp lệ.

### 8.7. Response và error contract

Response thành công không bao giờ chứa password hash, token hash, refresh token, role hoặc workspace permission.

Application error phải giữ cấu trúc ApiErrorResponse hiện có:

| Trường     | Ý nghĩa                                       |
| ---------- | --------------------------------------------- |
| statusCode | HTTP status                                   |
| code       | Mã application an toàn                        |
| message    | Thông báo công khai, không lộ chi tiết nội bộ |
| errors     | Chi tiết validation đã lọc, nếu có            |
| path       | Request path                                  |
| timestamp  | ISO 8601 UTC                                  |
| requestId  | Correlation ID                                |

Mã tối thiểu: INVALID_CREDENTIALS, EMAIL_ALREADY_EXISTS, ACCESS_TOKEN_EXPIRED, REFRESH_TOKEN_INVALID, TOKEN_REUSE_DETECTED, ACCOUNT_DISABLED và RATE_LIMITED.

GlobalExceptionFilter hiện chưa giữ application error code. Task triển khai phải bổ sung typed application exception/metadata để filter dùng code đã allowlist; không serialize exception message tùy ý. Tài liệu này không sửa filter.

Mọi endpoint phải có DTO, validation, Swagger/OpenAPI schema, Bearer/cookie behavior, response và error examples trước khi chuyển sang “đã triển khai”.

## 9. Security policy

- Password dùng Argon2id; tham số phải được benchmark trên môi trường triển khai và không thấp hơn baseline bảo mật được chọn trong task implementation.
- Không áp đặt chữ hoa/số/ký tự đặc biệt; không truncate password.
- Login chống enumeration bằng INVALID_CREDENTIALS chung và đường verify có thời gian tương đương.
- Register xử lý email trùng bằng unique constraint và EMAIL_ALREADY_EXISTS đã được duyệt.
- Rate limit register theo IP; login theo IP và email normalized; refresh theo IP và session family.
- Trả RATE_LIMITED/429 và Retry-After; không khóa tài khoản vĩnh viễn chỉ vì request thất bại.
- ValidationPipe tiếp tục whitelist, transform, forbid non-whitelisted/unknown values.
- Không log password, password hash, token, cookie, Authorization header, database URL hoặc signing secret.
- Có thể log request ID, event type, user ID, family ID, kết quả và timestamp theo chính sách privacy.
- Secret lấy từ environment/secret manager, tách theo môi trường và không commit.

## 10. Frontend integration contract

Phần này mô tả contract; việc sửa frontend cần task/quyền riêng.

- Access token chỉ giữ trong memory, không lưu localStorage/sessionStorage.
- Refresh cookie do browser quản lý và JavaScript không đọc được.
- Axios interceptor gắn Bearer access token.
- Sau reload, auth bootstrap gọi refresh rồi lấy/cập nhật user; UI có các trạng thái loading, authenticated và anonymous.
- Chỉ refresh khi lỗi cho biết access token hết hạn, không refresh cho mọi 401.
- Mọi request chờ dùng chung một refresh promise; request gốc retry tối đa một lần.
- Khi logout, xóa auth state và cache TanStack Query chứa dữ liệu nhạy cảm.
- Với frontend/API khác origin nhưng cùng site, request liên quan cookie dùng withCredentials và custom CSRF header đã duyệt.

## 11. Test matrix

### Unit

- Email trim/lowercase và password validation.
- Argon2id hash/verify.
- JWT issue/verify; từ chối algorithm, issuer, audience, expiry hoặc type sai.
- Refresh token entropy/digest.
- Login enumeration-safe, ACCOUNT_DISABLED.
- Rotation, expiry, grace window, reuse và logout-all.
- Service không trả trường nhạy cảm.

### Integration với PostgreSQL test

- Unique email khi register đồng thời.
- Foreign key và self-FK auth_sessions.
- Transaction tạo user/session.
- Hai refresh đồng thời chỉ một request tạo generation mới.
- Partial unique index chặn hai active generation trong một family.
- Reuse sau grace thu hồi đúng family.
- Logout-all chỉ tác động đúng user.

Không dùng database production. Test database và quy trình migration test phải được duyệt trước implementation.

### API E2E

- Register → me → refresh → logout.
- Login nhiều thiết bị; logout current không ảnh hưởng family khác.
- Logout-all làm mọi refresh family của user thất bại.
- Disabled user bị chặn ở login, refresh và protected API.
- Access JWT hết hạn, refresh hết hạn/revoked/reused.
- Cookie flags, exact CORS allowlist, credentials, Origin/custom-header CSRF.
- Validation field dư/payload sai và ApiErrorResponse.
- Rate limit và Retry-After.
- Log không chứa secret hoặc credential.

## 12. Acceptance criteria

Chỉ đánh dấu backend P01 hoàn thành khi:

- Prisma schema và migration chỉ tạo users/auth_sessions đã được review và áp dụng đúng development database.
- Register, login, refresh, logout, logout-all và me hoạt động qua API thật.
- Atomic rotation/concurrent refresh/reuse tests PASS.
- Password/JWT/cookie/CORS/CSRF/rate-limit policies được triển khai và test.
- Shared contract và OpenAPI khớp code.
- Unit, PostgreSQL integration và API E2E PASS.
- Tài liệu database, API và CURRENT_STATUS khớp source/migration thực tế.

Chỉ đóng toàn bộ G1 khi frontend dùng API thật, auth state/route guard hoạt động và E2E tích hợp PASS. Nếu frontend chưa tích hợp, chỉ ghi backend P01 đã hoàn thành, không ghi P01/G1 COMPLETED.

## 13. Kế hoạch P01-01 đến P01-08

| Task   | Mục tiêu                                               | File/module dự kiến                   | Phụ thuộc                   | Nghiệm thu                          | Rủi ro chính                |
| ------ | ------------------------------------------------------ | ------------------------------------- | --------------------------- | ----------------------------------- | --------------------------- |
| P01-01 | Tạo Prisma models và migration Auth foundation         | apps/api/prisma                       | Thiết kế này                | Schema/migration static checks PASS | Migration chưa chạy test DB |
| P01-02 | Chốt shared DTO/error/OpenAPI contract                 | packages/shared, docs/API_CONTRACT.md | P01-01, task được phê duyệt | Contract review PASS                | Contract đổi giữa chừng     |
| P01-03 | Auth config, Argon2id, JWT/token utilities             | apps/api/src/config, auth crypto      | P01-02, secret policy       | Unit tests PASS                     | Secret/algorithm sai        |
| P01-04 | Users/Auth repositories và services                    | apps/api/src/modules/users, auth      | P01-01, P01-03              | Unit/integration PASS               | Transaction/race sai        |
| P01-05 | Controllers, DTO, guards, cookie/CORS/Origin, OpenAPI  | auth HTTP layer, app config           | Domain/origin được chốt     | API E2E PASS                        | CSRF/CORS sai               |
| P01-06 | Rotation, reuse, concurrency, logout-all, disable flow | auth service/repository               | P01-04                      | Security/concurrency PASS           | False-positive reuse        |
| P01-07 | Frontend Auth integration theo task riêng              | apps/web auth/client/router           | API ổn định, quyền frontend | Reload/single-flight/guard E2E PASS | Ghi đè frontend người khác  |
| P01-08 | Full nghiệm thu và đồng bộ tài liệu                    | test/docs/status                      | P01-01–07                   | Gate G1 theo phạm vi PASS           | Đánh dấu hoàn thành sớm     |

Task plan không phải lệnh tự động triển khai. Mỗi task cần được giao/duyệt theo quy tắc repository.

## 14. Phụ thuộc môi trường còn mở

1. Hostname/origin cụ thể của frontend và API cho development/staging/production.
2. Xác nhận cùng origin hay khác origin nhưng cùng site ở từng môi trường.
3. PostgreSQL test database tách biệt và quyền chạy migration test.
4. Secret manager/cơ chế cấp và rotation HS256 signing secret.
5. Quyền và người chịu trách nhiệm sửa frontend cho P01-07.
6. Cơ chế chạy cleanup auth_sessions theo lịch.

Các phụ thuộc này phải được chốt trước task liên quan; chúng không thay đổi trạng thái phê duyệt thiết kế.

## 15. Ngoài phạm vi P01

- Global landlord/owner/staff role.
- Workspace, membership, RBAC và permission matrix.
- Tự tạo workspace khi register.
- Tenant profile hoặc tenant-user link.
- Email verification và forgot/reset password.
- Danh sách/quản lý thiết bị bằng UI.
- Business entities ngoài users/auth_sessions.
- Access-token denylist, DPoP hoặc mTLS.

**P01 DESIGN APPROVED — P01-01 SCHEMA/MIGRATION CREATED, NOT APPLIED; AUTH FLOWS NOT STARTED**
