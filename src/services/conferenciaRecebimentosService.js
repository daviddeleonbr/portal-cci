// Conferência de recebimentos (portal do cliente): total recebido no dia, por
// forma de pagamento, para UMA empresa — mesma base da Conciliação de caixas
// da CCI (BpoConciliacaoCaixas):
//   Webposto  → VENDA_FORMA_PAGAMENTO (só vendas aprovadas e não canceladas);
//               cartão/PIX separado por administradora; demais pelo nome da forma.
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

async function webposto(cliente, data) {
  const chaves = await mapService.listarChavesApi();
  const chave = chaves.find(c => c.id === cliente.chave_api_id)?.chave;
  if (!chave) throw new Error('Chave da API não encontrada para esta empresa.');
  const filtros = { dataInicial: data, dataFinal: data, empresaCodigo: cliente.empresa_codigo };
  const [vendas, formas, adms] = await Promise.all([
    qualityApi.buscarVendas(chave, { ...filtros, situacao: 'A' }),
    qualityApi.buscarVendaFormaPagamento(chave, filtros),
    qualityApi.buscarAdministradoras(chave).catch(() => []),
  ]);
  const aprovadas = new Set((vendas || []).filter(v => v.cancelada !== 'S').map(v => v.vendaCodigo ?? v.codigo));
  const nomeAdm = new Map((adms || []).map(a => [Number(a.administradoraCodigo ?? a.codigo), a.descricao || a.nome]));
  const grupos = new Map();
  (formas || []).forEach(fp => {
    if (!aprovadas.has(fp.vendaCodigo)) return;
    const tipo = classificarForma(fp.nomeFormaPagamento);
    const admCod = fp.administradoraCodigo != null ? Number(fp.administradoraCodigo) : null;
    const porAdm = admCod != null && tipo !== 'dinheiro';
    const chaveG = porAdm ? `adm:${admCod}` : `forma:${String(fp.nomeFormaPagamento || 'OUTROS').toUpperCase()}`;
    const rotulo = porAdm ? (nomeAdm.get(admCod) || `Administradora ${admCod}`) : (fp.nomeFormaPagamento || 'Outros');
    const g = grupos.get(chaveG) || { chave: chaveG, rotulo, tipo: porAdm ? 'cartao' : tipo, sistema: 0 };
    g.sistema += Number(fp.valorPagamento || 0);
    grupos.set(chaveG, g);
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
export async function carregarRecebimentosDia(cliente, data, tipoCliente) {
  return tipoCliente === 'autosystem' ? autosystem(cliente, data) : webposto(cliente, data);
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
    return { chave: i.chave, rotulo: i.rotulo, tipo: i.tipo, sistema: r2(i.sistema), conferido, diferenca: r2(conferido - r2(i.sistema)) };
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
