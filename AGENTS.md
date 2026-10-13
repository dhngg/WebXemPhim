# Quy tắc làm việc cho Codex

## Trước khi bắt đầu

1. Đọc [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) và [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md).
2. Đọc tài liệu kiến trúc, API và phần liên quan trước khi sửa source.
   Nguồn yêu cầu nghiệp vụ tổng hợp là [docs/business/BUSINESS_REQUIREMENTS.md](docs/business/BUSINESS_REQUIREMENTS.md).
   Với P01 Users/Auth, nguồn thiết kế đã duyệt là [docs/backend/BACKEND_PART1_AUTH.md](docs/backend/BACKEND_PART1_AUTH.md).
3. Kiểm tra thay đổi đang có bằng `git status`; không ghi đè thay đổi không thuộc task.

## Quy tắc triển khai

- Giữ kiến trúc Modular Monolith và ranh giới `Controller → Service → Repository → Prisma → PostgreSQL`.
- Không tự ý đổi kiến trúc, ORM, stack hoặc quy tắc nghiệp vụ đã được chốt.
- Không tự động chuyển sang task, PART hoặc Sprint tiếp theo khi chưa có yêu cầu/duyệt rõ ràng.
- Không sửa frontend do người khác phát triển nếu task không yêu cầu.
- Không lưu secret, Neon connection string thật hoặc dữ liệu nhạy cảm vào Git, log hay Markdown.
- Không tự commit, push hoặc merge.
- Không chạy migration, reset, `db push`, drop schema/bảng hay thao tác dữ liệu phá hủy nếu không được yêu cầu rõ ràng.

## Sau mỗi task

1. Chạy kiểm tra phù hợp với loại thay đổi.
2. Báo cáo trung thực từng mục là `PASS`, `FAIL`, `BLOCKED` hoặc `NOT RUN`.
3. Cập nhật [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) và tài liệu PART/Sprint liên quan khi task làm thay đổi trạng thái dự án.
4. Ghi rõ khác biệt giữa code, migration và tài liệu nếu có; không suy diễn phần chưa được kiểm chứng.
