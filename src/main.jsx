import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { hidratarRAM } from './services/webpostoCacheV3'

// Hidrata o cache RAM do IndexedDB ANTES de renderizar a app.
// Garante que no mount de qualquer página Webposto, o cache já está
// disponível pra leitura síncrona. Timeout de 500ms — se demorar mais,
// renderiza mesmo assim (cache vai funcionar quando hidratar terminar).
function montar() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
Promise.race([
  hidratarRAM(),
  new Promise(r => setTimeout(r, 500)),
]).finally(montar);
