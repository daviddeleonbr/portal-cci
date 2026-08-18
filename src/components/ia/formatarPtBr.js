// Formatação pt-BR e vocabulário para os relatórios em PDF.
// NÃO altera cálculo — só apresentação. Usa o traço de menos real (−, U+2212),
// nunca hífen, em números negativos e variações.

const MENOS = '−'; // − (minus sign), não '-'

// R$ 1.208.737,26 — negativos com − real.
export function moeda(v) {
  const n = Number(v || 0);
  const abs = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? MENOS : '') + 'R$ ' + abs;
}

// 25,8% (1 casa). Sem sinal.
export function pct(v, casas = 1) {
  const n = Number(v || 0);
  const abs = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return (n < 0 ? MENOS : '') + abs + '%';
}

// Variação sempre com sinal explícito: +25,8% / −25,8%.
export function variacao(v, casas = 1) {
  const n = Number(v || 0);
  const sinal = n < 0 ? MENOS : '+';
  const abs = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return sinal + abs + '%';
}

// Número puro pt-BR (litros, quantidades).
export function numero(v, casas = 0) {
  const n = Number(v || 0);
  const abs = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return (n < 0 ? MENOS : '') + abs;
}

// Pontos percentuais com sinal (para variação de margem). Ex.: +3,2 p.p.
export function pontosPct(v, casas = 1) {
  const n = Number(v || 0);
  const sinal = n < 0 ? MENOS : '+';
  const abs = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return `${sinal}${abs} p.p.`;
}

// Direção da variação → { icone, palavra, tom } (ícone + texto, nunca só cor).
export function seta(v) {
  const n = Number(v || 0);
  if (n > 0.05) return { icone: '▲', palavra: 'Subiu', tom: 'bom' };      // ▲
  if (n < -0.05) return { icone: '▼', palavra: 'Caiu', tom: 'ruim' };     // ▼
  return { icone: '●', palavra: 'Estável', tom: 'neutro' };               // ●
}

// ─── Vocabulário: rótulos fixos em linguagem de dono de posto ───
// Trocas aplicadas no RENDER (rótulos/títulos). A prosa da IA é ajustada
// no prompt (à montante). Chave = jargão; valor = versão simples.
export const VOCAB = {
  YoY: 'vs. mesmo mês do ano passado',
  MoM: 'vs. mês passado',
  CMV: 'custo do que foi vendido (CMV)',
  ticket_medio: 'valor médio por abastecimento',
  granularidade: 'detalhamento',
  rubrica: 'conta',
  competencia: 'mês em que a conta pertence',
};

// Substitui termos conhecidos num texto de rótulo (não na prosa da IA).
export function traduzirRotulo(texto) {
  let t = String(texto || '');
  t = t.replace(/\bYoY\b/g, VOCAB.YoY)
    .replace(/\bMoM\b/g, VOCAB.MoM)
    .replace(/\bCMV\b/g, VOCAB.CMV);
  return t;
}

// Semáforo canônico — três status, sempre com ícone + texto.
export const STATUS = {
  bom:    { cor: 'var(--verde)',    icone: '▲', rotulo: 'Bom' },        // ▲
  atencao:{ cor: 'var(--ambar)',    icone: '●', rotulo: 'Atenção' },    // ●
  critico:{ cor: 'var(--vermelho)', icone: '▼', rotulo: 'Crítico' },    // ▼
  neutro: { cor: 'var(--cinza)',    icone: '●', rotulo: '—' },
};

// Mapeia a "situacao" vinda da IA (saudavel/alerta/critico) → chave do STATUS.
export function statusDaSituacao(situacao) {
  const s = String(situacao || '').toLowerCase();
  if (s.includes('saud') || s === 'bom' || s.includes('positiv')) return 'bom';
  if (s.includes('crit') || s.includes('grave')) return 'critico';
  if (s.includes('alert') || s.includes('aten')) return 'atencao';
  return 'neutro';
}
