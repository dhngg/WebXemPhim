# P04 — Đề xuất Trợ lý tìm trọ thông minh

**Trạng thái:** PRODUCT FEATURE PROPOSAL — CHƯA TRIỂN KHAI; CHƯA CHỐT TOÀN BỘ CHI TIẾT  
**Vị trí đề xuất:** P04 Marketplace  
**Nguyên tắc:** lọc và xếp hạng có thể giải thích; không cần LLM hoặc machine learning trong V1.0

## 1. Mục tiêu

Giúp người tìm trọ chọn listing phù hợp với ngân sách, địa điểm học/làm, thời gian di chuyển, phương tiện và tiện ích bắt buộc.

Ví dụ minh họa: ngân sách tối đa 3.000.000 đồng/tháng, đích đến là Đại học Bách khoa Hà Nội, tối đa 20 phút bằng xe máy, bắt buộc có điều hòa và chỗ để xe. Đây là dữ liệu ví dụ, không phải phòng thật.

## 2. Luồng người dùng đề xuất

1. Chọn “Tìm trọ thông minh”.
2. Nhập/chọn địa điểm đích.
3. Chọn ngân sách tối đa.
4. Chọn budget mode: giá thuê riêng hoặc tổng chi phí dự kiến.
5. Chọn phương tiện và thời gian di chuyển tối đa.
6. Chọn tiện ích bắt buộc.
7. Xem kết quả xếp hạng, bản đồ và lý do phù hợp.
8. Mở chi tiết listing hoặc gửi yêu cầu xem phòng.

Nếu không có kết quả, hệ thống cho người dùng chủ động nới điều kiện và không âm thầm bỏ qua tiêu chí bắt buộc.

## 3. Logic tìm kiếm đề xuất

### 3.1. Hard filters

- Listing hợp lệ và được phép công khai.
- Phòng còn có thể cho thuê.
- Giá nằm trong ngân sách theo budget mode.
- Đủ mọi tiện ích bắt buộc.
- Thời gian di chuyển theo tuyến hợp lệ không vượt giới hạn.

Nếu không tính được tuyến đường, kết quả phải ghi trạng thái thiếu dữ liệu và không khẳng định listing đạt giới hạn thời gian.

### 3.2. Ranking

Trọng số khởi điểm để Product Owner review:

| Tiêu chí                | Trọng số đề xuất |
| ----------------------- | ---------------: |
| Thời gian di chuyển     |               40 |
| Giá so với ngân sách    |               30 |
| Mức độ đầy đủ thông tin |               15 |
| Độ mới listing          |               10 |
| Tiện ích cộng thêm      |                5 |

Tổng điểm là 100. Trọng số chưa phải công thức cuối cùng đã duyệt. Mỗi kết quả phải giải thích dữ liệu nào đóng góp vào điểm.

Không dùng listing tài trợ để âm thầm tăng match score. Nếu có quảng cáo sau này, thứ tự hoặc vị trí tài trợ phải có nhãn rõ ràng và tách khỏi điểm phù hợp.

## 4. Dữ liệu cần thiết

- Room: giá, trạng thái, ảnh, diện tích và tiện ích.
- Building/khu trọ: địa chỉ và tọa độ.
- Listing: trạng thái công khai và thời điểm cập nhật.
- Amenity: điều hòa, hỗ trợ chỗ để xe và tiện ích khác.
- Service/rate công khai: phí cố định/biến động nếu dùng tổng chi phí.
- Geocoding/place search: xác định địa điểm đích.
- Routing: khoảng cách và thời gian theo travel mode được hỗ trợ.

Phải phân biệt:

- Khoảng cách đường thẳng.
- Khoảng cách theo đường đi.
- Thời gian di chuyển dự kiến.

Không ghi travel mode là “xe máy” nếu provider chưa được chọn hoặc provider không hỗ trợ mode tương ứng.

## 5. Tổng chi phí dự kiến

Hai budget mode đang được xem xét:

1. Giá thuê phòng riêng.
2. Tổng chi phí ước tính gồm tiền thuê, điện, nước, Wifi, xe và dịch vụ.

Khoản biến động phải nêu giả định, nguồn giá và thời điểm áp dụng. Không dùng chỉ số tiêu thụ hoặc hóa đơn riêng tư của tenant khác.

**Quyết định còn mở:** mặc định ngân sách là giá thuê riêng hay tổng chi phí dự kiến.

## 6. API design proposal

Endpoint có thể xem xét:

**POST /api/v1/listings/recommendations**

Input dự kiến:

- destination hoặc place identifier;
- maximum budget;
- budget mode;
- travel mode;
- maximum travel minutes;
- required amenity IDs;
- pagination.

Output dự kiến:

- listing công khai hợp lệ;
- giá và khoản phí công khai;
- distance/travel time nếu tính được;
- match score;
- lý do đề xuất;
- trạng thái thiếu dữ liệu;
- pagination metadata.

Đây là **API DESIGN PROPOSAL**, chưa được phê duyệt contract và chưa triển khai.

## 7. Hiệu năng, chi phí và privacy

- Lọc ứng viên trong database trước khi gọi routing.
- Giới hạn số ứng viên cần routing; không tính tuyến cho hàng nghìn phòng mỗi request.
- Cache kết quả routing theo cặp điểm, travel mode và thời hạn phù hợp.
- Kiểm soát quota, timeout và chi phí provider.
- Có fallback rõ khi geocoding/routing lỗi.
- Không lưu lịch sử vị trí nhạy cảm nếu chưa có mục đích, consent, retention và chính sách bảo vệ dữ liệu.

## 8. Phân rã P04 đề xuất

- **P04-A:** listing/search/filter/map cơ bản.
- **P04-B:** Smart rental recommendations.
- **P04-C:** kiểm thử ranking, routing, thiếu dữ liệu, privacy và hiệu năng.

Việc phân rã này không đổi thứ tự P00–P13 và không tự bắt đầu P04.

## 9. Có thể hoãn

- Lưu bộ lọc tìm trọ.
- Thông báo khi có listing phù hợp mới.
- Cá nhân hóa theo lịch sử.
- Chatbot AI.

## 10. Quyết định còn chờ Product Owner

1. Phê duyệt Smart Rental Assistant vào phạm vi triển khai V1.0/P04.
2. Budget mode mặc định.
3. Trọng số ranking cuối cùng và tie-break rules.
4. Nhà cung cấp geocoding/routing, travel modes, quota và chi phí.
5. Quy tắc ước tính điện/nước/dịch vụ công khai.
6. Chính sách lưu destination/search history.

Không xem tài liệu này là lệnh triển khai.
