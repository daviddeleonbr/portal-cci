import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'cci_theme';

// Cores da status bar do PWA quando instalado no celular.
// Devem bater EXATAMENTE com o fundo do cabeçalho (Header/ClienteHeader são
// bg-white sólido; no escuro o index.css troca bg-white por #1e293b).
// Manter em sincronia com o script anti-flash do index.html.
const THEME_COLOR_LIGHT = '#ffffff';
const THEME_COLOR_DARK  = '#1e293b'; // slate-800 = html.dark .bg-white

function aplicarTema(tema) {
  const root = document.documentElement;
  if (tema === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');

  // Atualiza a meta theme-color em runtime — o PWA usa pra cor da status bar.
  // Atualiza TODAS e tira o `media`: com várias metas o navegador usa a 1ª
  // que combina, e uma por prefers-color-scheme ignoraria o tema escolhido.
  if (typeof document !== 'undefined') {
    const cor = tema === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
    let metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length === 0) {
      const m = document.createElement('meta');
      m.setAttribute('name', 'theme-color');
      document.head.appendChild(m);
      metas = [m];
    }
    metas.forEach(m => { m.removeAttribute('media'); m.setAttribute('content', cor); });
  }
}

function temaInicial() {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (salvo === 'light' || salvo === 'dark') return salvo;
  } catch { /* ignore */ }
  // Fallback: preferencia do SO
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function useTheme() {
  const [tema, setTema] = useState(() => {
    const t = temaInicial();
    aplicarTema(t);
    return t;
  });

  useEffect(() => {
    aplicarTema(tema);
    try { localStorage.setItem(STORAGE_KEY, tema); } catch { /* ignore */ }
    // Notifica outras instâncias do hook na MESMA aba (ex.: os dois headers
    // admin/cliente têm instâncias separadas de useTheme).
    window.dispatchEvent(new CustomEvent('cci:theme-change', { detail: tema }));
  }, [tema]);

  // Sincroniza entre instâncias (mesma aba) e entre abas (evento storage).
  useEffect(() => {
    const onCustom = (e) => setTema(prev => (e.detail && e.detail !== prev ? e.detail : prev));
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setTema(prev => (e.newValue !== prev ? e.newValue : prev));
      }
    };
    window.addEventListener('cci:theme-change', onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('cci:theme-change', onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const alternar = useCallback(() => {
    setTema(t => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { tema, setTema, alternar };
}
