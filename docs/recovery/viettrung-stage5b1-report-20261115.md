# Báo cáo Giai đoạn 5B1 — MySQL vận hành mới

Thời điểm xác minh: 2026-11-15 (Asia/Bangkok)

Phạm vi của giai đoạn này chỉ gồm instance MySQL mới, Windows Service, phân quyền, backup và restore drill. Laravel, Laragon và các instance 3306/3308/3309 không được chuyển đổi hoặc sửa dữ liệu.

## Kết luận

Instance MySQL 8.4.3 mới đã được tạo độc lập với Laragon, phục hồi đúng snapshot chuẩn, chạy bằng Windows Service riêng và đã vượt qua backup/restore drill. Dữ liệu vận hành trên instance mới là 45 bảng, 601 dòng, 86 foreign keys và 0 orphan. Ứng dụng chưa được cutover.

## 1. Windows Service

- Service: `VietTrungMySQL84`
- Trạng thái cuối: `Running`
- Startup: Automatic (Delayed Start)
- Recovery: restart sau 5 giây, restart lần hai sau 15 giây; reset bộ đếm sau 86.400 giây
- Service identity: `NT SERVICE\VietTrungMySQL84`
- Executable độc lập: `C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysqld.exe`
- ImagePath dùng config riêng `C:\ProgramData\VietTrungOrder\MySQL\8.4\my.ini`; không còn phụ thuộc binary Laragon.

## 2. Port và phạm vi mạng

- Port: `3310`
- Bind: `127.0.0.1`
- MySQL X Protocol: tắt
- Kết nối tài khoản chuyên dụng đã xác minh TLS với cipher `TLS_AES_128_GCM_SHA256`.
- Không mở MySQL mới ra mạng công cộng.

## 3. Datadir và cấu hình độc lập

- Datadir: `C:\ProgramData\VietTrungOrder\MySQL\8.4\data\`
- Config root: `C:\ProgramData\VietTrungOrder\MySQL\8.4\`
- Log directory: `C:\ProgramData\VietTrungOrder\MySQL\8.4\logs\`
- Binary root: `C:\Program Files\VietTrungOrder\MySQL\8.4.3\`
- `server-id=8410`
- Binary log: bật, `ROW`, `FULL`, hạn 2.592.000 giây (30 ngày)
- Durability: `sync_binlog=1`, `innodb_flush_log_at_trx_commit=1`
- Không dùng chung datadir hoặc InnoDB files với 3306/3308/3309.

## 4. Server UUID

- Instance mới 3310: `38314517-e061-11f1-9329-b44506abce66`
- Original 3306: `c474c1d2-ae53-11f0-bea7-b44506abce66`
- Recovery 3308: `2cfbc6c9-e055-11f1-9858-b44506abce66`
- Candidate 3309: `35682ae5-e05b-11f1-9911-b44506abce66`

UUID, port và datadir của 3310 đều khác ba instance cũ.

## 5. Service account và ACL

- `NT SERVICE\VietTrungMySQL84`: Modify trên `data`, `logs`, `run`, `secure-files`; Read/Execute trên binary/config root.
- `SYSTEM` và `Administrators`: Full Control.
- Operator hiện tại: Read/Execute trên config/binary; Modify trên thư mục secrets và backup.
- Thư mục secrets không cấp quyền cho service MySQL.
- Backup root `E:\MySQL_VietTrung_Backups\automatic\`: chỉ operator, Administrators và SYSTEM.
- Credential operator dùng DPAPI CurrentUser; credential backup task dùng DPAPI LocalMachine và được giới hạn bằng ACL.
- Không có plaintext credential trong các file Git nhìn thấy tại thời điểm quét.

## 6. Start/stop/restart

- Start service: đạt.
- Shutdown sạch: đạt; MySQL error log ghi `Normal shutdown` và `Shutdown complete`.
- Restart test: dừng lúc `2026-11-15T02:33:33.9890859+07:00`, chạy lại lúc `2026-11-15T02:33:35.3303969+07:00`.
- Sau khi chuyển sang binary độc lập, service khởi động lại thành công lúc khoảng `2026-11-15 02:44:30 +07:00`; log xác nhận đúng executable mới và sẵn sàng trên port 3310.
- Sau restart, row counts và foreign-key validation không thay đổi.
- Không reboot Windows theo đúng giới hạn phê duyệt.

## 7. Phục hồi snapshot 45 bảng

Nguồn duy nhất được import vào 3310:

- File: `E:\MySQL_CuuHo_20261115\logistics_system_ready_45tables_20261115.sql`
- SHA-256 đã xác minh: `DAB9363E82FF7B3C90B1E878C47B1B0D13C65DBD8828C16F2405B79E6CEFE818`
- Kết quả: 45 base tables, không thiếu primary key, không chạy `migrate:fresh`, `db:wipe` hoặc `migrate:refresh`.

Bốn bảng Customer Authentication tồn tại và đều có 0 dòng:

- `customer_accounts`
- `customer_email_verification_tokens`
- `customer_password_reset_tokens`
- `customer_account_audit_logs`

Không có dữ liệu smoke test Authentication trong database vận hành mới.

## 8. Row counts

- Tổng chính xác: 601 dòng.
- `customers`: 10
- `users`: 11
- `orders`: 37
- `order_items`: 56
- `payment_vouchers`: 21
- `payment_transactions`: 18
- `invoices`: 13
- `invoice_items`: 17
- `audit_logs`: 96
- `personal_access_tokens`: 19
- `migrations`: 51

Các sai lệch nghiệp vụ sẵn có trong snapshot không được tự sửa.

## 9. Foreign keys và orphan

- Foreign keys: 86
- Orphan rows: 0
- Restore drill mới nhất: 45/45 bảng có cùng số dòng với `logistics_system`; số bảng lệch là 0.

## 10. Tài khoản MySQL và quyền

- `viettrung_app@127.0.0.1`: chỉ `SELECT, INSERT, UPDATE, DELETE` trên `logistics_system.*`; không có `DROP`, `ALTER`, quyền global hoặc grant option.
- `viettrung_migrator@127.0.0.1`: `ALL PRIVILEGES` chỉ trên `logistics_system` và hai database restore drill; không có quyền global hoặc grant option.
- `viettrung_backup@127.0.0.1`: `SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER` trên `logistics_system.*` và global `SHOW_ROUTINE`.
- `logistics_test_runner@127.0.0.1`: chỉ `USAGE`; truy cập cả database vận hành và database restore đều bị từ chối.
- Laravel không dùng root và chưa được chuyển sang các credential mới.
- Correction sau khi có DBA read-only ở 5B2-B: `root@localhost` thực tế dùng `caching_sha2_password` và `account_locked=N`. Binlog xác nhận thay đổi plugin xảy ra từ `binlog.000003` position 237 lúc `2026-11-15T02:31:26+07:00`, trước 5B2-B, và không có `ACCOUNT LOCK/UNLOCK` trong event đó. Kết luận trước đây về root khóa/mysql_native_password không còn chính xác.

## 11. Backup tự động

- Task: `VietTrungMySQL84-NightlyBackup`
- Run as: `SYSTEM`
- Lịch: hằng ngày 02:30 giờ địa phương; start when available; không chạy chồng; timeout 1 giờ; retry 2 lần, cách 5 phút.
- Phạm vi: chỉ `127.0.0.1:3310/logistics_system`.
- Backup root: `E:\MySQL_VietTrung_Backups\automatic\`, tách khỏi datadir và không đụng backup cứu hộ.
- Logical dump nhất quán: single transaction, quick, routines, triggers, events, hex blob, không ghi GTID purge.
- Xuất `.partial` rồi đổi tên nguyên tử; tạo SHA-256 và JSON manifest.
- Retention: daily 14 ngày, weekly 56 ngày, monthly 365 ngày.
- Khi lỗi: tạo failure marker, ghi protected log và Windows Application Event ID 500.
- Hai lần thử đầu đã chủ động xác nhận đường cảnh báo lỗi do thiếu assembly DPAPI trên Windows PowerShell 5.1; script đã được sửa và các lần chạy cuối thành công. Failure marker cuối không tồn tại.

Backup thành công mới nhất sau khi tách binary:

- File: `E:\MySQL_VietTrung_Backups\automatic\daily\logistics_system_20261115_024545.sql`
- Thời điểm: `2026-11-15T02:45:46.5659885+07:00`
- Kích thước: 416.959 bytes
- SHA-256: `86626C9AC304B15C661799F812168745F61F2AC0A72D7D5652494B49052C8549`
- Scheduled task result marker: `0`, run as SYSTEM.
- Hash riêng của 37 câu INSERT là `0624B1B76428C51658B02159D434F6B2C83EABCAE041CB9AE625C7B18D5AA577`, trùng tuyệt đối với snapshot chuẩn.

## 12. Restore test

Đã restore bản backup tự động vào database tách biệt `logistics_system_restore_verify_independent` trên chính instance 3310, không restore vào database vận hành và không replay binlog.

- Base tables: 45
- Exact rows: 601
- Bảng lệch row count so với operational: 0
- Foreign keys: 86
- Orphan rows: 0
- Các bảng trọng yếu có số dòng trùng khớp.
- Test runner không truy cập được database restore.

Một restore drill trước đó vào `logistics_system_restore_verify` cũng đạt 45/601/86/0.

## 13. MySQL gốc 3306 và các instance cũ

Trạng thái cuối được quan sát:

- 3306: đang listen, PID 31260, executable Laragon, datadir gốc không thay đổi, 0 kết nối established.
- 3308: không listen.
- 3309: candidate vẫn listen localhost, PID 26328, không thay đổi, 0 kết nối established.
- 3310: service mới đang listen localhost, PID 28300, 0 kết nối established tại thời điểm kiểm tra.

Không dừng 3306, không sửa Laragon, không ghi dữ liệu vào 3306/3308/3309. Vì Laragon có thể tự bật 3306, 5B2 phải có bước ngăn ứng dụng kết nối nhầm trước khi đổi endpoint.

## 14. Các vấn đề còn chặn cutover

1. Laravel hiện vẫn trỏ 3306 bằng cấu hình phát triển hiện tại; chưa đổi `.env`, DB endpoint hoặc credential.
2. Chưa xác định Windows identity cuối cùng chạy Laravel. DPAPI credential cho ứng dụng phải được cấp lại theo đúng identity đó nếu khác operator hiện tại.
3. Cần tạo/xác minh cơ chế break-glass DBA được bảo vệ. Root cũ không được dùng cho ứng dụng; trạng thái root unlocked cần quyết định hardening riêng.
4. Laragon 3306 vẫn tự khởi động và đang listen; cần phê duyệt dừng/disable autostart hoặc guard tương đương tại cutover.
5. Production domain, HTTPS, CORS/CSRF/Sanctum topology và SMTP thật chưa được quyết định.
6. 19 Admin personal access tokens chưa thu hồi theo đúng lệnh cấm của giai đoạn này.
7. Các hạn chế ghi giao dịch tài chính và sai lệch đối soát nghiệp vụ đã biết chưa được chủ sở hữu nghiệp vụ phê duyệt.
8. Chưa có final pre-cutover backup, maintenance window, writer lock và rollback decision point.
9. Chưa reboot Windows; chỉ xác minh delayed auto-start bằng cấu hình service và restart service có kiểm soát.
10. CA MySQL là self-signed; hiện chấp nhận được cho kết nối TLS localhost, nhưng không phải thiết kế truy cập database công cộng.

## 15. Thay đổi cần phê duyệt cho Giai đoạn 5B2

1. Chốt runtime identity của Laravel và provision credential DPAPI tương ứng.
2. Chuẩn bị break-glass DBA theo chính sách, vẫn khóa/không dùng root trong app.
3. Chốt domain, HTTPS, frontend/extension endpoint, CORS, CSRF/Sanctum và SMTP.
4. Lập maintenance window; khóa writer; tạo và kiểm tra final backup; ghi lại UUID/datadir/counts trước chuyển đổi.
5. Đổi duy nhất cấu hình runtime Laravel sang `127.0.0.1:3310`, database `logistics_system`, user `viettrung_app`; giữ nguyên `APP_KEY`.
6. Clear/cache cấu hình đúng quy trình và kiểm tra effective connection identity trước mọi write test.
7. Chạy smoke test read-only trước; chỉ chạy write smoke test phi tài chính khi có phê duyệt riêng.
8. Sau khi xác minh ứng dụng mới, phê duyệt dừng/disable MySQL Laragon 3306 để ngăn kết nối nhầm.
9. Thu hồi 19 Admin tokens chỉ khi có phê duyệt rõ ràng và đã xác minh ảnh hưởng đăng nhập.
10. Mở writer/giao dịch chỉ sau khi toàn bộ tiêu chí cutover và rollback được hai bên xác nhận.

## Kiểm soát thay đổi

- Không sửa `.env` vận hành, `APP_KEY`, endpoint frontend/extension hoặc SMTP.
- Không thay đổi database gốc hoặc ba instance cũ.
- Không thu hồi token, không mở website/giao dịch thật.
- Git không theo dõi datadir/credential; `git diff --check` đạt (chỉ có cảnh báo line-ending trên các thay đổi đã tồn tại).
- Không commit hoặc push.

**Giai đoạn 5B1 dừng tại đây. Chờ phê duyệt Giai đoạn 5B2 trước mọi cutover.**
