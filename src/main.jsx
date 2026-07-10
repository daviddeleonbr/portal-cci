import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { hidratarRAM } from './services/webpostoCacheV3'
import NovaVersaoToast from './components/ui/NovaVersaoToast'
import { iniciarAtualizacaoPwa } from './pwaUpdate'

// Registra o service worker e passa a checar deploys novos periodicamente.
// Quando há versão nova, dispara o evento que o NovaVersaoToast escuta.
iniciarAtualizacaoPwa(() => window.dispatchEvent(new Event('pwa:nova-versao')));

// Hidrata o cache RAM do IndexedDB ANTES de renderizar a app.
// Garante que no mount de qualquer página Webposto, o cache já está
// disponível pra leitura síncrona. Timeout de 500ms — se demorar mais,
// renderiza mesmo assim (cache vai funcionar quando hidratar terminar).
function montar() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
      <NovaVersaoToast />
    </StrictMode>,
  );
}
Promise.race([
  hidratarRAM(),
  new Promise(r => setTimeout(r, 500)),
]).finally(montar);
