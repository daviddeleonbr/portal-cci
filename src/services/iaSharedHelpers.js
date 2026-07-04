// Helpers compartilhados entre os 4 servicos de IA (vendas/dre/fluxo/geral).
// Centraliza chamada Claude, utils de data e re-exporta API key do insightsService.

export { carregarApiKey, salvarApiKey, limparApiKey } from './insightsService';
import { carregarApiKey as carregarApiKeyLS, salvarApiKey as salvarApiKeyLS } from './insightsService';
import { obterConfiguracaoIa } from './configuracoesIaService';
import { getAccessTokenAtivo } from '../lib/authToken';

const IA_PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ia-proxy`;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MODEL_DEFAULT = 'claude-opus-4-7';

// ─── Carrega config IA do Supabase (com fallback localStorage) ─
// Admin-managed: a chave Anthropic e os parâmetros vivem em
// `configuracoes_ia` (singleton). Se o fetch falhar (ex.: offline ou
// migration ainda não aplicada), retorna a chave do localStorage como
// fallback. Quando o fetch retorna chave, faz "hydration" no localStorage
// para que o código síncrono legado continue funcionando sem mudanças.
export async function carregarConfiguracaoIa() {
  try {
    const cfg = await obterConfiguracaoIa();
    if (cfg?.api_key) {
      try { salvarApiKeyLS(cfg.api_key); } catch { /* ignore */ }
    }
    return {
      apiKey:           cfg?.api_key || carregarApiKeyLS() || '',
      modelo:           cfg?.modelo || MODEL_DEFAULT,
      maxTokens:        Number(cfg?.max_tokens) || 20000,
      adaptiveThinking: cfg?.adaptive_thinking !== false,
      ativo:            cfg?.ativo !== false,
    };
  } catch {
    return {
      apiKey:           carregarApiKeyLS() || '',
      modelo:           MODEL_DEFAULT,
      maxTokens:        20000,
      adaptiveThinking: true,
      ativo:            true,
    };
  }
}

// ─── Chamada unificada Claude ──────────────────────────────────
// - systemBlocks: array de { type:'text', text } — o ultimo recebe cache_control
// - user: texto da mensagem do usuario
// - Modelo, adaptiveThinking e maxTokens vêm da config admin (Supabase) por
//   padrão; podem ser sobrescritos via parâmetros explícitos.
// - anthropic-dangerous-direct-browser-access pq e front-end
// Agora chama a Edge Function `ia-proxy` (server-side injeta a chave lida
// de configuracoes_ia). O param `apiKey` é aceito por compatibilidade mas
// IGNORADO — a chave não trafega mais pelo navegador. Modelo/maxTokens/
// adaptiveThinking podem ser sobrescritos; senão o proxy usa a config admin.
export async function chamarClaudeAPI({ system, user, maxTokens, modelo, adaptiveThinking } = {}) {
  const token = await getAccessTokenAtivo();
  let res;
  try {
    res = await fetch(IA_PROXY_URL, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ system, user, maxTokens, modelo, adaptiveThinking }),
    });
  } catch {
    throw new Error('Falha de conexão com o serviço de IA.');
  }

  if (!res.ok) {
    const errText = await res.text();
    let parsedErr;
    try { parsedErr = JSON.parse(errText); } catch { /* ignore */ }
    const msg = parsedErr?.error?.message || parsedErr?.error || errText;
    const lower = (msg || '').toLowerCase();
    if (lower.includes('credit balance')) {
      const e = new Error('Sua conta Anthropic esta sem creditos. Acesse console.anthropic.com > Plans & Billing.');
      e.code = 'NO_CREDITS'; throw e;
    }
    if (res.status === 401 || res.status === 403) {
      const e = new Error(msg || 'Chave de API invalida ou sem permissão.');
      e.code = 'INVALID_KEY'; throw e;
    }
    if (res.status === 429) {
      const e = new Error('Limite de requisicoes atingido. Aguarde alguns segundos.');
      e.code = 'RATE_LIMIT'; throw e;
    }
    throw new Error(msg);
  }

  // Resposta é SSE (repassado da Anthropic): acumula o texto, captura
  // stop_reason e usage. O streaming mantém a conexão viva (evita o idle
  // timeout de 150s da Edge Function em respostas longas).
  let text = '';
  let stopReason = null;
  let usage = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split('\n');
    buffer = linhas.pop() || '';
    for (const linha of linhas) {
      const l = linha.trim();
      if (!l.startsWith('data:')) continue;
      const js = l.slice(5).trim();
      if (!js || js === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(js); } catch { continue; }
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        text += ev.delta.text;
      } else if (ev.type === 'message_start') {
        usage = ev.message?.usage || usage;
      } else if (ev.type === 'message_delta') {
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        if (ev.usage) usage = { ...(usage || {}), ...ev.usage };
      } else if (ev.type === 'error') {
        throw new Error(ev.error?.message || 'Erro da IA durante o streaming.');
      }
    }
  }

  try {
    const insights = extrairJsonDeTexto(text);
    return { insights, usage, raw: text, stop_reason: stopReason };
  } catch {
    // Trunca + loga amostra pra diagnostico; se foi max_tokens, avisa explicitamente
    const amostra = String(text || '').slice(-400);
    const motivo = stopReason === 'max_tokens'
      ? 'Resposta foi truncada (max_tokens). Tente novamente ou simplifique o payload.'
      : 'Resposta da IA não esta em JSON valido';
    const e = new Error(motivo);
    e.code = stopReason === 'max_tokens' ? 'MAX_TOKENS' : 'INVALID_JSON';
    e.amostra = amostra;
    e.stop_reason = stopReason;
    console.error('[IA] JSON invalido. stop_reason=', stopReason, 'amostra final:', amostra);
    throw e;
  }
}

export function extrairJsonDeTexto(raw) {
  const texto = String(raw || '').trim();
  // 1) Remove code fences se houver
  const semFence = texto
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  // 2) Tenta parse direto
  try { return JSON.parse(semFence); } catch { /* fallthrough */ }
  // 3) Tenta extrair o maior bloco {...} no texto (caso tenha prosa ao redor)
  const primeiroBrace = semFence.indexOf('{');
  const ultimoBrace = semFence.lastIndexOf('}');
  if (primeiroBrace >= 0 && ultimoBrace > primeiroBrace) {
    const candidato = semFence.slice(primeiroBrace, ultimoBrace + 1);
    try { return JSON.parse(candidato); } catch { /* fallthrough */ }
  }
  throw new Error('Resposta da IA não esta em JSON valido');
}

// ─── Classificacao de tipo de combustivel ─────────────────────
// Heuristica simples pelo nome do produto. Fallback = "Outro combustivel"
export function classificarTipoCombustivel(nomeProduto) {
  if (!nomeProduto) return 'Outro combustível';
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
  return 'Outro combustível';
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
