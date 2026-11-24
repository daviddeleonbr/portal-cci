// RESUMO DE ONTEM — abre sozinho ao entrar no portal (1x por dia), com os
// principais pontos do dia anterior da rede: vendas, caixa, recebimentos,
// destaques e clientes a prazo vencidos. Todo dia aparece pelo menos uma vez;
// "Não mostrar mais hoje" esconde só até o dia seguinte (no aparelho). Reabre
// pelo botão do cabeçalho (evento `cci:abrir-resumo-dia`). Cálculo em resumoDiaService.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, AlertTriangle, CheckCircle2, TrendingUp, ArrowUpRight, Fuel, Ban, Gauge,
  Package, Wallet, Scale, Users, ChevronRight, Info, Sparkles,
} from 'lucide-react';
import LogoCCI from '../../ui/LogoCCI';
import { useClienteSession } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { formatCurrency } from '../../../utils/format';
import { hojeBR, TZ_BR } from '../../../utils/dataBR';
import * as resumoService from '../../../services/resumoDiaService';

// Cores das categorias de venda — ordem fixa (validadas p/ daltonismo; claro/escuro)
const COR_CAT = {
  combustivel: ['#2a78d6', '#3987e5'],
  automotivos: ['#eb6834', '#d95926'],
  conveniencia: ['#1baf7a', '#199e70'],
  outros: ['#eda100', '#c98500'],
};

const TOM = {
  alerta: { chip: 'bg-rose-100 text-rose-700', borda: 'border-rose-200/70', fundo: 'bg-rose-50/60' },
  atencao: { chip: 'bg-amber-100 text-amber-700', borda: 'border-amber-200/70', fundo: 'bg-amber-50/60' },
  bom: { chip: 'bg-emerald-100 text-emerald-700', borda: 'border-emerald-200/70', fundo: 'bg-emerald-50/50' },
  info: { chip: 'bg-gray-100 text-gray-600', borda: 'border-gray-200/70', fundo: 'bg-white' },
};
const ICONE = {
  receber: Users,
  cancelada: Ban, combustivel: Fuel, top: TrendingUp, produto: Package, afericao: Gauge,
};

const pct = (v, t) => (t > 0 ? Math.round((v / t) * 100) : 0);
const horaBR = () => Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ_BR }).format(new Date()));
const saudacao = () => { const h = horaBR(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
function dataExtenso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
    .replace(/^./, c => c.toUpperCase()); // "Segunda-feira, 23 de novembro"
}

const memo = new Map();

export default function ModalResumoDia() {
  const session = useClienteSession();
  const usuario = session?.usuario;
  const tipo = session?.tipoCliente;
  const { tema } = useTheme();
  const escuro = tema === 'dark';
  const perms = useMemo(() => new Set(usuario?.permissoes || []), [usuario?.permissoes]);

  const [aberto, setAberto] = useState(false);
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState(null);
  const [naoMostrarHoje, setNaoMostrarHoje] = useState(false);
  const sessaoRef = useRef(session);
  useEffect(() => { sessaoRef.current = session; });

  // abre e carrega (memória da sessão: reabrir no mesmo dia não busca de novo)
  const abrirRef = useRef(() => {});
  useEffect(() => { abrirRef.current = () => {
    const s = sessaoRef.current;
    if (!s?.usuario?.id) return;
    const chave = `${s.usuario.id}:${(s.clientesRede || []).map(c => c.id).join(',')}:${hojeBR(-1)}`;
    setNaoMostrarHoje(false);
    setAberto(true);
    setErro(null);
    if (memo.has(chave)) { setResumo(memo.get(chave)); return; }
    setResumo(null);
    resumoService.montarResumo({ session: s })
      .then(r => { memo.set(chave, r); setResumo(r); })
      .catch(e => setErro(e?.message || 'Não foi possível montar o resumo.'));
  }; });

  // abre sozinho ao entrar: SEMPRE na 1ª vez do dia, e nas próximas entradas
  // do dia até o usuário marcar "Não mostrar mais hoje" (folga p/ os outros avisos do login)
  useEffect(() => {
    if (!resumoService.deveAbrirAoEntrar(usuario)) return;
    const t = setTimeout(() => abrirRef.current(), 900);
    return () => clearTimeout(t);
  }, [usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // reabrir pelo cabeçalho
  useEffect(() => {
    const abrir = () => abrirRef.current();
    window.addEventListener(resumoService.EVENTO_ABRIR_RESUMO, abrir);
    return () => window.removeEventListener(resumoService.EVENTO_ABRIR_RESUMO, abrir);
  }, []);

  function fechar() {
    if (usuario?.id && naoMostrarHoje) resumoService.ocultarHoje(usuario.id);
    setAberto(false);
  }

  // trava a rolagem da página e fecha no Esc
  useEffect(() => {
    if (!aberto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!usuario?.id || !resumoService.PERMISSOES_RESUMO.some(p => perms.has(p))) return null;

  const prefixo = `/cliente/${tipo === 'autosystem' ? 'autosystem' : 'webposto'}`;
  const dataOntem = hojeBR(-1);
  const primeiroNome = String(usuario?.nome || '').trim().split(/\s+/)[0] || '';
  const r = resumo;
  const temVendas = !!r?.empresas.length;

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div key="resumo" className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={fechar} aria-hidden="true" />

          <motion.section role="dialog" aria-modal="true" aria-labelledby="resumo-titulo"
            className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-gray-50 shadow-2xl sm:max-w-2xl sm:rounded-[28px]"
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }}>

            {/* ── Cabeçalho (marca) ── */}
            <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-blue-950 px-5 pb-5 pt-4 text-white sm:px-7 sm:pt-6">
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
              <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-emerald-300/10 blur-2xl" aria-hidden="true" />
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/30 sm:hidden" aria-hidden="true" />

              <div className="relative flex items-start gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/95 shadow-sm">
                  <LogoCCI className="h-7 w-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">Resumo de ontem</p>
                  <h2 id="resumo-titulo" className="text-[17px] font-semibold leading-snug">{dataExtenso(dataOntem)}</h2>
                  <p className="text-[12.5px] leading-snug text-white/75">{saudacao()}{primeiroNome ? `, ${primeiroNome}` : ''} · aqui estão os principais pontos</p>
                </div>
                <button onClick={fechar} aria-label="Fechar resumo"
                  className="-mr-1 rounded-full p-2 text-white/80 transition-colors hover:bg-white/15 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {perms.has('fechamento_caixa') && (
                <div className="relative mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[12px] font-medium text-white/70">Vendas {r && r.empresas.length > 1 ? `da rede · ${r.empresas.length} empresas` : 'do dia'}</p>
                    {r ? (
                      <p className="text-[34px] font-bold leading-none tracking-tight tabular-nums sm:text-[40px]">{formatCurrency(r.rede.vendas)}</p>
                    ) : (
                      <div className="mt-1 h-9 w-48 animate-pulse rounded-lg bg-white/15" />
                    )}
                  </div>
                  {r && temVendas && (
                    <div className="flex gap-5 text-right">
                      <div>
                        <p className="text-[11px] text-white/65">Recebido</p>
                        <p className="text-[15px] font-semibold tabular-nums">{formatCurrency(r.rede.recebido)}</p>
                      </div>
                      {r.rede.litros > 0 && (
                        <div>
                          <p className="text-[11px] text-white/65">Combustível</p>
                          <p className="text-[15px] font-semibold tabular-nums">{Math.round(r.rede.litros).toLocaleString('pt-BR')} L</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </header>

            {/* ── Corpo ── */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {erro && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{erro}</div>
              )}
              {!r && !erro && <Esqueleto />}

              {r && (
                <>
                  {/* Destaques */}
                  {r.destaques.length > 0 && (
                    <Bloco titulo="Principais pontos" Icone={Sparkles}>
                      <ul className="space-y-2">
                        {r.destaques.map((d, i) => {
                          const tom = TOM[d.tom] || TOM.info;
                          const Ic = ICONE[d.icone] || Info;
                          return (
                            <motion.li key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
                              className={`flex items-center gap-3 rounded-xl border ${tom.borda} ${tom.fundo} px-3 py-2.5`}>
                              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${tom.chip}`}><Ic className="h-4 w-4" aria-hidden="true" /></span>
                              <span className="text-[13px] leading-snug text-gray-800">{d.texto}</span>
                            </motion.li>
                          );
                        })}
                      </ul>
                    </Bloco>
                  )}

                  {perms.has('fechamento_caixa') && temVendas && r.rede.vendas > 0 && (
                    <>
                      {/* Indicadores */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <Indicador rotulo="Diferença de caixa" Icone={Scale}
                          valor={`${r.rede.diferenca > 0.004 ? '+' : r.rede.diferenca < -0.004 ? '−' : ''}${formatCurrency(Math.abs(r.rede.diferenca))}`}
                          tom={r.rede.diferenca < -1 ? 'text-rose-700' : r.rede.diferenca > 1 ? 'text-amber-700' : 'text-emerald-700'}
                          sub={r.rede.diferenca < -1 ? 'falta' : r.rede.diferenca > 1 ? 'sobra' : 'caixa batido'} />
                        <Indicador rotulo="Recebido" Icone={Wallet} valor={formatCurrency(r.rede.recebido)}
                          sub={`${pct(r.rede.recebido, r.rede.vendas)}% das vendas`} />
                        <Indicador rotulo={/devol/i.test(r.rede.canceladas.titulo) ? 'Devoluções' : 'Canceladas'} Icone={Ban}
                          valor={formatCurrency(r.rede.canceladas.total)}
                          sub={`${r.rede.canceladas.qtd} ${r.rede.canceladas.qtd === 1 ? 'registro' : 'registros'}`} />
                        <Indicador rotulo="Aferições" Icone={Gauge}
                          valor={`${r.rede.afericoes.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`}
                          sub={`${r.rede.afericoes.qtd} ${r.rede.afericoes.qtd === 1 ? 'aferição' : 'aferições'}`} />
                      </div>

                      {/* Vendas por categoria */}
                      <Bloco titulo="Onde vendeu" Icone={TrendingUp}>
                        <BarraCategorias categorias={r.rede.categorias} total={r.rede.vendas} escuro={escuro} />
                      </Bloco>

                      {/* Formas de recebimento */}
                      {r.rede.formas.length > 0 && (
                        <Bloco titulo="Como recebeu" Icone={Wallet}>
                          <ul className="space-y-2.5">
                            {r.rede.formas.map(f => (
                              <li key={f.tipo}>
                                <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                                  <span className="text-gray-700">{f.rotulo}</span>
                                  <span className="tabular-nums text-gray-900"><span className="mr-2 text-[11px] text-gray-500">{pct(f.valor, r.rede.recebido)}%</span>{formatCurrency(f.valor)}</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                                  <motion.div className="h-full rounded-full bg-blue-600" initial={{ width: 0 }}
                                    animate={{ width: `${Math.max(2, pct(f.valor, r.rede.recebido))}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                                </div>
                              </li>
                            ))}
                          </ul>
                        </Bloco>
                      )}

                      {/* Por empresa */}
                      {r.empresas.length > 1 && (
                        <Bloco titulo="Por empresa" Icone={Users}>
                          <ul className="-mx-1 divide-y divide-gray-100">
                            {[...r.empresas].sort((a, b) => b.vendas - a.vendas).map(e => (
                              <li key={e.id} className="flex items-center justify-between gap-3 px-1 py-2.5">
                                <span className="min-w-0">
                                  <span className="block truncate text-[13px] font-medium text-gray-800">{e.nome}</span>
                                  <span className="text-[11.5px] text-gray-500">{pct(e.vendas, r.rede.vendas)}% da rede</span>
                                </span>
                                <span className="flex flex-shrink-0 items-center gap-2">
                                  <ChipCaixa diferenca={e.diferenca} />
                                  <span className="w-[92px] text-right text-[13px] font-semibold tabular-nums text-gray-900">{formatCurrency(e.vendas)}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </Bloco>
                      )}
                    </>
                  )}

                  {perms.has('fechamento_caixa') && temVendas && r.rede.vendas <= 0 && (
                    <div className="rounded-2xl border border-gray-200/70 bg-white p-6 text-center text-sm text-gray-500">Sem vendas registradas ontem.</div>
                  )}

                  {/* Clientes a prazo */}
                  {r.receber && (
                    <Bloco titulo="Clientes a prazo" Icone={Users}
                      acao={<Link to={`${prefixo}/bpo/contas-receber`} onClick={fechar} className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-blue-700 hover:text-blue-800">Ver <ChevronRight className="h-3.5 w-3.5" /></Link>}>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <MiniValor rotulo="Vencidos" valor={r.receber.vencidos.total} qtd={r.receber.vencidos.qtd} destaque={r.receber.vencidos.qtd > 0} />
                        <MiniValor rotulo="Vencem hoje" valor={r.receber.hoje.total} qtd={r.receber.hoje.qtd} />
                        <MiniValor rotulo="Em aberto" valor={r.receber.emAberto} />
                      </div>
                    </Bloco>
                  )}

                  {(r.erros.length > 0 || r.parcial) && (
                    <p className="flex items-start gap-2 px-1 text-[11.5px] leading-snug text-gray-500">
                      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      <span>
                        {r.parcial && `Mostrando ${r.parcial.mostradas} de ${r.parcial.total} empresas. `}
                        {r.erros.length > 0 && `Não foi possível ler: ${r.erros.map(e => e.split(':')[0]).join(', ')}.`}
                      </span>
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── Rodapé ── */}
            <footer className="flex shrink-0 flex-col gap-3 border-t border-gray-200/80 bg-white px-4 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-3.5">
              <label className="flex cursor-pointer select-none items-center gap-2.5 text-[12.5px] text-gray-600">
                <span className="relative inline-flex">
                  <input type="checkbox" className="peer sr-only" checked={naoMostrarHoje} onChange={e => setNaoMostrarHoje(e.target.checked)} />
                  <span className="h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 peer-focus-visible:ring-offset-2" />
                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                </span>
                Não mostrar mais hoje
              </label>
              <div className="flex gap-2">
                {perms.has('fechamento_caixa') && (
                  <Link to={`${prefixo}/fechamento-caixa`} onClick={fechar}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 sm:flex-none">
                    Ver fechamento <ArrowUpRight className="h-4 w-4" />
                  </Link>
                )}
                <button onClick={fechar}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-blue-700 px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 sm:flex-none">
                  Entendi
                </button>
              </div>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Peças ────────────────────────────────────────────────────
function Bloco({ titulo, Icone, acao, children }) {
  return (
    <section className="rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-gray-500">
          {Icone && <Icone className="h-3.5 w-3.5" aria-hidden="true" />} {titulo}
        </h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Indicador({ rotulo, valor, sub, Icone, tom = 'text-gray-900' }) {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white p-3.5 shadow-sm">
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-gray-500">
        {Icone && <Icone className="h-3.5 w-3.5" aria-hidden="true" />} {rotulo}
      </p>
      <p className={`mt-1 text-[17px] font-bold tabular-nums leading-tight ${tom}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

function MiniValor({ rotulo, valor, qtd, destaque }) {
  return (
    <div className={`rounded-xl px-2 py-2.5 ${destaque ? 'bg-rose-50' : 'bg-gray-50'}`}>
      <p className={`text-[11px] font-medium ${destaque ? 'text-rose-700' : 'text-gray-500'}`}>{rotulo}</p>
      <p className={`mt-0.5 text-[13.5px] font-bold tabular-nums ${destaque ? 'text-rose-800' : 'text-gray-900'}`}>{formatCurrency(valor)}</p>
      {qtd != null && <p className="text-[10.5px] text-gray-500">{qtd} {qtd === 1 ? 'título' : 'títulos'}</p>}
    </div>
  );
}

function ChipCaixa({ diferenca }) {
  if (Math.abs(diferenca) <= 1) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> batido</span>;
  }
  const falta = diferenca < 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ${falta ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
      {falta ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : <Scale className="h-3 w-3" aria-hidden="true" />}
      {falta ? 'falta' : 'sobra'} {formatCurrency(Math.abs(diferenca))}
    </span>
  );
}

// Barra empilhada (fatias com 2px de respiro) + legenda com % e valor
function BarraCategorias({ categorias, total, escuro }) {
  const [foco, setFoco] = useState(null);
  const lista = categorias.filter(c => c.valor > 0);
  const cor = (k) => (COR_CAT[k] || COR_CAT.outros)[escuro ? 1 : 0];
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img"
        aria-label={lista.map(c => `${c.rotulo} ${pct(c.valor, total)}%`).join(', ')}>
        {lista.map((c, i) => (
          <motion.div key={c.chave} title={`${c.rotulo}: ${formatCurrency(c.valor)} (${pct(c.valor, total)}%)`}
            className="h-full first:rounded-l-full last:rounded-r-full transition-opacity"
            style={{ backgroundColor: cor(c.chave), opacity: foco && foco !== c.chave ? 0.35 : 1 }}
            initial={{ flexGrow: 0 }} animate={{ flexGrow: c.valor }} transition={{ duration: 0.7, delay: 0.05 * i, ease: 'easeOut' }}
            onMouseEnter={() => setFoco(c.chave)} onMouseLeave={() => setFoco(null)} />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {lista.map(c => (
          <li key={c.chave} className="flex items-center justify-between gap-3 text-[13px]"
            onMouseEnter={() => setFoco(c.chave)} onMouseLeave={() => setFoco(null)}>
            <span className="flex min-w-0 items-center gap-2 text-gray-700">
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: cor(c.chave) }} aria-hidden="true" />
              <span className="truncate">{c.rotulo}</span>
            </span>
            <span className="flex-shrink-0 tabular-nums text-gray-900">
              <span className="mr-2 text-[11px] text-gray-500">{pct(c.valor, total)}%</span>{formatCurrency(c.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <p className="flex items-center gap-2 px-1 text-[12.5px] text-gray-500">
        <span className="h-2 w-2 animate-ping rounded-full bg-blue-500" aria-hidden="true" />
        Buscando os números de ontem no sistema…
      </p>
      <div className="space-y-2 rounded-2xl border border-gray-200/70 bg-white p-4">
        {[0, 1, 2].map(i => <div key={i} className="h-11 animate-pulse rounded-xl bg-gray-100" />)}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-[84px] animate-pulse rounded-2xl bg-white" />)}
      </div>
      <div className="h-32 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}
