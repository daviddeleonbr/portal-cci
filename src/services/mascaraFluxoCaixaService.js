import { supabase } from '../lib/supabase';

// ===================== MODELOS PADRAO IFRS =====================
// Templates pre-definidos de mascara de fluxo de caixa em linguagem simples.
// Estrutura aninhada: cada no tem { nome, tipo, sinal, children? }.
// Pais sao criados antes dos filhos (respeitando parent_id).

const TEMPLATE_INDIRETO = {
  nome: 'Modelo Padrao - Metodo Indireto',
  descricao: 'Parte do Lucro Liquido / Prejuizo e ajusta ate chegar na variacao de caixa do periodo. Padrao IFRS (CPC-03).',
  grupos: [
    {
      nome: '1. ATIVIDADES OPERACIONAIS', tipo: 'grupo', sinal: 1,
      children: [
        { nome: 'Lucro Liquido / Prejuizo do periodo', tipo: 'entrada', sinal: 1 },
        {
          nome: 'Ajustes que nao mexeram no caixa', tipo: 'grupo', sinal: 1,
          children: [
            { nome: 'Depreciacao e amortizacao', tipo: 'entrada', sinal: 1 },
            { nome: 'Provisoes e reversoes', tipo: 'entrada', sinal: 1 },
          ],
        },
        {
          nome: 'Variacao no capital de giro', tipo: 'grupo', sinal: 1,
          children: [
            { nome: 'Clientes (aumento diminui o caixa)', tipo: 'saida', sinal: -1 },
            { nome: 'Estoques (aumento diminui o caixa)', tipo: 'saida', sinal: -1 },
            { nome: 'Fornecedores (aumento aumenta o caixa)', tipo: 'entrada', sinal: 1 },
          ],
        },
      ],
    },
    { nome: '= Caixa gerado pelas operacoes', tipo: 'subtotal', sinal: 1 },

    {
      nome: '2. ATIVIDADES DE INVESTIMENTO', tipo: 'grupo', sinal: 1,
      children: [
        { nome: 'Compras de maquinas, moveis e imoveis', tipo: 'saida', sinal: -1 },
        { nome: 'Vendas de maquinas, moveis e imoveis', tipo: 'entrada', sinal: 1 },
      ],
    },
    { nome: '= Caixa usado em investimentos', tipo: 'subtotal', sinal: 1 },

    {
      nome: '3. ATIVIDADES DE FINANCIAMENTO', tipo: 'grupo', sinal: 1,
      children: [
        { nome: 'Emprestimos tomados', tipo: 'entrada', sinal: 1 },
        { nome: 'Pagamento de emprestimos', tipo: 'saida', sinal: -1 },
        { nome: 'Juros pagos', tipo: 'saida', sinal: -1 },
        { nome: 'Aporte dos socios', tipo: 'entrada', sinal: 1 },
        { nome: 'Retirada dos socios / dividendos', tipo: 'saida', sinal: -1 },
      ],
    },
    { nome: '= Caixa de financiamentos', tipo: 'subtotal', sinal: 1 },

    { nome: '= VARIACAO DE CAIXA NO PERIODO', tipo: 'resultado', sinal: 1 },
  ],
};

const TEMPLATE_DIRETO = {
  nome: 'Modelo Padrao - Metodo Direto',
  descricao: 'Mostra diretamente o dinheiro que entrou e saiu do caixa no periodo. Padrao IFRS (CPC-03).',
  grupos: [
    {
      nome: '1. ATIVIDADES OPERACIONAIS', tipo: 'grupo', sinal: 1,
      children: [
        {
          nome: 'Recebimentos (entradas de caixa)', tipo: 'grupo', sinal: 1,
          children: [
            { nome: 'Recebimentos de clientes', tipo: 'entrada', sinal: 1 },
            { nome: 'Outros recebimentos operacionais', tipo: 'entrada', sinal: 1 },
          ],
        },
        {
          nome: 'Pagamentos (saidas de caixa)', tipo: 'grupo', sinal: 1,
          children: [
            { nome: 'Pagamentos a fornecedores', tipo: 'saida', sinal: -1 },
            { nome: 'Salarios e encargos da equipe', tipo: 'saida', sinal: -1 },
            { nome: 'Impostos pagos', tipo: 'saida', sinal: -1 },
            { nome: 'Aluguel', tipo: 'saida', sinal: -1 },
            { nome: 'Agua, luz, internet e telefone', tipo: 'saida', sinal: -1 },
            { nome: 'Outros pagamentos operacionais', tipo: 'saida', sinal: -1 },
          ],
        },
      ],
    },
    { nome: '= Caixa gerado pelas operacoes', tipo: 'subtotal', sinal: 1 },

    {
      nome: '2. ATIVIDADES DE INVESTIMENTO', tipo: 'grupo', sinal: 1,
      children: [
        { nome: 'Compras de maquinas, moveis e imoveis', tipo: 'saida', sinal: -1 },
        { nome: 'Vendas de maquinas, moveis e imoveis', tipo: 'entrada', sinal: 1 },
        { nome: 'Rendimentos de aplicacoes financeiras', tipo: 'entrada', sinal: 1 },
      ],
    },
    { nome: '= Caixa usado em investimentos', tipo: 'subtotal', sinal: 1 },

    {
      nome: '3. ATIVIDADES DE FINANCIAMENTO', tipo: 'grupo', sinal: 1,
      children: [
        { nome: 'Emprestimos tomados', tipo: 'entrada', sinal: 1 },
        { nome: 'Pagamento de emprestimos', tipo: 'saida', sinal: -1 },
        { nome: 'Juros pagos', tipo: 'saida', sinal: -1 },
        { nome: 'Aporte dos socios', tipo: 'entrada', sinal: 1 },
        { nome: 'Retirada dos socios / dividendos', tipo: 'saida', sinal: -1 },
      ],
    },
    { nome: '= Caixa de financiamentos', tipo: 'subtotal', sinal: 1 },

    { nome: '= VARIACAO DE CAIXA NO PERIODO', tipo: 'resultado', sinal: 1 },
  ],
};

export const MODELOS_PADRAO = {
  indireto: TEMPLATE_INDIRETO,
  direto: TEMPLATE_DIRETO,
};


// ===================== MASCARAS =====================

export async function listarMascaras() {
  const { data, error } = await supabase
    .from('mascaras_fluxo_caixa')
    .select('*, grupos_fluxo_caixa(count)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function buscarMascara(id) {
  const { data, error } = await supabase
    .from('mascaras_fluxo_caixa')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function criarMascara({ nome, descricao }) {
  const { data, error } = await supabase
    .from('mascaras_fluxo_caixa')
    .insert({ nome, descricao })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarMascara(id, campos) {
  const { data, error } = await supabase
    .from('mascaras_fluxo_caixa')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirMascara(id) {
  const { error } = await supabase
    .from('mascaras_fluxo_caixa')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// Cria uma mascara pre-preenchida a partir de um modelo padrao.
// metodo: 'indireto' | 'direto'. nome opcional substitui o default do template.
export async function criarMascaraDoModeloPadrao(metodo, nomePersonalizado) {
  const template = MODELOS_PADRAO[metodo];
  if (!template) throw new Error(`Modelo padrao desconhecido: ${metodo}`);

  const mascara = await criarMascara({
    nome: (nomePersonalizado && nomePersonalizado.trim()) || template.nome,
    descricao: template.descricao,
  });

  // Insere os grupos respeitando a hierarquia (pai antes dos filhos)
  let ordem = 0;
  async function inserirNo(no, parentId) {
    ordem += 1;
    const ordemAtual = ordem;
    const criado = await criarGrupo({
      mascara_id: mascara.id,
      nome: no.nome,
      tipo: no.tipo,
      sinal: no.sinal,
      ordem: ordemAtual,
      parent_id: parentId,
    });
    if (no.children?.length) {
      for (const filho of no.children) {
        await inserirNo(filho, criado.id);
      }
    }
  }

  for (const raiz of template.grupos) {
    await inserirNo(raiz, null);
  }
  return mascara;
}

// ===================== GRUPOS =====================

export async function listarGrupos(mascaraId) {
  // Tenta trazer o count de mapeamentos; se a tabela auxiliar nao existir ainda,
  // cai para a versao simples (sem count).
  let { data, error } = await supabase
    .from('grupos_fluxo_caixa')
    .select('*, mapeamento_contas_fluxo(count)')
    .eq('mascara_id', mascaraId)
    .order('ordem', { ascending: true });

  if (error && /mapeamento_contas_fluxo/.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('grupos_fluxo_caixa')
      .select('*')
      .eq('mascara_id', mascaraId)
      .order('ordem', { ascending: true }));
  }

  if (error) throw error;
  return data;
}

export async function criarGrupo({ mascara_id, nome, tipo, sinal, ordem, parent_id, formula }) {
  const { data, error } = await supabase
    .from('grupos_fluxo_caixa')
    .insert({ mascara_id, nome, tipo, sinal, ordem, parent_id: parent_id || null, formula: formula || null })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarGrupo(id, campos) {
  const { data, error } = await supabase
    .from('grupos_fluxo_caixa')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirGrupo(id) {
  const { error } = await supabase
    .from('grupos_fluxo_caixa')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function reordenarGrupos(grupos) {
  const promises = grupos.map(({ id, ordem }) =>
    supabase.from('grupos_fluxo_caixa').update({ ordem }).eq('id', id)
  );
  const results = await Promise.all(promises);
  const err = results.find(r => r.error);
  if (err?.error) throw err.error;
}

// ===================== MAPEAMENTO =====================

export async function listarMapeamentos(grupoFluxoId) {
  const { data, error } = await supabase
    .from('mapeamento_contas_fluxo')
    .select('*')
    .eq('grupo_fluxo_id', grupoFluxoId)
    .order('conta_nome', { ascending: true });

  if (error) throw error;
  return data;
}

export async function listarTodosMapeamentos(mascaraId) {
  const { data, error } = await supabase
    .from('mapeamento_contas_fluxo')
    .select('*, grupos_fluxo_caixa!inner(mascara_id, nome)')
    .eq('grupos_fluxo_caixa.mascara_id', mascaraId);

  if (error) throw error;
  return data;
}

export async function criarMapeamento({ grupo_fluxo_id, conta_codigo, conta_nome }) {
  const { data, error } = await supabase
    .from('mapeamento_contas_fluxo')
    .insert({ grupo_fluxo_id, conta_codigo, conta_nome })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function criarMapeamentosBatch(mapeamentos) {
  const { data, error } = await supabase
    .from('mapeamento_contas_fluxo')
    .upsert(mapeamentos, { onConflict: 'grupo_fluxo_id,conta_codigo' })
    .select();

  if (error) throw error;
  return data;
}

export async function excluirMapeamento(id) {
  const { error } = await supabase
    .from('mapeamento_contas_fluxo')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function moverMapeamento(id, novoGrupoFluxoId) {
  const { data, error } = await supabase
    .from('mapeamento_contas_fluxo')
    .update({ grupo_fluxo_id: novoGrupoFluxoId })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ===================== MAPEAMENTO EMPRESA (Webposto) =====================
// Usado no fluxo Webposto: vincula codigo do plano gerencial da API
// aos grupos do fluxo de caixa de uma chave_api especifica.

export async function listarMapeamentosEmpresa(chaveApiId) {
  const { data, error } = await supabase
    .from('mapeamento_empresa_contas_fluxo')
    .select('*, grupos_fluxo_caixa(id, nome, tipo, mascara_id)')
    .eq('chave_api_id', chaveApiId);
  if (error) {
    // Tabela ainda nao migrada: retorna vazio para nao quebrar a UI
    if (error.code === '42P01' || /does not exist|mapeamento_empresa_contas_fluxo/i.test(error.message || '')) {
      console.warn('[fluxoService] mapeamento_empresa_contas_fluxo nao existe. Rode a migration 011_mapeamento_fluxo_caixa.sql no Supabase.');
      return [];
    }
    throw error;
  }
  return data;
}

export async function criarMapeamentosEmpresaBatch(chaveApiId, mapeamentos) {
  const rows = mapeamentos.map(m => ({
    chave_api_id: chaveApiId,
    grupo_fluxo_id: m.grupo_fluxo_id,
    plano_conta_codigo: m.plano_conta_codigo,
    plano_conta_descricao: m.plano_conta_descricao,
    plano_conta_hierarquia: m.plano_conta_hierarquia || null,
    plano_conta_natureza: m.plano_conta_natureza || null,
  }));
  const { data, error } = await supabase
    .from('mapeamento_empresa_contas_fluxo')
    .upsert(rows, { onConflict: 'chave_api_id,grupo_fluxo_id,plano_conta_codigo' })
    .select();
  if (error) {
    if (error.code === '42P01' || /does not exist|mapeamento_empresa_contas_fluxo/i.test(error.message || '')) {
      throw new Error('Tabela mapeamento_empresa_contas_fluxo nao encontrada. Execute a migration 011_mapeamento_fluxo_caixa.sql no Supabase (SQL Editor).');
    }
    throw error;
  }
  return data;
}

export async function excluirMapeamentoEmpresa(id) {
  const { error } = await supabase
    .from('mapeamento_empresa_contas_fluxo')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ===================== MAPEAMENTO MANUAL =====================

export async function listarContasManual(clienteId, mascaraId) {
  const { data, error } = await supabase
    .from('mapeamento_manual_contas_fluxo')
    .select('*, grupos_fluxo_caixa(id, nome, tipo, parent_id)')
    .eq('cliente_id', clienteId)
    .eq('mascara_id', mascaraId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listarContasManualDoCliente(clienteId) {
  const { data, error } = await supabase
    .from('mapeamento_manual_contas_fluxo')
    .select('*, grupos_fluxo_caixa(id, nome, tipo, mascara_id)')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function criarContaManual({ cliente_id, mascara_id, grupo_fluxo_id, conta_codigo, conta_descricao, conta_natureza, observacoes }) {
  const { data, error } = await supabase
    .from('mapeamento_manual_contas_fluxo')
    .insert({
      cliente_id, mascara_id, grupo_fluxo_id,
      conta_codigo: conta_codigo || null,
      conta_descricao, conta_natureza, observacoes,
    })
    .select('*, grupos_fluxo_caixa(id, nome, tipo)')
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarContaManual(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.grupos_fluxo_caixa;
  const { data, error } = await supabase
    .from('mapeamento_manual_contas_fluxo')
    .update(payload)
    .eq('id', id)
    .select('*, grupos_fluxo_caixa(id, nome, tipo)')
    .single();
  if (error) throw error;
  return data;
}

export async function excluirContaManual(id) {
  const { error } = await supabase.from('mapeamento_manual_contas_fluxo').delete().eq('id', id);
  if (error) throw error;
}
