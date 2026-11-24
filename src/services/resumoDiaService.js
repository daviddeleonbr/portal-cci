// RESUMO DO DIA ANTERIOR — o que aparece ao entrar no portal do cliente.
// Junta, para TODAS as empresas da rede do usuário, o fechamento de ontem
// (mesmo cálculo do Fechamento de caixa: fechamentoCaixaService) e, se o
// usuário tiver o acesso, os clientes a prazo vencidos (bpoContasReceberService).
// Daí tira os "destaques" — frases curtas com o que merece atenção.
//
// Abre todo dia ao entrar; "Não mostrar mais hoje" esconde até o dia seguinte.
import * as fechamentoService from './fechamentoCaixaService';
import { buscarEmAberto } from './bpoContasReceberService';
import { hojeBR } from '../utils/dataBR';
import { formatCurrency } from '../utils/format';

const MAX_EMPRESAS = 12;   // rede grande: resume as 12 primeiras
const CONCORRENCIA = 3;    // empresas carregadas ao mesmo tempo

const num = (v) => Number(v || 0);

export const PERMISSOES_RESUMO = ['fechamento_caixa', 'bpo_contas_receber'];

// Reabrir o resumo de qualquer lugar (botão do cabeçalho)
export const EVENTO_ABRIR_RESUMO = 'cci:abrir-resumo-dia';
export const abrirResumoDia = () => window.dispatchEvent(new Event(EVENTO_ABRIR_RESUMO));

// ─── Controle de exibição ─────────────────────────────────────
// Todo dia o resumo abre pelo menos uma vez ao entrar. "Não mostrar mais hoje"
// guarda a data (por usuário, no aparelho) e vale só até virar o dia.
const chavePref = (usuarioId) => `cci-resumo-dia:${usuarioId}`;

export function ocultarHoje(usuarioId) {
  try { localStorage.setItem(chavePref(usuarioId), JSON.stringify({ ocultoEm: hojeBR() })); }
  catch { /* sem storage: só não lembra */ }
}

function ocultoHoje(usuarioId) {
  try { return JSON.parse(localStorage.getItem(chavePref(usuarioId)) || '{}').ocultoEm === hojeBR(); }
  catch { return false; }
}

// Abre sozinho ao entrar? Se tem algum acesso e não foi ocultado hoje.
export function deveAbrirAoEntrar(usuario) {
  if (!usuario?.id) return false;
  if (!PERMISSOES_RESUMO.some(p => (usuario.permissoes || []).includes(p))) return false;
  return !ocultoHoje(usuario.id);
}

// ─── Montagem ─────────────────────────────────────────────────
async function emLotes(itens, n, fn) {
  const out = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) {
      const k = i++;
      try { out[k] = { ok: true, valor: await fn(itens[k]) }; }
      catch (e) { out[k] = { ok: false, erro: e?.message || 'falha' }; }
    }
  }));
  return out;
}

// Retorna { data, empresas:[...], rede:{...}, receber, destaques:[], erros:[], parcial }
export async function montarResumo({ session, data = hojeBR(-1) }) {
  const perms = new Set(session?.usuario?.permissoes || []);
  const tipo = session?.tipoCliente;
  const todas = (session?.clientesRede?.length ? session.clientesRede : [session?.cliente])
    .filter(e => e && e.empresa_codigo != null && e.empresa_codigo !== '');
  const lista = todas.slice(0, MAX_EMPRESAS);
  const erros = [];

  // 1) Fechamento de ontem por empresa
  let empresas = [];
  if (perms.has('fechamento_caixa') && lista.length) {
    const res = await emLotes(lista, CONCORRENCIA, async (emp) => {
      const bruto = await fechamentoService.carregar(emp, data, tipo);
      return fechamentoService.montar(bruto);
    });
    res.forEach((r, i) => {
      const emp = lista[i];
      if (!r.ok) { erros.push(`${emp.nome}: ${r.erro}`); return; }
      const f = r.valor;
      const comb = f.vendas.categorias.find(c => c.chave === 'combustivel');
      empresas.push({
        id: emp.id, nome: emp.nome,
        vendas: num(f.vendas.total), recebido: num(f.totalRecebido),
        categorias: f.vendas.categorias.map(c => ({ chave: c.chave, rotulo: c.rotulo, valor: num(c.valor), qtd: num(c.qtd) })),
        litros: num(comb?.qtd),
        diferenca: num(f.diferencaCaixa),
        canceladas: { qtd: f.devolucoes.qtd, total: num(f.devolucoes.total), titulo: f.devolucoes.titulo },
        afericoes: { qtd: f.afericoes.itens.length, litros: num(f.afericoes.litros) },
        descontos: num(f.descontos),
        recebimentos: f.recebimentos.map(x => ({ tipo: x.tipo, rotulo: x.rotulo, valor: num(x.valor) })),
        caixasAbertos: (f.turnos || []).filter(t => t.aberto).length,
        produtos: f.vendas.categorias.flatMap(c => (c.produtos || []).map(p => ({ ...p, categoria: c.chave }))),
      });
    });
  }

  // 2) Rede (soma das empresas)
  const somaE = (fn) => empresas.reduce((s, e) => s + fn(e), 0);
  const cat = new Map(fechamentoService.CATEGORIAS.map(([k, l]) => [k, { chave: k, rotulo: l, valor: 0 }]));
  empresas.forEach(e => e.categorias.forEach(c => { (cat.get(c.chave) || cat.get('outros')).valor += c.valor; }));
  const ROTULO_TIPO = { dinheiro: 'Dinheiro', cartao: 'Cartões e PIX', a_prazo: 'A prazo', cheque: 'Cheques', outros: 'Outros' };
  const formas = new Map();
  empresas.forEach(e => e.recebimentos.forEach(r => {
    const g = formas.get(r.tipo) || { tipo: r.tipo, rotulo: ROTULO_TIPO[r.tipo] || 'Outros', valor: 0 };
    g.valor += r.valor; formas.set(r.tipo, g);
  }));
  const prods = new Map();
  empresas.forEach(e => e.produtos.forEach(p => {
    const g = prods.get(p.nome) || { nome: p.nome, categoria: p.categoria, valor: 0, qtd: 0, unidade: p.unidade };
    g.valor += num(p.valor); g.qtd += num(p.qtd); prods.set(p.nome, g);
  }));
  const rede = {
    vendas: somaE(e => e.vendas),
    recebido: somaE(e => e.recebido),
    diferenca: somaE(e => e.diferenca),
    litros: somaE(e => e.litros),
    categorias: [...cat.values()].filter(c => Math.abs(c.valor) > 0.004),
    formas: [...formas.values()].filter(f => Math.abs(f.valor) > 0.004).sort((a, b) => b.valor - a.valor),
    canceladas: { qtd: somaE(e => e.canceladas.qtd), total: somaE(e => e.canceladas.total), titulo: empresas[0]?.canceladas.titulo || 'Vendas canceladas' },
    afericoes: { qtd: somaE(e => e.afericoes.qtd), litros: somaE(e => e.afericoes.litros) },
    caixasAbertos: somaE(e => e.caixasAbertos),
    topProdutos: [...prods.values()].filter(p => p.categoria !== 'combustivel').sort((a, b) => b.valor - a.valor).slice(0, 3),
  };

  // 3) Clientes a prazo (vencidos / vencem hoje)
  let receber = null;
  if (perms.has('bpo_contas_receber') && lista.length) {
    try {
      const { titulos } = await buscarEmAberto({ tipo, empresas: lista, redeId: session?.asRede?.id || null });
      const hoje = hojeBR();
      const venc = titulos.filter(t => t.vencimentoEfetivo && t.vencimentoEfetivo < hoje);
      const vHoje = titulos.filter(t => t.vencimentoEfetivo === hoje);
      receber = {
        vencidos: { qtd: venc.length, total: venc.reduce((s, t) => s + t.valor, 0) },
        hoje: { qtd: vHoje.length, total: vHoje.reduce((s, t) => s + t.valor, 0) },
        emAberto: titulos.reduce((s, t) => s + t.valor, 0),
      };
    } catch (e) { erros.push(`Contas a receber: ${e?.message || 'falha'}`); }
  }

  return {
    data, empresas, rede, receber, erros,
    destaques: gerarDestaques({ empresas, rede, receber }),
    parcial: todas.length > lista.length ? { mostradas: lista.length, total: todas.length } : null,
  };
}

// Frases curtas, em ordem de importância. tom: alerta | atencao | bom | info
function gerarDestaques({ empresas, rede, receber }) {
  const d = [];
  const multi = empresas.length > 1;

  // Clientes a prazo
  if (receber?.vencidos.qtd) {
    d.push({ tom: 'alerta', icone: 'receber',
      texto: `${receber.vencidos.qtd} ${receber.vencidos.qtd === 1 ? 'título vencido' : 'títulos vencidos'} de clientes a prazo · ${formatCurrency(receber.vencidos.total)}` });
  }
  if (receber?.hoje.qtd) {
    d.push({ tom: 'info', icone: 'receber',
      texto: `${receber.hoje.qtd} ${receber.hoje.qtd === 1 ? 'título vence' : 'títulos vencem'} hoje · ${formatCurrency(receber.hoje.total)}` });
  }

  // Vendas
  if (rede.canceladas.qtd) {
    d.push({ tom: 'info', icone: 'cancelada',
      texto: `${rede.canceladas.qtd} ${/devol/i.test(rede.canceladas.titulo)
        ? (rede.canceladas.qtd === 1 ? 'devolução' : 'devoluções')
        : (rede.canceladas.qtd === 1 ? 'venda cancelada' : 'vendas canceladas')} · ${formatCurrency(rede.canceladas.total)}` });
  }
  const comb = rede.categorias.find(c => c.chave === 'combustivel');
  if (comb && rede.vendas > 0) {
    d.push({ tom: 'info', icone: 'combustivel',
      texto: `Combustíveis foram ${(comb.valor / rede.vendas * 100).toLocaleString('pt-BR', { maximumFractionDigits: comb.valor / rede.vendas >= 0.995 ? 1 : 0 })}% das vendas${rede.litros ? ` · ${Math.round(rede.litros).toLocaleString('pt-BR')} litros` : ''}` });
  }
  if (multi) {
    const top = [...empresas].sort((a, b) => b.vendas - a.vendas)[0];
    if (top?.vendas > 0) d.push({ tom: 'bom', icone: 'top', texto: `Maior venda da rede: ${top.nome} · ${formatCurrency(top.vendas)}` });
  }
  if (rede.topProdutos[0]) {
    d.push({ tom: 'info', icone: 'produto', texto: `Mais vendido fora os combustíveis: ${rede.topProdutos[0].nome} · ${formatCurrency(rede.topProdutos[0].valor)}` });
  }
  if (rede.afericoes.qtd) {
    d.push({ tom: 'info', icone: 'afericao',
      texto: `${rede.afericoes.qtd} ${rede.afericoes.qtd === 1 ? 'aferição' : 'aferições'} de bomba · ${rede.afericoes.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` });
  }
  // alertas primeiro, depois atenção; o resto na ordem acima
  const PESO = { alerta: 0, atencao: 1 };
  return d.map((x, i) => ({ x, i })).sort((a, b) => (PESO[a.x.tom] ?? 2) - (PESO[b.x.tom] ?? 2) || a.i - b.i).map(o => o.x);
}
