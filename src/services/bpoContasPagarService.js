// BPO · CONTAS A PAGAR — agenda de pagamentos + acompanhamento da autorização.
// Títulos: direto do ERP (a CCI lança lá). Webposto = TITULO_PAGAR (pendentes)
// da Quality; Autosystem = Edge Function autosystem-contas-pagar (em aberto).
// Status (incluída no banco / autorizada): tabela bpo_contas_pagar_status
// (migração 214). Sem linha = a incluir. Pago = some do ERP como pendente.
import { supabase } from '../lib/supabase';
import * as qualityApi from './qualityApiService';
import * as mapService from './mapeamentoService';
import * as autosystemService from './autosystemService';
import { vencimentoEfetivoIso } from '../utils/diasUteis';

const COLS = 'id, cliente_id, titulo_chave, status, vencimento, data_pagamento, valor, fornecedor, documento, observacao, incluida_em, incluida_por_nome, autorizada_em, autorizada_por_nome, updated_at';

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const iso10 = (v) => (v ? String(v).slice(0, 10) : null);

// ─── Normalização (mesmos campos p/ os dois ERPs) ────────────
// { chave, clienteId, empresaNome, vencimento, vencimentoEfetivo, valor,
//   fornecedor, documento, parcela, historico, conta, emissao }
function normalizarWebposto(t, emp, fornecedores) {
  const cod = t.tituloPagarCodigo ?? t.codigo ?? null;
  const fornCod = t.fornecedorCodigo ?? t.codigoFornecedor ?? t.pessoaCodigo ?? t.codigoPessoa ?? null;
  const venc = iso10(t.dataVencimento || t.vencimento || t.dataVenc || t.data_vencimento);
  const p = t.parcela ?? t.numeroParcela ?? t.parcelaAtual ?? null;
  const tot = t.totalParcelas ?? t.quantidadeParcelas ?? null;
  return {
    chave: cod != null ? String(cod) : null,
    clienteId: emp.id,
    empresaNome: emp.nome,
    vencimento: venc,
    vencimentoEfetivo: vencimentoEfetivoIso(venc) || venc,
    valor: num(t.valorSaldo ?? t.saldo ?? t.valorAberto ?? t.valorPendente ?? t.valor ?? t.valorTitulo ?? t.valorOriginal),
    fornecedor: t.fornecedorNome || t.fornecedor || t.nomeFornecedor || t.razao || t.razaoSocial || t.fantasia
      || (fornCod != null ? fornecedores.get(fornCod) : '') || 'Fornecedor',
    documento: String(t.numeroDocumento || t.documento || t.numeroTitulo || t.nrDocumento || t.nrTitulo || t.titulo || ''),
    parcela: p && tot ? `${p}/${tot}` : (p ? String(p) : ''),
    historico: t.historico || t.observacao || t.observacoes || t.descricao || '',
    conta: '',
    emissao: iso10(t.dataEmissao || t.emissao || t.dataCadastro || t.data_emissao),
  };
}

function normalizarAutosystem(t, emp) {
  const venc = iso10(t.vencto);
  return {
    chave: t.grid != null ? String(t.grid) : null,
    clienteId: emp.id,
    empresaNome: emp.nome,
    vencimento: venc,
    vencimentoEfetivo: vencimentoEfetivoIso(venc) || venc,
    valor: num(t.valor),
    fornecedor: t.pessoa_nome || 'Fornecedor',
    documento: String(t.documento || ''),
    parcela: '',
    historico: t.obs || '',
    conta: [t.motivo_nome, t.debito_nome].filter(Boolean).join(' · '),
    emissao: iso10(t.data),
  };
}

// Busca os títulos em aberto de várias empresas da MESMA rede.
// tipo 'webposto': empresas com chave_api_id + empresa_codigo.
// tipo 'autosystem': empresas com empresa_codigo (rede = emp.as_rede_id ou redeId).
// onProgresso(feitos, total) opcional. Devolve { titulos, erros: [texto] }.
export async function buscarTitulosErp({ tipo, empresas, redeId = null, onProgresso }) {
  const lista = (empresas || []).filter(e => e.empresa_codigo != null && e.empresa_codigo !== '');
  const erros = [];
  let feitos = 0;
  const tick = (total) => { feitos += 1; onProgresso?.(feitos, total); };

  if (tipo === 'autosystem') {
    const total = lista.length;
    onProgresso?.(0, total);
    const res = await Promise.allSettled(lista.map(emp =>
      autosystemService.buscarContasPagar(emp.as_rede_id || redeId, emp.empresa_codigo, {})
        .then(cs => cs.map(c => normalizarAutosystem(c, emp)))
        .finally(() => tick(total))));
    const titulos = [];
    res.forEach((r, i) => {
      if (r.status === 'fulfilled') titulos.push(...r.value);
      else erros.push(`${lista[i].nome}: ${r.reason?.message || 'falha'}`);
    });
    return { titulos: titulos.filter(t => t.chave), erros };
  }

  // Webposto: 1 fetch de fornecedores por chave + 1 de títulos por empresa
  const chaves = await mapService.listarChavesApi();
  const porId = new Map((chaves || []).map(c => [c.id, c]));
  const chavesIds = [...new Set(lista.map(e => e.chave_api_id).filter(Boolean))];
  const total = chavesIds.length + lista.length;
  onProgresso?.(0, total);

  const fornsPorChave = new Map(await Promise.all(chavesIds.map(async (id) => {
    const ch = porId.get(id);
    const mapa = new Map();
    if (ch) {
      const fs = await qualityApi.buscarFornecedoresQuality(ch.chave).catch(() => []);
      (fs || []).forEach(f => {
        const cod = f.fornecedorCodigo ?? f.codigo;
        if (cod != null) mapa.set(cod, f.razao || f.fantasia || f.nome || `Fornecedor #${cod}`);
      });
    }
    tick(total);
    return [id, mapa];
  })));

  const res = await Promise.allSettled(lista.map(async (emp) => {
    try {
      const ch = porId.get(emp.chave_api_id);
      if (!ch) throw new Error('chave da API Webposto não encontrada');
      const dados = await qualityApi.buscarTitulosPagar(ch.chave, { empresaCodigo: emp.empresa_codigo, apenasPendente: true });
      const forns = fornsPorChave.get(emp.chave_api_id) || new Map();
      return (dados || []).map(t => normalizarWebposto(t, emp, forns));
    } finally { tick(total); }
  }));
  const titulos = [];
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') titulos.push(...r.value);
    else erros.push(`${lista[i].nome}: ${r.reason?.message || 'falha'}`);
  });
  return { titulos: titulos.filter(t => t.chave), erros };
}

// ─── Status ──────────────────────────────────────────────────
const chaveStatus = (clienteId, tituloChave) => `${clienteId}|${tituloChave}`;
export { chaveStatus };

// Map "clienteId|tituloChave" → linha de status
export async function listarStatus(clienteIds) {
  const ids = (clienteIds || []).filter(Boolean);
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('bpo_contas_pagar_status')
    .select(COLS)
    .in('cliente_id', ids);
  if (error) throw error;
  return new Map((data || []).map(r => [chaveStatus(r.cliente_id, r.titulo_chave), r]));
}

// CCI: marca títulos como incluídos no banco (aguardando autorização).
// Guarda a foto do título (valor/vencimento/fornecedor/documento).
// t.dataPagamento: dia programado no banco (antecipa/posterga); null = no vencimento.
export async function marcarIncluidas(titulos, { usuarioNome = '', observacao = '' } = {}) {
  if (!titulos?.length) return [];
  const { data, error } = await supabase
    .from('bpo_contas_pagar_status')
    .upsert(titulos.map(t => ({
      cliente_id: t.clienteId,
      titulo_chave: t.chave,
      status: 'incluida',
      vencimento: t.vencimento,
      data_pagamento: t.dataPagamento || null,
      valor: t.valor,
      fornecedor: t.fornecedor,
      documento: t.documento || null,
      observacao: observacao?.trim()?.slice(0, 500) || null,
      incluida_por_nome: usuarioNome || null,
    })), { onConflict: 'cliente_id,titulo_chave' })
    .select(COLS);
  if (error) throw error;
  return data || [];
}

// CCI: muda a data de pagamento programada de títulos já incluídos.
// dataPagamento null = volta a pagar no vencimento.
export async function reprogramarPagamento(titulos, dataPagamento) {
  const porCliente = agruparPorCliente(titulos);
  const linhas = [];
  for (const [clienteId, chaves] of porCliente) {
    const { data, error } = await supabase
      .from('bpo_contas_pagar_status')
      .update({ data_pagamento: dataPagamento || null })
      .eq('cliente_id', clienteId)
      .in('titulo_chave', chaves)
      .select(COLS);
    if (error) throw error;
    linhas.push(...(data || []));
  }
  return linhas;
}

function agruparPorCliente(titulos) {
  const m = new Map();
  (titulos || []).forEach(t => {
    if (!m.has(t.clienteId)) m.set(t.clienteId, []);
    m.get(t.clienteId).push(t.chave);
  });
  return m;
}

// CCI: desfaz a inclusão (volta para "a incluir").
export async function desfazerInclusao(titulos) {
  const porCliente = new Map();
  (titulos || []).forEach(t => {
    if (!porCliente.has(t.clienteId)) porCliente.set(t.clienteId, []);
    porCliente.get(t.clienteId).push(t.chave);
  });
  for (const [clienteId, chaves] of porCliente) {
    const { error } = await supabase
      .from('bpo_contas_pagar_status')
      .delete()
      .eq('cliente_id', clienteId)
      .in('titulo_chave', chaves);
    if (error) throw error;
  }
}

// Cliente (ou CCI): marca como autorizada no banco, ou volta para aguardando.
// Só títulos que já estão incluídos (têm linha de status).
export async function definirAutorizacao(titulos, autorizada, { usuarioNome = '' } = {}) {
  const porCliente = new Map();
  (titulos || []).forEach(t => {
    if (!porCliente.has(t.clienteId)) porCliente.set(t.clienteId, []);
    porCliente.get(t.clienteId).push(t.chave);
  });
  const linhas = [];
  for (const [clienteId, chaves] of porCliente) {
    const { data, error } = await supabase
      .from('bpo_contas_pagar_status')
      .update({
        status: autorizada ? 'autorizada' : 'incluida',
        autorizada_por_nome: autorizada ? (usuarioNome || null) : null,
      })
      .eq('cliente_id', clienteId)
      .in('titulo_chave', chaves)
      .select(COLS);
    if (error) throw error;
    linhas.push(...(data || []));
  }
  return linhas;
}

// ─── Dias de pagamento por empresa (migração 216) ────────────
// Map clienteId → [dias da semana] (0=dom … 6=sáb). Sem linha/vazio = qualquer dia útil.
export async function listarDiasPagamento(clienteIds) {
  const ids = (clienteIds || []).filter(Boolean);
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('bpo_contas_pagar_config')
    .select('cliente_id, dias_pagamento')
    .in('cliente_id', ids);
  if (error) throw error;
  return new Map((data || []).map(r => [r.cliente_id, (r.dias_pagamento || []).map(Number).sort()]));
}

// CCI: itens [{ clienteId, dias: [0..6] }]
export async function salvarDiasPagamento(itens) {
  if (!itens?.length) return;
  const { error } = await supabase
    .from('bpo_contas_pagar_config')
    .upsert(itens.map(i => ({
      cliente_id: i.clienteId,
      dias_pagamento: [...new Set((i.dias || []).map(Number))].filter(d => d >= 0 && d <= 6).sort(),
    })), { onConflict: 'cliente_id' });
  if (error) throw error;
}
