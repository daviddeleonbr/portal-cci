import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, TrendingUp, TrendingDown, Copy,
  ChevronRight, FolderOpen, Folder,
  Calendar, Eye, EyeOff, Filter, Repeat, AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '../utils/format';

export default function AnaliseLancamentosResult({ resultado, lancamentosPorConta, meses }) {
  if (!lancamentosPorConta) return <ResumoMini resultado={resultado} />;
  return <LancamentosTree resultado={resultado} lancamentosPorConta={lancamentosPorConta} meses={meses} />;
}

// Fallback minimalista quando nao ha dados de lancamentos (nao deve ocorrer na pagina nova)
function ResumoMini({ resultado }) {
  const { duplicados, aumentos, diminuicoes, resumo } = resultado;
  const nenhum = resumo.totalDuplicados === 0 && resumo.totalAumentos === 0 && resumo.totalDiminuicoes === 0;

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Contas</p>
          <p className="text-lg font-bold text-gray-900">{resumo.totalContas}</p>
        </div>
        <div className={`rounded-lg border px-3 py-2.5 ${resumo.totalDuplicados > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-[10px] uppercase tracking-wider ${resumo.totalDuplicados > 0 ? 'text-amber-700' : 'text-gray-500'}`}>Duplicatas</p>
          <p className={`text-lg font-bold ${resumo.totalDuplicados > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{resumo.totalDuplicados}</p>
        </div>
        <div className={`rounded-lg border px-3 py-2.5 ${resumo.totalAumentos > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-[10px] uppercase tracking-wider ${resumo.totalAumentos > 0 ? 'text-red-700' : 'text-gray-500'}`}>Picos</p>
          <p className={`text-lg font-bold ${resumo.totalAumentos > 0 ? 'text-red-700' : 'text-gray-900'}`}>{resumo.totalAumentos}</p>
        </div>
        <div className={`rounded-lg border px-3 py-2.5 ${resumo.totalDiminuicoes > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-[10px] uppercase tracking-wider ${resumo.totalDiminuicoes > 0 ? 'text-orange-700' : 'text-gray-500'}`}>Quedas</p>
          <p className={`text-lg font-bold ${resumo.totalDiminuicoes > 0 ? 'text-orange-700' : 'text-gray-900'}`}>{resumo.totalDiminuicoes}</p>
        </div>
      </div>

      {nenhum && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Nenhuma inconsistencia detectada</p>
            <p className="text-xs text-emerald-700 mt-0.5">Lançamentos das {resumo.totalContas} contas marcadas parecem consistentes no período.</p>
          </div>
        </div>
      )}

      {/* Duplicatas */}
      {duplicados.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Copy className="h-3 w-3" /> Duplicatas ({duplicados.length})
          </p>
          <div className="rounded-xl border border-amber-200 overflow-hidden">
            <ul className="divide-y divide-amber-100">
              {duplicados.slice(0, 30).map((d, i) => (
                <li key={i} className="px-3 py-2 bg-amber-50/40 flex items-center gap-3">
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 flex-shrink-0">
                    {d.quantidade}x
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{d.descricao || '(sem descrição)'}</p>
                    <p className="text-[11px] text-gray-500">
                      {d.descricaoConta} · {formatDataBR(d.data)}
                    </p>
                  </div>
                  <span className="text-sm font-mono font-semibold text-gray-900 flex-shrink-0">
                    {formatCurrency(d.valor)}
                  </span>
                </li>
              ))}
            </ul>
            {duplicados.length > 30 && (
              <div className="px-3 py-2 bg-amber-50 text-[11px] text-amber-700 border-t border-amber-100">
                + {duplicados.length - 30} duplicatas adicionais
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aumentos */}
      {aumentos.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" /> Aumentos exagerados ({aumentos.length})
          </p>
          <div className="rounded-xl border border-red-200 overflow-hidden">
            <ul className="divide-y divide-red-100">
              {aumentos.map((a, i) => (
                <li key={i} className="px-3 py-2 bg-red-50/40 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{a.descricaoConta}</p>
                    <p className="text-[11px] text-gray-500">
                      Em <strong>{a.mes}</strong>: {formatCurrency(a.valorMes)} · Media outros meses: {formatCurrency(a.mediaOutrosMeses)}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-red-700 flex-shrink-0">
                    +{a.variacaoPct.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Diminuicoes */}
      {diminuicoes.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-orange-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3" /> Quedas exageradas ({diminuicoes.length})
          </p>
          <div className="rounded-xl border border-orange-200 overflow-hidden">
            <ul className="divide-y divide-orange-100">
              {diminuicoes.map((q, i) => (
                <li key={i} className="px-3 py-2 bg-orange-50/40 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{q.descricaoConta}</p>
                    <p className="text-[11px] text-gray-500">
                      Em <strong>{q.mes}</strong>: {formatCurrency(q.valorMes)} · Media outros meses: {formatCurrency(q.mediaOutrosMeses)}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-orange-700 flex-shrink-0">
                    {q.variacaoPct.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDataBR(d) {
  if (!d) return '—';
  const [y, m, dd] = String(d).split('-');
  if (!y || !m || !dd) return d;
  return `${dd}/${m}/${y.slice(2)}`;
}

// ═══════════════════════════════════════════════════════════
// Tree view de lancamentos com badges de ocorrencia
// ═══════════════════════════════════════════════════════════
function LancamentosTree({ resultado, lancamentosPorConta, meses }) {
  const [contasExpandidas, setContasExpandidas] = useState(() => new Set());
  const [mesesExpandidos, setMesesExpandidos] = useState(() => new Set());
  const [ocultarSemMov, setOcultarSemMov] = useState(true);
  // Filtros de ocorrencia: dup, pico, queda, ausencia, normal (sem ocorrencia)
  const [filtros, setFiltros] = useState({ dup: true, pico: true, queda: true, ausencia: true, normal: true });

  // Indexar anomalias por (codigo, mesKey) para lookup rapido
  const picoPorContaMes = useMemo(() => {
    const set = new Set();
    resultado.aumentos.forEach(a => set.add(`${a.codigo}|${a.mesKey}`));
    return set;
  }, [resultado.aumentos]);

  const quedaPorContaMes = useMemo(() => {
    const set = new Set();
    resultado.diminuicoes.forEach(q => set.add(`${q.codigo}|${q.mesKey}`));
    return set;
  }, [resultado.diminuicoes]);

  const ausenciaPorContaMes = useMemo(() => {
    const set = new Set();
    (resultado.ausencias || []).forEach(a => set.add(`${a.codigo}|${a.mesKey}`));
    return set;
  }, [resultado.ausencias]);

  const contasRecorrentes = useMemo(() => {
    const set = new Set();
    (resultado.contasAnalisadas || []).forEach(c => { if (c.recorrente) set.add(c.codigo); });
    return set;
  }, [resultado.contasAnalisadas]);

  const dupPorId = useMemo(() => {
    const map = new Map();
    resultado.duplicados.forEach(d => {
      (d.ids || []).forEach((id, idx) => {
        map.set(id, { total: d.quantidade, idxNoGrupo: idx + 1 });
      });
    });
    return map;
  }, [resultado.duplicados]);

  const toggleFiltro = (k) => setFiltros(p => ({ ...p, [k]: !p[k] }));

  // Construir dados por conta com agrupamento por mes
  const contasProcessadas = useMemo(() => {
    const todas = resultado.contasAnalisadas || [];
    return todas.map(conta => {
      const todosLancs = (lancamentosPorConta[conta.codigo] || [])
        .slice()
        .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

      // Agrupa todos os lancamentos por mes (sem filtro de ocorrencia - filtro e por conta)
      const porMes = {};
      meses.forEach(m => {
        porMes[m.key] = { label: m.label, mesKey: m.key, lancs: [], total: 0, qtd: 0 };
      });
      todosLancs.forEach(l => {
        if (!porMes[l.mesKey]) return;
        const valorSigned = Math.abs(Number(l.valor || 0)) * (l.sinal || -1);
        porMes[l.mesKey].lancs.push(l);
        porMes[l.mesKey].total += valorSigned;
        porMes[l.mesKey].qtd += 1;
      });

      const totalPeriodo = Object.values(porMes).reduce((s, m) => s + m.total, 0);
      const dupCount = todosLancs.filter(l => dupPorId.has(l.id)).length;
      const picoCount = todosLancs.filter(l => picoPorContaMes.has(`${conta.codigo}|${l.mesKey}`)).length;
      const quedaCount = todosLancs.filter(l => quedaPorContaMes.has(`${conta.codigo}|${l.mesKey}`)).length;
      const ausenciaCount = meses.filter(m => ausenciaPorContaMes.has(`${conta.codigo}|${m.key}`)).length;
      const isRecorrente = contasRecorrentes.has(conta.codigo);

      return {
        ...conta,
        qtdTotalPeriodo: todosLancs.length,
        totalPeriodo,
        porMes,
        dupCount, picoCount, quedaCount, ausenciaCount,
        isRecorrente,
      };
    });
  }, [resultado.contasAnalisadas, lancamentosPorConta, meses, dupPorId, picoPorContaMes, quedaPorContaMes, ausenciaPorContaMes, contasRecorrentes]);

  // Filtro e aplicado no nivel da CONTA: se a conta tem ao menos uma ocorrencia cujo filtro esta ativo,
  // todos os lancamentos dela sao exibidos (inclusive meses sem ocorrencia).
  const contasVisiveis = useMemo(() => {
    return contasProcessadas.filter(c => {
      if (ocultarSemMov && c.qtdTotalPeriodo === 0 && c.ausenciaCount === 0) return false;
      const hasDup = c.dupCount > 0;
      const hasPico = c.picoCount > 0;
      const hasQueda = c.quedaCount > 0;
      const hasAusencia = c.ausenciaCount > 0;
      const hasAny = hasDup || hasPico || hasQueda || hasAusencia;
      if (hasDup && filtros.dup) return true;
      if (hasPico && filtros.pico) return true;
      if (hasQueda && filtros.queda) return true;
      if (hasAusencia && filtros.ausencia) return true;
      if (!hasAny && filtros.normal) return true;
      return false;
    });
  }, [contasProcessadas, ocultarSemMov, filtros]);

  if ((resultado.contasAnalisadas || []).length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-xl px-6 py-12 text-center">
        <p className="text-sm text-gray-500">Nenhuma conta marcada para análise.</p>
      </div>
    );
  }

  const toggleConta = (codigo) => {
    setContasExpandidas(prev => {
      const next = new Set(prev);
      next.has(codigo) ? next.delete(codigo) : next.add(codigo);
      return next;
    });
  };

  const toggleMes = (contaCodigo, mesKey) => {
    const id = `${contaCodigo}|${mesKey}`;
    setMesesExpandidos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandirTodas = () => {
    setContasExpandidas(new Set(contasVisiveis.map(c => c.codigo)));
    const mes = new Set();
    contasVisiveis.forEach(c => meses.forEach(m => mes.add(`${c.codigo}|${m.key}`)));
    setMesesExpandidos(mes);
  };
  const colapsarTodas = () => { setContasExpandidas(new Set()); setMesesExpandidos(new Set()); };

  // Ao imprimir: expande tudo automaticamente para o PDF conter todos os lancamentos
  useEffect(() => {
    const onBefore = () => expandirTodas();
    window.addEventListener('beforeprint', onBefore);
    return () => window.removeEventListener('beforeprint', onBefore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contasVisiveis, meses]);

  const totalLancsFiltrados = contasVisiveis.reduce((s, c) => s + c.qtdTotalPeriodo, 0);

  return (
    <div className="space-y-3">
      {/* Toolbar filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2 no-print">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-semibold uppercase tracking-wider">
          <Filter className="h-3 w-3" /> Ocorrências:
        </div>
        <FilterChip ativo={filtros.dup} onClick={() => toggleFiltro('dup')} tipo="dup">Duplicatas</FilterChip>
        <FilterChip ativo={filtros.pico} onClick={() => toggleFiltro('pico')} tipo="pico">Picos</FilterChip>
        <FilterChip ativo={filtros.queda} onClick={() => toggleFiltro('queda')} tipo="queda">Quedas</FilterChip>
        <FilterChip ativo={filtros.ausencia} onClick={() => toggleFiltro('ausencia')} tipo="ausencia">Sem lançamento (mensal)</FilterChip>
        <FilterChip ativo={filtros.normal} onClick={() => toggleFiltro('normal')} tipo="normal">Sem ocorrência</FilterChip>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setOcultarSemMov(!ocultarSemMov)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all border ${
              ocultarSemMov ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            {ocultarSemMov ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            Ocultar sem movimento
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between no-print">
        <p className="text-[11px] text-gray-500">
          Exibindo <strong>{contasVisiveis.length}</strong> {contasVisiveis.length === 1 ? 'conta' : 'contas'} ·{' '}
          <strong>{totalLancsFiltrados}</strong> lançamentos (após filtros)
        </p>
        <div className="flex items-center gap-1">
          <button onClick={expandirTodas} className="text-[11px] text-blue-600 hover:text-blue-800 px-2 py-1">
            Expandir todas
          </button>
          <span className="text-gray-300">|</span>
          <button onClick={colapsarTodas} className="text-[11px] text-gray-500 hover:text-gray-800 px-2 py-1">
            Colapsar todas
          </button>
        </div>
      </div>

      {/* Tree */}
      {contasVisiveis.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-6 py-12 text-center">
          <p className="text-sm text-gray-500">Nenhuma conta corresponde aos filtros selecionados.</p>
        </div>
      ) : (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {contasVisiveis.map(conta => {
            const expanded = contasExpandidas.has(conta.codigo);
            const temAnomalia = conta.dupCount > 0 || conta.picoCount > 0 || conta.quedaCount > 0;

            return (
              <li key={conta.codigo} className="print-conta">
                <button onClick={() => toggleConta(conta.codigo)}
                  className={`w-full flex items-center gap-2 px-4 py-3 text-left transition-colors ${
                    temAnomalia ? 'hover:bg-amber-50/30' : 'hover:bg-gray-50'
                  }`}>
                  <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}
                    className="text-gray-400 flex-shrink-0">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </motion.div>
                  {expanded
                    ? <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    : <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  }
                  <span className="text-[11px] font-mono text-gray-400 flex-shrink-0">{conta.codigo}</span>
                  <span className="text-sm font-medium text-gray-800 truncate flex-1">{conta.descricao}</span>
                  {conta.isRecorrente && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 text-[9px] font-semibold flex-shrink-0"
                      title="Conta marcada como recorrência mensal obrigatoria">
                      <Repeat className="h-2.5 w-2.5" /> Mensal
                    </span>
                  )}
                  <span className={`text-[12px] font-mono font-semibold whitespace-nowrap flex-shrink-0 ${
                    conta.totalPeriodo >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {formatCurrency(conta.totalPeriodo)}
                  </span>
                  <span className="text-[11px] text-gray-400 flex-shrink-0 w-16 text-right">
                    {conta.qtdTotalPeriodo} lanc.
                  </span>
                  {conta.dupCount > 0 && <Badge tipo="dup">{conta.dupCount}</Badge>}
                  {conta.picoCount > 0 && <Badge tipo="pico">{conta.picoCount}</Badge>}
                  {conta.quedaCount > 0 && <Badge tipo="queda">{conta.quedaCount}</Badge>}
                  {conta.ausenciaCount > 0 && <Badge tipo="ausencia">{conta.ausenciaCount}</Badge>}
                </button>

                {/* Meses + Lancamentos */}
                {expanded && (
                  <div className="bg-gray-50/40">
                    {meses.map((m, mIdx) => {
                      const mesData = conta.porMes[m.key];
                      if (!mesData) return null;
                      const mesExpId = `${conta.codigo}|${m.key}`;
                      const mesExpanded = mesesExpandidos.has(mesExpId);
                      const isPicoMes = picoPorContaMes.has(`${conta.codigo}|${m.key}`);
                      const isQuedaMes = quedaPorContaMes.has(`${conta.codigo}|${m.key}`);

                      // Comparar com mes anterior para variacao
                      const mesAnt = mIdx > 0 ? conta.porMes[meses[mIdx - 1].key] : null;
                      const variacao = mesAnt && mesAnt.total !== 0
                        ? ((mesData.total - mesAnt.total) / Math.abs(mesAnt.total)) * 100
                        : null;

                      return (
                        <div key={m.key} className="border-t border-gray-100 first:border-t-0 print-mes">
                          <button onClick={() => toggleMes(conta.codigo, m.key)}
                            disabled={mesData.qtd === 0}
                            className={`w-full flex items-center gap-2 pl-10 pr-4 py-2 text-left transition-colors ${
                              mesData.qtd === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100/60'
                            }`}>
                            <motion.div animate={{ rotate: mesExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}
                              className="text-gray-400 flex-shrink-0">
                              <ChevronRight className="h-3 w-3" />
                            </motion.div>
                            <Calendar className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                            <span className="text-[12px] font-semibold text-gray-700 flex-shrink-0">{m.label}</span>
                            {isPicoMes && <Badge tipo="pico" small>Pico</Badge>}
                            {isQuedaMes && <Badge tipo="queda" small>Queda</Badge>}
                            {ausenciaPorContaMes.has(`${conta.codigo}|${m.key}`) && (
                              <Badge tipo="ausencia" small>Sem lançamento</Badge>
                            )}
                            <span className="flex-1" />
                            <span className={`text-[11px] font-mono font-semibold whitespace-nowrap ${
                              mesData.total >= 0 ? 'text-emerald-700' : 'text-red-600'
                            }`}>
                              {formatCurrency(mesData.total)}
                            </span>
                            {variacao !== null && mesData.qtd > 0 && (
                              <span className={`text-[10px] font-semibold whitespace-nowrap w-16 text-right ${
                                variacao > 0 ? 'text-emerald-600' : variacao < 0 ? 'text-red-500' : 'text-gray-400'
                              }`}>
                                {variacao > 0 ? '▲' : variacao < 0 ? '▼' : ''} {Math.abs(variacao).toFixed(1)}%
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400 w-14 text-right">{mesData.qtd} lanc.</span>
                          </button>

                          {mesExpanded && mesData.qtd > 0 && (
                            <ul className="divide-y divide-gray-100 bg-white/60">
                              {mesData.lancs.map(l => {
                                const dupInfo = dupPorId.get(l.id);
                                const isPico = picoPorContaMes.has(`${conta.codigo}|${l.mesKey}`);
                                const isQueda = quedaPorContaMes.has(`${conta.codigo}|${l.mesKey}`);
                                return (
                                  <li key={l.id} className="pl-20 pr-4 py-2 flex items-center gap-3">
                                    <span className="text-[11px] font-mono text-gray-400 flex-shrink-0 w-14">{formatDataBR(l.data)}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[12px] text-gray-700 truncate">{l.descricao}</p>
                                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                        {dupInfo && <Badge tipo="dup" small>Duplicata ({dupInfo.idxNoGrupo}/{dupInfo.total})</Badge>}
                                        {isPico && <Badge tipo="pico" small>Pico do mês</Badge>}
                                        {isQueda && <Badge tipo="queda" small>Queda do mês</Badge>}
                                        {l.situacao && (
                                          <span className={`text-[9px] rounded px-1.5 py-0.5 ${
                                            l.situacao === 'Pago' ? 'bg-emerald-50 text-emerald-600' :
                                            l.situacao === 'Aberto' ? 'bg-blue-50 text-blue-600' :
                                            'bg-gray-100 text-gray-500'
                                          }`}>{l.situacao}</span>
                                        )}
                                      </div>
                                    </div>
                                    <span className={`text-[12px] font-mono font-semibold whitespace-nowrap ${
                                      l.sinal > 0 ? 'text-emerald-700' : 'text-red-600'
                                    }`}>
                                      {formatCurrency(Math.abs(Number(l.valor || 0)) * (l.sinal || -1))}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      )}
    </div>
  );
}

function FilterChip({ ativo, onClick, tipo, children }) {
  const active = {
    dup:      'bg-amber-100 text-amber-800 border-amber-300',
    pico:     'bg-red-100 text-red-800 border-red-300',
    queda:    'bg-orange-100 text-orange-800 border-orange-300',
    ausencia: 'bg-purple-100 text-purple-800 border-purple-300',
    normal:   'bg-gray-200 text-gray-800 border-gray-300',
  };
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
        ativo ? active[tipo] : 'bg-white text-gray-400 border-gray-200 line-through hover:text-gray-600'
      }`}>
      {children}
    </button>
  );
}

function Badge({ tipo, children, small }) {
  const map = {
    dup:      'bg-amber-100 text-amber-800 border-amber-200',
    pico:     'bg-red-100 text-red-800 border-red-200',
    queda:    'bg-orange-100 text-orange-800 border-orange-200',
    ausencia: 'bg-purple-100 text-purple-800 border-purple-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 ${small ? 'text-[9px]' : 'text-[10px] py-0.5'} font-semibold ${map[tipo]}`}>
      {children}
    </span>
  );
}
