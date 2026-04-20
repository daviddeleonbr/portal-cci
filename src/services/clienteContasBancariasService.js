import { supabase } from '../lib/supabase';

// Classificacao das contas bancarias por REDE (chave_api).
// O Quality disponibiliza as contas a nivel de rede, portanto uma unica
// configuracao vale para todas as empresas da rede.

export const TIPOS_CONTA = [
  { key: 'bancaria',    label: 'Conta bancaria',               hint: 'Aparece na conciliacao bancaria e no fluxo de caixa', incluir: true },
  { key: 'aplicacao',   label: 'Conta aplicacao',              hint: 'Aparece na conciliacao bancaria (nao entra no fluxo)', incluir: true },
  { key: 'caixa',       label: 'Conta caixa',                  hint: 'Caixa administrativo + fluxo de caixa',               incluir: false },
  { key: 'recebimento', label: 'Conta recebimento (adquirente)', hint: 'PagPix, Cielo, Brinks etc — entradas de cliente no fluxo', incluir: false },
  { key: 'outras',      label: 'Outras contas',                hint: 'Oculta em todos os relatorios',                        incluir: false },
];

export const TIPOS_PARA_CONCILIACAO = TIPOS_CONTA.filter(t => t.incluir).map(t => t.key);
export const TIPOS_PARA_CAIXA_ADMIN = ['caixa'];
export const TIPOS_PARA_FLUXO_CAIXA = ['bancaria', 'caixa', 'recebimento'];

// Lista classificacoes de uma rede (chave_api)
export async function listarPorRede(chaveApiId) {
  if (!chaveApiId) return [];
  const { data, error } = await supabase
    .from('cliente_contas_bancarias')
    .select('*')
    .eq('chave_api_id', chaveApiId)
    .order('conta_codigo', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Upsert unitario (usa chave (chave_api_id, conta_codigo))
export async function upsert({ chave_api_id, conta_codigo, descricao, tipo, ativo }) {
  const payload = {
    chave_api_id,
    conta_codigo: Number(conta_codigo),
    descricao: descricao || null,
    tipo: tipo || 'bancaria',
    ativo: ativo !== false,
  };
  const { data, error } = await supabase
    .from('cliente_contas_bancarias')
    .upsert(payload, { onConflict: 'chave_api_id,conta_codigo' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Atualiza apenas campos passados de um registro existente pelo id
export async function atualizar(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.chave_api_id;
  delete payload.conta_codigo;
  delete payload.created_at;
  delete payload.updated_at;
  const { data, error } = await supabase
    .from('cliente_contas_bancarias')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Sincroniza com a lista vinda do endpoint CONTA do Quality:
//  - cria (default 'bancaria') para contas ainda nao classificadas
//  - atualiza descricao se mudou
//  - NAO apaga as existentes (preserva classificacao do admin)
export async function sincronizarComQuality(chaveApiId, contasQuality) {
  if (!chaveApiId || !Array.isArray(contasQuality)) return [];
  const existentes = await listarPorRede(chaveApiId);
  const mapaExistentes = new Map(existentes.map(r => [r.conta_codigo, r]));

  const novos = [];
  for (const c of contasQuality) {
    const codigo = c.contaCodigo ?? c.codigo;
    if (codigo == null) continue;
    const descricao = c.descricao || c.nome || c.contaDescricao || null;
    const existente = mapaExistentes.get(codigo);
    if (!existente) {
      novos.push({ chave_api_id: chaveApiId, conta_codigo: codigo, descricao, tipo: 'bancaria', ativo: true });
    } else if (descricao && existente.descricao !== descricao) {
      await atualizar(existente.id, { descricao });
    }
  }
  if (novos.length) {
    const { error } = await supabase.from('cliente_contas_bancarias').insert(novos);
    if (error) throw error;
  }
  return listarPorRede(chaveApiId);
}
