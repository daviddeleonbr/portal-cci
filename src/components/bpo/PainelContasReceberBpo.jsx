// BPO · Contas a receber — painel do admin: as quatro carteiras em aberto de uma
// rede (notas a prazo, faturas, cheques e cartões). Só consulta.
//   - Cartões no Webposto carregam à parte (volume alto) e são agrupados em LOTES
//     por empresa + administradora + vencimento; clicar no lote abre as transações.
//   - Cartão vencido e ainda pendente = falta dar baixa no sistema (em geral já
//     caiu no banco). Por isso é destacado à parte, não como inadimplência.
// Dados: services/bpoContasReceberService.js.

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarDays, ChevronDown, CreditCard, FileCheck, FileDown, Info, Landmark, Loader2,
  Receipt, Search, Wallet, X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '../ui/Modal';
import BarraProgressoFetch from '../ui/BarraProgressoFetch';
import * as crService from '../../services/bpoContasReceberService';
import { formatCurrency } from '../../utils/format';
import { hojeBR } from '../../utils/dataBR';

// ─── Helpers ─────────────────────────────────────────────────
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const diaSemana = (iso) => (iso ? DIAS[new Date(`${iso}T12:00:00`).getDay()] : '');
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86400000);
const soma = (l) => l.reduce((s, t) => s + t.valor, 0);
const contar = (l) => l.reduce((s, t) => s + (t.itens ? t.itens.length : 1), 0);
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

const TIPOS = {
  nota: { rotulo: 'Nota a prazo', plural: 'Notas a prazo', Icone: Receipt },
  fatura: { rotulo: 'Fatura', plural: 'Faturas', Icone: Landmark },
  cheque: { rotulo: 'Cheque', plural: 'Cheques', Icone: FileCheck },
  cartao: { rotulo: 'Cartão', plural: 'Cartões', Icone: CreditCard },
};
const ORDEM = ['nota', 'fatura', 'cheque', 'cartao'];

// Faixas de prazo (dias até o vencimento efetivo; negativo = vencido)
const FAIXAS = [
  { k: 'v90', rotulo: 'Vencido há +90 dias', curto: '+90 dias', vencido: true, bate: d => d < -90 },
  { k: 'v31', rotulo: 'Vencido há 31 a 90 dias', curto: '31 a 90', vencido: true, bate: d => d >= -90 && d < -30 },
  { k: 'v30', rotulo: 'Vencido há até 30 dias', curto: 'Até 30', vencido: true, bate: d => d >= -30 && d < 0 },
  { k: 'hoje', rotulo: 'Vence hoje', curto: 'Hoje', bate: d => d === 0 },
  { k: 'a7', rotulo: 'Vence em até 7 dias', curto: '1 a 7', bate: d => d > 0 && d <= 7 },
  { k: 'a30', rotulo: 'Vence em 8 a 30 dias', curto: '8 a 30', bate: d => d > 7 && d <= 30 },
  { k: 'a31', rotulo: 'Vence depois de 30 dias', curto: '+30 dias', bate: d => d > 30 },
];
const JANELAS = [[30, 'últimos 30 dias'], [90, 'últimos 90 dias'], [180, 'últimos 6 meses'], [365, 'último ano']];
const POR_VEZ = 60;

function situacao(t) {
  if (t.dias == null) return { txt: 'Sem vencimento', cls: 'bg-gray-100 text-gray-700 ring-gray-200' };
  if (t.dias < 0) {
    return t.tipo === 'cartao'
      ? { txt: `Sem baixa há ${plural(-t.dias, 'dia', 'dias')}`, cls: 'bg-amber-50 text-amber-800 ring-amber-200' }
      : { txt: `Vencido há ${plural(-t.dias, 'dia', 'dias')}`, cls: 'bg-red-50 text-red-700 ring-red-200' };
  }
  if (t.dias === 0) return { txt: 'Vence hoje', cls: 'bg-amber-50 text-amber-800 ring-amber-200' };
  return { txt: `Vence em ${plural(t.dias, 'dia', 'dias')}`, cls: 'bg-gray-100 text-gray-700 ring-gray-200' };
}

// Cartões viram lotes por empresa + administradora + vencimento efetivo
function agruparCartoes(titulos) {
  const m = new Map(), out = [];
  titulos.forEach(t => {
    if (t.tipo !== 'cartao') { out.push(t); return; }
    const k = `${t.empresaId}|${t.cliente}|${t.vencimentoEfetivo}`;
    let l = m.get(k);
    if (!l) {
      l = { ...t, chave: `lote:${k}`, documento: '', emissao: null, valor: 0, liquido: t.liquido == null ? null : 0, itens: [] };
      m.set(k, l); out.push(l);
    }
    l.itens.push(t);
    l.valor += t.valor;
    if (l.liquido != null) l.liquido += t.liquido || 0;
  });
  return out;
}

// ─── Painel ──────────────────────────────────────────────────
// props: tipo 'webposto'|'autosystem', empresas (linhas de `clientes`), redeId
// (as_rede.id), redeNome, recarga (número: muda → busca de novo no sistema)
export default function PainelContasReceberBpo({ tipo, empresas, redeId = null, redeNome = '', recarga = 0 }) {
  const hoje = hojeBR();
  const [titulos, setTitulos] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [outros, setOutros] = useState(null);
  const [erros, setErros] = useState([]);
  const [errosCartao, setErrosCartao] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoCartao, setCarregandoCartao] = useState(tipo === 'webposto');
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [diasVencidos, setDiasVencidos] = useState(90);

  const [visao, setVisao] = useState('vencimento');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [faixa, setFaixa] = useState('todas'); // FAIXAS.k | 'vencidos' | 'avencer' | 'todas'
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [lote, setLote] = useState(null);

  const multi = empresas.length > 1;
  const chaveEmpresas = empresas.map(e => e.id).join(',');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCarregando(true);
      try {
        const r = await crService.buscarTitulosAdmin({
          tipo, empresas, redeId, onProgresso: (feitos, total) => !cancelado && setProgresso({ feitos, total }),
        });
        if (cancelado) return;
        setTitulos(r.titulos); setErros(r.erros); setOutros(r.outros);
      } catch (e) {
        if (!cancelado) { setTitulos([]); setErros([e.message || 'Falha ao carregar']); }
      } finally { if (!cancelado) setCarregando(false); }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, chaveEmpresas, redeId, recarga]);

  // Cartões do Webposto: à parte (no Autosystem já vieram na consulta acima)
  useEffect(() => {
    if (tipo !== 'webposto') return undefined;
    let cancelado = false;
    (async () => {
      setCarregandoCartao(true);
      try {
        const r = await crService.buscarCartoesWebposto({ empresas, diasVencidos });
        if (cancelado) return;
        setCartoes(r.titulos); setErrosCartao(r.erros);
      } catch (e) {
        if (!cancelado) { setCartoes([]); setErrosCartao([`Cartões: ${e.message || 'falha ao carregar'}`]); }
      } finally { if (!cancelado) setCarregandoCartao(false); }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, chaveEmpresas, diasVencidos, recarga]);

  // Linhas da tela: títulos + lotes de cartão, com dias até o vencimento
  const linhas = useMemo(() => agruparCartoes([...titulos, ...cartoes])
    .map(t => ({ ...t, dias: t.vencimentoEfetivo ? diasEntre(hoje, t.vencimentoEfetivo) : null }))
    .sort((a, b) => (a.vencimentoEfetivo || '9').localeCompare(b.vencimentoEfetivo || '9') || b.valor - a.valor),
  [titulos, cartoes, hoje]);

  // Resumo (só filtro de empresa): matriz carteira × faixa
  const daEmpresa = useMemo(() => linhas.filter(t => !empresaFiltro || t.empresaId === empresaFiltro), [linhas, empresaFiltro]);
  const resumo = useMemo(() => {
    const zero = () => ({ total: 0, qtd: 0, vencido: 0, faixas: Object.fromEntries(FAIXAS.map(f => [f.k, 0])) });
    const r = { todos: zero(), ...Object.fromEntries(ORDEM.map(k => [k, zero()])) };
    daEmpresa.forEach(t => {
      const q = t.itens ? t.itens.length : 1;
      const f = t.dias == null ? null : FAIXAS.find(x => x.bate(t.dias));
      [r[t.tipo], r.todos].forEach(x => {
        x.total += t.valor; x.qtd += q;
        if (f) x.faixas[f.k] += t.valor;
        if (f?.vencido && (x !== r.todos || t.tipo !== 'cartao')) x.vencido += t.valor; // total: cartão sem baixa não é inadimplência
      });
    });
    return r;
  }, [daEmpresa]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const f = FAIXAS.find(x => x.k === faixa);
    return daEmpresa.filter(t => {
      if (filtroTipo !== 'todos' && t.tipo !== filtroTipo) return false;
      if (f && !(t.dias != null && f.bate(t.dias))) return false;
      if (faixa === 'vencidos' && !(t.dias < 0 && t.dias != null)) return false;
      if (faixa === 'avencer' && !(t.dias >= 0 && t.dias != null)) return false;
      if (!q) return true;
      return [t.cliente, t.documento, t.documentoCliente, t.empresaNome].some(x => String(x || '').toLowerCase().includes(q))
        || (t.itens || []).some(i => `${i.documento} ${i.nsu || ''}`.toLowerCase().includes(q));
    });
  }, [daEmpresa, filtroTipo, faixa, busca]);

  const filtrado = filtroTipo !== 'todos' || faixa !== 'todas' || !!busca.trim();
  const limpar = () => { setFiltroTipo('todos'); setFaixa('todas'); setBusca(''); };
  const todosErros = [...erros, ...errosCartao];
  // Cartão ainda carregando: total parcial, não mostrar como definitivo
  const cartaoPendente = tipo === 'webposto' && carregandoCartao;
  const chaveLista = `${visao}|${filtroTipo}|${faixa}|${empresaFiltro}|${busca}`;

  const exportar = () => {
    const wb = XLSX.utils.book_new();
    const resumoLinhas = [...ORDEM, 'todos'].map(k => ({
      Carteira: k === 'todos' ? 'Total' : TIPOS[k].plural,
      ...Object.fromEntries(FAIXAS.map(f => [f.rotulo, resumo[k].faixas[f.k]])),
      'Total em aberto': resumo[k].total,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoLinhas), 'Resumo');
    const comuns = (t) => ({ Empresa: t.empresaNome, Vencimento: dataBR(t.vencimento), 'Dias até vencer': t.dias ?? '', Valor: Math.round(t.valor * 100) / 100 });
    const tits = visiveis.filter(t => t.tipo !== 'cartao').map(t => ({
      Tipo: TIPOS[t.tipo].rotulo, Cliente: t.cliente, 'CPF/CNPJ': t.documentoCliente, Documento: t.documento, 'Emissão': dataBR(t.emissao), ...comuns(t),
      'Situação': t.devolvido ? 'Cheque devolvido' : situacao(t).txt,
    }));
    if (tits.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tits), 'Títulos');
    const cars = visiveis.filter(t => t.tipo === 'cartao').flatMap(l => l.itens.map(t => ({
      Administradora: t.cliente, 'Autorização': String(t.documento || '').replace(/^Aut\. /, ''), NSU: t.nsu || '', Parcela: t.parcela ?? '', 'Data da venda': dataBR(t.emissao),
      ...comuns({ ...t, dias: l.dias }), 'Líquido previsto': t.liquido == null ? '' : Math.round(t.liquido * 100) / 100, 'Situação': situacao(l).txt,
    })));
    if (cars.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cars), 'Cartões');
    XLSX.writeFile(wb, `contas-a-receber-${redeNome.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rede'}-${hoje}.xlsx`);
  };

  if (carregando && !titulos.length && !cartoes.length) {
    return (
      <div className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-sm">
        <BarraProgressoFetch loading feitos={progresso.feitos} total={progresso.total} label="Buscando contas a receber no sistema do cliente…" />
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-600"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Carregando…</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 pb-6 transition-opacity ${carregando ? 'opacity-60' : ''}`}>
      {todosErros.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Algumas informações não carregaram: os totais abaixo estão incompletos</p>
          {todosErros.map(e => <p key={e} className="mt-1 text-xs">{e}</p>)}
        </div>
      )}

      {/* Carteiras (clicar filtra) */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <CardCarteira rotulo="Total em aberto" r={resumo.todos} Icone={Wallet} destaque ativo={filtroTipo === 'todos'} onClick={() => setFiltroTipo('todos')}
          nota={cartaoPendente ? 'somando cartões…' : null} />
        {ORDEM.map(k => (
          <CardCarteira key={k} rotulo={TIPOS[k].plural} r={resumo[k]} Icone={TIPOS[k].Icone} cartao={k === 'cartao'}
            carregando={k === 'cartao' && cartaoPendente} ativo={filtroTipo === k}
            onClick={() => setFiltroTipo(a => (a === k ? 'todos' : k))} />
        ))}
      </div>

      <MatrizPrazos resumo={resumo} filtroTipo={filtroTipo} faixa={faixa} cartaoPendente={cartaoPendente}
        onEscolher={(t, f) => {
          if (filtroTipo === t && faixa === f) { setFiltroTipo('todos'); setFaixa('todas'); } else { setFiltroTipo(t); setFaixa(f); }
        }} />

      {(resumo.cartao.vencido > 0 || tipo === 'webposto') && (
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200/60 bg-white p-3 text-xs text-gray-700 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <Info className="mt-px h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              Cartão vencido e ainda em aberto costuma ser <strong>falta de baixa no sistema</strong>: o valor provavelmente já caiu no banco.
              {resumo.cartao.vencido > 0 && !cartaoPendente && <> Nesta seleção: <strong className="tabular-nums">{formatCurrency(resumo.cartao.vencido)}</strong>.</>}
            </span>
          </p>
          {tipo === 'webposto' && (
            <label className="flex shrink-0 items-center gap-2">
              Vencidos dos
              <select value={diasVencidos} onChange={e => setDiasVencidos(Number(e.target.value))} disabled={cartaoPendente}
                className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm disabled:opacity-60">
                {JANELAS.map(([d, r]) => <option key={d} value={d}>{r}</option>)}
              </select>
              {cartaoPendente && <Loader2 className="h-4 w-4 animate-spin text-gray-500" aria-label="Carregando cartões" />}
            </label>
          )}
        </div>
      )}

      {outros?.qtd > 0 && (
        <details className="rounded-xl border border-gray-200/60 bg-white p-3 text-xs text-gray-700 shadow-sm">
          <summary className="cursor-pointer">
            Fora da lista: <strong className="tabular-nums">{formatCurrency(outros.valor)}</strong> em contas 1.3 sem carteira definida ({plural(outros.qtd, 'lançamento', 'lançamentos')}). Confira os prefixos da rede em Editar rede.
          </summary>
          <ul className="mt-2 space-y-1">
            {outros.contas.map(c => <li key={c.nome} className="flex justify-between gap-3"><span className="truncate">{c.nome}</span><span className="tabular-nums">{formatCurrency(c.valor)}</span></li>)}
          </ul>
        </details>
      )}

      {/* Visão + filtros */}
      <div className="space-y-3 rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-full rounded-xl bg-gray-100 p-1 sm:w-auto" role="tablist">
            {[['vencimento', 'Por vencimento'], ['cliente', 'Por cliente'], ...(multi ? [['empresa', 'Por empresa']] : [])].map(([k, r]) => (
              <button key={k} type="button" role="tab" aria-selected={visao === k} onClick={() => setVisao(k)}
                className={`flex-1 whitespace-nowrap rounded-lg px-1.5 py-2 text-[13px] font-semibold transition sm:flex-none sm:px-4 sm:text-sm ${visao === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>
                {r}
              </button>
            ))}
          </div>
          <button type="button" onClick={exportar} disabled={!visiveis.length || cartaoPendente}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <FileDown className="h-4 w-4" aria-hidden="true" /> Excel
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_14rem_16rem]">
          <label className="relative block">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Cliente, CPF/CNPJ, documento, autorização…"
              className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-base sm:text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
          <select value={faixa} onChange={e => setFaixa(e.target.value)} aria-label="Prazo" className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-base sm:text-sm">
            <option value="todas">Todos os prazos</option>
            <option value="vencidos">Vencidos</option>
            <option value="avencer">A vencer</option>
            {FAIXAS.map(f => <option key={f.k} value={f.k}>{f.rotulo}</option>)}
          </select>
          {multi && (
            <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)} aria-label="Empresa" className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-base sm:text-sm">
              <option value="">Todas as empresas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
          <span><strong className="tabular-nums text-gray-900">{formatCurrency(soma(visiveis))}</strong> em {plural(contar(visiveis), 'título', 'títulos')}</span>
          {filtrado && (
            <button type="button" onClick={limpar} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-800">
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpar filtros
            </button>
          )}
        </div>
      </div>

      <ListaAgrupada key={chaveLista} visao={visao} linhas={visiveis} hoje={hoje} multi={multi} carregandoCartao={cartaoPendente} onLote={setLote} />

      <p className="text-xs text-gray-500">
        Títulos em aberto no sistema ({tipo === 'autosystem' ? 'Autosystem' : 'Webposto'}). Vencimentos em fim de semana ou feriado contam no próximo dia útil.
        {tipo === 'webposto' && ' Notas, faturas e cheques: emitidos nos últimos 3 anos. Nota já agrupada em fatura aparece só na fatura. Cartões pelo valor bruto.'}
      </p>

      <ModalLote lote={lote} onClose={() => setLote(null)} />
    </div>
  );
}

function CardCarteira({ rotulo, r, Icone, ativo, onClick, destaque = false, cartao = false, carregando = false, nota = null }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`flex flex-col justify-start rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:border-blue-300 sm:p-4 ${destaque ? 'col-span-2 lg:col-span-1' : ''} ${ativo && !destaque ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200/60'}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${destaque ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-700'}`}><Icone className="h-4 w-4" aria-hidden="true" /></span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{rotulo}</p>
      </div>
      {carregando ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>
      ) : (
        <>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-gray-900">{formatCurrency(r.total)}</p>
          <p className="text-[11px] text-gray-500">{nota || plural(r.qtd, cartao ? 'transação' : 'título', cartao ? 'transações' : 'títulos')}</p>
          {r.vencido > 0 && (
            <p className={`text-[11px] font-semibold tabular-nums ${cartao ? 'text-amber-700' : 'text-red-700'}`}>{formatCurrency(r.vencido)} {cartao ? 'sem baixa' : 'vencido'}</p>
          )}
        </>
      )}
    </button>
  );
}

function CelulaPrazo({ v, ativo, onClick, forte = false, vermelho = false }) {
  if (!(Math.abs(v) > 0.004)) return <td className="px-3 py-2 text-right text-gray-300">–</td>;
  return (
    <td className="p-1 text-right">
      <button type="button" onClick={onClick} aria-pressed={ativo}
        className={`w-full whitespace-nowrap rounded-md px-2 py-1 text-right tabular-nums hover:bg-blue-50 ${ativo ? 'bg-blue-50 ring-1 ring-blue-300' : ''} ${forte ? 'font-bold' : ''} ${vermelho ? 'text-red-700' : 'text-gray-900'}`}>
        {formatCurrency(v)}
      </button>
    </td>
  );
}

// Carteira × prazo. Clicar na célula filtra a lista.
function MatrizPrazos({ resumo, filtroTipo, faixa, cartaoPendente, onEscolher }) {
  const cel = (t, f, v) => ({ v, ativo: filtroTipo === t && faixa === f && !(t === 'todos' && f === 'todas'), onClick: () => onEscolher(t, f) });
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200/60 bg-white shadow-sm">
      <table className="w-full min-w-[880px] text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wide text-gray-500">
            <th rowSpan={2} className="px-4 py-2 text-left font-semibold">Carteira</th>
            <th colSpan={3} className="border-l border-gray-100 px-3 pt-2 text-center font-semibold text-red-700">Vencido (dias)</th>
            <th colSpan={4} className="border-l border-gray-100 px-3 pt-2 text-center font-semibold">A vencer (dias)</th>
            <th rowSpan={2} className="border-l border-gray-100 px-3 py-2 text-right font-semibold">Total</th>
          </tr>
          <tr className="border-b border-gray-100 text-[11px] text-gray-600">
            {FAIXAS.map(f => <th key={f.k} title={f.rotulo} className="px-3 pb-2 text-right font-medium">{f.curto}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {ORDEM.map(k => (
            <tr key={k}>
              <th scope="row" className="whitespace-nowrap px-4 py-2 text-left font-semibold text-gray-900">{TIPOS[k].plural}</th>
              {k === 'cartao' && cartaoPendente
                ? <td colSpan={8} className="px-3 py-2 text-center text-gray-500">Carregando cartões…</td>
                : <>
                  {FAIXAS.map(f => <CelulaPrazo key={f.k} {...cel(k, f.k, resumo[k].faixas[f.k])} vermelho={f.vencido && k !== 'cartao'} />)}
                  <CelulaPrazo {...cel(k, 'todas', resumo[k].total)} forte />
                </>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50">
            <th scope="row" className="px-4 py-2 text-left font-bold text-gray-900">Total{cartaoPendente ? ' (sem cartões)' : ''}</th>
            {FAIXAS.map(f => <CelulaPrazo key={f.k} {...cel('todos', f.k, resumo.todos.faixas[f.k])} forte />)}
            <CelulaPrazo {...cel('todos', 'todas', resumo.todos.total)} forte />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Grupos da visão escolhida; cada grupo abre a lista de títulos/lotes
function montarGrupos(visao, linhas, hoje) {
  const m = new Map();
  const add = (k, base, t) => { const g = m.get(k) || { chave: k, ...base, itens: [] }; g.itens.push(t); m.set(k, g); };
  linhas.forEach(t => {
    if (visao === 'cliente') add(`${t.tipo === 'cartao' ? 'cartao' : 'cli'}|${t.documentoCliente || ''}|${t.cliente}`, { titulo: t.cliente, sub: t.tipo === 'cartao' ? 'Administradora de cartão' : t.documentoCliente }, t);
    else if (visao === 'empresa') add(t.empresaId, { titulo: t.empresaNome, sub: '' }, t);
    else if (t.dias == null) add('sem', { titulo: 'Sem vencimento', sub: '', ordem: '9' }, t);
    else if (t.dias < 0 && t.tipo === 'cartao') add('cartao-sem-baixa', { titulo: 'Cartões vencidos sem baixa', sub: 'provável falta de baixa no sistema', tom: 'ambar', ordem: '1' }, t);
    else if (t.dias < 0) add('vencidos', { titulo: 'Vencidos', sub: 'notas, faturas e cheques', tom: 'vermelho', ordem: '0' }, t);
    else add(t.vencimentoEfetivo, { titulo: t.dias === 0 ? `Hoje · ${dataBR(hoje)}` : `${dataBR(t.vencimentoEfetivo)} · ${diaSemana(t.vencimentoEfetivo)}`, sub: '', tom: t.dias === 0 ? 'hoje' : null, ordem: t.vencimentoEfetivo }, t);
  });
  const gs = [...m.values()].map(g => ({ ...g, total: soma(g.itens), qtd: contar(g.itens), vencido: soma(g.itens.filter(t => t.dias < 0 && t.tipo !== 'cartao')), semBaixa: soma(g.itens.filter(t => t.dias < 0 && t.tipo === 'cartao')) }));
  return visao === 'vencimento' ? gs.sort((a, b) => a.ordem.localeCompare(b.ordem)) : gs.sort((a, b) => a.chave.startsWith('cartao|') - b.chave.startsWith('cartao|') || b.total - a.total); // clientes antes das administradoras
}

const TONS = { vermelho: 'text-red-800', ambar: 'text-amber-800', hoje: 'text-gray-900' };

function ListaAgrupada({ visao, linhas, hoje, multi, carregandoCartao, onLote }) {
  const grupos = useMemo(() => montarGrupos(visao, linhas, hoje), [visao, linhas, hoje]);
  const [abertos, setAbertos] = useState(() => new Set(visao === 'vencimento' ? [hoje] : []));
  const [limite, setLimite] = useState(POR_VEZ);
  if (!linhas.length) {
    return <p className="rounded-2xl border border-gray-200/60 bg-white px-4 py-10 text-center text-sm text-gray-500 shadow-sm">{carregandoCartao ? 'Carregando cartões…' : 'Nenhum título em aberto com esses filtros.'}</p>;
  }
  const alternar = (k) => setAbertos(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const Icone = visao === 'empresa' ? Building2 : visao === 'vencimento' ? CalendarDays : null;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
        {grupos.slice(0, limite).map(g => {
          const on = abertos.has(g.chave);
          return (
            <li key={g.chave}>
              <button type="button" onClick={() => alternar(g.chave)} aria-expanded={on}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 ${g.tom === 'vermelho' ? 'bg-red-50/60' : g.tom === 'ambar' ? 'bg-amber-50/60' : ''}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${on ? 'rotate-180' : ''}`} aria-hidden="true" />
                  {Icone && <Icone className={`hidden h-4 w-4 shrink-0 sm:block ${TONS[g.tom] || 'text-gray-400'}`} aria-hidden="true" />}
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-semibold ${TONS[g.tom] || 'text-gray-900'}`}>{g.titulo}</span>
                    <span className="block truncate text-[11px] text-gray-500">{[g.sub, g.itens.every(t => t.tipo === 'cartao') ? plural(g.qtd, 'transação', 'transações') : plural(g.qtd, 'título', 'títulos')].filter(Boolean).join(' · ')}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-sm font-bold tabular-nums ${TONS[g.tom] || 'text-gray-900'}`}>{formatCurrency(g.total)}</span>
                  {visao !== 'vencimento' && g.vencido > 0 && <span className="block text-[11px] font-semibold tabular-nums text-red-700">{formatCurrency(g.vencido)} vencido</span>}
                  {visao !== 'vencimento' && g.semBaixa > 0 && <span className="block text-[11px] font-semibold tabular-nums text-amber-700">{formatCurrency(g.semBaixa)} sem baixa</span>}
                </span>
              </button>
              {on && <ItensGrupo itens={g.itens} multi={multi && visao !== 'empresa'} mostrarCliente={visao !== 'cliente'} onLote={onLote} />}
            </li>
          );
        })}
      </ul>
      {grupos.length > limite && (
        <button type="button" onClick={() => setLimite(n => n + POR_VEZ)} className="h-11 w-full rounded-xl border border-gray-200 bg-white text-sm font-semibold text-blue-700 hover:bg-gray-50">
          Mostrar mais ({plural(grupos.length - limite, 'restante', 'restantes')})
        </button>
      )}
    </div>
  );
}

function ItensGrupo({ itens, multi, mostrarCliente, onLote }) {
  const [limite, setLimite] = useState(POR_VEZ);
  return (
    <div className="bg-gray-50/70">
      <ul className="divide-y divide-gray-100 border-t border-gray-100">
        {itens.slice(0, limite).map(t => <LinhaTitulo key={t.chave} t={t} multi={multi} mostrarCliente={mostrarCliente} onLote={onLote} />)}
      </ul>
      {itens.length > limite && (
        <button type="button" onClick={() => setLimite(n => n + POR_VEZ)} className="h-10 w-full border-t border-gray-100 text-xs font-semibold text-blue-700 hover:bg-gray-100">
          Mostrar mais ({plural(itens.length - limite, 'restante', 'restantes')})
        </button>
      )}
    </div>
  );
}

function LinhaTitulo({ t, multi, mostrarCliente, onLote }) {
  const s = situacao(t);
  const ehLote = !!t.itens;
  const sub = [TIPOS[t.tipo].rotulo, ehLote ? plural(t.itens.length, 'transação', 'transações') : t.documento, multi ? t.empresaNome : null].filter(Boolean).join(' · ');
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {mostrarCliente && <p className="truncate text-sm font-semibold text-gray-900">{t.cliente}</p>}
          <p className="truncate text-xs text-gray-600">{sub}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-gray-900">{formatCurrency(t.valor)}</p>
          {t.liquido != null && Math.abs(t.valor - t.liquido) > 0.004 && <p className="text-[11px] tabular-nums text-gray-500">líq. previsto {formatCurrency(t.liquido)}</p>}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.cls}`}>{s.txt}</span>
        {t.devolvido && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Devolvido</span>}
        <span className="text-[11px] text-gray-500">{t.tipo === 'cheque' ? 'bom para' : 'venc.'} {dataBR(t.vencimento)}{t.emissao ? ` · emitido ${dataBR(t.emissao)}` : ''}</span>
        {ehLote && <span className="text-[11px] font-semibold text-blue-700">ver transações</span>}
      </div>
    </>
  );
  return (
    <li>
      {ehLote
        ? <button type="button" onClick={() => onLote(t)} className="w-full px-4 py-3 text-left hover:bg-gray-100 sm:pl-10">{conteudo}</button>
        : <div className="px-4 py-3 sm:pl-10">{conteudo}</div>}
    </li>
  );
}

// Transações de um lote de cartão
function ModalLote({ lote, onClose }) {
  const itens = lote?.itens || [];
  return (
    <Modal open={!!lote} onClose={onClose} size="lg" title={lote ? `${lote.cliente} · ${dataBR(lote.vencimentoEfetivo)}` : ''}>
      {lote && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{lote.empresaNome} · {plural(itens.length, 'transação', 'transações')} · <strong className="tabular-nums text-gray-900">{formatCurrency(lote.valor)}</strong>
            {lote.liquido != null && <> (líquido previsto <span className="tabular-nums">{formatCurrency(lote.liquido)}</span>)</>}</p>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200/60">
            {[...itens].sort((a, b) => (a.emissao || '').localeCompare(b.emissao || '')).slice(0, 300).map(t => (
              <li key={t.chave} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 text-xs">
                  <p className="truncate font-medium text-gray-900">{t.documento || 'Sem autorização'}{t.parcela > 1 ? ` · parcela ${t.parcela}` : ''}</p>
                  <p className="truncate text-gray-500">venda {dataBR(t.emissao)}{t.nsu ? ` · NSU ${t.nsu}` : ''}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(t.valor)}</p>
              </li>
            ))}
          </ul>
          {itens.length > 300 && <p className="text-xs text-gray-500">Mostrando as 300 primeiras. A lista completa sai no Excel.</p>}
        </div>
      )}
    </Modal>
  );
}
