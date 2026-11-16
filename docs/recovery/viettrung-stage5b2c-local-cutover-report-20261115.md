# Báo cáo Giai đoạn 5B2-C — Local cutover Laravel sang MySQL 3310

Thời điểm thực hiện: 2026-11-15, múi giờ Asia/Bangkok.

## 1. Kết luận

**GO có điều kiện cho local read-only.** Laravel local đã được chuyển từ cấu hình cũ `root@127.0.0.1:3306` sang `viettrung_app@127.0.0.1:3310`. Backend chỉ bind `127.0.0.1:8000`; `BUSINESS_WRITES_ENABLED` có effective value `false` và `APP_DEBUG=false`.

Không mở public website, không đăng nhập bằng tài khoản thật, không tạo/revoke token, không chạy mutation thật trên database vận hành, không bật giao dịch tài chính và không commit/push.

Public/Internet-facing production vẫn **NO-GO**.

## 2. Precheck MySQL 3310

- Windows Service: `VietTrungMySQL84`, Running, delayed auto-start.
- Host/port: `127.0.0.1:3310`.
- Server UUID: `38314517-e061-11f1-9329-b44506abce66`.
- Datadir: `C:\ProgramData\VietTrungOrder\MySQL\8.4\data\`.
- `binlog_row_image=FULL`.
- 45 base tables, 601 exact rows, 86 foreign keys, 0 orphan.
- Không có InnoDB transaction hoặc active business session trước cutover.
- Bốn bảng Customer Authentication đều có 0 dòng.
- `viettrung_app@127.0.0.1`: global USAGE; chỉ SELECT, INSERT, UPDATE, DELETE trên `logistics_system.*`.
- `logistics_test_runner` không đọc được database vận hành.

Binlog marker ngay trước cutover:

- File/position: `binlog.000009:1416`.
- Thời điểm: `2026-11-15 11:52:40.223120 +07:00`.
- Reader: `viettrung_binlog_reader@127.0.0.1`.

## 3. Backup và restore drill

Backup mới nhất:

- `E:\MySQL_VietTrung_Backups\automatic\daily\logistics_system_20261115_024545.sql`
- Kích thước: 416,959 bytes.
- SHA-256: `86626C9AC304B15C661799F812168745F61F2AC0A72D7D5652494B49052C8549`.
- Sidecar `.sha256` và JSON manifest đều khớp.

Hai restore drill hiện hữu đều đạt:

- `logistics_system_restore_verify`: 45 bảng, 601 dòng, 86 FK.
- `logistics_system_restore_verify_independent`: 45 bảng, 601 dòng, 86 FK.

## 4. Snapshot và cấu hình cutover

`.env` trước cutover được sao lưu mã hóa DPAPI CurrentUser ngoài Git tại:

- `C:\ProgramData\VietTrungOrder\Laravel\rollback\cutover-20261115_115608\.env.before-cutover.dpapi.json`
- Metadata an toàn: `C:\ProgramData\VietTrungOrder\Laravel\rollback\cutover-20261115_115608\pre-cutover-metadata.json`

Fingerprint trước cutover:

- `.env` SHA-256: `F9695DA557706961DF61820613BA5C082C185BE6413641C6501E24ACB1C34C4B`.
- APP_KEY SHA-256: `811BDB49A29649380226B9802F0584E5E52A4617679D62DB659A633736AE9EE2`.

APP_KEY fingerprint sau cutover và trong effective Laravel runtime vẫn đúng giá trị trên; APP_KEY không đổi.

Effective configuration:

- `APP_ENV=local`.
- `APP_DEBUG=false`.
- `DB_CONNECTION=mysql`.
- `DB_HOST=127.0.0.1`.
- `DB_PORT=3310`.
- `DB_DATABASE=logistics_system`.
- Current user: `viettrung_app@127.0.0.1`.
- `BUSINESS_WRITES_ENABLED=false`.
- Session: file; cache: file; queue: sync.

Config cache đã được clear và rebuild. Bằng chứng được lấy từ Laravel runtime và truy vấn read-only thật, không chỉ đọc `.env`.

## 5. Runtime local

Hai tiến trình development server cũ trỏ 3306 đã được dừng trước khi sửa cấu hình. Laravel được khởi động lại với:

- `artisan serve --host=127.0.0.1 --port=8000 --no-interaction`.
- Listener thực tế: `127.0.0.1:8000`.
- Log runtime: `C:\ProgramData\VietTrungOrder\Laravel\logs\`.

Quan sát sau cutover cho thấy các kết nối Laravel read-only đến port 3310. Không có reference `3306` trong `.env` hoặc config cache runtime.

MySQL cũ 3306 vẫn LISTENING và không bị dừng, sửa hoặc xóa. Các reference không-runtime còn lại cần xử lý trong giai đoạn test riêng:

- `logistics-backend/.env.example`.
- `logistics-backend/.env.testing.example`.
- `logistics-backend/phpunit.xml`.
- Default fallback trong `config/database.php` (runtime hiện đã override bằng `.env`).

Không có queue worker hoặc scheduler Laravel đang chạy.

## 6. Kiểm tra read-only bằng Laravel

- GraphQL query chỉ đọc: HTTP 200.
- `customer-auth/me` không có phiên: HTTP 401.
- Sanctum CSRF cookie: HTTP 204, có XSRF cookie.
- `_ignition/health-check`: HTTP 404 khi `APP_DEBUG=false`; chưa có health endpoint riêng cho production-like local mode.
- Không thực hiện đăng nhập Admin/Customer vì sẽ tạo hoặc cập nhật session/token/audit/last-login.

Đếm bằng chính connection Laravel:

- 45 bảng, 601 dòng.
- 45/45 bảng có primary key.
- 86 foreign keys, 0 orphan.
- customers 10; users 11; orders 37; order_items 56.
- payment_vouchers 21; payment_transactions 18; invoices 13.
- Không có bảng tên `packages`; các bảng tương ứng là `cn_packages=20` và `vn_packages=16`.
- Bốn bảng Customer Authentication: 0/0/0/0.

## 7. BusinessWriteGuard

- Effective runtime: `false`.
- Unit test `BusinessWriteGuardTest`: 3/3 test, 5 assertions, đạt.
- Source guard hiện diện ở GraphQL root business mutation, REST middleware và các service/resolver trọng yếu.
- Live mutation probe trên database 3310 không được thực hiện vì nếu guard lỗi thì request có thể tạo dữ liệu thật. Việc này cần phê duyệt riêng hoặc một database test có quyền phù hợp.
- `logistics_test_runner` trên 3310 hiện chỉ có USAGE và database `logistics_system_test` chưa sẵn sàng, nên không chạy feature test ghi.

## 8. Customer Web, CORS, session và CSRF

- Customer Web build thành công bằng Vite 8.3.4.
- Local API base để trống và dùng Vite same-origin proxy:
  - `/customer-auth` -> `http://127.0.0.1:8000`
  - `/sanctum` -> `http://127.0.0.1:8000`
- File session và file cache được giữ nguyên; không chuyển sang database.
- CSRF endpoint cấp cookie thành công.
- Direct cross-origin preflight tới `/customer-auth/login` hiện không trả CORS headers vì `config/cors.php` chỉ bao phủ `api/*` và `graphql`; đồng thời cấu hình hiện tại là wildcard origin với `supports_credentials=false`.
- Local Vite proxy không cần CORS. Nếu frontend/backend chạy khác origin không qua proxy, phải bổ sung allowlist cụ thể và credential support trước khi GO.
- Forgot Password, Email Verification, register/login/reset/change-password không được chạy trên database vận hành vì có side effect.
- Không khẳng định end-to-end Customer Authentication đã đạt trên website vận hành.

## 9. Admin Panel

- TypeScript + Vite build thành công.
- Endpoint mặc định local: `http://127.0.0.1:8000/graphql`.
- GraphQL read-only endpoint trả HTTP 200.
- Lighthouse GraphQL schema validation đạt.
- Không đăng nhập, không dùng 19 token cũ và không mở màn hình yêu cầu phiên thật.
- Các chức năng mutation vẫn được xem là khóa; chưa kiểm thử request ghi thật.

## 10. Chrome Extension

- Manifest V3, version 1.0.0.
- Endpoint development: `http://127.0.0.1:8000/graphql`.
- Tất cả JavaScript qua `node --check`; không thiếu file/asset được manifest tham chiếu.
- Authentication contract vẫn là bearer token; không dùng token cũ.
- Không chỉnh scraper hoặc logistics workflow.

## 11. Dữ liệu và binlog sau cutover

Đối chiếu cuối:

- 45 bảng, 601 dòng, 86 FK, 0 orphan.
- customers 10; users 11; orders 37.
- payment_vouchers 21; payment_transactions 18; invoices 13.
- Bốn bảng Customer Authentication vẫn rỗng.
- `personal_access_tokens=19`; không token nào bị thu hồi hoặc tạo mới.
- Không có transaction đang mở.

Binlog sau toàn bộ kiểm tra:

- `binlog.000009:1416`.
- Thời điểm kiểm tra: `2026-11-15 12:07:41.076714 +07:00`.
- Marker không đổi so với trước cutover; không có database write phát sinh.

Root vẫn là `root@localhost`, `caching_sha2_password`, `account_locked=N`; không bị sửa trong 5B2-C.

## 12. Vấn đề còn tồn tại và phê duyệt cần thiết

1. Cần database test 3310 riêng và grants cho `logistics_test_runner` trước feature/E2E write tests.
2. Cần phê duyệt riêng nếu muốn chạy live blocked-mutation probe trên 3310.
3. Cần phê duyệt riêng cho đăng nhập Admin thật; thao tác này có thể tạo/cập nhật token hoặc trạng thái phiên.
4. Cần phê duyệt riêng cho register/login/forgot/reset/verify Customer Authentication; các luồng này ghi dữ liệu.
5. Direct cross-origin Customer Web cần CORS allowlist cụ thể; local same-origin Vite proxy hiện hoạt động.
6. Chưa có health endpoint riêng khi debug tắt.
7. Các file template/test còn reference 3306 phải được xử lý cùng việc dựng test database, không ảnh hưởng runtime hiện tại.
8. Một exception trace CLI trong quá trình chẩn đoán đã hiển thị phần đầu bị rút gọn của credential ứng dụng. Không có credential đầy đủ trong file Git; việc rotate `viettrung_app` cần phê duyệt DBA riêng trước production.
9. Root hardening vẫn là quyết định riêng ngoài phạm vi.

## 13. File thay đổi trong giai đoạn này

- `logistics-backend/.env` — ignored, chứa cấu hình local 3310; không thuộc Git.
- `logistics-backend/bootstrap/cache/config.php` — ignored, config cache được rebuild.
- Build artifacts của Customer Web và Admin Panel theo cấu hình ignore hiện hữu.
- Báo cáo này.

Không commit/push.

**Dừng tại local cutover read-only. Chờ phê duyệt riêng cho login/E2E write testing hoặc đưa hệ thống vào sử dụng.**
