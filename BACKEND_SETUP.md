# Logistics System Backend - Laravel API

This directory will contain the Laravel backend API for the logistics system.

## Setup Instructions

Since Laravel installation via composer is having issues, you can set it up manually:

### Option 1: Using Laragon's Quick Create
1. Open Laragon
2. Right-click Menu → Quick app → Laravel
3. Name it "backend"
4. This will create the Laravel app in the current directory

### Option 2: Manual Install
```bash
cd c:\laragon\www\extention
composer create-project laravel/laravel backend
```

### Option 3: Download Laravel Directly
Download Laravel from https://github.com/laravel/laravel and extract to `backend/` folder

## After Installation

1. Configure `.env` file with database credentials
2. Run migrations: `php artisan migrate`
3. Start development server: `php artisan serve`

## API Endpoints

The backend will provide RESTful API endpoints for:
- Authentication
- Customer Management  
- Order Management
- Warehouse Management (CN & VN)
- Invoice & Payment Management
- Shipping Rate Management
- User Management

See `implementation_plan.md` for complete API documentation.
