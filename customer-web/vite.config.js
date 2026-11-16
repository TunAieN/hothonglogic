import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/customer-auth': 'http://127.0.0.1:8000',
      '/customer-portal': 'http://127.0.0.1:8000',
      '/sanctum': 'http://127.0.0.1:8000',
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        services: fileURLToPath(new URL('./dich-vu/index.html', import.meta.url)),
        pricing: fileURLToPath(new URL('./bang-gia/index.html', import.meta.url)),
        about: fileURLToPath(new URL('./gioi-thieu/index.html', import.meta.url)),
        help: fileURLToPath(new URL('./huong-dan/index.html', import.meta.url)),
        helpTool: fileURLToPath(new URL('./huong-dan/cong-cu-dat-hang/index.html', import.meta.url)),
        helpOrder: fileURLToPath(new URL('./huong-dan/chuan-bi-yeu-cau-mua-ho/index.html', import.meta.url)),
        helpTracking: fileURLToPath(new URL('./huong-dan/theo-doi-trang-thai-don/index.html', import.meta.url)),
        login: fileURLToPath(new URL('./dang-nhap/index.html', import.meta.url)),
        register: fileURLToPath(new URL('./dang-ky/index.html', import.meta.url)),
        forgotPassword: fileURLToPath(new URL('./quen-mat-khau/index.html', import.meta.url)),
        resetPassword: fileURLToPath(new URL('./dat-lai-mat-khau/index.html', import.meta.url)),
        customerOverview: fileURLToPath(new URL('./tai-khoan/index.html', import.meta.url)),
        customerOrders: fileURLToPath(new URL('./tai-khoan/don-mua-ho/index.html', import.meta.url)),
        customerCreateOrder: fileURLToPath(new URL('./tai-khoan/tao-don/index.html', import.meta.url)),
        customerCart: fileURLToPath(new URL('./tai-khoan/gio-hang/index.html', import.meta.url)),
        customerOrderHistory: fileURLToPath(new URL('./tai-khoan/lich-su-don/index.html', import.meta.url)),
        customerOrderPayments: fileURLToPath(new URL('./tai-khoan/thanh-toan-don/index.html', import.meta.url)),
        customerOrderDetail: fileURLToPath(new URL('./tai-khoan/don-mua-ho/chi-tiet/index.html', import.meta.url)),
        customerConsignments: fileURLToPath(new URL('./tai-khoan/ky-gui/index.html', import.meta.url)),
        customerConsignmentCreate: fileURLToPath(new URL('./tai-khoan/ky-gui/tao-moi/index.html', import.meta.url)),
        customerTracking: fileURLToPath(new URL('./tai-khoan/tra-cuu/index.html', import.meta.url)),
        customerWallet: fileURLToPath(new URL('./tai-khoan/vi/index.html', import.meta.url)),
        customerPortalPricing: fileURLToPath(new URL('./tai-khoan/bang-gia/index.html', import.meta.url)),
        customerAddresses: fileURLToPath(new URL('./tai-khoan/dia-chi/index.html', import.meta.url)),
        customerNotifications: fileURLToPath(new URL('./tai-khoan/thong-bao/index.html', import.meta.url)),
        customerSettings: fileURLToPath(new URL('./tai-khoan/cai-dat/index.html', import.meta.url)),
        customerSupport: fileURLToPath(new URL('./tai-khoan/ho-tro/index.html', import.meta.url)),
      },
    },
  },
})
