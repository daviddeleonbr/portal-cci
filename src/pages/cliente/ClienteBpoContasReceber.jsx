// BPO · CONTAS A RECEBER — portal do cliente (Webposto e Autosystem; tipo pela
// sessão). Só CLIENTES A PRAZO em aberto (notas a prazo e faturas), direto do
// sistema. Visões: por vencimento (agenda) e por cliente (quem deve). Pensado
// primeiro p/ celular. Dados: services/bpoContasReceberService.js.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarDays, ChevronDown, Clock, Loader2, RefreshCw, Search, Users, Wallet,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { useClienteSession } from '../../hooks/useAuth';
import * as crService from '../../services/bpoContasReceberService';
import * as qualityApi from '../../services/qualityApiService';
import { formatCurrency } from '../../utils/format';
import { hojeBR } from '../../utils/dataBR';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const diaSemana = (iso) => (iso ? DIAS[new Date(`${iso}T12:00:00`).getDay()] : '');
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86400000);
const soma = (l) => l.reduce((s, t) => s + t.valor, 0);
const TIPOS = { nota: 'Nota a prazo', fatura: 'Fatura' };

export default function ClienteBpoContasReceber() {
  const session = useClienteSession();
  const tipo = session?.tipoCliente === 'autosystem' ? 'autosystem' : 'webposto';
  const empresas = useMemo(() => (session?.clientesRede || [])
    .filter(c => c.empresa_codigo != null && c.empresa_codigo !== '' && (tipo === 'autosystem' || c.chave_api_id))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), [session?.clientesRede, tipo]);
  const multi = empresas.length > 1;
  const hoje = hojeBR();
  const em7 = hojeBR(7);

  const [titulos, setTitulos] = useState([]);
  const [erros, setErros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [visao, setVisao] = useState('vencimento');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [prazo, setPrazo] = useState('todos'); // atalho dos cards

  const chaveEmpresas = empresas.map(e => e.id).join(',');
  const carregar = useCallback(async ({ forcar = false } = {}) => {
    if (!empresas.length) { setCarregando(false); return; }
    if (forcar) qualityApi.limparCacheTransacional();
    setCarregando(true);
    try {
      const r = await crService.buscarEmAberto({ tipo, empresas, redeId: session?.asRede?.id });
      setTitulos(r.titulos); setErros(r.erros);
    } catch (e) {
      setTitulos([]); setErros([e.message || 'Falha ao carregar']);
    } finally { setCarregando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, chaveEmpresas, session?.asRede?.id]);
  useEffect(() => { carregar(); }, [carregar]);

  // Base com filtros de empresa/tipo/busca (os cards usam só empresa/tipo)
  const base = useMemo(() => titulos
    .filter(t => (!empresaFiltro || t.empresaId === empresaFiltro) && (filtroTipo === 'todos' || t.tipo === filtroTipo))
    .sort((a, b) => (a.vencimentoEfetivo || '9').localeCompare(b.vencimentoEfetivo || '9') || b.valor - a.valor),
  [titulos, empresaFiltro, filtroTipo]);

  const resumo = useMemo(() => ({
    vencidos: base.filter(t => t.vencimentoEfetivo < hoje),
    hoje: base.filter(t => t.vencimentoEfetivo === hoje),
    proximos: base.filter(t => t.vencimentoEfetivo > hoje && t.vencimentoEfetivo <= em7),
    total: base,
  }), [base, hoje, em7]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (prazo === 'todos' ? base : resumo[prazo] || base)
      .filter(t => !q || [t.cliente, t.documento, t.documentoCliente, t.empresaNome].some(x => String(x || '').toLowerCase().includes(q)));
  }, [base, resumo, prazo, busca]);

  const cabecalho = (
    <PageHeader title="Contas a receber" description="Clientes a prazo em aberto: notas a prazo e faturas" acoesNaLinha>
      <button type="button" onClick={() => carregar({ forcar: true })} disabled={carregando} aria-label="Atualizar" title="Atualizar"
        className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:w-auto sm:px-4">
        <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" /> <span className="hidden sm:inline">Atualizar</span>
      </button>
    </PageHeader>
  );

  if (!empresas.length) {
    return (
      <div>{cabecalho}
        <div className="rounded-2xl border border-gray-200/60 bg-white px-6 py-14 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-900">Nenhuma empresa da rede está vinculada ao sistema.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {cabecalho}

      {erros.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Algumas informações não carregaram</p>
          {erros.map(e => <p key={e} className="mt-1 text-xs">{e}</p>)}
        </div>
      )}

      {carregando && !titulos.length ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200/60 bg-white py-16 text-sm text-gray-600 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Buscando contas a receber no sistema…
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${carregando ? 'opacity-60' : ''}`}>
          {/* Cards (tocar filtra a lista) */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Card rotulo="Vencidos" lista={resumo.vencidos} Icone={AlertTriangle} tom="bg-red-50 text-red-700" ativo={prazo === 'vencidos'} onClick={() => setPrazo(p => (p === 'vencidos' ? 'todos' : 'vencidos'))} />
            <Card rotulo="Vencem hoje" lista={resumo.hoje} Icone={CalendarDays} tom="bg-amber-50 text-amber-700" ativo={prazo === 'hoje'} onClick={() => setPrazo(p => (p === 'hoje' ? 'todos' : 'hoje'))} />
            <Card rotulo="Próximos 7 dias" lista={resumo.proximos} Icone={Clock} tom="bg-gray-100 text-gray-700" ativo={prazo === 'proximos'} onClick={() => setPrazo(p => (p === 'proximos' ? 'todos' : 'proximos'))} />
            <Card rotulo="Total em aberto" lista={resumo.total} Icone={Wallet} tom="bg-blue-700 text-white" ativo={prazo === 'todos'} onClick={() => setPrazo('todos')} destaque />
          </div>

          {/* Visão + filtros */}
          <div className="rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm space-y-3">
            <div className="inline-flex w-full rounded-xl bg-gray-100 p-1 sm:w-auto" role="tablist">
              {[['vencimento', 'Por vencimento', CalendarDays], ['cliente', 'Por cliente', Users]].map(([k, r, Ic]) => (
                <button key={k} type="button" role="tab" aria-selected={visao === k} onClick={() => setVisao(k)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${visao === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>
                  <Ic className="h-4 w-4" aria-hidden="true" /> {r}
                </button>
              ))}
            </div>
            <label className="relative block">
              <span className="sr-only">Buscar</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Cliente, CPF/CNPJ ou documento…"
                className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-base sm:text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </label>
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[['todos', 'Todos'], ['nota', 'Notas a prazo'], ['fatura', 'Faturas']].map(([k, r]) => (
                <button key={k} type="button" onClick={() => setFiltroTipo(k)} aria-pressed={filtroTipo === k}
                  className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium ring-1 ring-inset ${filtroTipo === k ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-200'}`}>{r}</button>
              ))}
            </div>
            {multi && (
              <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)} aria-label="Empresa"
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base sm:text-sm">
                <option value="">Todas as empresas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            )}
          </div>

          {visao === 'vencimento'
            ? <PorVencimento titulos={visiveis} hoje={hoje} multi={multi} />
            : <PorCliente titulos={visiveis} hoje={hoje} multi={multi} />}

          <p className="text-xs text-gray-500">
            Notas a prazo e faturas em aberto no sistema ({tipo === 'autosystem' ? 'Autosystem' : 'Webposto'}). Vencimentos em fim de semana ou feriado contam no próximo dia útil. Cartões e cheques ficam em Financeiro › Contas a Receber.
          </p>
        </div>
      )}
    </div>
  );
}

function Card({ rotulo, lista, Icone, tom, ativo, onClick, destaque = false }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`rounded-2xl border bg-white p-3 text-left shadow-sm transition sm:p-4 ${ativo && !destaque ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200/60'}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tom}`}><Icone className="h-4 w-4" aria-hidden="true" /></span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{rotulo}</p>
      </div>
      <p className="mt-1.5 text-lg font-bold tabular-nums text-gray-900 sm:text-xl">{formatCurrency(soma(lista))}</p>
      <p className="text-[11px] text-gray-500">{lista.length} título(s)</p>
    </button>
  );
}

function situacao(t, hoje) {
  const d = diasEntre(hoje, t.vencimentoEfetivo);
  if (d < 0) return { txt: `Vencido há ${-d} dia${d === -1 ? '' : 's'}`, cls: 'bg-red-50 text-red-700 ring-red-200' };
  if (d === 0) return { txt: 'Vence hoje', cls: 'bg-amber-50 text-amber-800 ring-amber-200' };
  return { txt: `Vence em ${d} dia${d === 1 ? '' : 's'}`, cls: 'bg-gray-100 text-gray-700 ring-gray-200' };
}

function LinhaTitulo({ t, hoje, multi, mostrarCliente = true }) {
  const s = situacao(t, hoje);
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {mostrarCliente && <p className="truncate text-sm font-semibold text-gray-900">{t.cliente}</p>}
          <p className="truncate text-xs text-gray-600">
            {[TIPOS[t.tipo], t.documento, multi ? t.empresaNome : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <p className="shrink-0 text-sm font-bold tabular-nums text-gray-900">{formatCurrency(t.valor)}</p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.cls}`}>{s.txt}</span>
        <span className="text-[11px] text-gray-500">venc. {dataBR(t.vencimento)}{t.emissao ? ` · emitido ${dataBR(t.emissao)}` : ''}</span>
      </div>
    </li>
  );
}

function Vazio() {
  return <p className="rounded-2xl border border-gray-200/60 bg-white px-4 py-10 text-center text-sm text-gray-500 shadow-sm">Nenhuma conta a receber em aberto com esses filtros.</p>;
}

// Agenda: um grupo "Vencidos" e depois um por dia de vencimento
function PorVencimento({ titulos, hoje, multi }) {
  const grupos = useMemo(() => {
    const vencidos = titulos.filter(t => t.vencimentoEfetivo < hoje);
    const m = new Map();
    titulos.filter(t => !(t.vencimentoEfetivo < hoje)).forEach(t => {
      const k = t.vencimentoEfetivo || 'sem';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    });
    return [
      ...(vencidos.length ? [{ chave: 'vencidos', titulo: 'Vencidos', sub: `${vencidos.length} título(s)`, itens: vencidos, alerta: true }] : []),
      ...[...m.entries()].map(([k, itens]) => ({
        chave: k, titulo: k === 'sem' ? 'Sem vencimento' : k === hoje ? `Hoje · ${dataBR(k)}` : `${dataBR(k)} · ${diaSemana(k)}`,
        sub: `${itens.length} título(s)`, itens, hoje: k === hoje,
      })),
    ];
  }, [titulos, hoje]);
  if (!titulos.length) return <Vazio />;
  return (
    <div className="space-y-3">
      {grupos.map(g => (
        <section key={g.chave} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${g.alerta ? 'border-red-200' : 'border-gray-200/60'}`}>
          <header className={`flex items-center justify-between gap-3 px-4 py-2.5 ${g.alerta ? 'bg-red-50' : g.hoje ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <div>
              <p className={`text-sm font-bold ${g.alerta ? 'text-red-800' : 'text-gray-900'}`}>{g.titulo}</p>
              <p className="text-[11px] text-gray-500">{g.sub}</p>
            </div>
            <p className={`text-sm font-bold tabular-nums ${g.alerta ? 'text-red-800' : 'text-gray-900'}`}>{formatCurrency(soma(g.itens))}</p>
          </header>
          <ul className="divide-y divide-gray-100">
            {g.itens.map(t => <LinhaTitulo key={t.chave} t={t} hoje={hoje} multi={multi} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Quem deve: total por cliente (maior primeiro), quanto já venceu; toque abre
function PorCliente({ titulos, hoje, multi }) {
  const [aberto, setAberto] = useState(null);
  const clientes = useMemo(() => {
    const m = new Map();
    titulos.forEach(t => {
      const k = `${t.documentoCliente || ''}|${t.cliente}`;
      const c = m.get(k) || { chave: k, nome: t.cliente, doc: t.documentoCliente, itens: [] };
      c.itens.push(t);
      m.set(k, c);
    });
    return [...m.values()].map(c => ({
      ...c, total: soma(c.itens), vencido: soma(c.itens.filter(t => t.vencimentoEfetivo < hoje)),
      proximo: c.itens.reduce((min, t) => (t.vencimentoEfetivo && (!min || t.vencimentoEfetivo < min) ? t.vencimentoEfetivo : min), null),
    })).sort((a, b) => b.total - a.total);
  }, [titulos, hoje]);
  if (!titulos.length) return <Vazio />;
  return (
    <ul className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm divide-y divide-gray-100">
      {clientes.map(c => {
        const on = aberto === c.chave;
        return (
          <li key={c.chave}>
            <button type="button" onClick={() => setAberto(on ? null : c.chave)} aria-expanded={on} className="w-full px-4 py-3 text-left hover:bg-gray-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${on ? 'rotate-180' : ''}`} aria-hidden="true" />
                    <span className="truncate">{c.nome}</span>
                  </p>
                  <p className="ml-5.5 pl-0.5 text-[11px] text-gray-500">{[c.doc, `${c.itens.length} título(s)`].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-gray-900">{formatCurrency(c.total)}</p>
                  {c.vencido > 0
                    ? <p className="text-[11px] font-semibold tabular-nums text-red-700">{formatCurrency(c.vencido)} vencido</p>
                    : <p className="text-[11px] text-gray-500">próx. {dataBR(c.proximo)}</p>}
                </div>
              </div>
            </button>
            {on && (
              <ul className="divide-y divide-gray-100 bg-gray-50/70">
                {c.itens.map(t => <LinhaTitulo key={t.chave} t={t} hoje={hoje} multi={multi} mostrarCliente={false} />)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
