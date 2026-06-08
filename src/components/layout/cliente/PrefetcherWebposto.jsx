// Prefetcher das 4 páginas Webposto do cliente.
//
// ESTRATÉGIA:
// - Aguarda 3s após mount pra deixar a página principal carregar 1º
// - Renderiza off-screen as páginas QUE AINDA NÃO TÊM CACHE
// - PULA a página atual (essa o user já tá vendo)
// - Cada uma roda seu próprio useEffect → fetch → salva cache v3
// - Após 45s desmonta tudo (cache certamente salvou até lá)
// - sessionStorage marca como done por (aba × chaveApiId) — só roda 1x
//
// SEGURANÇA:
// - Import direto (sem lazy/Suspense): evita conflito de chunks
// - aria-hidden + off-screen via CSS: não interfere visualmente
// - pointer-events: none: cliques fantasmas impossíveis
// - Wrapper memo: evita re-renders em cascata

import { memo, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useClienteSession } from '../../../hooks/useAuth';
import { temCache } from '../../../services/webpostoCacheV3';

import Dashboard      from '../../../pages/cliente/webposto/ClienteDashboard';
import Vendas         from '../../../pages/cliente/webposto/ClienteComercialVendas';
import Operacao       from '../../../pages/cliente/webposto/ClienteComercialOperacao';
import Produtividade  from '../../../pages/cliente/webposto/ClienteComercialProdutividade';

const FLAG_SESSION = 'webposto-prefetched-v3';
const DELAY_INICIAL_MS = 3000;
const DURACAO_MAX_MS  = 45000;

const TODAS_PAGINAS = [
  { nome: 'dashboard',      rota: '/cliente/webposto/dashboard',                  Componente: Dashboard },
  { nome: 'vendas',         rota: '/cliente/webposto/comercial/vendas',           Componente: Vendas },
  { nome: 'operacao',       rota: '/cliente/webposto/comercial/operacao',         Componente: Operacao },
  { nome: 'produtividade',  rota: '/cliente/webposto/comercial/produtividade',    Componente: Produtividade },
];

// Wrapper memo: renderiza o componente off-screen e desmonta após DURACAO_MAX_MS
const Fantasma = memo(function Fantasma({ nome, Componente }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(`[prefetch] ⌛ iniciando ${nome}`);
    return () => {
      // eslint-disable-next-line no-console
      console.log(`[prefetch] ⏹  desmontou ${nome}`);
    };
  }, [nome]);
  return <Componente />;
});

export default function PrefetcherWebposto() {
  const session = useClienteSession();
  const location = useLocation();
  const [paginasAtivas, setPaginasAtivas] = useState([]);

  useEffect(() => {
    if (!session?.cliente) return;
    if (!location.pathname.startsWith('/cliente/webposto/')) return;
    const chaveApiId = session?.chaveApi?.id;
    if (!chaveApiId) return;

    // Já fez prefetch nesta aba pra essa rede? Não repete.
    if (sessionStorage.getItem(FLAG_SESSION) === chaveApiId) {
      // eslint-disable-next-line no-console
      console.log('[prefetch] já feito nesta aba — skip');
      return;
    }

    // Decide quais páginas pré-carregar:
    //   - PULA a página atual (user já tá nela)
    //   - PULA as que já têm cache
    const candidatas = TODAS_PAGINAS.filter(p =>
      !location.pathname.startsWith(p.rota) && !temCache(p.nome, chaveApiId)
    );

    if (candidatas.length === 0) {
      sessionStorage.setItem(FLAG_SESSION, chaveApiId);
      // eslint-disable-next-line no-console
      console.log('[prefetch] nada a fazer — tudo já em cache ou na página atual');
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`[prefetch] vai pré-carregar em ${DELAY_INICIAL_MS}ms:`, candidatas.map(c => c.nome));

    const tInicio = setTimeout(() => {
      setPaginasAtivas(candidatas);
      sessionStorage.setItem(FLAG_SESSION, chaveApiId);

      // Desmonta tudo após DURACAO_MAX_MS — cache já salvou até lá
      setTimeout(() => {
        setPaginasAtivas([]);
        // eslint-disable-next-line no-console
        console.log('[prefetch] ✓ concluído (desmontando fantasmas)');
      }, DURACAO_MAX_MS);
    }, DELAY_INICIAL_MS);

    return () => clearTimeout(tInicio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.cliente?.id, session?.chaveApi?.id]);

  if (paginasAtivas.length === 0) return null;

  return (
    <div aria-hidden="true"
      style={{
        position: 'fixed', left: '-99999px', top: 0,
        width: '1200px', height: '1px',
        overflow: 'hidden', pointerEvents: 'none', opacity: 0,
      }}>
      {paginasAtivas.map(p => (
        <Fantasma key={p.nome} nome={p.nome} Componente={p.Componente} />
      ))}
    </div>
  );
}
