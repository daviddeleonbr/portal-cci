import { supabase } from '../lib/supabase';

export async function listarClientes() {
  const { data, error } = await supabase
    .from('clientes')
    .select('*, chaves_api(id, nome, provedor)')
    .order('nome', { ascending: true });
  if (error) throw error;
  return data;
}

export async function buscarCliente(id) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*, chaves_api(id, nome, provedor), empresas_api(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function criarCliente(campos) {
  const { data, error } = await supabase
    .from('clientes')
    .insert(campos)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function criarClientesBatch(clientes) {
  const { data, error } = await supabase
    .from('clientes')
    .insert(clientes)
    .select();
  if (error) throw error;
  return data;
}

export async function atualizarCliente(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.chaves_api;
  delete payload.empresas_api;

  const { data, error } = await supabase
    .from('clientes')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirCliente(id) {
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) throw error;
}
