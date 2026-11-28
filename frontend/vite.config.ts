import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/workspaces': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/organizations': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/calls': { target: 'http://127.0.0.1:8000', changeOrigin: true, ws: true },
    },
  },
})
