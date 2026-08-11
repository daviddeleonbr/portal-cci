// resolverDePara
// ============================================================
// Aplica o de/para contábil a uma linha da `movto` já enriquecida (com
// origem_debito rastreado). Regras já vêm ordenadas por prioridade desc.
//
// cfg = {
//   mapa:       { [contaGerencial]: contaContabilCodigo },
//   regras:     [{ tipo_lancamento, cond_conta_debitar, cond_conta_creditar, cond_despesa_origem, lado, conta_contabil_codigo }],
//   passagem:   Set(contaGerencial),
//   historicos: [{ tipo_lancamento, cond_conta_debitar, cond_conta_creditar, cond_despesa_origem, template }],
// }
// ============================================================

// Um "pagamento" é uma linha cujo débito é conta de passagem e que tem uma
// provisão de origem (origem_debito). Caso contrário tratamos como "provisão".
function classificar(row, passagem) {
  const passDeb = passagem.has(row.conta_debitar);
  return (passDeb && row.origem_debito) ? 'pagamento' : 'provisao';
}

function regraProvisaoBate(r, row, lados) {
  if (!lados.includes(r.lado)) return false;
  if (r.cond_conta_debitar && r.cond_conta_debitar !== row.conta_debitar) return false;
  if (r.cond_conta_creditar && r.cond_conta_creditar !== row.conta_creditar) return false;
  return !!(r.cond_conta_debitar || r.cond_conta_creditar);
}

function regraPagamentoBate(r, row) {
  if (r.cond_conta_debitar && r.cond_conta_debitar !== row.conta_debitar) return false;
  if (r.cond_despesa_origem && r.cond_despesa_origem !== row.origem_debito) return false;
  return !!(r.cond_conta_debitar || r.cond_despesa_origem);
}

// Débito e crédito contábil de uma linha.
export function resolverContas(row, cfg) {
  const ehPagamento = classificar(row, cfg.passagem) === 'pagamento';

  // ── débito contábil ──
  let deb = null, debFonte = null;
  if (ehPagamento) {
    const r = cfg.regras.find(r => r.tipo_lancamento === 'pagamento' && regraPagamentoBate(r, row));
    if (r) { deb = r.conta_contabil_codigo; debFonte = 'regra-pagamento'; }
  }
  if (!deb) {
    const r = cfg.regras.find(r => r.tipo_lancamento === 'provisao' && regraProvisaoBate(r, row, ['debito', 'ambos']));
    if (r) { deb = r.conta_contabil_codigo; debFonte = 'regra-provisao'; }
  }
  if (!deb && cfg.mapa[row.conta_debitar]) { deb = cfg.mapa[row.conta_debitar]; debFonte = 'mapa'; }

  // ── crédito contábil ──
  let cred = null, credFonte = null;
  {
    const r = cfg.regras.find(r => r.tipo_lancamento === 'provisao' && regraProvisaoBate(r, row, ['credito', 'ambos']));
    if (r) { cred = r.conta_contabil_codigo; credFonte = 'regra-provisao'; }
  }
  if (!cred && cfg.mapa[row.conta_creditar]) { cred = cfg.mapa[row.conta_creditar]; credFonte = 'mapa'; }

  return { deb, cred, debFonte, credFonte, ehPagamento };
}

// Substitui os tokens do template com os dados da linha.
export function aplicarTemplate(template, row) {
  const fmtValor = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtData = (d) => {
    if (!d) return '';
    const s = String(d).slice(0, 10);
    const [a, m, dia] = s.split('-');
    return a && m && dia ? `${dia}/${m}/${a}` : s;
  };
  const map = {
    '{documento}': String(row.documento || '').trim(),
    '{pessoa}': String(row.pessoa_nome || '').trim(),
    '{doc_provisao}': String(row.origem_documento || '').trim(),
    '{pessoa_provisao}': String(row.origem_pessoa || '').trim(),
    '{valor}': fmtValor(row.valor),
    '{data}': fmtData(row.data),
    '{vencto}': fmtData(row.vencto),
    '{obs}': String(row.obs || '').trim(),
  };
  return String(template || '').replace(/\{documento\}|\{pessoa\}|\{doc_provisao\}|\{pessoa_provisao\}|\{valor\}|\{data\}|\{vencto\}|\{obs\}/g, (t) => map[t] ?? t)
    .replace(/\s+/g, ' ').trim();
}

// Histórico da linha (regra por tipo + condições; sem condição = padrão do tipo).
export function resolverHistorico(row, cfg) {
  const tipo = classificar(row, cfg.passagem);
  const h = cfg.historicos.find(h => {
    if (h.tipo_lancamento !== tipo) return false;
    if (tipo === 'pagamento') {
      if (h.cond_conta_debitar && h.cond_conta_debitar !== row.conta_debitar) return false;
      if (h.cond_despesa_origem && h.cond_despesa_origem !== row.origem_debito) return false;
    } else {
      if (h.cond_conta_debitar && h.cond_conta_debitar !== row.conta_debitar) return false;
      if (h.cond_conta_creditar && h.cond_conta_creditar !== row.conta_creditar) return false;
    }
    return true;
  });
  return h ? aplicarTemplate(h.template, row) : '';
}

// A linha casa alguma regra de exclusão? (não deve sair no arquivo)
export function linhaExcluida(row, cfg) {
  const ex = cfg.exclusoes || [];
  return ex.some(e => {
    if (e.cond_conta_debitar && e.cond_conta_debitar !== row.conta_debitar) return false;
    if (e.cond_conta_creditar && e.cond_conta_creditar !== row.conta_creditar) return false;
    return !!(e.cond_conta_debitar || e.cond_conta_creditar);
  });
}

// Resolve a linha completa para a exportação.
export function resolverLinha(row, cfg) {
  const { deb, cred, ehPagamento } = resolverContas(row, cfg);
  const historico = resolverHistorico(row, cfg);
  const excluida = linhaExcluida(row, cfg);
  return {
    ...row,
    contabil_debito: deb,
    contabil_credito: cred,
    historico,
    ehPagamento,
    excluida,
    pendente: !excluida && (!deb || !cred), // excluída não conta como pendente
  };
}
