# Frontend Setup Guide

The frontend is built with **Vue 3** and uses **Vanilla CSS** for styling.

## Prerequisites

- Node.js (v18+ recommended)
- NPM (v9+)

## Installation

1. Open terminal in `frontend` directory:
   ```bash
   cd c:\laragon\www\extention\frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running Development Server

To start the frontend hot-reload server:

```bash
npm run dev
```

Access the application at: `http://localhost:3000`

## Configuration

The API URL is configured in views (e.g., `src/views/OrdersView.vue`).
Default is: `http://localhost/extention/api`

## Project Structure

- `src/`
  - `views/` - Page components (Dashboard, Orders, Customers)
  - `components/` - Reusable components (Layouts, UI elements)
  - `router/` - Navigation configuration
  - `assets/` - CSS and static files

## Features Implemented

- **Dashboard**: Overview statistics
- **Orders**: List of all orders with status
- **Customers**: List of customers from database
- **Layout**: Clean sidebar navigation

## Next Steps

- Implement Order Details view
- Add edit functionality for Customers
- Build Warehouse Management module
