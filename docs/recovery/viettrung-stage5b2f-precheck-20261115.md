# Giai đoạn 5B2-F — Baseline trước Admin login localhost

Thời điểm tiền kiểm dữ liệu: `2026-11-15T13:20:59+07:00`  
Thời điểm binlog marker: `2026-11-15T13:22:04.7620911+07:00`

Không có login hoặc mutation xác thực nào được thực hiện trong tiền kiểm.

## Runtime

- Laravel: `127.0.0.1:8000`, health HTTP 200.
- MySQL service `VietTrungMySQL84`: Running.
- Effective DB: `127.0.0.1:3310/logistics_system`.
- Current DB user: `viettrung_app@127.0.0.1`.
- UUID: `38314517-e061-11f1-9329-b44506abce66`.
- Datadir: `C:\ProgramData\VietTrungOrder\MySQL\8.4\data\`.
- `APP_DEBUG=false`.
- `BUSINESS_WRITES_ENABLED=false`.
- GraphQL runtime introspection: mutation `logout` đã được nạp.

## Database baseline

- 45 base tables.
- 601 exact rows.
- 86 foreign keys.
- 0 orphan rows.
- customers 10; users 11; orders 37.
- payment_vouchers 21; payment_transactions 18; invoices 13.
- Bốn Customer Authentication tables: 0 dòng.
- Business table checksums digest: `87ca57bd816c6fe0621c9bdeeae75b16463eb0b9dc0ad18ac69fd5c66f5c0491`.

## Token baseline

- Tổng: 19.
- Token metadata digest, không gồm token value: `1050a78ca85249a0949328b59a1478e0bb34f322e48ab45e2ffc4086a666211b`.
- `App\Models\User` ID 1: token IDs `40, 41, 42, 43, 44, 45, 46, 76, 77, 78, 207, 208`.
- `App\Models\User` ID 1803: token IDs `61, 62, 63, 64, 65`.
- `App\Models\User` ID 1804: token ID `66`.
- `App\Models\User` ID 1810: token ID `75`.
- Tất cả có internal name `api-token`, expiration `null`.

Không đọc, lưu hoặc công khai token value/hash.

## Binlog và backup

- Binlog trước login: `binlog.000009:1416`; executed GTID set rỗng.
- Backup mới nhất: `E:\MySQL_VietTrung_Backups\automatic\daily\logistics_system_20261115_024545.sql`.
- Size: 416,959 bytes.
- SHA-256 thực tế khớp sidecar/manifest: `86626C9AC304B15C661799F812168745F61F2AC0A72D7D5652494B49052C8549`.
- Backup task independent-binary marker: result 0 lúc `2026-11-15T02:45:50+07:00`.
- Restore drill gần nhất đã được xác minh ở Giai đoạn 5B1/5B2-B: 45/601/86/0; không chạy lại restore trong 5B2-F.

## Admin Panel

- URL login: `http://127.0.0.1:5173/login`.
- Vite bind duy nhất `127.0.0.1:5173`.
- Effective API: `http://127.0.0.1:8000`.
- Không trỏ QA 8011.
- HTTP login page: 200.

## ACL config cache

- Laravel PID tại tiền kiểm: 17792, account `TUAN-ANH\TUAN ANH`.
- Owner `bootstrap/cache/config.php`: `TUAN-ANH\TUAN ANH`.
- `BUILTIN\Users`: Read/Execute.
- `NT AUTHORITY\Authenticated Users`: inherited Modify.
- Local enabled accounts: `TUAN ANH`, `CodexSandboxOffline`, `CodexSandboxOnline`.

ACL chưa đạt least privilege. Không thay ACL theo giới hạn 5B2-F. Với thử nghiệm localhost có giám sát, có thể tiếp tục có điều kiện; không dùng trạng thái ACL này cho public/multi-user operation.
