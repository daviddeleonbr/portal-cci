// Quantidade do item da manifestação de NF, com conversão de embalagem
// (migração 217). `quantidade` é sempre o total em UNIDADES; quando o item veio
// em caixa/fardo, guardamos também embalagem_qtd × unidades_por_embalagem.

export const TIPOS_EMBALAGEM = [
  ['caixa', 'Caixa', 'caixas'],
  ['fardo', 'Fardo', 'fardos'],
  ['pacote', 'Pacote', 'pacotes'],
  ['display', 'Display', 'displays'],
  ['saco', 'Saco', 'sacos'],
  ['outro', 'Embalagem', 'embalagens'],
];

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
export const fmtQtd = (v) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

export function nomeEmbalagem(tipo, qtd) {
  const t = TIPOS_EMBALAGEM.find(x => x[0] === tipo) || TIPOS_EMBALAGEM[TIPOS_EMBALAGEM.length - 1];
  return (num(qtd) === 1 ? t[1] : t[2]).toLowerCase();
}

export const temEmbalagem = (p) => p?.embalagem_qtd != null && p?.unidades_por_embalagem != null
  && num(p.embalagem_qtd) > 0 && num(p.unidades_por_embalagem) > 0;

// "2 caixas × 24 un = 48 unidades"  |  "48 unidades"
export function textoQuantidade(p) {
  const total = num(p?.quantidade);
  const un = `${fmtQtd(total)} ${total === 1 ? 'unidade' : 'unidades'}`;
  if (!temEmbalagem(p)) return un;
  return `${fmtQtd(p.embalagem_qtd)} ${nomeEmbalagem(p.embalagem_tipo, p.embalagem_qtd)} × ${fmtQtd(p.unidades_por_embalagem)} un = ${un}`;
}

// ─── Estado do formulário (strings) ↔ colunas ──────────────────
export function estadoQuantidade(p = {}) {
  const emb = temEmbalagem(p);
  return {
    modo: emb ? 'embalagem' : 'unidade',
    quantidade: p.quantidade != null ? String(p.quantidade) : '1',
    embalagem_qtd: emb ? String(p.embalagem_qtd) : '1',
    embalagem_tipo: p.embalagem_tipo || 'caixa',
    unidades_por_embalagem: emb ? String(p.unidades_por_embalagem) : '',
  };
}

export function totalUnidades(e) {
  return e.modo === 'embalagem' ? num(e.embalagem_qtd) * num(e.unidades_por_embalagem) : num(e.quantidade);
}

export const quantidadeValida = (e) => (e.modo === 'embalagem'
  ? num(e.embalagem_qtd) > 0 && num(e.unidades_por_embalagem) > 0
  : num(e.quantidade) > 0);

export function colunasQuantidade(e) {
  if (e.modo === 'embalagem') {
    return {
      quantidade: totalUnidades(e),
      embalagem_qtd: num(e.embalagem_qtd),
      embalagem_tipo: e.embalagem_tipo || 'caixa',
      unidades_por_embalagem: num(e.unidades_por_embalagem),
    };
  }
  return { quantidade: num(e.quantidade), embalagem_qtd: null, embalagem_tipo: null, unidades_por_embalagem: null };
}
