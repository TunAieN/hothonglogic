# VietTrung Order — kích hoạt business writes có kiểm soát

Thời điểm thực hiện: 2026-11-15, múi giờ Asia/Bangkok.

## Kết luận

- Laravel local đã bật `BUSINESS_WRITES_ENABLED=true` trên đúng MySQL `127.0.0.1:3310/logistics_system` bằng `viettrung_app`.
- Do kiểm toán dữ liệu tài chính hiện hữu trả FAIL, các thao tác phiếu thanh toán, đặt cọc, xác nhận giao dịch và phát hành hóa đơn vẫn bị khóa riêng bằng `FINANCIAL_WRITES_ENABLED=false`.
- Không có mutation hoặc DML thử nghiệm nào được gửi tới production. Binlog trước/sau giữ nguyên `binlog.000010:527`.
- Dữ liệu production giữ nguyên 45 bảng, 602 dòng, 86 foreign keys và 0 orphan.
- Backend và Admin Panel chỉ listen trên loopback tại `127.0.0.1:8000` và `127.0.0.1:5173`.

## Backup và restore drill

- Backup: `E:\MySQL_VietTrung_Backups\manual\pre-business-writes\logistics_system_prewrite_20261115_220717.sql`
- Kích thước: 417,147 bytes.
- SHA-256: `872FA35042533DC0E522BCBB7CA823405FB24E8AA6CE79F08C68182B217F0873`.
- SHA-256 khớp file sidecar và JSON manifest.
- Restore drill được thực hiện chỉ trên MySQL QA 3311, database `logistics_system_test`.
- Restore đạt: 45 bảng, 602 dòng, 86 foreign keys, 0 orphan; customers 10, orders 37, payment vouchers 21, transactions 18, invoices 13, tokens 20.
- Sau restore drill, QA database được `migrate:fresh` trên đúng port 3311 và dùng lại cho PHPUnit. Production 3310 không được import, replay hoặc migrate.

## Tiền kiểm production

- MySQL 8.4.3.
- UUID: `38314517-e061-11f1-9329-b44506abce66`.
- Datadir: `C:\ProgramData\VietTrungOrder\MySQL\8.4\data\`.
- `log_bin=ON`, `binlog_format=ROW`, `binlog_row_image=FULL`.
- Không có InnoDB transaction mở tại hai lần kiểm tra.
- `viettrung_app@127.0.0.1`: account hoạt động, `caching_sha2_password`; có SELECT, INSERT, UPDATE, DELETE trên `logistics_system.*`, không có DDL/server-admin grants.
- DatabaseSafetyGuard unit tests: 8/8 PASS.
- Kiểm tra trực tiếp guard với production tuple xác nhận `db:seed`, `db:wipe`, `migrate:fresh`, `migrate:refresh`, `migrate:reset` đều BLOCKED; không chạy các lệnh đó trên production.

## QA write regression

- Full suite trước thay đổi guard: 168 tests, 917 assertions, 10 skip có chủ đích — PASS sau khi làm sạch QA.
- Targeted guard suite sau thay đổi: 14 tests, 27 assertions — PASS.
- Full suite cuối: 171 tests, 922 assertions, 10 skip có chủ đích — PASS.
- PHPUnit bị khóa cứng vào `127.0.0.1:3311/logistics_system_test`, UUID QA `dc11088a-e0b4-11f1-8f5d-b44506abce66`.

## Runtime Laravel

- Environment: `local`; debug: `false`.
- DB: `127.0.0.1:3310/logistics_system`.
- DB user: `viettrung_app@127.0.0.1`.
- `BUSINESS_WRITES_ENABLED=true`.
- `FINANCIAL_WRITES_ENABLED=false`.
- APP_KEY SHA-256 giữ nguyên: `811bdb49a29649380226b9802f0584e5e52a4617679d62db659a633736ae9ee2`.
- Snapshot `.env` trước thay đổi được lưu bằng DPAPI CurrentUser tại `C:\ProgramData\VietTrungOrder\Laravel\rollback\pre-business-writes-20261115_221754` với ACL chỉ operator, Administrators và SYSTEM.
- Laravel config cache đã clear/rebuild thành công.

## Chức năng ghi được mở

- Khách hàng và địa chỉ khách hàng.
- Nhân viên theo RBAC hiện hữu.
- Tạo/sửa/xóa đơn hàng, ngoại trừ transition tạo yêu cầu đặt cọc vì đi qua financial service.
- Chi tiết đơn và tracking.
- Kiện Trung Quốc, lô Trung Quốc và workflow kho Trung Quốc.
- Nhập kho Việt Nam, kiểm hàng, discrepancy workflow, evidence và xuất kho.
- Shipping tasks và trạng thái giao vận.
- Bảng phí vận chuyển và chi tiết bảng phí.
- Tỷ giá.
- REST workflow kho hiện hữu.

Phân quyền Admin/Customer, GraphQL directives và service guards vẫn được giữ nguyên.

## Chức năng còn khóa

Các service sau trả `FINANCIAL_WRITES_LOCKED` trước DML:

- Tạo phiếu thanh toán.
- Tạo phiếu đặt cọc.
- Xác nhận đặt cọc.
- Xác nhận giao dịch thanh toán.
- Hủy phiếu thanh toán.
- Phát hành hóa đơn.
- Recalculate trạng thái phiếu thanh toán.
- Transition đơn hàng sang `awaiting_deposit` nếu cần tạo phiếu đặt cọc.

Các màn hình/query phiếu thanh toán và hóa đơn vẫn đọc được.

## Lý do khóa tài chính

`php artisan payments:audit --verbose` trên production chỉ đọc trả FAIL:

- 21 vouchers checked.
- 3 subtotal mismatches.
- 2 invalid item references.
- 0 payment mismatches.
- 0 remaining mismatches.
- 0 orphan voucher items.
- 0 orphan transactions.
- 0 invalid invoice links.
- 0 invalid customer/order links.
- 0 invalid bank snapshots.
- 0 invalid status invariants.

Các ngoại lệ lịch sử khác giữ nguyên: 6 order CNY mismatch, 3 invoice VND mismatch và 1 unmatched CN package. Không sửa tiền, trạng thái hoặc liên kết.

## Smoke test và log

- Laravel `/health`: HTTP 200, `{"status":"ok"}`.
- Admin login page: HTTP 200.
- GraphQL read-only probe: HTTP 200, `Query`.
- Lighthouse schema validation: PASS.
- Admin TypeScript/Vite build: PASS.
- Laravel runtime stderr: 0 bytes.
- Admin runtime stderr: 0 bytes.
- Laravel application log không có entry mới sau thời điểm cũ 13:00:30.
- MySQL error log không có entry mới; last write trước activation.

Không thực hiện real Admin login vì credential do chủ hệ thống tự nhập. Không tạo token, không tạo đơn/voucher/invoice giả và không gọi production mutation.

## Binlog và hậu kiểm

- Trước: `binlog.000010:527`.
- Sau: `binlog.000010:527`.
- Không có production write trong quá trình activation.
- Hậu kiểm: 45 tables, 602 rows, 86 FK, 0 orphan; customers 10, orders 37, vouchers 21, transactions 18, invoices 13, tokens 20.

## Rủi ro còn lại

- Token ID 210 từ lần Admin logout trước vẫn tồn tại; 19 token baseline không bị thay đổi.
- Logout production browser cần được chủ hệ thống kiểm tra lại sau lần đăng nhập tiếp theo.
- Token expiration vẫn `null` và token abilities hiện rộng.
- Config cache ACL vẫn kế thừa quyền Modify cho Authenticated Users; chưa harden để tránh khóa nhầm runtime.
- Dữ liệu tài chính chưa reconcile nên financial writes tiếp tục khóa.
- Chỉ phù hợp local single-user; chưa GO cho Internet/public operation.

Không commit/push.
