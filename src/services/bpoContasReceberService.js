// BPO · CONTAS A RECEBER — só CLIENTES A PRAZO em aberto (notas a prazo e
// faturas), direto do sistema do cliente. Cartões e cheques ficam de fora
// (estão no Financeiro › Contas a Receber).
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
const PREFIXOS_PADRAO = new Map([['1.3.03.1', 'notas_prazo'], ['1.3.03.2', 'faturas']]);
function categoriaConta(codigo, mapa) {
  if (codigo == null) return null;
  const c = String(codigo);
  let melhor = '', cat = null;
  for (const [pre, k] of (mapa && mapa.size ? mapa : PREFIXOS_PADRAO)) {
    if ((c === pre || c.startsWith(`${pre}.`)) && pre.length > melhor.length) { melhor = pre; cat = String(k).toLowerCase(); }
  }
  return cat;
}

function finalizar(t) {
  const venc = t.vencimento;
  return { ...t, vencimentoEfetivo: vencimentoEfetivoIso(venc) || venc };
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
      r.value.forEach(({ c, emp }) => {
        const cat = categoriaConta(c.debito_codigo, mapa);
        if (cat !== 'notas_prazo' && cat !== 'faturas') return; // só clientes a prazo
        titulos.push(finalizar({
          chave: `as:${c.grid ?? `${c.documento}-${c.vencto}-${c.valor}`}`,
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
    const out = [];
    (tits || []).forEach(t => {
      if (t.pendente === false || t.duplicataCodigo != null) return; // faturado → conta na duplicata
      out.push(finalizar({
        chave: `tit:${t.tituloCodigo ?? t.codigo}`, empresaId: emp.id, empresaNome: emp.nome,
        cliente: t.nomeCliente || 'Cliente', documentoCliente: t.cpfCnpjCliente || '',
        documento: t.tituloNumero ? `Nº ${t.tituloNumero}${t.documento ? ` · ${t.documento}` : ''}` : String(t.documento || ''),
        tipo: 'nota', vencimento: iso10(t.dataVencimento), emissao: iso10(t.dataMovimento), valor: num(t.valor),
      }));
    });
    (dups || []).forEach(d => {
      if (d.pendente === false) return;
      const valor = num(d.valorLiquido ?? d.valorDuplicata) - num(d.valorPago);
      if (valor <= 0.004) return;
      out.push(finalizar({
        chave: `dup:${d.duplicataCodigo ?? d.codigo}`, empresaId: emp.id, empresaNome: emp.nome,
        cliente: d.nomeCliente || 'Cliente', documentoCliente: d.cpfCnpjCliente || '',
        documento: d.numeroDocumento || '', tipo: 'fatura',
        vencimento: iso10(d.vencimento), emissao: iso10(d.dataMovimento), valor,
      }));
    });
    return out;
  }));
  const titulos = [];
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') titulos.push(...r.value);
    else erros.push(`${lista[i].nome}: ${r.reason?.message || 'falha'}`);
  });
  return { titulos, erros };
}
