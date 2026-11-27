// Consultoria > Análise de cartões. Baixas de todos os cartões no período (pela data
// da baixa): taxa efetiva × cadastrada, o dia a dia, os cartões que deixam mais margem
// e quanto da margem do combustível a taxa consome. Webposto e Autosystem.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BarChart3, CreditCard, Fuel, Info, Loader2, Percent, RefreshCw, Wallet,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import PageHeader from '../components/ui/PageHeader';
import InputData from '../components/ui/InputData';
import SeletorRedeEmpresa from '../components/bpo/SeletorRedeEmpresa';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as autosystemService from '../services/autosystemService';
import { carregarAnaliseCartoes } from '../services/analiseCartoesService';
import { serieDiaria } from '../utils/analiseCartoes';
import { SELECAO_VAZIA, TODAS_DA_REDE, empresasDaRede } from '../utils/selecaoRede';
import { formatCurrency } from '../utils/format';
import { isoDataBR } from '../utils/dataBR';

const MAX_DIAS = 62;
const COR = '#2563eb'; // série única (azul do sistema)
const rot = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500';
const inp = 'h-10 w-full rounded-lg border border-gray-200/80 bg-white/80 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

const pct = (v, casas = 2) => (v == null ? '–' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const moeda = (v) => (Math.abs(v || 0) < 0.005 ? '–' : formatCurrency(v));
const diaBR = (iso) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };
const dias = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000) + 1;
function inicioMes() { const d = new Date(); return isoDataBR(new Date(d.getFullYear(), d.getMonth(), 1)); }
function ontem() { const d = new Date(); d.setDate(d.getDate() - 1); return isoDataBR(d); }

export default function ConsultoriaAnaliseCartoes() {
  const [clientes, setClientes] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [carregandoMeta, setCarregandoMeta] = useState(true);
  const [selecao, setSelecao] = useState(SELECAO_VAZIA);
  const [de, setDe] = useState(inicioMes());
  const [ate, setAte] = useState(ontem());
  const [modelo, setModelo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [cartaoSel, setCartaoSel] = useState('');
  const pedidoRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const [lista, chs, redesAS] = await Promise.all([
          clientesService.listarClientes(), mapService.listarChavesApi(), autosystemService.listarRedes().catch(() => []),
        ]);
        const validos = (lista || []).filter(c => (c.usa_webposto && c.chave_api_id && c.empresa_codigo) || (c.as_rede_id && c.empresa_codigo != null));
        setClientes(validos);
        const idsWb = new Set(validos.filter(c => c.chave_api_id).map(c => c.chave_api_id));
        setChavesApi((chs || []).filter(ch => ch.ativo !== false && idsWb.has(ch.id)));
        const idsAS = new Set(validos.filter(c => c.as_rede_id).map(c => c.as_rede_id));
        setRedesAutosystem((redesAS || []).filter(r => idsAS.has(r.id)));
      } catch (e) { setErro(e.message); }
      finally { setCarregandoMeta(false); }
    })();
  }, []);

  const contagensPorRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => { const k = c.chave_api_id || c.as_rede_id; if (k) m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }, [clientes]);

  const { rede, empresa } = selecao;
  const escopo = useMemo(() => {
    if (!rede || !empresa) return [];
    return empresa === TODAS_DA_REDE ? empresasDaRede(clientes, rede) : clientes.filter(c => c.id === empresa);
  }, [clientes, rede, empresa]);

  const limpar = () => { pedidoRef.current += 1; setModelo(null); setErro(''); setCartaoSel(''); setCarregando(false); };

  const analisar = useCallback(async () => {
    if (!escopo.length) return;
    if (!de || !ate || de > ate) { setErro('Período inválido.'); return; }
    if (dias(de, ate) > MAX_DIAS) { setErro(`Escolha no máximo ${MAX_DIAS} dias.`); return; }
    const n = ++pedidoRef.current;
    const chave = rede.tipo === 'webposto' ? chavesApi.find(c => c.id === rede.id)?.chave : null;
    setErro(''); setModelo(null); setCartaoSel(''); setCarregando(true);
    try {
      const m = await carregarAnaliseCartoes({ empresas: escopo, chave, de, ate });
      if (n === pedidoRef.current) setModelo(m);
    } catch (e) { if (n === pedidoRef.current) setErro(e?.message || 'Falha ao analisar os cartões.'); }
    finally { if (n === pedidoRef.current) setCarregando(false); }
  }, [escopo, de, ate, rede, chavesApi]);

  if (carregandoMeta) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }

  const admin = { chavesApi, redesAutosystem, contagensPorRede, selecao, onSelecao: setSelecao };

  return (
    <div className="space-y-4">
      <PageHeader title="Análise de cartões"
        description="Taxas realmente descontadas nas baixas, o dia a dia, a margem que cada cartão deixa e o quanto a taxa consome da margem do combustível" />

      {/* Filtros fixos logo abaixo do cabeçalho do app (h-16), em vidro: fundo translúcido
          com desfoque, borda clara e brilho fino no topo. Uma linha só a partir do lg. */}
      <div className="sticky top-[4.5rem] z-20 flex flex-wrap items-end gap-3 rounded-xl border border-white/70 bg-white/60 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-slate-900/5 backdrop-blur-xl backdrop-saturate-150 lg:flex-nowrap dark:border-white/10 dark:bg-gray-900/55 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="w-full min-w-0 lg:w-auto lg:flex-1">
          <SeletorRedeEmpresa empresas={clientes} admin={admin} onTrocar={limpar} />
        </div>
        <div className="w-[9.5rem] shrink-0"><label className={rot}>Baixas de</label>
          <InputData value={de} onChange={e => { setDe(e.target.value); if (e.target.value > ate) setAte(e.target.value); limpar(); }} className={inp} /></div>
        <div className="w-[9.5rem] shrink-0"><label className={rot}>Até</label>
          <InputData value={ate} onChange={e => { setAte(e.target.value); limpar(); }} className={inp} /></div>
        <button type="button" onClick={analisar} disabled={!escopo.length || carregando}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Analisar
        </button>
      </div>

      {erro && <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erro}</p>}

      {carregando && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white p-12 text-sm text-gray-500 dark:border-white/10 dark:bg-white/5">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Buscando baixas e vendas no cartão… períodos longos podem levar alguns segundos.
        </div>
      )}

      {!carregando && !modelo && !erro && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center dark:border-white/10 dark:bg-white/5">
          <CreditCard className="mx-auto mb-3 h-8 w-8 text-blue-500" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Escolha a rede, a empresa (ou a rede toda) e o período das baixas</p>
          <p className="mt-1 text-xs text-gray-500">Até {MAX_DIAS} dias por análise.</p>
        </div>
      )}

      {modelo && !carregando && <Resultado m={modelo} cartaoSel={cartaoSel} onCartao={setCartaoSel} />}
    </div>
  );
}

function Resultado({ m, cartaoSel, onCartao }) {
  const t = m.totais;
  const serie = useMemo(() => serieDiaria(m.dias, cartaoSel), [m.dias, cartaoSel]);
  const nomeSel = m.cartoes.find(c => c.chave === cartaoSel)?.nome;
  const porMargem = useMemo(() => [...m.cartoes].filter(c => c.vendido > 0.005).sort((a, b) => b.margemLiquida - a.margemLiquida), [m.cartoes]);
  const porConsumo = useMemo(() => [...m.cartoes].filter(c => c.combustivel.valor > 0.005)
    .sort((a, b) => (b.combustivel.consumo ?? -1) - (a.combustivel.consumo ?? -1)), [m.cartoes]);

  if (!m.cartoes.length) {
    return <p className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/5">Nenhuma baixa de cartão no período.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={Wallet} rotulo="Total baixado" valor={formatCurrency(t.bruto)} sub={`Líquido recebido ${formatCurrency(t.liquido)}`} />
        <Tile icon={Percent} rotulo="Taxas pagas" valor={formatCurrency(t.taxa)} sub={`Taxa efetiva média ${pct(t.taxaEfetiva)}`} />
        <Tile icon={BarChart3} rotulo="Margem das vendas no cartão" valor={formatCurrency(t.margemLiquida)}
          sub={t.vendido > 0 ? `${pct((100 * t.margemLiquida) / t.vendido)} do vendido, já sem a taxa` : 'Sem vendas ligadas às baixas'} />
        <Tile icon={Fuel} rotulo="Taxa sobre a margem do combustível" valor={pct(t.combustivel.consumo, 1)}
          sub={t.combustivel.valor > 0 ? `${formatCurrency(t.combustivel.taxa)} de ${formatCurrency(t.combustivel.margem)} de margem` : 'Sem combustível no cartão'} />
      </div>

      {t.acimaCadastrada > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span><strong>Atenção:</strong> {t.acimaCadastrada} cartão(ões) com taxa descontada acima da cadastrada. Veja a coluna “Cadastrada” em Taxas por cartão.</span>
        </p>
      )}

      {/* Dia a dia: dois gráficos de uma série, mesmo eixo de datas (nunca dois eixos Y) */}
      <Painel titulo="Dia a dia das baixas" extra={(
        <select value={cartaoSel} onChange={e => onCartao(e.target.value)} aria-label="Filtrar por cartão"
          className="h-9 max-w-[260px] rounded-lg border border-gray-200 bg-white px-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="">Todos os cartões</option>
          {m.cartoes.filter(c => c.bruto > 0.005).map(c => <option key={c.chave} value={c.chave}>{c.nome}</option>)}
        </select>
      )}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Grafico titulo={`Taxas pagas por dia${nomeSel ? ` · ${nomeSel}` : ''}`}>
            <BarChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} syncId="cartoes-dia">
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="data" tickFormatter={diaBR} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={12} />
              <YAxis tickFormatter={v => `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={72} />
              <Tooltip cursor={{ fill: 'rgba(37,99,235,0.06)' }} content={<DicaDia />} />
              <Bar dataKey="taxa" name="Taxa" fill={COR} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </Grafico>
          <Grafico titulo={`Taxa efetiva por dia (%)${nomeSel ? ` · ${nomeSel}` : ''}`}>
            <LineChart data={serie} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId="cartoes-dia">
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="data" tickFormatter={diaBR} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={12} />
              <YAxis tickFormatter={v => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={48} />
              <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={<DicaDia />} />
              <Line dataKey="taxaEfetiva" name="Taxa efetiva" stroke={COR} strokeWidth={2} dot={{ r: 4, fill: COR, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </Grafico>
        </div>
      </Painel>

      <Painel titulo="Taxas por cartão" nota="Taxa efetiva = taxa ÷ (taxa + líquido), o que a adquirente realmente descontou nas baixas do período.">
        <Tabela cab={['Cartão', 'Baixado', 'Taxa', 'Taxa efetiva', 'Cadastrada', 'Líquido', ...(m.totais.ajuste ? ['Ajustes'] : [])]}>
          {m.cartoes.filter(c => c.bruto > 0.005).map(c => (
            <tr key={c.chave} className="border-t border-gray-100 dark:border-white/10">
              <Td nome>{c.nome}</Td><Td>{moeda(c.bruto)}</Td><Td>{moeda(c.taxa)}</Td><Td forte>{pct(c.taxaEfetiva)}</Td>
              <Td>{c.acimaCadastrada
                ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200"><AlertTriangle className="h-3 w-3" />{pct(c.taxaCadastrada)} · acima</span>
                : pct(c.taxaCadastrada)}</Td>
              <Td>{moeda(c.liquido)}</Td>{m.totais.ajuste ? <Td>{moeda(c.ajuste)}</Td> : null}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200 font-semibold dark:border-white/20">
            <Td nome>Total</Td><Td>{moeda(t.bruto)}</Td><Td>{moeda(t.taxa)}</Td><Td>{pct(t.taxaEfetiva)}</Td><Td /><Td>{moeda(t.liquido)}</Td>{t.ajuste ? <Td>{moeda(t.ajuste)}</Td> : null}
          </tr>
        </Tabela>
      </Painel>

      <Painel titulo="Margem por cartão" nota="Vendas liquidadas no cartão, da maior para a menor margem já descontada a taxa. A taxa das vendas é a efetiva do cartão.">
        {porMargem.length ? (
          <Tabela cab={['Cartão', 'Vendido', 'Custo', 'Margem bruta', 'Taxa', 'Margem líquida', 'Margem %']}>
            {porMargem.map(c => (
              <tr key={c.chave} className="border-t border-gray-100 dark:border-white/10">
                <Td nome>{c.nome}</Td><Td>{moeda(c.vendido)}</Td><Td>{moeda(c.custo)}</Td><Td>{moeda(c.margemBruta)}</Td>
                <Td>{moeda(c.taxaVendas)}</Td><Td forte>{moeda(c.margemLiquida)}</Td><Td>{pct(c.margemLiquidaPct, 1)}</Td>
              </tr>
            ))}
          </Tabela>
        ) : <Vazio>Nenhuma venda ligada às baixas do período.</Vazio>}
      </Painel>

      <Painel titulo="Combustível × taxa" nota="Quanto da margem do combustível pago em cada cartão a taxa consumiu.">
        {porConsumo.length ? (
          <Tabela cab={['Cartão', 'Combustível vendido', 'Margem', 'Taxa', 'Margem consumida pela taxa']}>
            {porConsumo.map(c => (
              <tr key={c.chave} className="border-t border-gray-100 dark:border-white/10">
                <Td nome>{c.nome}</Td><Td>{moeda(c.combustivel.valor)}</Td><Td>{moeda(c.combustivel.margem)}</Td><Td>{moeda(c.combustivel.taxa)}</Td>
                <Td><Consumo v={c.combustivel.consumo} /></Td>
              </tr>
            ))}
          </Tabela>
        ) : <Vazio>Nenhuma venda de combustível nas baixas do período.</Vazio>}
      </Painel>

      {m.avisos.length > 0 && (
        <div className="space-y-1">
          {m.avisos.map(a => <p key={a} className="flex items-start gap-2 text-xs text-gray-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}</p>)}
        </div>
      )}
    </>
  );
}

function Tile(props) {
  const { icon: Icon, rotulo, valor, sub } = props;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2 text-xs text-gray-500"><Icon className="h-4 w-4 text-blue-600" />{rotulo}</div>
      <p className="mt-1 text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

function Painel({ titulo, nota, extra, children }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</h2>
          {nota && <p className="text-[11px] text-gray-500">{nota}</p>}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Grafico({ titulo, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{titulo}</p>
      <div className="h-64"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </div>
  );
}

function DicaDia({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const [y, mo, di] = String(d.data).split('-');
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-gray-900">{`${di}/${mo}/${y}`}</p>
      <p className="text-gray-600">Baixado: <span className="font-medium text-gray-900">{formatCurrency(d.bruto)}</span></p>
      <p className="text-gray-600">Taxa: <span className="font-medium text-gray-900">{formatCurrency(d.taxa)}</span></p>
      <p className="text-gray-600">Taxa efetiva: <span className="font-medium text-gray-900">{pct(d.taxaEfetiva)}</span></p>
    </div>
  );
}

function Tabela({ cab, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] uppercase tracking-wider text-gray-500">
          {cab.map((c, i) => <th key={c} className={`px-2 py-2 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>)}
        </tr></thead>
        <tbody className="text-gray-800 dark:text-gray-200">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, nome, forte }) {
  return <td className={`px-2 py-2 ${nome ? 'text-left' : 'text-right tabular-nums'} ${forte ? 'font-semibold' : ''}`}>{children}</td>;
}

function Vazio({ children }) {
  return <p className="py-6 text-center text-sm text-gray-500">{children}</p>;
}

// Barra de 0–100% da margem consumida (texto sempre ao lado: não depende só da cor)
function Consumo({ v }) {
  if (v == null) return '–';
  const largura = Math.max(2, Math.min(100, v));
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-2 w-24 overflow-hidden rounded-full bg-gray-100 sm:inline-block dark:bg-white/10">
        <span className="block h-full rounded-full" style={{ width: `${largura}%`, background: COR }} />
      </span>
      <span className="w-14 font-semibold tabular-nums">{pct(v, 1)}</span>
    </span>
  );
}
