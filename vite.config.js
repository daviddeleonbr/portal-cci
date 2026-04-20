import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/quality': {
        target: 'https://web.qualityautomacao.com.br',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/quality/, '/INTEGRACAO'),
        secure: true,
      },
      '/api/asaas-sandbox': {
        target: 'https://api-sandbox.asaas.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/asaas-sandbox/, '/v3'),
        secure: true,
      },
      '/api/asaas': {
        target: 'https://api.asaas.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/asaas/, '/v3'),
        secure: true,
      },
    },
  },
})
