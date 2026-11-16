# Báo cáo Giai đoạn 5B2-B — DBA break-glass và binlog reader

Thời điểm hoàn tất: `2026-11-15T11:22:46.8120156+07:00`

Phạm vi: tạo hai account quản trị/quan sát nội bộ bằng init-file một lần, xoay credential cuối, loại bỏ init-file, restart sạch và xác minh dữ liệu. Không cutover Laravel.

## Kết luận

- `viettrung_dba@127.0.0.1`: đã tạo, xác minh và thu hẹp quyền.
- `viettrung_binlog_reader@127.0.0.1`: đã tạo, chỉ có `REPLICATION CLIENT`.
- Hai account dùng `caching_sha2_password`, `REQUIRE SSL`, chỉ host `127.0.0.1`.
- Init-file và startup reference đã được loại bỏ hoàn toàn.
- Hai restart service thành công, dữ liệu sau restart vẫn 45/601/86/0.
- Hai blocker ban đầu của 5B2 đã được giải quyết. Có thể tiếp tục chuẩn bị local cutover khi được phê duyệt riêng; public Internet vẫn NO-GO.

## 1. Tiền kiểm và backup

- Service: `VietTrungMySQL84`, Running, executable/config đúng instance 3310.
- UUID: `38314517-e061-11f1-9329-b44506abce66`.
- Datadir: `C:\ProgramData\VietTrungOrder\MySQL\8.4\data\`.
- Dữ liệu trước thay đổi: 45 bảng, 601 dòng, 86 FK, 0 orphan.
- Restore drill: 45 bảng, 601 dòng; đã đạt 86/0 ở 5B1.
- Không có established connection tới 3310, không có `mysqldump` và không có file `.partial`.
- Scheduled Task không chạy trong maintenance window.

Backup gần nhất trước thay đổi:

- `E:\MySQL_VietTrung_Backups\automatic\daily\logistics_system_20261115_024545.sql`
- 416.959 bytes
- SHA-256 `86626C9AC304B15C661799F812168745F61F2AC0A72D7D5652494B49052C8549`
- Sidecar và manifest đều khớp.

Config rollback:

- `C:\ProgramData\VietTrungOrder\MySQL\8.4\rollback\breakglass-20261115_111806\my.ini.before-breakglass`
- SHA-256 trước/sau `91145254FE17923401D2556EACD980864D7813274C133FA70ED9A94C1DE33FC3`
- `my.ini` cuối khớp byte-for-byte với rollback copy.

## 2. DBA break-glass

- Account: `viettrung_dba@127.0.0.1`
- Plugin: `caching_sha2_password`
- Account locked: `N`
- SSL type: `ANY` (`REQUIRE SSL`)
- TLS thực tế: `TLS_AES_128_GCM_SHA256`
- Đăng nhập thành công trên đúng UUID/port/datadir.

Quyền static thực tế:

- Data/DDL cần cho khôi phục: `SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER`.
- Maintenance: `RELOAD, SHUTDOWN, PROCESS, FILE, SHOW DATABASES, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE`.
- Schema objects: `CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, EVENT, TRIGGER, CREATE TABLESPACE`.
- Account/binlog recovery: `CREATE USER, REPLICATION CLIENT`.
- Có `GRANT OPTION` để phục hồi quyền trong sự cố.

Dynamic privileges được giữ lại đúng phạm vi:

- `BACKUP_ADMIN`
- `CONNECTION_ADMIN`
- `PERSIST_RO_VARIABLES_ADMIN`
- `SYSTEM_USER`
- `SYSTEM_VARIABLES_ADMIN`

Các quyền dư do hành vi `GRANT ALL PRIVILEGES` của MySQL 8.4 đã được phát hiện và thu hồi ngay: `SUPER`, replication-slave admin, audit, firewall, clone, group replication, binlog admin, encryption, telemetry và các dynamic privileges không cần thiết khác.

## 3. Binlog reader

- Account: `viettrung_binlog_reader@127.0.0.1`
- Plugin: `caching_sha2_password`
- Account locked: `N`
- SSL type: `ANY` (`REQUIRE SSL`)
- TLS thực tế: `TLS_AES_128_GCM_SHA256`
- Grant duy nhất: `REPLICATION CLIENT ON *.*`
- Không có DML, DDL, SELECT dữ liệu nghiệp vụ, account-management hoặc grant option.
- Truy vấn `logistics_system.customers` đã bị từ chối như dự kiến.

## 4. Binary log status

Kết quả authoritative cuối từ chính `viettrung_binlog_reader`:

- File: `binlog.000009`
- Position: `1416`
- Executed GTID set: rỗng
- Server UUID: `38314517-e061-11f1-9329-b44506abce66`
- Thời điểm marker xác minh: `2026-11-15T11:22:46.8120156+07:00`

Không đọc hoặc công khai row contents trong binlog.

## 5. Init-file và hai restart

Init-file chỉ chứa account-management cho hai account mới. Không có lệnh root hoặc dữ liệu nghiệp vụ.

- Restart 1 với init-file:
  - Normal shutdown bắt đầu `2026-11-15 11:18:15 +07:00`.
  - Ready for connections `2026-11-15 11:18:20.626190 +07:00`.
- Bootstrap credentials được xoay sang final credentials chưa từng có trong init-file.
- Init reference bị loại khỏi config và bootstrap file được overwrite best-effort rồi xóa.
- Restart 2 bằng config sạch:
  - Normal shutdown bắt đầu `2026-11-15 11:18:21 +07:00`.
  - Ready for connections `2026-11-15 11:18:24.308716 +07:00`.

Trạng thái cuối:

- `init_reference_count=0`
- `bootstrap_file_count=0`
- Service Running, Automatic/Delayed.
- Binlog chuyển từ `binlog.000007` sang `.000008` rồi `.000009` đúng theo hai restart.

## 6. Application và test accounts

`viettrung_app@127.0.0.1` giữ nguyên:

- Global: chỉ `USAGE`.
- Trên `logistics_system.*`: `SELECT, INSERT, UPDATE, DELETE`.
- Không `DROP`, `ALTER`, quyền quản trị global hoặc grant option.

`logistics_test_runner@127.0.0.1` giữ nguyên:

- Chỉ `USAGE`.
- Truy cập `logistics_system` bị từ chối.

## 7. Tính toàn vẹn dữ liệu sau restart

- Tables: 45
- Exact rows: 601
- Foreign keys: 86
- Orphan rows: 0
- `customers`: 10
- `users`: 11
- `orders`: 37
- `payment_vouchers`: 21
- `payment_transactions`: 18
- `invoices`: 13
- Bốn bảng Customer Authentication: 0 dòng.

Không có thay đổi customers/users/orders/payments do account-management.

## 8. Credential protection và ACL

Final credential files:

- `C:\ProgramData\VietTrungOrder\MySQL\8.4\secrets\dba-breakglass.dpapi.json`
- `C:\ProgramData\VietTrungOrder\MySQL\8.4\secrets\binlog-reader.dpapi.json`

Đặc tính:

- DPAPI scope: LocalMachine.
- File ACL: operator, Administrators và SYSTEM có Full Control.
- Secrets directory không cấp quyền cho `NT SERVICE\VietTrungMySQL84`.
- MySQL service không thể đọc final credential files.
- DBA và reader tách credential riêng; không có plaintext trong Git, config hoặc report.

## 9. Scheduled backup

- Task: `VietTrungMySQL84-NightlyBackup`
- State cuối: Ready
- Last run: `2026-11-15T02:45:45+07:00`
- Last result: 0
- Next run: `2026-11-16T02:30:00+07:00`

Task không chạy trùng hai restart.

## 10. Root correction và account inventory

Authoritative DBA query cho thấy:

- `root@localhost`: `caching_sha2_password`, `account_locked=N`.
- `mysql.session@localhost`: system account.
- `viettrung_dba@127.0.0.1`: account quản trị mới.

Binlog audit redacted xác nhận root plugin được thay đổi tại `binlog.000003` position 237 lúc `2026-11-15T02:31:26+07:00`, trước 5B2-B. Không có root event trong `binlog.000008` hoặc `.000009`; 5B2-B không sửa/mở khóa root.

Trạng thái root unlocked khác với ghi nhận trước đây và cần quyết định hardening riêng. Theo giới hạn nhiệm vụ, root không bị sửa trong 5B2-B và Laravel vẫn không được phép dùng root.

## 11. Sự cố trong quá trình và khôi phục

Có ba lần dừng an toàn khi hoàn thiện automation:

1. Hai lần tiền kiểm đầu dừng trước config/init/account do parse output một dòng của PowerShell; `config_rollback_attempted=false`, service vẫn Running.
2. Lần thực thi account hoàn tất nhưng expected access-denied của reader bị PowerShell coi là terminating error. Catch đã phục hồi config sạch và service Running. Finalizer sau đó xác minh toàn bộ trạng thái thành công.

Marker lỗi tạm được bảo toàn trong rollback directory để audit, không chứa secret. Marker hoàn tất:

- `C:\ProgramData\VietTrungOrder\MySQL\8.4\breakglass-setup.complete.json`

## 12. Trạng thái ứng dụng và phạm vi cấm

- `.env` Laravel chưa đổi; vẫn chưa cutover.
- `BUSINESS_WRITES_ENABLED` không được đặt `true`; effective default vẫn false.
- APP_KEY, frontend/extension endpoint và 19 Admin tokens không đổi.
- MySQL 3306/3308/3309 không bị dừng, sửa hoặc xóa.
- Không migration, import, replay, commit hoặc push.

## 13. GO/NO-GO

- **GO có điều kiện cho bước local cutover riêng tiếp theo**: hai blocker DBA/binlog và runtime business-write lock đã được giải quyết.
- Điều kiện bắt buộc khi cutover: giữ business writes false, sao lưu `.env`, ghi lại binlog status mới nhất, dùng `viettrung_app`, xác minh effective connection 3310 trước mọi request ghi.
- Root-unlocked là hạng mục hardening cần quyết định/phê duyệt riêng; không dùng root cho Laravel.
- **NO-GO cho Internet-facing/public production và giao dịch tài chính.**

**Dừng sau 5B2-B. Chờ phê duyệt riêng cho việc chuyển Laravel sang 3310.**
