# Trạng thái hiện tại

## BE-CONTRACT-DATES-02 — Hợp đồng theo ngày hiệu lực (IMPLEMENTED, migration REVIEW-ONLY)

- Hợp đồng vẫn chỉ `ACTIVE`/`ENDED`; hiệu lực (`phase`: UPCOMING/IN_EFFECT/OVERDUE/ENDED/CANCELLED) suy ra từ ngày Asia/Ho_Chi_Minh, không cron. Cho phép tạo hợp đồng bắt đầu tương lai và hợp đồng nối tiếp không trùng ngày (exclusion constraint inclusive giữ nguyên). Room chỉ OCCUPIED khi có hợp đồng ACTIVE đã bắt đầu; `room.status` trả qua API suy ra theo ngày. OWNER hủy hợp đồng chưa bắt đầu qua `PATCH .../end` không kèm `endDate` (giữ kỳ thuê và cọc, không hard-delete). Invoice/Deposit/Maintenance/Dashboard/Marketplace đã chỉnh theo ngày (xem API_CONTRACT).
- Migration `202610150027_contract_dates_room_state_guard` (chỉ thay hàm trigger Room) đã tạo ở trạng thái review-only: **chưa deploy, chưa ghi Neon**. Chưa chạy kiểm thử PostgreSQL thật (trigger, exclusion/đồng thời).
- Chính sách hiển thị listing cho phòng chỉ có hợp đồng tương lai chưa được duyệt: giữ nguyên hành vi hiện tại.

## V1 OWNER-only RBAC & Maintenance Without Assignment — DEPLOYED (Neon DEV)

- Migration `202610150026_retire_workspace_staff_runtime` đã áp dụng trên Neon DEV `Apartment` (26/26 migration). Trigger chặn INSERT/UPDATE sang MANAGER/STAFF; không chặn DELETE; deposit chỉ OWNER; `workspace_manager_ids` chỉ OWNER.
- Maintenance V1 không giao người phụ trách: CHECK trạng thái không còn bắt assignee cho `IN_PROGRESS`/`RESOLVED`; DB và API cấm gán/đổi assignee; assignee lịch sử được giữ nguyên.
- 27 membership MANAGER/STAFF lịch sử (6 MANAGER, 21 STAFF) giữ nguyên; API members/transfer-ownership đã retire.
- Kiểm chứng DB bằng transaction ROLLBACK; HTTP với user thật trên DB chưa chạy (xem báo cáo BE-V1-RBAC-03).

## V1 Account Onboarding & Landlord Approval — IMPLEMENTED, DEPLOYED & SMOKE PASS

- Đã thêm `GET /users/me/capabilities`, landlord application user/admin (kèm lịch sử), tenant invitation accept, và `GET /contracts/me` list/detail.
- `POST /workspaces` kiểm tra phê duyệt trong transaction; OWNER hiện hữu được grandfather, user mới cần application APPROVED chưa dùng. Mỗi user tối đa một Workspace ACTIVE; OWNER cũ nhiều workspace được giữ nguyên nhưng không thể tạo thêm. Restore và transfer OWNER cũng tuân thủ giới hạn; tạo workspace/tiêu thụ approval atomic.
- Migration `202610150025_v1_account_onboarding` đã được người dùng deploy lên Neon development Apartment; `prisma:migrate:status` xác nhận 25/25, schema up to date. Không chạy lại migration trong task smoke này.
- Chính sách chống application spam: một PENDING/user, tối đa 3 yêu cầu/365 ngày, cooldown 30 ngày sau REJECTED. Quyết định admin khóa một lần và ghi `admin_audit_logs` cùng transaction.
- Kiểm tra: Prisma format/validate/generate PASS; shared build PASS; API typecheck/build PASS; 5 test suite liên quan, 32 test PASS.
- Smoke API/PostgreSQL thật: PASS — capabilities và cô lập dữ liệu; invitation/token một lần/chống trùng; contracts của tenant; landlord approval; OWNER mới; Tenant Link cũ; concurrency 1 ACTIVE Workspace/user (201 + 409, không 500). OWNER cũ được xác nhận giữ nguyên số membership; không dùng credentials của OWNER cũ để kiểm tra đăng nhập/thao tác.
- Tests API: 9 suites / 95 tests PASS; workspace unit tests: 20/20 PASS; API build PASS. Dữ liệu test được vô hiệu hóa/archive, liên kết/hợp đồng/invitation pending được đóng; audit giữ lại. Frontend, commit/push: NOT RUN.

| Mục                        | Trạng thái                 | Bằng chứng                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprint hiện tại            | Sprint 5 / P08 IN PROGRESS | P10 Notifications PASS smoke Neon; P11 Dashboard PASS smoke Neon (20/20 migrations); P07-01 PASS smoke Neon; P07-02 PASS smoke Neon; P08-01 PASS smoke Neon; P08-02 PASS smoke Neon; P08-03 PASS smoke Neon; P08-04 PASS smoke Neon; P09 Maintenance PASS smoke Neon (19/19 migrations) |
| Neon development Apartment | 25/25 MIGRATIONS APPLIED   | `prisma:migrate:status` xác nhận schema up to date; onboarding smoke API/DB PASS                                                                                                                                                                                                        |
| Auth API                   | SMOKE PASS                 | Register, login, me, refresh, duplicate grace, logout, revoked refresh trên Neon development                                                                                                                                                                                            |
| Kiểm thử còn thiếu         | BLOCKED                    | Chưa có PostgreSQL test tách biệt để chạy constraint/concurrency suite đầy đủ                                                                                                                                                                                                           |
| P02 Workspace/RBAC         | P02-06 TRANSFER COMPLETE   | Workspace lifecycle, membership và ownership transfer đã có; stress DB còn thiếu                                                                                                                                                                                                        |
| P03 Building               | P03-03 MANAGEMENT COMPLETE | Create/list/detail/update/archive/restore đã có; chưa deploy Neon                                                                                                                                                                                                                       |
| P03 Room/Amenities         | P03-05 IMPLEMENTED         | Schema/migration và API quản lý đã có; chưa deploy Neon                                                                                                                                                                                                                                 |
| P03 Room Images            | P03-06 IMPLEMENTED         | Metadata/URL schema, migration và API đã có; chưa deploy Neon                                                                                                                                                                                                                           |
| P04 Public Listings        | P04-01 IMPLEMENTED         | Bật/tắt listing, public list/detail và filter cơ bản; chưa deploy Neon                                                                                                                                                                                                                  |
| P04 Viewing Requests       | P04-02 IMPLEMENTED         | Khách tạo/xem/hủy; OWNER/MANAGER xem/xác nhận/từ chối; chưa deploy Neon                                                                                                                                                                                                                 |
| P06 Tenant/Contracts       | P06-02 IMPLEMENTED         | Tenant/linking đã deploy; Contracts/Vehicles đã deploy Neon                                                                                                                                                                                                                             |

## Kết quả P03-01 — Building Schema & Migration

- Thêm Prisma model `Building`, quan hệ một-nhiều từ `Workspace`, mapping bảng `buildings` và snake_case nhất quán.
- Dữ liệu gồm tên/mô tả, địa chỉ có cấu trúc, tọa độ tùy chọn và timestamps. FK workspace dùng `RESTRICT`; có index theo workspace và khu vực.
- Migration `202610140003_p03_building_foundation` có check constraint cho chuỗi bắt buộc, cặp tọa độ và phạm vi tọa độ.
- Prisma format/validate/generate và static assertions cho bảng, FK, index, check constraint: **PASS**.
- Migration chỉ được tạo để review và **chưa chạy** trên Neon. CRUD API, room, amenity, media và frontend chưa được triển khai.

## Kết quả P03-02 — Building Create & List API

- Building dùng trạng thái `ACTIVE`/`ARCHIVED`, `archived_at`, quốc gia mặc định `VN` và database trigger chặn hard-delete; migration P03-01 chưa deploy nên được điều chỉnh trực tiếp.
- Thêm `POST` và `GET /workspaces/:workspaceId/buildings`. OWNER/MANAGER được tạo; STAFF chỉ được xem; guard và repository đều lấy quyền từ database.
- Create khóa workspace, kiểm tra lại workspace ACTIVE và membership OWNER/MANAGER trong transaction. List luôn lọc theo `workspace_id`.
- Prisma format/validate/generate, shared build, API typecheck, 4 repository tests và 5 API tests: **PASS**.
- Migration Neon, API archive/restore/detail/update và frontend: **NOT RUN/NOT IMPLEMENTED** trong task này.

## Kết quả P03-03 — Complete Building Management

- Thêm detail, update, archive và restore theo path workspace-scoped. OWNER/MANAGER được update; chỉ OWNER được archive/restore; STAFF chỉ đọc.
- Repository khóa workspace và Building khi ghi, kiểm tra lại membership từ database, chặn workspace ARCHIVED và chặn update Building ARCHIVED. Archive/restore idempotent và không hard-delete.
- Error contract bổ sung `BUILDING_NOT_FOUND` và `BUILDING_ARCHIVED`; update không chấp nhận payload rỗng hoặc cặp tọa độ thiếu.
- Shared build, API typecheck/build, 9 repository tests và 14 API tests Building: **PASS**.
- Migration Building trên Neon: **NOT RUN**. Room, frontend, commit và push không thuộc task này.

## Kết quả P03-05 — Room & Amenities Management

- Thêm Prisma models `Room`, `Amenity`, `RoomAmenity`, enum `RoomStatus` và migration `202610140004_p03_room_amenity_foundation` review-only.
- Room thuộc đồng thời Building và Workspace bằng composite FK; code unique trong Building. Giá thuê/diện tích dùng Decimal và có database check constraint; Room dùng archive, trigger chặn hard-delete.
- API Room gồm create/list/detail/update/archive/restore. Amenity có create/list; assign/unassign Room-Amenity idempotent.
- OWNER/MANAGER được ghi, STAFF chỉ đọc. Repository kiểm tra lại workspace/building scope và trạng thái trước mọi write.
- Prisma format/validate/generate, shared build và API typecheck: **PASS**. Tests liên quan: 30 unit/error-contract và 7 API tests **PASS**.
- Migration Neon, upload ảnh, Marketplace, Contract, frontend, commit và push: **NOT RUN/NOT IMPLEMENTED**.

## Kết quả P03-06 — Room Images

- Thêm Prisma model `RoomImage`, bảng `room_images` và migration `202610140005_p03_room_image_metadata` review-only. Bảng chỉ lưu URL, alt text, thứ tự và timestamps; không lưu binary hoặc credential lưu trữ.
- API workspace-scoped gồm thêm, liệt kê, thay toàn bộ thứ tự và xóa metadata ảnh. OWNER/MANAGER được ghi; STAFF chỉ đọc.
- Repository khóa workspace, Building và Room khi ghi; workspace/Building/Room archived đều chặn thay đổi. Reorder chạy transaction `Serializable` và yêu cầu danh sách đầy đủ, không trùng ID.
- Prisma format/validate/generate, 10 repository tests, 10 API tests Room, API typecheck và API build: **PASS**.
- Storage provider/upload binary: **CHƯA ĐƯỢC CHỐT/CHƯA TRIỂN KHAI**. Migration Neon, frontend, commit và push: **NOT RUN**.

## Kết quả P04-01 — Public Rental Listings Foundation

- Thêm model `Listing` và migration `202610140006_p04_public_listing_foundation` review-only; mỗi Room có tối đa một listing, bật/tắt idempotent và không xóa dữ liệu Room.
- OWNER/MANAGER có thể bật hoặc tắt công khai qua API workspace-scoped. Chỉ Room `VACANT` thuộc Workspace/Building ACTIVE và Room không archived mới được bật.
- Public API list/detail chỉ trả listing đang bật và tiếp tục kiểm tra động Workspace/Building ACTIVE cùng Room VACANT. Response chỉ chứa dữ liệu phòng, vị trí, giá, tiện ích và ảnh công khai; không chứa tenant, hợp đồng hoặc dữ liệu quản trị workspace.
- Search hỗ trợ city/district/ward, khoảng giá, yêu cầu đủ mọi amenity và phân trang. Map/routing, Smart Rental Assistant, viewing request và frontend không thuộc task.
- Prisma format/validate/generate, 30 unit/error-contract tests (gồm 5 Listing repository), 6 API tests, API typecheck/build: **PASS**. Migration Neon, commit và push: **NOT RUN**.

## Kết quả P04-02 — Viewing Requests

- Thêm model `ViewingRequest`, enum `PENDING`/`CONFIRMED`/`REJECTED`/`CANCELLED` và migration `202610140007_p04_viewing_requests` review-only.
- User đã đăng nhập có thể tạo yêu cầu từ listing công khai đủ điều kiện, xem danh sách của chính mình và hủy yêu cầu PENDING/CONFIRMED. Repository luôn lọc theo `requester_user_id`, nên không thể đọc hoặc hủy yêu cầu của user khác.
- OWNER/MANAGER có thể xem yêu cầu theo Workspace, xác nhận hoặc từ chối yêu cầu PENDING. Xác nhận kiểm tra lại lịch tương lai, listing published, Room VACANT và Workspace/Building ACTIVE.
- State transition chạy transaction `Serializable` và khóa row request. Partial unique index ngăn một user tạo trùng lịch đang hoạt động cho cùng listing.
- Prisma format/validate/generate, 31 unit/error-contract tests (gồm 6 Viewing Request repository) và 12 API tests Marketplace liên quan: **PASS**. API typecheck/build: **PASS**. Migration Neon, frontend, notifications, commit và push: **NOT RUN**.

## Kết quả P05-01 — Tenant Management

- Thêm Prisma model `Tenant`, enum `ACTIVE`/`ARCHIVED` và migration `202610140008_p05_tenant_foundation` review-only. Tenant thuộc đúng một Workspace qua FK `RESTRICT`; index phục vụ danh sách theo workspace/trạng thái và tra cứu email/điện thoại trong workspace.
- Hồ sơ gồm họ tên, điện thoại, email, ngày sinh, địa chỉ và ghi chú nội bộ. Không thêm CCCD/hộ chiếu hoặc liên kết Tenant-User vì chưa thuộc phạm vi được duyệt. Migration chuẩn hóa email và chặn hard-delete bằng trigger.
- API workspace-scoped gồm tạo, danh sách, chi tiết và cập nhật. OWNER/MANAGER được ghi; STAFF chỉ đọc. Guard và repository đều kiểm tra membership từ database; create/update bị chặn khi Workspace ARCHIVED, tenant ARCHIVED không được cập nhật.
- Dữ liệu tenant không xuất hiện trong public Marketplace. API chỉ trả hồ sơ sau access-token guard và RBAC; DTO cho phép xóa các trường PII tùy chọn bằng `null`.
- Prisma format/validate/generate, shared build, API typecheck/build, 4 repository tests và 6 API tests Tenant: **PASS**.
- Migration Neon, Tenant User Links, Contracts, archive/restore API, frontend, commit và push: **NOT RUN/NOT IMPLEMENTED**.

## Kết quả P05-02 — Tenant Account Linking

- Thêm `tenant_link_requests`, `tenant_user_links` và enum trạng thái `PENDING`/`APPROVED`/`REJECTED`. Request và link đều có FK `RESTRICT`, workspace scope, audit người duyệt/thu hồi và timestamps.
- Chủ tài khoản đăng nhập tự gửi request; không có đối chiếu tự động dựa trên email, tên hoặc số điện thoại. OWNER/MANAGER trong đúng Workspace mới được xem, duyệt, từ chối hoặc thu hồi.
- Partial unique indexes chặn đồng thời nhiều request PENDING hoặc nhiều link ACTIVE cho cùng Tenant, đồng thời chặn một User có nhiều link ACTIVE trong cùng Workspace. Duyệt/từ chối/thu hồi khóa row và chạy transaction `Serializable`.
- `GET /tenants/me` chỉ truy vấn link ACTIVE của user từ access token, Workspace/Tenant ACTIVE và không trả `notes` nội bộ. Link bị thu hồi mất quyền ngay ở truy vấn kế tiếp.
- Prisma format/validate/generate, shared build, 9 unit tests Tenant liên quan, API typecheck/build: **PASS**.
- Migration `202610140009_p05_tenant_account_linking`: **APPLIED** trên Neon development `Apartment`; migrate status xác nhận 9/9 migration up to date.
- Smoke API thật: gửi request, xem request cá nhân/workspace, duyệt, xem đúng hồ sơ riêng, chặn request trùng, thu hồi và xác minh mất quyền: **PASS**. Test link/session đã thu hồi; Workspace/Tenant test archive và user test disable theo chính sách audit, không hard-delete.

## Kết quả P06-01 — Rental Contracts

- Thêm model `Contract`, enum `ACTIVE`/`ENDED`, module Controller → Service → Repository → Prisma và migration `202610140010_p06_rental_contracts` review-only.
- API tạo/list/detail/update/end theo Workspace. OWNER/MANAGER được ghi; STAFF chỉ đọc. Room, Tenant, Building và Workspace được kiểm tra cùng scope/trạng thái trước khi ghi.
- PostgreSQL exclusion constraint dùng khoảng ngày inclusive để cấm hai hợp đồng ACTIVE trùng thời gian trên cùng Room. Create/update/end khóa row và dùng transaction `Serializable`.
- Create chỉ nhận Room VACANT và chuyển sang OCCUPIED. End ghi audit, chuyển hợp đồng sang ENDED và Room về VACANT. Client Room API không nhận OCCUPIED; trigger database bảo vệ trạng thái Room/Building khi còn hợp đồng ACTIVE.
- Prisma format/validate/generate, shared build, 6 contract repository/schema tests và 25 error-contract tests, API typecheck/build: **PASS**.
- Migration Neon, smoke DB thật, frontend, invoices/payments, commit và push: **NOT RUN** theo yêu cầu.

## Kết quả P06-02 — Vehicle Management

- Thêm model `Vehicle`, trạng thái ACTIVE/INACTIVE, module backend và migration `202610140011_p06_vehicle_management` review-only.
- API tạo/list/detail/update/stop theo Workspace. OWNER/MANAGER được ghi; STAFF chỉ đọc. Repository kiểm tra lại Workspace, role và Tenant từ database trong transaction.
- Biển số chuẩn hóa uppercase, bỏ ký tự phân cách và unique trong toàn Workspace trên cả lịch sử. Tenant ARCHIVED chặn tạo/cập nhật; xe INACTIVE không cập nhật lại.
- Stop idempotent, lưu thời điểm/lý do và không hard-delete. Chưa tính phí gửi xe hoặc tạo invoice.
- Prisma format/validate/generate, shared build, 7 Vehicle repository/schema tests và 25 error-contract tests, API typecheck/build: **PASS**.
- Migration Neon, smoke DB thật, frontend, commit và push: **NOT RUN** theo yêu cầu.

## Kết quả P06-01 — Contracts DB Smoke Test

- `prisma:migrate:status`: **PASS**, Neon development `Apartment` có 11 migration và schema up to date; task không chạy deploy.
- API thật tạo ACTIVE Contract: **PASS**; Room chuyển từ VACANT sang OCCUPIED trong cùng transaction.
- PostgreSQL exclusion constraint: **PASS**; insert ACTIVE Contract trùng khoảng ngày bị từ chối bởi `contracts_active_room_period_excl`.
- Trigger bảo vệ Room: **PASS**; PostgreSQL từ chối đổi OCCUPIED sang VACANT khi Contract vẫn ACTIVE.
- Cross-workspace access: **PASS**; user ở Workspace khác nhận 404 khi truy cập Contract.
- API kết thúc Contract: **PASS**; Contract sang ENDED và Room về VACANT.
- Cleanup theo audit: Contract được kết thúc, Room/Building/Workspace test archive, sessions thu hồi, users test disable và Tenant test archive. Không reset hoặc hard-delete dữ liệu.

## Kết quả P07-01 — Building Rates

- Thêm model `RatePlan`, enum loại dịch vụ/đơn vị/trạng thái, module backend và migration `202610140012_p07_building_rates` review-only.
- API create/list/update-version/stop theo Building. OWNER/MANAGER được ghi; STAFF chỉ đọc. Workspace/Building archived chặn mọi write.
- Tiền dùng `Decimal(14,4)`. Update không sửa lịch sử: đóng phiên bản cũ và tạo successor trong transaction `Serializable`; effective period dùng `[from, to)`.
- GiST exclusion constraint cấm overlap theo Building/code; trigger chặn hard-delete. Chưa tính chỉ số điện nước hoặc invoice.
- Prisma format/validate/generate, shared build, 7 Rate repository/schema tests và 25 error-contract tests, API typecheck/build: **PASS**.
- Migration Neon: `202610140012_p07_building_rates` đã áp dụng, `prisma migrate status` báo 12/12 migrations, schema up to date: **PASS** (không deploy trong phiên smoke).
- Smoke DB thật trên Neon development: **PASS**. Decimal(14,4) lưu chính xác; cập nhật giá giữ lịch sử cũ (bản cũ đóng tại ngày hiệu lực bản mới); hai khoảng liền nhau `[from,to)` hợp lệ; khoảng chồng lấn bị GiST chặn (23P01); STAFF không ghi được; Building/Workspace archived chặn write.
- Lỗi build đã sửa khi smoke: `rate-plan.repository.ts` thiếu import `type RatePlan` (TS2304); chỉ thêm import. Rates jest sau sửa: 2 suite, 7 test **PASS**.
- Cleanup theo audit: rate đóng, Building/Workspace test archive, sessions thu hồi, users test disable; không hard-delete. File smoke tạm đã xóa.
- Frontend, commit và push: **NOT RUN** theo yêu cầu.

## Kết quả P07-02 — Meter Readings

- Thêm `MeterReading`, `MeterReadingAdjustment`, enum `meter_type` (ELECTRICITY/WATER) và migration `202610140013_p07_meter_readings` review-only; module `apps/api/src/modules/meters`.
- API `/workspaces/:workspaceId/buildings/:buildingId/rooms/:roomId/meter-readings`: POST ghi chỉ số, GET xem, PATCH `:readingId/adjust` điều chỉnh. OWNER/MANAGER ghi và điều chỉnh; STAFF chỉ đọc. Workspace/Building/Room archived chặn write.
- Kỳ `YYYY-MM`, duy nhất theo room + loại công tơ; chỉ số `Decimal(14,3)`, `current >= previous` (CHECK + service). Kỳ mới phải sau kỳ gần nhất, chỉ số đầu kỳ lấy từ kỳ trước (kỳ đầu tiên bắt buộc gửi `previousReading`).
- Điều chỉnh chỉ áp dụng cho kỳ mới nhất của room/công tơ (kỳ sau phụ thuộc chuỗi chỉ số); mỗi lần điều chỉnh tăng `revision` và ghi dòng append-only (giá trị cũ/mới, lý do, người sửa); trigger chặn hard-delete reading và sửa/xóa adjustment. FK phức hợp `(room, building, workspace)` giữ scope chính xác.
- Prisma format/validate/generate, shared build, API typecheck/build, jest meters + rates + error-contract (40 test): **PASS**.
- Migration `202610140013` đã được người dùng deploy lên Neon development (13/13 migrations). Smoke API + PostgreSQL thật: **PASS** (22 kiểm tra: kỳ đầu/kỳ nối tiếp, trùng kỳ, chỉ số giảm, kỳ lùi, điều chỉnh tăng revision + audit, từ chối điều chỉnh kỳ cũ, STAFF chỉ đọc, scope workspace, CHECK/UNIQUE/FK/trigger, chặn ghi khi room/building/workspace archived). Cleanup theo audit: room/building/workspace archive, users disable, sessions thu hồi; không hard-delete.
- Invoices, frontend, commit và push: **NOT RUN** theo yêu cầu. Quy tắc làm tròn/kỳ chốt/xử lý thiếu chỉ số vẫn chờ Product Owner duyệt trước P09.

## Kết quả P08-01 — Invoice Foundation

- Thêm `Invoice`, `InvoiceItem`, enum trạng thái/loại dòng, migration `202610140014_p08_invoice_foundation` review-only và module `apps/api/src/modules/invoices` (calculator thuần Decimal + repository/service/controller). Quyết định PO đã ghi ở BUSINESS_REQUIREMENTS.
- API theo Building: tạo/xem/sửa-tính-lại/phát hành/xóa DRAFT; OWNER/MANAGER ghi, STAFF chỉ đọc; Tenant xem hóa đơn ISSUED của mình qua `/invoices/me`. Workspace/Building archived chặn ghi.
- Tính tiền: tiền thuê prorate theo ngày thực tế; điện/nước theo Meter Readings × Building Rates của đúng kỳ; xe theo `created_at`/`inactive_at` tại cuối kỳ (giờ Việt Nam); `ROUND_HALF_UP` 1 VND mỗi dòng. Thiếu giá/chỉ số/số người: DRAFT ghi `missingItems`, ISSUED bị từ chối `INVOICE_INCOMPLETE`.
- Migration Neon, smoke DB thật, API-level test, Payments, Deposits, Adjustments, frontend, commit và push: **NOT RUN** theo yêu cầu.
- Hoàn thiện quy tắc tính (migration `202610140015_p08_billing_rules`, review-only): đơn giá đổi giữa kỳ được chia khoảng cho phí ROOM/FIXED (điện/nước/người/xe không chia, giữ DRAFT thiếu); chỉ dịch vụ gán cho phòng (Room Services API) mới được tính; xe của Tenant có nhiều hợp đồng chỉ tính trên một hóa đơn do quản lý chọn (DB chặn trùng); `occupantCount` lưu người/thời điểm xác nhận và snapshot; 015 cộng thêm an toàn, có backfill, không drop dữ liệu.
- Prisma format/validate/generate, shared build, API typecheck/build, jest invoices + room services + meters + rates + error-contract (80 test): **PASS**. Trigger/EXCLUDE đã được xác nhận bằng smoke trên Neon; đoạn backfill của 015 chưa được thực thi với dữ liệu cũ vì 014 chưa có hóa đơn khi deploy.
- Migration `202610140014` và `202610140015` đã được người dùng deploy lên Neon development (15/15 migrations). Smoke API + PostgreSQL thật: **PASS** (46 kiểm tra): DRAFT, tiền thuê giữa tháng 18/31, điện/nước theo chỉ số, `ROUND_HALF_UP` và tổng bằng tổng item, dịch vụ chưa gán không tính, phí ROOM/FIXED chia khoảng giá, điện/nước đổi giá giữa kỳ và thiếu rate cho DRAFT incomplete, DRAFT thiếu không ISSUED (API + DB), ISSUED bất biến (UPDATE/DELETE invoice và item bị DB chặn), chống trùng contract/kỳ kể cả request đồng thời, Tenant nhiều hợp đồng chỉ tính xe một lần (API + EXCLUDE), STAFF chỉ đọc, Tenant chỉ xem hóa đơn ISSUED của mình, scope workspace. Không phát hiện bug, không sửa code. Cleanup theo audit: contract kết thúc, room/tenant/building/workspace archive, xe ngừng, rate và dịch vụ đóng, users disable; hóa đơn DRAFT test được giữ lại, không hard-delete.
- Giới hạn còn lại: (1) chưa có `contract_members` nên số người vẫn do quản lý nhập; (2) dịch vụ ROOM/FIXED không prorate theo ngày hợp đồng, chỉ theo ngày dịch vụ có hiệu lực trong tháng; (3) Room Services gán theo phòng, chưa theo từng hợp đồng; (4) xe khai báo sau thời điểm chốt kỳ không vào hóa đơn kỳ cũ vì chưa có ngày hiệu lực riêng; (5) đổi giá điện/nước giữa tháng cần quy tắc chia lượng dùng của Product Owner (hoặc chỉ số theo ngày) trước khi tính được.

## Kết quả P08-02 — Invoice Adjustments

- Thêm `InvoiceAdjustment`, migration `202610140016_p08_invoice_adjustments` review-only và module `apps/api/src/modules/invoices/adjustments`. Không sửa hóa đơn hay dòng hóa đơn đã phát hành.
- API: tạo/xem danh sách/chi tiết adjustment và Tenant xem qua `/invoices/me/:invoiceId/adjustments`. OWNER/MANAGER tạo, STAFF chỉ đọc. `adjustedTotal = originalTotal + tổng adjustments` (không âm) hiển thị ở danh sách adjustment và chi tiết hóa đơn ISSUED.
- Số tiền Decimal, `ROUND_HALF_UP` về 1 VND; `idempotencyKey` chống ghi trùng khi retry; sửa sai bằng adjustment mới có tham chiếu; DB append-only và chặn tổng âm kể cả request đồng thời.
- Prisma format/validate/generate, shared build, API typecheck/build, jest invoices + meters + rates + error-contract (93 test): **PASS**.
- Payments, Deposits, frontend, commit và push: **NOT RUN** theo yêu cầu.
- Migration `202610140016` đã được người dùng deploy lên Neon development (16/16 migrations). Smoke API + PostgreSQL thật: **PASS** (31 kiểm tra): adjustment dương/âm, `ROUND_HALF_UP`, `adjustedTotal`, chặn tổng âm ở API và DB (kể cả 2 request đồng thời), retry cùng key trả bản cũ (kể cả đồng thời) và khác nội dung báo conflict, sửa sai qua `referenceAdjustmentId` và chặn sửa sai nhiều lần, trigger chặn UPDATE/DELETE, hóa đơn gốc không đổi, STAFF chỉ đọc, Tenant chỉ xem hóa đơn ISSUED của mình, scope workspace, chặn khi building/workspace archived. Cleanup theo audit: hợp đồng kết thúc, room/tenant/building/workspace archive, rate và dịch vụ đóng, users disable; không hard-delete.
- Bug tìm thấy và đã sửa: khi hai adjustment âm đồng thời, request thua nhận lỗi 500 do lỗi serialization (P2034) bị ném ra thay vì lỗi nghiệp vụ. `InvoiceAdjustmentRepository.create` nay thử lại tối đa 4 lần để request thua đánh giá lại trên tổng đã commit và nhận `INVOICE_ADJUSTMENT_INVALID`; có thêm test và chạy lại jest invoices (54 test) cùng API build: **PASS**.
- Giới hạn: adjustment không có loại/danh mục (chỉ số tiền và lý do); chưa có quy tắc PO về ai được phép giảm trừ quá ngưỡng hay cần duyệt; chưa có thông báo cho Tenant.

## Kết quả P08-03 — Manual Payments & Outstanding Balance

- Thêm `InvoicePayment`, enum `payment_entry_kind`/`payment_method`, migration `202610140017_p08_invoice_payments` review-only và module `apps/api/src/modules/invoices/payments`.
- API: ghi nhận thanh toán, đảo thanh toán (REVERSAL có audit), xem danh sách/chi tiết kèm `amountDue`, `paidTotal`, `outstanding`, `paymentStatus`; chi tiết hóa đơn ISSUED cũng có các trường này. OWNER/MANAGER ghi, STAFF chỉ đọc, Tenant xem qua `/invoices/me/:invoiceId/payments`.
- Tiền VND nguyên dùng Decimal; thanh toán nhiều lần không vượt `amountDue`; `idempotencyKey` chống ghi trùng khi retry kể cả đồng thời (có retry lỗi serialization); sổ bất biến, DB chặn UPDATE/DELETE.
- Quyết định về adjustment: không cho hạ `amountDue` xuống dưới số đã thu (`INVOICE_ADJUSTMENT_BELOW_PAID`, kiểm tra cả ở service và trigger DB); không tự sửa lịch sử.
- Prisma format/validate/generate, shared build, API typecheck/build, jest invoices + meters + rates + error-contract (108 test): **PASS**.
- Tích hợp ngân hàng/cổng thanh toán, Deposits, notifications, frontend, commit và push: **NOT RUN** theo yêu cầu.
- Migration `202610140017` đã được người dùng deploy lên Neon development (17/17 migrations). Smoke API + PostgreSQL thật: **PASS** (47 kiểm tra): thanh toán nhiều lần với `paidTotal`/`outstanding`/UNPAID–PARTIALLY_PAID–PAID, chặn số âm/0/thập phân/vượt `amountDue`/DRAFT/thời điểm tương lai, idempotency (retry, khác payload, retry đồng thời), hai thanh toán đồng thời không thu vượt (một 201, một 409, không 500), đảo toàn phần một lần có lý do và người thực hiện, chặn đảo lần hai và đảo giao dịch đảo, trigger chặn UPDATE/DELETE payment và reversal, trigger adjustment chặn hạ `amountDue` dưới số đã thu (API, DB và hai request đồng thời), STAFF chỉ đọc, Tenant chỉ xem thanh toán hóa đơn ISSUED của mình, scope workspace, chặn khi building/workspace archived. Không phát hiện bug, không sửa code. Cleanup theo audit: hợp đồng kết thúc, room/tenant/building/workspace archive, rate và dịch vụ đóng, users disable; không hard-delete.
- Quyết định còn thiếu: (1) quy trình hoàn tiền/tiền thừa khi cần giảm trừ sau khi đã thu; (2) đảo từng phần thay vì đảo toàn phần; (3) biên lai/số chứng từ và tham chiếu giao dịch ngân hàng; (4) ai được đảo thanh toán (hiện OWNER/MANAGER) và có giới hạn thời gian không; (5) hóa đơn quá hạn/nhắc nợ (chưa dùng `dueDate`).

## Kết quả P08-04 — Contract Deposits

- Thêm `ContractDepositEntry`, enum `deposit_entry_kind`, migration `202610140018_p08_contract_deposits` review-only và module `apps/api/src/modules/deposits`. Sổ cọc riêng theo Contract, không liên quan tới hóa đơn hay thanh toán hóa đơn.
- API: thu cọc, khấu trừ (bắt buộc lý do + tham chiếu), ghi nhận hoàn cọc thực tế (bắt buộc lý do, phương thức, thời điểm và tham chiếu hoàn tiền), đảo ghi nhận nhầm bằng `REVERSAL` có audit, xem lịch sử/số dư; Tenant xem qua `/contracts/me/:contractId/deposit`. OWNER/MANAGER ghi, STAFF chỉ đọc.
- Số dư = thu − khấu trừ − hoàn (giao dịch bị đảo không tính), không bao giờ âm; VND nguyên Decimal; `idempotencyKey` chống ghi trùng kể cả đồng thời (có retry lỗi serialization); DB chặn UPDATE/DELETE; workspace/building archived chặn ghi; dữ liệu và việc khấu trừ/hoàn vẫn thực hiện được sau khi hợp đồng kết thúc.
- Quyết định PO V1 đã áp dụng: hoàn cọc một phần/toàn bộ khi hợp đồng ACTIVE hoặc ENDED (không vượt số dư); khi Building/Workspace archived chỉ OWNER được ghi `REFUND` hợp lệ cho phần cọc còn lại, còn COLLECTION/DEDUCTION/REVERSAL mới bị chặn. Quy tắc được kiểm tra nhất quán ở guard controller (`AllowArchivedWorkspaceLifecycle` chỉ cho endpoint tạo giao dịch), repository (kiểm role và loại giao dịch) và trigger DB; migration 018 (chưa deploy) được sửa tại chỗ. Mã lỗi mới `DEPOSIT_ARCHIVED_OWNER_ONLY` (403). Jest deposits + invoices + contracts + error-contract (128 test), Prisma validate/generate, API build: **PASS**; trigger SQL đã được xác nhận bằng smoke trên Neon.
- Prisma format/validate/generate, shared build, API typecheck/build, jest deposits + invoices + meters + rates + contracts + error-contract (129 test): **PASS**.
- Tích hợp ngân hàng, frontend, notifications, commit và push: **NOT RUN** theo yêu cầu.
- Migration `202610140018` (đã gồm quy tắc hoàn cọc V1) được người dùng deploy lên Neon development (18/18 migrations). Smoke API + PostgreSQL thật: **PASS** (56 kiểm tra): COLLECTION → DEDUCTION → REFUND với số dư chính xác, hoàn một phần/nhiều lần, chặn vượt số dư (API, DB và hai request đồng thời: một 201, một 409, không 500), idempotency (retry, khác payload, retry đồng thời), REFUND bắt buộc reason/method/timestamp/reference (API và CHECK DB), REVERSAL sửa sai một lần có audit và chặn đảo lại/đảo khoản thu khi tiền đã ra, trigger chặn UPDATE/DELETE, hoàn/khấu trừ sau khi hợp đồng ENDED, khi Building hoặc Workspace archived chỉ OWNER REFUND được (MANAGER 403, STAFF bị chặn, COLLECTION/DEDUCTION/REVERSAL bị chặn; trigger DB chặn cả đường ghi trực tiếp), Tenant chỉ đọc cọc hợp đồng của mình, scope workspace. Không phát hiện bug, không sửa code. Cleanup theo audit: hợp đồng kết thúc, room/tenant/building/workspace archive, users disable; sổ cọc được giữ nguyên, không hard-delete.
- Quyết định còn thiếu: (1) số tiền cọc phải thu theo hợp đồng và có bắt buộc khớp không; (3) danh mục khấu trừ chuẩn và bằng chứng đính kèm; (4) quy tắc hoàn cọc từng phần/chậm hạn và giữ lại cọc quá hạn; (5) khi archived chỉ REFUND của OWNER được phép; đảo (`REVERSAL`) một REFUND ghi nhầm lúc archived hiện bị chặn nên cần quy tắc nếu muốn cho OWNER sửa; (6) việc khấu trừ để bù công nợ hóa đơn (hiện chỉ ghi tham chiếu dạng văn bản, không tự động cấn trừ).

## Kết quả P09 — Maintenance

- Thêm `MaintenanceRequest`, `MaintenanceStatusHistory`, enum trạng thái/ưu tiên, migration `202610140019_p09_maintenance` và module `apps/api/src/modules/maintenance`. Migration chỉ thêm mới (kiểm tra: không DROP/TRUNCATE/UPDATE/backfill/ALTER bảng cũ) và đã được `prisma migrate deploy` lên Neon development `Apartment` (19/19 migrations).
- API: Tenant gửi/xem yêu cầu của mình qua `/maintenance-requests/me`; OWNER/MANAGER tạo, cập nhật và chuyển trạng thái; STAFF chỉ đọc. Trạng thái tiến `OPEN → IN_PROGRESS → RESOLVED → CLOSED` (DB trigger cũng ép); lịch sử chỉ-thêm; Workspace/Building/Room archived chặn ghi.
- Prisma format/validate/generate, shared build, API typecheck/build, jest maintenance + error-contract (38 test): **PASS**. Smoke API + PostgreSQL thật: **PASS** (41 kiểm tra): Tenant gửi → OWNER/MANAGER giao việc, đổi ưu tiên, xử lý, đóng; Tenant chỉ thấy yêu cầu của mình và không thấy nhân sự; STAFF chỉ đọc; scope workspace/building/room; link bị thu hồi, hợp đồng đã kết thúc, workspace/building/room archived đều chặn; trigger chặn UPDATE/DELETE lịch sử, hard-delete yêu cầu, sửa yêu cầu đã đóng, chuyển trạng thái sai, người xử lý ngoài workspace và đổi scope. Cleanup theo audit: hợp đồng kết thúc, room/tenant/building/workspace archive, users disable; các yêu cầu test được giữ lại, không hard-delete.
- Lưu ý khi smoke: đăng ký tài khoản bị giới hạn 5 lần/15 phút/IP; smoke dùng tiến trình API tạm với `AUTH_RATE_LIMIT_REGISTER_IP_MAX=50` (chỉ biến môi trường, không sửa file cấu hình).
- Quyết định còn thiếu: (1) hủy/từ chối yêu cầu và mở lại yêu cầu đã giải quyết (V1 chỉ đi tiến); (2) tenant xác nhận đã xử lý xong trước khi đóng; (3) SLA/hạn xử lý và leo thang theo mức ưu tiên; (4) ảnh/đính kèm; (5) ghi chú nội bộ ẩn với tenant (hiện mọi ghi chú tenant đều thấy); (6) giới hạn số yêu cầu mở của tenant để chống spam; (7) thông báo khi đổi trạng thái (P11).

## Kết quả P10 — In-app Notifications

- Thêm enum `notification_type`, bảng `notifications` và migration `202610140020_p10_notifications`. Migration chỉ thêm mới (không DROP/TRUNCATE/UPDATE/backfill dữ liệu cũ; chỉ tạo function và trigger AFTER INSERT/UPDATE trên `viewing_requests`, `maintenance_status_history`, `invoices`). Đã `prisma migrate deploy` lên Neon development `Apartment` (20/20 migrations, schema up to date).
- Thông báo sinh bằng trigger cùng transaction với sự kiện nghiệp vụ: yêu cầu xem phòng (tạo/hủy → OWNER/MANAGER; xác nhận/từ chối → người yêu cầu), bảo trì (tạo/đổi trạng thái → OWNER/MANAGER và tài khoản Tenant liên kết), hóa đơn ISSUED (→ tài khoản Tenant liên kết). `dedupe_key` unique theo user chống trùng; người thực hiện không tự nhận thông báo; chỉ user ACTIVE nhận. DB chặn DELETE và mọi sửa ngoài `read_at` (không đánh dấu chưa đọc lại).
- API (module `apps/api/src/modules/notifications`, đã đăng ký trong `AppModule`): `GET /notifications` (phân trang, `unreadOnly`), `GET /notifications/unread-count`, `POST /notifications/:id/read` (idempotent), `POST /notifications/read-all`. Mọi truy vấn lọc theo user từ access token; thông báo của người khác trả `NOTIFICATION_NOT_FOUND` (404). Không trả `userId`/`dedupeKey`.
- Prisma validate/generate, shared build, API typecheck/build, jest toàn API (39 suite, 332 test): **PASS**.
- Smoke API + PostgreSQL thật: **PASS** — Tenant được báo khi hóa đơn ISSUED (DRAFT không báo, người phát hành không tự nhận), OWNER được báo yêu cầu bảo trì mới, Tenant được báo khi đổi trạng thái, Tenant khác không thấy, unread-count/mark-read idempotent/read-all, user khác 404, chưa đăng nhập 401, DB chặn delete/sửa/unread, mỗi hóa đơn đúng một thông báo.
- **NOT RUN trong smoke:** nhánh trigger Viewing Request (cần listing công khai; đã được review SQL và chưa chạy thật). Email/push/realtime, tùy chọn tắt thông báo, thông báo quá hạn/nhắc nợ và frontend chưa triển khai.

## Kết quả P11 — Landlord Dashboard

- Không có migration (chỉ đọc dữ liệu hiện có). Module `apps/api/src/modules/dashboard`: `GET /workspaces/:workspaceId/dashboard?buildingId=&period=YYYY-MM`; OWNER/MANAGER/STAFF xem được, lọc Workspace (và Building tùy chọn) trong transaction `RepeatableRead`. Kỳ mặc định là tháng hiện tại theo Asia/Ho_Chi_Minh.
- Số liệu thật từ DB: phòng (không tính phòng archived), hợp đồng (active/ended/sắp hết hạn 30 ngày), hóa đơn (draft/issued/theo kỳ, tổng phát hành = tổng + adjustment), trạng thái thanh toán, doanh thu đã thu trong tháng, công nợ, hóa đơn quá hạn (`due_date` < hôm nay VN và còn nợ) và số yêu cầu bảo trì theo trạng thái. Công nợ = tổng + adjustment − (payment − reversal) chỉ trên hóa đơn ISSUED còn nợ; doanh thu = payment − reversal theo `received_at` giờ Việt Nam. **Tiền cọc không nằm trong bất kỳ số liệu nào.**
- Hợp đồng chung `DashboardResponse` (shared) bổ sung khối `maintenance`.
- Smoke API + PostgreSQL thật: **PASS** (đối chiếu thủ công từng số): billed 3,100,000; collected 2,350,000 (thanh toán 00:00:00 ngày 1 tính vào tháng, 23:59:59 ngày cuối tháng trước thuộc tháng trước, payment đã đảo trừ ròng, cọc 5,000,000 không tính); outstanding 1,150,000; 2 hóa đơn quá hạn 1,150,000; bucket unpaid/partial/paid = 1/1/1; lọc Building, kỳ trước, non-member 404, Building lạ 404, kỳ sai 400, chưa đăng nhập 401. Một kiểm tra của script (kỳ trước, `collected = 0`) ghi kỳ vọng sai: khoản 100,000 nhận 23:59:59 ngày cuối tháng trước đúng ra thuộc tháng trước (dashboard trả 100000); code không đổi.
- Giới hạn: chỉ một workspace mỗi lần gọi, chưa có biểu đồ/xuất báo cáo/so sánh nhiều tháng; "hợp đồng sắp hết hạn" cố định 30 ngày; doanh thu chưa gồm dịch vụ chưa lập hóa đơn.
- Cleanup theo audit: users test disable + session thu hồi, workspace/building/room test archive, hợp đồng kết thúc; không hard-delete. Workspace test `Smoke P10P11 mv8cpmre` từ một lần chạy lỗi giữa chừng vẫn ACTIVE (chủ đã disable) vì script dừng trước bước cleanup.
- Commit, push và frontend: **NOT RUN** theo yêu cầu.

## Kết quả P12 — Platform Admin V1

- Thêm bảng `platform_admins`, `listing_moderations`, `admin_audit_logs` và migration `202610150021_p12_platform_admin`. Migration chỉ thêm mới (không ALTER/DROP/UPDATE/backfill, không đụng `users`/Auth, không tạo admin nào) và đã `prisma migrate deploy` lên Neon development `Apartment` (21/21 migrations).
- Quyền PLATFORM_ADMIN là vai trò riêng, độc lập với OWNER/MANAGER/STAFF. `PlatformAdminGuard` đọc bảng `platform_admins` (và user ACTIVE) từ DB trên mọi request, không dựa vào JWT; repository kiểm tra lại actor trong transaction. **Không có API nào cấp quyền admin**; cấp quyền là thao tác của operator trực tiếp trên DB.
- API `/admin`: `GET users`, `GET users/:id`, `POST users/:id/lock|unlock`, `GET listings`, `POST listings/:id/hide|restore`, `GET audit-logs`. Mọi thao tác ghi bắt buộc `reason`, Origin/CSRF, transaction `Serializable` kèm retry và một dòng audit. Không có route nào cho room, hợp đồng, điện nước, hóa đơn, thanh toán, tiền cọc hay xóa dữ liệu.
- Khóa tài khoản: đặt user DISABLED và thu hồi mọi session (`USER_DISABLED`); admin không thể tự khóa hoặc khóa admin khác (`ADMIN_TARGET_PROTECTED`); khóa/mở lặp lại trả `ADMIN_STATE_UNCHANGED`.
- Kiểm duyệt listing lưu ở `listing_moderations`, không sửa Listing/Room/giá/trạng thái publish của chủ trọ. Marketplace search, detail, tạo và xác nhận viewing request đều loại listing bị ẩn; chủ trọ bật lại listing không vượt được kiểm duyệt.
- Audit log: bảng append-only (trigger chặn UPDATE/DELETE), trigger DB yêu cầu actor là platform admin; metadata chỉ gồm id/số đếm, API chỉ trả giá trị scalar, không có email/token/hash. Lọc theo actor, action, targetType, targetId, khoảng thời gian; có phân trang.
- Prisma validate/generate, shared build, API typecheck/build, 16 test admin mới, toàn bộ jest API: **PASS**. Test listing repository cũ được cập nhật theo điều kiện kiểm duyệt mới.
- Smoke API + PostgreSQL thật: **PASS** (50 kiểm tra): 401/403 cho user thường và workspace OWNER, token cấp trước khi được cấp quyền hoạt động ngay sau grant (quyền đọc từ DB), tìm kiếm/chi tiết/lọc user, tự khóa và khóa admin khác bị chặn, thiếu lý do 400, thiếu CSRF 403, lock → token cũ và đăng nhập bị từ chối + session thu hồi → unlock đăng nhập lại được, hide → listing biến mất khỏi search/detail/viewing request mà Room/giá/publish không đổi, restore, admin không đọc/sửa được workspace, dashboard, hợp đồng hay phòng, audit đúng 4 dòng với filter/phân trang/ngày và không lộ dữ liệu cá nhân, DB chặn sửa/xóa audit, actor không phải admin và xóa moderation.
- Cleanup theo audit: 5 user test disable + session thu hồi, workspace/building/room test archive, listing tắt publish. Hai dòng `platform_admins` của user test (đã disable nên guard từ chối) và các dòng audit/moderation được giữ lại, không hard-delete.
- Chưa có: cấp/thu hồi admin qua công cụ vận hành, xử lý báo cáo/khiếu nại, thống kê toàn nền tảng, cấu hình/danh mục chung, bảo vệ cấp DB cho việc disable admin bằng SQL trực tiếp, frontend, commit và push.

## Kết quả V1 CRUD Gap Closure

- **Tenant archive/restore (không migration):** `PATCH /workspaces/:workspaceId/tenants/:tenantId/archive|restore`, OWNER/MANAGER (STAFF và workspace khác nhận 404). Dùng cột `status`/`archived_at` sẵn có, transaction `Serializable` + khóa row, idempotent. Archive bị chặn khi còn hợp đồng ACTIVE (409 `TENANT_HAS_ACTIVE_CONTRACT`); hợp đồng, xe, liên kết tài khoản và hóa đơn được giữ nguyên. Tenant ARCHIVED không sửa được, không tạo hợp đồng mới.
- **User profile (không migration):** `GET`/`PATCH /users/me`. Chỉ sửa được `displayName` (1–100 ký tự, không ký tự điều khiển, `null` để xóa) và chỉ khi tài khoản ACTIVE. Email, role, status, password hay bất kỳ trường nào khác bị ValidationPipe từ chối 400. Chưa có số điện thoại/avatar vì cần thay đổi schema.
- **Maintenance cancel:** đã được Product Owner duyệt, xem mục "Tenant Maintenance Cancellation V1" bên dưới.
- Prisma không đổi; shared build, API typecheck/build, jest toàn API: **PASS**. Smoke API + PostgreSQL thật: **PASS** (34 kiểm tra: chặn archive khi còn hợp đồng ACTIVE, RBAC, idempotent, lịch sử giữ nguyên, tenant archived bị chặn sửa/tạo hợp đồng, profile hợp lệ và các payload role/status/email/password bị 400, tài khoản disabled 403). Cleanup theo audit, không hard-delete.

## Kết quả Tenant Maintenance Cancellation V1 — DEPLOYED + SMOKE PASS

- Quy tắc đã duyệt: tenant chỉ hủy yêu cầu của chính mình khi `OPEN` và chưa có người xử lý; `CANCELLED` là trạng thái kết thúc (không sửa, không xử lý tiếp, không mở lại); manager không thể chuyển sang `CANCELLED` qua `transition`; yêu cầu cũ không bị đổi trạng thái.
- API: `POST /maintenance-requests/me/:requestId/cancel` body `{ reason? }` (≤500 ký tự). Khóa row `FOR UPDATE` và kiểm tra `OPEN` + chưa phân công trong cùng transaction `Serializable`, nên hủy đồng thời với phân công/bắt đầu xử lý chỉ một bên thắng (bên thua nhận 409 `MAINTENANCE_NOT_CANCELLABLE` hoặc `MAINTENANCE_NOT_EDITABLE`). Ghi lịch sử `OPEN → CANCELLED` (lý do trong `note`), không xóa dữ liệu. Workspace/Building/Room archived chặn hủy.
- Thông báo: trigger P10 sẵn có gửi `MAINTENANCE_STATUS_CHANGED` ("Maintenance status changed: CANCELLED") tới OWNER/MANAGER; người hủy không tự nhận. Dashboard `maintenance` có thêm `cancelled`.
- Migration (đã deploy):
  - `202610150022_p09_maintenance_cancelled_enum`: chỉ `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'CANCELLED'`.
  - `202610150023_p09_maintenance_cancelled_rules`: thay CHECK `maintenance_requests_state_check` (giữ nguyên 4 nhánh cũ, thêm nhánh CANCELLED: không assignee, không resolved/closed) và `CREATE OR REPLACE` hàm trigger guard (CLOSED/CANCELLED bất biến; chỉ cho phép `OPEN → CANCELLED` khi chưa phân công). Không INSERT/UPDATE/DELETE dòng nào.
- Prisma validate/generate, shared build, API typecheck/build, 64 test liên quan (maintenance, dashboard, notifications, error contract): **PASS**. Jest toàn API 43 suite: **PASS**.
- Deploy: pre-flight PASS trên Neon development `Apartment` (21/21 migration hoàn tất, không lỗi/rollback, không drift: hàm trigger và CHECK trên DB trùng 019; 023 = bản hiện tại + đúng các bổ sung CANCELLED). `migrate deploy` chạy 022 rồi 023 trong hai transaction riêng; hiện 23/23 migrations, schema up to date. 9 yêu cầu cũ (6 OPEN, 1 IN_PROGRESS, 2 CLOSED) không đổi.
- Smoke API + PostgreSQL thật: **PASS** (34 kiểm tra): hủy OPEN chưa phân công; đã phân công/IN_PROGRESS bị 409; tenant khác 404; CANCELLED không sửa/chuyển tiếp (API và DB); manager không chuyển được sang CANCELLED; history `OPEN → CANCELLED` có lý do và người hủy; OWNER nhận thông báo, người hủy và STAFF không; dashboard `cancelled`; 12 vòng hủy đồng thời với phân công/bắt đầu xử lý: không bao giờ cả hai thành công, trạng thái cuối nhất nhất, không HTTP 5xx (bên thua nhận 409 nghiệp vụ).
- Bug tìm thấy khi smoke và đã sửa: bên thua trong race nhận HTTP 500 vì lỗi serialization từ `SELECT ... FOR UPDATE` được Prisma báo là `P2010` (SQLSTATE 40001), không phải `P2034`. Thêm `isSerializationFailure` (`src/database/serialization-failure.ts`) và retry tối đa 5 lần trong Maintenance; áp dụng cùng bộ phát hiện cho Admin và Tenant archive. Dữ liệu không bị hỏng ở lần chạy lỗi.
- Cleanup theo audit: hợp đồng kết thúc, tenant/room/building/workspace archive, user disable; các yêu cầu bảo trì test được giữ lại, không hard-delete.

## Kết quả Forgot / Reset Password V1

- Kiểm tra trước: chưa có tính năng này (P01 đã hoãn); Auth đang hoạt động không bị viết lại. Thêm module `apps/api/src/modules/auth/password-reset`, bổ sung hai action cho rate limiter hiện có và dependency `nodemailer@10.0.13` (cố định phiên bản ~2 tuần tuổi; `package-lock.json` thay đổi).
- Migration `202610150024_auth_password_reset_tokens`: chỉ tạo bảng `password_reset_tokens` (digest 32 byte, unique, một token còn hiệu lực mỗi user, trigger bất biến/chặn xóa). Không đụng bảng Auth cũ, không ghi dữ liệu. Đã `migrate deploy` lên Neon development `Apartment` (24/24, schema up to date).
- API: `POST /auth/forgot-password` (202 chung), `POST /auth/reset-password` (204). Chi tiết, giới hạn và cấu hình email tại [API_CONTRACT](API_CONTRACT.md).
- Prisma validate/generate, shared build, API typecheck/build, jest toàn API: **PASS** (unit mới: token hết hạn, dùng lại, sai token, thành công, thu hồi session, tài khoản khóa, cooldown, race, cấu hình môi trường, migration).
- Smoke API + PostgreSQL thật (43 kiểm tra): **PASS**. Phản hồi forgot giống hệt cho tài khoản có/không tồn tại/bị khóa và cùng sàn thời gian; DB chỉ có digest, TTL đúng 20 phút; token sai/hết hạn/đã dùng/bị thay thế → 400; reset thành công đổi hash Argon2id, thu hồi cả hai refresh session, mật khẩu cũ mất hiệu lực, user khác không ảnh hưởng; 5 reset đồng thời chỉ một thắng, không 5xx; 6 forgot đồng thời chỉ 1 token và 1 email; tài khoản DISABLED không reset được; DB chặn sửa/xóa/tái sử dụng/token thứ hai; giới hạn per-email và per-token trả 429; log API không chứa token hay mật khẩu.
- **Email delivery: provider thật NOT RUN** (không có provider và địa chỉ test được cấu hình, không gửi tới người dùng thật). Đường gửi SMTP của `nodemailer` được kiểm chứng PASS với SMTP sink cục bộ trên 127.0.0.1 (nhận đúng một thư, đúng người nhận, đúng link `#token=`); độ tương thích với nhà cung cấp cụ thể (TLS, auth, giới hạn tốc độ) chưa được kiểm chứng.
- Giới hạn: limiter vẫn process-local (chưa phân tán); access JWT cũ còn hiệu lực tối đa 10 phút sau reset; chưa có email xác nhận "mật khẩu đã đổi", chưa xác minh email khi đăng ký, chưa có hàng đợi/retry cho email (gửi thất bại chỉ ghi cảnh báo, người dùng yêu cầu lại sau 60 giây); frontend chưa làm.
- Cleanup theo audit: các user test disable, session thu hồi; token test được giữ lại (bất biến), không hard-delete.

## Quyết định đã duyệt

1. P01 tạo hai bảng `users`, `auth_sessions`; P02 tạo và đã áp dụng hai bảng `workspaces`, `workspace_memberships` trên Neon development. Tám bảng P03/P04/P05 đã có migration review-only và 14 bảng mục tiêu còn lại vẫn ở mức thiết kế.
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
