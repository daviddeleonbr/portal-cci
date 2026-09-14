import { supabase } from '../lib/supabase';

// Catálogo padrão de adquirentes e bandeiras (BPO → Conciliação de caixas).
// Usado como dropdown na configuração de "Contas de cartão".

export async function listarCatalogoCartao() {
  const { data, error } = await supabase
    .from('bpo_cartao_catalogo')
    .select('*')
    .order('tipo', { ascending: true })
    .order('nome', { ascending: true });
  if (error) throw error;
  const adquirentes = [], bandeiras = [], modalidades = [];
  (data || []).forEach(r => {
    if (r.tipo === 'adquirente') adquirentes.push(r);
    else if (r.tipo === 'bandeira') bandeiras.push(r);
    else if (r.tipo === 'modalidade') modalidades.push(r);
  });
  return { adquirentes, bandeiras, modalidades, todos: data || [] };
}

export async function adicionarCatalogoCartao(tipo, nome) {
  const n = String(nome || '').trim();
  if (!n) throw new Error('Informe o nome.');
  if (!['adquirente', 'bandeira', 'modalidade'].includes(tipo)) throw new Error('Tipo inválido.');
  const { data, error } = await supabase
    .from('bpo_cartao_catalogo')
    .insert({ tipo, nome: n })
    .select()
    .single();
  if (error) {
    if (String(error.message || '').match(/duplicate|unique/i)) throw new Error('Esse nome já existe.');
    throw error;
  }
  return data;
}

export async function removerCatalogoCartao(id) {
  const { error } = await supabase.from('bpo_cartao_catalogo').delete().eq('id', id);
  if (error) throw error;
}
