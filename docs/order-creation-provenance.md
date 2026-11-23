# Nguồn tạo đơn và người thực hiện

## Quy ước dữ liệu

`orders.created_by` chỉ mang nghĩa **nhân viên trực tiếp tạo đơn**. Cột này không được dùng để chứa nhân viên được chọn tự động, nhân viên gần nhất của khách, hoặc người được phân công xử lý sau đó.

| Trường | Đơn khách tự gửi | Đơn nhân viên tạo |
| --- | --- | --- |
| `customer_id` | Khách sở hữu đơn | Khách sở hữu đơn |
| `creation_source` | `customer_portal` | `admin_portal` |
| `submitted_by_customer_account_id` | Tài khoản khách trong session | `NULL` |
| `submitted_at` | Giờ server nhận yêu cầu | `NULL` |
| `created_by` | `NULL` | ID nhân viên đang đăng nhập |
| `account_manager_id` | `NULL` cho tới khi phân công | Nhân viên phụ trách nếu được phân công |
| `approved_by`, `approved_at` | Chỉ ghi khi có thao tác duyệt riêng | Chỉ ghi khi có thao tác duyệt riêng |

Các đơn lịch sử không có bằng chứng nguồn được gán `creation_source=legacy`; không suy diễn chúng là đơn nhân viên hay đơn khách tự gửi.

## Migration chuẩn bị

Migration: `database/migrations/2026_11_18_000001_add_order_creation_provenance.php`.

Migration chỉ:

1. Cho phép `orders.created_by` nhận `NULL` nhưng giữ nguyên khóa ngoại tới `users.id`.
2. Thêm `creation_source` với mặc định an toàn `legacy` và index.
3. Thêm `submitted_by_customer_account_id` nullable, khóa ngoại RESTRICT tới `customer_accounts.id`.
4. Thêm `submitted_at` nullable.

Không đổi trạng thái, giá, đơn hàng, khách hàng hoặc dòng sản phẩm hiện có. Không phụ thuộc hai bảng giỏ hàng/bản nháp.

## Triển khai an toàn

- Chạy thử migration trên QA `127.0.0.1:3311/logistics_system_test` sau khi QA hoạt động và đã có schema production tương đương.
- Chụp schema/count trước và sau; xác minh toàn bộ đơn cũ có `creation_source=legacy`, các FK/index còn nguyên.
- Chỉ sau phê duyệt riêng mới chạy đúng file migration trên production. Không chạy toàn bộ migration pending.
- Triển khai backend sau migration. Nếu backend chạy trước migration, endpoint trả HTTP 503 có thông báo nghiệp vụ; không gán nhân viên giả và không bắt đầu transaction tạo đơn.

## Khôi phục

Rollback tự động bị chặn nếu đã có đơn khách tự gửi hoặc `created_by IS NULL`, vì ép lại NOT NULL sẽ làm mất tính đúng đắn dữ liệu. Khi đó dùng backup đã kiểm chứng hoặc một forward migration đã review; không tự xóa cột hay gán nhân viên giả để rollback.

## Rehearsal ngày 18/11/2026

- Backup mới: `E:\MySQL_VietTrung_Backups\manual\customer_provenance_20261118_222808\logistics_system.sql`.
- SHA-256: `59A0E176764818B372F6EC71F4EDA2699D2E58084B7325013454EA125C41F5EE`.
- Dump không có `USE logistics_system`, `CREATE DATABASE` hoặc `DROP DATABASE`.
- Restore thành công trên MySQL 8.4.3 cô lập; 12 customers, 37 orders, 56 order_items và 3 customer_accounts.
- Migration `--pretend` và migration thật đều đạt trên bản restore.
- 37 đơn cũ giữ nguyên toàn bộ giá trị cột cũ và `created_by`; cả 37 được gán nguồn an toàn `legacy`.
- FK `created_by -> users.id` vẫn là RESTRICT; FK mới `submitted_by_customer_account_id -> customer_accounts.id` là RESTRICT.
- Integration rehearsal tạo 3 SKU, retry idempotency, phân công nhân viên và tạo đơn bằng staff đều đạt; transaction ngoài được rollback, không giữ dữ liệu thử.
- Backend chọn lọc: 19 test, 62 assertions đạt. Customer Web: 42 test đạt; lint/build đạt. Admin lint/build đạt.
- Instance rehearsal đã được shutdown graceful; backup và datadir rehearsal được giữ lại.
