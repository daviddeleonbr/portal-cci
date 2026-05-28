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

// ─── Contas caixa/banco (base do fluxo de caixa) ─────────────
// Marca quais contas do plano de contas Autosystem representam caixa/banco.
// O relatório de fluxo de caixa considera apenas lançamentos onde uma dessas
// contas aparece em conta_debitar OU conta_creditar; a contraparte define
// o grupo na máscara de fluxo.

export async function listarContasCaixaBancoRede(redeId) {
  if (!redeId) return [];
  const { data, error } = await supabase
    .from('as_rede_conta_caixa_banco')
    .select('*')
    .eq('as_rede_id', redeId)
    .order('codigo', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Replace-all: apaga as contas atuais da rede e insere a nova lista.
export async function salvarContasCaixaBanco(redeId, contas) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  const validas = (contas || [])
    .filter(c => c && c.codigo)
    .map(c => ({
      as_rede_id: redeId,
      codigo: String(c.codigo),
      nome: c.nome || null,
    }));

  const { error: delErr } = await supabase
    .from('as_rede_conta_caixa_banco')
    .delete()
    .eq('as_rede_id', redeId);
  if (delErr) throw delErr;

  if (validas.length === 0) return;

  const { error: insErr } = await supabase
    .from('as_rede_conta_caixa_banco')
    .insert(validas);
  if (insErr) throw insErr;
}

// ─── Lançamentos do movto por lista de contas ────────────────
// Retorna os movimentos onde `conta_debitar` OU `conta_creditar` esteja
// em `contas_codigos`. Usado pelo RelatorioDRE Autosystem pra popular as
// contas mapeadas em `mapeamento_manual_contas` (receitas e despesas).
export async function buscarLancamentosAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const contas = Array.isArray(filtros.contas_codigos) ? filtros.contas_codigos : [];
  if (contas.length === 0) return [];
  const { data, error } = await supabase.functions.invoke('autosystem-lancamentos', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de: filtros.data_de,
      data_ate: filtros.data_ate,
      contas_codigos: contas.map(c => String(c)),
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar lançamentos');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.lancamentos) ? data.lancamentos : [];
}

// ─── Fluxo de caixa Autosystem ────────────────────────────────
// Retorna lançamentos do movto onde uma das contas (debit/credit) é
// caixa/banco. A contraparte (a outra conta do lançamento) é o que o
// front classifica na máscara de fluxo. Transferências entre 2 contas
// caixa/banco são excluídas no SQL.
export async function buscarFluxoCaixaAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const caixa = Array.isArray(filtros.contas_caixa_banco) ? filtros.contas_caixa_banco : [];
  if (caixa.length === 0) return { lancamentos: [], saldosIniciais: {} };
  const { data, error } = await supabase.functions.invoke('autosystem-fluxo-caixa', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de: filtros.data_de,
      data_ate: filtros.data_ate,
      contas_caixa_banco: caixa.map(c => String(c)),
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar fluxo de caixa');
  if (data?.error) throw new Error(data.detail || data.error);
  return {
    lancamentos: Array.isArray(data?.lancamentos) ? data.lancamentos : [],
    saldosIniciais: data?.saldos_iniciais || {},
  };
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

// ─── Bombas + bicos (operação) ───────────────────────────────
// Retorna `{ bombas, bicos, uso_bicos }` para as empresas selecionadas.
// `bombas`: cada linha com grid, codigo, empresa, nr_serie, fabricante,
//   fabricante_nome (vindo do JOIN com pessoa), tipo, modelo.
// `bicos`: linhas brutas da tabela `bico` + deposito_* (JOIN com deposito).
// `uso_bicos`: quando `data_de`/`data_ate` são informados, agrega lancto
//   por (empresa, bico) com vendas_count, quantidade_total e valor_total.
export async function buscarBombasAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-bombas', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de:  filtros.data_de  || null,
      data_ate: filtros.data_ate || null,
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar bombas');
  if (data?.error) throw new Error(data.detail || data.error);
  return {
    bombas:            Array.isArray(data?.bombas)            ? data.bombas            : [],
    bicos:             Array.isArray(data?.bicos)             ? data.bicos             : [],
    uso_bicos:         Array.isArray(data?.uso_bicos)         ? data.uso_bicos         : [],
    litros_dia_semana: Array.isArray(data?.litros_dia_semana) ? data.litros_dia_semana : [],
    afericoes:         Array.isArray(data?.afericoes)         ? data.afericoes         : [],
  };
}

// ─── Produtividade por vendedor ──────────────────────────────
// Agrega vendas por vendedor + quebra por categoria (combustível, automotivos,
// conveniência). Os arrays `grupos_*` são as grids dos grupos de produto
// classificados naquela categoria via `as_rede_grupo_produto`.
export async function buscarProdutividadeAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-produtividade', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de:  filtros.data_de,
      data_ate: filtros.data_ate,
      grupos_combustivel:  Array.isArray(filtros.grupos_combustivel)  ? filtros.grupos_combustivel  : [],
      grupos_automotivos:  Array.isArray(filtros.grupos_automotivos)  ? filtros.grupos_automotivos  : [],
      grupos_conveniencia: Array.isArray(filtros.grupos_conveniencia) ? filtros.grupos_conveniencia : [],
      produtos_aditivada:  Array.isArray(filtros.produtos_aditivada)  ? filtros.produtos_aditivada  : [],
      produtos_comum:      Array.isArray(filtros.produtos_comum)      ? filtros.produtos_comum      : [],
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar produtividade');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.vendedores) ? data.vendedores : [];
}

// ─── Histórico de alterações em lançamentos (movto_flow) ─────
// Retorna `{ schema, alteracoes }` no período + empresas selecionadas.
// `schema` é a descrição das colunas da tabela `movto_flow` no banco remoto
// (information_schema.columns) — útil para o front detectar campos
// dinamicamente. `alteracoes` é o resultado bruto + contexto do movto
// original (ctx_*) e nome do funcionário (usuario_nome).
export async function buscarMovtoFlowAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-movto-flow', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de:  filtros.data_de,
      data_ate: filtros.data_ate,
      limit:    filtros.limit || 5000,
      contas_excluidas: Array.isArray(filtros.contas_excluidas)
        ? filtros.contas_excluidas
        : [],
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar alterações em caixas');
  if (data?.error) throw new Error(data.detail || data.error);
  return {
    schema:     Array.isArray(data?.schema)     ? data.schema     : [],
    alteracoes: Array.isArray(data?.alteracoes) ? data.alteracoes : [],
  };
}

// Lista usuários distintos (pgd_username) que aparecem em movto_flow no
// período + empresas selecionadas. Usado para popular o filtro de usuário
// da UI sem precisar carregar o resultado completo.
export async function buscarUsuariosMovtoFlowAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-movto-flow', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de:  filtros.data_de,
      data_ate: filtros.data_ate,
      mode: 'usuarios',
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao listar usuários');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.usuarios) ? data.usuarios : [];
}

// Lista usuários ORIGINAIS distintos (coluna `usuario` em movto_flow).
// Diferente do pgd_username (que é o login do log de auditoria) — `usuario`
// é o usuário do próprio lançamento.
export async function buscarUsuariosOriginaisMovtoFlowAutosystem(redeId, empresaCodigos, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    throw new Error('Selecione ao menos uma empresa.');
  }
  if (!filtros.data_de || !filtros.data_ate) {
    throw new Error('data_de e data_ate são obrigatórios.');
  }
  const { data, error } = await supabase.functions.invoke('autosystem-movto-flow', {
    body: {
      rede_id: redeId,
      empresa_codigos: empresaCodigos,
      data_de:  filtros.data_de,
      data_ate: filtros.data_ate,
      mode: 'usuarios_originais',
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao listar usuários originais');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.usuarios) ? data.usuarios : [];
}

// ─── Produtos de combustível disponíveis (para parametrizar MIX) ─────
// Lista produtos distintos vendidos nos últimos N dias dentro dos grupos
// classificados como combustível.
export async function buscarCombustiveisDisponiveisAutosystem(redeId, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  const { data, error } = await supabase.functions.invoke('autosystem-produtos-combustivel', {
    body: {
      rede_id: redeId,
      grupos_filtro: Array.isArray(filtros.grupos_filtro) ? filtros.grupos_filtro : [],
      dias: filtros.dias || 90,
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar combustíveis');
  if (data?.error) throw new Error(data.detail || data.error);
  return Array.isArray(data?.produtos) ? data.produtos : [];
}

// ─── Classificação de produtos para MIX (gasolina aditivada / comum) ─
export async function listarMixProdutos(redeId) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  const { data, error } = await supabase.rpc('as_rede_produto_mix_listar', { p_rede_id: redeId });
  if (error) throw new Error('Falha ao listar classificações de MIX: ' + error.message);
  return Array.isArray(data) ? data : [];
}

export async function salvarMixProdutos(redeId, classificacoes) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (!Array.isArray(classificacoes)) throw new Error('classificacoes deve ser array');
  // Cada item: { produto_codigo, produto_nome, tipo: 'aditivada' | 'comum' }
  const payload = classificacoes
    .filter(c => c && c.produto_codigo != null && (c.tipo === 'aditivada' || c.tipo === 'comum'))
    .map(c => ({
      produto_codigo: Number(c.produto_codigo),
      produto_nome:   String(c.produto_nome || ''),
      tipo:           c.tipo,
    }));
  const { error } = await supabase.rpc('as_rede_produto_mix_salvar', {
    p_rede_id: redeId,
    p_classificacoes: payload,
  });
  if (error) throw new Error('Falha ao salvar classificações: ' + error.message);
}

// ─── Detalhe de produtividade por vendedor ───────────────────
// Busca produtos vendidos por um vendedor específico no período + série
// mensal de automotivos (12 meses). Usado pelo painel expandido.
export async function buscarProdutividadeDetalheAutosystem(redeId, filtros = {}) {
  if (!redeId) throw new Error('rede_id é obrigatório');
  if (filtros.empresa_codigo == null)  throw new Error('empresa_codigo é obrigatório');
  if (filtros.vendedor_codigo == null) throw new Error('vendedor_codigo é obrigatório');
  if (!filtros.data_de || !filtros.data_ate) throw new Error('data_de e data_ate são obrigatórios.');
  const { data, error } = await supabase.functions.invoke('autosystem-produtividade-detalhe', {
    body: {
      rede_id: redeId,
      empresa_codigo:  filtros.empresa_codigo,
      vendedor_codigo: filtros.vendedor_codigo,
      data_de:  filtros.data_de,
      data_ate: filtros.data_ate,
      automotivos_data_de:  filtros.automotivos_data_de  || null,
      automotivos_data_ate: filtros.automotivos_data_ate || null,
      grupos_automotivos: Array.isArray(filtros.grupos_automotivos) ? filtros.grupos_automotivos : [],
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar detalhe do vendedor');
  if (data?.error) throw new Error(data.detail || data.error);
  return {
    produtos:           Array.isArray(data?.produtos)           ? data.produtos           : [],
    automotivos_mensal: Array.isArray(data?.automotivos_mensal) ? data.automotivos_mensal : [],
  };
}

// ─── Pares de produtos vendidos juntos (cesta de compras) ───
// Retorna pares { produto_a, produto_b } com count de transações em que
// apareceram juntos (mesmo mlid), valor somado e quantidade somada.
// Inclui também `total_transacoes` (mlids distintos no período) para support%.
export async function buscarParesCarrinhoAutosystem(redeId, empresaCodigos, filtros = {}) {
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
      pares_carrinho: true,
      grupos_filtro: Array.isArray(filtros.grupos_filtro) ? filtros.grupos_filtro : [],
    },
  });
  if (error) throw await _extrairErroFn(error, 'Falha ao buscar pares de cesta');
  if (data?.error) throw new Error(data.detail || data.error);
  return {
    pares: Array.isArray(data?.pares) ? data.pares : [],
    total_transacoes: Number(data?.total_transacoes) || 0,
  };
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
