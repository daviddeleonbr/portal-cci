// Pacote de EVIDÊNCIAS para a análise "controller" — funções puras.
// Todos os números são calculados aqui (motor do fluxo, cruzamento, capital de giro,
// posto); a IA só interpreta. Cada número citável vira um FATO com id (F1, F2…):
// a resposta da IA tem que citar os ids, e o validador confere se cada R$ escrito
// existe no pacote.
import { comparar, r2 } from './variacao';
import { resumirAtividades } from './atividadesFluxo';
import { cruzarDreCaixa } from './cruzamentoDreCaixa';
import { indicadoresCapitalGiro } from './capitalGiro';
import { decomporVolumePreco } from './posto';

// ─── Registro de fatos ────────────────────────────────────────────
export function criarRegistroFatos(prefixo = 'F') {
  const fatos = [];
  const add = (rotulo, valor, unidade = 'R$') => {
    if (valor == null || !Number.isFinite(Number(valor))) return null;
    const id = `${prefixo}${fatos.length + 1}`;
    fatos.push({ id, rotulo, valor: unidade === 'R$' ? r2(valor) : Math.round(Number(valor) * 1000) / 1000, unidade });
    return id;
  };
  // registra uma comparação (anterior/atual/diferença) e devolve os ids
  const addComp = (rotulo, c, rotA, rotB) => (c ? {
    anterior: add(`${rotulo} · ${rotA}`, c.anterior), atual: add(`${rotulo} · ${rotB}`, c.atual),
    diferenca: add(`${rotulo} · diferença ${rotB} × ${rotA}`, c.diferenca), pct: c.pct,
  } : null);
  return { fatos, add, addComp };
}

const ehCalc = (n) => n.tipo === 'subtotal' || n.tipo === 'resultado';
const valorMes = (no, k) => (no?.valoresPorMes?.[k] || 0);

// Linhas da árvore (grupos até `profundidade`) com atual/anterior/ano anterior e
// contribuição na variação do caixa entre os meses
function linhasArvore(arvore, { atual, anterior, anoAnterior }, profundidade = 2) {
  const linhas = [];
  const visitar = (no, nivel, caminho) => {
    if (ehCalc(no)) return;
    linhas.push({
      nome: no.nome, caminho, nivel,
      atual: valorMes(no, atual), anterior: valorMes(no, anterior), anoAnterior: anoAnterior ? valorMes(no, anoAnterior) : null,
    });
    if (nivel < profundidade) (no.children || []).forEach(f => visitar(f, nivel + 1, `${caminho} › ${f.nome}`));
  };
  arvore.forEach(n => visitar(n, 0, n.nome));
  return linhas;
}

// Contas (folhas mapeadas) que mais mudaram entre o mês anterior e o atual
function maioresFatores(arvore, { atual, anterior }, meses6 = [], limite = 10) {
  const contas = [];
  const visitar = (no, caminho) => {
    (no.contas || []).forEach(c => {
      const a = valorMes(c, anterior);
      const b = valorMes(c, atual);
      if (Math.abs(b - a) < 0.5) return;
      const serie = meses6.map(k => valorMes(c, k));
      contas.push({
        conta: c.descricao || String(c.codigo), codigo: String(c.codigo), caminho,
        anterior: a, atual: b, diferenca: b - a,
        mesesComMovimento: serie.filter(v => Math.abs(v) >= 1).length,
        media6m: serie.length ? serie.reduce((s, v) => s + v, 0) / serie.length : null,
        lancamentos: (c.lancamentos || []).filter(l => l.mesKey === atual).sort((x, y) => y.valor - x.valor).slice(0, 3)
          .map(l => ({ data: l.data, valor: r2(l.valor * l.sinal), pessoa: l.pessoaNome || null, descricao: l.descricao })),
        // para "Investigar esta conta" (Fase 5)
        bruto: {
          serie: meses6.map(k => ({ mes: k, valor: valorMes(c, k) })),
          lancAtual: (c.lancamentos || []).filter(l => l.mesKey === atual),
          lancAnterior: (c.lancamentos || []).filter(l => l.mesKey === anterior),
        },
      });
    });
    (no.children || []).forEach(f => visitar(f, `${caminho} › ${f.nome}`));
  };
  arvore.filter(n => !ehCalc(n)).forEach(n => visitar(n, n.nome));
  return contas.sort((x, y) => Math.abs(y.diferenca) - Math.abs(x.diferenca)).slice(0, limite);
}

// ─── Montagem do pacote ───────────────────────────────────────────
// fluxo: { comCalculos (montarFluxo com todos os meses), chaves: { atual, anterior, anoAnterior }, meses6, rotulos }
// dre:   { porMes: { [key]: { receitaBruta, lucroBruto, resultado } }, linhasMaiorVariacao, mascara }
// giro:  { contasReceber, contasReceberVencido, contasPagar, contasPagarVencido, dataSaldo } | null
// posto: { combustiveis: [...combustiveis_por_produto], conveniencia } | null
export function montarPacoteController({ meta, fluxo, intercompany = null, anomalias = [], dre = null, giro = null, posto = null }) {
  const reg = criarRegistroFatos();
  const { add, addComp } = reg;
  const { comCalculos: arvore, chaves, meses6 = [], rotulos = {} } = fluxo;
  const rA = rotulos[chaves.anterior] || 'mês anterior';
  const rB = rotulos[chaves.atual] || 'mês atual';
  const rY = chaves.anoAnterior ? (rotulos[chaves.anoAnterior] || 'ano anterior') : null;
  const ausentes = [];

  // Atividades (operacional / investimento / financiamento) por período
  const atv = {
    atual: resumirAtividades(arvore, [chaves.atual]),
    anterior: resumirAtividades(arvore, [chaves.anterior]),
    anoAnterior: chaves.anoAnterior ? resumirAtividades(arvore, [chaves.anoAnterior]) : null,
  };
  const variacao = (k) => arvore.find(n => n.tipo === 'resultado')?.valoresPorMes?.[k]
    ?? arvore.filter(n => !ehCalc(n)).reduce((s, n) => s + valorMes(n, k), 0);
  const media6 = (f) => (meses6.length ? meses6.reduce((s, k) => s + f(k), 0) / meses6.length : null);
  const fatoresBrutos = maioresFatores(arvore, chaves, meses6);
  const caixa = {
    reconhecidas: atv.atual.reconhecidas,
    origem: atv.atual.origem,
    atividades: ['caixaOperacional', 'caixaInvestimento', 'caixaFinanciamento', 'transferenciasEntreContas', 'recebimentosOperacionais', 'pagamentosFornecedores'].map(campo => {
      const c = atv.atual[campo] == null || atv.anterior[campo] == null ? null : comparar(atv.anterior[campo], atv.atual[campo]);
      const nome = { caixaOperacional: 'Caixa operacional', caixaInvestimento: 'Caixa de investimento', caixaFinanciamento: 'Caixa de financiamento',
        transferenciasEntreContas: 'Transferências entre contas próprias', recebimentosOperacionais: 'Recebimentos operacionais', pagamentosFornecedores: 'Pagamentos a fornecedores' }[campo];
      if (!c) return { campo, nome, indisponivel: true };
      return { campo, nome, ...addComp(nome, c, rA, rB), anoAnterior: atv.anoAnterior?.[campo] != null ? add(`${nome} · ${rY}`, atv.anoAnterior[campo]) : null };
    }),
    variacao: {
      ...addComp('Variação de caixa', comparar(variacao(chaves.anterior), variacao(chaves.atual)), rA, rB),
      anoAnterior: chaves.anoAnterior ? add(`Variação de caixa · ${rY}`, variacao(chaves.anoAnterior)) : null,
      media6m: meses6.length ? add('Variação de caixa · média 6 meses', media6(k => variacao(k))) : null,
    },
    serie6m: meses6.map(k => ({ mes: rotulos[k] || k, variacao: r2(variacao(k)), operacional: r2(resumirAtividades(arvore, [k]).caixaOperacional ?? 0) })),
    grupos: linhasArvore(arvore, chaves).map(l => {
      const c = comparar(l.anterior, l.atual);
      return { nome: l.caminho, nivel: l.nivel, ...addComp(l.caminho, c, rA, rB),
        anoAnterior: l.anoAnterior != null ? add(`${l.caminho} · ${rY}`, l.anoAnterior) : null };
    }),
    maioresFatores: fatoresBrutos.map(f => ({
      conta: f.conta, caminho: f.caminho,
      ...addComp(`${f.conta}`, comparar(f.anterior, f.atual), rA, rB),
      mesesComMovimento6m: f.mesesComMovimento,
      media6m: f.media6m != null ? add(`${f.conta} · média 6 meses`, f.media6m) : null,
      lancamentos: f.lancamentos.map(l => ({ ...l, fato: add(`Lançamento ${l.data} ${l.pessoa || l.descricao}`, l.valor) })),
    })),
  };
  if (!atv.atual.reconhecidas.includes('operacional')) ausentes.push('grupo de atividades operacionais não reconhecido na máscara de fluxo (nome com "operac")');

  // Transferências entre empresas
  const ic = intercompany ? {
    modo: intercompany.modo,
    eliminadoNoConsolidado: !!intercompany.eliminado,
    pares: intercompany.resumo.pares, comprovados: intercompany.resumo.comprovados, provaveis: intercompany.resumo.provaveis,
    valorPares: add('Transferências entre empresas casadas (total)', intercompany.resumo.valorPares),
    efeitoNaVariacao: intercompany.efeitoNaVariacao != null ? add('Efeito da eliminação na variação consolidada', intercompany.efeitoNaVariacao) : null,
    recebidoDoGrupo: intercompany.recebidoDoGrupo != null ? add('Recebido de outras empresas do grupo', intercompany.recebidoDoGrupo) : null,
    enviadoAoGrupo: intercompany.enviadoAoGrupo != null ? add('Enviado a outras empresas do grupo', intercompany.enviadoAoGrupo) : null,
    semContrapartida: intercompany.soltas.slice(0, 10).map(s => ({ data: s.data, sentido: s.sinal > 0 ? 'entrada' : 'saída', valor: add(`Transferência sem contrapartida ${s.data}`, s.valor), indicio: s.indicio })),
  } : null;

  // Pontos de atenção (regras)
  const pontos = (anomalias || []).slice(0, 15).map(a => ({ tipo: a.tipo, nivel: a.nivel, titulo: a.titulo, detalhe: a.detalhe, valor: add(a.titulo, a.valor) }));

  // DRE × caixa
  let dreBloco = null;
  let cruzamento = [];
  const dA = dre?.porMes?.[chaves.anterior];
  const dB = dre?.porMes?.[chaves.atual];
  if (dA && dB) {
    const margem = (d) => (d.receitaBruta > 0 && d.lucroBruto != null ? r2((d.lucroBruto / d.receitaBruta) * 100) : null);
    dreBloco = {
      mascara: dre.mascara || null,
      receita: addComp('Receita (DRE)', comparar(dA.receitaBruta, dB.receitaBruta), rA, rB),
      lucroBruto: dA.lucroBruto != null && dB.lucroBruto != null ? addComp('Lucro bruto (DRE)', comparar(dA.lucroBruto, dB.lucroBruto), rA, rB) : null,
      margemBrutaPct: { anterior: add(`Margem bruta % · ${rA}`, margem(dA), '%'), atual: add(`Margem bruta % · ${rB}`, margem(dB), '%') },
      resultado: addComp('Resultado da DRE', comparar(dA.resultado, dB.resultado), rA, rB),
      anoAnterior: dre.porMes?.[chaves.anoAnterior] ? {
        receita: add(`Receita (DRE) · ${rY}`, dre.porMes[chaves.anoAnterior].receitaBruta),
        resultado: add(`Resultado da DRE · ${rY}`, dre.porMes[chaves.anoAnterior].resultado),
      } : null,
      linhasMaiorVariacao: (dre.linhasMaiorVariacao || []).slice(0, 8).map(l => ({ linha: l.linha || l.grupoNome, atual: add(`${l.linha || l.grupoNome} · DRE atual`, l.valor_atual ?? l.valor), anterior: add(`${l.linha || l.grupoNome} · DRE ${rY || 'comparativo'}`, l.valor_yoy), pct: l.variacao_pct ?? null })),
    };
    const per = (d, a, g) => ({
      dre: { receitaBruta: d.receitaBruta, cmv: d.lucroBruto != null ? d.receitaBruta - d.lucroBruto : null, lucroBruto: d.lucroBruto, resultadoOperacional: d.resultado },
      fluxo: { recebimentosOperacionais: a.recebimentosOperacionais, pagamentosFornecedores: a.pagamentosFornecedores, caixaOperacional: a.caixaOperacional,
        caixaFinanciamento: a.caixaFinanciamento, transferenciasInternasRecebidas: g },
      giro: {},
    });
    cruzamento = cruzarDreCaixa(per(dA, atv.anterior, null), per(dB, atv.atual, intercompany?.recebidoDoGrupo || 0)).map(d => ({
      id: d.id, tema: d.tema, grau: d.grau, titulo: d.titulo, texto: d.texto, falta: d.falta || [],
      fato: add(`Diagnóstico: ${d.titulo}`, Object.values(d.numeros || {}).map(x => (typeof x === 'object' ? x?.diferenca : x)).find(v => Number.isFinite(v)) ?? null),
    }));
  } else ausentes.push('DRE do mês atual e do anterior (gere a análise de DRE ou selecione a máscara)');

  // Capital de giro (saldos em aberto de HOJE — não do fim do mês)
  let giroBloco = null;
  if (giro && (giro.contasReceber != null || giro.contasPagar != null)) {
    const ind = indicadoresCapitalGiro({ dias: meta.diasAtual, receita: dB?.receitaBruta, cmv: dB && dB.lucroBruto != null ? dB.receitaBruta - dB.lucroBruto : null,
      compras: atv.atual.pagamentosFornecedores, contasReceber: giro.contasReceber, contasPagar: giro.contasPagar, estoque: null });
    giroBloco = {
      dataSaldo: giro.dataSaldo,
      contasReceber: add('Contas a receber em aberto (hoje)', giro.contasReceber), contasReceberVencido: add('Contas a receber vencidas (hoje)', giro.contasReceberVencido),
      contasPagar: add('Contas a pagar em aberto (hoje)', giro.contasPagar), contasPagarVencido: add('Contas a pagar vencidas (hoje)', giro.contasPagarVencido),
      pmr: add('Prazo médio de recebimento (dias, aproximado)', ind.pmr, 'dias'), pmp: add('Prazo médio de pagamento (dias, aproximado)', ind.pmp, 'dias'),
      faltando: ind.faltando,
    };
  } else ausentes.push('contas a receber e a pagar em aberto (capital de giro)');
  ausentes.push('estoque a custo por período (prazo médio de estoque e ciclo financeiro)');

  // Posto: combustíveis por produto (mês atual × mesmo mês do ano anterior)
  let postoBloco = null;
  if (posto?.combustiveis?.length) {
    postoBloco = {
      combustiveis: posto.combustiveis.slice(0, 8).map(p => {
        const dec = p.litros_yoy > 0 && p.receita_yoy > 0 ? decomporVolumePreco({ q0: p.litros_yoy, v0: p.receita_yoy, q1: p.litros, v1: p.receita }) : null;
        return {
          produto: p.produto,
          litros: add(`${p.produto} · litros ${rB}`, p.litros, 'L'), litrosAnoAnterior: p.litros_yoy ? add(`${p.produto} · litros ${rY}`, p.litros_yoy, 'L') : null,
          precoMedio: add(`${p.produto} · preço médio por litro`, p.preco_medio_litro, 'R$/L'), custoMedio: add(`${p.produto} · custo médio por litro`, p.custo_medio_litro, 'R$/L'),
          margemPorLitro: add(`${p.produto} · margem por litro`, p.margem_rs_por_litro, 'R$/L'), margemPct: p.margem_pct,
          receita: add(`${p.produto} · receita ${rB}`, p.receita),
          efeitoVolume: dec ? add(`${p.produto} · efeito volume na receita (vs ${rY})`, dec.efeitoVolume) : null,
          efeitoPreco: dec ? add(`${p.produto} · efeito preço na receita (vs ${rY})`, dec.efeitoPreco) : null,
        };
      }),
      conveniencia: posto.conveniencia ? { receita: add(`Conveniência · receita ${rB}`, posto.conveniencia.receita), margemPct: posto.conveniencia.margem_pct ?? null } : null,
    };
  } else ausentes.push('vendas por produto (litros, preço e custo médio) — gere a análise de Vendas para incluir');

  // ─── Detalhe por conta para "Investigar esta conta" (fatos D…) ───
  const regD = criarRegistroFatos('D');
  const porPessoa = (lancs) => {
    const m = new Map();
    lancs.forEach(l => { const k = (l.pessoaNome || '').trim() || '(sem pessoa)'; m.set(k, (m.get(k) || 0) + l.valor * l.sinal); });
    return m;
  };
  const resumoLanc = (l) => ({ data: l.data, pessoa: l.pessoaNome || null, descricao: l.descricao, empresa: l.empresaCodigo ?? null,
    fato: regD.add(`Lançamento ${l.data} ${l.pessoaNome || l.descricao}`, l.valor * l.sinal) });
  const detalheContas = fatoresBrutos.map(f => {
    const pa = porPessoa(f.bruto.lancAnterior);
    const pb = porPessoa(f.bruto.lancAtual);
    const pessoas = [...new Set([...pa.keys(), ...pb.keys()])]
      .map(p => ({ pessoa: p, anterior: pa.get(p) || 0, atual: pb.get(p) || 0 }))
      .sort((x, y) => Math.abs(y.atual - y.anterior) - Math.abs(x.atual - x.anterior)).slice(0, 12)
      .map(p => ({ pessoa: p.pessoa, anterior: regD.add(`${f.conta} · ${p.pessoa} · ${rA}`, p.anterior), atual: regD.add(`${f.conta} · ${p.pessoa} · ${rB}`, p.atual),
        diferenca: regD.add(`${f.conta} · ${p.pessoa} · diferença`, p.atual - p.anterior) }));
    const maiores = (l) => l.slice().sort((x, y) => y.valor - x.valor).slice(0, 20).map(resumoLanc);
    return {
      conta: f.conta, caminho: f.caminho,
      anterior: regD.add(`${f.conta} · ${rA}`, f.anterior), atual: regD.add(`${f.conta} · ${rB}`, f.atual), diferenca: regD.add(`${f.conta} · diferença`, f.diferenca),
      qtdLancamentos: { anterior: f.bruto.lancAnterior.length, atual: f.bruto.lancAtual.length },
      serie6m: f.bruto.serie.map(s => ({ mes: rotulos[s.mes] || s.mes, fato: regD.add(`${f.conta} · ${rotulos[s.mes] || s.mes}`, s.valor) })),
      porPessoa: pessoas,
      lancamentos: { atual: maiores(f.bruto.lancAtual), anterior: maiores(f.bruto.lancAnterior) },
    };
  });

  return {
    detalheContas, fatosDetalhe: regD.fatos,
    meta: { ...meta, periodos: { atual: rB, anterior: rA, anoAnterior: rY } },
    caixa, transferenciasEntreEmpresas: ic, pontosDeAtencao: pontos, dre: dreBloco, cruzamentoDreCaixa: cruzamento,
    capitalDeGiro: giroBloco, posto: postoBloco, dadosAusentes: ausentes, fatos: reg.fatos,
  };
}

// ─── Validação da resposta da IA ──────────────────────────────────
const SECOES = ['resumo_executivo', 'geracao_caixa', 'investigacao_variacoes', 'cruzamento_dre', 'anomalias', 'capital_giro', 'diagnostico', 'plano_acao', 'conclusao'];
const RE_REAIS = /R\$\s?-?\s?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g;
const paraNumero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));

// → { insights (com marcas de verificação), problemas: [...] }
// Marca em cada item: _evidenciasInvalidas (ids que não existem), _valoresNaoEncontrados
// (R$ citados que não estão no pacote). Não apaga nada: a tela mostra o aviso.
export function validarRespostaFocada(resposta, pacote) {
  const { insights, problemas } = validarRespostaController({ _foco: resposta }, pacote, ['_foco']);
  return { resposta: insights._foco, problemas };
}

export function validarRespostaController(insights, pacote, secoes = SECOES) {
  const problemas = [];
  const out = insights && typeof insights === 'object' ? insights : {};
  secoes.forEach(s => { if (out[s] == null) problemas.push(`seção ausente: ${s}`); });
  const todos = [...(pacote?.fatos || []), ...(pacote?.fatosDetalhe || [])];
  const ids = new Set(todos.map(f => f.id));
  const valores = todos.filter(f => f.unidade === 'R$').map(f => Math.abs(f.valor));
  const existe = (v) => valores.some(x => Math.abs(x - v) <= Math.max(1, x * 0.005));
  const visitar = (no) => {
    if (Array.isArray(no)) { no.forEach(visitar); return; }
    if (!no || typeof no !== 'object') return;
    if (Array.isArray(no.evidencias)) {
      const inval = no.evidencias.filter(e => !ids.has(String(e)));
      if (inval.length) { no._evidenciasInvalidas = inval; problemas.push(`evidência inexistente: ${inval.join(', ')}`); }
    }
    const textos = Object.entries(no).filter(([k, v]) => typeof v === 'string' && !k.startsWith('_')).map(([, v]) => v).join(' ');
    const nao = [...textos.matchAll(RE_REAIS)].map(m => paraNumero(m[1])).filter(v => v >= 1 && !existe(v));
    if (nao.length) { no._valoresNaoEncontrados = [...new Set(nao)]; problemas.push(`valor não encontrado no pacote: ${nao.join(', ')}`); }
    Object.values(no).forEach(v => { if (v && typeof v === 'object') visitar(v); });
  };
  secoes.forEach(s => visitar(out[s]));
  return { insights: out, problemas };
}
