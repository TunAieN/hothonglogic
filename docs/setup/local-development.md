# Local development

Các cổng development được cố định trong `config/local-development.mjs`:

| Thành phần | URL |
| --- | --- |
| Customer Web | `http://localhost:5173` |
| Admin Panel | `http://localhost:5174` |
| Laravel | `http://127.0.0.1:8000` |

Cả hai Vite server dùng `strictPort: true`. Nếu cổng tương ứng đã bị chiếm, Vite dừng với lỗi rõ ràng; nó không tự chuyển sang cổng khác và không dừng tiến trình đang chiếm cổng.

Vite bind trên IPv4 (`0.0.0.0`) để `localhost` và `127.0.0.1` cùng truy cập ổn định trên Windows. Đây chỉ là địa chỉ bind; Customer Extension vẫn chỉ cho phép hai origin local được liệt kê bên dưới và từ chối origin LAN trong service worker.

## Khởi động toàn hệ thống

Terminal 1 — Laravel:

```powershell
cd C:\laragon\www\extention\logistics-backend
php artisan serve --host=127.0.0.1 --port=8000
```

Terminal 2 — Customer Web:

```powershell
cd C:\laragon\www\extention\customer-web
npm run dev
```

Terminal 3 — Admin Panel:

```powershell
cd C:\laragon\www\extention\admin-panel
npm run dev
```

Customer Web giữ nguyên proxy `/customer-auth`, `/customer-portal` và `/sanctum` tới Laravel. Admin tiếp tục dùng `VITE_API_BASE_URL`.

## Customer Extension

Customer Extension local chỉ chấp nhận chính xác `http://localhost:5173` và `http://127.0.0.1:5173` tại runtime. Chrome Manifest match pattern không hỗ trợ giới hạn port, nên manifest giới hạn theo host và service worker thực hiện kiểm tra origin đầy đủ, bao gồm port, trước khi trả lời message.

Sau khi thay đổi cấu hình origin hoặc source Extension, chạy từ thư mục repository:

```powershell
node scripts/build-customer-extension.mjs
node scripts/validate-customer-extension.mjs build/customer-extension
```

Sau đó bấm **Reload** cho Customer Extension tại `chrome://extensions`. Không cần mở popup Extension và không cần chạy Chrome Worker server.
