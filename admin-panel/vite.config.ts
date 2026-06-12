import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const getPackageName = (id: string) => {
  const normalizedId = id.replace(/\\/g, '/')
  const parts = normalizedId.split('node_modules/')

  if (parts.length < 2) {
    return null
  }

  const packagePath = parts[1]

  if (packagePath.startsWith('@')) {
    const [scope, name] = packagePath.split('/')
    return scope && name ? `${scope}/${name}` : null
  }

  return packagePath.split('/')[0] ?? null
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          const packageName = getPackageName(id)

          if (id.includes('react') || id.includes('scheduler')) {
            return 'react-vendor'
          }

          if (id.includes('react-router')) {
            return 'router-vendor'
          }

          if (id.includes('@refinedev')) {
            return 'refine-vendor'
          }

          if (packageName === '@ant-design/icons') {
            return 'ant-icons'
          }

          if (packageName === 'antd') {
            const normalizedId = id.replace(/\\/g, '/')
            const componentMatch = normalizedId.match(/antd\/es\/([^/]+)/)

            if (componentMatch?.[1]) {
              return `antd-${componentMatch[1]}`
            }

            return 'antd-core'
          }

          if (packageName?.startsWith('rc-')) {
            return packageName.replace(/[^a-z0-9-]/gi, '-')
          }

          if (packageName?.startsWith('@rc-component/')) {
            return packageName.replace(/[@/]/g, '-')
          }

          if (id.includes('graphql-request') || id.includes('graphql') || id.includes('axios')) {
            return 'data-vendor'
          }
        },
      },
    },
  },
})
