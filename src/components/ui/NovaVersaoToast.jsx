// Avisos de versão do app:
//
// 1) "Nova versão disponível" — quando o service worker detecta um deploy
//    novo (evento `pwa:nova-versao`, disparado em main.jsx). O toast mostra a
//    versão (notas buscadas em /novidades.json). "Atualizar" abre a
//    TelaNovidades, que NÃO tem saída: lista o que mudou enquanto instala e,
//    ao terminar, mostra "Ok, reiniciar portal" (recarrega na versão nova).
// 2) "O Portal foi atualizado" — 1ª abertura numa versão que o usuário ainda
//    não viu (ex.: o navegador já carregou o bundle novo sozinho). Mostra as
//    notas embutidas no bundle uma vez. 1º acesso da vida: só registra.
// 3) Outra aba instalou a versão nova (`pwa:versao-instalada`): toast pra
//    reiniciar esta aba também.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw, RotateCw, Sparkles, X } from 'lucide-react';
import { instalarAtualizacao, reiniciarPortal } from '../../pwaUpdate';
import TelaNovidades from './TelaNovidades';
import {
  VERSOES, VERSAO_ATUAL, lerVersaoVista, marcarVersaoVista, buscarVersaoNova,
  publicoDaRota, itensDoPublico, rotaSemAvisoDeVersao,
} from '../../lib/novidades';

// Tempo mínimo da tela de instalação — dá pra ler as novidades e ver o progresso.
const MIN_INSTALACAO_MS = 2500;
// Sem notas da versão nova (falha de rede ou deploy sem entrada nova)
const SEM_NOTAS = { versao: '', resumo: 'Melhorias e correções para o portal.', itens: [] };

// Versão a mostrar depois da atualização (null = nada). Calculado uma vez.
function versaoPosAtualizacao() {
  if (!VERSAO_ATUAL) return null;
  const vista = lerVersaoVista();
  if (!vista) { marcarVersaoVista(VERSAO_ATUAL); return null; } // 1º acesso: sem aviso
  return vista !== VERSAO_ATUAL ? VERSOES[0] : null;
}

export default function NovaVersaoToast() {
  const { pathname } = useLocation();
  const publico = publicoDaRota(pathname);

  const [toast, setToast] = useState(null); // null | 'disponivel' | 'instalada'
  const [versaoNova, setVersaoNova] = useState(null); // entrada do novidades.json remoto
  const [etapa, setEtapa] = useState(null); // null | 'instalando' | 'concluida'
  const [posAtualizacao, setPosAtualizacao] = useState(versaoPosAtualizacao);

  useEffect(() => {
    const onNova = async () => {
      const v = await buscarVersaoNova();
      setVersaoNova(v && v.versao !== VERSAO_ATUAL ? v : null);
      setToast(t => t || 'disponivel');
    };
    const onInstaladaEmOutraAba = () => setToast('instalada');
    window.addEventListener('pwa:nova-versao', onNova);
    window.addEventListener('pwa:versao-instalada', onInstaladaEmOutraAba);
    return () => {
      window.removeEventListener('pwa:nova-versao', onNova);
      window.removeEventListener('pwa:versao-instalada', onInstaladaEmOutraAba);
    };
  }, []);

  const atualizar = async () => {
    setToast(null);
    setEtapa('instalando');
    if (versaoNova) marcarVersaoVista(versaoNova.versao); // viu as notas aqui → não repete após o reload
    await Promise.all([instalarAtualizacao(), new Promise(r => setTimeout(r, MIN_INSTALACAO_MS))]);
    setEtapa('concluida');
  };

  // Atualizando: tela sem saída até "Ok, reiniciar portal" (vale em qualquer rota)
  if (etapa) {
    return (
      <TelaNovidades modo="atualizar" entrada={versaoNova || SEM_NOTAS} versaoAtual={VERSAO_ATUAL}
        publico={publico} etapa={etapa} onReiniciar={reiniciarPortal} />
    );
  }

  if (rotaSemAvisoDeVersao(pathname)) return null;

  // Novidades da versão que acabou de entrar (uma vez). Se não houver nada
  // para esse público (ex.: só itens de admin e quem abriu é cliente), fica
  // pendente até abrir a área certa ou chegar a próxima versão.
  if (posAtualizacao && !toast && itensDoPublico(posAtualizacao, publico).length > 0) {
    const fechar = () => { marcarVersaoVista(posAtualizacao.versao); setPosAtualizacao(null); };
    return <TelaNovidades modo="atualizado" entrada={posAtualizacao} publico={publico} onFechar={fechar} />;
  }

  if (!toast) return null;
  const instaladaEmOutraAba = toast === 'instalada';

  return (
    // Celular: acima da barra de navegação inferior do portal do cliente
    <div className="fixed left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4">
      <div role="status" className="flex items-center gap-3 rounded-xl bg-gray-900 text-white shadow-2xl ring-1 ring-black/10 px-4 py-3">
        <div className="h-9 w-9 rounded-lg bg-accent-500/20 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-4 w-4 text-accent-300" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">
            {instaladaEmOutraAba ? 'Nova versão instalada'
              : versaoNova ? `Versão ${versaoNova.versao} disponível` : 'Nova versão disponível'}
          </p>
          <p className="text-[12px] text-gray-300 leading-tight mt-0.5">
            {instaladaEmOutraAba ? 'Reinicie o portal para usar a versão nova.'
              : versaoNova ? 'Atualize para ver o que mudou.' : 'Atualize para carregar as últimas melhorias.'}
          </p>
        </div>
        <button onClick={instaladaEmOutraAba ? reiniciarPortal : atualizar}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-semibold text-gray-900 hover:bg-gray-100 flex-shrink-0">
          {instaladaEmOutraAba
            ? <><RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Reiniciar</>
            : <><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Atualizar</>}
        </button>
        <button onClick={() => setToast(null)} aria-label="Dispensar"
          className="-mr-2 flex h-10 w-8 items-center justify-center text-gray-400 hover:text-gray-200 flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
