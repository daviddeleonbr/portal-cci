// Tela "O que há de novo" — notas de versão organizadas por tipo.
//
// modo 'atualizar': o usuário pediu pra atualizar. A tela NÃO tem saída
//   (sem X, sem "Depois", sem tocar fora, sem Esc): mostra as novidades
//   enquanto instala (etapa 'instalando', barra de progresso) e, ao terminar
//   (etapa 'concluida'), o botão "Ok, reiniciar portal" recarrega na versão nova.
// modo 'atualizado': a versão já está rodando (1ª abertura depois do deploy).
//   Mostra as novidades uma vez, com "Continuar".
//
// Celular: ocupa a tela de baixo pra cima; desktop: caixa centralizada.
// Conteúdo vem de public/novidades.json (ver src/lib/novidades.js).

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, TrendingUp, Wrench, Loader2, ArrowRight, X, CheckCircle2, RotateCw } from 'lucide-react';
import LogoCCI from './LogoCCI';
import { itensDoPublico } from '../../lib/novidades';

const GRUPOS = [
  { tipo: 'novidade', rotulo: 'Novidades', icone: Sparkles, tom: 'bg-accent-100 text-accent-800' },
  { tipo: 'melhoria', rotulo: 'Melhorias', icone: TrendingUp, tom: 'bg-blue-50 text-blue-700' },
  { tipo: 'correcao', rotulo: 'Correções', icone: Wrench, tom: 'bg-gray-100 text-gray-700' },
];

function fmtData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export default function TelaNovidades({
  modo = 'atualizado', entrada, versaoAtual = '', publico = 'todos',
  etapa = 'instalando', onReiniciar, onFechar,
}) {
  const atualizar = modo === 'atualizar';
  const concluida = atualizar && etapa === 'concluida';
  const podeFechar = !atualizar; // atualizando: sem saída até reiniciar

  const grupos = useMemo(() => {
    const itens = itensDoPublico(entrada, publico);
    return GRUPOS
      .map(g => ({ ...g, itens: itens.filter(i => (i.tipo || 'melhoria') === g.tipo) }))
      .filter(g => g.itens.length > 0);
  }, [entrada, publico]);

  // Progresso "de verdade" não existe (o SW novo só avisa quando assume).
  // Avança rápido e desacelera perto do fim; ao concluir, vai a 100%.
  const [progresso, setProgresso] = useState(0);
  useEffect(() => {
    if (!atualizar || concluida) return;
    const id = setInterval(() => setProgresso(p => (p >= 95 ? p : p + Math.max(0.5, (95 - p) * 0.1))), 120);
    return () => clearInterval(id);
  }, [atualizar, concluida]);
  const pct = concluida ? 100 : progresso;

  // Esc fecha só no modo 'atualizado'; trava o scroll da página por trás
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && podeFechar) onFechar?.(); };
    window.addEventListener('keydown', onKey);
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ov; };
  }, [podeFechar, onFechar]);

  if (!entrada) return null;
  const titulo = atualizar
    ? (concluida ? 'Atualização concluída' : 'Atualizando o Portal CCI')
    : 'O Portal CCI foi atualizado';

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-gray-900/60 backdrop-blur-sm sm:p-4"
      onClick={podeFechar ? onFechar : undefined}>
      <div role={atualizar ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="novidades-titulo"
        onClick={e => e.stopPropagation()}
        className="flex w-full sm:max-w-lg max-h-[94dvh] sm:max-h-[88vh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">

        {/* Cabeçalho */}
        <div className="relative flex-shrink-0 border-b border-gray-100 px-5 sm:px-6 pt-5 pb-4">
          {podeFechar && (
            <button type="button" onClick={onFechar} aria-label="Fechar"
              className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          )}
          <div className={`flex items-center gap-3 ${podeFechar ? 'pr-10' : ''}`}>
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50">
              <LogoCCI className="h-7 w-7" title="" />
            </span>
            <div className="min-w-0">
              <h2 id="novidades-titulo" className="text-base sm:text-lg font-semibold leading-tight text-gray-900">{titulo}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                {entrada.versao && (
                  <span className="rounded-full bg-blue-700 px-2 py-0.5 font-semibold text-white tabular-nums">Versão {entrada.versao}</span>
                )}
                {atualizar && versaoAtual && versaoAtual !== entrada.versao && (
                  <span className="tabular-nums">você está na {versaoAtual}</span>
                )}
                {!atualizar && entrada.data && <span className="tabular-nums">{fmtData(entrada.data)}</span>}
              </div>
            </div>
          </div>
          {entrada.resumo && <p className="mt-3 text-sm leading-relaxed text-gray-700">{entrada.resumo}</p>}

          {/* Progresso da instalação */}
          {atualizar && (
            <div className="mt-4" role="status" aria-live="polite">
              <div className="mb-1.5 flex items-center justify-between text-[13px]">
                {concluida ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-blue-800">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Nova versão instalada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-700" aria-hidden="true" /> Instalando a nova versão…
                  </span>
                )}
                <span className="tabular-nums text-gray-600">{Math.round(pct)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100"
                role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Progresso da atualização">
                <div className="h-full rounded-full bg-blue-700 transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* O que há de novo — agrupado por tipo */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 space-y-5">
          {grupos.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-600">Ajustes internos e melhorias de estabilidade.</p>
          ) : grupos.map(g => (
            <section key={g.tipo} aria-labelledby={`grupo-${g.tipo}`}>
              <h3 id={`grupo-${g.tipo}`} className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                {g.rotulo}
                <span className="rounded-full bg-gray-100 px-1.5 text-[10px] tabular-nums text-gray-600">{g.itens.length}</span>
              </h3>
              <ul className="space-y-2">
                {g.itens.map((it, i) => (
                  <li key={i} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                    <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${g.tom}`}>
                      <g.icone className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug text-gray-900">{it.titulo}</p>
                      {it.descricao && <p className="mt-0.5 text-[13px] leading-relaxed text-gray-700">{it.descricao}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Ações */}
        <div className="flex-shrink-0 border-t border-gray-100 px-5 sm:px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4">
          {atualizar ? (
            <>
              <button type="button" onClick={onReiniciar} disabled={!concluida} autoFocus={concluida}
                className="inline-flex h-12 sm:h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-base sm:text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed">
                {concluida
                  ? <><RotateCw className="h-4 w-4" aria-hidden="true" /> Ok, reiniciar portal</>
                  : <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Instalando…</>}
              </button>
              <p className="mt-2 text-center text-xs text-gray-600">
                {concluida
                  ? 'O portal vai recarregar já na versão nova. Você continua de onde parou.'
                  : 'Não feche o app enquanto a atualização é instalada.'}
              </p>
            </>
          ) : (
            <button type="button" onClick={onFechar}
              className="inline-flex h-12 sm:h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-base sm:text-sm font-semibold text-white hover:bg-blue-800">
              Continuar <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
