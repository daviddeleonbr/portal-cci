import { useEffect, useState } from 'react';

// Retorna `true` quando o tema dark está ativo (classe .dark no <html>).
// Usado por componentes que precisam decidir cores em JS (ex.: Recharts, onde
// fill/stroke de séries vão como props e o CSS não alcança). Reage à troca de
// tema via evento `cci:theme-change` (disparado por useTheme) + MutationObserver
// na classe do <html> como fallback.
export function useIsDark() {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains('dark'));
    window.addEventListener('cci:theme-change', sync);
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => {
      window.removeEventListener('cci:theme-change', sync);
      obs.disconnect();
    };
  }, []);

  return dark;
}
