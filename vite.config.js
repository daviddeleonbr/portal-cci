import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Auto-update silencioso: SW novo é baixado em background e ativa na próxima abertura.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'CCI · Portal do Cliente',
        short_name: 'CCI',
        description: 'Portal de BPO contábil — gestão financeira, vendas e operação de postos.',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        // Quando instalado no celular, o PWA abre direto na tela de login do
        // cliente — não faz sentido jogar o user na landing pública. No
        // browser normal, "/" continua sendo a home (start_url só vale pro PWA).
        start_url: '/cliente/login',
        lang: 'pt-BR',
        icons: [
          { src: 'pwa-64x64.png',           sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png',         sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',         sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cresce o limite — bundles do app têm chunks >2MB.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Precaches o shell estático (HTML/JS/CSS/imagens do build).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Network-first pra dados dinâmicos: tenta rede primeiro, cai pro cache se offline.
        runtimeCaching: [
          {
            // Supabase REST + Storage + Edge Functions
            urlPattern: ({ url }) => /\.supabase\.(co|net)$/.test(url.hostname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Fontes Google (Geist via npm já vem no bundle; se algum dia importar webfonts)
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
        // SPA: rotas client-side caem no index.html quando offline.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      // Modo dev: SW desativado por padrão (evita confusão com HMR). Habilite localmente
      // se precisar testar o SW antes do build.
      devOptions: { enabled: false },
    }),
  ],
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
