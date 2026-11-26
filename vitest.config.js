// Testes (Vitest) da camada de cálculo — funções puras, sem navegador nem Supabase.
// Config própria (não usa o vite.config.js, que carrega PWA/proxies).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
