# Báo cáo Giai đoạn 5B2-A — Xử lý blocker trước local cutover

Thời điểm: 2026-11-15 (Asia/Bangkok)

Phạm vi đã thực hiện: bổ sung khóa ghi nghiệp vụ trong mã nguồn, kiểm thử trên môi trường cô lập và chuẩn bị kế hoạch DBA break-glass. Không chạy init-file, không restart MySQL 3310, không tạo/sửa account MySQL, không đổi `.env` vận hành và không cutover.

## 1. Kết luận

- Blocker khóa ghi runtime: đã xử lý trong mã nguồn và vượt qua kiểm thử cô lập.
- Blocker DBA break-glass: đã có kế hoạch chi tiết nhưng chưa thực thi, đúng điểm dừng bắt buộc.
- Trạng thái cutover: vẫn **NO-GO** cho đến khi chủ máy phê duyệt riêng quy trình init-file và kết quả kiểm chứng DBA đạt.

## 2. Cấu hình khóa ghi

Biến cấu hình mới:

```text
BUSINESS_WRITES_ENABLED=false
```

- Cấu hình nằm tại `config/business.php`.
- Mặc định fail-closed: thiếu biến hoặc giá trị khác boolean `true` đều khóa ghi.
- `.env.example` ghi rõ giá trị an toàn `false`.
- Không thêm biến này vào `.env` vận hành trong 5B2-A; vì biến đang thiếu nên effective value hiện là `false`.
- Không có API hoặc frontend nào có thể thay đổi giá trị runtime.
- Kiểm tra config cache: sau `config:cache`, `business.writes_enabled=false`; cache thử nghiệm đã được `config:clear` ngay sau kiểm tra.

Khi bị chặn:

- GraphQL extension code: `BUSINESS_WRITES_LOCKED`.
- REST status: HTTP 423, code `BUSINESS_WRITES_LOCKED`.
- Guard chạy trước resolver/controller/service side effect.

## 3. GraphQL mutations được bảo vệ

Schema có 50 root mutations. `login` là mutation xác thực duy nhất được phép khi khóa; 49 mutation còn lại bị chặn fail-closed bằng global Lighthouse field middleware. Guard dựa trên root schema field đã parse, không đọc chuỗi request, nên alias, variables, `operationName` và batch request không bypass được.

### Khách hàng và nhân viên

- `createCustomer`, `updateCustomer`, `deleteCustomer`
- `createCustomerAddress`, `updateCustomerAddress`, `setDefaultCustomerAddress`
- `createEmployee`, `updateEmployee`, `deleteEmployee`

### Đơn hàng

- `createOrder`, `updateOrder`, `confirmOrderDepositPayment`, `deleteOrder`
- `mockReceiveAtGuangzhouWarehouse`, `createPackagesByShop`

### Kho Trung Quốc

- `createCnPackage`, `updateCnPackage`, `confirmCnPackageItems`, `deleteCnPackage`
- `addPackagesToCnBatch`, `updateCnBatch`, `deleteCnBatch`, `dispatchCnBatch`
- `createVietnamInboundTask`

### Kho Việt Nam

- `startVietnamWarehouseReceipt`, `scanVietnamPackage`
- `inspectVietnamPackageItems`
- `resolveVietnamReceiptDiscrepancy`, `resolveVietnamPackageDiscrepancy`
- `updateVietnamPackageError`, `removeVietnamPackage`
- `moveVietnamWarehouseReceiptToErrorQueue`, `confirmVietnamWarehouseReceipt`

### Thanh toán và hóa đơn

- `createPaymentVoucher`, `createDepositPaymentVoucher`, `cancelPaymentVoucher`
- `confirmPaymentTransaction`, `issuePaymentVoucherInvoice`

### Bảng phí, tỷ giá và vận chuyển

- `createShippingRate`, `updateShippingRate`, `deactivateShippingRate`
- `createShippingRateDetail`, `updateShippingRateDetail`, `deleteShippingRateDetail`
- `createExchangeRate`, `activateExchangeRate`, `deactivateExchangeRate`
- `createShippingTask`, `updateShippingTaskStatus`

Tất cả GraphQL queries chỉ đọc vẫn hoạt động.

## 4. REST, service, CLI và background paths

### REST

Hai endpoint ghi ảnh đối soát kho Việt Nam được bảo vệ ở cả route middleware và controller:

- `POST /api/vietnam-warehouse/packages/{vnPackage}/evidences`
- `DELETE /api/vietnam-warehouse/packages/{vnPackage}/evidences/{evidence}`

Các route Customer Authentication không dùng middleware khóa nghiệp vụ vì chúng phải tiếp tục phục vụ đăng ký, xác minh email, login, logout, reset/change password và session restoration.

### Service layer

Guard được đặt trước mọi side effect trong các service hiện có:

- `PaymentVoucherService`: tạo phiếu cọc/phiếu thanh toán, xác nhận cọc/giao dịch, hủy phiếu, phát hành hóa đơn, tính lại trạng thái phiếu.
- `OrderPricingService`: tạo/kích hoạt/vô hiệu tỷ giá, khóa tỷ giá đơn, tính lại item/tổng đơn.
- `ShippingRateService`: tạo/sửa/vô hiệu bảng phí và CRUD chi tiết phí.
- `ShippingTaskService`: tạo nhiệm vụ xuất và cập nhật trạng thái.
- `DeliveryRequestService`: tạo yêu cầu giao, snapshot địa chỉ, cập nhật trạng thái thanh toán/giao và gắn shipping task.
- `ShipmentService`: tạo shipment/tracking event.
- `VietnamWarehouseReceiptService`: toàn bộ nhận/scan/inspect/resolve/remove/confirm workflow.
- `CustomerAddressService`: create/update/set-default địa chỉ dùng cho nghiệp vụ thanh toán.
- `GhnClient::createOrder`: chặn external carrier side effect.

Các resolver đang ghi trực tiếp (`OrderResolver`, `CnPackageResolver`, `CnBatchResolver`, `CustomerResolver`, `EmployeeResolver`) có guard riêng ngoài global GraphQL middleware.

### CLI và background

- `orders:backfill-currency --apply` bị guard; chế độ dry-run vẫn dùng được.
- `db:seed` hiện bị Database Safety Guard từ chối trên database không phải test, cùng với `db:wipe`, `migrate:fresh`, `migrate:refresh`, `migrate:reset`.
- Không có business Job class trong `app/Jobs`, không có business listener tự discovery và scheduler hiện không lên lịch command nghiệp vụ.
- Queued work gọi service đã được kiểm thử và bị service guard chặn.

## 5. Chức năng được giữ lại

Không bị BusinessWriteGuard chặn:

- Admin login và token creation của mutation `login`.
- Customer register, email verification/resend, login, logout, forgot/reset/change password.
- `CustomerMe`, session restoration và CSRF flow.
- GraphQL queries/read-only services.

Permission Customer/Admin vẫn do guard và middleware xác thực hiện hữu xử lý; BusinessWriteGuard không thay đổi principal hoặc nâng quyền.

## 6. Kết quả kiểm thử

Không test nào dùng MySQL 3310.

- Guard + toàn bộ Unit suite: **50 tests, 201 assertions, PASS**.
- Customer Authentication trên SQLite `:memory:` với `BUSINESS_WRITES_ENABLED=false`: **9 tests, 34 assertions, PASS**.
- PHP syntax trên app/config/tests: PASS.
- Pint trên đúng các file đã thay đổi: PASS.
- `git diff --check`: PASS, chỉ còn cảnh báo line-ending từ các thay đổi đã tồn tại.

Các tình huống đã kiểm chứng:

1. `false` chặn write và thiếu config cũng chặn.
2. Chỉ literal boolean `true` mới mở khóa.
3. GraphQL alias, variables, `operationName` và batch không bypass.
4. REST bị chặn trước controller side effect.
5. Gọi service nội bộ bị chặn trước database access.
6. Queued job gọi service không bypass.
7. Admin và Customer identity không bypass.
8. GraphQL query read-only vẫn chạy.
9. Customer Authentication vẫn chạy khi khóa nghiệp vụ đang bật.
10. Config cache/reload giữ effective value `false`.

## 7. Write paths chưa được bao phủ

Không phát hiện write path nghiệp vụ hiện tại nào chưa có boundary hoặc service guard.

Rủi ro còn lại thuộc về mã mới trong tương lai: một CLI/job/REST controller mới ghi trực tiếp bằng Eloquent hoặc query builder mà không gọi service được guard có thể bỏ qua lớp service. Quy ước bắt buộc cho thay đổi tương lai:

- mọi GraphQL root mutation tự động bị global middleware chặn;
- mọi REST write route mới phải dùng `business.writes`;
- mọi service/job/CLI mới có side effect phải gọi `BusinessWriteGuard::assertEnabled()` trước side effect;
- thêm regression test tương ứng trước khi merge.

## 8. Trạng thái MySQL 3310 sau thay đổi mã nguồn

- Service: `VietTrungMySQL84`, Running, Automatic/Delayed.
- Port: 3310.
- Datadir: `C:\ProgramData\VietTrungOrder\MySQL\8.4\data\`.
- UUID: `38314517-e061-11f1-9329-b44506abce66`.
- Exact base tables/rows: 45/601.
- Active binlog cuối trên đĩa vẫn là `binlog.000007`, 419.446 bytes, mtime `2026-11-15 02:46:17 +07:00`.
- Không restart service, không ghi dữ liệu 3310 và không đổi account.
- `viettrung_migrator` vẫn chỉ có quyền theo ba schema đã chuẩn bị; không có global account-management hoặc `REPLICATION CLIENT`.

Correction từ kiểm chứng DBA ở 5B2-B: `root@localhost` thực tế dùng `caching_sha2_password` và `account_locked=N`. Binlog đặt thay đổi plugin tại `binlog.000003` position 237 lúc `2026-11-15T02:31:26+07:00`, trước 5B2-B; 5B2-B không có event root. Root cũ vẫn không được dùng cho ứng dụng và chưa bị sửa trong 5B2-A/B.

## 9. Thiết kế DBA break-glass đề xuất

### Tài khoản 1 — DBA khẩn cấp

- User đề xuất: `viettrung_dba@127.0.0.1`.
- Plugin: `caching_sha2_password`.
- `REQUIRE SSL`.
- Chỉ kết nối TCP localhost; server vẫn bind `127.0.0.1`.
- Không dùng cho Laravel, frontend, extension, backup task hoặc hoạt động hằng ngày.
- Quyền dự kiến: `ALL PRIVILEGES ON *.* WITH GRANT OPTION` cộng các dynamic privileges cần cho bảo trì MySQL 8.4: `SYSTEM_USER`, `SYSTEM_VARIABLES_ADMIN`, `PERSIST_RO_VARIABLES_ADMIN`, `CONNECTION_ADMIN`, `BACKUP_ADMIN`.
- Không thay đổi hoặc mở khóa root cũ.

### Tài khoản 2 — binlog observer tối thiểu

- User đề xuất: `viettrung_binlog_reader@127.0.0.1`.
- Plugin: `caching_sha2_password`, `REQUIRE SSL`.
- Chỉ quyền global `REPLICATION CLIENT`.
- Mục đích duy nhất: `SHOW BINARY LOG STATUS`/quan sát trạng thái replication-binlog.
- Không quyền đọc dữ liệu nghiệp vụ, DDL, DML, account-management hoặc grant option.

Việc tách account quan sát binlog tránh dùng DBA thường xuyên chỉ để lấy file/position.

## 10. Kế hoạch init-file và restart — chưa thực thi

Điều kiện bắt đầu: phải có phê duyệt riêng của chủ máy.

1. Xác minh lại backup mới nhất, SHA-256, restore drill, 45/601/86/0 và service Running.
2. Ghi checksum/copy rollback của `my.ini`; ghi trạng thái service, UUID, datadir và active binlog trên đĩa.
3. Sinh hai bootstrap password ngẫu nhiên bằng CSPRNG, tối thiểu 32 bytes; không in console.
4. Tạo init-file tên ngẫu nhiên dưới thư mục secrets. ACL tạm chỉ Administrators, SYSTEM, operator và Read cho `NT SERVICE\VietTrungMySQL84`.
5. Init-file chỉ chứa câu lệnh một dòng hợp lệ MySQL 8.4 để tạo hai account localhost với `caching_sha2_password`, `REQUIRE SSL`, sau đó cấp đúng quyền ở mục 9. Không chứa lệnh sửa root hoặc dữ liệu.
6. Thêm đúng một `init-file=<absolute-path>` vào config 3310; xác minh không trỏ 3306/3308/3309.
7. Stop service sạch, start `VietTrungMySQL84`, chờ ready trên 3310. Không dùng `--skip-grant-tables`.
8. Nếu start thất bại: dừng service, khôi phục config rollback, xóa startup reference, start cấu hình cũ và dừng điều tra; không đụng datadir.
9. Nếu start đạt: kiểm tra account/plugin/host/TLS bằng bootstrap credential, rồi loại bỏ ngay `init-file` reference và xóa file tạm.
10. Dùng kết nối TLS localhost để đổi cả hai bootstrap password sang final random passwords mới. Như vậy password cuối không từng nằm trong init-file.
11. Lưu final credentials bằng DPAPI, kiểm tra ACL, xóa bootstrap material khỏi bộ nhớ và filesystem.
12. Restart service lần hai với config không còn init-file; xác minh file/reference không còn và không thể chạy lại.
13. Xác minh DBA login/TLS/plugin, binlog reader chạy được `SHOW BINARY LOG STATUS`, app user không có DROP/ALTER, test runner vẫn bị từ chối.
14. Lặp lại 45/601/86/0 và exact key counts; xác minh customers/users/orders/payments không đổi.
15. Ghi báo cáo, nhưng vẫn không cutover nếu chưa có phê duyệt 5B2 tiếp theo.

## 11. Bảo vệ credentials

- Bootstrap passwords: chỉ tồn tại trong process memory và init-file ACL nghiêm ngặt; không ghi transcript, command line, Git hoặc báo cáo.
- Final passwords: sinh mới sau khi init-file đã bị loại bỏ.
- Lưu DPAPI LocalMachine trong `C:\ProgramData\VietTrungOrder\MySQL\8.4\secrets\`, với ACL chỉ operator, Administrators và SYSTEM; không cấp service MySQL hoặc Users.
- Tách file DBA và binlog reader; manifest chỉ ghi user/host/plugin/thời điểm rotate, không ghi plaintext.
- Có bản recovery copy được mã hóa và niêm phong ngoài repository; kiểm thử đăng nhập break-glass định kỳ, sau đó rotate theo quy trình hai người kiểm soát.
- Không dùng `MYSQL_PWD` ngoài process validation ngắn hạn; luôn xóa environment variable trong `finally`.

## 12. Blocker và điều kiện tiếp tục cutover

Blocker runtime write đã giải quyết. Blocker còn lại duy nhất trước khi trở lại 5B2 là thực thi và kiểm chứng DBA/binlog reader theo kế hoạch trên.

Điều kiện để tiếp tục local cutover:

1. Chủ máy phê duyệt riêng việc chạy init-file và hai lần restart service.
2. DBA và binlog reader đạt plugin/host/TLS/grant checks.
3. Lấy được authoritative `SHOW BINARY LOG STATUS`.
4. MySQL 3310 vẫn đạt 45/601/86/0 sau restart.
5. `BUSINESS_WRITES_ENABLED` effective `false` sau config cache.
6. Có backup `.env` ngoài Git trước khi đổi DB endpoint.
7. Chỉ sau đó mới đổi Laravel sang `viettrung_app@127.0.0.1:3310`; không đổi `APP_KEY`.

## 13. Kiểm soát thay đổi

- Không chạy init-file, không tạo/sửa DBA/root và không restart MySQL 3310.
- Không sửa `.env` vận hành, APP_KEY hoặc DB endpoint.
- Không chạy test trên MySQL 3310.
- Không sửa dữ liệu 3306/3308/3309 hoặc backup cứu hộ.
- Không thu hồi 19 tokens.
- Không commit hoặc push.

**Dừng tại đây, chờ phê duyệt riêng để thực thi init-file.**
