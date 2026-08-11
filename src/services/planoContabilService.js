// planoContabilService
// ============================================================
// CRUD dos planos de contas CONTÁBEIS da ferramenta Exportação Contábil.
// Cada plano é importado de planilha e atribuível a redes (allowlist).
// Só admin acessa (RLS admin-only — migration 154).
// ============================================================
import { supabase } from '../lib/supabase';

// ─── Planos (cabeçalho) ──────────────────────────────────────
export async function listarPlanos() {
  const { data, error } = await supabase
    .from('plano_contabil')
    .select('id, nome, descricao, ativo, created_at, plano_contabil_conta(count), plano_contabil_rede(count)')
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data || []).map(p => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    ativo: p.ativo,
    created_at: p.created_at,
    qtdContas: p.plano_contabil_conta?.[0]?.count ?? 0,
    qtdRedes: p.plano_contabil_rede?.[0]?.count ?? 0,
  }));
}

export async function criarPlano({ nome, descricao }) {
  const { data, error } = await supabase
    .from('plano_contabil')
    .insert({ nome: (nome || '').trim(), descricao: descricao?.trim() || null })
    .select('id, nome, descricao, ativo')
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarPlano(id, campos) {
  const { data, error } = await supabase
    .from('plano_contabil').update(campos).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Plano não atualizado (sem permissão ou inexistente).');
}

export async function excluirPlano(id) {
  const { error } = await supabase.from('plano_contabil').delete().eq('id', id);
  if (error) throw error;
}

// ─── Contas do plano ─────────────────────────────────────────
export async function listarContas(planoId) {
  // pagina em blocos p/ não esbarrar no limite de linhas do PostgREST
  const PAGE = 1000;
  let from = 0;
  const todas = [];
  for (;;) {
    const { data, error } = await supabase
      .from('plano_contabil_conta')
      .select('id, codigo, codigo_reduzido, descricao, natureza, classificacao, ordem')
      .eq('plano_id', planoId)
      .order('ordem', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    todas.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return todas;
}

// Importa em lote. substituir=true apaga as contas atuais antes (padrão:
// importar = substituir o plano inteiro). Retorna a qtd inserida.
export async function importarContas(planoId, contas, { substituir = true } = {}) {
  if (substituir) {
    const { error: delErr } = await supabase
      .from('plano_contabil_conta').delete().eq('plano_id', planoId);
    if (delErr) throw delErr;
  }
  const entrada = (contas || []).length;
  const rows = (contas || [])
    .map((c, i) => ({
      plano_id: planoId,
      codigo: String(c.codigo ?? '').trim(),
      codigo_reduzido: c.codigo_reduzido != null && String(c.codigo_reduzido).trim() !== ''
        ? String(c.codigo_reduzido).trim() : null,
      descricao: String(c.descricao ?? '').trim(),
      natureza: c.natureza != null && String(c.natureza).trim() !== ''
        ? String(c.natureza).trim() : null,
      classificacao: c.classificacao != null && String(c.classificacao).trim() !== ''
        ? String(c.classificacao).trim() : null,
      ordem: i,
    }))
    .filter(r => r.codigo && r.descricao);
  const semDados = entrada - rows.length; // linhas sem código ou sem descrição

  // Dedup por código: a planilha pode repetir o mesmo código (subtotais, linhas
  // duplicadas). Sem isso o upsert quebra com "ON CONFLICT ... cannot affect row
  // a second time". Mantém a última ocorrência, preservando a ordem do 1º visto.
  const porCodigo = new Map();
  rows.forEach(r => porCodigo.set(r.codigo, r));
  const unicos = [...porCodigo.values()].map((r, i) => ({ ...r, ordem: i }));
  const duplicados = rows.length - unicos.length;

  const CHUNK = 500;
  for (let i = 0; i < unicos.length; i += CHUNK) {
    const { error } = await supabase
      .from('plano_contabil_conta')
      .upsert(unicos.slice(i, i + CHUNK), { onConflict: 'plano_id,codigo' });
    if (error) throw error;
  }
  return { entrada, inseridas: unicos.length, duplicados, semDados };
}

export async function criarConta(planoId, conta) {
  const { data, error } = await supabase
    .from('plano_contabil_conta')
    .insert({
      plano_id: planoId,
      codigo: String(conta.codigo || '').trim(),
      codigo_reduzido: conta.codigo_reduzido?.trim() || null,
      descricao: String(conta.descricao || '').trim(),
      natureza: conta.natureza?.trim() || null,
      classificacao: conta.classificacao?.trim() || null,
      ordem: conta.ordem ?? 9999,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarConta(id, campos) {
  const { error } = await supabase.from('plano_contabil_conta').update(campos).eq('id', id);
  if (error) throw error;
}

export async function excluirConta(id) {
  const { error } = await supabase.from('plano_contabil_conta').delete().eq('id', id);
  if (error) throw error;
}

// ─── Redes que usam o plano (allowlist) ──────────────────────
export async function listarRedesDoPlano(planoId) {
  const { data, error } = await supabase
    .from('plano_contabil_rede')
    .select('as_rede_id, chave_api_id')
    .eq('plano_id', planoId);
  if (error) throw error;
  return {
    asRedeIds:   (data || []).map(r => r.as_rede_id).filter(Boolean),
    chaveApiIds: (data || []).map(r => r.chave_api_id).filter(Boolean),
  };
}

// Replace-all. Recebe listas de ids (Autosystem e/ou Webposto).
export async function definirRedesDoPlano(planoId, { asRedeIds = [], chaveApiIds = [] }) {
  const { error: delErr } = await supabase
    .from('plano_contabil_rede').delete().eq('plano_id', planoId);
  if (delErr) throw delErr;
  const rows = [
    ...[...new Set(asRedeIds)].map(id => ({ plano_id: planoId, as_rede_id: id })),
    ...[...new Set(chaveApiIds)].map(id => ({ plano_id: planoId, chave_api_id: id })),
  ];
  if (rows.length > 0) {
    const { error } = await supabase.from('plano_contabil_rede').insert(rows);
    if (error) throw error;
  }
}
