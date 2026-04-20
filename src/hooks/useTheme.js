import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'cci_theme';

function aplicarTema(tema) {
  const root = document.documentElement;
  if (tema === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
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
