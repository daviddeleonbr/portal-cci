// Motor da DRE — funções PURAS compartilhadas pela tela RelatorioDRE e pela IA
// (dreInsightsAutosystemService), para as duas usarem a MESMA regra. O código saiu
// da tela sem mudança de comportamento.
// Convenção dos "títulos": titulosReceber somam + (receita), titulosPagar somam −.

// Conta de PASSAGEM = 2.1.1.x (contas a pagar).
export const ehContaPassagem = (codigo) => /^2\.1\.1/.test(String(codigo));

// Lançamento Autosystem (movto) → "título" no formato da indexação da DRE.
// lado: 'credito' | 'debito' (qual perna do lançamento é a conta da DRE).
export function lancamentoAutosystemParaTitulo(l, codigo, lado) {
  return {
    codigo: l.lancamento_id != null ? `as-${l.lancamento_id}-${lado}` : undefined,
    planoContaGerencialCodigo: codigo,
    // nome do plano de contas daquele lado (seção "Contas não mapeadas")
    planoContaGerencialDescricao: (lado === 'debito' ? l.debito_nome : l.credito_nome) || '',
    empresaCodigo: l.empresa,
    // movto.data como única fonte de data do lançamento
    dataMovimento: l.data,
    dataPagamento: l.data,
    vencimento: l.data,
    valor: Number(l.valor || 0),
    valorPago: Number(l.valor || 0),
    // descrição base vazia → a composição mostra só doc + fornecedor + obs
    descricao: '',
    numeroTitulo: l.documento || '',
    nomeFornecedor: l.pessoa_nome || '',
    nomeCliente: l.pessoa_nome || '',
    observacao: (l.obs || '').trim(),
    situacao: 'pago',
  };
}

// Lançamentos das contas mapeadas → { titulosReceber, titulosPagar, casados, semMatch }.
// Regra de COMPETÊNCIA: na conta de passagem 2.1.1 vale a PROVISÃO (crédito, −);
// a baixa/pagamento (débito na mesma conta) é IGNORADA — senão a baixa anula a
// provisão e o valor zera. Se uma perna é passagem mapeada, ela vence a outra
// (evita dupla contagem). Mapeamento decidido pela pertença ao conjunto, com trim
// (os códigos do movto são char e podem vir com espaços).
export function distribuirLancamentosAutosystemDre(lancs = [], contasMapeadas = []) {
  const setContas = contasMapeadas instanceof Set ? contasMapeadas : new Set(contasMapeadas);
  const titulosReceber = [];
  const titulosPagar = [];
  let casados = 0;
  let semMatch = 0;
  (lancs || []).forEach(l => {
    const cred = String(l.credito_codigo ?? '').trim();
    const deb = String(l.debito_codigo ?? '').trim();
    const credEhPass = ehContaPassagem(cred);
    const debEhPass = ehContaPassagem(deb);
    const credMap = !!cred && setContas.has(cred);
    const debMap = !!deb && setContas.has(deb);
    let matched = false;
    if (credMap) {
      if (credEhPass) titulosPagar.push(lancamentoAutosystemParaTitulo(l, cred, 'credito')); // provisão (−)
      else if (!(debMap && debEhPass)) titulosReceber.push(lancamentoAutosystemParaTitulo(l, cred, 'credito'));
      matched = true;
    }
    if (debMap) {
      if (debEhPass) {
        // baixa/pagamento na passagem: ignorado na competência
      } else if (!(credMap && credEhPass)) {
        titulosPagar.push(lancamentoAutosystemParaTitulo(l, deb, 'debito'));
      }
      matched = true;
    }
    if (matched) casados++; else semMatch++;
  });
  return { titulosReceber, titulosPagar, casados, semMatch };
}

// Vendas agregadas do Autosystem → { [categoria]: { [empresaCodigo]: { venda, custo } } }.
// categoriasGruposProduto: Map(grupo_produto → categoria). Sem categoria = ignorado
// (contado em `ignorados`, com os grupos em `gruposIgnorados`).
export function somarVendasAutosystemPorCategoria(vendas = [], categoriasGruposProduto = new Map()) {
  const porCategoria = {};
  let ignorados = 0;
  let aproveitados = 0;
  const gruposIgnorados = new Set();
  (vendas || []).forEach(v => {
    const gp = Number(v.grupo_produto_codigo ?? 0);
    const categoria = categoriasGruposProduto.get(gp);
    if (!categoria) { ignorados++; gruposIgnorados.add(gp); return; }
    aproveitados++;
    const ec = String(v.empresa ?? '');
    if (!porCategoria[categoria]) porCategoria[categoria] = {};
    if (!porCategoria[categoria][ec]) porCategoria[categoria][ec] = { venda: 0, custo: 0 };
    porCategoria[categoria][ec].venda += Number(v.valor || 0);
    porCategoria[categoria][ec].custo += Number(v.valor_custo || 0);
  });
  return { porCategoria, ignorados, aproveitados, gruposIgnorados };
}
