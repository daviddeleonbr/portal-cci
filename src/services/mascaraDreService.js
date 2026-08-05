import { supabase } from '../lib/supabase';

// ===================== MASCARAS =====================

// Lista máscaras. Sem filtro (admin) → todas, com a allowlist de redes embutida
// (`mascara_dre_rede`). Passando { asRedeId } ou { chaveApiId } (relatórios) →
// só as máscaras SEM restrição (nenhuma rede marcada = todas) OU liberadas para
// a rede informada.
export async function listarMascaras({ asRedeId, chaveApiId } = {}) {
  const { data, error } = await supabase
    .from('mascaras_dre')
    .select('*, grupos_dre(count), mascara_dre_rede(chave_api_id, as_rede_id)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  let rows = data || [];
  if (asRedeId || chaveApiId) {
    rows = rows.filter(m => {
      const allow = m.mascara_dre_rede || [];
      if (allow.length === 0) return true; // sem restrição = disponível a todas
      return allow.some(r =>
        (asRedeId && r.as_rede_id === asRedeId) || (chaveApiId && r.chave_api_id === chaveApiId));
    });
  }
  return rows;
}

// Duplica uma máscara: copia a linha (nome + " (cópia)", padrao=false) e TODOS
// os grupos, remapeando parent_id. Mapeamentos NÃO são copiados (a cópia começa
// sem contas mapeadas — cada rede remapeia). Retorna a nova máscara.
export async function duplicarMascara(id) {
  const orig = await buscarMascara(id);
  const nova = await criarMascara({ nome: `${orig.nome} (cópia)`, descricao: orig.descricao || null });
  const grupos = await listarGrupos(id);

  // Insere pais antes de filhos (parent_id pode referenciar grupo ainda não
  // inserido) — passa múltiplas vezes até esvaziar, remapeando old→new id.
  const idMap = new Map();
  const pendentes = [...grupos];
  let guard = 0;
  while (pendentes.length && guard < 100000) {
    guard++;
    const g = pendentes.find(x => !x.parent_id || idMap.has(x.parent_id));
    if (!g) break; // ciclo inesperado — evita loop infinito
    const novoGrupo = await criarGrupo({
      mascara_id: nova.id,
      nome: g.nome, tipo: g.tipo, sinal: g.sinal, ordem: g.ordem,
      parent_id: g.parent_id ? idMap.get(g.parent_id) : null,
      formula: g.formula || null,
    });
    idMap.set(g.id, novoGrupo.id);
    pendentes.splice(pendentes.indexOf(g), 1);
  }
  return nova;
}


export async function buscarMascara(id) {
  const { data, error } = await supabase
    .from('mascaras_dre')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function criarMascara({ nome, descricao }) {
  const { data, error } = await supabase
    .from('mascaras_dre')
    .insert({ nome, descricao })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarMascara(id, campos) {
  const { data, error } = await supabase
    .from('mascaras_dre')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirMascara(id) {
  const { error } = await supabase
    .from('mascaras_dre')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// Define `id` como a máscara DRE padrão. Como existe um índice único parcial
// (só uma padrão permitida), removemos a padrão atual ANTES de marcar a nova.
export async function definirMascaraPadrao(id) {
  const { error: errLimpar } = await supabase
    .from('mascaras_dre')
    .update({ padrao: false })
    .eq('padrao', true);
  if (errLimpar) throw errLimpar;

  const { data, error } = await supabase
    .from('mascaras_dre')
    .update({ padrao: true })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ===================== GRUPOS =====================

export async function listarGrupos(mascaraId) {
  const { data, error } = await supabase
    .from('grupos_dre')
    .select('*, mapeamento_contas(count)')
    .eq('mascara_id', mascaraId)
    .order('ordem', { ascending: true });

  if (error) throw error;
  return data;
}

export async function criarGrupo({ mascara_id, nome, tipo, sinal, ordem, parent_id, formula }) {
  const { data, error } = await supabase
    .from('grupos_dre')
    .insert({ mascara_id, nome, tipo, sinal, ordem, parent_id: parent_id || null, formula: formula || null })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarGrupo(id, campos) {
  const { data, error } = await supabase
    .from('grupos_dre')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirGrupo(id) {
  const { error } = await supabase
    .from('grupos_dre')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function reordenarGrupos(grupos) {
  // grupos = [{ id, ordem }]
  const promises = grupos.map(({ id, ordem }) =>
    supabase.from('grupos_dre').update({ ordem }).eq('id', id)
  );
  const results = await Promise.all(promises);
  const err = results.find(r => r.error);
  if (err?.error) throw err.error;
}

// ===================== MAPEAMENTO =====================

export async function listarMapeamentos(grupoDreId) {
  const { data, error } = await supabase
    .from('mapeamento_contas')
    .select('*')
    .eq('grupo_dre_id', grupoDreId)
    .order('conta_nome', { ascending: true });

  if (error) throw error;
  return data;
}

export async function listarTodosMapeamentos(mascaraId) {
  const { data, error } = await supabase
    .from('mapeamento_contas')
    .select('*, grupos_dre!inner(mascara_id, nome)')
    .eq('grupos_dre.mascara_id', mascaraId);

  if (error) throw error;
  return data;
}

export async function criarMapeamento({ grupo_dre_id, conta_codigo, conta_nome }) {
  const { data, error } = await supabase
    .from('mapeamento_contas')
    .insert({ grupo_dre_id, conta_codigo, conta_nome })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function criarMapeamentosBatch(mapeamentos) {
  // mapeamentos = [{ grupo_dre_id, conta_codigo, conta_nome }]
  const { data, error } = await supabase
    .from('mapeamento_contas')
    .upsert(mapeamentos, { onConflict: 'grupo_dre_id,conta_codigo' })
    .select();

  if (error) throw error;
  return data;
}

export async function excluirMapeamento(id) {
  const { error } = await supabase
    .from('mapeamento_contas')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function moverMapeamento(id, novoGrupoDreId) {
  const { data, error } = await supabase
    .from('mapeamento_contas')
    .update({ grupo_dre_id: novoGrupoDreId })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
