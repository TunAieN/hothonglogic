# Migration 057 — Taobao purchase orders

Trạng thái hiện tại: **chỉ chuẩn bị source, chưa được phép chạy production**.

Migration duy nhất trong phạm vi:

`database/migrations/2026_11_27_000057_create_taobao_purchase_order_domain.php`

Migration tạo ba bảng mới, không sửa hoặc backfill `orders`, `order_items`,
`order_trackings`, `cn_packages`, finance, ví, ledger hay SePay:

- `taobao_purchase_orders`
- `taobao_purchase_order_items`
- `taobao_purchase_order_trackings`

## Preflight bắt buộc trước khi xin phê duyệt chạy

1. Xác minh đích là `127.0.0.1:3310/logistics_system` qua TLS và đúng tài khoản DBA.
2. Xác minh migration 056 đã Ran, migration 057 Pending và không có ba bảng trên.
3. Ghi lại số lượng `orders`, `order_items`, `order_trackings`, `cn_packages`,
   vouchers, transactions, ledger và SePay events.
4. Tạo backup mới tại `C:\VietTrungBackups`, kiểm tra dung lượng và SHA-256.
5. Chạy `--pretend` chỉ cho đúng file 057 và review ba `CREATE TABLE` cùng FK/index.
6. Dừng nếu schema lệch, backup lỗi, TLS/DB identity sai hoặc migration không còn Pending.

Sau khi chủ dự án phê duyệt riêng, chỉ dùng scoped migration:

```powershell
php artisan migrate --path=database/migrations/2026_11_27_000057_create_taobao_purchase_order_domain.php --force
```

Credential phải được nạp bằng môi trường tạm/DPAPI theo quy trình deployment hiện
có; không sửa `.env`, không in secret và không chạy các migration Pending khác.

## Postflight

- Migration 057 là Ran và đúng ba bảng/FK/index.
- Các bảng mới ban đầu có 0 dòng; không backfill đơn cũ.
- Số lượng dữ liệu nghiệp vụ ghi ở preflight không đổi.
- Laravel GraphQL schema hợp lệ; `viettrung_app` đọc được progress mới.
- Chỉ deploy backend/frontend tương thích sau khi schema 057 đã sẵn sàng.

Không tạo đơn mua Taobao, tracking, kiện hay giao dịch giả trên production để thử.
