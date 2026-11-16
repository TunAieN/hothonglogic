# Thiết lập root HeidiSQL qua named pipe — 2026-11-15

Hoàn tất lúc `2026-11-15T19:33:11+07:00`.

## Kết quả

- Đã đặt lại mật khẩu cho đúng account hiện có `root@localhost`.
- Authentication plugin: `caching_sha2_password`.
- Account unlocked, password không expired.
- Không tạo `root@127.0.0.1` hoặc bất kỳ account MySQL mới nào.
- Root đăng nhập thành công qua named pipe `VietTrungProduction3310` với RSA server-public-key retrieval.
- Identity xác minh: `root@localhost`, port server 3310, UUID `38314517-e061-11f1-9329-b44506abce66`.
- Root còn đầy đủ ba dòng grant toàn server, dynamic privileges và `GRANT OPTION`.
- MySQL service vẫn Running.
- Binlog cuối: `binlog.000010:527`.

## Dữ liệu và Laravel

- 45 bảng, 602 exact rows, 86 FK, 0 orphan.
- Customers 10; users 11; orders 37.
- Payment vouchers 21; payment transactions 18; invoices 13.
- Personal access tokens 20, bao gồm token 210 còn tồn tại từ Giai đoạn 5B2-F.
- Business checksum giữ nguyên `87ca57bd816c6fe0621c9bdeeae75b16463eb0b9dc0ad18ac69fd5c66f5c0491`.
- `viettrung_app` giữ nguyên grants đã giới hạn.
- Laravel vẫn dùng `viettrung_app@127.0.0.1`, port 3310, đúng UUID/datadir.
- `APP_DEBUG=false`; `BUSINESS_WRITES_ENABLED=false`.
- Không thay `.env`, APP_KEY, config cache hoặc BusinessWriteGuard.

## Credential DPAPI

Credential root chính thức:

`C:\ProgramData\VietTrungOrder\MySQL\8.4\secrets\root-heidisql.dpapi.json`

Helper clipboard:

`C:\ProgramData\VietTrungOrder\MySQL\8.4\secrets\copy-root-password-to-clipboard.ps1`

Đặc tính:

- DPAPI scope `CurrentUser`.
- ACL không kế thừa; chỉ operator hiện tại, Administrators và SYSTEM có Full Control.
- Plaintext scan 674 Git-visible/log/helper files: 0 match.
- Password không được in vào chat, command line, Git hoặc log.
- File pending đã bị loại bỏ sau khi finalization thành công.

File tổng hợp `operator-credentials.dpapi.json` không bị ghi đè do ACL chỉ cho Read/Write và atomic replace bị Windows từ chối. Root entry cũ trong file đó đã stale; file `root-heidisql.dpapi.json` chuyên biệt là nguồn authoritative. Bản backup DPAPI trước reset được giữ trong thư mục ACL hạn chế `rollback-root-reset-20261115_192842`.

## Lấy password trực tiếp trên Windows

Mở PowerShell bằng chính tài khoản Windows `TUAN-ANH\TUAN ANH` và chạy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\VietTrungOrder\MySQL\8.4\secrets\copy-root-password-to-clipboard.ps1"
```

Helper chỉ copy password vào Windows Clipboard trong 60 giây, không in password. Paste ngay vào ô Password của HeidiSQL; clipboard sẽ được xóa nếu chưa bị thay bằng nội dung khác.

## Cấu hình HeidiSQL

Tạo session mới với các giá trị:

| Trường | Giá trị |
|---|---|
| Session name | `VietTrung MySQL 3310 Root` |
| Network type | `MariaDB or MySQL (named pipe)` |
| Library | `libmysql-8.4.0.dll` |
| User | `root` |
| Password | Paste từ helper DPAPI |
| Pipe/socket | `VietTrungProduction3310` |
| Database | `logistics_system` |

Port TCP không được dùng trong chế độ named pipe. Kết nối vẫn đến đúng server instance có `@@port=3310`.

Không chọn Save password nếu không muốn HeidiSQL lưu credential trong `HKEY_CURRENT_USER\Software\HeidiSQL\`; dùng helper DPAPI mỗi lần sẽ an toàn hơn.

Sau khi kết nối, chạy truy vấn read-only:

```sql
SELECT CURRENT_USER(), USER(), @@port, @@server_uuid, @@datadir;
```

Kết quả mong đợi:

- `CURRENT_USER()` là `root@localhost`;
- port 3310;
- UUID `38314517-e061-11f1-9329-b44506abce66`;
- datadir `C:\ProgramData\VietTrungOrder\MySQL\8.4\data\`.

Nếu HeidiSQL báo `ERROR 2061 Authentication requires secure connection`, giữ nguyên `caching_sha2_password`, xác nhận library là `libmysql-8.4.0.dll` và không đổi sang `mysql_native_password`. Dừng và báo lại lỗi đầy đủ để kiểm tra khả năng RSA server-public-key retrieval của client.

Không commit/push.
