// BPO · CONTAS A RECEBER, direto do sistema do cliente. Dois usos:
//   Portal do cliente (buscarEmAberto) — só CLIENTES A PRAZO em aberto (notas a
//     prazo e faturas). Cartões e cheques ficam no Financeiro › Contas a Receber.
//   Admin (buscarTitulosAdmin + buscarCartoesWebposto) — as quatro carteiras:
//     notas a prazo, faturas, cheques e cartões.
//   Webposto  — TITULO_RECEBER (nota a prazo) + DUPLICATA (fatura), pendentes.
//               Título já agrupado numa duplicata (duplicataCodigo) é ignorado
//               p/ não contar duas vezes: vale a fatura.
//   Autosystem — autosystem-contas-receber, contas classificadas como
//               NOTAS_PRAZO / FATURAS pelos prefixos da rede (ou o padrão).
import * as qualityApi from './qualityApiService';
import * as mapService from './mapeamentoService';
import * as autosystemService from './autosystemService';
import { hojeBR } from '../utils/dataBR';
import { vencimentoEfetivoIso } from '../utils/diasUteis';

const num = (v) => Number(v || 0);
const iso10 = (v) => (v ? String(v).slice(0, 10) : null);

// Prefixos padrão (Autosystem) quando a rede não configurou os seus
const PREFIXOS_PADRAO = new Map([
  ['1.3.01', 'cartoes'], ['1.3.02', 'cheques'], ['1.3.03.1', 'notas_prazo'], ['1.3.03.2', 'faturas'],
]);
const TIPO_POR_CATEGORIA = { notas_prazo: 'nota', faturas: 'fatura', cheques: 'cheque', cartoes: 'cartao' };
function categoriaConta(codigo, mapa) {
  if (codigo == null) return null;
  const c = String(codigo);
  let melhor = '', cat = null;
  for (const [pre, k] of (mapa && mapa.size ? mapa : PREFIXOS_PADRAO)) {
    if ((c === pre || c.startsWith(`${pre}.`)) && pre.length > melhor.length) { melhor = pre; cat = String(k).toLowerCase(); }
  }
  return cat;
}

// Memo por data: são dezenas de milhares de cartões p/ poucas datas
const efetivoPorData = new Map();
function finalizar(t) {
  const venc = t.vencimento;
  if (!efetivoPorData.has(venc)) efetivoPorData.set(venc, vencimentoEfetivoIso(venc) || venc);
  return { ...t, vencimentoEfetivo: efetivoPorData.get(venc) };
}

// Título Webposto (nota a prazo) / duplicata (fatura) → formato da tela (null = ignorar)
function notaWebposto(t, emp) {
  if (t.pendente === false || t.duplicataCodigo != null) return null; // faturado → conta na duplicata
  return finalizar({
    chave: `tit:${t.tituloCodigo ?? t.codigo}`, empresaId: emp.id, empresaNome: emp.nome,
    cliente: t.nomeCliente || 'Cliente', documentoCliente: t.cpfCnpjCliente || '',
    documento: t.tituloNumero ? `Nº ${t.tituloNumero}${t.documento ? ` · ${t.documento}` : ''}` : String(t.documento || ''),
    tipo: 'nota', vencimento: iso10(t.dataVencimento), emissao: iso10(t.dataMovimento), valor: num(t.valor),
  });
}
function faturaWebposto(d, emp) {
  if (d.pendente === false) return null;
  const valor = num(d.valorLiquido ?? d.valorDuplicata) - num(d.valorPago);
  if (valor <= 0.004) return null;
  return finalizar({
    chave: `dup:${d.duplicataCodigo ?? d.codigo}`, empresaId: emp.id, empresaNome: emp.nome,
    cliente: d.nomeCliente || 'Cliente', documentoCliente: d.cpfCnpjCliente || '',
    documento: d.numeroDocumento || '', tipo: 'fatura',
    vencimento: iso10(d.vencimento), emissao: iso10(d.dataMovimento), valor,
  });
}

// Lista de títulos em aberto das empresas (mesma rede).
// Retorna { titulos: [{ chave, empresaId, empresaNome, cliente, documento, tipo:'nota'|'fatura',
//   vencimento, vencimentoEfetivo, emissao, valor }], erros: [texto] }
export async function buscarEmAberto({ tipo, empresas, redeId = null }) {
  const lista = (empresas || []).filter(e => e.empresa_codigo != null && e.empresa_codigo !== '');
  const erros = [];

  if (tipo === 'autosystem') {
    const mapa = await autosystemService.mapearPrefixosCategoria(redeId).catch(() => null);
    const res = await Promise.allSettled(lista.map(emp =>
      autosystemService.buscarContasReceber(emp.as_rede_id || redeId, emp.empresa_codigo, {})
        .then(cs => cs.map(c => ({ c, emp })))));
    const titulos = [];
    res.forEach((r, i) => {
      if (r.status !== 'fulfilled') { erros.push(`${lista[i].nome}: ${r.reason?.message || 'falha'}`); return; }
      r.value.forEach(({ c, emp }, ix) => {
        const cat = categoriaConta(c.debito_codigo, mapa);
        if (cat !== 'notas_prazo' && cat !== 'faturas') return; // só clientes a prazo
        titulos.push(finalizar({
          chave: `as:${emp.id}:${ix}`,
          empresaId: emp.id, empresaNome: emp.nome,
          cliente: c.pessoa_nome || 'Cliente', documentoCliente: '',
          documento: String(c.documento || ''), tipo: cat === 'faturas' ? 'fatura' : 'nota',
          vencimento: iso10(c.vencto), emissao: iso10(c.data), valor: num(c.valor),
        }));
      });
    });
    return { titulos, erros };
  }

  // Webposto
  const chaves = await mapService.listarChavesApi();
  const porId = new Map((chaves || []).map(c => [c.id, c]));
  const hoje = hojeBR();
  const f0 = { apenasPendente: true, dataInicial: hojeBR(-730), dataFinal: `${Number(hoje.slice(0, 4)) + 1}${hoje.slice(4)}` };
  const res = await Promise.allSettled(lista.map(async (emp) => {
    const ch = porId.get(emp.chave_api_id);
    if (!ch) throw new Error('chave da API Webposto não encontrada');
    const f = { ...f0, empresaCodigo: emp.empresa_codigo };
    const [tits, dups] = await Promise.all([
      qualityApi.buscarTitulosReceber(ch.chave, f),
      qualityApi.buscarDuplicatas(ch.chave, f),
    ]);
    return [
      ...(tits || []).map(t => notaWebposto(t, emp)),
      ...(dups || []).map(d => faturaWebposto(d, emp)),
    ].filter(Boolean);
  }));
  const titulos = [];
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') titulos.push(...r.value);
    else erros.push(`${lista[i].nome}: ${r.reason?.message || 'falha'}`);
  });
  return { titulos, erros };
}

// ─── Admin: as quatro carteiras ──────────────────────────────
// Executa fn(item) com no máximo `max` ao mesmo tempo (o banco do cliente
// Autosystem não aguenta 18 conexões simultâneas). Nunca rejeita:
// devolve [{ ok, valor } | { ok:false, erro }] na ordem da lista.
async function emFila(lista, fn, max, aoTerminarUm) {
  const saida = new Array(lista.length);
  let prox = 0;
  const trabalhador = async () => {
    while (prox < lista.length) {
      const i = prox++;
      try { saida[i] = { ok: true, valor: await fn(lista[i]) }; }
      catch (e) { saida[i] = { ok: false, erro: e?.message || 'falha' }; }
      aoTerminarUm?.();
    }
  };
  await Promise.all(Array.from({ length: Math.min(max, lista.length) }, trabalhador));
  return saida;
}

const empresasValidas = (empresas) => (empresas || []).filter(e => e.empresa_codigo != null && e.empresa_codigo !== '');

async function chavesPorId() {
  return new Map(((await mapService.listarChavesApi()) || []).map(c => [c.id, c]));
}
function chaveDaEmpresa(porId, emp) {
  const ch = porId.get(emp.chave_api_id);
  if (!ch) throw new Error('chave da API Webposto não encontrada');
  return ch.chave;
}

// Notas a prazo, faturas e cheques em aberto da rede (Webposto). No Autosystem
// vem tudo numa consulta só, então os cartões já saem aqui também.
// `outros` = contas 1.3.* do Autosystem fora das quatro carteiras (não entram
// na lista; a tela avisa p/ conferir os prefixos da rede).
export async function buscarTitulosAdmin({ tipo, empresas, redeId = null, onProgresso }) {
  const lista = empresasValidas(empresas);
  const erros = [], titulos = [];
  const outros = { qtd: 0, valor: 0 };
  const outrasContas = new Map();
  let feitos = 0;
  const avisar = () => onProgresso?.(++feitos, lista.length);
  onProgresso?.(0, lista.length);

  if (tipo === 'autosystem') {
    const mapa = await autosystemService.mapearPrefixosCategoria(redeId).catch(() => null);
    const res = await emFila(lista, emp => autosystemService.buscarContasReceber(emp.as_rede_id || redeId, emp.empresa_codigo, {}), 4, avisar);
    res.forEach((r, i) => {
      const emp = lista[i];
      if (!r.ok) { erros.push(`${emp.nome}: ${r.erro}`); return; }
      r.valor.forEach((c, ix) => {
        const t = TIPO_POR_CATEGORIA[categoriaConta(c.debito_codigo, mapa)];
        const valor = num(c.valor);
        if (!t) {
          outros.qtd += 1; outros.valor += valor;
          const k = `${c.debito_codigo || ''} ${c.debito_nome || ''}`.trim();
          outrasContas.set(k, (outrasContas.get(k) || 0) + valor);
          return;
        }
        titulos.push(finalizar({
          chave: `as:${emp.id}:${ix}`, empresaId: emp.id, empresaNome: emp.nome,
          cliente: t === 'cartao' ? (c.debito_nome || 'Cartão') : (c.pessoa_nome || 'Cliente'), documentoCliente: '',
          documento: String(c.documento || ''), tipo: t,
          vencimento: iso10(c.vencto) || iso10(c.data), emissao: iso10(c.data), valor,
        }));
      });
    });
  } else {
    const porId = await chavesPorId();
    const hoje = hojeBR();
    // Poucos registros: período inteiro num pedido só (chunkDias) em vez de 17
    const f0 = { apenasPendente: true, chunkDias: 5000, dataInicial: hojeBR(-1095), dataFinal: `${Number(hoje.slice(0, 4)) + 1}${hoje.slice(4)}` };
    const res = await emFila(lista, async (emp) => {
      const chave = chaveDaEmpresa(porId, emp);
      const f = { ...f0, empresaCodigo: emp.empresa_codigo };
      const [tits, dups, chqs] = await Promise.all([
        qualityApi.buscarTitulosReceber(chave, f),
        qualityApi.buscarDuplicatas(chave, f),
        qualityApi.buscarCheques(chave, f),
      ]);
      return [
        ...(tits || []).map(t => notaWebposto(t, emp)),
        ...(dups || []).map(d => faturaWebposto(d, emp)),
        ...(chqs || []).filter(c => c.pendente !== false).map(c => finalizar({
          chave: `chq:${c.chequeCodigo ?? c.codigo}`, empresaId: emp.id, empresaNome: emp.nome,
          cliente: c.emitente || 'Emitente não informado', documentoCliente: c.cpfCnpjEmitente || '',
          documento: [c.numeroCheque && `Nº ${c.numeroCheque}`, c.banco].filter(Boolean).join(' · '),
          tipo: 'cheque', devolvido: !!c.devolvido,
          vencimento: iso10(c.bomPara) || iso10(c.dataMovimento), emissao: iso10(c.dataMovimento), valor: num(c.valor),
        })),
      ].filter(Boolean);
    }, 4, avisar);
    res.forEach((r, i) => {
      if (r.ok) titulos.push(...r.valor);
      else erros.push(`${lista[i].nome}: ${r.erro}`);
    });
  }
  const contas = [...outrasContas].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  return { titulos, erros, outros: { ...outros, contas } };
}

// Cartões em aberto (Webposto), filtrados pelo VENCIMENTO do crédito: tudo o que
// ainda vai cair + o vencido sem baixa dos últimos `diasVencidos`. Há empresa que
// nunca deu baixa (90 mil+ pendentes desde 2024) — daí a janela.
export async function buscarCartoesWebposto({ empresas, diasVencidos = 90 }) {
  const lista = empresasValidas(empresas);
  const porId = await chavesPorId();
  const res = await emFila(lista, async (emp) => {
    const chave = chaveDaEmpresa(porId, emp);
    const f = { apenasPendente: true, dataFiltro: 'VENCIMENTO', empresaCodigo: emp.empresa_codigo };
    const partes = await Promise.all([
      qualityApi.buscarCartoes(chave, { ...f, dataInicial: hojeBR(), dataFinal: hojeBR(400) }),
      qualityApi.buscarCartoes(chave, { ...f, dataInicial: hojeBR(-diasVencidos), dataFinal: hojeBR(-1) }),
    ]);
    return partes.flat().filter(c => c.pendente !== false).map(c => {
      const valor = num(c.valor);
      return finalizar({
        chave: `car:${c.cartaoCodigo ?? c.codigo}`, empresaId: emp.id, empresaNome: emp.nome,
        cliente: String(c.adiministradoraDescricao || c.administradoraDescricao || `Administradora ${c.administradoraCodigo ?? ''}`).trim(),
        documentoCliente: '', documento: c.autorizacao ? `Aut. ${c.autorizacao}` : '', nsu: c.nsu || '', parcela: c.parcela ?? null,
        tipo: 'cartao', vencimento: iso10(c.vencimento), emissao: iso10(c.dataMovimento), valor,
        liquido: valor * (1 - num(c.taxaPercentual) / 100),
      });
    });
  }, 3);
  const titulos = [], erros = [];
  res.forEach((r, i) => {
    if (r.ok) r.valor.forEach(t => titulos.push(t)); // spread estoura a pilha com 20 mil+
    else erros.push(`${lista[i].nome} (cartões): ${r.erro}`);
  });
  return { titulos, erros };
}
