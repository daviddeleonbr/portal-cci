import { supabase } from '../lib/supabase';

// ===================== CONFIG =====================

export async function buscarConfigAtiva() {
  const { data, error } = await supabase
    .from('configuracoes_asaas')
    .select('*')
    .eq('ativo', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listarConfigs() {
  const { data, error } = await supabase
    .from('configuracoes_asaas')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function salvarConfig(campos) {
  if (campos.id) {
    const { id, created_at, updated_at, ...payload } = campos;
    const { data, error } = await supabase
      .from('configuracoes_asaas')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('configuracoes_asaas')
      .insert(campos)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export async function excluirConfig(id) {
  const { error } = await supabase.from('configuracoes_asaas').delete().eq('id', id);
  if (error) throw error;
}

// ===================== CUSTOMERS (cache) =====================

export async function salvarCustomer(configId, { asaas_customer_id, cliente_nome, cliente_cnpj, email, phone }) {
  const { data, error } = await supabase
    .from('asaas_customers')
    .upsert({
      config_id: configId,
      asaas_customer_id,
      cliente_nome,
      cliente_cnpj,
      email,
      phone,
    }, { onConflict: 'config_id,asaas_customer_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listarCustomersCache(configId) {
  const { data, error } = await supabase
    .from('asaas_customers')
    .select('*')
    .eq('config_id', configId)
    .order('cliente_nome');
  if (error) throw error;
  return data;
}

// ===================== NOTAS FISCAIS (cache) =====================

export async function listarNotas(configId, { status, limit = 50 } = {}) {
  let q = supabase
    .from('notas_fiscais_asaas')
    .select('*')
    .eq('config_id', configId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function salvarNota(configId, asaasInvoice) {
  const payload = {
    config_id: configId,
    asaas_invoice_id: asaasInvoice.id,
    numero: asaasInvoice.number || null,
    cliente_nome: asaasInvoice.customerName || asaasInvoice.customer?.name || '',
    cliente_cnpj: asaasInvoice.customerCpfCnpj || asaasInvoice.customer?.cpfCnpj || null,
    valor: asaasInvoice.value || 0,
    valor_iss: asaasInvoice.taxes?.iss || 0,
    valor_pis: asaasInvoice.taxes?.pis || 0,
    valor_cofins: asaasInvoice.taxes?.cofins || 0,
    valor_inss: asaasInvoice.taxes?.inss || 0,
    valor_ir: asaasInvoice.taxes?.ir || 0,
    valor_csll: asaasInvoice.taxes?.csll || 0,
    data_emissao: asaasInvoice.effectiveDate || null,
    data_autorizacao: asaasInvoice.authorizationDate || null,
    status: asaasInvoice.status || 'PENDING',
    servico_descricao: asaasInvoice.serviceDescription || null,
    observacoes: asaasInvoice.observations || null,
    pdf_url: asaasInvoice.pdfUrl || null,
    xml_url: asaasInvoice.xmlUrl || null,
    erro_mensagem: asaasInvoice.statusDescription || null,
    raw_json: asaasInvoice,
  };

  const { data, error } = await supabase
    .from('notas_fiscais_asaas')
    .upsert(payload, { onConflict: 'config_id,asaas_invoice_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirNota(id) {
  const { error } = await supabase.from('notas_fiscais_asaas').delete().eq('id', id);
  if (error) throw error;
}
