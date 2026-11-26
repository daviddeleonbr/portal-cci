// Filtros do Fluxo de Caixa num botão só: abre um painel discreto em vidro líquido,
// preso ao botão, com o nome das empresas (razão social/apelido), tipo de conta,
// contas, ocultar zeradas e AH %. As mudanças valem na hora; Esc ou clique fora fecham.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, EyeOff, Percent, Search, SlidersHorizontal, Tag, X } from 'lucide-react';
import VidroLiquido from '../ui/VidroLiquido';
import { useUsarApelido, toggleUsarApelido } from '../../lib/apelidoPref';

const TIPOS = [{ key: 'bancaria', label: 'Bancária' }, { key: 'caixa', label: 'Caixa' }];

export default function FiltrosFluxo({
  comFiltrosConta = true, // tipo e contas: só admin
  tiposAtivos, onTiposAtivos,
  contas = [], contasSelecionadas, onContasSelecionadas, avisoContas = 'Nenhuma conta com movimento no período.',
  ocultarZeradas, onOcultarZeradas,
  podeAH = false, mostrarAH, onAlternarAH,
}) {
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef(null);
  const usarApelido = useUsarApelido();
  // Quantos filtros restringem os dados (tipo parcial + contas escolhidas)
  const ativos = comFiltrosConta ? (tiposAtivos.size < TIPOS.length ? 1 : 0) + (contasSelecionadas.size > 0 ? 1 : 0) : 0;

  return (
    <>
      <button ref={botaoRef} type="button" onClick={() => setAberto(a => !a)} aria-haspopup="dialog" aria-expanded={aberto}
        className={`relative inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold transition-colors ${
          ativos ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}>
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Filtros
        {ativos > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] leading-4 text-white">{ativos}</span>}
      </button>
      {aberto && createPortal(
        <PainelFiltros ancora={botaoRef} onFechar={() => setAberto(false)}
          {...{ comFiltrosConta, tiposAtivos, onTiposAtivos, contas, contasSelecionadas, onContasSelecionadas, avisoContas,
            ocultarZeradas, onOcultarZeradas, podeAH, mostrarAH, onAlternarAH, usarApelido }} />,
        document.body,
      )}
    </>
  );
}

const LARGURA = 340;
const MARGEM = 8;

function PainelFiltros({
  ancora, onFechar, comFiltrosConta, tiposAtivos, onTiposAtivos, contas, contasSelecionadas, onContasSelecionadas, avisoContas,
  ocultarZeradas, onOcultarZeradas, podeAH, mostrarAH, onAlternarAH, usarApelido,
}) {
  const [busca, setBusca] = useState('');
  const painelRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Abaixo do botão, alinhado à direita dele; sem espaço embaixo, abre para cima.
  // Fica dentro da tela (celular) e acompanha rolagem/redimensionamento.
  useLayoutEffect(() => {
    const posicionar = () => {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      const largura = Math.min(LARGURA, window.innerWidth - 2 * MARGEM);
      const left = Math.min(Math.max(MARGEM, r.right - largura), window.innerWidth - largura - MARGEM);
      const alturaPainel = painelRef.current?.offsetHeight || 420;
      const cabeEmbaixo = r.bottom + 6 + alturaPainel <= window.innerHeight - MARGEM || r.top < alturaPainel + MARGEM;
      setPos({
        left, largura,
        top: cabeEmbaixo ? r.bottom + 6 : Math.max(MARGEM, r.top - 6 - alturaPainel),
        maxAltura: cabeEmbaixo ? window.innerHeight - r.bottom - 6 - MARGEM : r.top - 6 - MARGEM,
        origem: cabeEmbaixo ? 'top right' : 'bottom right',
      });
    };
    posicionar();
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => { window.removeEventListener('resize', posicionar); window.removeEventListener('scroll', posicionar, true); };
  }, [ancora]);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onFechar(); };
    const fora = (e) => {
      if (painelRef.current?.contains(e.target) || ancora.current?.contains(e.target)) return;
      onFechar();
    };
    document.addEventListener('keydown', esc);
    document.addEventListener('mousedown', fora);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('mousedown', fora); };
  }, [onFechar, ancora]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? contas.filter(c => (c.nome || '').toLowerCase().includes(q)) : contas;
  }, [contas, busca]);
  const alternarTipo = (k) => {
    const n = new Set(tiposAtivos);
    if (n.has(k)) n.delete(k); else n.add(k);
    if (n.size) onTiposAtivos(n); // pelo menos um tipo
  };
  const alternarConta = (cod) => {
    const n = new Set(contasSelecionadas);
    if (n.has(cod)) n.delete(cod); else n.add(cod);
    onContasSelecionadas(n);
  };

  const rotulo = 'mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider vidro-texto-2';
  const chip = (on) => `inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold transition-colors ${
    on ? 'vidro-acao' : 'vidro-fechar ring-1 ring-inset ring-black/10 dark:ring-white/15'}`;

  return (
    <div ref={painelRef} className="no-print fixed z-[70]"
      style={pos ? { top: pos.top, left: pos.left, width: pos.largura } : { visibility: 'hidden', top: 0, left: 0, width: LARGURA }}>
      <VidroLiquido role="dialog" aria-label="Filtros do fluxo de caixa" raio={18}
        className="vidro-pop flex flex-col" style={{ maxHeight: pos ? Math.max(220, pos.maxAltura) : 420, transformOrigin: pos?.origem }}>
        <div className="relative z-[2] flex items-center justify-between gap-2 px-3.5 pb-1.5 pt-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Filtros</p>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="vidro-fechar flex h-7 w-7 items-center justify-center rounded-full">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="relative z-[2] min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3.5 pb-3.5">
          <section>
            <p className={rotulo}>Nome das empresas</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => usarApelido && toggleUsarApelido()} className={chip(!usarApelido)}>
                <Tag className="h-3 w-3" aria-hidden="true" /> Razão social
              </button>
              <button type="button" onClick={() => !usarApelido && toggleUsarApelido()} className={chip(usarApelido)}>
                <Tag className="h-3.5 w-3.5" aria-hidden="true" /> Apelidos
              </button>
            </div>
          </section>

          {comFiltrosConta && (
            <>
              <section>
                <p className={rotulo}>Tipo de conta</p>
                <div className="flex flex-wrap gap-1.5">
                  {TIPOS.map(t => (
                    <button key={t.key} type="button" onClick={() => alternarTipo(t.key)} aria-pressed={tiposAtivos.has(t.key)} className={chip(tiposAtivos.has(t.key))}>
                      {tiposAtivos.has(t.key) && <Check className="h-3.5 w-3.5" aria-hidden="true" />} {t.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={`${rotulo} mb-0`}>Contas {contasSelecionadas.size > 0 ? `· ${contasSelecionadas.size} de ${contas.length}` : '· todas'}</p>
                  <div className="flex items-center gap-3 text-[11px] font-semibold">
                    <button type="button" onClick={() => onContasSelecionadas(new Set(contas.map(c => c.codigo)))} className="text-[var(--vidro-icone)] hover:underline">Marcar todas</button>
                    <button type="button" onClick={() => onContasSelecionadas(new Set())} className="vidro-texto-2 hover:underline">Limpar</button>
                  </div>
                </div>
                {contas.length > 6 && (
                  <label className="mb-1.5 flex h-8 items-center gap-2 rounded-lg px-2.5 ring-1 ring-inset ring-black/10 dark:ring-white/15">
                    <Search className="h-3.5 w-3.5 vidro-texto-2" aria-hidden="true" />
                    <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar conta…"
                      className="h-full flex-1 bg-transparent text-[12px] outline-none placeholder:text-current placeholder:opacity-50" />
                  </label>
                )}
                <div className="max-h-48 overflow-y-auto rounded-lg ring-1 ring-inset ring-black/10 dark:ring-white/15">
                  {contas.length === 0 ? (
                    <p className="vidro-texto-2 px-2.5 py-2.5 text-[12px]">{avisoContas}</p>
                  ) : visiveis.map(c => {
                    const on = contasSelecionadas.has(c.codigo);
                    return (
                      <button key={c.codigo} type="button" role="checkbox" aria-checked={on} onClick={() => alternarConta(c.codigo)}
                        className="vidro-fechar flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px]">
                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${on ? 'border-transparent vidro-acao' : 'border-current opacity-50'}`}>
                          {on && <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />}
                        </span>
                        <span className="truncate" style={{ color: 'var(--vidro-texto)' }}>{c.nome}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="vidro-texto-2 mt-1 text-[10.5px]">Nenhuma marcada = todas as contas.</p>
              </section>
            </>
          )}

          <section>
            <p className={rotulo}>Exibição</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => onOcultarZeradas(!ocultarZeradas)} aria-pressed={ocultarZeradas} className={chip(ocultarZeradas)}>
                {ocultarZeradas ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />} Ocultar zeradas
              </button>
              {podeAH && (
                <button type="button" onClick={onAlternarAH} aria-pressed={mostrarAH} className={chip(mostrarAH)}
                  title="Análise horizontal: variação de cada mês sobre o mês anterior">
                  <Percent className="h-3.5 w-3.5" aria-hidden="true" /> AH % (mês a mês)
                </button>
              )}
            </div>
          </section>
        </div>

      </VidroLiquido>
    </div>
  );
}
