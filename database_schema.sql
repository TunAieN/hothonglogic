-- =============================================
-- Logistics System Database Schema
-- Database: logistics_system
-- =============================================

CREATE DATABASE IF NOT EXISTS logistics_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE logistics_system;

-- =============================================
-- USERS & ROLES
-- =============================================

CREATE TABLE roles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE COMMENT 'Admin, Customer Service, Accountant, Delivery Staff',
    permissions JSON COMMENT 'JSON array of permissions',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role_id BIGINT UNSIGNED NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CUSTOMERS
-- =============================================

CREATE TABLE customers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE COMMENT 'Customer code',
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    address TEXT,
    note TEXT,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- ORDERS
-- =============================================

CREATE TABLE orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_code VARCHAR(50) NOT NULL UNIQUE,
    customer_id BIGINT UNSIGNED NOT NULL,
    status ENUM('pending', 'approved', 'cancelled') DEFAULT 'pending',
    total_amount DECIMAL(15, 2) DEFAULT 0,
    note TEXT,
    created_by BIGINT UNSIGNED NOT NULL COMMENT 'User who created the order',
    approved_by BIGINT UNSIGNED NULL COMMENT 'Admin who approved',
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_link TEXT,
    price_cny DECIMAL(10, 2) NOT NULL COMMENT 'Price in Chinese Yuan',
    quantity INT NOT NULL DEFAULT 1,
    note TEXT,
    tracking_number VARCHAR(100) COMMENT 'Tracking number after purchase',
    product_image TEXT COMMENT 'Product image URL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CHINA WAREHOUSE
-- =============================================

CREATE TABLE cn_warehouses (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE COMMENT 'e.g., QC for Guangzhou',
    name VARCHAR(100) NOT NULL,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cn_packages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    warehouse_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NULL COMMENT 'If matched to an order',
    tracking_number VARCHAR(100) NOT NULL UNIQUE,
    weight DECIMAL(8, 2) COMMENT 'Weight in kg',
    volume DECIMAL(10, 2) COMMENT 'Volume in cm³',
    note TEXT,
    status ENUM('matched', 'unmatched') DEFAULT 'unmatched',
    batch_id BIGINT UNSIGNED NULL COMMENT 'Batch this package belongs to',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES cn_warehouses(id) ON DELETE RESTRICT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    INDEX idx_tracking_number (tracking_number),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CHINA BATCHES
-- =============================================

CREATE TABLE cn_batches (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    batch_code VARCHAR(50) NOT NULL UNIQUE COMMENT 'Format: QC-DDMMYYYY-N',
    warehouse_id BIGINT UNSIGNED NOT NULL,
    total_packages INT DEFAULT 0,
    total_weight DECIMAL(10, 2) DEFAULT 0,
    status ENUM('new', 'imported_to_vn') DEFAULT 'new',
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES cn_warehouses(id) ON DELETE RESTRICT,
    INDEX idx_batch_code (batch_code),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add foreign key for cn_packages to batches
ALTER TABLE cn_packages
ADD CONSTRAINT fk_cn_packages_batch
FOREIGN KEY (batch_id) REFERENCES cn_batches(id) ON DELETE SET NULL;

-- =============================================
-- VIETNAM WAREHOUSE
-- =============================================

CREATE TABLE vn_warehouses (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vn_packages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cn_batch_id BIGINT UNSIGNED NOT NULL,
    cn_package_id BIGINT UNSIGNED NOT NULL,
    actual_weight DECIMAL(8, 2) NOT NULL COMMENT 'Actual weight measured in VN',
    actual_volume DECIMAL(10, 2) COMMENT 'Actual volume measured in VN',
    inspection_status ENUM('pending', 'inspected', 'damaged') DEFAULT 'pending',
    note TEXT,
    received_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cn_batch_id) REFERENCES cn_batches(id) ON DELETE RESTRICT,
    FOREIGN KEY (cn_package_id) REFERENCES cn_packages(id) ON DELETE RESTRICT,
    INDEX idx_inspection_status (inspection_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SHIPPING RATES
-- =============================================

CREATE TABLE shipping_rates (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    valid_from DATE NOT NULL,
    valid_to DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_valid_dates (valid_from, valid_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shipping_rate_details (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    rate_id BIGINT UNSIGNED NOT NULL,
    weight_from DECIMAL(8, 2) NOT NULL COMMENT 'From weight in kg',
    weight_to DECIMAL(8, 2) NOT NULL COMMENT 'To weight in kg',
    price_per_kg DECIMAL(10, 2) NOT NULL COMMENT 'Price per kg in VND',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (rate_id) REFERENCES shipping_rates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- INVOICES & PAYMENTS
-- =============================================

CREATE TABLE invoices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_code VARCHAR(50) NOT NULL UNIQUE,
    customer_id BIGINT UNSIGNED NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
    note TEXT,
    created_by BIGINT UNSIGNED NOT NULL,
    confirmed_by BIGINT UNSIGNED NULL,
    confirmed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id BIGINT UNSIGNED NOT NULL,
    vn_package_id BIGINT UNSIGNED NOT NULL,
    weight DECIMAL(8, 2) NOT NULL,
    volume DECIMAL(10, 2),
    shipping_fee DECIMAL(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (vn_package_id) REFERENCES vn_packages(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    payment_method ENUM('cash', 'bank_transfer', 'credit_card', 'other') DEFAULT 'bank_transfer',
    payment_date TIMESTAMP NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- EXPORT/DELIVERY
-- =============================================

CREATE TABLE exports (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    export_code VARCHAR(50) NOT NULL UNIQUE,
    invoice_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_staff_id BIGINT UNSIGNED NULL,
    status ENUM('pending', 'in_transit', 'delivered', 'returned') DEFAULT 'pending',
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (delivery_staff_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE export_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    export_id BIGINT UNSIGNED NOT NULL,
    vn_package_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (export_id) REFERENCES exports(id) ON DELETE CASCADE,
    FOREIGN KEY (vn_package_id) REFERENCES vn_packages(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SEED DATA
-- =============================================

-- Insert default roles
INSERT INTO roles (name, permissions) VALUES
('Admin', '["all"]'),
('Customer Service', '["orders.create", "orders.update", "orders.read", "customers.all"]'),
('Accountant', '["invoices.all", "payments.all", "shipping_rates.all"]'),
('Delivery Staff', '["exports.read", "exports.update"]');

-- Insert default admin user (password: admin123)
INSERT INTO users (name, email, password, role_id, phone, address, status) VALUES
('Admin', 'admin@logistics.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1, '0123456789', 'Admin Address', 'active');

-- Insert default Guangzhou warehouse
INSERT INTO cn_warehouses (code, name, address) VALUES
('QC', 'Kho Quảng Châu', 'Guangzhou, China');

-- Insert default Vietnam warehouse
INSERT INTO vn_warehouses (code, name, address) VALUES
('VN', 'Kho Việt Nam', 'Hà Nội, Việt Nam');

-- Insert sample shipping rates (current year)
INSERT INTO shipping_rates (valid_from, valid_to) VALUES
(CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR));

-- Get the last inserted rate_id and insert details
SET @rate_id = LAST_INSERT_ID();
INSERT INTO shipping_rate_details (rate_id, weight_from, weight_to, price_per_kg) VALUES
(@rate_id, 0, 1, 50000),
(@rate_id, 1, 5, 45000),
(@rate_id, 5, 10, 40000),
(@rate_id, 10, 20, 35000),
(@rate_id, 20, 50, 30000),
(@rate_id, 50, 100, 25000);
