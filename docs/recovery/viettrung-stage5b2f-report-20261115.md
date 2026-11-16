# Báo cáo Giai đoạn 5B2-F — Admin login thật trên localhost

Thời điểm hậu kiểm cuối: `2026-11-15T13:43:44.7369660+07:00`

Phạm vi: chủ hệ thống tự nhập credential, quan sát giao diện và nhấn logout. Codex chỉ hậu kiểm database/metadata/log theo chế độ read-only; không dùng Bearer token, không gọi mutation, không xóa token và không sửa database.

## Kết luận

- Login thành công và giao diện hiển thị dữ liệu phục hồi theo xác nhận trực tiếp của chủ hệ thống.
- Dữ liệu nghiệp vụ không thay đổi; 45 bảng, 86 FK và 0 orphan vẫn nguyên vẹn.
- 19 token baseline không bị xóa hoặc sửa ngoài ý muốn.
- **Logout server-side không đạt**: token mới ID `210` vẫn tồn tại, expiration `null`; binlog không có `Delete_rows`.
- Client đã trở về Login theo xác nhận của người dùng, nhưng không thể xem đây là logout an toàn vì token server chưa bị thu hồi.
- **NO-GO cho tiếp tục sử dụng Admin localhost**, kể cả với mục tiêu read-only, cho đến khi xác định nguyên nhân, sửa luồng và được phê duyệt thu hồi chính xác token ID `210`.
- Business writes vẫn `false`; không có business mutation hoặc thay đổi tài chính.

## 1. URL và kiểm tra giao diện

- Admin Login: `http://127.0.0.1:5173/login`.
- Backend API: `http://127.0.0.1:8000`.
- Frontend bind: `127.0.0.1:5173`, không bind LAN/Internet và không trỏ QA 8011.
- Chủ hệ thống xác nhận login thành công, dữ liệu cũ xuất hiện và đã kiểm tra trực tiếp website.
- Các màn hình nằm trong checklist: Dashboard, Khách hàng, Đơn hàng/chi tiết, Phiếu thanh toán, Hóa đơn, Kho Trung Quốc và Kho Việt Nam.
- Không có bằng chứng về nút mutation nghiệp vụ được sử dụng.

## 2. Token trước login, sau login và sau logout

Baseline trước login:

- 19 token IDs: `40, 41, 42, 43, 44, 45, 46, 61, 62, 63, 64, 65, 66, 75, 76, 77, 78, 207, 208`.
- Metadata digest: `1050a78ca85249a0949328b59a1478e0bb34f322e48ab45e2ffc4086a666211b`.

Sau login:

- 20 token.
- Token mới: ID `210`, principal nội bộ `App\Models\User` ID 1, name `api-token`.
- Created at: `2026-11-15 13:27:14 +07:00`.

Sau khi người dùng nhấn logout:

- Vẫn 20 token.
- Token ID `210` vẫn tồn tại.
- Last used at: `2026-11-15 13:37:24 +07:00`.
- Expiration: `null`.
- Metadata digest riêng của đúng 19 token cũ vẫn là `1050a78ca85249a0949328b59a1478e0bb34f322e48ab45e2ffc4086a666211b`, khớp tuyệt đối baseline.

Kết luận kỹ thuật:

- 19 token cũ không bị xóa, revoke hoặc cập nhật trong phiên thử nghiệm.
- Token thử nghiệm ID `210` chưa được revoke.
- Việc client hiển thị trang Login không chứng minh server revoke; token database còn tồn tại và không có expiration.
- Không đọc hoặc lưu token value/hash trong báo cáo.

## 3. Database hậu kiểm

| Chỉ số | Baseline | Sau logout | Kết luận |
|---|---:|---:|---|
| Base tables | 45 | 45 | Không đổi |
| Exact rows | 601 | 602 | +1 token ID 210 còn tồn tại |
| Foreign keys | 86 | 86 | Không đổi |
| Orphan rows | 0 | 0 | Không đổi |
| Customers | 10 | 10 | Không đổi |
| Users | 11 | 11 | Không đổi |
| Orders | 37 | 37 | Không đổi |
| Payment vouchers | 21 | 21 | Không đổi |
| Payment transactions | 18 | 18 | Không đổi |
| Invoices | 13 | 13 | Không đổi |
| CN batches | 10 | 10 | Không đổi |
| CN packages | 20 | 20 | Không đổi |
| VN packages | 16 | 16 | Không đổi |
| Personal access tokens | 19 | 20 | Token 210 chưa revoke |
| Customer accounts | 0 | 0 | Không đổi |
| Email verification tokens | 0 | 0 | Không đổi |
| Password reset tokens | 0 | 0 | Không đổi |
| Customer account audit logs | 0 | 0 | Không đổi |

Business-table checksum digest trước/sau:

`87ca57bd816c6fe0621c9bdeeae75b16463eb0b9dc0ad18ac69fd5c66f5c0491`

Digest khớp tuyệt đối. Nó bao phủ các bảng nghiệp vụ và loại trừ các bảng token/audit xác thực được phép thay đổi trong test. Không có sai lệch customers, orders, vouchers, transactions, invoices, kho hoặc tài chính.

## 4. Runtime và khóa ghi

- Environment: `local`.
- `APP_DEBUG=false`.
- `BUSINESS_WRITES_ENABLED=false`.
- Effective database: `127.0.0.1:3310/logistics_system`.
- Current user: `viettrung_app@127.0.0.1`.
- UUID: `38314517-e061-11f1-9329-b44506abce66`.
- Datadir: `C:\ProgramData\VietTrungOrder\MySQL\8.4\data\`.
- MySQL service `VietTrungMySQL84`: Running.

Không chạy PHPUnit, migration, import, replay hoặc business mutation trên 3310.

## 5. Binary log

Marker trước login:

- `binlog.000009:1416`.

Marker cuối:

- `binlog.000009:37110`.
- Executed GTID set: rỗng.

Binlog được copy sang file tạm và decode bằng MySQL 8.4 compatible `mysqlbinlog --base64-output=DECODE-ROWS -vv`, chỉ đoạn position `1416–37110`; không replay.

Tóm tắt row events:

| Table | Action | Event/row count | Primary ID | Positions |
|---|---|---:|---:|---|
| `logistics_system.personal_access_tokens` | INSERT | 1 | 210 | start 1694, end 1857 |
| `logistics_system.personal_access_tokens` | UPDATE | 57 | 210 | start positions 2175–36779; cuối event end 37079 |
| `logistics_system.personal_access_tokens` | DELETE | 0 | — | Không có |

Transaction tạo token:

- timestamp `2026-11-15 13:27:14 +07:00`;
- BEGIN position 1495;
- Write_rows position 1694, end 1857;
- XID 5130; commit end position 1888.

57 transaction UPDATE còn lại chỉ chạm primary ID 210, từ `13:27:22` đến `13:37:24`, phù hợp với Sanctum cập nhật `last_used_at` khi các GraphQL request có xác thực được thực hiện. Transaction cuối: BEGIN 36571, Update_rows 36779–37079, XID 9757, commit end 37110.

Không có row event trên bất kỳ bảng nghiệp vụ nào. Không có DELETE của ID 210, vì vậy logout server-side không thể được xác nhận.

## 6. Log hậu kiểm đã redacted

MySQL error log:

- last write `2026-11-15T11:19:00+07:00`, trước 5B2-F;
- từ `13:20` đến hết hậu kiểm: 0 ERROR, 0 Warning, 0 System entry mới.

Laravel log:

- last write `2026-11-15T13:00:30+07:00`, trước 5B2-F;
- không có entry mới trong login/UI/logout test.

Vite/browser console capture:

- không có compile error, network exception hoặc backend stack trace;
- có các warning không chặn luồng: Ant Design deprecated props (`Space`, `Spin`, `Table`, `Modal`, `Tag`), một Refine `useForm` customer edit thiếu ID và một Form instance chưa gắn form element;
- không có credential, Bearer token, cookie hoặc dữ liệu khách hàng được đưa vào báo cáo.

## 7. Nhận định logout

Backend code và QA automated tests từng chứng minh resolver có thể xóa đúng current token. Tuy nhiên production-local browser test lần này cho kết quả trái với invariant:

- client chuyển về Login;
- database vẫn giữ token 210;
- binlog không có Delete_rows;
- không có server log đủ chi tiết để xác định request logout đã không được gửi, bị lỗi hay dùng client path khác.

Không suy đoán một nguyên nhân duy nhất khi chưa có Network trace đã redacted. Cần kiểm tra lại trên QA/browser DevTools với điều kiện không ghi token value.

## 8. Việc bắt buộc trước khi dùng lại Admin localhost

1. Không sử dụng tiếp token/session thử nghiệm.
2. Xin phê duyệt riêng để thu hồi **chính xác token ID 210** sau khi xác minh lại owner/timestamps; không xóa 19 token baseline.
3. Reproduce logout trên QA với DevTools Network, chỉ ghi status/operation/result:
   - POST `/graphql` có operation `Logout`;
   - request có Authorization nhưng không lưu giá trị;
   - response phải có `data.logout=true`;
   - request kế tiếp bằng token cũ phải bị từ chối.
4. Xác định vì sao UI chuyển về Login dù server không có DELETE. Bổ sung thông báo lỗi hữu hình và cấm client redirect/clear credential nếu chưa có `logout=true`.
5. Thêm browser-level E2E cho Admin Panel logout, không chỉ backend feature test.
6. Sau fix, lặp lại một phiên QA, rồi một phiên localhost được phê duyệt; yêu cầu token count trở về baseline và binlog có đúng một Delete_rows cho token thử nghiệm.
7. Hardening còn tồn tại trước full use: token expiry, abilities tối thiểu, kế hoạch 19 token cũ, ACL config cache, DB credential rotation, root hardening, HTTPS/SMTP và xác nhận nghiệp vụ tài chính.

## 9. GO/NO-GO

- **NO-GO cho Admin localhost ở thời điểm hiện tại**, kể cả chế độ chỉ đọc, vì logout không revoke token server và token ID 210 còn hiệu lực không thời hạn.
- **NO-GO tuyệt đối** cho full use, business writes hoặc Internet-facing.
- Database phục hồi và dữ liệu nghiệp vụ vẫn đạt toàn vẹn; blocker hiện tại thuộc session/token lifecycle, không phải mất hoặc sai lệch dữ liệu.

Không tự thu hồi token 210, không sửa 19 token cũ, không bật business writes, không public website và không commit/push.
