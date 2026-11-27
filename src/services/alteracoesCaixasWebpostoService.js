// Alterações em caixas — redes WEBPOSTO (Quality V1/AUDITORIA). Busca e regras
// usadas pela aba "Alterações em caixas" e pelo Relatório geral.
import * as qualityApi from './qualityApiService';

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fmtDataHora = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ''}` : (iso || '—');
};
// Busca a auditoria do dia do caixa até hoje (alteração costuma vir dias
// depois), limitada a MAX_DIAS, e fica só com o que é do caixa daquele dia.
export const MAX_DIAS = 31;
export const somarDias = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };

// Tabelas que mexem no caixa (filtro padrão). As demais ficam disponíveis.
export const ehTabelaCaixa = (t) => /^caixa|^cart[ãa]o$|^cheque|^venda prazo$|^venda forma/i.test(t || '');

// "Campo: valor" por linha; "Antes:" / "Depois:" trocam o bloco.
export function parsearTextoAuditado(texto) {
  const ctx = {}; const antes = {}; const depois = {};
  let alvo = ctx;
  String(texto || '').split(/\r?\n/).forEach(l => {
    const s = l.trim();
    if (!s) return;
    if (/^antes:?$/i.test(s)) { alvo = antes; return; }
    if (/^depois:?$/i.test(s)) { alvo = depois; return; }
    const i = s.indexOf(':');
    if (i <= 0) { alvo[s] = ''; return; }
    alvo[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  });
  return { ctx, antes, depois };
}

// Rótulo do caixa/turno a partir do contexto do item.
export function caixaDoItem(ctx) {
  if (ctx.Caixa) return ctx.Caixa;                                     // "PDV, 001, 2º TURNO, 03/11/2026"
  if (ctx.PDV || ctx.Turno) return [ctx.PDV, ctx.Turno, ctx.Movimento].filter(Boolean).join(', ');
  return '';
}

// Detalhe expandido:
//  - inclusão: só o essencial (lançamento de caixa; cartão usa Administradora/Valor);
//  - exclusão: tudo, menos os identificadores técnicos.
export const CAMPOS_INCLUSAO = ['Plano de Conta', 'Histórico', 'Valor Total', 'Dinheiro', 'Administradora', 'Valor'];
export const OCULTOS_EXCLUSAO = new Set(['Referência Uuid', 'COO', 'Referência', 'Alterado']);
// Já aparecem nos grupos (funcionário) ou no título da linha (caixa).
export const JA_EXIBIDOS = new Set(['Caixa', 'Funcionário', 'PDV', 'Turno', 'Movimento']);
export function camposDetalhe(item) {
  const preenchidos = Object.entries(item.ctx).filter(([k, v]) => v !== '' && !JA_EXIBIDOS.has(k));
  if (item.operacao === 'INCLUIR') {
    return CAMPOS_INCLUSAO.filter(k => item.ctx[k]).map(k => [k, item.ctx[k]]);
  }
  if (item.operacao === 'EXCLUIR') return preenchidos.filter(([k]) => !OCULTOS_EXCLUSAO.has(k));
  // Alteração: o que mudou já está na tabela antes/depois — não repete.
  const mudou = new Set([...Object.keys(item.antes), ...Object.keys(item.depois)]);
  return preenchidos.filter(([k]) => !mudou.has(k) && !OCULTOS_EXCLUSAO.has(k));
}
// Campos alterados (sem os técnicos tipo "Alterado: Não → Sim").
export function camposAlterados(item) {
  return [...new Set([...Object.keys(item.antes), ...Object.keys(item.depois)])]
    .filter(c => !OCULTOS_EXCLUSAO.has(c) && (item.antes[c] || '') !== (item.depois[c] || ''));
}
export const TABELAS_OCULTAS = new Set(['Caixa Apresentado', 'Caixa']);

// "Cartão Remessa" é de uma etapa POSTERIOR ao fechamento: depois de conferidos, os
// cartões entram numa remessa quando o recebimento é feito. Não é alteração de caixa:
// o campo sai do item, e a alteração que só mexeu nele some (ver semRemessa).
const ehCampoRemessa = (campo) => /remessa/i.test(campo);
function semRemessa(item) {
  const limpar = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !ehCampoRemessa(k)));
  const mudouAlgo = Object.keys(item.antes).some(ehCampoRemessa) || Object.keys(item.depois).some(ehCampoRemessa);
  const limpo = { ...item, ctx: limpar(item.ctx), antes: limpar(item.antes), depois: limpar(item.depois) };
  if (!mudouAlgo || item.operacao !== 'ALTERAR') return limpo;
  return camposAlterados(limpo).length ? limpo : null; // só a remessa mudou → não é alteração
}

// Data do turno (movimento do caixa) → "2026-10-31" (p/ filtrar e ordenar).
export function dataTurnoDoItem(caixa) {
  const m = String(caixa || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
// "PDV, 001, 3º TURNO, 03/11/2026" → "3º TURNO · 03/11/2026 · PDV 001"
export function tituloCaixa(caixa) {
  const partes = String(caixa || '').split(',').map(x => x.trim()).filter(Boolean);
  if (partes.length >= 4 && /^PDV$/i.test(partes[0])) return `${partes[2]} · ${partes[3]} · PDV ${partes[1]}`;
  return caixa || 'Sem caixa vinculado';
}

// "Cartão ALTERAR" na auditoria só traz Autorização/Bandeira — sem caixa nem
// funcionário. Resolve pela Quality: CARTAO (autorização → venda) → VENDA
// (→ caixa) → CAIXA (turno, data, funcionário dono). Usa o rótulo de caixa
// da própria auditoria quando existe um com o mesmo turno/data.
export async function resolverCaixaCartoes(chave, empresaCodigo, de, ate, lista) {
  const pend = lista.filter(i => !i.caixa && i.ctx['Autorização']);
  if (!pend.length) return;
  const f = { dataInicial: de, dataFinal: ate, empresaCodigo };
  const [cartoes, vendas, caixas, funcs] = await Promise.all([
    qualityApi.buscarCartoes(chave, f),
    qualityApi.buscarVendas(chave, f),
    qualityApi.buscarCaixas(chave, f),
    qualityApi.buscarFuncionarios(chave).catch(() => []),
  ]);
  const vendaPorCod = new Map((vendas || []).map(v => [v.vendaCodigo ?? v.codigo, v]));
  const caixaPorCod = new Map((caixas || []).map(c => [c.caixaCodigo ?? c.codigo, c]));
  const nomeFunc = new Map((funcs || []).map(x => [x.funcionarioCodigo ?? x.codigo, x.nome]));
  const rotulos = [...new Set(lista.map(i => i.caixa).filter(Boolean))];
  pend.forEach(i => {
    const aut = String(i.ctx['Autorização']).trim();
    const adm = i.ctx.Bandeira || i.antes.Administradora || i.depois.Administradora || '';
    const candidatos = (cartoes || []).filter(c => String(c.autorizacao || '').trim() === aut);
    const cartao = candidatos.find(c => c.adiministradoraDescricao === adm || c.adiministradoraDescricao === i.depois.Administradora) || candidatos[0];
    const venda = cartao && vendaPorCod.get(cartao.vendaCodigo);
    const cx = venda && caixaPorCod.get(venda.caixaCodigo);
    if (!cx) return;
    const dataBR = String(cx.dataMovimento).slice(0, 10).split('-').reverse().join('/');
    i.caixa = rotulos.find(r => r.includes(cx.turno) && r.includes(dataBR)) || `${cx.turno}, ${dataBR}`;
    i.dataTurno = dataTurnoDoItem(i.caixa);
    // Funcionário = o da VENDA (é por ele que o Fechamento de Caixa Apresentado do
    // Webposto separa os cartões). O do CAIXA é só quem abriu o turno — num turno com
    // vários frentistas os cartões de todos caíam nele (Trivela 26/11: Thais × Gladson).
    i.donoQuality = nomeFunc.get(venda.funcionarioCodigo) || nomeFunc.get(cx.funcionarioCodigo) || '';
  });
}

// Itens alterados nos caixas do período `de`–`ate` (dia do movimento do caixa), em
// qualquer data posterior. Lança AUDITORIA_SEM_USUARIO se a chave não tiver usuário.
export async function buscarAlteracoesCaixasWebposto({ chave, empresaCodigo, de, ate }) {
  const fimBusca = [ymd(new Date()), somarDias(ate, MAX_DIAS - 1)].sort()[0];
  const eventos = await qualityApi.buscarAuditoria(chave, {
    dataInicial: de, dataFinal: fimBusca,
    filiais: [Number(empresaCodigo)], origens: ['RETAGUARDA'],
  });
  // Achata em itens (1 linha por tabela afetada), mantendo o evento pai.
  const lista = [];
  eventos.forEach(ev => {
    // O Webposto às vezes grava o MESMO item 2x no evento (ex.: "Caixa
    // ALTERAR" nas sequências 2 e 3 com texto idêntico) — é 1 alteração só.
    const vistos = new Set();
    (ev.itens || []).forEach((it, k) => {
    const assinatura = `${it.tabela}|${it.operacao}|${it.textoAuditado}`;
    if (vistos.has(assinatura)) return;
    vistos.add(assinatura);
    const p = parsearTextoAuditado(it.textoAuditado);
    lista.push({
      id: `${ev.auditoriaCodigo}:${it.sequencia ?? k}:${k}`,
      dataHora: ev.dataHoraEvento,
      usuario: ev.usuarioNome || (ev.usuarioCodigo != null ? `Usuário ${ev.usuarioCodigo}` : '—'),
      computador: ev.computador || '',
      tabela: it.tabela || '—',
      operacao: it.operacao,
      caixa: caixaDoItem(p.ctx),
      dataTurno: dataTurnoDoItem(caixaDoItem(p.ctx)),
      ...p,
      texto: it.textoAuditado || '',
    });
    });
  });
  // Sem os registros de remessa de cartão (etapa posterior ao fechamento)
  const semRemessas = lista.map(semRemessa).filter(Boolean);
  lista.length = 0; lista.push(...semRemessas);
  // Cartão alterado sem caixa no texto → descobre o caixa pela Quality.
  await resolverCaixaCartoes(chave, Number(empresaCodigo), de, ate, lista)
    .catch(e => console.warn('[alteracoes] falha ao resolver caixa dos cartões', e));
  // Funcionário: o do próprio registro; senão o dono do caixa/turno (o
  // "Caixa Apresentado" traz o funcionário do caixa; "Caixa" não traz).
  const donoCaixa = new Map();
  lista.forEach(i => {
    if (i.caixa && i.ctx['Funcionário'] && (i.tabela === 'Caixa Apresentado' || !donoCaixa.has(i.caixa))) {
      donoCaixa.set(i.caixa, i.ctx['Funcionário']);
    }
  });
  // Cartão resolvido pela Quality: o funcionário da venda vem antes do rótulo — o
  // rótulo é só PDV/turno/data, que vários frentistas dividem; por ele o cartão
  // caía no 1º funcionário visto no turno (Gladson → Richard).
  lista.forEach(i => { i.funcionario = i.ctx['Funcionário'] || i.donoQuality || donoCaixa.get(i.caixa) || 'Sem funcionário'; });
  // "Caixa Apresentado" e "Caixa" (fechamento/reabertura do turno) não
  // interessam — servem só p/ descobrir o funcionário acima, e saem daqui.
  // Só o que é dos caixas/turnos do período.
  return lista.filter(i => !TABELAS_OCULTAS.has(i.tabela) && i.dataTurno >= de && i.dataTurno <= ate);
}
