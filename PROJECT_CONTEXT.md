# Bối cảnh dự án — Rental Platform V1.0

## Mục tiêu

Rental Platform V1.0 là nền tảng web hỗ trợ chủ nhà/quản lý vận hành tài sản cho thuê, người thuê tìm phòng và dùng tenant portal. Sản phẩm phục vụ quy mô khoảng 5–50 phòng, kết hợp marketplace, quản lý tài sản, hợp đồng, hóa đơn, thanh toán, bảo trì và báo cáo.

Sản phẩm có bốn không gian: Public Marketplace, Landlord Workspace, Tenant Portal và Platform Admin. Một chủ trọ có thể quản lý nhiều khu/tòa và nhiều phòng, gồm quy mô 30 phòng hoặc hơn. Yêu cầu nghiệp vụ chi tiết được duy trì tại [BUSINESS_REQUIREMENTS](docs/business/BUSINESS_REQUIREMENTS.md).

## Nhóm người dùng

| Nhóm                 | Mục đích                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| Khách vãng lai       | Tìm kiếm listing, xem chi tiết và gửi yêu cầu xem phòng                  |
| Chủ workspace        | Quản lý workspace, tài sản, thành viên, hợp đồng và tài chính            |
| Thành viên workspace | Thao tác theo role được cấp trong workspace                              |
| Người thuê           | Xem hợp đồng, hóa đơn, thanh toán, thông báo và yêu cầu bảo trì của mình |
| Quản trị hệ thống    | Chỉ xuất hiện trong phạm vi admin/audit được phê duyệt sau này           |

## Phạm vi V1.0 đã thống nhất

Master plan xác định 21/22 nhóm khả năng V1.0: chức năng đối soát ngân hàng tự động là mục loại trừ. Các PART P00–P13 bao phủ foundation, xác thực, workspace/RBAC, tài sản, marketplace, viewing, tenant, hợp đồng, billing, payments, tenant portal, maintenance/analytics/admin và hardening phát hành.

## Kiến trúc đã chốt

- Monorepo npm workspaces: `apps/api`, `apps/web`, `packages/shared`.
- Backend: NestJS 11, TypeScript, REST dưới `/api/v1`.
- Frontend: React 19, Vite, React Router, TanStack Query, Axios.
- Database: Neon PostgreSQL.
- ORM duy nhất: Prisma ORM 7.10.0 với PostgreSQL driver adapter.
- Kiến trúc: Modular Monolith + Layered Architecture.
- Quy tắc backend: `Controller → Service → Repository → Prisma → PostgreSQL`; controller không truy vấn database trực tiếp.

## Quy tắc nghiệp vụ không được phá

- Role chủ nhà không là role toàn cục; quyền quản lý dựa trên membership của workspace.
- Không tự động liên kết tenant với user dựa trên số điện thoại; chỉ liên kết sau xác minh.
- Một phòng không có hai hợp đồng `ACTIVE` trùng thời gian.
- Hợp đồng có ngày bắt đầu/kết thúc; ngày kết thúc được tính trong kỳ hợp đồng.
- Hóa đơn lưu snapshot bất biến của đơn giá; điều chỉnh cần audit.
- Thanh toán hỗ trợ một phần; chỉ payment đã xác nhận mới tác động số tiền thu.
- Tiền đặt cọc được theo dõi riêng với tiền thuê.
- Backend luôn xác thực workspace, ownership, giá tiền và trạng thái nhạy cảm; không tin dữ liệu client tự khẳng định.
- Dùng `Asia/Ho_Chi_Minh` cho kỳ hóa đơn và calendar date; API dùng UTC cho timestamp khi phù hợp.
- Platform Admin được quản lý tài khoản, kiểm duyệt listing, xử lý báo cáo, xem thống kê tổng hợp/cấu hình/audit phù hợp; không mặc định được sửa room, contract, invoice, payment, đơn giá, chỉ số, công nợ hoặc tiền cọc của workspace.
- Gỡ listing công khai không được xóa room, hợp đồng hoặc dữ liệu nghiệp vụ gốc.

## Phân công và ranh giới

Codex phụ trách backend, Prisma/Neon, database design, test backend, CI và tài liệu kỹ thuật. Frontend có thể được phát triển độc lập; chỉ đánh dấu tích hợp khi có API thật, contract tương ứng và E2E đạt. Không sửa giao diện ngoài phạm vi task.

## Quyết định Auth P01 đã duyệt

- P01 chỉ gồm `users`, `auth_sessions` và các luồng register/login/me/refresh/logout/logout-all; workspace/membership/RBAC thuộc P02.
- Access JWT dùng HS256, TTL 10 phút; refresh token opaque tối thiểu 256 bit, lưu SHA-256 digest, rotation atomic, family hết hạn tuyệt đối sau 30 ngày.
- Password dùng Argon2id, dài 12–128 ký tự và không ép composition rule.
- Deployment frontend/API cùng site; cookie production dùng `__Host-`, `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax`, không đặt `Domain`.
- Email verification và forgot/reset password được hoãn khỏi P01.

Thiết kế đầy đủ tại [P01 Users/Auth](docs/backend/BACKEND_PART1_AUTH.md). P01-01 migration đã áp dụng lên Neon development Apartment trong P01-07; hai bảng Auth hiện tồn tại và smoke test API thật đã PASS. P01 vẫn IN PROGRESS: thiếu PostgreSQL test riêng cho constraint/concurrency suite đầy đủ và các bước nghiệm thu/hardening còn lại.

## Đề xuất sản phẩm đang xem xét

Smart Rental Assistant là đề xuất mở rộng P04 dùng hard filters và ranking có thể giải thích, chưa triển khai và chưa chốt toàn bộ chi tiết. Xem [SMART_RENTAL_ASSISTANT](docs/marketplace/SMART_RENTAL_ASSISTANT.md).

## Trạng thái thực tế

Sprint 0 và Sprint 0.1 đã có nền tảng monorepo, health API, frontend shell, Prisma/Neon infrastructure và CI. P01 Auth hiện có migration trên Neon development, code và smoke flow chính; vẫn chưa production-ready. P02 đã có schema, API workspace create/list/detail/archive/restore, membership management và ownership transfer OWNER-only, DB-backed guard cùng migration trên Neon development; PostgreSQL concurrency stress và permission matrix chi tiết còn thiếu. P03-06 đã có Building, Room, Amenities và Room Images schema/API với migrations review-only. P04-01/P04-02 đã có Listing, public search và Viewing Requests backend. P05-01/P05-02 đã có quản lý hồ sơ Tenant và liên kết tài khoản có xác minh; cả 9 migration hiện đã áp dụng trên Neon development và smoke Tenant linking PASS. P06-01/P06-02 đã có Contracts và Vehicles backend; migrations đã deploy Neon development và Contracts smoke PostgreSQL PASS. P07/P08/P09/P10/P11/P12 có các module backend được ghi trong CURRENT_STATUS; migration P12 và các migration về sau của branch cần được đối chiếu riêng với môi trường trước deploy. V1 Account Capabilities, Tenant Invitation, My Contracts và Landlord Application/Admin Approval đã có code/schema/tests trên branch hiện tại; migration `202610150025_v1_account_onboarding` đang chờ người dùng duyệt SQL và chính sách tương thích OWNER, chưa deploy. Frontend onboarding chưa triển khai.

Xem [CURRENT_STATUS](docs/CURRENT_STATUS.md) để biết trạng thái sống và [MASTER_ROADMAP](docs/MASTER_ROADMAP.md) để biết kế hoạch.
