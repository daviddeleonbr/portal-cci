// Conferência de recebimentos (portal do cliente): total recebido no dia, por
// forma de pagamento, para UMA empresa — mesma base da Conciliação de caixas
// da CCI (BpoConciliacaoCaixas):
//   Webposto  → fechamento de caixa do Webposto (CARTAO + CAIXA_APRESENTADO),
//               que reflete as correções da conferência; caixas abertos caem
//               na VENDA_FORMA_PAGAMENTO. Ver webposto() abaixo.
//   Autosystem→ movto via autosystem-recebimentos; uma linha por conta de
//               recebimento (conta_debitar), com a categoria da rede.
// Ao confirmar, grava em cliente_conferencia_recebimentos (migration 206).

import { supabase } from '../lib/supabase';
import * as mapService from './mapeamentoService';
import * as qualityApi from './qualityApiService';
import * as autosystemService from './autosystemService';

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

function classificarForma(nome) {
  const n = String(nome || '').toUpperCase();
  if (/DINHEIRO|ESPECIE|ESPÉCIE/.test(n)) return 'dinheiro';
  if (/CARTAO|CARTÃO|CREDITO|DEBITO|DÉBITO|CRÉDITO|PIX/.test(n)) return 'cartao';
  if (/CHEQUE/.test(n)) return 'cheque';
  return 'outros';
}
const ORDEM_TIPO = { dinheiro: 0, cartao: 1, cheque: 2, a_prazo: 3, outros: 4 };
export const ROTULO_TIPO = { dinheiro: 'Dinheiro', cartao: 'Cartões / PIX', cheque: 'Cheque', a_prazo: 'A prazo', outros: 'Outros' };

function ordenar(lista) {
  return lista
    .map(i => ({ ...i, sistema: r2(i.sistema) }))
    .filter(i => Math.abs(i.sistema) >= 0.005)
    .sort((a, b) => (ORDEM_TIPO[a.tipo] ?? 9) - (ORDEM_TIPO[b.tipo] ?? 9) || a.rotulo.localeCompare(b.rotulo));
}

// Categorias do fechamento de caixa (CAIXA_APRESENTADO, campo `<campo>Apurado`;
// o 4º item, quando há, troca o campo lido). Dinheiro usa o APRESENTADO (o que
// o operador entregou na gaveta), não o apurado pelo sistema.
// Cartão fica de fora: vem detalhado por administradora do endpoint CARTAO.
const CAMPOS_CAIXA = [
  ['dinheiro', 'DINHEIRO', 'dinheiro', 'dinheiroApresentado'],
  ['notaPrazo', 'NOTA A PRAZO', 'a_prazo'],
  ['cheque', 'CHEQUE', 'cheque'],
  ['chequePre', 'CHEQUE PRÉ', 'cheque'],
  ['cartaFrete', 'CARTA FRETE', 'outros'],
  ['valeCliente', 'VALE CLIENTE', 'outros'],
  ['prePag', 'PRÉ-PAGO', 'outros'],
  ['transfBanc', 'TRANSFERÊNCIA BANCÁRIA', 'outros'],
  ['transfDeb', 'TRANSFERÊNCIA (DÉBITO)', 'outros'],
  ['emprestimo', 'EMPRÉSTIMO', 'outros'],
  ['valeFun', 'VALE FUNCIONÁRIO', 'outros'],
  ['despesa', 'DESPESAS DO CAIXA', 'outros'],
  ['chequePagar', 'CHEQUE A PAGAR', 'outros'],
  ['fundoCxDeb', 'FUNDO DE CAIXA', 'outros'],
];

// Webposto: segue o FECHAMENTO DE CAIXA do Webposto, que reflete as correções
// feitas na conferência (ex.: PIX trocado p/ "CIELO - PIX", dinheiro lançado
// como despesa). VENDA_FORMA_PAGAMENTO guarda só a forma ORIGINAL da venda.
//   - cartões/PIX por administradora → CARTAO do dia (inclui os "Manualmente")
//   - caixas fechados → `*Apurado` do CAIXA_APRESENTADO por categoria
//     (dinheiro: `dinheiroApresentado`)
//   - caixas ainda abertos → VENDA_FORMA_PAGAMENTO (só formas sem administradora)
async function webposto(cliente, data) {
  const chaves = await mapService.listarChavesApi();
  const chave = chaves.find(c => c.id === cliente.chave_api_id)?.chave;
  if (!chave) throw new Error('Chave da API não encontrada para esta empresa.');
  const filtros = { dataInicial: data, dataFinal: data, empresaCodigo: cliente.empresa_codigo };
  const [vendas, formas, adms, cartoes, caixas, apresentados] = await Promise.all([
    qualityApi.buscarVendas(chave, { ...filtros, situacao: 'A' }),
    qualityApi.buscarVendaFormaPagamento(chave, filtros),
    qualityApi.buscarAdministradoras(chave).catch(() => []),
    qualityApi.buscarCartoes(chave, filtros),
    qualityApi.buscarCaixas(chave, filtros).catch(() => []),
    qualityApi.buscarCaixasApresentados(chave, filtros).catch(() => []),
  ]);
  const nomeAdm = new Map((adms || []).map(a => [Number(a.administradoraCodigo ?? a.codigo), a.descricao || a.nome]));
  const grupos = new Map();
  const somar = (chaveG, rotulo, tipo, valor) => {
    const g = grupos.get(chaveG) || { chave: chaveG, rotulo, tipo, sistema: 0 };
    g.sistema += Number(valor || 0);
    grupos.set(chaveG, g);
  };

  // Cartões / PIX por administradora (já com as correções da conferência).
  (cartoes || []).forEach(c => {
    const adm = Number(c.administradoraCodigo);
    somar(`adm:${adm}`, c.adiministradoraDescricao || c.administradoraDescricao || nomeAdm.get(adm) || `Administradora ${adm}`, 'cartao', c.valor);
  });

  // Caixas fechados: valores apurados no fechamento.
  const fechados = new Set((caixas || []).filter(c => c.fechado).map(c => Number(c.caixaCodigo)));
  const apurFechados = (apresentados || []).filter(a => fechados.has(Number(a.caixaCodigo)));
  const caixasComApurado = new Set(apurFechados.map(a => Number(a.caixaCodigo)));
  apurFechados.forEach(a => {
    CAMPOS_CAIXA.forEach(([campo, rotulo, tipo, lido]) => {
      const v = Number(a[lido || `${campo}Apurado`] || 0);
      if (v) somar(`caixa:${campo}`, rotulo, tipo, v);
    });
  });

  // Caixas abertos (sem fechamento): formas da venda, exceto cartão/PIX de
  // administradora (esses já vieram do CARTAO).
  const caixaDaVenda = new Map((vendas || []).filter(v => v.cancelada !== 'S')
    .map(v => [v.vendaCodigo ?? v.codigo, Number(v.caixaCodigo)]));
  (formas || []).forEach(fp => {
    if (!caixaDaVenda.has(fp.vendaCodigo)) return;
    if (caixasComApurado.has(caixaDaVenda.get(fp.vendaCodigo))) return;
    if (fp.administradoraCodigo != null) return;
    const tipo = classificarForma(fp.nomeFormaPagamento);
    const nome = String(fp.nomeFormaPagamento || 'OUTROS').toUpperCase();
    const campo = tipo === 'dinheiro' ? 'dinheiro' : /PRAZO/.test(nome) ? 'notaPrazo' : null;
    if (campo) {
      const [, rotulo, t] = CAMPOS_CAIXA.find(c => c[0] === campo);
      somar(`caixa:${campo}`, rotulo, t, fp.valorPagamento);
    } else {
      somar(`forma:${nome}`, fp.nomeFormaPagamento || 'Outros', tipo, fp.valorPagamento);
    }
  });
  return ordenar([...grupos.values()]);
}

async function autosystem(cliente, data) {
  const redeId = cliente.as_rede_id;
  const categorias = await autosystemService.listarContasCategorizadasRede(redeId);
  const catPorConta = new Map(categorias.map(c => [String(c.codigo), c]));
  const sobras = categorias.filter(c => c.categoria === 'sobra_caixa').map(c => String(c.codigo));
  const [receb, contas] = await Promise.all([
    autosystemService.buscarRecebimentosAutosystem(redeId, [cliente.empresa_codigo],
      { data_de: data, data_ate: data, contas_creditar_extras: sobras }),
    autosystemService.buscarContasAutosystem(redeId).catch(() => []),
  ]);
  const nomeConta = new Map((contas || []).map(c => [String(c.codigo), c.nome || c.descricao]));
  const grupos = new Map();
  (receb || []).forEach(r => {
    // Sobra/falta de caixa não são forma de recebimento.
    if (catPorConta.get(String(r.conta_creditar))?.categoria === 'sobra_caixa') return;
    const cod = String(r.modo_recebimento || 'sem-conta');
    const cat = catPorConta.get(cod);
    if (cat?.categoria === 'sobra_caixa' || cat?.categoria === 'falta_caixa') return;
    const tipo = cat?.categoria === 'cartao_pix' ? 'cartao' : (cat?.categoria || 'outros');
    const g = grupos.get(cod) || { chave: `conta:${cod}`, rotulo: cat?.nome || nomeConta.get(cod) || `Conta ${cod}`, tipo, sistema: 0 };
    g.sistema += Number(r.valor || 0);
    grupos.set(cod, g);
  });
  return ordenar([...grupos.values()]);
}

// [{ chave, rotulo, tipo, sistema }] do dia, para a empresa.
export async function carregarRecebimentosDia(cliente, data, tipoCliente, { forcar = false } = {}) {
  if (forcar) qualityApi.limparCacheTransacional(); // "Recarregar": ignora o cache de 5 min
  return tipoCliente === 'autosystem' ? autosystem(cliente, data) : webposto(cliente, data);
}

// Todas as formas de recebimento possíveis da empresa — p/ o usuário ADICIONAR
// uma forma que não teve lançamento no dia (linha com Sistema = 0). Mesmo
// esquema de chave das linhas do dia (adm:<cod> / caixa:<campo> no Webposto,
// conta:<cod> no Autosystem): se depois o sistema passar a ter lançamento
// nela, a linha casa pela chave e vira a linha normal do sistema.
export async function listarFormasRecebimento(cliente, tipoCliente) {
  let lista;
  if (tipoCliente === 'autosystem') {
    const cats = await autosystemService.listarContasCategorizadasRede(cliente.as_rede_id);
    lista = cats
      .filter(c => c.categoria && c.categoria !== 'sobra_caixa' && c.categoria !== 'falta_caixa')
      .map(c => ({ chave: `conta:${c.codigo}`, rotulo: c.nome || `Conta ${c.codigo}`, tipo: c.categoria === 'cartao_pix' ? 'cartao' : c.categoria }));
  } else {
    const chaves = await mapService.listarChavesApi();
    const chave = chaves.find(c => c.id === cliente.chave_api_id)?.chave;
    const adms = chave ? await qualityApi.buscarAdministradoras(chave).catch(() => []) : [];
    lista = [
      ...CAMPOS_CAIXA.map(([campo, rotulo, tipo]) => ({ chave: `caixa:${campo}`, rotulo, tipo })),
      ...(adms || []).map(a => {
        const cod = Number(a.administradoraCodigo ?? a.codigo);
        return { chave: `adm:${cod}`, rotulo: a.descricao || a.nome || `Administradora ${cod}`, tipo: 'cartao' };
      }),
    ];
  }
  return lista.sort((a, b) => (ORDEM_TIPO[a.tipo] ?? 9) - (ORDEM_TIPO[b.tipo] ?? 9) || a.rotulo.localeCompare(b.rotulo));
}

// ─── Gravação / consulta ─────────────────────────────────────────
const COLS = 'id, cliente_id, data, itens, total_sistema, total_conferido, total_diferenca, observacoes, confirmado_em, confirmado_por';

export async function buscarConferencia(clienteId, data) {
  const { data: row, error } = await supabase.from('cliente_conferencia_recebimentos')
    .select(COLS).eq('cliente_id', clienteId).eq('data', data).maybeSingle();
  if (error) throw error;
  return row;
}

export async function listarConferencias({ clienteIds, de, ate }) {
  if (!clienteIds?.length) return [];
  let q = supabase.from('cliente_conferencia_recebimentos').select(COLS)
    .in('cliente_id', clienteIds).order('data', { ascending: false });
  if (de) q = q.gte('data', de);
  if (ate) q = q.lte('data', ate);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// itens: [{ chave, rotulo, tipo, sistema, conferido }]
export async function salvarConferencia({ cliente, data, itens, observacoes, confirmadoPor }) {
  const linhas = itens.map(i => {
    const conferido = r2(i.conferido);
    return {
      chave: i.chave, rotulo: i.rotulo, tipo: i.tipo, sistema: r2(i.sistema), conferido, diferenca: r2(conferido - r2(i.sistema)),
      ...(i.adicionada ? { adicionada: true } : {}), // forma sem lançamento no sistema, incluída pelo usuário
    };
  });
  const total_sistema = r2(linhas.reduce((s, i) => s + i.sistema, 0));
  const total_conferido = r2(linhas.reduce((s, i) => s + i.conferido, 0));
  const { data: row, error } = await supabase.from('cliente_conferencia_recebimentos').insert({
    cliente_id: cliente.id, empresa_codigo: cliente.empresa_codigo ?? null, data,
    itens: linhas, total_sistema, total_conferido, total_diferenca: r2(total_conferido - total_sistema),
    observacoes: observacoes || null, confirmado_por: confirmadoPor || null,
  }).select(COLS).single();
  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) throw new Error('Este dia já foi conferido por outro usuário. Recarregue.');
    throw error;
  }
  return row;
}

// ─── Rascunho (salva o "Conferido" parcial para terminar depois) ─────
// valores: { [chave]: texto }. ocorrencias (coluna da migration 209): as formas
// ADICIONADAS pelo usuário [{ chave, rotulo, tipo }] — o conferido delas fica
// em `valores` pela mesma chave. Apagado no servidor ao confirmar.
const COLS_RASCUNHO = 'cliente_id, data, valores, ocorrencias, observacoes, atualizado_em, atualizado_por';

export async function buscarRascunho(clienteId, data) {
  const { data: row, error } = await supabase.from('cliente_conferencia_recebimentos_rascunho')
    .select(COLS_RASCUNHO).eq('cliente_id', clienteId).eq('data', data).maybeSingle();
  if (error) throw error;
  return row;
}

export async function salvarRascunho({ clienteId, data, itens, observacoes, atualizadoPor }) {
  const adicionadas = itens.filter(i => i.adicionada).map(({ chave, rotulo, tipo }) => ({ chave, rotulo, tipo }));
  const valores = {};
  itens.forEach(i => { const v = String(i.conferido ?? '').trim(); if (v) valores[i.chave] = v; });
  const { data: row, error } = await supabase.from('cliente_conferencia_recebimentos_rascunho')
    .upsert({ cliente_id: clienteId, data, valores, ocorrencias: adicionadas, observacoes: observacoes || null, atualizado_por: atualizadoPor || null },
      { onConflict: 'cliente_id,data' })
    .select(COLS_RASCUNHO).single();
  if (error) throw error;
  return row;
}

export async function excluirRascunho(clienteId, data) {
  const { error } = await supabase.from('cliente_conferencia_recebimentos_rascunho')
    .delete().eq('cliente_id', clienteId).eq('data', data);
  if (error) throw error;
}
