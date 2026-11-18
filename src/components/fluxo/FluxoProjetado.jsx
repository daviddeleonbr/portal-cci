// Fluxo de Caixa › Projetado — projeção do caixa a partir do DIA SEGUINTE ao fim
// do período do relatório, pra decidir se vai precisar de empréstimo.
//
//  saldo de partida = saldo final do período (o mesmo da aba Evolução)
//  1) Realizado: se o período terminou antes de hoje, o extrato real (MOVIMENTO_CONTA)
//     do dia seguinte até ONTEM — mesmos filtros de conta do relatório.
//  2) Projetado: de HOJE até o horizonte, os títulos EM ABERTO na Quality:
//     saídas = TITULO_PAGAR; entradas = TITULO_RECEBER, DUPLICATA, CARTAO (líquido
//     da taxa) e CHEQUE. Vencimento em fim de semana vai pro próximo dia útil.
//     Os vencidos em aberto (vencimento antes de hoje) entram, opcionalmente, no
//     1º dia da projeção.
// Só Webposto por enquanto (Autosystem não tem os títulos na Quality).

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ReferenceLine,
} from 'recharts';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, Download,
  Loader2, RefreshCw, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import * as qualityApi from '../../services/qualityApiService';
import * as mapService from '../../services/mapeamentoService';
import { formatCurrency } from '../../utils/format';

const dd = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const fmtBR = (s) => { const [y, m, d] = String(s || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : '—'; };
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
// Fim de semana → próximo dia útil (feriado não é tratado).
const diaUtil = (s) => { const d = parse(s); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return ymd(d); };
const kCompact = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`;
  return `${v < 0 ? '-' : ''}R$ ${s}`;
};

const FONTES = {
  pagar:     { label: 'Contas a pagar', lado: 'saida' },
  receber:   { label: 'Títulos a receber', lado: 'entrada' },
  duplicata: { label: 'Duplicatas', lado: 'entrada' },
  cartao:    { label: 'Cartões (líquido)', lado: 'entrada' },
  cheque:    { label: 'Cheques', lado: 'entrada' },
};

// ─ Normalização dos títulos em aberto → { fonte, venc, valor, descricao, empresa } ─
const vencDe = (t) => {
  const raw = t.vencimento || t.dataVencimento || t.dataVenc || t.dataCredito || t.dataPrevisao
    || t.dataBomPara || t.bomPara || t.dataDeposito || null;
  return raw ? String(raw).slice(0, 10) : null;
};
const abertoDe = (bruto, pago) => {
  const b = num(bruto), p = num(pago);
  return p > 0 && p < b ? b - p : b;
};
function normalizar(fonte, t, ec) {
  let valor = 0, descricao = '';
  if (fonte === 'pagar') {
    valor = abertoDe(t.valor, t.valorPago);
    descricao = [t.nomeFornecedor, t.descricao].filter(Boolean).join(' · ') || `Título #${t.tituloPagarCodigo ?? t.codigo}`;
  } else if (fonte === 'receber') {
    valor = num(t.valor);
    descricao = t.nomeCliente || `Título #${t.tituloCodigo ?? t.codigo}`;
  } else if (fonte === 'duplicata') {
    valor = abertoDe(t.valorLiquido ?? t.valorDuplicata, t.valorPago);
    descricao = [t.nomeCliente, t.numeroDocumento].filter(Boolean).join(' · ') || `Duplicata #${t.duplicataCodigo ?? t.codigo}`;
  } else if (fonte === 'cartao') {
    valor = num(t.valor) * (1 - num(t.taxaPercentual) / 100);
    descricao = t.adiministradoraDescricao || t.administradoraDescricao || 'Cartão';
  } else {
    valor = num(t.valorSaldo ?? t.valor);
    descricao = [t.nomeCliente || t.emitente || t.nome, t.numeroCheque || t.numero].filter(Boolean).join(' · ') || 'Cheque';
  }
  return { fonte, venc: vencDe(t), valor: r2(Math.abs(valor)), descricao, empresaCodigo: ec };
}

/**
 * props:
 *  chaveApiId, empresaCodigos, nomeEmpresa(ec) → nome
 *  dataInicio: 1º dia após o período do relatório (YYYY-MM-DD)
 *  saldoInicial: saldo no fim do período (mesmo da Evolução)
 *  movimentoValido(m): mesmo filtro de contas do relatório (tipo/contas/aplicações)
 */
export default function FluxoProjetado({ chaveApiId, empresaCodigos, nomeEmpresa, dataInicio, saldoInicial, movimentoValido }) {
  const hoje = ymd(new Date());
  const [horizonte, setHorizonte] = useState(60);       // dias a partir do início
  const [gran, setGran] = useState('semana');           // 'dia' | 'semana' | 'mes'
  // Vencidos em aberto: só os que venceram há até N dias entram (no 1º dia da
  // projeção). Título vencido há muito tempo e ainda "Aberto" costuma ser baixa
  // esquecida no sistema (na Autobem há títulos de 2023) — distorceria tudo.
  const [vencidosDias, setVencidosDias] = useState(30);   // 0 = nenhum, -1 = todos
  const [caixaMinimo, setCaixaMinimo] = useState('');
  const [dados, setDados] = useState(null);             // { realizado: [{data, entrada, saida}], titulos: [...] }
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(null);           // bucket expandido

  const inicioProj = dataInicio > hoje ? dataInicio : hoje;   // a projeção (títulos) começa hoje
  const dataFim = addDias(dataInicio, horizonte - 1);
  const ecKey = (empresaCodigos || []).join(',');

  const carregar = useCallback(async () => {
    if (!chaveApiId || !dataInicio || !(empresaCodigos || []).length) return;
    setCarregando(true); setErro('');
    try {
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === chaveApiId)?.chave;
      if (!chave) throw new Error('Chave API não encontrada.');
      const ontem = addDias(hoje, -1);
      const temRealizado = dataInicio <= ontem;
      // Títulos em aberto: o filtro de data da Quality é a EMISSÃO (dataMovimento),
      // então pega uma janela larga pra trás.
      const janela = { dataInicial: addDias(hoje, -3 * 365), dataFinal: addDias(hoje, 365), apenasPendente: true };

      const porEmpresa = await Promise.all(empresaCodigos.map(async (ec) => {
        const f = { ...janela, empresaCodigo: ec };
        const seguro = (p) => p.catch(() => []);
        const [pagar, receber, dups, cartoes, cheques, movs] = await Promise.all([
          seguro(qualityApi.buscarTitulosPagar(chave, f)),
          seguro(qualityApi.buscarTitulosReceber(chave, f)),
          seguro(qualityApi.buscarDuplicatas(chave, f)),
          seguro(qualityApi.buscarCartoes(chave, { ...f, dataInicial: addDias(hoje, -365) })),
          seguro(qualityApi.buscarCheques(chave, f)),
          temRealizado
            ? qualityApi.buscarMovimentoConta(chave, { dataInicial: dataInicio, dataFinal: ontem, empresaCodigo: ec })
              .then(l => (l || []).map(m => ({ ...m, empresaCodigo: ec })))
            : Promise.resolve([]),
        ]);
        const pend = (l) => (l || []).filter(t => t.pendente !== false && !/^pago$/i.test(String(t.situacao || '')));
        const titulos = [
          ...pend(pagar).map(t => normalizar('pagar', t, ec)),
          ...pend(receber).map(t => normalizar('receber', t, ec)),
          ...pend(dups).map(t => normalizar('duplicata', t, ec)),
          ...pend(cartoes).map(t => normalizar('cartao', t, ec)),
          ...pend(cheques).map(t => normalizar('cheque', t, ec)),
        ].filter(t => t.venc && t.valor > 0.004);
        return { titulos, movs };
      }));

      // Realizado: mesmo tratamento do relatório (cartão pelo líquido da remessa).
      let movs = porEmpresa.flatMap(p => p.movs);
      if (movs.length) {
        const liq = await qualityApi.buscarLiquidoCartaoPorRemessa(chave, empresaCodigos, { dataInicial: dataInicio, dataFinal: ontem });
        movs = movs.map(m => qualityApi.ajustarMovimentoCartao(m, liq));
      }
      const realizado = movs
        .filter(m => m.contaCodigo != null && m.dataMovimento && movimentoValido(m))
        .map(m => {
          const abs = Math.abs(num(m.valor));
          return {
            data: String(m.dataMovimento).slice(0, 10), realizado: true,
            entrada: m.tipo === 'Crédito' ? abs : 0, saida: m.tipo === 'Crédito' ? 0 : abs,
            descricao: (m.descricao || '').trim() || m.tipoDocumentoOrigem || 'Movimento', empresaCodigo: m.empresaCodigo,
          };
        });
      setDados({ realizado, titulos: porEmpresa.flatMap(p => p.titulos) });
    } catch (e) {
      setErro(e.message || String(e));
    } finally {
      setCarregando(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveApiId, ecKey, dataInicio, hoje, movimentoValido]);

  useEffect(() => { carregar(); }, [carregar]);

  const proj = useMemo(() => {
    if (!dados) return null;
    const minimo = num(String(caixaMinimo).replace(/\./g, '').replace(',', '.'));

    // Lançamentos da linha do tempo (realizado + títulos), já com a data efetiva.
    const lancs = dados.realizado.filter(m => m.data <= dataFim).map(m => ({ ...m, tipo: 'realizado' }));
    const vencidos = { entrada: 0, saida: 0, qtdE: 0, qtdS: 0, ignE: 0, ignS: 0, qtdIgn: 0 };
    const corteVenc = vencidosDias < 0 ? '' : addDias(inicioProj, -vencidosDias);
    let aposHorizonte = 0;
    dados.titulos.forEach(t => {
      const lado = FONTES[t.fonte].lado;
      let data = diaUtil(t.venc);
      if (t.venc < inicioProj) {
        if (vencidosDias === 0 || t.venc < corteVenc) {
          if (lado === 'entrada') vencidos.ignE += t.valor; else vencidos.ignS += t.valor;
          vencidos.qtdIgn++;
          return;
        }
        if (lado === 'entrada') { vencidos.entrada += t.valor; vencidos.qtdE++; } else { vencidos.saida += t.valor; vencidos.qtdS++; }
        data = inicioProj;
      } else if (data < inicioProj) data = inicioProj;
      if (data > dataFim) { aposHorizonte++; return; }
      lancs.push({
        data, tipo: 'titulo', fonte: t.fonte, vencido: t.venc < inicioProj, venc: t.venc,
        entrada: lado === 'entrada' ? t.valor : 0, saida: lado === 'saida' ? t.valor : 0,
        descricao: t.descricao, empresaCodigo: t.empresaCodigo,
      });
    });

    const iniDate = parse(dataInicio);
    const chave = (s) => {
      const d = parse(s);
      if (gran === 'dia') return { k: s, ord: d.getTime(), lbl: `${DIAS_SEM[d.getDay()]} ${dd(d.getDate())}/${dd(d.getMonth() + 1)}`, ini: s, fim: s };
      if (gran === 'semana') {
        const w = Math.floor((d - iniDate) / (7 * 86400000));
        const ini = addDias(dataInicio, w * 7);
        const fim = addDias(ini, 6) > dataFim ? dataFim : addDias(ini, 6);
        return { k: `w${w}`, ord: parse(ini).getTime(), lbl: `${fmtBR(ini).slice(0, 5)}–${fmtBR(fim).slice(0, 5)}`, ini, fim };
      }
      const ini = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
      return { k: ini, ord: parse(ini).getTime(), lbl: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, ini, fim: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    };
    // Buckets contínuos (inclui períodos sem lançamento, pro saldo não "pular").
    const buckets = new Map();
    for (let s = dataInicio; s <= dataFim; s = addDias(s, 1)) {
      const b = chave(s);
      if (!buckets.has(b.k)) buckets.set(b.k, { ...b, entradas: 0, saidas: 0, entradasReal: 0, saidasReal: 0, lancs: [], projetado: false });
      if (s >= inicioProj) buckets.get(b.k).projetado = true;
    }
    lancs.forEach(l => {
      const b = buckets.get(chave(l.data).k);
      if (!b) return;
      b.entradas += l.entrada; b.saidas += l.saida; b.lancs.push(l);
      if (l.tipo === 'realizado') { b.entradasReal += l.entrada; b.saidasReal += l.saida; }
    });
    let acum = num(saldoInicial);
    let menor = { saldo: acum, lbl: 'Início', ini: addDias(dataInicio, -1) };
    const pontos = Array.from(buckets.values()).sort((a, b) => a.ord - b.ord).map(b => {
      acum += b.entradas - b.saidas;
      const p = { ...b, entradas: r2(b.entradas), saidas: r2(b.saidas), variacao: r2(b.entradas - b.saidas), saldo: r2(acum) };
      if (p.saldo < menor.saldo) menor = p;
      return p;
    });
    const tot = (campo, filtro) => lancs.filter(filtro).reduce((s, l) => s + l[campo], 0);
    const ehTit = l => l.tipo === 'titulo';
    const ehReal = l => l.tipo === 'realizado';
    const porFonte = {};
    lancs.filter(ehTit).forEach(l => { porFonte[l.fonte] = (porFonte[l.fonte] || 0) + l.entrada + l.saida; });
    const saldoFinal = pontos.length ? pontos[pontos.length - 1].saldo : num(saldoInicial);
    // Primeiro ponto em que o saldo fica abaixo do caixa mínimo.
    const primeiroFuro = pontos.find(p => p.saldo < minimo);
    return {
      pontos, saldoFinal, menor, minimo, primeiroFuro, vencidos, aposHorizonte, porFonte,
      necessidade: Math.max(0, minimo - menor.saldo),
      entradasProj: tot('entrada', ehTit), saidasProj: tot('saida', ehTit),
      entradasReal: tot('entrada', ehReal), saidasReal: tot('saida', ehReal),
      temRealizado: lancs.some(ehReal) || dataInicio < inicioProj,
    };
  }, [dados, dataInicio, dataFim, inicioProj, gran, vencidosDias, caixaMinimo, saldoInicial]);

  const exportar = () => {
    if (!proj) return;
    const nome = (ec) => (nomeEmpresa ? nomeEmpresa(ec) : ec);
    const resumo = [['Período', 'Situação', 'Entradas', 'Saídas', 'Variação', 'Saldo']];
    proj.pontos.forEach(p => resumo.push([p.lbl, p.projetado ? 'Projetado' : 'Realizado', p.entradas, p.saidas, p.variacao, p.saldo]));
    const itens = [['Data no fluxo', 'Vencimento', 'Origem', 'Empresa', 'Descrição', 'Entrada', 'Saída']];
    proj.pontos.forEach(p => p.lancs.forEach(l => itens.push([
      fmtBR(l.data), l.venc ? fmtBR(l.venc) : '', l.tipo === 'realizado' ? 'Realizado (extrato)' : `${FONTES[l.fonte].label}${l.vencido ? ' (vencido)' : ''}`,
      nome(l.empresaCodigo), l.descricao, l.entrada || '', l.saida || '',
    ])));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Projeção');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itens), 'Lançamentos');
    XLSX.writeFile(wb, `fluxo-projetado-${dataInicio}_a_${dataFim}.xlsx`);
  };

  const sel = 'h-8 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100';
  const seg = (ativo) => `rounded-md px-2.5 py-1 text-[12px] font-medium ${ativo ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`;
  const corV = (v) => (v < 0 ? 'text-red-600' : 'text-emerald-700');

  return (
    <div className="space-y-5">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200/60 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-[12px] text-gray-600">
          <CalendarClock className="h-4 w-4 text-emerald-600" />
          Projeção de <strong className="text-gray-900">{fmtBR(dataInicio)}</strong> até <strong className="text-gray-900">{fmtBR(dataFim)}</strong>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
          {[30, 60, 90, 180].map(h => <button key={h} onClick={() => setHorizonte(h)} className={seg(horizonte === h)}>{h} dias</button>)}
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
          {[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, l]) => <button key={k} onClick={() => setGran(k)} className={seg(gran === k)}>{l}</button>)}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600" title="Títulos vencidos e ainda em aberto entram no 1º dia da projeção">
          Vencidos em aberto
          <select value={vencidosDias} onChange={e => setVencidosDias(Number(e.target.value))} className={sel}>
            <option value={0}>Não incluir</option>
            <option value={15}>Últimos 15 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={60}>Últimos 60 dias</option>
            <option value={-1}>Todos</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
          Caixa mínimo
          <input value={caixaMinimo} onChange={e => setCaixaMinimo(e.target.value)} placeholder="0,00" inputMode="decimal" className={`${sel} w-28 text-right`} />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportar} disabled={!proj}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
          <button onClick={carregar} disabled={carregando}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      {carregando && !proj ? (
        <div className="rounded-2xl border border-gray-200/60 bg-white px-6 py-16 text-center shadow-sm">
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-emerald-500" />
          <p className="text-sm font-medium text-gray-800">Buscando contas a pagar e a receber em aberto…</p>
        </div>
      ) : proj && (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card titulo={`Saldo em ${fmtBR(addDias(dataInicio, -1))}`} valor={num(saldoInicial)} sub="fim do período do relatório" />
            {proj.temRealizado
              ? <Card titulo="Realizado até ontem" valor={proj.entradasReal - proj.saidasReal} sinal sub={`+${formatCurrency(proj.entradasReal)} / −${formatCurrency(proj.saidasReal)}`} />
              : <Card titulo="Realizado" valor={0} sub="período terminou ontem ou depois" />}
            <Card titulo="Entradas previstas" valor={proj.entradasProj} cor="text-emerald-700" icon={TrendingUp} sub="a receber em aberto" />
            <Card titulo="Saídas previstas" valor={-proj.saidasProj} cor="text-red-600" icon={TrendingDown} sub="a pagar em aberto" />
            <Card titulo={`Saldo projetado em ${fmtBR(dataFim)}`} valor={proj.saldoFinal} sinal sub={`menor: ${formatCurrency(proj.menor.saldo)} (${proj.menor.lbl})`} />
          </div>

          {/* Veredito: precisa ou não de empréstimo */}
          {proj.necessidade > 0.005 ? (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-5 py-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div className="text-sm text-red-900">
                <p className="font-semibold">Necessidade de caixa de {formatCurrency(proj.necessidade)}</p>
                <p className="text-[13px]">
                  O saldo projetado fica abaixo do caixa mínimo ({formatCurrency(proj.minimo)})
                  {proj.primeiroFuro ? <> a partir de <strong>{proj.primeiroFuro.lbl}</strong></> : null} e chega a
                  {' '}<strong>{formatCurrency(proj.menor.saldo)}</strong> em <strong>{proj.menor.lbl}</strong>.
                  Esse é o valor de empréstimo/aporte que cobriria o pior momento do horizonte.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
              <p className="text-sm text-emerald-900">
                <strong>Sem necessidade de empréstimo no horizonte.</strong> O menor saldo projetado é {formatCurrency(proj.menor.saldo)} ({proj.menor.lbl}), acima do caixa mínimo de {formatCurrency(proj.minimo)}.
              </p>
            </div>
          )}

          {/* Gráfico */}
          <div className="rounded-2xl border border-gray-200/60 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-800">Saldo projetado</h3>
              <span className="text-[11px] text-gray-400">barras: entradas/saídas · linha: saldo</span>
            </div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={proj.pontos} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="lbl" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={kCompact} width={70} />
                  <RTooltip formatter={(v, n) => [formatCurrency(n === 'Saídas' ? -v : v), n]} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <ReferenceLine y={0} stroke="#9ca3af" />
                  {proj.minimo !== 0 && <ReferenceLine y={proj.minimo} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Caixa mínimo', fontSize: 10, fill: '#b45309', position: 'insideTopRight' }} />}
                  <Bar dataKey="entradas" name="Entradas" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="saidas" name="Saídas" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Line dataKey="saldo" name="Saldo" type="monotone" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Composição + avisos */}
          <div className="flex flex-wrap gap-2 text-[12px]">
            {Object.entries(proj.porFonte).map(([f, v]) => (
              <span key={f} className={`rounded-full border px-3 py-1 ${FONTES[f].lado === 'entrada' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                {FONTES[f].label}: <strong>{formatCurrency(v)}</strong>
              </span>
            ))}
            {(proj.vencidos.qtdE + proj.vencidos.qtdS) > 0 && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
                Vencidos incluídos (em {fmtBR(inicioProj)}): a receber {formatCurrency(proj.vencidos.entrada)} ({proj.vencidos.qtdE}) · a pagar {formatCurrency(proj.vencidos.saida)} ({proj.vencidos.qtdS})
              </span>
            )}
            {proj.vencidos.qtdIgn > 0 && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-600" title="Vencidos há mais tempo que o limite escolhido — provável baixa pendente no sistema">
                Fora da projeção ({proj.vencidos.qtdIgn} vencidos antigos): a receber {formatCurrency(proj.vencidos.ignE)} · a pagar {formatCurrency(proj.vencidos.ignS)}
              </span>
            )}
            {proj.aposHorizonte > 0 && <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-600">{proj.aposHorizonte} título(s) vencem depois de {fmtBR(dataFim)}</span>}
          </div>

          {/* Tabela por período */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Período</th>
                    <th className="px-3 py-3 text-right">Entradas</th>
                    <th className="px-3 py-3 text-right">Saídas</th>
                    <th className="px-3 py-3 text-right">Variação</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-gray-50/50 text-gray-600">
                    <td className="px-4 py-2 text-[12px]" colSpan={4}>Saldo em {fmtBR(addDias(dataInicio, -1))} (fim do período)</td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums ${corV(num(saldoInicial))}`}>{formatCurrency(num(saldoInicial))}</td>
                  </tr>
                  {proj.pontos.map(p => (
                    <Fragment key={p.k}>
                      <tr onClick={() => setAberto(aberto === p.k ? null : p.k)}
                        className={`cursor-pointer hover:bg-gray-50/70 ${p.saldo < proj.minimo ? 'bg-red-50/40' : ''}`}>
                        <td className="px-4 py-2.5 text-gray-800">
                          <span className="inline-flex items-center gap-1.5">
                            {aberto === p.k ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                            {p.lbl}
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${p.projetado ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                              {p.projetado ? (p.entradasReal || p.saidasReal ? 'Parcial' : 'Projetado') : 'Realizado'}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">{p.entradas ? formatCurrency(p.entradas) : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-600">{p.saidas ? formatCurrency(-p.saidas) : '—'}</td>
                        <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${corV(p.variacao)}`}>{formatCurrency(p.variacao)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-semibold tabular-nums ${corV(p.saldo)}`}>{formatCurrency(p.saldo)}</td>
                      </tr>
                      {aberto === p.k && (
                        <tr>
                          <td colSpan={5} className="bg-gray-50/60 px-6 py-3">
                            {p.lancs.length === 0 ? <p className="text-[12px] text-gray-400">Nenhum lançamento.</p> : (
                              <ListaLancs lancs={p.lancs} nomeEmpresa={nomeEmpresa} />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-gray-400">
            A projeção usa os títulos <strong>em aberto hoje</strong> na Quality (vencimento em fim de semana vai para o próximo dia útil; feriados não são considerados).
            Cartões entram pelo valor líquido da taxa. Receitas futuras ainda não lançadas (vendas dos próximos dias) não entram — o resultado é conservador.
          </p>
        </>
      )}
    </div>
  );
}

function Card({ titulo, valor, sub, cor, sinal, icon: Icon }) {
  const c = cor || (sinal ? (valor < 0 ? 'text-red-600' : 'text-emerald-700') : (valor < 0 ? 'text-red-600' : 'text-gray-900'));
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white px-4 py-3 shadow-sm">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{Icon && <Icon className="h-3 w-3" />}{titulo}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${c}`}>{sinal && valor > 0 ? '+' : ''}{formatCurrency(valor)}</p>
      {sub && <p className="truncate text-[11px] text-gray-400" title={sub}>{sub}</p>}
    </div>
  );
}

function ListaLancs({ lancs, nomeEmpresa }) {
  const [verTodos, setVerTodos] = useState(false);
  const ord = [...lancs].sort((a, b) => (b.entrada + b.saida) - (a.entrada + a.saida));
  const vis = verTodos ? ord : ord.slice(0, 30);
  return (
    <div>
      <table className="w-full text-[12px]">
        <thead className="text-left text-[10px] uppercase tracking-wider text-gray-400">
          <tr><th className="py-1">Data</th><th className="py-1">Origem</th><th className="py-1">Empresa</th><th className="py-1">Descrição</th><th className="py-1 text-right">Valor</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {vis.map((l, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap py-1 pr-3 text-gray-600">{fmtBR(l.data)}{l.vencido && <span className="ml-1 text-amber-600" title={`Venceu em ${fmtBR(l.venc)}`}>(venc. {fmtBR(l.venc).slice(0, 5)})</span>}</td>
              <td className="whitespace-nowrap py-1 pr-3 text-gray-600">{l.tipo === 'realizado' ? 'Extrato' : FONTES[l.fonte].label}</td>
              <td className="whitespace-nowrap py-1 pr-3 text-gray-600">{nomeEmpresa ? nomeEmpresa(l.empresaCodigo) : l.empresaCodigo}</td>
              <td className="py-1 pr-3 text-gray-800">{l.descricao}</td>
              <td className={`whitespace-nowrap py-1 text-right font-mono tabular-nums ${l.entrada ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(l.entrada || -l.saida)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ord.length > 30 && (
        <button onClick={() => setVerTodos(v => !v)} className="mt-1 text-[12px] font-medium text-blue-600 hover:underline">
          {verTodos ? 'Ver menos' : `Ver todos (${ord.length})`}
        </button>
      )}
    </div>
  );
}
