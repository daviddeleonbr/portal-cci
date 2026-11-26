// Atividades do fluxo (operacional / investimento / financiamento) e os blocos que
// o cruzamento com a DRE precisa, a partir da ÁRVORE do motor do fluxo.
// As máscaras não têm um campo "atividade": os grupos raiz são reconhecidos pelo
// NOME ("1. ATIVIDADES OPERACIONAIS" etc.). Cada achado diz de onde veio (`origem`),
// para a análise mostrar o que foi usado — e quando não reconheceu, diz isso.

const RE = {
  operacional: /operac/i,
  investimento: /invest/i,
  financiamento: /financ/i,
  fornecedores: /fornec|compra|mercador|combust[ií]vel|produto/i,
  recebimentos: /receb|client|venda|cart[aã]o|dinheiro|carteira|pix/i,
};

const somaMeses = (no, meses) => (meses ? meses.reduce((s, m) => s + (no.valoresPorMes?.[m] || 0), 0) : no.totalPeriodo || 0);

// arvore: comCalculos/arvore do motor; meses (opcional): chaves a somar (default = período todo)
export function resumirAtividades(arvore = [], meses = null) {
  const raizes = arvore.filter(n => n.tipo !== 'subtotal' && n.tipo !== 'resultado');
  const achar = (re) => raizes.find(n => re.test(n.nome || ''));
  const op = achar(RE.operacional);
  const inv = achar(RE.investimento);
  const fin = achar(RE.financiamento);
  const transf = raizes.find(n => n.isTransferencias);

  // Dentro do operacional: entradas (recebimentos) e saídas a fornecedores
  let recebimentos = 0;
  let pagamentosFornecedores = 0;
  let outrasSaidasOperacionais = 0;
  const gruposFornecedores = [];
  const visitar = (no, nivel = 0) => {
    if (nivel > 0 && (no.children || []).length === 0) {
      const v = somaMeses(no, meses);
      if (v > 0) recebimentos += v;
      else if (RE.fornecedores.test(no.nome || '')) { pagamentosFornecedores += -v; gruposFornecedores.push(no.nome); }
      else outrasSaidasOperacionais += -v;
      return;
    }
    (no.children || []).forEach(f => visitar(f, nivel + 1));
  };
  if (op) visitar(op);

  const valor = (n) => (n ? somaMeses(n, meses) : null);
  return {
    caixaOperacional: valor(op),
    caixaInvestimento: valor(inv),
    caixaFinanciamento: valor(fin),
    transferenciasEntreContas: transf ? valor(transf) : 0,
    recebimentosOperacionais: op ? recebimentos : null,
    pagamentosFornecedores: op ? pagamentosFornecedores : null,
    outrasSaidasOperacionais: op ? outrasSaidasOperacionais : null,
    origem: {
      operacional: op?.nome || null, investimento: inv?.nome || null, financiamento: fin?.nome || null,
      fornecedores: gruposFornecedores,
    },
    reconhecidas: [op && 'operacional', inv && 'investimento', fin && 'financiamento'].filter(Boolean),
  };
}
