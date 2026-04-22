// Tree EMPRESA > CONTA > LANCAMENTO com meses em colunas.
// No nivel LANCAMENTO, agrupa titulos similares para mostrar periodicidade,
// com badges para: mensal, maior alta, maior baixa, duplicata, sem ocorrencia.
//
// REGRAS DE ALTA/BAIXA (interpretacao do usuario):
//   Para DESPESAS (valor total < 0): mais negativo = aumento de despesa (ALTA);
//                                    menos negativo = reducao (BAIXA).
//   Para RECEITAS (valor total > 0): maior positivo = aumento (ALTA); menor = queda (BAIXA).
// Delta = (valor no ultimo mes com valor) - (valor no primeiro mes com valor).

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronRight, Building2, Wallet, Repeat, AlertCircle, Copy, TrendingUp, TrendingDown,
  Filter, Check, X,
} from 'lucide-react';
import { formatCurrency } from '../utils/format';

function normalizarTexto(s) {
  if (!s) return '';
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\b(n\s+\d+|numero\s+\d+|fatura\s+\d+|nfe\s+\d+|nf\s+\d+|parcela\s+\d+|ref\s+\d+)\b/g, '')
    .replace(/\b\d+[\/\-]\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function agruparPorTipo(lancamentos) {
  const grupos = new Map();
  lancamentos.forEach(l => {
    const contraparte = normalizarTexto(l.fornecedorCodigo ? `f-${l.fornecedorCodigo}` : '')
      || normalizarTexto((l.descricao || '').split('·').pop());
    const descNorm = normalizarTexto(l.descricao || '');
    const chave = `${contraparte}|${descNorm.slice(0, 80)}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        chave,
        descricao: (l.descricao || '—').trim(),
        contraparte: contraparte || '—',
        lancamentos: [],
        porMes: new Map(),
      });
    }
    const g = grupos.get(chave);
    g.lancamentos.push(l);
    const atual = g.porMes.get(l.mesKey) || { valor: 0, count: 0, ids: new Set() };
    atual.valor += Math.abs(l.valor) * l.sinal;
    atual.count += 1;
    atual.ids.add(l.id);
    g.porMes.set(l.mesKey, atual);
  });
  return Array.from(grupos.values());
}

// Classifica um tipo em alta/baixa/estavel/unico.
// Retorna: { delta, deltaPct, classificacao }
function classificarTipo(tipo, mesesKeys) {
  const mesesOrdenados = mesesKeys
    .map(k => ({ k, dado: tipo.porMes.get(k) }))
    .filter(x => x.dado && Math.abs(x.dado.valor) >= 0.01);
  if (mesesOrdenados.length < 2) {
    return { delta: 0, deltaPct: null, classificacao: 'unico' };
  }
  const primeiro = mesesOrdenados[0].dado.valor;
  const ultimo = mesesOrdenados[mesesOrdenados.length - 1].dado.valor;
  const delta = ultimo - primeiro;
  const isDespesa = primeiro < 0 || ultimo < 0;
  let classificacao = 'estavel';
  // Tolerancia de 2% sobre o maior absoluto para evitar classificar ruido
  const tolerancia = Math.max(Math.abs(primeiro), Math.abs(ultimo)) * 0.02;
  if (Math.abs(delta) <= tolerancia) {
    classificacao = 'estavel';
  } else if (isDespesa) {
    // Despesa: delta negativo = despesa aumentou (alta); delta positivo = despesa reduziu (baixa)
    classificacao = delta < 0 ? 'alta' : 'baixa';
  } else {
    // Receita: delta positivo = aumentou (alta); delta negativo = caiu (baixa)
    classificacao = delta > 0 ? 'alta' : 'baixa';
  }
  const deltaPct = primeiro !== 0 ? (delta / Math.abs(primeiro)) * 100 : null;
  return { delta, deltaPct, classificacao };
}

// Detecta duplicatas dentro de um tipo: mesmo mes + mesmo valor absoluto arredondado a R$0,01
// e count >= 2 lancamentos naquele bucket de mes.
function detectarDuplicatas(tipo) {
  const duplicatasPorMes = {};
  for (const [mesKey, dado] of tipo.porMes.entries()) {
    if (dado.count >= 2) {
      // Verifica se os valores individuais se repetem (pela media ou pelos lancamentos)
      const valoresMes = tipo.lancamentos
        .filter(l => l.mesKey === mesKey)
        .map(l => Math.round(Math.abs(l.valor) * 100) / 100);
      const bucketPorValor = new Map();
      valoresMes.forEach(v => bucketPorValor.set(v, (bucketPorValor.get(v) || 0) + 1));
      const temDuplicata = Array.from(bucketPorValor.values()).some(c => c >= 2);
      if (temDuplicata) duplicatasPorMes[mesKey] = true;
    }
  }
  return Object.keys(duplicatasPorMes).length > 0;
}

export default function AnaliseLancamentosTreeRede({ porEmpresa, meses, contasFlags }) {
  const [empresasAbertas, setEmpresasAbertas] = useState(new Set());
  const [contasAbertas, setContasAbertas] = useState(new Set());
  const [filtro, setFiltro] = useState('todas'); // todas | mensal | alta | baixa | duplicata | sem-ocorrencia

  React.useEffect(() => {
    if (porEmpresa && porEmpresa.length > 0) {
      setEmpresasAbertas(new Set(porEmpresa.map(e => e.empresaId)));
    }
  }, [porEmpresa]);

  // Constroi tree com badges e classificacoes calculadas
  const { tree, resumo, contasSemOcorrenciaInfo } = useMemo(() => {
    if (!porEmpresa) return { tree: [], resumo: null, contasSemOcorrenciaInfo: [] };
    const mesesKeys = meses.map(m => m.key);

    // Constroi todas empresas com todas contas flagadas (mesmo vazias)
    const tree = porEmpresa.map(emp => {
      const contas = Object.keys(contasFlags).map(codigo => {
        const flag = contasFlags[codigo] || {};
        const lancs = emp.lancsPorConta[codigo] || [];
        const qtdLanc = lancs.length;
        const tipos = qtdLanc > 0 ? agruparPorTipo(lancs) : [];

        // Classifica cada tipo
        tipos.forEach(t => {
          const { delta, deltaPct, classificacao } = classificarTipo(t, mesesKeys);
          t.delta = delta;
          t.deltaPct = deltaPct;
          t.classificacao = classificacao;
          t.duplicata = detectarDuplicatas(t);
          t.cobertura = Array.from(t.porMes.keys()).filter(k => mesesKeys.includes(k)).length;
          t.mensal = meses.length >= 2 && t.cobertura === meses.length;
          t.esporadico = t.cobertura === 1 && meses.length >= 2;
          t.totalGeral = Array.from(t.porMes.values()).reduce((s, v) => s + v.valor, 0);
        });
        tipos.sort((a, b) => Math.abs(b.totalGeral) - Math.abs(a.totalGeral));

        const totaisPorMes = {};
        mesesKeys.forEach(k => {
          totaisPorMes[k] = lancs
            .filter(l => l.mesKey === k)
            .reduce((s, l) => s + Math.abs(l.valor) * l.sinal, 0);
        });
        const totalGeral = Object.values(totaisPorMes).reduce((s, v) => s + v, 0);
        const temOcorrencia = qtdLanc > 0;

        return {
          codigo,
          descricao: flag.descricao || `Conta ${codigo}`,
          tipos,
          totaisPorMes,
          totalGeral,
          qtdLancamentos: qtdLanc,
          qtdTipos: tipos.length,
          temOcorrencia,
          temDuplicata: tipos.some(t => t.duplicata),
          temMensal: tipos.some(t => t.mensal),
          classContaBadge: tipos.reduce((acc, t) => {
            if (t.classificacao === 'alta') acc.alta += 1;
            else if (t.classificacao === 'baixa') acc.baixa += 1;
            return acc;
          }, { alta: 0, baixa: 0 }),
        };
      }).sort((a, b) => {
        // Ordena: com ocorrencia primeiro (por valor absoluto desc), depois sem
        if (a.temOcorrencia !== b.temOcorrencia) return a.temOcorrencia ? -1 : 1;
        return Math.abs(b.totalGeral) - Math.abs(a.totalGeral);
      });

      const totaisEmpresaPorMes = {};
      mesesKeys.forEach(k => {
        totaisEmpresaPorMes[k] = contas.reduce((s, c) => s + (c.totaisPorMes[k] || 0), 0);
      });
      const totalGeral = Object.values(totaisEmpresaPorMes).reduce((s, v) => s + v, 0);

      return {
        ...emp,
        contas,
        totaisPorMes: totaisEmpresaPorMes,
        totalGeral,
        qtdLancamentos: contas.reduce((s, c) => s + c.qtdLancamentos, 0),
        qtdContasSemOcorrencia: contas.filter(c => !c.temOcorrencia).length,
      };
    });

    // Rankings globais
    const todosTipos = [];
    const duplicatasAll = [];
    const semOcorrencia = [];
    const mensais = [];
    tree.forEach(emp => {
      emp.contas.forEach(c => {
        if (!c.temOcorrencia) {
          semOcorrencia.push({ empresa: emp.empresaNome, conta: c.descricao });
          return;
        }
        c.tipos.forEach(t => {
          todosTipos.push({ ...t, empresaNome: emp.empresaNome, contaDescricao: c.descricao });
          if (t.duplicata) duplicatasAll.push({ empresa: emp.empresaNome, conta: c.descricao, tipo: t.descricao });
          if (t.mensal) mensais.push({ empresa: emp.empresaNome, conta: c.descricao, tipo: t.descricao, total: t.totalGeral });
        });
      });
    });

    const maioresAltas = todosTipos
      .filter(t => t.classificacao === 'alta')
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);
    const maioresBaixas = todosTipos
      .filter(t => t.classificacao === 'baixa')
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);

    return {
      tree,
      resumo: {
        totalTipos: todosTipos.length,
        mensais: mensais.length,
        altas: todosTipos.filter(t => t.classificacao === 'alta').length,
        baixas: todosTipos.filter(t => t.classificacao === 'baixa').length,
        duplicatas: duplicatasAll.length,
        semOcorrencia: semOcorrencia.length,
        maioresAltas,
        maioresBaixas,
      },
      contasSemOcorrenciaInfo: semOcorrencia,
    };
  }, [porEmpresa, meses, contasFlags]);

  // Aplica filtro: decide se um tipo deve aparecer
  const tipoVisivel = (t) => {
    if (filtro === 'todas') return true;
    if (filtro === 'mensal') return t.mensal;
    if (filtro === 'alta') return t.classificacao === 'alta';
    if (filtro === 'baixa') return t.classificacao === 'baixa';
    if (filtro === 'duplicata') return t.duplicata;
    if (filtro === 'sem-ocorrencia') return false; // so contas sem ocorrencia aparecem
    return true;
  };
  // Decide se uma conta deve aparecer
  const contaVisivel = (c) => {
    if (filtro === 'todas') return true;
    if (filtro === 'sem-ocorrencia') return !c.temOcorrencia;
    if (!c.temOcorrencia) return false;
    return c.tipos.some(tipoVisivel);
  };

  const toggleEmpresa = (id) => setEmpresasAbertas(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleConta = (key) => setContasAbertas(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  if (!tree || tree.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-gray-500">
        Nenhum dado encontrado.
      </div>
    );
  }

  const colunasMeses = meses.length;
  const firstColWidth = 360;
  const mesColWidth = 110;
  const totalColWidth = 120;

  const consolidadoPorMes = {};
  meses.forEach(m => {
    consolidadoPorMes[m.key] = tree.reduce((s, e) => s + (e.totaisPorMes[m.key] || 0), 0);
  });
  const consolidadoTotal = Object.values(consolidadoPorMes).reduce((s, v) => s + v, 0);

  return (
    <div>
      {/* Cards de resumo */}
      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4 px-5 pt-5 no-print">
          <CardResumo icon={Repeat} cor="emerald" label="Mensais" valor={resumo.mensais} />
          <CardResumo icon={TrendingUp} cor="red" label="Altas" valor={resumo.altas}
            hint={resumo.maioresAltas[0]
              ? `Top: ${formatCurrency(resumo.maioresAltas[0].delta)}`
              : null} />
          <CardResumo icon={TrendingDown} cor="blue" label="Baixas" valor={resumo.baixas}
            hint={resumo.maioresBaixas[0]
              ? `Top: ${formatCurrency(resumo.maioresBaixas[0].delta)}`
              : null} />
          <CardResumo icon={Copy} cor="amber" label="Duplicatas" valor={resumo.duplicatas} />
          <CardResumo icon={AlertCircle} cor="gray" label="Sem ocorrencia" valor={resumo.semOcorrencia} />
          <CardResumo icon={Filter} cor="violet" label="Total tipos" valor={resumo.totalTipos} />
        </div>
      )}

      {/* Top 3 maiores altas/baixas (visiveis sempre) */}
      {resumo && (resumo.maioresAltas.length > 0 || resumo.maioresBaixas.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-5 mb-4 no-print">
          {resumo.maioresAltas.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-red-600" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">Maiores altas (despesas que cresceram)</p>
              </div>
              <ul className="space-y-1">
                {resumo.maioresAltas.map((t, i) => (
                  <li key={i} className="text-[11.5px] flex items-center gap-2">
                    <span className="font-mono text-gray-400 w-4">{i + 1}.</span>
                    <span className="flex-1 truncate text-gray-800">{t.descricao}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{t.empresaNome}</span>
                    <span className="font-mono tabular-nums text-red-700 font-semibold flex-shrink-0">
                      {t.delta > 0 ? '+' : ''}{formatCurrency(t.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {resumo.maioresBaixas.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-4 w-4 text-blue-600" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Maiores baixas (despesas reduzidas)</p>
              </div>
              <ul className="space-y-1">
                {resumo.maioresBaixas.map((t, i) => (
                  <li key={i} className="text-[11.5px] flex items-center gap-2">
                    <span className="font-mono text-gray-400 w-4">{i + 1}.</span>
                    <span className="flex-1 truncate text-gray-800">{t.descricao}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{t.empresaNome}</span>
                    <span className="font-mono tabular-nums text-blue-700 font-semibold flex-shrink-0">
                      {t.delta > 0 ? '+' : ''}{formatCurrency(t.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="px-5 pb-3 flex flex-wrap items-center gap-2 no-print">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mr-1">Filtrar:</span>
        <ChipFiltro label="Todas" ativo={filtro === 'todas'} onClick={() => setFiltro('todas')} />
        <ChipFiltro label="Mensais" icon={Repeat} cor="emerald" count={resumo?.mensais} ativo={filtro === 'mensal'} onClick={() => setFiltro('mensal')} />
        <ChipFiltro label="Altas" icon={TrendingUp} cor="red" count={resumo?.altas} ativo={filtro === 'alta'} onClick={() => setFiltro('alta')} />
        <ChipFiltro label="Baixas" icon={TrendingDown} cor="blue" count={resumo?.baixas} ativo={filtro === 'baixa'} onClick={() => setFiltro('baixa')} />
        <ChipFiltro label="Duplicatas" icon={Copy} cor="amber" count={resumo?.duplicatas} ativo={filtro === 'duplicata'} onClick={() => setFiltro('duplicata')} />
        <ChipFiltro label="Sem ocorrencia" icon={AlertCircle} cor="gray" count={resumo?.semOcorrencia} ativo={filtro === 'sem-ocorrencia'} onClick={() => setFiltro('sem-ocorrencia')} />
      </div>

      {/* Tree */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: firstColWidth + colunasMeses * mesColWidth + totalColWidth }}>
          <colgroup>
            <col style={{ width: firstColWidth }} />
            {meses.map(m => <col key={m.key} style={{ width: mesColWidth }} />)}
            <col style={{ width: totalColWidth }} />
          </colgroup>
          <thead className="bg-gray-50/80 border-b border-gray-100 sticky top-0 z-10">
            <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-2.5">Empresa / Conta / Lancamento</th>
              {meses.map(m => (
                <th key={m.key} className="px-2 py-2.5 text-right whitespace-nowrap">{m.label}</th>
              ))}
              <th className="px-3 py-2.5 text-right bg-gray-100/60">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tree.map(emp => {
              const empAberta = empresasAbertas.has(emp.empresaId);
              const contasFiltradas = emp.contas.filter(contaVisivel);
              // Se com filtro ativo e empresa nao tem nada, esconde empresa
              if (filtro !== 'todas' && contasFiltradas.length === 0) return null;
              return (
                <React.Fragment key={emp.empresaId}>
                  <tr onClick={() => toggleEmpresa(emp.empresaId)}
                    className={`cursor-pointer transition-colors ${empAberta ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <motion.div animate={{ rotate: empAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                        </motion.div>
                        <Building2 className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-[12.5px] font-semibold text-gray-900 truncate">{emp.empresaNome}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {contasFiltradas.length} conta{contasFiltradas.length === 1 ? '' : 's'} · {emp.qtdLancamentos} lancs.
                        </span>
                      </div>
                    </td>
                    {meses.map(m => {
                      const v = emp.totaisPorMes[m.key] || 0;
                      return (
                        <td key={m.key} className={`px-2 py-2 text-right font-mono tabular-nums text-[12px] ${
                          Math.abs(v) < 0.01 ? 'text-gray-300'
                            : v > 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}>
                          {Math.abs(v) < 0.01 ? '—' : formatCurrency(v)}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-right font-mono tabular-nums text-[12.5px] font-bold bg-gray-50/40 ${
                      emp.totalGeral >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}>
                      {formatCurrency(emp.totalGeral)}
                    </td>
                  </tr>

                  {empAberta && contasFiltradas.map(c => {
                    const contaKey = `${emp.empresaId}-${c.codigo}`;
                    const contaAberta = contasAbertas.has(contaKey);
                    const tiposFiltrados = c.tipos.filter(tipoVisivel);
                    return (
                      <React.Fragment key={contaKey}>
                        <tr onClick={() => c.temOcorrencia && toggleConta(contaKey)}
                          className={`transition-colors ${
                            !c.temOcorrencia ? 'bg-gray-50/30'
                              : contaAberta ? 'bg-gray-100/60 cursor-pointer'
                              : 'bg-gray-50/30 hover:bg-gray-50/60 cursor-pointer'
                          }`}>
                          <td className="px-3 py-1.5" style={{ paddingLeft: 40 }}>
                            <div className="flex items-center gap-2">
                              {c.temOcorrencia ? (
                                <motion.div animate={{ rotate: contaAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                  <ChevronRight className="h-3 w-3 text-gray-400" />
                                </motion.div>
                              ) : (
                                <div className="h-1 w-1 rounded-full bg-gray-300 flex-shrink-0" />
                              )}
                              <Wallet className="h-3 w-3 text-gray-500 flex-shrink-0" />
                              <span className="text-[11.5px] font-medium text-gray-800 truncate">{c.descricao}</span>
                              {!c.temOcorrencia && (
                                <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-gray-100 text-gray-600 border border-gray-200 flex-shrink-0" title="Sem lancamento no periodo">
                                  <AlertCircle className="h-2.5 w-2.5" /> sem ocorrencia
                                </span>
                              )}
                              {c.temMensal && (
                                <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0" title="Tem 1+ lancamento mensal">
                                  <Repeat className="h-2.5 w-2.5" /> mensal
                                </span>
                              )}
                              {c.temDuplicata && (
                                <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0" title="Duplicatas detectadas">
                                  <Copy className="h-2.5 w-2.5" /> dup.
                                </span>
                              )}
                              {c.classContaBadge.alta > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-red-50 text-red-700 border border-red-200 flex-shrink-0" title={`${c.classContaBadge.alta} tipo(s) em alta`}>
                                  <TrendingUp className="h-2.5 w-2.5" /> {c.classContaBadge.alta}
                                </span>
                              )}
                              {c.classContaBadge.baixa > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0" title={`${c.classContaBadge.baixa} tipo(s) em baixa`}>
                                  <TrendingDown className="h-2.5 w-2.5" /> {c.classContaBadge.baixa}
                                </span>
                              )}
                              {c.temOcorrencia && (
                                <span className="text-[10px] text-gray-400 flex-shrink-0 ml-auto">
                                  {tiposFiltrados.length}/{c.qtdTipos} tipos · {c.qtdLancamentos} lancs.
                                </span>
                              )}
                            </div>
                          </td>
                          {meses.map(m => {
                            const v = c.totaisPorMes[m.key] || 0;
                            return (
                              <td key={m.key} className={`px-2 py-1.5 text-right font-mono tabular-nums text-[11.5px] ${
                                Math.abs(v) < 0.01 ? 'text-gray-300'
                                  : v > 0 ? 'text-emerald-700' : 'text-red-700'
                              }`}>
                                {Math.abs(v) < 0.01 ? '—' : formatCurrency(v)}
                              </td>
                            );
                          })}
                          <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold ${
                            c.totalGeral >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}>
                            {Math.abs(c.totalGeral) < 0.01 ? '—' : formatCurrency(c.totalGeral)}
                          </td>
                        </tr>

                        {contaAberta && c.temOcorrencia && tiposFiltrados.map((t, i) => (
                          <tr key={`${contaKey}-${i}`} className="bg-white hover:bg-blue-50/30">
                            <td className="px-3 py-1" style={{ paddingLeft: 68 }}>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="h-1 w-1 rounded-full bg-blue-300 flex-shrink-0" />
                                <span title={t.descricao} className="text-[11px] text-gray-700 truncate flex-1 min-w-0">{t.descricao}</span>
                                {t.mensal && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0" title={`Aparece em todos os ${meses.length} meses`}>
                                    <Repeat className="h-2.5 w-2.5" /> mensal
                                  </span>
                                )}
                                {!t.mensal && t.cobertura >= 2 && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-gray-50 text-gray-600 border border-gray-200 flex-shrink-0" title={`Em ${t.cobertura} de ${meses.length} meses`}>
                                    {t.cobertura}/{meses.length}
                                  </span>
                                )}
                                {t.esporadico && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0" title="So em 1 mes">
                                    <AlertCircle className="h-2.5 w-2.5" /> esporadico
                                  </span>
                                )}
                                {t.classificacao === 'alta' && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-red-50 text-red-700 border border-red-200 flex-shrink-0" title={`Despesa aumentou ${formatCurrency(Math.abs(t.delta))}`}>
                                    <TrendingUp className="h-2.5 w-2.5" /> alta
                                  </span>
                                )}
                                {t.classificacao === 'baixa' && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0" title={`Reducao de ${formatCurrency(Math.abs(t.delta))}`}>
                                    <TrendingDown className="h-2.5 w-2.5" /> baixa
                                  </span>
                                )}
                                {t.duplicata && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0" title="Valores duplicados no mesmo mes">
                                    <Copy className="h-2.5 w-2.5" /> duplicata
                                  </span>
                                )}
                              </div>
                            </td>
                            {meses.map(m => {
                              const dado = t.porMes.get(m.key);
                              const v = dado?.valor || 0;
                              return (
                                <td key={m.key} className={`px-2 py-1 text-right font-mono tabular-nums text-[10.5px] ${
                                  !dado || Math.abs(v) < 0.01 ? 'text-gray-300'
                                    : v > 0 ? 'text-emerald-700' : 'text-red-700'
                                }`} title={dado ? `${dado.count} lancamento(s)` : 'Sem lancamento neste mes'}>
                                  {!dado || Math.abs(v) < 0.01 ? '—' : formatCurrency(v)}
                                </td>
                              );
                            })}
                            <td className={`px-3 py-1 text-right font-mono tabular-nums text-[11px] ${
                              t.totalGeral >= 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                              {formatCurrency(t.totalGeral)}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-100 border-t-2 border-gray-300">
            <tr className="text-[12.5px] font-bold">
              <td className="px-3 py-2.5 text-gray-800">Consolidado da rede</td>
              {meses.map(m => {
                const v = consolidadoPorMes[m.key] || 0;
                return (
                  <td key={m.key} className={`px-2 py-2.5 text-right font-mono tabular-nums ${
                    Math.abs(v) < 0.01 ? 'text-gray-400'
                      : v > 0 ? 'text-emerald-800' : 'text-red-800'
                  }`}>
                    {Math.abs(v) < 0.01 ? '—' : formatCurrency(v)}
                  </td>
                );
              })}
              <td className={`px-3 py-2.5 text-right font-mono tabular-nums bg-gray-200 ${
                consolidadoTotal >= 0 ? 'text-emerald-800' : 'text-red-800'
              }`}>
                {formatCurrency(consolidadoTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function CardResumo({ icon: Icon, cor, label, valor, hint }) {
  const bgMap = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
  };
  return (
    <div className={`rounded-lg border p-2.5 ${bgMap[cor] || bgMap.gray}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="h-3.5 w-3.5" />
        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      </div>
      <p className="text-[18px] font-bold tabular-nums">{valor}</p>
      {hint && <p className="text-[9.5px] opacity-70 truncate">{hint}</p>}
    </div>
  );
}

function ChipFiltro({ label, icon: Icon, cor, count, ativo, onClick }) {
  const corMap = {
    emerald: 'text-emerald-700', red: 'text-red-700', blue: 'text-blue-700',
    amber: 'text-amber-700', gray: 'text-gray-600', violet: 'text-violet-700',
  };
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
        ativo
          ? 'bg-gray-900 text-white shadow-sm'
          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}>
      {Icon && <Icon className={`h-3 w-3 ${ativo ? '' : corMap[cor] || ''}`} />}
      {label}
      {count != null && (
        <span className={`inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full text-[9.5px] font-bold tabular-nums ${
          ativo ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
        }`}>
          {count}
        </span>
      )}
      {ativo && <X className="h-2.5 w-2.5 ml-0.5 opacity-70" />}
    </button>
  );
}
