// LMC — Livro de Movimentação de Combustíveis (Webposto, /INTEGRACAO/V1/LMCS).
// Mesmo painel para a CCI (AdminLmc) e para o cliente (ClienteLmc).
//
// Cada linha do LMC = um combustível num dia:
//   disponível  = abertura + entrada
//   escritural  = disponível − saída          (o que DEVERIA ter no tanque)
//   fechamento  = medição física do tanque
//   perda/sobra = fechamento − escritural      (< 0 falta · > 0 sobra)
// Tolerância: a ANP (Portaria DNC 26/1992) pede justificativa quando a perda
// ou sobra do dia passa de 0,6% do estoque disponível — esses dias ficam
// destacados. Clicar num dia (linha da tabela ou card no celular) abre um
// MODAL com o resumo do dia e o detalhe de tanques, bicos (encerrantes,
// aferição, venda) e notas de entrada — com setas para o dia anterior/seguinte.

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileDown, FileSpreadsheet, MessageCircle, Fuel, Loader2, TrendingDown, TrendingUp, FileText, Gauge, Droplets,
} from 'lucide-react';
import * as qualityApi from '../../services/qualityApiService';
import { formatCurrency } from '../../utils/format';
import Modal from '../ui/Modal';
import GraficoTanquesLmc from './GraficoTanquesLmc';

const TOLERANCIA_ANP = 0.006; // 0,6% do estoque disponível

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const fmtL = (v, casas = 0) => (v == null ? '—'
  : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} L`);
const fmtLs = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L`);
const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const fmtData = (iso) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : '—'; };
const DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSemana = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return DIAS_SEM[new Date(a, m - 1, d).getDay()]; };

// Normaliza uma linha da API e calcula perda/sobra e a situação do dia.
function normalizar(l) {
  const abertura = num(l.abertura) ?? 0;
  const entrada = num(l.entrada) ?? 0;
  const saida = num(l.saida) ?? 0;
  const disponivel = num(l.disponivel) ?? abertura + entrada;
  const escritural = num(l.escritural) ?? disponivel - saida;
  const fechamento = num(l.fechamento);
  // Pela definição (medido − escritural); sem medição, usa o que veio da API
  const perdaSobra = fechamento != null ? fechamento - escritural : num(l.perdaSobra);
  const pct = perdaSobra != null && disponivel > 0 ? perdaSobra / disponivel : null;
  // A regra é "ACIMA de 0,6%". Compara o percentual com 2 casas — o mesmo que
  // aparece na tela —, não o valor cru: um dia EXATAMENTE no limite (ex.:
  // 33,126 L de 5.521 L = 0,6000%) daria 0,60000000001% pelo arredondamento do
  // ponto flutuante e seria marcado por engano.
  const pctTela = pct == null ? null : Math.round(Math.abs(pct) * 10000) / 100; // ex.: 0.6 (= 0,60%)
  const acimaDoLimite = pctTela != null && pctTela > TOLERANCIA_ANP * 100;
  const situacao = perdaSobra == null ? 'sem_medicao'
    : Math.abs(perdaSobra) < 0.5 ? 'ok'
      : acimaDoLimite ? (perdaSobra < 0 ? 'falta_alta' : 'sobra_alta')
        : perdaSobra < 0 ? 'falta' : 'sobra';
  const produtos = Array.isArray(l.produtoCodigo) ? l.produtoCodigo : (l.produtoCodigo != null ? [l.produtoCodigo] : []);
  return {
    id: l.lmcCodigo ?? l.codigo ?? `${l.produtoLmcCodigo}-${l.dataMovimento}`,
    data: String(l.dataMovimento || '').slice(0, 10),
    chaveProduto: String(l.produtoLmcCodigo ?? produtos.join('+')),
    produtos, abertura, entrada, saida, disponivel, escritural, fechamento, perdaSobra, pct, situacao,
    precoCusto: num(l.precoCusto),
    tanques: l.lmcTanque || [], bicos: l.lmcBico || [], notas: l.lmcNota || [],
    usuario: l.ultimoUsuarioAlteracao || '', atualizadoEm: l.dataHoraAtualizacao || null,
  };
}

const SITUACAO = {
  ok:          { rot: 'Sem diferença', cls: 'bg-gray-100 text-gray-700', barra: 'border-l-gray-300', icone: CheckCircle2 },
  sobra:       { rot: 'Sobra', cls: 'bg-blue-50 text-blue-800', barra: 'border-l-blue-400', icone: TrendingUp },
  falta:       { rot: 'Falta', cls: 'bg-amber-50 text-amber-800', barra: 'border-l-amber-400', icone: TrendingDown },
  sobra_alta:  { rot: 'Sobra acima de 0,6%', cls: 'bg-violet-50 text-violet-800', barra: 'border-l-violet-500', icone: AlertTriangle },
  falta_alta:  { rot: 'Falta acima de 0,6%', cls: 'bg-red-50 text-red-800', barra: 'border-l-red-500', icone: AlertTriangle },
  sem_medicao: { rot: 'Sem medição', cls: 'bg-gray-100 text-gray-600', barra: 'border-l-gray-200', icone: Gauge },
};
const corPerda = (v) => (v == null || Math.abs(v) < 0.5 ? 'text-gray-700' : v < 0 ? 'text-red-700' : 'text-blue-800');

export default function PainelLmc({ apiKey, empresaCodigo, dataInicial, dataFinal, recarga = 0, empresaNome = '' }) {
  const [linhas, setLinhas] = useState([]);
  const [nomes, setNomes] = useState(new Map());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [produtoSel, setProdutoSel] = useState('');
  const [soAlertas, setSoAlertas] = useState(false);
  const [diaAbertoId, setDiaAbertoId] = useState(null); // dia mostrado no modal
  const [listaAlertasAberta, setListaAlertasAberta] = useState(false);
  const [gerando, setGerando] = useState(null); // 'pdf' | 'excel' | 'whats' enquanto gera

  useEffect(() => {
    if (!apiKey || empresaCodigo == null || !dataInicial || !dataFinal) return undefined;
    let cancelado = false;
    (async () => {
      setCarregando(true); setErro(null);
      try {
        const [lmcs, prods] = await Promise.all([
          qualityApi.buscarLmcs(apiKey, { dataInicial, dataFinal, empresaCodigo }),
          qualityApi.buscarProdutos(apiKey).catch(() => []),
        ]);
        if (cancelado) return;
        const m = new Map();
        (prods || []).forEach(p => m.set(String(p.produtoCodigo ?? p.codigo), p.nome || p.descricao || ''));
        setNomes(m);
        setLinhas((lmcs || []).map(normalizar).sort((a, b) => a.data.localeCompare(b.data)));
      } catch (e) {
        if (!cancelado) { setErro(e.message); setLinhas([]); }
      } finally { if (!cancelado) setCarregando(false); }
    })();
    return () => { cancelado = true; };
  }, [apiKey, empresaCodigo, dataInicial, dataFinal, recarga]);

  const nomeProduto = (codigos) => codigos.map(c => nomes.get(String(c)) || `Produto ${c}`).join(' / ') || 'Combustível';

  // Resumo por combustível (período)
  const produtos = useMemo(() => {
    const m = new Map();
    linhas.forEach(l => {
      const p = m.get(l.chaveProduto) || {
        chave: l.chaveProduto, codigos: l.produtos, entrada: 0, saida: 0, perdaSobra: 0, dias: 0, alertas: 0, ultimo: null,
      };
      p.entrada += l.entrada; p.saida += l.saida; p.dias += 1;
      if (l.perdaSobra != null) p.perdaSobra += l.perdaSobra;
      if (l.situacao === 'falta_alta' || l.situacao === 'sobra_alta') p.alertas += 1;
      if (!p.ultimo || l.data > p.ultimo.data) p.ultimo = l;
      m.set(l.chaveProduto, p);
    });
    return [...m.values()].sort((a, b) => nomeProduto(a.codigos).localeCompare(nomeProduto(b.codigos)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, nomes]);

  const ativo = produtoSel && produtos.some(p => p.chave === produtoSel) ? produtoSel : produtos[0]?.chave || '';
  const dias = useMemo(() => linhas
    .filter(l => l.chaveProduto === ativo)
    .filter(l => !soAlertas || l.situacao === 'falta_alta' || l.situacao === 'sobra_alta')
    .sort((a, b) => b.data.localeCompare(a.data)), [linhas, ativo, soAlertas]);
  const totalAlertas = produtos.reduce((s, p) => s + p.alertas, 0);

  // Relatórios (PDF / Excel / WhatsApp) — ver src/utils/relatorioLmc.js.
  // Carregados sob demanda (jspdf/xlsx são pesados).
  const contextoRelatorio = () => ({
    empresa: empresaNome, de: dataInicial, ate: dataFinal, linhas,
    nomeDe: (l) => nomeProduto(l.produtos),
  });
  const baixarPdf = async () => {
    setGerando('pdf');
    try {
      const r = await import('../../utils/relatorioLmc');
      const ctx = contextoRelatorio();
      r.gerarPdfLmc(ctx).save(r.nomeArquivoLmc(ctx, 'pdf'));
    } finally { setGerando(null); }
  };
  const baixarExcel = async () => {
    setGerando('excel');
    try { (await import('../../utils/relatorioLmc')).exportarExcelLmc(contextoRelatorio()); }
    finally { setGerando(null); }
  };
  // WhatsApp: só COPIA o resumo já formatado (*negrito* do WhatsApp) para a
  // pessoa colar em qualquer conversa — não abre o app.
  const [copiado, setCopiado] = useState(false);
  const copiarParaWhatsapp = async () => {
    setGerando('whats');
    try {
      const texto = (await import('../../utils/relatorioLmc')).textoWhatsappLmc(contextoRelatorio());
      try { await navigator.clipboard.writeText(texto); }
      catch {
        // Sem a API de área de transferência (ex.: http sem https): cópia pelo jeito antigo
        const ta = document.createElement('textarea');
        ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } finally { setGerando(null); }
  };
  const abrirDiaDaLista = (l) => {
    setListaAlertasAberta(false);
    setSoAlertas(false);
    setProdutoSel(l.chaveProduto);
    setDiaAbertoId(l.id);
  };
  const diasDoProduto = useMemo(() => linhas.filter(l => l.chaveProduto === ativo), [linhas, ativo]);

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200/60 bg-white py-16 text-sm text-gray-600 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-blue-700" /> Buscando o LMC no Webposto…
      </div>
    );
  }
  if (erro) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Erro ao buscar o LMC: {erro}</div>;
  }
  if (linhas.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200/60 bg-white px-6 py-14 text-center shadow-sm">
        <Fuel className="mx-auto mb-3 h-8 w-8 text-gray-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-gray-900">Nenhum lançamento de LMC no período.</p>
        <p className="mt-1 text-xs text-gray-600">Confira o período escolhido ou se o LMC já foi lançado no Webposto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Aviso geral + ações: ver os dias, PDF, Excel, WhatsApp */}
      <div className={`flex flex-col gap-3 rounded-xl border p-3 sm:p-4 lg:flex-row lg:items-center ${totalAlertas ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {totalAlertas
            ? <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-700" aria-hidden="true" />
            : <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-700" aria-hidden="true" />}
          <p className={`text-sm ${totalAlertas ? 'text-red-900' : 'text-blue-900'}`}>
            {totalAlertas
              ? <><strong>{totalAlertas} dia(s)</strong> com perda ou sobra acima de 0,6% do estoque disponível — limite em que a ANP pede justificativa.</>
              : <>Nenhum dia com perda ou sobra acima de 0,6% do estoque disponível no período.</>}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:flex-shrink-0">
          {totalAlertas > 0 && (
            <button type="button" onClick={() => setListaAlertasAberta(true)}
              className="col-span-2 inline-flex h-11 sm:h-9 items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3.5 text-sm font-semibold text-white hover:bg-red-800">
              <Eye className="h-4 w-4" aria-hidden="true" /> Ver os {totalAlertas} dias
            </button>
          )}
          <BotaoAcao onClick={baixarPdf} gerando={gerando === 'pdf'} icone={FileDown} rot="PDF" titulo="Baixar relatório em PDF" />
          <BotaoAcao onClick={baixarExcel} gerando={gerando === 'excel'} icone={FileSpreadsheet} rot="Excel" titulo="Baixar planilha Excel" />
          <BotaoAcao onClick={copiarParaWhatsapp} gerando={gerando === 'whats'} icone={copiado ? Check : MessageCircle}
            rot={copiado ? 'Copiado! Cole na conversa' : 'Copiar p/ WhatsApp'} feito={copiado}
            titulo="Copia o resumo formatado para colar numa conversa do WhatsApp" cls="col-span-2 sm:col-span-1" />
        </div>
      </div>

      {/* Resumo por combustível (toque = escolher) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {produtos.map(p => {
          const on = p.chave === ativo;
          const pctPeriodo = p.saida > 0 ? p.perdaSobra / p.saida : null;
          return (
            <button key={p.chave} type="button" onClick={() => setProdutoSel(p.chave)} aria-pressed={on}
              className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors ${on ? 'border-blue-700 ring-1 ring-blue-700' : 'border-gray-200/70 hover:border-gray-300'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${on ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-700'}`}>
                    <Fuel className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{nomeProduto(p.codigos)}</p>
                </div>
                {p.alertas > 0 && (
                  <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {p.alertas}
                  </span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div><dt className="text-gray-600">Entradas</dt><dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-gray-900">{fmtL(p.entrada)}</dd></div>
                <div><dt className="text-gray-600">Vendas</dt><dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-gray-900">{fmtL(p.saida)}</dd></div>
                <div><dt className="text-gray-600">Perda/sobra</dt>
                  <dd className={`mt-0.5 text-[13px] font-semibold tabular-nums ${corPerda(p.perdaSobra)}`}>{fmtLs(p.perdaSobra)}</dd></div>
              </dl>
              <p className="mt-2 text-[11px] text-gray-600">
                {pctPeriodo != null && <>{fmtPct(pctPeriodo)} das vendas · </>}
                Estoque em {fmtData(p.ultimo?.data)}: <strong className="tabular-nums text-gray-800">{fmtL(p.ultimo?.fechamento ?? p.ultimo?.escritural)}</strong>
              </p>
            </button>
          );
        })}
      </div>

      {/* Gráfico: sobras e faltas por tanque, dia a dia (todos os dias do combustível — o filtro da tabela não se aplica) */}
      <GraficoTanquesLmc dias={diasDoProduto} />

      {/* Livro diário do combustível escolhido */}
      <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 px-4 py-3">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-900">
            <Droplets className="h-4 w-4 flex-shrink-0 text-blue-700" aria-hidden="true" />
            <span className="truncate">Livro diário · {nomeProduto(produtos.find(p => p.chave === ativo)?.codigos || [])}</span>
          </h3>
          <label className="ml-auto inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-[13px] text-gray-700">
            <input type="checkbox" checked={soAlertas} onChange={e => setSoAlertas(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            Só acima de 0,6%
          </label>
        </div>

        {dias.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-600">Nenhum dia acima da tolerância para este combustível.</p>
        ) : (<>
          {/* CELULAR: cards por dia */}
          <ul className="md:hidden space-y-2.5 bg-gray-50 p-2.5">
            {dias.map(l => <CardDia key={l.id} l={l} onAbrir={() => setDiaAbertoId(l.id)} />)}
          </ul>
          {/* DESKTOP: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-right text-[10px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Data</th>
                  <th className="px-3 py-2.5">Abertura</th>
                  <th className="px-3 py-2.5">Entrada</th>
                  <th className="px-3 py-2.5">Disponível</th>
                  <th className="px-3 py-2.5">Saída</th>
                  <th className="px-3 py-2.5">Escritural</th>
                  <th className="px-3 py-2.5">Fechamento</th>
                  <th className="px-3 py-2.5">Perda/sobra</th>
                  <th className="px-3 py-2.5">%</th>
                  <th className="px-4 py-2.5 text-left">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dias.map(l => <LinhaDia key={l.id} l={l} onAbrir={() => setDiaAbertoId(l.id)} />)}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
      <p className="text-[11px] text-gray-600">
        Perda/sobra = fechamento medido − estoque escritural (disponível − saída). Negativo é falta; positivo é sobra.
        Destaque quando passa de 0,6% do estoque disponível do dia.
      </p>
      <ModalDiasAlerta aberto={listaAlertasAberta} linhas={linhas} nomeDe={(l) => nomeProduto(l.produtos)}
        onFechar={() => setListaAlertasAberta(false)} onAbrirDia={abrirDiaDaLista}
        acoes={<>
          <BotaoAcao onClick={baixarPdf} gerando={gerando === 'pdf'} icone={FileDown} rot="PDF" titulo="Baixar relatório em PDF" />
          <BotaoAcao onClick={baixarExcel} gerando={gerando === 'excel'} icone={FileSpreadsheet} rot="Excel" titulo="Baixar planilha Excel" />
          <BotaoAcao onClick={copiarParaWhatsapp} gerando={gerando === 'whats'} icone={copiado ? Check : MessageCircle}
            rot={copiado ? 'Copiado!' : 'Copiar p/ WhatsApp'} feito={copiado} titulo="Copia o resumo formatado para colar numa conversa do WhatsApp" />
        </>} />
      <ModalDia dias={dias} id={diaAbertoId} nomeProduto={nomeProduto(produtos.find(p => p.chave === ativo)?.codigos || [])}
        onTrocar={setDiaAbertoId} onFechar={() => setDiaAbertoId(null)} />
    </div>
  );
}

function BotaoAcao({ onClick, gerando, icone: Icone, rot, titulo, cls = '', feito = false }) {
  return (
    <button type="button" onClick={onClick} disabled={gerando} title={titulo} aria-live="polite"
      className={`inline-flex h-11 sm:h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium disabled:opacity-60 ${
        feito ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'} ${cls}`}>
      {gerando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icone className="h-4 w-4" aria-hidden="true" />} {rot}
    </button>
  );
}

// Lista de todos os dias acima de 0,6% (todos os combustíveis). Clique → abre o dia.
function ModalDiasAlerta({ aberto, linhas, nomeDe, onFechar, onAbrirDia, acoes }) {
  const lista = useMemo(() => linhas
    .filter(l => l.situacao === 'falta_alta' || l.situacao === 'sobra_alta')
    .sort((a, b) => b.data.localeCompare(a.data) || nomeDe(a).localeCompare(nomeDe(b))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [linhas]);
  return (
    <Modal open={aberto} onClose={onFechar} size="xl"
      title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-700" aria-hidden="true" /> Dias acima de 0,6% do estoque disponível</span>}
      footer={<div className="grid grid-cols-3 gap-2 sm:flex sm:justify-end">{acoes}</div>}>
      <p className="mb-3 text-[13px] text-gray-600">{lista.length} dia(s). Clique num dia para ver tanques, bicos e notas.</p>
      {/* Desktop: tabela */}
      <table className="hidden w-full text-sm sm:table">
        <thead className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
          <tr className="text-right">
            <th className="py-2 text-left">Data</th><th className="py-2 text-left">Combustível</th>
            <th className="py-2">Disponível</th><th className="py-2">Perda/sobra</th><th className="py-2">%</th><th className="py-2 pl-3 text-left">Situação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lista.map(l => (
            <tr key={l.id} onClick={() => onAbrirDia(l)} tabIndex={0} role="button"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrirDia(l); } }}
              className="cursor-pointer text-right tabular-nums hover:bg-gray-50 focus:outline-none focus-visible:bg-blue-50/60">
              <td className="whitespace-nowrap py-2.5 text-left font-medium text-gray-900">{fmtData(l.data)} <span className="text-[11px] font-normal text-gray-500">{diaSemana(l.data)}</span></td>
              <td className="py-2.5 text-left text-gray-800">{nomeDe(l)}</td>
              <td className="py-2.5 text-gray-700">{fmtL(l.disponivel)}</td>
              <td className={`py-2.5 font-semibold ${corPerda(l.perdaSobra)}`}>{fmtLs(l.perdaSobra)}</td>
              <td className="py-2.5 font-semibold text-red-700">{fmtPct(l.pct)}</td>
              <td className="py-2.5 pl-3 text-left"><SeloSituacao s={l.situacao} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Celular: lista */}
      <ul className="space-y-2 sm:hidden">
        {lista.map(l => (
          <li key={l.id}>
            <button type="button" onClick={() => onAbrirDia(l)}
              className={`flex w-full items-center gap-3 rounded-xl border border-l-4 border-gray-200 bg-white p-3 text-left active:bg-gray-50 ${(SITUACAO[l.situacao] || SITUACAO.ok).barra}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{fmtData(l.data)} <span className="text-xs font-normal text-gray-500">{diaSemana(l.data)}</span></p>
                <p className="truncate text-[13px] text-gray-700">{nomeDe(l)}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-semibold tabular-nums ${corPerda(l.perdaSobra)}`}>{fmtLs(l.perdaSobra)}</p>
                <p className="text-xs tabular-nums text-red-700">{fmtPct(l.pct)}</p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function SeloSituacao({ s }) {
  const c = SITUACAO[s] || SITUACAO.ok;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.cls}`}>
      <c.icone className="h-3 w-3" aria-hidden="true" /> {c.rot}
    </span>
  );
}

function LinhaDia({ l, onAbrir }) {
  const alerta = l.situacao === 'falta_alta' || l.situacao === 'sobra_alta';
  return (
    <tr onClick={onAbrir} tabIndex={0} role="button" aria-label={`Ver detalhes de ${fmtData(l.data)}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}
      className={`cursor-pointer text-right tabular-nums hover:bg-gray-50/70 focus:outline-none focus-visible:bg-blue-50/60 ${alerta ? 'bg-red-50/40' : ''}`}>
        <td className="whitespace-nowrap px-4 py-2.5 text-left">
          <span className="inline-flex items-center gap-1.5 font-medium text-gray-900">
            {fmtData(l.data)} <span className="text-[11px] font-normal text-gray-500">{diaSemana(l.data)}</span>
          </span>
        </td>
        <td className="px-3 py-2.5 text-gray-700">{fmtL(l.abertura)}</td>
        <td className="px-3 py-2.5 text-gray-700">{l.entrada ? fmtL(l.entrada) : '—'}</td>
        <td className="px-3 py-2.5 text-gray-700">{fmtL(l.disponivel)}</td>
        <td className="px-3 py-2.5 text-gray-700">{fmtL(l.saida)}</td>
        <td className="px-3 py-2.5 text-gray-700">{fmtL(l.escritural)}</td>
        <td className="px-3 py-2.5 font-medium text-gray-900">{fmtL(l.fechamento)}</td>
        <td className={`px-3 py-2.5 font-semibold ${corPerda(l.perdaSobra)}`}>{fmtLs(l.perdaSobra)}</td>
        <td className={`px-3 py-2.5 ${alerta ? 'font-semibold text-red-700' : 'text-gray-600'}`}>{fmtPct(l.pct)}</td>
        <td className="px-4 py-2.5 text-left"><SeloSituacao s={l.situacao} /></td>
    </tr>
  );
}

function CardDia({ l, onAbrir }) {
  const c = SITUACAO[l.situacao] || SITUACAO.ok;
  return (
    <li className={`rounded-xl border border-l-4 border-gray-200 bg-white shadow-sm ${c.barra}`}>
      <button type="button" onClick={onAbrir} aria-haspopup="dialog" className="w-full p-4 text-left active:bg-gray-50 rounded-xl">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px] font-semibold text-gray-900">{fmtData(l.data)} <span className="text-xs font-normal text-gray-500">{diaSemana(l.data)}</span></p>
          <SeloSituacao s={l.situacao} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-x-2 gap-y-2.5 text-[11px]">
          <Par rot="Abertura" v={fmtL(l.abertura)} />
          <Par rot="Entrada" v={l.entrada ? fmtL(l.entrada) : '—'} />
          <Par rot="Saída" v={fmtL(l.saida)} />
          <Par rot="Escritural" v={fmtL(l.escritural)} />
          <Par rot="Fechamento" v={fmtL(l.fechamento)} forte />
          <Par rot="Perda/sobra" v={`${fmtLs(l.perdaSobra)}`} cls={corPerda(l.perdaSobra)} forte extra={fmtPct(l.pct)} />
        </dl>
        <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-blue-700">
          Ver tanques, bicos e notas <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}

// Modal do dia: resumo + detalhe (tanques, bicos, notas). As setas andam pelos
// dias da lista atual (mesma ordem e filtro da tabela); ← → no teclado também.
function ModalDia({ dias, id, nomeProduto, onTrocar, onFechar }) {
  const idx = dias.findIndex(d => d.id === id);
  const l = idx >= 0 ? dias[idx] : null;
  // dias vem do mais recente para o mais antigo: "anterior" = idx + 1
  const anterior = idx >= 0 && idx < dias.length - 1 ? dias[idx + 1] : null;
  const seguinte = idx > 0 ? dias[idx - 1] : null;

  useEffect(() => {
    if (!l) return undefined;
    const tecla = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowLeft' && anterior) onTrocar(anterior.id);
      if (e.key === 'ArrowRight' && seguinte) onTrocar(seguinte.id);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [l, anterior, seguinte, onTrocar]);

  const alerta = l && (l.situacao === 'falta_alta' || l.situacao === 'sobra_alta');
  return (
    <Modal open={!!l} onClose={onFechar} size="xxl"
      title={l ? <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Fuel className="h-4 w-4 text-blue-700" aria-hidden="true" />
        <span>{nomeProduto} · {fmtData(l.data)}</span>
        <span className="text-sm font-normal text-gray-500">{diaSemana(l.data)}</span>
        <SeloSituacao s={l.situacao} />
      </span> : ''}
      footer={l && (
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => anterior && onTrocar(anterior.id)} disabled={!anterior}
            className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Dia anterior</span><span className="sm:hidden">Anterior</span>
          </button>
          <span className="text-xs tabular-nums text-gray-500">{dias.length - idx} de {dias.length}</span>
          <button type="button" onClick={() => seguinte && onTrocar(seguinte.id)} disabled={!seguinte}
            className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40">
            <span className="hidden sm:inline">Próximo dia</span><span className="sm:hidden">Próximo</span> <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}>
      {l && (
        <div className="space-y-4">
          {/* Resumo do dia */}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {[
              ['Abertura', fmtL(l.abertura)],
              ['Entrada', l.entrada ? fmtL(l.entrada) : '—'],
              ['Disponível', fmtL(l.disponivel)],
              ['Saída', fmtL(l.saida)],
              ['Escritural', fmtL(l.escritural)],
              ['Fechamento', fmtL(l.fechamento)],
            ].map(([rot, v]) => (
              <div key={rot} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                <dt className="text-[11px] text-gray-600">{rot}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">{v}</dd>
              </div>
            ))}
            <div className={`col-span-2 rounded-xl border px-3 py-2 ${alerta ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50/60'}`}>
              <dt className="text-[11px] text-gray-600">Perda / sobra</dt>
              <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${corPerda(l.perdaSobra)}`}>
                {fmtLs(l.perdaSobra)} <span className={`text-xs font-medium ${alerta ? 'text-red-700' : 'text-gray-600'}`}>({fmtPct(l.pct)} do disponível)</span>
              </dd>
            </div>
          </dl>
          {alerta && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              Passou de 0,6% do estoque disponível do dia — a ANP pede justificativa.
            </p>
          )}
          <DetalheDia l={l} />
        </div>
      )}
    </Modal>
  );
}

function Par({ rot, v, cls = 'text-gray-900', forte = false, extra }) {
  return (
    <div className="min-w-0">
      <dt className="text-gray-600">{rot}</dt>
      <dd className={`mt-0.5 truncate text-[13px] tabular-nums ${forte ? 'font-semibold' : ''} ${cls}`}>
        {v}{extra && <span className="block text-[11px] font-normal text-gray-600">{extra}</span>}
      </dd>
    </div>
  );
}

// Tanques, bicos (encerrantes) e notas de entrada do dia
function DetalheDia({ l }) {
  const encerranteVenda = l.bicos.reduce((s, b) => s + (num(b.venda) ?? 0), 0);
  const afericao = l.bicos.reduce((s, b) => s + (num(b.afericao) ?? 0), 0);
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Bloco titulo="Tanques" icone={Droplets} vazio="Sem detalhe por tanque.">
        {l.tanques.length > 0 && (
          <table className="w-full text-[12px] tabular-nums">
            <thead><tr className="text-right text-[10px] uppercase tracking-wider text-gray-500">
              <th className="py-1 text-left">Tanque</th><th className="py-1">Abertura</th><th className="py-1">Escritural</th><th className="py-1">Fechamento</th><th className="py-1">Dif.</th>
            </tr></thead>
            <tbody>{l.tanques.map(t => {
              const dif = num(t.fechamento) != null && num(t.escritural) != null ? num(t.fechamento) - num(t.escritural) : null;
              return (
                <tr key={t.lmcTanqueCodigo ?? t.tanqueCodigo} className="border-t border-gray-100 text-right">
                  <td className="py-1.5 text-left font-medium text-gray-800">Tanque {t.tanqueCodigo}</td>
                  <td className="py-1.5 text-gray-700">{fmtL(num(t.abertura))}</td>
                  <td className="py-1.5 text-gray-700">{fmtL(num(t.escritural))}</td>
                  <td className="py-1.5 text-gray-900">{fmtL(num(t.fechamento))}</td>
                  <td className={`py-1.5 font-semibold ${corPerda(dif)}`}>{fmtLs(dif)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </Bloco>
      <Bloco titulo="Bicos (encerrantes)" icone={Gauge} vazio="Sem detalhe por bico.">
        {l.bicos.length > 0 && (<>
          <table className="w-full text-[12px] tabular-nums">
            <thead><tr className="text-right text-[10px] uppercase tracking-wider text-gray-500">
              <th className="py-1 text-left">Bico</th><th className="py-1">Abertura</th><th className="py-1">Fechamento</th><th className="py-1">Aferição</th><th className="py-1">Venda</th>
            </tr></thead>
            <tbody>{l.bicos.map(b => (
              <tr key={b.lmcBicoCodigo ?? b.bicoCodigo} className="border-t border-gray-100 text-right">
                <td className="py-1.5 text-left text-gray-800">
                  <span className="font-medium">Bico {b.bicoCodigo}</span>
                  <span className="block text-[10px] text-gray-500">Tq {b.tanqueCodigo}{b.bombaCodigo != null ? ` · Bomba ${b.bombaCodigo}` : ''}</span>
                </td>
                <td className="py-1.5 text-gray-700">{num(b.abertura)?.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) ?? '—'}</td>
                <td className="py-1.5 text-gray-700">{num(b.fechamento)?.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) ?? '—'}</td>
                <td className="py-1.5 text-gray-700">{num(b.afericao) ? fmtL(num(b.afericao), 2) : '—'}</td>
                <td className="py-1.5 font-medium text-gray-900">{fmtL(num(b.venda), 2)}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="mt-1.5 text-[11px] text-gray-600">
            Venda pelos encerrantes: <strong className="tabular-nums">{fmtL(encerranteVenda, 2)}</strong>
            {afericao > 0 && <> · aferição <strong className="tabular-nums">{fmtL(afericao, 2)}</strong></>}
          </p>
        </>)}
      </Bloco>
      <Bloco titulo="Notas de entrada" icone={FileText} vazio="Sem entrada de combustível neste dia.">
        {l.notas.length > 0 && (
          <ul className="space-y-1.5 text-[12px]">
            {l.notas.map((n, i) => (
              <li key={`${n.compraCodigo}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-gray-100">
                <span className="min-w-0 text-gray-800">
                  NF <strong>{n.numeroNota || '—'}</strong>
                  <span className="block text-[10px] text-gray-500">Tanque {n.tanqueCodigo} · entrada {fmtData(n.dataEntrada)}</span>
                </span>
                <span className="flex-shrink-0 font-semibold tabular-nums text-gray-900">{fmtL(num(n.volumeRecebido))}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloco>
      {(l.usuario || l.precoCusto != null) && (
        <p className="text-[11px] text-gray-600 lg:col-span-3">
          {l.precoCusto != null && <>Preço de custo {formatCurrency(l.precoCusto)}/L · </>}
          {l.usuario && <>Última alteração por <strong>{l.usuario}</strong></>}
          {l.atualizadoEm && <> em {new Date(l.atualizadoEm).toLocaleString('pt-BR')}</>}
        </p>
      )}
    </div>
  );
}

function Bloco({ titulo, icone: Icone, vazio, children }) {
  const temConteudo = Array.isArray(children) ? children.some(Boolean) : !!children;
  return (
    <section className="rounded-xl border border-gray-200/70 bg-gray-50/60 p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" /> {titulo}
      </h4>
      {temConteudo ? <div className="overflow-x-auto">{children}</div> : <p className="text-[12px] text-gray-600">{vazio}</p>}
    </section>
  );
}
