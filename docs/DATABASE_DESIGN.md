# Thiết kế database mục tiêu

## Trạng thái triển khai

Ngày 14/10/2026, cả 11 migration P01–P06-02 đã được áp dụng lên Neon **development** `Apartment`; `prisma:migrate:status` xác nhận schema up to date. Database có các bảng P01/P02, Building/Room/Marketplace/Viewing, `tenants`, `tenant_link_requests` và `tenant_user_links`. Bảng `tenant_link_requests` là bảng workflow/audit hỗ trợ `tenant_user_links`, được thêm ngoài danh mục 26 bảng nghiệp vụ mục tiêu ban đầu.

## Danh mục 26 bảng mục tiêu

| #   | Bảng mục tiêu                | Trách nhiệm chính                | Trạng thái                 |
| --- | ---------------------------- | -------------------------------- | -------------------------- |
| 1   | `users`                      | Danh tính người dùng             | APPLIED — Neon development |
| 2   | `auth_sessions`              | Refresh session/revocation       | APPLIED — Neon development |
| 3   | `workspaces`                 | Ranh giới sở hữu dữ liệu         | APPLIED — Neon development |
| 4   | `workspace_memberships`      | Role theo workspace              | APPLIED — Neon development |
| 5   | `buildings`                  | Tòa nhà/tài sản                  | APPLIED — Neon development |
| 6   | `rooms`                      | Phòng cho thuê                   | APPLIED — Neon development |
| 7   | `amenities`                  | Danh mục tiện ích                | APPLIED — Neon development |
| 8   | `room_amenities`             | Liên kết phòng-tiện ích          | APPLIED — Neon development |
| 9   | `room_images`                | Metadata ảnh phòng               | APPLIED — Neon development |
| 10  | `listings`                   | Listing marketplace              | APPLIED — Neon development |
| 11  | `viewing_requests`           | Lịch xem phòng                   | APPLIED — Neon development |
| 12  | `tenants`                    | Hồ sơ người thuê                 | APPLIED — Neon development |
| 13  | `tenant_user_links`          | Liên kết tenant-user có xác minh | APPLIED — Neon development |
| 14  | `vehicles`                   | Phương tiện tenant               | APPLIED — Neon development |
| 15  | `contracts`                  | Hợp đồng thuê                    | APPLIED — Neon development |
| 16  | `contract_members`           | Người ở theo hợp đồng            | Thiết kế mục tiêu          |
| 17  | `rate_plans`                 | Đơn giá có hiệu lực              | Migration tạo, chưa deploy |
| 18  | `meter_readings`             | Chỉ số điện/nước                 | Thiết kế mục tiêu          |
| 19  | `invoices`                   | Hóa đơn kỳ                       | Migration tạo, chưa deploy |
| 20  | `invoice_items`              | Dòng hóa đơn/snapshot            | Migration tạo, chưa deploy |
| 21  | `invoice_adjustments`        | Điều chỉnh có audit              | Migration tạo, chưa deploy |
| 22  | `invoice_payments`           | Thanh toán xác nhận              | Migration tạo, chưa deploy |
| 23  | `contract_deposit_entries`   | Sổ tiền đặt cọc riêng            | Migration tạo, chưa deploy |
| 24  | `maintenance_requests`       | Yêu cầu bảo trì                  | APPLIED — Neon development |
| 25  | `maintenance_status_history` | Lịch sử bảo trì chỉ-thêm         | APPLIED — Neon development |
| 25  | `notifications`              | Thông báo tenant/workspace       | Thiết kế mục tiêu          |
| 26  | `audit_logs`                 | Dấu vết thay đổi nhạy cảm        | Thiết kế mục tiêu          |

## Ràng buộc cần được phê duyệt trước migration

- Tất cả dữ liệu sở hữu phải có ranh giới workspace rõ ràng.
- Cấm overlap hợp đồng `ACTIVE` cho cùng phòng.
- Đơn giá version theo `effectiveFrom`; hóa đơn lưu snapshot bất biến.
- Payment phải idempotent và chỉ payment xác nhận mới thay đổi số dư.
- Tenant-user link cần luồng xác minh.
- Những index, foreign key, enum/status và retention policy cụ thể phải được chốt trong PART liên quan.

Danh mục 26 bảng là phân rã tài liệu mục tiêu từ master plan; tên bảng, cột và quan hệ chi tiết vẫn cần Product Owner/technical review trước khi trở thành Prisma model hoặc migration.

## Thiết kế P01 đã duyệt

- P01 chỉ tạo `users` và `auth_sessions`.
- `users` không chứa global role, workspace ID hoặc tenant ID.
- Mỗi login tạo một session family; mỗi refresh rotation tạo một generation mới.
- Refresh token thô không được lưu; database chỉ lưu SHA-256 digest.
- Rotation dùng transaction, conditional update và constraint tối đa một generation chưa bị thu hồi trong mỗi family.
- Workspace, membership và RBAC thuộc P02.

Cột, index, foreign key, expiry, revocation, cleanup và concurrency contract đầy đủ nằm tại [BACKEND_PART1_AUTH](backend/BACKEND_PART1_AUTH.md). Migration P01-01 đã chạy trên Neon development; metadata và smoke API đã được kiểm chứng trong P01-07.

## Thiết kế P02-01/P02-02 đã áp dụng trên development

- `workspaces`: UUID primary key, `name` varchar(100), `status` ACTIVE/ARCHIVED, `archived_at`, `created_at`, `updated_at`; name phải trim/non-empty và status phải nhất quán với `archived_at`.
- `workspace_memberships`: UUID primary key, FK `workspace_id`, FK `user_id`, role theo workspace, `created_at`, `updated_at`.
- Enum role đã chốt `OWNER`, `MANAGER`, `STAFF`; đây là role theo membership, không phải global role trong `users` hoặc JWT.
- Unique `(workspace_id, user_id)` bảo đảm một user chỉ giữ một role trực tiếp trong một workspace.
- Index `user_id` phục vụ liệt kê workspace của user; index `(workspace_id, role)` phục vụ kiểm tra và lọc role trong workspace.
- Hai foreign key dùng `ON DELETE RESTRICT`; database trigger chặn hard delete workspace để bắt buộc archive/soft-delete.
- Partial unique index bảo đảm tối đa một OWNER; deferred constraint triggers bảo đảm ít nhất một OWNER khi transaction commit. Tạo workspace/OWNER và chuyển OWNER là transaction `Serializable`; transfer khóa row workspace để tuần tự hóa request đồng thời.
- Database behavior trực tiếp đã được kiểm chứng trong P02-03; concurrency stress nhiều connection vẫn chưa chạy. Xem [BACKEND_PART2_WORKSPACE](backend/BACKEND_PART2_WORKSPACE.md).

## Thiết kế P03-01 — Building foundation

- `buildings` thuộc đúng một workspace qua `workspace_id`; FK dùng `ON DELETE RESTRICT` để bảo toàn dữ liệu.
- Trường cơ bản gồm tên, mô tả tùy chọn, trạng thái `ACTIVE`/`ARCHIVED`, địa chỉ hai dòng, phường/xã, quận/huyện, tỉnh/thành phố, mã bưu chính, country code mặc định `VN` và cặp tọa độ tùy chọn.
- Tên, dòng địa chỉ chính và tỉnh/thành phố phải được trim và không rỗng. Latitude/longitude phải cùng có hoặc cùng không có, đồng thời nằm trong phạm vi địa lý hợp lệ.
- Index `workspace_id` phục vụ truy vấn theo ranh giới sở hữu; index `(workspace_id, city, district)` phục vụ lọc vị trí trong workspace.
- Building dùng archive/soft-delete; database trigger chặn hard-delete và check constraint giữ `status` nhất quán với `archived_at`.
- Migration `202610140003_p03_building_foundation` mới chỉ được tạo để review, chưa chạy trên Neon hoặc database khác. P03-03 đã có đủ API create/list/detail/update/archive/restore cho Building; metadata ảnh phòng được triển khai riêng ở P03-06.

## Thiết kế P03-05 — Room & Amenities

- `rooms` có `workspace_id` và `building_id`; composite FK bảo đảm Building thuộc đúng Workspace. Mã phòng được chuẩn hóa uppercase và unique trong từng Building.
- Diện tích `DECIMAL(10,2)` phải dương; giá thuê tháng `DECIMAL(14,2)` không âm; sức chứa phải dương. Trạng thái gồm `VACANT`, `OCCUPIED`, `UNAVAILABLE`, `ARCHIVED` và nhất quán với `archived_at`.
- `amenities` là danh mục theo Workspace, unique `(workspace_id, name)`. `room_amenities` dùng primary key `(room_id, amenity_id)` và FK `RESTRICT` để bảo toàn dữ liệu.
- Room dùng archive/restore và database trigger chặn hard-delete. Xóa liên kết Room-Amenity chỉ xóa quan hệ, không xóa Room hoặc Amenity.
- Migration `202610140004_p03_room_amenity_foundation` chỉ được tạo để review, chưa chạy trên Neon hoặc database khác.

## Thiết kế P03-06 — Room Images

- `room_images` lưu metadata ảnh theo Room gồm UUID, `workspace_id`, `room_id`, URL tối đa 2048 ký tự, alt text tùy chọn, thứ tự hiển thị và timestamps. PostgreSQL không lưu binary ảnh.
- Composite FK `(room_id, workspace_id)` bảo đảm ảnh và Room cùng Workspace; FK Workspace và Room đều dùng `ON DELETE RESTRICT`.
- Index `(room_id, sort_order, id)` phục vụ danh sách ổn định; index `workspace_id` phục vụ truy vấn theo tenant. `sort_order` phải không âm và URL không được rỗng ở database; API chỉ nhận HTTP/HTTPS.
- Migration `202610140005_p03_room_image_metadata` chỉ được tạo để review, chưa chạy trên Neon hoặc database khác. Dịch vụ upload/lưu ảnh chưa được Product Owner chốt và chưa được tích hợp.

## Thiết kế P04-01 — Public Listings

- `listings` có UUID, `workspace_id`, `room_id`, cờ `is_published`, thời điểm publish/unpublish và timestamps. Unique `room_id` bảo đảm mỗi Room chỉ có tối đa một listing.
- Composite FK `(room_id, workspace_id)` bảo đảm listing và Room cùng Workspace; các FK dùng `ON DELETE RESTRICT`, nên tắt/gỡ listing không xóa dữ liệu Room.
- Check constraint giữ trạng thái publication nhất quán với timestamps. Index `(is_published, published_at, id)` phục vụ public feed; index `workspace_id` phục vụ quản trị theo tenant.
- Điều kiện Workspace/Building ACTIVE và Room VACANT được kiểm tra trong transaction khi bật, đồng thời được áp lại trong mọi public query để tránh lộ listing đã mất điều kiện.
- Migration `202610140006_p04_public_listing_foundation` chỉ được tạo để review và chưa chạy trên Neon hoặc database khác.

## Thiết kế P04-02 — Viewing Requests

- `viewing_requests` liên kết Listing, Workspace, requester User và tùy chọn decision-maker User bằng FK `RESTRICT`. Dữ liệu gồm lịch hẹn, lời nhắn, trạng thái, ghi chú quyết định và timestamps chuyển trạng thái.
- Enum trạng thái gồm `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`. Check constraints yêu cầu lịch sau thời điểm tạo và metadata quyết định/hủy nhất quán với trạng thái.
- Index theo requester/status/lịch bảo vệ truy vấn cá nhân; index theo workspace/status/lịch phục vụ OWNER/MANAGER; index listing/lịch phục vụ kiểm tra lịch của phòng.
- Partial unique index `(requester_user_id, listing_id, scheduled_at)` với trạng thái PENDING/CONFIRMED ngăn yêu cầu đang hoạt động bị tạo trùng.
- Composite FK `(listing_id, workspace_id)` bảo đảm request không thể trỏ sang listing của Workspace khác. Migration `202610140007_p04_viewing_requests` chỉ được tạo để review, chưa chạy trên Neon.

## Thiết kế P05-01 — Tenant Management

- `tenants` dùng UUID, thuộc một `workspace_id`, có `full_name`, điện thoại/email tùy chọn, ngày sinh, địa chỉ, ghi chú nội bộ, trạng thái `ACTIVE`/`ARCHIVED`, thời điểm archive và timestamps.
- FK Workspace dùng `ON DELETE RESTRICT`. Các index `(workspace_id, status, full_name)`, `(workspace_id, phone)` và `(workspace_id, email)` phục vụ danh sách cùng tra cứu trong đúng tenant dữ liệu.
- Email nếu có phải là lowercase/trim; điện thoại nếu có dùng dạng chuẩn hóa 7–15 chữ số với dấu `+` tùy chọn. Ngày sinh lưu kiểu `date`. API kiểm tra ngày hợp lệ và không ở tương lai.
- Trạng thái và `archived_at` phải nhất quán. Trigger chặn hard-delete hồ sơ để bảo toàn dữ liệu cá nhân và dấu vết nghiệp vụ. P05-01 chưa cung cấp API archive/restore.
- Không lưu CCCD/hộ chiếu trong schema này. Không có `user_id`; liên kết Tenant-User có xác minh thuộc bảng/task riêng và không được suy ra từ số điện thoại.
- Migration `202610140008_p05_tenant_foundation` chỉ được tạo để review, chưa chạy trên Neon hoặc database khác.

## Thiết kế P05-02 — Tenant Account Linking

- `tenant_link_requests` ghi Tenant, Workspace, User tự gửi yêu cầu, trạng thái, lời nhắn và quyết định của OWNER/MANAGER. Database yêu cầu metadata quyết định chỉ xuất hiện ở trạng thái APPROVED/REJECTED.
- `tenant_user_links` chỉ được tạo từ một request đã duyệt, lưu người duyệt, thời điểm liên kết và metadata thu hồi. Tất cả FK dùng `RESTRICT`; composite FK bảo đảm Tenant và request/link thuộc cùng Workspace.
- Partial unique indexes bảo vệ một request PENDING và một link ACTIVE cho mỗi Tenant; thêm unique active `(user_id, workspace_id)` để một tài khoản không đồng thời đại diện nhiều hồ sơ Tenant trong cùng Workspace.
- Approval khóa request, kiểm tra lại Workspace/Tenant/User ACTIVE và tạo link cùng cập nhật request trong một transaction `Serializable`. Reject và revoke cũng khóa row trước khi chuyển trạng thái.
- Migration `202610140009_p05_tenant_account_linking` đã được áp dụng trên Neon development `Apartment`; smoke flow API thật PASS.

## Thiết kế P06-01 — Rental Contracts

- `contracts` liên kết Room và Tenant bằng composite FK với `workspace_id`, bảo đảm ba bản ghi thuộc cùng Workspace. FK actor tạo/kết thúc dùng `RESTRICT`; hợp đồng không hard-delete.
- Trạng thái gồm `ACTIVE` và `ENDED`. Ngày bắt đầu/kết thúc dùng PostgreSQL `date`, ngày cuối được tính trong kỳ; tiền thuê tháng là `DECIMAL(14,2)` không âm.
- Exclusion constraint GiST trên `room_id` và `daterange(start_date, end_date, '[]')`, chỉ áp dụng cho ACTIVE, chặn overlap kể cả khi hai khoảng chạm cùng ngày.
- Create/update/end chạy transaction `Serializable` và khóa Room/Contract. Create chuyển Room sang OCCUPIED; end ghi người/thời điểm kết thúc rồi chuyển Room về VACANT.
- Trigger bảo vệ Room có hợp đồng ACTIVE luôn OCCUPIED và chặn archive Building đang chứa hợp đồng ACTIVE. Client Room API chỉ nhận VACANT/UNAVAILABLE, không nhận OCCUPIED.
- Migration `202610140010_p06_rental_contracts` đã deploy trên Neon development; smoke PostgreSQL thật PASS.
- **BE-CONTRACT-DATES-02 (review-only, CHƯA deploy):** migration `202610150027_contract_dates_room_state_guard` chỉ `CREATE OR REPLACE` hàm trigger `protect_active_contract_room_state`: cấm `ARCHIVED` khi Room còn hợp đồng ACTIVE bất kỳ, cấm `VACANT`/`UNAVAILABLE` chỉ khi có hợp đồng ACTIVE **đã bắt đầu** (`start_date ≤ ngày Asia/Ho_Chi_Minh`). Không đổi bảng, enum, exclusion constraint hay dữ liệu; hợp đồng tương lai và hiệu lực theo ngày (`phase`) được suy ra khi đọc, không có cột/trạng thái mới và không có cron.

## Thiết kế P06-02 — Vehicle Management

- `vehicles` thuộc một Tenant và Workspace bằng composite FK, gồm biển số chuẩn hóa, loại xe mở, hãng/model/màu/ghi chú tùy chọn, trạng thái ACTIVE/INACTIVE và metadata ngừng sử dụng.
- Unique `(workspace_id, license_plate)` áp dụng cho toàn bộ lịch sử, không chỉ xe ACTIVE, để không tái sử dụng cùng biển số cho bản ghi khác và làm sai tham chiếu hóa đơn tương lai.
- FK dùng `RESTRICT`; trigger chặn hard-delete. Ngừng sử dụng chỉ chuyển trạng thái và giữ dữ liệu phục vụ audit/billing sau này.
- Migration `202610140011_p06_vehicle_management` đã deploy trên Neon development; chưa smoke riêng module Vehicles.

## Thiết kế P07-01 — Building Rates

- `rate_plans` thuộc Building/Workspace bằng composite FK, lưu code, tên, loại dịch vụ, đơn vị tính, `DECIMAL(14,4)` unit price và khoảng hiệu lực.
- Loại dịch vụ: điện, nước, Wifi, rác, gửi xe và khác. Đơn vị phải khai báo rõ: kWh, mét khối, phòng, người, xe hoặc khoản cố định; chưa áp đặt default khi nghiệp vụ chưa chốt.
- Khoảng hiệu lực dùng `[effective_from, effective_to)`. GiST exclusion constraint cấm hai phiên bản cùng Building/code chồng thời gian, kể cả request đồng thời.
- Update đóng phiên bản ACTIVE cũ và tạo phiên bản mới trong transaction `Serializable`; stop chỉ đóng khoảng. Trigger chặn hard-delete lịch sử để invoice tương lai có thể snapshot đúng phiên bản.
- Migration `202610140012_p07_building_rates` chỉ được tạo để review; chưa chạy trên Neon hoặc database khác.

## Tác động của cập nhật nghiệp vụ Marketplace/Admin

- Quyền Platform Admin kiểm duyệt listing không tạo quyền sửa/xóa room, contract, invoice, payment hoặc dữ liệu tài chính workspace.
- Gỡ/ẩn listing phải giữ nguyên dữ liệu room và nghiệp vụ gốc.
- Smart Rental Assistant là đề xuất P04 và sử dụng dữ liệu listing/building/room/amenity/rate công khai; tài liệu này chưa phê duyệt bảng mới.
- Nhu cầu lưu báo cáo/khiếu nại, moderation action, routing cache hoặc search history cần database design và retention/privacy review riêng trước khi thêm vào danh mục bảng.

Yêu cầu nghiệp vụ nguồn tại [BUSINESS_REQUIREMENTS](business/BUSINESS_REQUIREMENTS.md) và đề xuất tại [SMART_RENTAL_ASSISTANT](marketplace/SMART_RENTAL_ASSISTANT.md).

## Thiết kế P08-01 — Invoices

- Migration `202610140014_p08_invoice_foundation` (review-only). `invoices`: scope bằng FK phức hợp `(room_id, building_id, workspace_id)` và `(contract_id, room_id, workspace_id)` (thêm unique `contracts(id, room_id, workspace_id)`); unique `(contract_id, period)` chống trùng kể cả request đồng thời; `period` là ngày 1 của tháng.
- `status` `DRAFT`/`ISSUED`; CHECK: DRAFT không có `total_amount`/`issued_*`, ISSUED bắt buộc có và `missing_items = []`. `missing_items` (JSONB) liệt kê khoản thiếu của DRAFT.
- `invoice_items` snapshot `quantity` Decimal(14,3), `unit_price` Decimal(14,4), `amount` Decimal(14,0) (VND đã làm tròn `ROUND_HALF_UP`), `proration_numerator/denominator` (tiền thuê giữa tháng), `rate_plan_id`, `meter_reading_id` + `meter_revision`, `details` (chỉ số, biển số, số người). `rounding_rule` lưu trên hóa đơn.
- Trigger: ISSUED không sửa được, không hard-delete; item của hóa đơn ISSUED không thêm/sửa/xóa; chuyển sang ISSUED phải có tổng bằng tổng các item; không đổi scope/kỳ của hóa đơn.
- Số xe tại kỳ dùng `vehicles.created_at` (bắt đầu hiệu lực) và `inactive_at` (ngừng hiệu lực), không dựa trạng thái ACTIVE hiện tại.

## Thiết kế P08-01 Billing Rules — migration 015

- Migration `202610140015_p08_billing_rules` (review-only) cộng thêm trên 014; không drop bảng/cột nào. 014 chưa deploy nên chưa có dữ liệu, nhưng 015 vẫn backfill an toàn: `tenant_id` suy ra từ hợp đồng, người/thời điểm xác nhận số người lấy từ `created_by/created_at`, rồi mới `SET NOT NULL`. Trigger bất biến của `invoices` chỉ tạm tắt trong đúng các câu UPDATE backfill và bật lại ngay.
- `invoices` thêm `tenant_id` (FK phức hợp `(contract_id, room_id, tenant_id, workspace_id)` nên tenant của hóa đơn không thể lệch hợp đồng; unique cũ `contracts(id, room_id, workspace_id)` được thay bằng unique có `tenant_id`), `occupant_count_confirmed_by/at` (CHECK đi cùng `occupant_count`), `bills_vehicles` (null = chưa quyết định) và EXCLUDE `invoices_vehicle_billing_excl` — mỗi Tenant chỉ một hóa đơn nhận xe trong một kỳ, kể cả request đồng thời.
- `room_service_assignments`: dịch vụ (mã Building Rate) áp dụng cho phòng, `effective_from`/`effective_to` loại trừ, EXCLUDE chống chồng lấn theo `(room_id, rate_code)`, FK phức hợp `(room_id, building_id, workspace_id)`, trigger chặn hard-delete để giữ lịch sử.
- Snapshot đoạn giá: mỗi dòng phí cố định tách theo khoảng hiệu lực lưu `proration_numerator/denominator` và `details.segmentFrom/segmentTo`; dòng theo người lưu `details.occupantCount/confirmedBy/confirmedAt`.
- Đã đối chiếu `prisma migrate diff --from-empty` với 012–015: cột, index, unique khớp. Tên FK mặc định của Prisma lệch tên trong migration 013/014/015, nên schema khai báo `map:` cho các FK này để khớp migration.

## Thiết kế P08-02 — Invoice Adjustments

- Migration `202610140016_p08_invoice_adjustments` (review-only, chỉ thêm bảng mới, không đụng `invoices`/`invoice_items`). `invoice_adjustments`: `amount` Decimal(14,0) khác 0 (dương hoặc âm), `requested_amount` Decimal(14,4) giữ số gốc, `reason` bắt buộc, `created_by`, `created_at`; không có `updated_at`.
- FK phức hợp `(invoice_id, workspace_id)` giữ workspace scope; `reference_adjustment_id` FK `(id, invoice_id)` buộc tham chiếu cùng hóa đơn và unique nên mỗi adjustment chỉ được sửa sai một lần. Unique `(invoice_id, idempotency_key)` chống ghi trùng khi retry kể cả đồng thời.
- Trigger INSERT khóa dòng hóa đơn, chỉ cho ISSUED và chặn `total_amount + tổng adjustments + amount < 0`; trigger UPDATE/DELETE chặn mọi sửa/xóa (append-only). `adjustedTotal` được tính khi đọc, không lưu.

## Thiết kế P08-03 — Invoice Payments

- Migration `202610140017_p08_invoice_payments` (review-only). `invoice_payments` là sổ chỉ thêm: `kind` `PAYMENT`/`REVERSAL`, `amount` Decimal(14,0) > 0, `method` `CASH`/`BANK_TRANSFER`, `received_at`, `note`, `confirmed_by`, `idempotency_key`. Một `REVERSAL` bắt buộc có `reverses_payment_id` và lý do (`note`); unique `(reverses_payment_id, invoice_id)` nên mỗi thanh toán chỉ đảo một lần; FK phức hợp giữ workspace scope và cùng hóa đơn.
- Trigger INSERT khóa dòng hóa đơn (tuần tự với adjustment), chỉ cho ISSUED, chặn `paid + amount > total + adjustments`, và buộc `REVERSAL` đảo toàn phần một `PAYMENT` cùng hóa đơn, cùng số tiền và phương thức. Trigger UPDATE/DELETE chặn mọi sửa/xóa.
- Migration cũng thay trigger của `invoice_adjustments`: adjustment không được làm `total + adjustments` thấp hơn số đã thu (`INVOICE_ADJUSTMENT_BELOW_PAID`), nên công nợ không bao giờ âm. `paidTotal` và `outstanding` được tính khi đọc, không lưu.

## Thiết kế P08-04 — Contract Deposits

- Migration `202610140018_p08_contract_deposits` (review-only; chỉ thêm bảng, enum `deposit_entry_kind`, hai hàm/trigger và unique `contracts(id, workspace_id)` để làm FK scope). `contract_deposit_entries` là sổ chỉ thêm theo Contract: `kind` `COLLECTION`/`DEDUCTION`/`REFUND`/`REVERSAL`, `amount` Decimal(14,0) > 0, `method`, `occurred_at`, `reason`, `reference`, `note`, `reverses_entry_id`, `idempotency_key`, `created_by`.
- CHECK theo loại: COLLECTION bắt buộc `method`; REFUND bắt buộc `method`, `reason` và `reference` (thông tin hoàn tiền thực tế); DEDUCTION bắt buộc `reason` và `reference` và không có `method`; REVERSAL bắt buộc `reverses_entry_id` và `reason`. Unique `(reverses_entry_id, contract_id)` nên mỗi giao dịch chỉ đảo một lần; FK phức hợp giữ workspace scope và cùng hợp đồng.
- Hàm `contract_deposit_balance` tính số dư (giao dịch bị đảo bị loại). Trigger INSERT khóa dòng hợp đồng, bắt `REVERSAL` đảo toàn phần đúng số tiền/phương thức của một giao dịch không phải đảo, và chặn số dư âm. Trigger UPDATE/DELETE chặn mọi sửa/xóa. Trigger còn bắt `created_by` là OWNER/MANAGER của workspace và áp ngoại lệ archive: khi workspace hoặc building không còn `ACTIVE`, chỉ `REFUND` do OWNER ghi mới được chấp nhận. Không có ràng buộc nào phụ thuộc trạng thái hợp đồng (ACTIVE hoặc ENDED đều ghi được) nên dữ liệu được giữ sau khi hợp đồng kết thúc. Migration 018 chưa deploy nên được sửa tại chỗ cho quy tắc này.

## Thiết kế P09 — Maintenance

- Migration `202610140019_p09_maintenance` (đã áp dụng trên Neon development; chỉ thêm enum, bảng, hàm và trigger, không đụng bảng cũ). `maintenance_requests`: scope bằng FK phức hợp `(room_id, building_id, workspace_id)` và, khi có hợp đồng, `(contract_id, room_id, tenant_id, workspace_id)` (`contract_id` và `tenant_id` cùng null hoặc cùng có). `status` `OPEN/IN_PROGRESS/RESOLVED/CLOSED`, `priority`, `assignee_user_id`, `resolution_note`, `resolved_at`, `closed_at`; CHECK buộc người xử lý khi `IN_PROGRESS`/`RESOLVED` và ghi chú xử lý khi `RESOLVED`/`CLOSED`.
- Trigger: chỉ cho chuyển trạng thái tiến `OPEN→IN_PROGRESS→RESOLVED→CLOSED`; `CLOSED` bất biến; không đổi scope/người gửi; người xử lý phải là thành viên workspace; chặn hard-delete yêu cầu.
- `maintenance_status_history` chỉ thêm (trigger chặn UPDATE/DELETE): mỗi dòng giữ trạng thái trước/sau, mức ưu tiên và người xử lý tại thời điểm đó, ghi chú và người thực hiện. `requested_by`, `assignee_user_id`, `changed_by` là UUID người dùng, không có FK tới `users`.
