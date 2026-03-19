# HỒ SƠ CHI TIẾT CÁC BƯỚC PHÁT TRIỂN DỰ ÁN LOGISTICS

Tài liệu này mô tả chi tiết từng bước đã thực hiện để xây dựng hệ thống quản lý Logistics và Extension đặt hàng Tmall/Taobao, bao gồm **các câu lệnh thực thi** cụ thể.

---

## GIAI ĐOẠN 1: XÂY DỰNG CHROME EXTENSION (CÔNG CỤ ĐẶT HÀNG)

Mục tiêu: Tạo công cụ cài vào trình duyệt để lấy thông tin sản phẩm từ Taobao/Tmall và gửi về hệ thống.

### Bước 1.1: Khởi tạo Extension
- **Tạo `manifest.json`**: File cấu hình cốt lõi.
- **Tạo Icon**: Thiết kế bộ icon nhận diện cho extension.

### Bước 1.2: Xử lý Content Script (Lấy dữ liệu trang web)
*(Xem chi tiết phân tích logic tại file `CONTENT_SCRIPT_EXPLAINED.md`)*

- **Lệnh thực hiện**:
  Không có lệnh CLI, chỉ viết code Javascript.
  ```javascript
  // Load extension vào Chrome:
  // 1. chrome://extensions/
  // 2. Bật Developer Mode
  // 3. Click "Load unpacked" -> Chọn folder dự án
  ```

### Bước 1.3: Quản lý State & Cart (Background & Storage)
- **Tạo `background.js`**: Service worker chạy ngầm.

### Bước 1.4: Giao diện Popup
- **Thiết kế UI & Logic**: HTML/CSS/JS cho popup.

---

## GIAI ĐOẠN 2: THIẾT KẾ CƠ SỞ DỮ LIỆU (DATABASE)

Mục tiêu: Xây dựng nền tảng lưu trữ vững chắc cho toàn bộ hệ thống.

### Bước 2.1: Phân tích nghiệp vụ & Schema
- Thiết kế **15 bảng MySQL**.
- **Lệnh thực hiện (Tạo Database & Bảng)**:
  Có thể chạy bằng HeidiSQL hoặc dòng lệnh MySQL:
  ```bash
  # 1. Đăng nhập MySQL
  mysql -u root

  # 2. Tạo Database
  CREATE DATABASE logistics_system;

  # 3. Sử dụng Database
  USE logistics_system;

  # 4. Import file schema (chứa lệnh tạo bảng)
  SOURCE c:/laragon/www/extention/database_schema.sql;
  ```

### Bước 2.2: Tạo Seed Data
- Dữ liệu mẫu đã nằm trong file `database_schema.sql`, được import cùng lúc với bước trên.

---

## GIAI ĐOẠN 3: XÂY DỰNG BACKEND API

Mục tiêu: Xử lý logic nghiệp vụ và kết nối Extension với Database.

### Bước 3.1: Khởi tạo Laravel & Cấu hình
- **Lệnh thực hiện**:
  ```bash
  # Vào thư mục project
  cd c:\laragon\www\extention\backend

  # Cài đặt dependencies (nếu chưa có)
  composer install

  # Copy file môi trường
  copy .env.example .env

  # Tạo Key ứng dụng
  php artisan key:generate

  # Chạy server
  php artisan serve --port=8000
  ```

### Bước 3.2: Xây dựng API "Chống cháy" (Standalone PHP)
- Do lỗi Composer, ta tạo API thuần PHP (`api/orders.php`, `api/customers.php`).
- **Cách chạy**:
  Không cần lệnh đặc biệt, Laragon tự động serve các file PHP này tại:
  `http://localhost/extention/api/customers.php`

### Bước 3.3: Xây dựng API Laravel Chuẩn
- **Lệnh tạo Model & Controller**:
  ```bash
  # Tạo nòng cốt cho Khách hàng
  php artisan make:model Customer -m
  php artisan make:controller Api/CustomerController --api

  # Tạo nòng cốt cho Đơn hàng
  php artisan make:model Order -m
  php artisan make:controller Api/OrderController --api
  ```

---

## GIAI ĐOẠN 4: FRONTEND MANANGEMENT (TRANG QUẢN TRỊ)

Mục tiêu: Trang web cho Admin/Nhân viên quản lý đơn hàng.

### Bước 4.1: Khởi tạo Vue 3 Project
- **Lệnh thực hiện**:
  ```bash
  # Vào thư mục gốc
  cd c:\laragon\www\extention

  # Tạo project Vue (dùng Vite)
  npm create vite@latest frontend -- --template vue

  # Vào thư mục frontend
  cd frontend

  # Cài đặt thư viện cần thiết
  npm install vue-router pinia axios
  ```

### Bước 4.2: Xây dựng Giao diện & Layout
- Quy hoạch folder `src/views`, `src/components`.

### Bước 4.3: Phát triển & Chạy thử
- **Lệnh thực hiện**:
  ```bash
  # Chạy server development (Hot reload)
  npm run dev
  ```
  Truy cập tại: `http://localhost:3000`

---

## TỔNG KẾT HỆ THỐNG HIỆN TẠI

1.  **Extension**: Đã hoạt động tốt.
2.  **Database**: Đầy đủ 15 bảng.
3.  **Backend**: API (PHP thuần + Laravel) đã sẵn sàng.
4.  **Frontend**: Dashboard đã chạy.

**Bước tiếp theo cần làm:**
- Module "Kho hàng Trung Quốc":
  ```bash
  # Dự kiến lệnh tạo Controller kho
  php artisan make:controller Api/WarehouseController --api
  ```
