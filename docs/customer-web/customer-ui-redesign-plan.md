# Customer Web purchase UI redesign

## Vấn đề trước redesign

- Bốn màn hình mua hộ dùng đúng API nhưng mật độ thông tin thấp và chưa tạo được hierarchy rõ ràng.
- Nút thêm vào giỏ chưa phải CTA chính dù giỏ Laravel đã tồn tại.
- Giỏ hàng thiếu panel tổng hợp, ghi chú trực tiếp và thông tin SKU rõ ràng.
- Danh sách đơn thiếu ảnh đại diện, thống kê, phân trang trực quan và bố cục responsive chuyên biệt.
- Sidebar có khoảng cách dọc lớn, làm các nhóm menu bị loãng.

## Mục tiêu

Thiết kế bốn màn hình theo cùng một hệ thống VietTrung Order: nền sáng, màu cam thương hiệu, card bo góc nhẹ, typography rõ, sidebar compact và CTA nhất quán. Ảnh demo chỉ được dùng làm tham chiếu bố cục; mọi dữ liệu hiển thị phải đến từ Customer API, Customer Extension hoặc trường người dùng nhập.

## Quyết định theo màn hình

### Tạo yêu cầu mua hộ

- Link sản phẩm là khối đầu tiên và vẫn tự gọi Customer Extension sau khi dán URL hợp lệ.
- Product Preview dùng ảnh lớn, thumbnail phụ, badge nguồn dữ liệu và giá tham khảo.
- SKU tiếp tục dùng `ProductVariantSelector`; không tạo tổ hợp hoặc tồn kho giả.
- Chia form thành phần chọn phân loại và thông tin mua hàng.
- `THÊM VÀO GIỎ HÀNG` gọi trực tiếp API cart Laravel và cập nhật badge sidebar bằng kết quả API.
- Danh sách đang soạn, lưu bản nháp và gửi yêu cầu vẫn được giữ như luồng bổ sung.

### Giỏ hàng & bản nháp

- Mỗi item hiển thị ảnh, nguồn, link, phân loại, SKU nguồn, số lượng, ghi chú và thành tiền tham khảo.
- Số lượng, ghi chú và xóa item đều gọi API Laravel hiện có.
- Dòng `SKU nguồn` được bảo toàn riêng khi khách sửa ghi chú.
- Panel bên phải tính tổng trực tiếp từ cart API và dùng các action lưu bản nháp/gửi yêu cầu hiện có.
- Không tạo cart state song song trong frontend.

### Đơn hàng mua hộ

- Card thống kê dùng `pagination.total` và các đơn của trang hiện tại; nhãn ghi rõ khi số liệu chỉ thuộc trang.
- Bảng hiển thị ảnh và sản phẩm đầu tiên, số mặt hàng, tổng số lượng, tổng CNY/VND, trạng thái, cập nhật và action chi tiết.
- Search, status filter, page size và pagination gọi `getCustomerOrders`.

### Lịch sử đơn hàng

- Tập trung tra cứu theo thời gian và trạng thái thay vì lặp lại mục đích “đơn đang xử lý”.
- Không hiển thị trạng thái thanh toán vì API danh sách hiện chưa cung cấp dữ liệu xác minh tương ứng.
- Dùng cùng table system để giữ tính nhất quán.

### Sidebar

- Giảm chiều rộng, padding, khoảng cách nhóm và chiều cao item.
- Active state vẫn dùng màu cam thương hiệu.
- Badge giỏ hàng lấy từ workspace API và cập nhật sau khi thêm/xóa item.
- Tablet/mobile tiếp tục dùng drawer và bottom navigation hiện có.

## Luồng thêm vào giỏ

1. Khách dán URL Taobao/Tmall/1688.
2. Customer Extension trả Product Contract; metadata API là fallback.
3. Khách chọn tổ hợp SKU đã xác minh, số lượng và ghi chú.
4. Nút `THÊM VÀO GIỎ HÀNG` gọi `POST customer-portal/cart/items`.
5. Badge sidebar nhận số item từ response cart thật.
6. Trang giỏ gọi workspace API, cho cập nhật/xóa/lưu draft/gửi yêu cầu.
7. Chỉ khi khách xác nhận gửi, Laravel mới tạo đơn.

## Trạng thái dữ liệu sản phẩm

- `loading`: skeleton và thông báo Extension đang đọc trang.
- `success`: hiển thị dữ liệu tham khảo và SKU đã xác minh.
- `partial`: hiển thị phần có thật và cảnh báo trường còn thiếu.
- `unavailable/error`: metadata fallback, nhập thủ công hoặc Product Lookup Queue.
- Không hiển thị giá, tồn kho hoặc trạng thái thanh toán không có nguồn xác minh.

## File chính đã sửa

- `customer-web/src/pages/customer/RealPurchasePages.jsx`
- `customer-web/src/components/customer/CustomerPortalLayout.jsx`
- `customer-web/src/components/customer/PortalComponents.jsx`
- `customer-web/src/components/customer/CustomerPortal.module.css`
- `customer-web/src/components/customer/CustomerPortalFeatures.module.css`
- `customer-web/src/pages/customer/CustomerPortalPage.jsx`

## Checklist QA

- [ ] Dán link tự động gọi Customer Extension.
- [ ] Preview hiển thị title, ảnh, giá và trạng thái partial/error đúng.
- [ ] Chọn SKU cập nhật giá/ảnh và không tạo tổ hợp giả.
- [ ] Thêm vào giỏ gọi API thật và badge sidebar tăng.
- [ ] Cart sửa quantity/note, xóa item, lưu draft và submit được.
- [ ] Orders/history dùng dữ liệu API, filter và pagination hoạt động.
- [ ] Loading, empty và error state hiển thị tốt.
- [ ] Kiểm tra desktop, tablet và mobile.
- [ ] Chạy Customer Web test, lint và build.
- [ ] Không có Chrome Worker/server scraping trong luồng.

## Kết quả QA trực quan

- Đã render bằng Chrome headless ở desktop 1440 × 1000 và viewport hẹp 500 × 900.
- Payload trong ảnh là fixture QA có cùng cấu trúc API và được gắn nhãn rõ; không được đóng gói vào Customer Web.
- Đã sửa bảng đơn hàng để không hiện scrollbar ngang ở desktop; tablet/mobile vẫn giữ overflow khi cần.
- Đã xác nhận page heading, link panel và cart item wrap đúng ở viewport hẹp.
- Ảnh desktop: `screenshots/create-desktop.png`, `screenshots/cart-desktop.png`, `screenshots/orders-desktop.png`, `screenshots/history-desktop.png`.
- Ảnh viewport hẹp: `screenshots/create-mobile.png`, `screenshots/cart-mobile.png`.

Laravel feature test chưa chạy được trong workspace hiện tại vì `logistics-backend/vendor/autoload.php` chưa tồn tại. Không cài dependency hoặc ghi database để tránh mở rộng phạm vi ngoài yêu cầu.
