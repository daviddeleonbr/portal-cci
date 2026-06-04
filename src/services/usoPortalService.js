// Telemetria de uso do portal cliente.
// - registrarPageview()  → 1 INSERT por mudança de rota (fire-and-forget)
// - resumo / serieDiaria / topPaginas / acessosRecentes → RPCs SECURITY DEFINER
//   que o admin consome em /admin/uso-portal.

import { supabase } from '../lib/supabase';

// ─── Tracking (lado cliente) ─────────────────────────────────

export async function registrarPageview({ usuario, tipoCliente, chaveApi, asRede, cliente, path }) {
  if (!usuario?.id || !path) return;
  try {
    await supabase.from('cci_uso_portal').insert({
      usuario_id: usuario.id,
      tipo_portal: tipoCliente || null,
      chave_api_id: chaveApi?.id || null,
      as_rede_id:   asRede?.id   || null,
      cliente_id:   cliente?.id  || null,
      path,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch {
    // Tracking é fire-and-forget: nunca quebra a navegação por causa de
    // falha aqui (rede caiu, RLS errada etc.). Em dev, dá pra logar.
  }
}

// ─── Consultas (lado admin) ──────────────────────────────────

function pickFiltros({ usuarioId, redeFiltro }) {
  // redeFiltro: 'wp:<id>' | 'as:<id>' | null
  let p_chave_api_id = null;
  let p_as_rede_id   = null;
  if (redeFiltro && typeof redeFiltro === 'string') {
    const [tipo, id] = redeFiltro.split(':');
    if (tipo === 'wp') p_chave_api_id = id;
    if (tipo === 'as') p_as_rede_id   = id;
  }
  return {
    p_usuario_id:   usuarioId || null,
    p_chave_api_id,
    p_as_rede_id,
  };
}

export async function resumo({ de, ate, usuarioId, redeFiltro }) {
  const { data, error } = await supabase.rpc('uso_portal_resumo', {
    p_de: de, p_ate: ate, ...pickFiltros({ usuarioId, redeFiltro }),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function serieDiaria({ de, ate, usuarioId, redeFiltro }) {
  const { data, error } = await supabase.rpc('uso_portal_serie_diaria', {
    p_de: de, p_ate: ate, ...pickFiltros({ usuarioId, redeFiltro }),
  });
  if (error) throw error;
  return data || [];
}

export async function topPaginas({ de, ate, usuarioId, redeFiltro }) {
  const { data, error } = await supabase.rpc('uso_portal_top_paginas', {
    p_de: de, p_ate: ate, ...pickFiltros({ usuarioId, redeFiltro }),
  });
  if (error) throw error;
  return data || [];
}

// Lista bruta de acessos (paginada) — para a tabela "Últimos acessos".
// Usa SELECT direto com JOIN no usuário/rede pra mostrar nomes.
export async function acessosRecentes({ de, ate, usuarioId, redeFiltro, limit = 100 }) {
  let query = supabase
    .from('cci_uso_portal')
    .select(`
      id, path, tipo_portal, created_at,
      usuario:cci_usuarios_sistema(id, nome, email),
      chaves_api(id, nome),
      as_rede(id, nome),
      cliente:clientes(id, nome)
    `)
    .gte('created_at', `${de}T00:00:00`)
    .lte('created_at', `${ate}T23:59:59`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (usuarioId) query = query.eq('usuario_id', usuarioId);
  if (redeFiltro) {
    const [tipo, id] = String(redeFiltro).split(':');
    if (tipo === 'wp') query = query.eq('chave_api_id', id);
    if (tipo === 'as') query = query.eq('as_rede_id',   id);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ─── Helpers de UI ───────────────────────────────────────────

// Transforma path em label legível (ex: "/cliente/autosystem/comercial/vendas"
//  → "Autosystem · Comercial > Vendas")
export function labelPath(path) {
  if (!path) return '—';
  const limpo = path.replace(/^\/cliente\//, '').replace(/^\/admin\//, '');
  const partes = limpo.split('/').filter(Boolean);
  if (partes.length === 0) return path;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
  const prefixo = partes[0] === 'webposto' ? 'Webposto'
                : partes[0] === 'autosystem' ? 'Autosystem'
                : cap(partes[0]);
  const resto = partes.slice(1).map(cap).join(' › ');
  return resto ? `${prefixo} · ${resto}` : prefixo;
}

export function formatarDuracao(segundos) {
  const s = Number(segundos);
  if (!Number.isFinite(s) || s <= 0) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}
