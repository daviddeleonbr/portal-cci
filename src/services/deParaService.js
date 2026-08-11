// deParaService
// ============================================================
// De/Para contábil (por rede): mapa direto conta gerencial → contábil +
// regras condicionais. As contas gerenciais vêm do Autosystem (tabela `conta`)
// via edge autosystem-plano-gerencial. Só admin (RLS — migration 156).
// ============================================================
import { supabase } from '../lib/supabase';

// Extrai a mensagem de erro de uma FunctionsHttpError (edge devolve {error,detail}).
async function _erroEdge(error, fallback) {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body?.detail || body?.error) return new Error(body.detail || body.error);
    }
  } catch { /* ignore */ }
  return new Error(error?.message || fallback);
}

// ─── Plano gerencial (Autosystem, via túnel) ─────────────────
export async function buscarPlanoGerencial(redeId) {
  const { data, error } = await supabase.functions.invoke('autosystem-plano-gerencial', {
    body: { rede_id: redeId },
  });
  if (error) throw await _erroEdge(error, 'Falha ao buscar o plano gerencial do cliente');
  return data?.contas || [];
}

// Empresas da rede (Autosystem, via túnel).
// IMPORTANTE: `movto.empresa` referencia o `empresa.grid` (não o `codigo`).
// Por isso o filtro da exportação usa o GRID; o código/nome é só p/ exibir.
export async function buscarEmpresas(redeId) {
  const { data, error } = await supabase.functions.invoke('autosystem-empresas', {
    body: { rede_id: redeId },
  });
  if (error) throw await _erroEdge(error, 'Falha ao buscar as empresas do cliente');
  return (data?.empresas || []).map(e => ({
    grid: e.grid,
    codigo: e.codigo ?? null,
    nome: e.nome || e.razao || e.razao_social || e.fantasia || e.nome_fantasia || `Empresa ${e.codigo ?? e.grid ?? ''}`,
  })).filter(e => e.grid != null);
}

// Linhas da movto do período/empresa, já com origem_debito rastreado.
export async function buscarMovtoExport(redeId, { empresaCodigos, dataDe, dataAte }) {
  const { data, error } = await supabase.functions.invoke('autosystem-movto-export', {
    body: { rede_id: redeId, empresa_codigos: empresaCodigos, data_de: dataDe, data_ate: dataAte },
  });
  if (error) throw await _erroEdge(error, 'Falha ao buscar a movimentação do cliente');
  return data?.linhas || [];
}

// Config completa do de/para de uma rede+plano (p/ resolver a exportação).
export async function carregarConfig(asRedeId, planoId) {
  const [mapaArr, regras, passagem, historicos, exclusoes] = await Promise.all([
    listarMapa(asRedeId, planoId),
    listarRegras(asRedeId, planoId),
    listarPassagem(asRedeId),
    listarHistoricos(asRedeId, planoId),
    listarExclusoes(asRedeId, planoId),
  ]);
  return {
    mapa: Object.fromEntries(mapaArr.map(m => [m.conta_gerencial, m.conta_contabil_codigo])),
    regras,
    passagem: new Set(passagem),
    historicos,
    exclusoes: exclusoes.filter(e => e.ativo),
  };
}

// Planos contábeis atribuídos à rede (allowlist plano_contabil_rede).
export async function listarPlanosDaRede(asRedeId) {
  const { data, error } = await supabase
    .from('plano_contabil_rede')
    .select('plano_id, plano_contabil(id, nome)')
    .eq('as_rede_id', asRedeId);
  if (error) throw error;
  return (data || [])
    .map(r => r.plano_contabil)
    .filter(Boolean);
}

// ─── Mapa direto ─────────────────────────────────────────────
export async function listarMapa(asRedeId, planoId) {
  const { data, error } = await supabase
    .from('de_para_mapa')
    .select('id, conta_gerencial, conta_contabil_codigo')
    .eq('as_rede_id', asRedeId).eq('plano_id', planoId);
  if (error) throw error;
  return data || [];
}

export async function salvarMapa(asRedeId, planoId, contaGerencial, contaContabilCodigo) {
  // sem destino = remove o mapeamento
  if (!contaContabilCodigo) {
    const { error } = await supabase.from('de_para_mapa')
      .delete().eq('as_rede_id', asRedeId).eq('plano_id', planoId).eq('conta_gerencial', contaGerencial);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('de_para_mapa')
    .upsert({ as_rede_id: asRedeId, plano_id: planoId, conta_gerencial: contaGerencial, conta_contabil_codigo: contaContabilCodigo },
      { onConflict: 'as_rede_id,plano_id,conta_gerencial' });
  if (error) throw error;
}

// ─── Contas de passagem (ex.: 2.1.1) ─────────────────────────
export async function listarPassagem(asRedeId) {
  const { data, error } = await supabase
    .from('de_para_conta_passagem')
    .select('conta_gerencial')
    .eq('as_rede_id', asRedeId);
  if (error) throw error;
  return (data || []).map(r => r.conta_gerencial);
}

export async function marcarPassagem(asRedeId, contaGerencial, marcar) {
  if (marcar) {
    const { error } = await supabase.from('de_para_conta_passagem')
      .upsert({ as_rede_id: asRedeId, conta_gerencial: contaGerencial }, { onConflict: 'as_rede_id,conta_gerencial' });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('de_para_conta_passagem')
      .delete().eq('as_rede_id', asRedeId).eq('conta_gerencial', contaGerencial);
    if (error) throw error;
  }
}

// ─── Regras condicionais ─────────────────────────────────────
export async function listarRegras(asRedeId, planoId) {
  const { data, error } = await supabase
    .from('de_para_regra')
    .select('id, tipo_lancamento, prioridade, cond_conta_debitar, cond_conta_creditar, cond_despesa_origem, lado, conta_contabil_codigo, descricao, ativo')
    .eq('as_rede_id', asRedeId).eq('plano_id', planoId)
    .order('tipo_lancamento', { ascending: true })
    .order('prioridade', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function criarRegra(asRedeId, planoId, regra) {
  const { data, error } = await supabase.from('de_para_regra')
    .insert({
      as_rede_id: asRedeId,
      plano_id: planoId,
      tipo_lancamento: regra.tipo_lancamento || 'provisao',
      prioridade: regra.prioridade ?? 0,
      cond_conta_debitar: regra.cond_conta_debitar || null,
      cond_conta_creditar: regra.cond_conta_creditar || null,
      cond_despesa_origem: regra.cond_despesa_origem || null,
      lado: regra.lado,
      conta_contabil_codigo: regra.conta_contabil_codigo,
      descricao: regra.descricao?.trim() || null,
    })
    .select('id').single();
  if (error) throw error;
  return data;
}

export async function atualizarRegra(id, campos) {
  const { error } = await supabase.from('de_para_regra').update(campos).eq('id', id);
  if (error) throw error;
}

export async function excluirRegra(id) {
  const { error } = await supabase.from('de_para_regra').delete().eq('id', id);
  if (error) throw error;
}

// ─── Históricos padrão (templates) ───────────────────────────
// Tokens do template: {documento} {pessoa} {valor} {data} {vencto} {obs}
export const HISTORICO_TOKENS = [
  { token: '{documento}',       label: 'Documento' },
  { token: '{pessoa}',          label: 'Nome da pessoa' },
  { token: '{doc_provisao}',    label: 'Doc. da provisão' },
  { token: '{pessoa_provisao}', label: 'Pessoa da provisão' },
  { token: '{valor}',           label: 'Valor' },
  { token: '{data}',            label: 'Data' },
  { token: '{vencto}',          label: 'Vencimento' },
  { token: '{obs}',             label: 'Observação' },
];

export async function listarHistoricos(asRedeId, planoId) {
  const { data, error } = await supabase
    .from('historico_regra')
    .select('id, tipo_lancamento, prioridade, cond_conta_debitar, cond_conta_creditar, cond_despesa_origem, template, descricao, ativo')
    .eq('as_rede_id', asRedeId).eq('plano_id', planoId)
    .order('tipo_lancamento', { ascending: true })
    .order('prioridade', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function criarHistorico(asRedeId, planoId, h) {
  const { data, error } = await supabase.from('historico_regra')
    .insert({
      as_rede_id: asRedeId,
      plano_id: planoId,
      tipo_lancamento: h.tipo_lancamento || 'provisao',
      prioridade: h.prioridade ?? 0,
      cond_conta_debitar: h.cond_conta_debitar || null,
      cond_conta_creditar: h.cond_conta_creditar || null,
      cond_despesa_origem: h.cond_despesa_origem || null,
      template: (h.template || '').trim(),
      descricao: h.descricao?.trim() || null,
    })
    .select('id').single();
  if (error) throw error;
  return data;
}

export async function atualizarHistorico(id, campos) {
  const { error } = await supabase.from('historico_regra').update(campos).eq('id', id);
  if (error) throw error;
}

export async function excluirHistorico(id) {
  const { error } = await supabase.from('historico_regra').delete().eq('id', id);
  if (error) throw error;
}

// ─── Regras de exclusão (não exportar) ───────────────────────
export async function listarExclusoes(asRedeId, planoId) {
  const { data, error } = await supabase
    .from('de_para_exclusao')
    .select('id, cond_conta_debitar, cond_conta_creditar, descricao, ativo')
    .eq('as_rede_id', asRedeId).eq('plano_id', planoId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function criarExclusao(asRedeId, planoId, e) {
  const { data, error } = await supabase.from('de_para_exclusao')
    .insert({
      as_rede_id: asRedeId,
      plano_id: planoId,
      cond_conta_debitar: e.cond_conta_debitar || null,
      cond_conta_creditar: e.cond_conta_creditar || null,
      descricao: e.descricao?.trim() || null,
    })
    .select('id').single();
  if (error) throw error;
  return data;
}

export async function atualizarExclusao(id, campos) {
  const { error } = await supabase.from('de_para_exclusao').update(campos).eq('id', id);
  if (error) throw error;
}

export async function excluirExclusao(id) {
  const { error } = await supabase.from('de_para_exclusao').delete().eq('id', id);
  if (error) throw error;
}
