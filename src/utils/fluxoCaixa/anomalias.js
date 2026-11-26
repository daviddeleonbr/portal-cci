// Pontos de atenção do Fluxo de Caixa — detecção por REGRA (sem IA), funções puras.
// Cada achado traz o valor envolvido e as evidências (lançamentos) para conferência.
// Não acusa erro nem fraude: aponta indício e o que conferir.
//
// Achado: { id, tipo, nivel: 'conferir' | 'atencao' | 'info', titulo, detalhe, valor, evidencias: [...] }

import { SEM_PLANO_PREFIX, TRANSFER_CODE } from './motor';

const r2 = (v) => Math.round(v * 100) / 100;
const brl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataBR = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');
// "saída de R$ 8.000,00" / "entrada de R$ 5.000,00"
const comSentido = (v) => `${v < 0 ? 'saída' : 'entrada'} de ${brl(Math.abs(v))}`;
const RE_INVEST = /invest/i;
// Natureza tipicamente operacional (para apontar possível classificação em investimento)
const RE_OPERACIONAL = /alug|energia|luz|agua|água|sal[aá]ri|folha|f[eé]rias|13|inss|fgts|telefon|internet|manuten|combust[ií]vel|frete|tarifa|taxa|imposto|icms|pis|cofins|honor[aá]ri|limpeza|material de (uso|consumo|escrit)|seguro/i;

// Lançamentos (do índice do motor) com o mês, para evidência
const evid = (l) => ({ data: l.data, descricao: l.descricao, valor: r2((l.valor || 0) * (l.sinal || 1)), empresaCodigo: l.empresaCodigo ?? null, contaCodigo: l.contaCodigo ?? null, pessoa: l.pessoaNome || null });

// ─── 1. Possíveis duplicidades ────────────────────────────────────
// SAÍDAS na mesma conta de caixa, mesma data, mesmo valor, mesmo plano e mesmo
// histórico, em 2 ou 3 movimentos DIFERENTES (pagamento repetido).
export function duplicidades(indice) {
  const achados = [];
  Object.entries(indice?.lancamentosPorConta || {}).forEach(([plano, lancs]) => {
    const grupos = new Map();
    lancs.forEach(l => {
      if (l.sinal > 0) return; // entradas de mesmo valor no dia são normais no posto (vendas iguais)
      if (String(l.id).match(/-(r|p)\d+$/)) return; // partes de rateio/lote: não são duplicidade
      const k = [l.contaCodigo, l.empresaCodigo, l.data, l.sinal, r2(l.valor), (l.descricao || '').trim().toUpperCase()].join('|');
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(l);
    });
    grupos.forEach(g => {
      const distintos = new Set(g.map(l => l.id));
      // 4+ iguais no mesmo dia = padrão (tarifas, parcelas), não pagamento repetido
      if (distintos.size < 2 || distintos.size > 3 || r2(g[0].valor) < 1) return;
      const extra = r2(g[0].valor * (distintos.size - 1));
      achados.push({
        id: `dup-${plano}-${g[0].data}-${r2(g[0].valor)}`,
        tipo: 'duplicidade',
        nivel: 'conferir',
        titulo: `Possível lançamento em duplicidade (${distintos.size}×)`,
        detalhe: `${distintos.size} lançamentos iguais no mesmo dia, mesma conta e mesmo histórico. Se for repetição, o fluxo está ${g[0].sinal > 0 ? 'com entrada' : 'com saída'} a mais de ${brl(extra)}.`,
        valor: extra,
        plano,
        evidencias: g.map(evid),
      });
    });
  });
  return achados;
}

// ─── 2. Picos fora do padrão (mês × média dos outros meses) ───────
// Só com 3+ meses. Pico = desvio acima de 60% da média E acima de R$ mínimo.
export function picos({ arvore = [], meses = [], minimo = 2000 }) {
  if (meses.length < 3) return [];
  const achados = [];
  const ultimo = meses[meses.length - 1].key;
  const visitar = (no, caminho) => {
    (no.contas || []).forEach(c => {
      const anteriores = meses.slice(0, -1).map(m => c.valoresPorMes[m.key] || 0);
      const media = anteriores.reduce((s, v) => s + v, 0) / anteriores.length;
      const atual = c.valoresPorMes[ultimo] || 0;
      const desvio = atual - media;
      if (Math.abs(media) < 1 || Math.abs(atual) < 1 || Math.abs(desvio) < minimo || Math.abs(desvio) / Math.abs(media) < 0.6) return;
      const pior = Math.sign(desvio) !== Math.sign(media) ? (media > 0 ? 'queda' : 'menos saída') : (media > 0 ? 'alta de entrada' : 'alta de saída');
      achados.push({
        id: `pico-${c.codigo}`,
        tipo: 'pico',
        // desvio < 0 = o mês deixou menos dinheiro (menos entrada ou mais saída)
        nivel: desvio < 0 ? 'atencao' : 'info',
        titulo: `${c.descricao || c.codigo}: ${pior} fora do padrão`,
        detalhe: `${caminho} · último mês: ${comSentido(atual)}; média dos meses anteriores: ${comSentido(media)} (diferença de ${brl(Math.abs(desvio))}, ${Math.round(Math.abs(desvio / media) * 100)}%).`,
        valor: r2(Math.abs(desvio)),
        plano: String(c.codigo),
        evidencias: (c.lancamentos || []).filter(l => l.mesKey === ultimo).sort((a, b) => b.valor - a.valor).slice(0, 5).map(evid),
      });
    });
    (no.children || []).forEach(f => visitar(f, `${caminho} › ${f.nome}`));
  };
  arvore.forEach(n => visitar(n, n.nome));
  return achados;
}

// ─── 3. Contas recorrentes que zeraram ────────────────────────────
// Movimentou em TODOS os meses anteriores (2+) e não movimentou no último.
export function recorrentesZeradas({ arvore = [], meses = [], minimo = 500 }) {
  if (meses.length < 3) return [];
  const achados = [];
  const ultimo = meses[meses.length - 1].key;
  const visitar = (no) => {
    (no.contas || []).forEach(c => {
      const anteriores = meses.slice(0, -1).map(m => c.valoresPorMes[m.key] || 0);
      if (!anteriores.every(v => Math.abs(v) >= 1) || Math.abs(c.valoresPorMes[ultimo] || 0) >= 1) return;
      const media = anteriores.reduce((s, v) => s + v, 0) / anteriores.length;
      if (Math.abs(media) < minimo) return;
      achados.push({
        id: `zerou-${c.codigo}`,
        tipo: 'recorrente_zerada',
        nivel: 'conferir',
        titulo: `${c.descricao || c.codigo} não movimentou no último mês`,
        detalhe: `Teve ${media > 0 ? 'entrada' : 'saída'} em todos os meses anteriores (média de ${brl(Math.abs(media))}) e nenhuma no último. Confira se houve atraso, lançamento em outra conta ou mudança de prazo.`,
        valor: r2(Math.abs(media)),
        plano: String(c.codigo),
        evidencias: [],
      });
    });
    (no.children || []).forEach(visitar);
  };
  arvore.forEach(visitar);
  return achados;
}

// ─── 4. Concentração de saídas em uma pessoa (fornecedor) ─────────
export function concentracaoFornecedor({ indice, limite = 0.3, minimo = 5000 }) {
  const porPessoa = new Map();
  let total = 0;
  Object.entries(indice?.lancamentosPorConta || {}).forEach(([plano, lancs]) => {
    if (plano === TRANSFER_CODE || plano.startsWith(SEM_PLANO_PREFIX)) return;
    lancs.forEach(l => {
      if (l.sinal > 0) return;
      total += l.valor;
      if (!l.pessoaNome) return;
      const k = l.pessoaNome.trim().toUpperCase();
      porPessoa.set(k, (porPessoa.get(k) || 0) + l.valor);
    });
  });
  if (total <= 0) return [];
  return [...porPessoa.entries()]
    .filter(([, v]) => v / total >= limite && v >= minimo)
    .map(([pessoa, v]) => ({
      id: `conc-${pessoa}`,
      tipo: 'concentracao_fornecedor',
      nivel: 'info',
      titulo: `${Math.round((v / total) * 100)}% das saídas foram para ${pessoa}`,
      detalhe: `${brl(v)} de ${brl(total)} em saídas classificadas no período. Dependência alta de um fornecedor: vale acompanhar prazo e preço.`,
      valor: r2(v),
      evidencias: [],
    }));
}

// ─── 5. Possível despesa operacional classificada como investimento ──
export function despesaEmInvestimento({ arvore = [] }) {
  const achados = [];
  arvore.filter(n => RE_INVEST.test(n.nome || '')).forEach(raiz => {
    const visitar = (no) => {
      (no.contas || []).forEach(c => {
        const nome = `${c.descricao || ''} ${(c.lancamentos || []).slice(0, 3).map(l => l.descricao).join(' ')}`;
        if (!RE_OPERACIONAL.test(nome) || Math.abs(c.totalPeriodo) < 1) return;
        achados.push({
          id: `inv-${c.codigo}`,
          tipo: 'classificacao_investimento',
          nivel: 'conferir',
          titulo: `${c.descricao || c.codigo} está em Investimento`,
          detalhe: `O nome sugere despesa do dia a dia (operacional), mas está classificada em "${raiz.nome}". Confirme a classificação no mapeamento — nada foi alterado.`,
          valor: r2(Math.abs(c.totalPeriodo)),
          plano: String(c.codigo),
          evidencias: (c.lancamentos || []).slice(0, 5).map(evid),
        });
      });
      (no.children || []).forEach(visitar);
    };
    visitar(raiz);
  });
  return achados;
}

// ─── Tudo junto, do mais relevante ao menos ───────────────────────
// semClassificacao e conciliacao vêm do motor; intercompany de analisarIntercompany.
export function detectarAnomalias({ indice, arvore, meses, semClassificacao = null, conciliacao = null, intercompany = null,
  movimentoBruto = 0, nomeEmpresa = (c) => c }) {
  const achados = [
    ...duplicidades(indice),
    ...picos({ arvore, meses }),
    ...recorrentesZeradas({ arvore, meses }),
    ...despesaEmInvestimento({ arvore }),
    ...concentracaoFornecedor({ indice }),
  ];
  // Sem classificação relevante (fica fora da Variação de Caixa)
  const sc = Math.abs(semClassificacao?.totalPeriodo || 0);
  const scBruto = (semClassificacao?.contas || []).reduce((s, c) => s + (c.lancamentos || []).reduce((t, l) => t + l.valor, 0), 0);
  if (scBruto >= 1 && (movimentoBruto <= 0 || scBruto / movimentoBruto >= 0.01)) {
    achados.push({
      id: 'sem-classificacao', tipo: 'sem_classificacao', nivel: 'atencao',
      titulo: `${brl(scBruto)} em lançamentos sem classificação`,
      detalhe: `Movimentaram as contas mas não entram na Variação de Caixa (líquido de ${brl(sc)}). Vincule os planos no mapeamento da máscara.`,
      valor: r2(scBruto), evidencias: [],
    });
  }
  if (conciliacao && !conciliacao.bate) {
    achados.push({
      id: 'conciliacao', tipo: 'conciliacao', nivel: 'atencao',
      titulo: `Fluxo não fecha com os saldos: diferença de ${brl(conciliacao.naoExplicada)}`,
      detalhe: `Saldo final − inicial das contas: ${brl(conciliacao.variacaoSaldos)}; Variação de Caixa: ${brl(conciliacao.totalFluxo)}${conciliacao.explicadaPorSemClassificacao ? `; sem classificação: ${brl(conciliacao.explicadaPorSemClassificacao)}` : ''}. Confira saldo de abertura, contas mal classificadas ou lançamentos fora do período.`,
      valor: Math.abs(conciliacao.naoExplicada), evidencias: [],
    });
  }
  (intercompany?.soltas || []).forEach(s => {
    achados.push({
      id: `ic-${s.id}`, tipo: 'intercompany_sem_par', nivel: s.situacao === 'sem_contrapartida' ? 'conferir' : 'info',
      titulo: s.situacao === 'sem_contrapartida'
        ? `Transferência entre empresas sem contrapartida (${s.sinal > 0 ? 'entrada' : 'saída'} de ${brl(s.valor)})`
        : `Transferência com empresa do grupo (${s.sinal > 0 ? 'entrada' : 'saída'} de ${brl(s.valor)})`,
      detalhe: s.situacao === 'sem_contrapartida'
        ? `${nomeEmpresa(s.empresaCodigo)} · ${dataBR(s.data)} · ${s.indicio}. Não achamos o lançamento oposto em outra empresa da rede (até 3 dias, mesmo valor): pode estar em outro período, com outro valor ou faltando.`
        : `${dataBR(s.data)} · ${s.indicio}. A outra empresa não está nesta análise; na visão da rede ela é conferida.`,
      valor: s.valor,
      evidencias: [{ data: s.data, descricao: s.descricao, valor: s.valor * s.sinal, empresaCodigo: s.empresaCodigo, contaCodigo: s.contaCodigo, pessoa: s.pessoa }],
    });
  });
  const ordem = { conferir: 0, atencao: 1, info: 2 };
  return achados.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || b.valor - a.valor);
}
