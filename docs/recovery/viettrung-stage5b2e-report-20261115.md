# Báo cáo Giai đoạn 5B2-E — Admin logout, cô lập QA và hậu kiểm MySQL 3310

Thời điểm hậu kiểm cuối: `2026-11-15T13:02:21+07:00`

Phạm vi: sửa Admin server-side logout; kiểm thử ghi chỉ trên MySQL QA 3311; cô lập cache/storage QA; rebuild runtime local; hậu kiểm production 3310 hoàn toàn read-only. Không đăng nhập Admin thật, không tạo hoặc thu hồi token production, không bật business writes, không rotate credential, không commit/push.

## Kết luận

- Admin logout đã thu hồi đúng Sanctum token dùng để xác thực request, không thu hồi token của phiên khác.
- Luồng logout đã vượt qua kiểm thử QA với `BUSINESS_WRITES_ENABLED=false`; token cũ bị từ chối, token phiên khác vẫn dùng được và Customer principal không thể thu hồi Admin token.
- QA và local dùng riêng config cache, services/packages/events cache, Lighthouse cache, storage, compiled views và session cookie. QA runner bị từ chối khi thử kết nối production 3310.
- Laravel local đang dùng config cache và kết nối đúng `127.0.0.1:3310/logistics_system`, đúng UUID/datadir, `APP_DEBUG=false`, business writes vẫn khóa.
- Production giữ nguyên snapshot `45/601/86/0`, các bảng trọng yếu và 19 token không đổi.
- Binlog marker vẫn `binlog.000009:1416`; không có event mới để phân tích.
- **GO có điều kiện** cho chủ hệ thống tự kiểm tra một lần Admin login thật trên localhost ở giai đoạn được phê duyệt riêng. Vẫn **NO-GO** cho Internet-facing, giao dịch tài chính và bật business writes.

## 1. Admin server-side logout

Backend có GraphQL mutation:

```graphql
logout: Boolean! @guard(with: ["api"])
```

`LogoutResolver` lấy principal từ guard `api`, lấy `currentAccessToken()` và chỉ xóa bản ghi `Laravel\Sanctum\PersonalAccessToken` đó. Request không có Bearer token hợp lệ bị từ chối. Không có lệnh xóa toàn bộ token của user hoặc toàn hệ thống.

`BusinessWriteDirective` chỉ miễn hai authentication mutations `login` và `logout`; 49 business mutations còn lại tiếp tục fail-closed khi business writes bị khóa. Việc thêm logout không mở bypass theo HTTP text, alias, variables, operation name hoặc batch.

Admin Panel gửi logout mutation bằng Bearer token hiện tại và chỉ xóa credential client sau khi server trả `logout=true`. Nếu mạng/server lỗi, provider trả `success=false` và giữ credential để không tuyên bố sai rằng token đã được thu hồi.

Chrome Extension áp dụng cùng nguyên tắc: gọi server trước, chỉ xóa session/token local sau xác nhận. Lỗi được hiển thị dạng thông báo chung; GraphQL client không gắn Authorization header vào exception.

## 2. Kết quả kiểm thử QA 3311

Tất cả thao tác tạo/xóa token trong test chỉ diễn ra trên `127.0.0.1:3311/logistics_system_test` bằng QA runner.

| Nhóm | Kết quả |
|---|---:|
| Admin logout tập trung | PASS — 4 tests, 28 assertions |
| Regression với business writes khóa | PASS — 27 tests, 143 assertions |
| Toàn bộ suite QA với writes chỉ bật trên 3311 | PASS — 168 tests, 917 assertions |
| SQLite-only skips có chủ đích | 10 |
| Admin Panel build | PASS |
| Customer Web build | PASS |
| Extension JavaScript syntax | PASS, 0 lỗi |

Các bằng chứng chức năng logout:

- Admin login QA tạo hai token độc lập.
- Token thứ nhất dùng được trước logout.
- Logout xóa đúng ID của token thứ nhất.
- Token thứ nhất bị từ chối ở request kế tiếp.
- Token thứ hai còn tồn tại và vẫn dùng được.
- Customer principal không thể xóa Admin token.
- Admin thiếu permission không thể đọc employee data.
- Logout hoạt động khi `BUSINESS_WRITES_ENABLED=false`.

Customer Authentication register/login/me/logout/verify/reset và permission isolation tiếp tục PASS trong regression/full suite. Production không chạy các flow này.

## 3. Cô lập QA và local

QA được buộc bằng PHPUnit và `.env.testing` vào:

- database `127.0.0.1:3311/logistics_system_test`;
- `bootstrap/cache/config.qa.php`;
- `services.qa.php`, `packages.qa.php`, `events.qa.php`;
- `bootstrap/cache/lighthouse-schema.qa.php`, đồng thời tắt Lighthouse schema cache trong test;
- `storage/qa` và `storage/qa/framework/views`;
- cookie `viettrung_qa_session`;
- QA runner `viettrung_qa_runner`.

Runtime proof của QA xác nhận port 3311, đúng QA UUID `dc11088a-e0b4-11f1-8f5d-b44506abce66`, database test, storage/cookie riêng. `config.qa.php` đã được clear sau proof; `services.qa.php` và `packages.qa.php` còn tồn tại nhưng là file QA riêng, không dùng chung với local. Default `bootstrap/cache/config.php` không bị QA ghi đè.

Kiểm tra độc lập cuối xác nhận QA runner trả exit code 1 khi thử kết nối 3310, tức không có quyền production.

## 4. Effective Laravel local config

Sau `php artisan config:cache` và restart đúng chuỗi tiến trình Laravel local:

| Thuộc tính | Giá trị xác minh |
|---|---|
| Environment | `local` |
| Debug | `false` |
| Business writes | `false` |
| DB connection | `mysql` |
| Host/port | `127.0.0.1:3310` |
| Database | `logistics_system` |
| Current user | `viettrung_app@127.0.0.1` |
| Server UUID | `38314517-e061-11f1-9329-b44506abce66` |
| Datadir | `C:\ProgramData\VietTrungOrder\MySQL\8.4\data\` |
| Session/cache | file |
| Queue | sync |
| Local storage | `logistics-backend/storage` |
| Local cookie | `laravel_session` |
| Config cache | `bootstrap/cache/config.php` |

APP_KEY fingerprint vẫn `811BDB49A29649380226B9802F0584E5E52A4617679D62DB659A633736AE9EE2`; APP_KEY và DB password không được in.

`.env`, `.env.testing` và toàn bộ `bootstrap/cache/*` được Git-ignore. Secret scan chính xác trên 7 production credentials và 4 QA credentials, qua 664 file Git-visible, có `0` file khớp plaintext.

ACL lưu ý: `config.php` thuộc operator hiện tại và kế thừa Read/Execute cho `BUILTIN\Users`, nhưng cũng kế thừa `Modify` cho `Authenticated Users`. Vì config cache chứa credential kết nối, ACL này chưa đạt least privilege. Chưa thay ACL trong giai đoạn này để tránh khóa nhầm runtime identity; cần hardening có rollback trước khi dùng ngoài máy local một người vận hành.

## 5. Hậu kiểm MySQL production 3310

Tất cả truy vấn dưới đây là `SELECT`/metadata read-only qua Laravel app user; không import, replay, migration hoặc DML.

| Chỉ số | Kết quả |
|---|---:|
| Windows service `VietTrungMySQL84` | Running |
| Base tables | 45 |
| Exact rows | 601 |
| Foreign keys | 86 |
| Orphan rows | 0 |
| `customers` | 10 |
| `users` | 11 |
| `orders` | 37 |
| `payment_vouchers` | 21 |
| `payment_transactions` | 18 |
| `invoices` | 13 |
| `personal_access_tokens` | 19 |
| `customer_accounts` | 0 |
| `customer_email_verification_tokens` | 0 |
| `customer_password_reset_tokens` | 0 |
| `customer_account_audit_logs` | 0 |

Snapshot được kiểm tra lại sau HTTP smoke test và vẫn giữ nguyên toàn bộ giá trị trên.

## 6. Binary log

Authoritative `SHOW BINARY LOG STATUS` bằng `viettrung_binlog_reader`:

- file: `binlog.000009`;
- position: `1416`;
- executed GTID set: rỗng;
- thời điểm: `2026-11-15T13:02:21.8013630+07:00`.

Marker trùng chính xác marker trước QA `binlog.000009:1416`. Vì không thay đổi nên không có transaction/event mới cần decode và không có căn cứ cho business write production.

## 7. HTTP/API smoke test local

- `GET http://127.0.0.1:8000/health`: HTTP 200, body chỉ `{"status":"ok"}`.
- GraphQL introspection: PASS; mutation `logout` có trong schema.
- `mutation { logout }` không Bearer token: bị từ chối như mong đợi.
- Không thực hiện mutation login, không phát hành/revoke production token.
- Visual UI chưa được quan sát do Computer Use bị URL-policy enforcement; không tuyên bố visual PASS.

## 8. Trạng thái tiến trình cuối

| Port | Trạng thái |
|---:|---|
| 8000 Laravel local | 1 listener |
| 8011 QA backend | stopped |
| 5173 QA frontend | stopped |
| 5174 QA frontend | stopped |
| 3310 production MySQL | 1 listener, service Running |
| 3311 QA MySQL | 1 listener, được giữ lại |

## 9. Checklist UI thủ công

Chỉ dùng tài khoản do chủ hệ thống tự nhập trực tiếp trong Chrome; không gửi password/token qua chat.

Admin, sau khi có phê duyệt riêng cho một real-login localhost:

1. Mở Admin Login trên localhost và đăng nhập.
2. Kiểm tra Dashboard tải được.
3. Mở Customers, Orders, Payment Vouchers và Invoices ở chế độ đọc.
4. Nhấn Logout và xác nhận về trang Login.
5. Refresh/back hoặc gọi lại trang bảo vệ; phiên cũ phải bị từ chối.
6. Sau test, kiểm tra token count/binlog marker để ghi nhận đúng một login/logout được phê duyệt.

Customer, tiếp tục dùng QA cho đến khi có phê duyệt production riêng:

1. Register bằng dữ liệu synthetic QA.
2. Kiểm tra CSRF cookie/session cookie QA.
3. Login và gọi CustomerMe.
4. Logout; CustomerMe kế tiếp phải bị từ chối.
5. Kiểm tra refresh session và cookie local/QA không trộn nhau.

## 10. Kế hoạch rotate `viettrung_app` — chưa thực hiện

1. Chốt maintenance window; ghi backup/restore-drill, kết nối hiện tại và binlog marker.
2. Tạo password CSPRNG mới trong memory, không in console/log.
3. Staging credential bằng DPAPI đúng Windows runtime identity; đặt ACL chỉ operator/runtime cần thiết, Administrators và SYSTEM.
4. Sao lưu `.env` hiện hành dưới dạng DPAPI ngoài Git và chuẩn bị rollback cache/process.
5. Sau phê duyệt riêng, dùng DBA chạy đúng một `ALTER USER 'viettrung_app'@'127.0.0.1'` qua TLS.
6. Cập nhật `.env`, rebuild config cache, restart đúng Laravel process và xác minh UUID/port/database/current user.
7. Nếu probe mới thất bại, dùng DBA trả lại old credential, phục hồi `.env`/cache và restart; không tiếp tục trong trạng thái nửa chuyển đổi.
8. Khi thành công, hủy bản plaintext trong memory, giữ rollback secret có thời hạn, quét Git/log, ghi marker binlog và hậu kiểm 45/601/86/0.

Không chạy `ALTER USER` trong 5B2-E.

## 11. Rủi ro còn lại

- 19 Admin token production cũ chưa bị thu hồi.
- Sanctum expiration hiện là `null`; token mới chưa có thời hạn mặc định.
- Login hiện tạo token với abilities mặc định `['*']`; cần thiết kế abilities tối thiểu.
- Config cache ACL còn kế thừa `Modify` cho Authenticated Users.
- Root hardening chưa được phê duyệt.
- Public HTTPS/SMTP chưa triển khai.
- Sai lệch tài chính nghiệp vụ chưa được chủ hệ thống xác nhận.
- Business writes vẫn phải giữ `false`.
- Visual UI chưa được quan sát thực tế.

## 12. GO/NO-GO

**GO có điều kiện cho bước kiểm tra Admin login thật trên localhost do chủ hệ thống thực hiện**, chỉ sau một phê duyệt riêng nêu rõ việc production sẽ tạo một token mới và logout sẽ thu hồi token đó. Trước bước này cần ghi token count/binlog marker, sau bước phải đối chiếu lại.

Điều kiện giới hạn:

- vẫn giữ `BUSINESS_WRITES_ENABLED=false`;
- chỉ localhost, không Internet-facing;
- chỉ thao tác màn hình đọc và logout;
- không tự động revoke 19 token cũ;
- không rotate credential trong cùng bước;
- ghi nhận riêng rủi ro ACL config cache.

**NO-GO** cho public production, bật business writes hoặc xác nhận nghiệp vụ tài chính.

Giai đoạn 5B2-E dừng tại đây và chờ phê duyệt tiếp theo.
