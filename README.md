# Logistics System - Chrome Extension + Backend

A comprehensive logistics management system for order processing, warehouse management (China & Vietnam), shipping, invoicing, and delivery tracking.

## 📁 Project Structure

```
extention/
├── manifest.json           # Chrome extension manifest
├── content.js             # Tmall product scraper
├── background.js          # Service worker
├── popup.html             # Extension UI
├── popup.js               # Extension logic
├── popup.css              # Extension styling
├── icons/                 # Extension icons
├── database_schema.sql   # Complete database schema
├── BACKEND_SETUP.md       # Backend setup instructions
└── backend/              # Laravel API (to be created)
```

## 🚀 Quick Start

### 1. Prerequisites
- **Laragon**: Full, WAMP, or XAMPP (for MySQL & PHP)
- **Node.js**: v18+ (for Frontend)
- **Google Chrome**: For the extension

### 2. Backend API Setup
1. **Import Database**:
   - Open HeidiSQL or MySQL client.
   - Create database `logistics_system`.
   - Run script: `c:\laragon\www\extention\database_schema.sql`.
2. **Setup API**:
   - The system works with standalone PHP API out-of-the-box (`api/` folder).
   - Ensure you can access: `http://localhost/extention/api/customers.php`.

### 3. Frontend Setup
1. Open terminal in `frontend/` folder.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start the dashboard at `http://localhost:3000`.

### 4. Chrome Extension Setup
1. Open Chrome -> `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** -> Select `c:\laragon\www\extention` folder.
5. The extension will now be active when visiting Tmall/Taobao

**Usage:**
- Visit any Tmall/Taobao product page
- Click the extension icon
- Review extracted product information
- Add to cart with quantity and notes
- Switch to "Giỏ hàng" tab to create orders

### 2. Database Setup

Import the database schema into MySQL:

```bash
# Using MySQL command line
mysql -u root -p < database_schema.sql

# Or using Laragon's HeidiSQL
# 1. Open HeidiSQL from Laragon
# 2. File → Run SQL file
# 3. Select database_schema.sql
# 4. Execute
```

This creates:
- Database: `logistics_system`
- 15 tables with relationships
- Default admin user: `admin@logistics.com` / `admin123`
- Default warehouses and shipping rates

### 3. Backend API

See [BACKEND_SETUP.md](./BACKEND_SETUP.md) for Laravel installation instructions.

## 📦 Features  

### Phase 1 (Current)

✅ **Chrome Extension**
- Product scraping from Tmall/Taobao
- Shopping cart management
- Order creation interface

✅ **Database Schema**
- Complete relational database design
- User roles & permissions
- Order management
- Warehouse tracking (CN & VN)  
- Invoicing & payments
- Shipping rates
- Delivery tracking

🔨 **In Progress**
- Laravel backend API
- Vue 3 frontend application

### Phase 1 Modules (Planned)

1. **User Management** - Role-based access control
2. **Customer Management** - Customer database
3. **Order Management** - Order approval workflow
4. **China Warehouse** - Package tracking and matching
5. **China Batches** - Batch creation and management
6. **Vietnam Warehouse** - 2-step import verification
7. **Shipping Rates** - Rate table management
8. **Invoicing** - Invoice generation and payments
9. **Delivery** - Export and delivery tracking
10. **Reports & Analytics**

## 🔐 User Roles

- **Admin**: Full system access
- **Customer Service**: Order and customer management
- **Accountant**: Invoice and payment management
- **Delivery Staff**: Delivery management

## 💾 Database Tables

| Category | Tables |
|----------|--------|
| Auth | roles, users |
| Customers | customers |
| Orders | orders, order_items |
| CN Warehouse | cn_warehouses, cn_packages, cn_batches|
| VN Warehouse | vn_warehouses, vn_packages |
| Shipping | shipping_rates, shipping_rate_details |
| Finance | invoices, invoice_items, payments |
| Delivery | exports, export_items |

## 🛠️ Tech Stack

- **Extension**: Vanilla JavaScript (Manifest V3)
- **Backend**: Laravel 10+ (PHP 8.0+)
- **Frontend**: Vue 3 + Composition API
- **Database**: MySQL 8.0
- **Dev Environment**: Laragon

## 📝 API Documentation

See `implementation_plan.md` for complete API endpoint specifications.

## 🧪 Testing

### Extension Testing
1. Visit https://www.tmall.com
2. Navigate to any product page
3. Click extension icon
4. Verify product data extraction
5. Test cart functionality

### Backend Testing (After Laravel setup)
```bash
cd backend
php artisan test
```

## 📸 Screenshots

The extension includes a modern purple-gradient UI with:
- Product information display
- Cart management
- Settings configuration
- Status notifications

## 🤝 Contributing

This is Phase 1 of development. Future phases include:
- Customer portal
- GraphQL API
- Mobile app
- Real-time notifications

## 📄 License

Proprietary - FGC Techlution

---

**Created:** 27/01/2025  
**Version:** 1.0.0  
**Status:** Phase 1 Development
