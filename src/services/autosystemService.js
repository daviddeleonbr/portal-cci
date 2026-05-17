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

// ─── Contas (plano de contas Autosystem) ─────────────────────
// Lê todas as contas via Edge Function. O front classifica e persiste em
// as_rede_conta_categoria (forma de recebimento).
export async function buscarContasAutosystem(redeId) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  const { data, error } = await supabase.functions.invoke('autosystem-contas', {
    body: { rede_id: redeId },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar contas');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.contas) ? data.contas : [];
}

// Lista contas já categorizadas no Supabase para esta rede.
export async function listarContasCategorizadasRede(redeId) {
  if (!redeId) return [];
  const { data, error } = await supabase
    .from('as_rede_conta_categoria')
    .select('*')
    .eq('as_rede_id', redeId)
    .order('codigo', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Upsert em lote. `contas` = array de { codigo, nome, categoria }.
// categoria null/'' → remove a categorização daquela conta.
export async function salvarContasCategoria(redeId, contas) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  const valid = (contas || []).filter(c => c && c.codigo && c.categoria);
  const invalid = (contas || []).filter(c => c && c.codigo && !c.categoria);

  if (valid.length > 0) {
    const payload = valid.map(c => ({
      as_rede_id: redeId,
      codigo: String(c.codigo),
      nome: c.nome || '—',
      categoria: c.categoria,
    }));
    const { error } = await supabase
      .from('as_rede_conta_categoria')
      .upsert(payload, { onConflict: 'as_rede_id,codigo' });
    if (error) throw error;
  }

  if (invalid.length > 0) {
    const codigos = invalid.map(c => String(c.codigo));
    const { error } = await supabase
      .from('as_rede_conta_categoria')
      .delete()
      .eq('as_rede_id', redeId)
      .in('codigo', codigos);
    if (error) throw error;
  }
}

// ─── Outras entradas (não-venda) ─────────────────────────────
// Lançamentos onde `conta_debitar` começa com '1.1.2' (entrada no caixa)
// e `conta_creditar` NÃO começa com '4.1' (não é receita de vendas).
// Usado pra somar como "Entradas" no detalhamento por funcionário do BPO.
export async function buscarOutrasEntradasAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-outras-entradas', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de: filtros.data_de,
      data_ate: filtros.data_ate,
      // Contas a NÃO incluir (ex: as classificadas como Sobra de caixa,
      // que já são exibidas em card próprio).
      contas_creditar_excluir: Array.isArray(filtros.contas_creditar_excluir)
        ? filtros.contas_creditar_excluir
        : [],
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar outras entradas');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.entradas) ? data.entradas : [];
}

// ─── Recebimentos das vendas (banco remoto Autosystem) ───────
// Retorna os movimentos de entrada (`conta_creditar like '1.1.2%'`)
// vinculados a vendas (`lancto.operacao='V'`) no período, com a
// `conta_debitar` (modo de recebimento). O front cruza com
// `as_rede_conta_categoria` para classificar por forma de pagamento.
export async function buscarRecebimentosAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-recebimentos', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de: filtros.data_de,
      data_ate: filtros.data_ate,
      // Contas extras a incluir no filtro `conta_creditar` (ex: contas
      // classificadas como sobra de caixa, que são receitas fora do
      // padrão 1.1.2.*).
      contas_creditar_extras: Array.isArray(filtros.contas_creditar_extras)
        ? filtros.contas_creditar_extras
        : [],
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar recebimentos');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.recebimentos) ? data.recebimentos : [];
}

// ─── Vendas (banco remoto Autosystem) ────────────────────────
// Filtros:
//   - empresaCodigos: array de empresa_codigo (grids) das empresas selecionadas
//   - data_de / data_ate: janela de datas (YYYY-MM-DD)
// Cada linha = 1 item vendido (não cancelado por DC).
export async function buscarVendasAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-vendas', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de: filtros.data_de,
      data_ate: filtros.data_ate,
      agregado: filtros.agregado === true,
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar vendas');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.vendas) ? data.vendas : [];
}

// ─── Vendas agregadas por (data, produto) ────────────────────
// Retorna uma linha por (empresa, data, produto) com quantidade, valor,
// custo, acréscimos (valor_desconto>0) e descontos (valor_desconto<0).
// Aceita `grupos_filtro` para restringir a um conjunto de grupos de produto
// (ex: somente combustíveis).
export async function buscarVendasDiariasAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-vendas', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de: filtros.data_de,
      data_ate: filtros.data_ate,
      por_dia: true,
      grupos_filtro: Array.isArray(filtros.grupos_filtro) ? filtros.grupos_filtro : [],
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar realizado diário');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.diario) ? data.diario : [];
}

// ─── Vendas agregadas por (mês, produto) ─────────────────────
// Usado pelo gráfico de evolução mensal por combustível. Aceita
// `grupos_filtro` para restringir aos produtos de um conjunto de grupos.
export async function buscarVendasMensalPorProdutoAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-vendas', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de: filtros.data_de,
      data_ate: filtros.data_ate,
      por_mes_produto: true,
      grupos_filtro: Array.isArray(filtros.grupos_filtro) ? filtros.grupos_filtro : [],
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar evolução mensal por produto');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.mensal_produto) ? data.mensal_produto : [];
}

// ─── Vendas agregadas por mês ────────────────────────────────
// Retorna 1 linha por mês (ano_mes='YYYY-MM') com sum(valor), sum(valor_custo)
// e sum(quantidade). Usado pelo gráfico de evolução dos últimos 12 meses.
export async function buscarVendasMensalAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-vendas', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de: filtros.data_de,
      data_ate: filtros.data_ate,
      por_mes: true,
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar evolução mensal');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.mensal) ? data.mensal : [];
}

// ─── Grupos de produto (banco remoto Autosystem) ─────────────
// Lê os grupos via Edge Function. Cliente classifica e persiste em
// as_rede_grupo_produto (ver `listarGruposProdutoRede` / `salvarGruposProdutoCategoria`).
export async function buscarGruposProdutoAutosystem(redeId) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  const { data, error } = await supabase.functions.invoke('autosystem-grupos-produto', {
    body: { rede_id: redeId },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar grupos de produto');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.grupos) ? data.grupos : [];
}

// Lista grupos já classificados no Supabase para esta rede.
export async function listarGruposProdutoRede(redeId) {
  if (!redeId) return [];
  const { data, error } = await supabase
    .from('as_rede_grupo_produto')
    .select('*')
    .eq('as_rede_id', redeId)
    .order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Upsert em lote dos grupos classificados. `grupos` = array de
//   { codigo, grid, nome, categoria }
// Grupos com `categoria` null/'' são removidos da tabela.
export async function salvarGruposProdutoCategoria(redeId, grupos) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  const valid = (grupos || []).filter(g => g && g.categoria && g.categoria !== '');
  const invalid = (grupos || []).filter(g => g && (!g.categoria || g.categoria === ''));

  if (valid.length > 0) {
    const payload = valid.map(g => ({
      as_rede_id: redeId,
      codigo: g.codigo != null ? Number(g.codigo) : null,
      grid: g.grid != null ? Number(g.grid) : null,
      nome: g.nome || '—',
      categoria: g.categoria,
    }));
    const { error } = await supabase
      .from('as_rede_grupo_produto')
      .upsert(payload, { onConflict: 'as_rede_id,codigo' });
    if (error) throw error;
  }

  // Remove categorizações antigas para grupos que foram "desmarcados"
  if (invalid.length > 0) {
    const codigos = invalid
      .filter(g => g.codigo != null)
      .map(g => Number(g.codigo));
    if (codigos.length > 0) {
      const { error } = await supabase
        .from('as_rede_grupo_produto')
        .delete()
        .eq('as_rede_id', redeId)
        .in('codigo', codigos);
      if (error) throw error;
    }
  }
}

// ─── Sangrias do dia (banco remoto Autosystem) ───────────────
// Retorna registros individuais de sangria (uma por linha) para a
// empresa+data informada. O front é responsável por agregar por
// funcionário (`pessoa_codigo`/`pessoa_nome`).
export async function buscarSangriasDia(redeId, empresaCodigo, data) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (empresaCodigo == null || empresaCodigo === '') {
    throw new Error('Esta empresa ainda não foi vinculada ao Autosystem (empresa_codigo vazio).');
  }
  if (!data) throw new Error('data é obrigatório (YYYY-MM-DD)');
  const { data: payload, error } = await supabase.functions.invoke('autosystem-sangrias-dia', {
    body: { rede_id: redeId, empresa_codigo: empresaCodigo, data },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar sangrias');
  if (payload?.error) throw new Error(payload.detail || payload.error);
  return Array.isArray(payload?.sangrias) ? payload.sangrias : [];
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
