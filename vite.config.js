import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

// Notas de versão embutidas no bundle (a 1ª entrada = versão do app).
// O mesmo arquivo é servido em /novidades.json p/ a versão antiga ler as
// notas da nova antes de atualizar. Ver src/lib/novidades.js.
const novidades = JSON.parse(readFileSync(new URL('./public/novidades.json', import.meta.url), 'utf-8'))

// Acessibilidade — "Tamanho do texto" (src/lib/tamanhoTexto.js). O app usa
// milhares de tamanhos fixos em px (text-[11px]…), que não acompanham o
// font-size da raiz. Este plugin reescreve TODO `font-size: Npx` do CSS final
// para `calc(Npx * var(--escala-texto, 1))`: com a escala em 1 nada muda.
// Dev: o CSS passa pelo transform; build: pelos assets .css no generateBundle.
function escalaFonte() {
  const temPx = /font-size:\s*\d*\.?\d+px/;
  const trocar = (s) => s.replace(/font-size:\s*(\d*\.?\d+)px/g, (_, n) => `font-size:calc(${n}px * var(--escala-texto, 1))`);
  return {
    name: 'cci-escala-fonte',
    enforce: 'post',
    transform(code, id) {
      if (!/\.css($|\?)/.test(id) || !temPx.test(code)) return null;
      return { code: trocar(code), map: null };
    },
    generateBundle(_opts, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type === 'asset' && f.fileName.endsWith('.css')) f.source = trocar(String(f.source));
      }
    },
  }
}

export default defineConfig({
  define: {
    __NOVIDADES__: JSON.stringify({ versoes: novidades.versoes || [] }),
  },
  plugins: [
    react(),
    tailwindcss(),
    escalaFonte(),
    VitePWA({
      // 'prompt': o SW novo NÃO ativa sozinho — avisamos o usuário (toast
      // "Nova versão disponível") e ele aplica em 1 clique. Ver src/pwaUpdate.js
      // + NovaVersaoToast. Necessário porque a SPA fica muito tempo na mesma
      // page load e o autoUpdate exigia dois carregamentos (logout+login).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'CCI · Portal do Cliente',
        short_name: 'CCI',
        description: 'Portal de BPO contábil — gestão financeira, vendas e operação de postos.',
        // Cor da barra de status do app instalado = fundo do cabeçalho claro.
        // O tema (claro/escuro) troca em runtime pela meta theme-color (useTheme).
        theme_color: '#ffffff',
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
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // bundle único (sem code-splitting) já passa de 5 MiB
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
        // Exclui do fallback (o shell em cache) as APIs e as LANDINGS PÚBLICAS de
        // campanha: navegar direto a /bpo-financeiro deve sempre buscar o index.html
        // vivo na rede, senão um service worker antigo serve um bundle sem a rota e
        // o catch-all "*" redireciona pra "/". Vale para páginas de anúncio, que
        // precisam abrir na versão atual mesmo em visitantes com PWA já em cache.
        navigateFallbackDenylist: [/^\/api\//, /^\/bpo-financeiro(\/|$)/],
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
