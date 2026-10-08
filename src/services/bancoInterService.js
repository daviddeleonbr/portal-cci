// Banco Inter — conta da PRÓPRIA CCI (Financeiro interno). Não é usado por clientes.
// Toda chamada à API do Inter passa pela Edge Function `inter-api` (mTLS +
// segredos no servidor). O extrato fica numa cópia local (`cci_inter_extrato`),
// lida direto via RLS (admin com a permissão 'banco_inter').

import { supabase } from '../lib/supabase';

async function chamar(acao, params = {}) {
  const { data, error } = await supabase.functions.invoke('inter-api', { body: { acao, ...params } });
  if (error) {
    let msg = error.message || 'Falha na integração com o Banco Inter';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (body?.error) msg = body.error;
      }
    } catch { /* mantém a mensagem genérica */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Dados da conta (sem segredos): client_id, validade do certificado, último teste...
export async function buscarConta() {
  const { conta } = await chamar('status');
  return conta;
}

// Salva a integração. Campos secretos vazios = mantém os já salvos.
// `ambiente`: 'sandbox' (testes, host uatinter) ou 'producao'.
export function salvarConfiguracao({ nome, ambiente, conta_corrente, client_id, client_secret, cert, key }) {
  return chamar('salvar_config', { nome, ambiente, conta_corrente, client_id, client_secret, cert, key });
}

export function testarConexao() {
  return chamar('testar');
}

// Saldo (disponivel, bloqueado..., limite). `data` opcional (YYYY-MM-DD).
export function buscarSaldo(data) {
  return chamar('saldo', data ? { data } : {});
}

// Busca o extrato no Inter e grava na cópia local. Retorna { transacoes }.
export function sincronizarExtrato(dataInicio, dataFim) {
  return chamar('sincronizar_extrato', { dataInicio, dataFim });
}

// Extrato da cópia local, por período (mais recente primeiro).
export async function listarExtrato({ dataInicial, dataFinal }) {
  let q = supabase
    .from('cci_inter_extrato')
    .select('id_transacao, data_transacao, data_inclusao, tipo_operacao, tipo_transacao, valor, titulo, descricao, detalhes')
    .order('data_transacao', { ascending: false })
    .order('data_inclusao', { ascending: false, nullsFirst: false });
  if (dataInicial) q = q.gte('data_transacao', dataInicial);
  if (dataFinal) q = q.lte('data_transacao', dataFinal);
  const { data, error } = await q.limit(10000);
  if (error) throw error;
  return data || [];
}

// ─── Boletos (Cobrança v3) — Contas a Receber da CCI ──────────────

// Busca os boletos no Inter (por vencimento) e grava a cópia local.
export function sincronizarBoletos(dataInicial, dataFinal) {
  return chamar('sincronizar_cobrancas', { dataInicial, dataFinal, filtrarDataPor: 'VENCIMENTO' });
}

// Emite um boleto (com Pix) no Inter. O pagador vem do cadastro do cliente
// (montado no servidor). `enviarEmail`: manda o e-mail de contato do cliente ao
// Inter, que envia o boleto ao pagador. Retorna { boleto }.
export function emitirBoleto({ cliente_id, valor, dataVencimento, seuNumero, mensagem, enviarEmail = false }) {
  return chamar('emitir_cobranca', { cliente_id, valor, dataVencimento, seuNumero, mensagem, enviarEmail });
}

// PDF do boleto (base64) — o Inter gera na hora.
export async function baixarPdfBoleto(codigoSolicitacao) {
  const { pdf } = await chamar('pdf_cobranca', { codigoSolicitacao });
  if (!pdf) throw new Error('O Inter não devolveu o PDF do boleto.');
  return pdf;
}

export function cancelarBoleto(codigoSolicitacao, motivo) {
  return chamar('cancelar_cobranca', { codigoSolicitacao, motivo });
}

// Boletos da cópia local, por vencimento (com o cliente vinculado).
export async function listarBoletos({ dataInicial, dataFinal }) {
  let q = supabase
    .from('cci_inter_cobranca')
    .select('codigo_solicitacao, seu_numero, cliente_id, pagador_nome, pagador_cpf_cnpj, data_emissao, data_vencimento, valor_nominal, situacao, data_situacao, valor_recebido, nosso_numero, linha_digitavel, emitido_por, cliente:clientes(id, nome, razao_social)')
    .order('data_vencimento', { ascending: false });
  if (dataInicial) q = q.gte('data_vencimento', dataInicial);
  if (dataFinal) q = q.lte('data_vencimento', dataFinal);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return data || [];
}
