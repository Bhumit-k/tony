import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const BACKEND = 'http://localhost:8420'
const PROXY_PATHS = [
  '/tony',
  '/run',
  '/skills',
  '/companions',
  '/knowledge',
  '/device',
  '/integrations',
  '/health',
  '/whatsapp',
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  build: {
    outDir: '../frontend',
    emptyOutDir: true,
  },
  server: {
    proxy: Object.fromEntries(
      PROXY_PATHS.map((p) => [p, { target: BACKEND, changeOrigin: true }])
    ),
  },
})
