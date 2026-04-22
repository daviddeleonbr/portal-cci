// Helpers compartilhados entre os 4 servicos de IA (vendas/dre/fluxo/geral).
// Centraliza chamada Claude, utils de data e re-exporta API key do insightsService.

export { carregarApiKey, salvarApiKey, limparApiKey } from './insightsService';

const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-7';

// ─── Chamada unificada Claude ──────────────────────────────────
// - systemBlocks: array de { type:'text', text } — o ultimo recebe cache_control
// - user: texto da mensagem do usuario
// - Modelo claude-opus-4-7 com adaptive thinking (nao retorna texto do thinking)
// - anthropic-dangerous-direct-browser-access pq e front-end
export async function chamarClaudeAPI({ apiKey, system, user, maxTokens = 8192 }) {
  if (!apiKey) throw new Error('Chave de API nao configurada');

  const blocks = Array.isArray(system) ? system : [{ type: 'text', text: String(system) }];
  // cache_control no ULTIMO bloco de system cacheia tudo antes dele (tools + system)
  if (blocks.length > 0) {
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } };
  }

  const res = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system: blocks,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsedErr;
    try { parsedErr = JSON.parse(errText); } catch (_) { /* ignore */ }
    const msg = parsedErr?.error?.message || errText;
    const lower = (msg || '').toLowerCase();
    if (lower.includes('credit balance')) {
      const e = new Error('Sua conta Anthropic esta sem creditos. Acesse console.anthropic.com > Plans & Billing.');
      e.code = 'NO_CREDITS'; throw e;
    }
    if (res.status === 401 || res.status === 403) {
      const e = new Error('Chave de API invalida ou sem permissao.');
      e.code = 'INVALID_KEY'; throw e;
    }
    if (res.status === 429) {
      const e = new Error('Limite de requisicoes atingido. Aguarde alguns segundos.');
      e.code = 'RATE_LIMIT'; throw e;
    }
    throw new Error(msg);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock) throw new Error('IA nao retornou conteudo de texto');
  const insights = extrairJsonDeTexto(textBlock.text);
  return { insights, usage: data.usage || null, raw: textBlock.text };
}

export function extrairJsonDeTexto(raw) {
  try {
    const cleaned = String(raw).trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Resposta da IA nao esta em JSON valido');
  }
}

// ─── Classificacao de tipo de combustivel ─────────────────────
// Heuristica simples pelo nome do produto. Fallback = "Outro combustivel"
export function classificarTipoCombustivel(nomeProduto) {
  if (!nomeProduto) return 'Outro combustivel';
  const n = String(nomeProduto).toLowerCase();
  if (/gnv|gas\s*natural/.test(n)) return 'GNV';
  if (/etanol|alcool|\be\s*100\b|\bhidratado\b/.test(n)) return 'Etanol';
  if (/diesel\s*s\s*10|diesel\s*10/.test(n)) return 'Diesel S10';
  if (/diesel\s*s\s*500|diesel\s*500/.test(n)) return 'Diesel S500';
  if (/diesel/.test(n)) return 'Diesel';
  if (/gasolin/.test(n)) {
    if (/aditivad|premium|grid/.test(n)) return 'Gasolina aditivada';
    return 'Gasolina comum';
  }
  if (/arla/.test(n)) return 'Arla 32';
  return 'Outro combustivel';
}

// ─── Calculo de periodos para comparacoes temporais ────────────
// Dado um mesRef { ano, mes } retorna:
// - atual:              mes inteiro de referencia
// - yoy:                mesmo mes um ano antes
// - quarterAtual:       3 meses terminando no mes de referencia (inclusive)
// - quarterAnterior:    3 meses anteriores ao quarterAtual (6,5,4 meses atras)
// - tendencia6m:        array dos 6 meses terminando no mesRef (inclusive)
// Todos em formato { ano, mes, dataInicial, dataFinal, label, key }
export function calcularPeriodos(mesRef) {
  const ano = mesRef.ano;
  const mes = mesRef.mes;
  return {
    atual: rangeMes(ano, mes),
    yoy: rangeMes(ano - 1, mes),
    quarterAtual: rangeQuarter(ano, mes, 0),
    quarterAnterior: rangeQuarter(ano, mes, 3),
    tendencia6m: rangeSerie(ano, mes, 6),
  };
}

const MES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function rangeMes(ano, mes) {
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0);
  return {
    ano, mes,
    dataInicial: ymd(ini),
    dataFinal: ymd(fim),
    label: `${MES_LABEL[mes - 1]}/${ano}`,
    key: `${ano}-${String(mes).padStart(2, '0')}`,
  };
}

// rangeQuarter(ano, mes, offset): range de 3 meses terminando em (mes - offset)
// offset=0 → [mes-2, mes-1, mes], offset=3 → [mes-5, mes-4, mes-3]
export function rangeQuarter(ano, mesRef, offset) {
  const fim = shiftMes(ano, mesRef, -offset);
  const ini = shiftMes(fim.ano, fim.mes, -2);
  const diIni = new Date(ini.ano, ini.mes - 1, 1);
  const diFim = new Date(fim.ano, fim.mes, 0);
  return {
    ano: fim.ano, mes: fim.mes,
    dataInicial: ymd(diIni),
    dataFinal: ymd(diFim),
    label: `${MES_LABEL[ini.mes - 1]}/${ini.ano} - ${MES_LABEL[fim.mes - 1]}/${fim.ano}`,
    key: `Q-${ini.ano}-${ini.mes}-${fim.ano}-${fim.mes}`,
  };
}

// rangeSerie(ano, mes, qtd): array de qtd meses terminando em (ano, mes), crescente
export function rangeSerie(ano, mes, qtd) {
  const arr = [];
  for (let i = qtd - 1; i >= 0; i--) {
    const d = shiftMes(ano, mes, -i);
    arr.push(rangeMes(d.ano, d.mes));
  }
  return arr;
}

export function shiftMes(ano, mes, delta) {
  let a = ano, m = mes + delta;
  while (m < 1) { m += 12; a--; }
  while (m > 12) { m -= 12; a++; }
  return { ano: a, mes: m };
}

export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function round(v, casas = 2) {
  if (v == null || !isFinite(v)) return 0;
  const mult = Math.pow(10, casas);
  return Math.round(v * mult) / mult;
}

export function variacaoPct(atual, anterior) {
  if (!isFinite(anterior) || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}
