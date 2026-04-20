import { supabase } from '../lib/supabase';

// ===================== CHAVES API =====================

export async function listarChavesApi() {
  // Busca chaves primeiro
  const { data: chaves, error } = await supabase
    .from('chaves_api')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Busca clientes vinculados separadamente (resiliente se tabela ainda nao existir)
  let clientesVinculados = [];
  try {
    const { data } = await supabase
      .from('clientes')
      .select('id, nome, cnpj, empresa_codigo, status, chave_api_id')
      .not('chave_api_id', 'is', null);
    clientesVinculados = data || [];
  } catch (_) {
    // tabela clientes pode nao existir ainda - nao quebra a query
  }

  return (chaves || []).map(c => ({
    ...c,
    clientes: clientesVinculados.filter(cl => cl.chave_api_id === c.id),
  }));
}

export async function criarChaveApi({ nome, provedor, chave, url_base }) {
  const { data, error } = await supabase
    .from('chaves_api')
    .insert({ nome, provedor: provedor || 'quality', chave, url_base: url_base || 'https://web.qualityautomacao.com.br/INTEGRACAO' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarChaveApi(id, campos) {
  const { data, error } = await supabase
    .from('chaves_api')
    .update(campos)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirChaveApi(id) {
  const { error } = await supabase.from('chaves_api').delete().eq('id', id);
  if (error) throw error;
}

// ===================== EMPRESAS API (cache) =====================

export async function salvarEmpresasApi(chaveApiId, empresas) {
  const rows = empresas.map(e => ({
    chave_api_id: chaveApiId,
    empresa_codigo: e.empresaCodigo || e.codigo,
    cnpj: e.cnpj,
    razao: e.razao,
    fantasia: e.fantasia,
    cidade: e.cidade,
    estado: e.estado,
  }));

  const { data, error } = await supabase
    .from('empresas_api')
    .upsert(rows, { onConflict: 'chave_api_id,empresa_codigo' })
    .select();
  if (error) throw error;
  return data;
}

export async function listarEmpresasApi(chaveApiId) {
  const { data, error } = await supabase
    .from('empresas_api')
    .select('*')
    .eq('chave_api_id', chaveApiId)
    .order('fantasia', { ascending: true });
  if (error) throw error;
  return data;
}

// ===================== MAPEAMENTO CONTAS =====================

export async function listarMapeamentos(chaveApiId) {
  const { data, error } = await supabase
    .from('mapeamento_empresa_contas')
    .select('*, grupos_dre(id, nome, tipo, mascara_id)')
    .eq('chave_api_id', chaveApiId);
  if (error) throw error;
  return data;
}

export async function criarMapeamentosBatch(chaveApiId, mapeamentos) {
  const rows = mapeamentos.map(m => ({
    chave_api_id: chaveApiId,
    grupo_dre_id: m.grupo_dre_id,
    plano_conta_codigo: m.plano_conta_codigo,
    plano_conta_descricao: m.plano_conta_descricao,
    plano_conta_hierarquia: m.plano_conta_hierarquia || null,
    plano_conta_natureza: m.plano_conta_natureza || null,
  }));

  const { data, error } = await supabase
    .from('mapeamento_empresa_contas')
    .upsert(rows, { onConflict: 'chave_api_id,grupo_dre_id,plano_conta_codigo' })
    .select();
  if (error) throw error;
  return data;
}

export async function excluirMapeamento(id) {
  const { error } = await supabase
    .from('mapeamento_empresa_contas')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function moverMapeamento(id, novoGrupoDreId) {
  const { data, error } = await supabase
    .from('mapeamento_empresa_contas')
    .update({ grupo_dre_id: novoGrupoDreId })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
