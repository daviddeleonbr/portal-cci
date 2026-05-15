import { supabase } from '../lib/supabase';

// ─── Gera slug a partir do nome ──────────────────────────────
export function gerarSlug(nome) {
  return (nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')      // so letras, numeros, espacos e hifens
    .replace(/\s+/g, '-')              // espacos viram hifens
    .replace(/-+/g, '-');              // colapsa hifens duplicados
}

// ─── as_rede CRUD ────────────────────────────────────────────
// TODOS os 5 campos de conexão (ip, porta, banco, usuario, senha) ficam
// CRIPTOGRAFADOS em colunas *_enc. A chave de criptografia fica em
// supabase_vault (vault.secrets), nunca exposta no schema regular.
//
// O cliente nunca le/escreve as colunas *_enc direto — usa RPCs:
//   - as_rede_create_full(nome, slug, ativo, ip, porta, banco, usuario, senha)
//   - as_rede_set_credenciais(id, ip?, porta?, banco?, usuario?, senha?)
//       NULL = mantém valor atual; '' = limpa
//   - as_rede_get_credenciais(id) → retorna todos decryptados
//
// Listagem (`SELECT_PUBLICO`) nunca expoe credenciais — so id/nome/slug/ativo.

const SELECT_PUBLICO = `
  id, nome, slug,
  ativo, observacoes, created_at, updated_at
`;

export async function listarRedes() {
  const { data, error } = await supabase
    .from('as_rede')
    .select(SELECT_PUBLICO)
    .order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function buscarRede(id) {
  const { data, error } = await supabase
    .from('as_rede')
    .select(SELECT_PUBLICO)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Cria a rede com nome+slug+credenciais em uma unica chamada RPC atomica.
export async function criarRede({
  nome, slug, ativo = true,
  conexao_ip, conexao_porta, conexao_banco, conexao_usuario,
  senha,
}) {
  const porta = conexao_porta != null && conexao_porta !== '' ? Number(conexao_porta) : null;
  const { data, error } = await supabase.rpc('as_rede_create_full', {
    p_nome: nome,
    p_slug: slug || gerarSlug(nome),
    p_ativo: ativo,
    p_ip: conexao_ip || null,
    p_porta: porta,
    p_banco: conexao_banco || null,
    p_usuario: conexao_usuario || null,
    p_senha: senha || null,
  });
  if (error) throw error;
  return await buscarRede(data);
}

// Atualiza campos da rede:
//   - nome, slug, ativo, observacoes → UPDATE direto
//   - conexao_ip/porta/banco/usuario, senha → via RPC `as_rede_set_credenciais`
//     (campos undefined ficam null = mantém atual).
export async function atualizarRede(id, campos) {
  const {
    senha,
    conexao_ip, conexao_porta, conexao_banco, conexao_usuario,
    ...resto
  } = campos;

  // Update dos campos publicos
  const update = {};
  if (resto.nome !== undefined)        update.nome = resto.nome;
  if (resto.slug !== undefined)        update.slug = resto.slug;
  if (resto.ativo !== undefined)       update.ativo = resto.ativo;
  if (resto.observacoes !== undefined) update.observacoes = resto.observacoes || null;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from('as_rede')
      .update(update)
      .eq('id', id);
    if (error) throw error;
  }

  // Credenciais — so dispara RPC se algum dos 5 campos veio definido
  const algumaCred =
    conexao_ip !== undefined || conexao_porta !== undefined ||
    conexao_banco !== undefined || conexao_usuario !== undefined ||
    senha !== undefined;
  if (algumaCred) {
    const porta = conexao_porta === undefined ? null
      : conexao_porta != null && conexao_porta !== '' ? Number(conexao_porta) : null;
    const { error } = await supabase.rpc('as_rede_set_credenciais', {
      p_id: id,
      p_ip:      conexao_ip      === undefined ? null : (conexao_ip      || ''),
      p_porta:   porta,
      p_banco:   conexao_banco   === undefined ? null : (conexao_banco   || ''),
      p_usuario: conexao_usuario === undefined ? null : (conexao_usuario || ''),
      p_senha:   senha           === undefined ? null : (senha           || ''),
    });
    if (error) throw error;
  }

  return await buscarRede(id);
}

export async function excluirRede(id) {
  const { error } = await supabase.from('as_rede').delete().eq('id', id);
  if (error) throw error;
}

// Retorna todas as credenciais (com senha em plaintext) para conectar
// ao servidor Autosystem. Use apenas no fluxo de edicao ou no
// proxy/edge-function que faz a query ao banco remoto.
export async function obterCredenciais(id) {
  const { data, error } = await supabase.rpc('as_rede_get_credenciais', { p_id: id });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// Helper compartilhado: extrai mensagem detalhada de FunctionsHttpError
async function _extrairErroFn(error, dataFallback) {
  let detail = error.message;
  try {
    if (error.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      // eslint-disable-next-line no-console
      console.error('[autosystem fn] erro:', body);
      detail = body?.detail || body?.error || JSON.stringify(body);
    } else if (error.context && typeof error.context.text === 'function') {
      detail = await error.context.text();
    }
  } catch {
    // mantém error.message
  }
  return new Error(detail || dataFallback || 'Falha ao chamar Edge Function');
}

// ─── Contas a pagar (banco remoto Autosystem) ────────────────
// Filtros suportados:
//   - vencto_de  / vencto_ate  (YYYY-MM-DD, opcional)
export async function buscarContasPagar(redeId, empresaCodigo, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (empresaCodigo == null || empresaCodigo === '') {
    throw new Error('Esta empresa ainda não foi vinculada ao Autosystem (empresa_codigo vazio).');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-contas-pagar', {
    body: {
      rede_id: redeId,
      empresa_codigo: empresaCodigo,
      vencto_de: filtros.vencto_de || null,
      vencto_ate: filtros.vencto_ate || null,
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar contas a pagar');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.contas) ? data.contas : [];
}

// ─── Contas a receber (banco remoto Autosystem) ──────────────
// Mesma assinatura/filtros de buscarContasPagar. A query usada na
// Edge Function filtra `conta_creditar like '1.3%'`.
export async function buscarContasReceber(redeId, empresaCodigo, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (empresaCodigo == null || empresaCodigo === '') {
    throw new Error('Esta empresa ainda não foi vinculada ao Autosystem (empresa_codigo vazio).');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-contas-receber', {
    body: {
      rede_id: redeId,
      empresa_codigo: empresaCodigo,
      vencto_de: filtros.vencto_de || null,
      vencto_ate: filtros.vencto_ate || null,
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar contas a receber');
  if (data?.error) throw new Error(data.detail || data.error);
  // Diagnóstico: contagens por etapa de filtro vêm em `data.diag`.
  // Vê no DevTools → Console qual filtro está cortando registros.
  if (data?.diag) {
    // eslint-disable-next-line no-console
    console.log(`[contas-receber:${empresaCodigo}]`, data.diag);
  }
  return Array.isArray(data?.contas) ? data.contas : [];
}

// ─── Empresas (banco remoto Autosystem) ──────────────────────
// Chama a Edge Function `autosystem-empresas`, que:
//   1) busca credenciais via RPC `as_rede_get_credenciais`
//   2) abre conexão Postgres no servidor remoto
//   3) executa `SELECT * FROM empresa`
// Retorna o array de empresas com todos os campos vindos do
// servidor Autosystem.
export async function buscarEmpresasAutosystem(redeId) {
  const { data, error } = await supabase.functions.invoke('autosystem-empresas', {
    body: { rede_id: redeId },
  });

  // supabase-js v2 lança FunctionsHttpError sem expor o body — pegamos via error.context.
  if (error) {
    let detail = error.message;
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        // Loga corpo completo (inclui `diag` e `failed_step`) pra inspeção no console
        // eslint-disable-next-line no-console
        console.error('[autosystem-empresas] erro:', body);
        detail = body?.detail || body?.error || JSON.stringify(body);
      } else if (error.context && typeof error.context.text === 'function') {
        detail = await error.context.text();
      }
    } catch {
      // mantém error.message
    }
    throw new Error(detail || 'Falha ao buscar empresas no Autosystem');
  }

  if (data?.error) {
    throw new Error(data.detail || data.error);
  }
  return Array.isArray(data?.empresas) ? data.empresas : [];
}
