import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'cci_theme';

// Cores da status bar do PWA quando instalado no celular.
// Devem bater com o fundo do header da app (ClienteHeader bg-white/80 vs
// bg-slate-900/80).
const THEME_COLOR_LIGHT = '#ffffff';
const THEME_COLOR_DARK  = '#0f172a'; // slate-900

function aplicarTema(tema) {
  const root = document.documentElement;
  if (tema === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');

  // Atualiza meta theme-color em runtime — o PWA usa pra cor da status bar.
  // Mantém uma única meta sem media query: assim cobre o caso de o user
  // ter forçado um tema diferente do prefers-color-scheme do SO.
  if (typeof document !== 'undefined') {
    let meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', tema === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }
}

function temaInicial() {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (salvo === 'light' || salvo === 'dark') return salvo;
  } catch (_) { /* ignore */ }
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
    try { localStorage.setItem(STORAGE_KEY, tema); } catch (_) { /* ignore */ }
  }, [tema]);

  const alternar = useCallback(() => {
    setTema(t => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { tema, setTema, alternar };
}
