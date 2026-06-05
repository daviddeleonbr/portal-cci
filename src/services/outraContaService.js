// ============================================================
// Service de Outras Contas a Pagar (BPO)
//
// Contas que o cliente precisa pagar mas não têm NF (adiantamentos,
// empréstimos, transferências etc). Cliente envia → admin marca como
// lançada ou devolve com motivo.
// ============================================================

import { supabase } from '../lib/supabase';

const BUCKET = 'outras-contas';

export const CATEGORIAS = [
  { key: 'adiantamento_fornecedor', label: 'Adiantamento a fornecedor' },
  { key: 'emprestimo',              label: 'Empréstimo (PF ou PJ)' },
  { key: 'transferencia',           label: 'Transferência entre empresas' },
  { key: 'taxa_avulsa',             label: 'Taxa / tarifa avulsa' },
  { key: 'reembolso',               label: 'Reembolso' },
  { key: 'outros',                  label: 'Outros' },
];

export const STATUS = [
  { key: 'enviada',   label: 'Aguardando lançamento', cor: 'blue' },
  { key: 'lancada',   label: 'Lançada no sistema',    cor: 'emerald' },
  { key: 'devolvida', label: 'Devolvida ao cliente',  cor: 'rose' },
];

// ─── Listagem ────────────────────────────────────────────────

export async function listarPorCliente(clienteId, { status } = {}) {
  if (!clienteId) return [];
  let q = supabase
    .from('outra_conta_pagar')
    .select('*, arquivos:outra_conta_arquivo(id)')
    .eq('cliente_id', clienteId)
    .order('data_pagamento', { ascending: false, nullsFirst: false })
    .order('created_at',     { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(enriquecer);
}

export async function listarParaAdmin({ status, chaveApiId, dataDe, dataAte } = {}) {
  let q = supabase
    .from('outra_conta_pagar')
    .select(`*,
      cliente:clientes(id, nome, cnpj, chave_api_id),
      arquivos:outra_conta_arquivo(id)`)
    .order('enviada_em', { ascending: false });

  if (Array.isArray(status)) q = q.in('status', status);
  else if (status)            q = q.eq('status', status);

  if (dataDe)  q = q.gte('data_pagamento', dataDe);
  if (dataAte) q = q.lte('data_pagamento', dataAte);

  const { data, error } = await q;
  if (error) throw error;
  let rows = (data || []).map(enriquecer);
  if (chaveApiId) rows = rows.filter(r => r.cliente?.chave_api_id === chaveApiId);
  return rows;
}

function enriquecer(row) {
  return { ...row, qtdArquivos: row.arquivos?.length ?? 0 };
}

export async function obter(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('outra_conta_pagar')
    .select(`*,
      cliente:clientes(id, nome, cnpj),
      arquivos:outra_conta_arquivo(*)`)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// ─── CRUD ─────────────────────────────────────────────────────

export async function criar(payload) {
  if (!payload.cliente_id)  throw new Error('cliente_id obrigatório');
  if (!payload.descricao || !payload.descricao.trim()) throw new Error('Descrição obrigatória');
  if (!(Number(payload.valor) > 0)) throw new Error('Informe um valor maior que zero');

  const insert = {
    cliente_id:             payload.cliente_id,
    categoria:              payload.categoria || 'outros',
    descricao:              payload.descricao.trim(),
    valor:                  Number(payload.valor),
    data_pagamento:         payload.data_pagamento || null,
    beneficiario_nome:      payload.beneficiario_nome?.trim() || null,
    beneficiario_documento: payload.beneficiario_documento?.replace(/\D/g, '') || null,
    beneficiario_tipo:      payload.beneficiario_tipo || null,
    forma_pagamento:        payload.forma_pagamento || null,
    observacao:             payload.observacao?.trim() || null,
    status: 'enviada',
    enviada_em: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('outra_conta_pagar')
    .insert(insert)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizar(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.cliente_id;
  delete payload.created_at;
  delete payload.updated_at;
  const { data, error } = await supabase
    .from('outra_conta_pagar')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluir(id) {
  const { error } = await supabase
    .from('outra_conta_pagar').delete().eq('id', id);
  if (error) throw error;
}

// ─── Arquivos ────────────────────────────────────────────────

export async function adicionarArquivo({ contaId, clienteId, file }) {
  if (!file) throw new Error('Arquivo obrigatório');
  const ts = Date.now();
  const seguro = sanitizar(file.name);
  const path = `${clienteId}/${contaId}/${ts}-${seguro}`;

  const { error: errUp } = await supabase.storage
    .from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (errUp) throw errUp;

  const { data, error } = await supabase
    .from('outra_conta_arquivo')
    .insert({
      outra_conta_id: contaId,
      storage_path: path,
      nome_original: file.name,
      tamanho_bytes: file.size,
      mime_type: file.type || null,
    })
    .select().single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data;
}

export async function urlAssinada(storagePath, expiresSec = 3600) {
  const { data, error } = await supabase.storage
    .from(BUCKET).createSignedUrl(storagePath, expiresSec);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function excluirArquivo(arq) {
  if (!arq?.id || !arq?.storage_path) return;
  const { error: errSt } = await supabase.storage.from(BUCKET).remove([arq.storage_path]);
  if (errSt && errSt.message && !/not found/i.test(errSt.message)) throw errSt;
  const { error } = await supabase.from('outra_conta_arquivo').delete().eq('id', arq.id);
  if (error) throw error;
}

function sanitizar(nome) {
  return String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

// ─── Transições de status ────────────────────────────────────

export async function marcarLancada(id, { adminUsuarioId }) {
  return atualizar(id, {
    status: 'lancada',
    lancada_em: new Date().toISOString(),
    lancada_por: adminUsuarioId || null,
    motivo_devolucao: null,
  });
}

export async function devolverParaCliente(id, { motivo, adminUsuarioId }) {
  if (!motivo || !motivo.trim()) throw new Error('Informe o motivo da devolução');
  return atualizar(id, {
    status: 'devolvida',
    devolvida_em: new Date().toISOString(),
    devolvida_por: adminUsuarioId || null,
    motivo_devolucao: motivo.trim(),
  });
}
