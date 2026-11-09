import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
      },
    },
  },
})
