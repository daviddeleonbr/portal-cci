// Dashboard do admin: faturamento da CCI a partir das NFS-e emitidas na página
// Notas Fiscais (Asaas). Só aparece para quem tem a permissão de Notas Fiscais.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle, ArrowUpRight, CalendarRange, DollarSign, FileText, Landmark, Lock, RefreshCw, Target, Users,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import KpiCard from '../components/ui/KpiCard';
import { CardSkeleton, ChartSkeleton } from '../components/ui/LoadingSkeleton';
import PageHeader from '../components/ui/PageHeader';
import { useAdminSession } from '../hooks/useAuth';
import { listarNotasFaturamento } from '../services/faturamentoService';
import { mesDe, montarFaturamento, nomeMes, rotuloMes, somarMeses } from '../utils/faturamento';
import { formatCurrency, formatDate } from '../utils/format';
import { isoDataBR } from '../utils/dataBR';

const COR_MES = '#10766e';     // mês escolhido (blue-600 da marca)
const COR_OUTROS = '#8cbfb9';  // demais meses (blue-300)
const pct = (v) => `${(Math.abs(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const moedaCurta = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : String(v));
const cartao = 'rounded-xl border border-gray-100 bg-white p-6';

function DicaBarra({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-gray-900">{nomeMes(d.mes)}</p>
      <p className="font-mono tabular-nums text-gray-900">{formatCurrency(d.valor)}</p>
      <p className="text-gray-500">{plural(d.notas, 'nota', 'notas')} · {plural(d.clientes, 'cliente', 'clientes')}</p>
    </div>
  );
}

export default function Dashboard() {
  const session = useAdminSession();
  const podeVer = (session?.usuario?.permissoes || []).includes('fiscal');
  const mesAtual = isoDataBR().slice(0, 7);
  const [mesEscolhido, setMes] = useState(null); // null = o último mês com nota autorizada
  const [dados, setDados] = useState(null); // { notas, ambiente }
  const [carregando, setCarregando] = useState(podeVer);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!podeVer) return;
    setCarregando(true); setErro('');
    try {
      // Desde janeiro de dois anos atrás: cobre os 24 meses da escolha e o acumulado do ano anterior
      setDados(await listarNotasFaturamento({ de: `${Number(mesAtual.slice(0, 4)) - 2}-01-01` }));
    } catch (e) { setErro(e?.message || 'Falha ao carregar as notas fiscais.'); }
    finally { setCarregando(false); }
  }, [podeVer, mesAtual]);
  useEffect(() => { carregar(); }, [carregar]);

  // Sem escolha, abre no mês atual se já tem nota; senão no último mês com nota
  const ultimoComNota = useMemo(() => (dados ? montarFaturamento(dados.notas, mesAtual).ultimaEmissao : null), [dados, mesAtual]);
  const mes = mesEscolhido || (ultimoComNota && mesDe(ultimoComNota) < mesAtual ? mesDe(ultimoComNota) : mesAtual);
  const f = useMemo(() => (dados ? montarFaturamento(dados.notas, mes) : null), [dados, mes]);
  const meses = useMemo(() => Array.from({ length: 24 }, (_, i) => somarMeses(mesAtual, -i)), [mesAtual]);

  const cabecalho = (
    <PageHeader title="Dashboard" description="Faturamento da CCI pelas notas fiscais emitidas">
      {podeVer && (
        <div className="flex items-center gap-2">
          <select value={mes} onChange={e => setMes(e.target.value)} aria-label="Mês"
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
            {meses.map(m => <option key={m} value={m}>{nomeMes(m).replace(/^./, l => l.toUpperCase())}</option>)}
          </select>
          <button type="button" onClick={carregar} disabled={carregando} title="Atualizar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      )}
    </PageHeader>
  );

  if (!podeVer) {
    return (
      <div>
        {cabecalho}
        <div className={`${cartao} flex flex-col items-center py-16 text-center`}>
          <Lock className="mb-3 h-6 w-6 text-gray-400" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-900">O faturamento aparece para quem tem acesso a Notas Fiscais.</p>
          <p className="mt-1 text-xs text-gray-500">Peça a liberação a um administrador, se precisar.</p>
        </div>
      </div>
    );
  }

  if (carregando && !f) {
    return (
      <div>
        {cabecalho}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <ChartSkeleton />
      </div>
    );
  }

  if (erro || !f) {
    return (
      <div>
        {cabecalho}
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro || 'Sem dados.'}</p>
      </div>
    );
  }

  const { atual, anterior, variacao } = f;
  const semNotasNoMes = atual.notas === 0;
  const media12 = f.serie.reduce((s, x) => s + x.valor, 0) / Math.max(1, f.serie.filter(x => x.valor > 0).length);
  const [anoSel] = mes.split('-');
  const maiorCliente = atual.porCliente[0]?.valor || 0;

  return (
    <div>
      {cabecalho}

      {!dados.ambiente && (
        <Aviso>Nenhuma configuração do Asaas ativa. Configure em <Link to="/admin/fiscal/notas-fiscais" className="font-semibold underline">Notas Fiscais</Link>.</Aviso>
      )}
      {dados.ambiente && dados.ambiente !== 'producao' && (
        <Aviso>A configuração ativa do Asaas é de <strong>teste (sandbox)</strong>: os valores abaixo não são faturamento real.</Aviso>
      )}
      {!mesEscolhido && mes !== mesAtual && (
        <Aviso>
          Ainda não há nota autorizada em {nomeMes(mesAtual)}: mostrando {nomeMes(mes)}, o último mês com notas. Se já houve emissão, sincronize em <Link to="/admin/fiscal/notas-fiscais" className="font-semibold underline">Notas Fiscais</Link>.
        </Aviso>
      )}
      {semNotasNoMes && (
        <Aviso>
          Nenhuma nota autorizada em {nomeMes(mes)}.
          {f.ultimaEmissao && <> A última é de {formatDate(f.ultimaEmissao)}.</>}
          {mes === mesAtual && <> Se já houve emissão, sincronize em <Link to="/admin/fiscal/notas-fiscais" className="font-semibold underline">Notas Fiscais</Link>.</>}
        </Aviso>
      )}

      {/* Mês escolhido */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title={`Faturamento · ${rotuloMes(mes)}`} value={formatCurrency(atual.valor)} icon={DollarSign}
          subtitle={anterior.valor > 0 ? `${rotuloMes(somarMeses(mes, -1))}: ${formatCurrency(anterior.valor)}` : 'Sem faturamento no mês anterior'}
          trend={variacao != null && !semNotasNoMes ? (variacao >= 0 ? pct(variacao) : `−${pct(variacao)}`) : undefined} trendUp={variacao != null && variacao >= 0} />
        <KpiCard title="Notas autorizadas" value={atual.notas.toLocaleString('pt-BR')} icon={FileText}
          subtitle={[atual.canceladas && plural(atual.canceladas, 'cancelada', 'canceladas'), atual.comErro && plural(atual.comErro, 'com erro', 'com erro'), atual.pendentes && plural(atual.pendentes, 'pendente', 'pendentes')].filter(Boolean).join(' · ') || 'Nenhuma cancelada ou com erro'} />
        <KpiCard title="Clientes faturados" value={atual.clientes.toLocaleString('pt-BR')} icon={Users}
          subtitle={anterior.clientes ? `${anterior.clientes.toLocaleString('pt-BR')} no mês anterior` : undefined} />
        <KpiCard title="Ticket médio por cliente" value={formatCurrency(atual.ticket)} icon={Target}
          subtitle={atual.impostos > 0 ? `Impostos retidos: ${formatCurrency(atual.impostos)}` : undefined} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Últimos 12 meses */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${cartao} xl:col-span-2`}>
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900">Faturamento mensal</h3>
            <p className="mt-0.5 text-xs text-gray-500">Notas autorizadas, pelo mês da emissão · clique numa barra para ver o mês</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={f.serie} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={moedaCurta} width={56} />
              <Tooltip content={<DicaBarra />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
              <Bar dataKey="valor" name="Faturamento" isAnimationActive={false} radius={[4, 4, 0, 0]} maxBarSize={44} onClick={(d) => d?.mes && setMes(d.mes)} className="cursor-pointer">
                {f.serie.map(d => <Cell key={d.mes} fill={d.mes === mes ? COR_MES : COR_OUTROS} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Ano e médias */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`${cartao} flex flex-col gap-5`}>
          <Indicador icon={CalendarRange} rotulo={`Acumulado em ${anoSel} (até ${rotuloMes(mes, false)})`} valor={formatCurrency(f.ano)}
            nota={f.variacaoAno != null ? `${f.variacaoAno >= 0 ? '+' : '−'}${pct(f.variacaoAno)} sobre o mesmo período de ${Number(anoSel) - 1}` : `Sem notas no mesmo período de ${Number(anoSel) - 1}`} />
          <Indicador icon={DollarSign} rotulo="Média mensal (últimos 12 meses)" valor={formatCurrency(media12)}
            nota={`Considera só os ${plural(f.serie.filter(x => x.valor > 0).length, 'mês', 'meses')} com faturamento`} />
          <Indicador icon={Landmark} rotulo={`Impostos retidos · ${rotuloMes(mes)}`} valor={formatCurrency(atual.impostos)}
            nota="ISS, PIS, COFINS, INSS, IR e CSLL das notas" />
          <Link to="/admin/fiscal/notas-fiscais" className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
            Ver as notas fiscais <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>

      {/* Por cliente */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-900">Faturamento por cliente · {nomeMes(mes)}</h3>
          <span className="text-xs text-gray-500">{plural(atual.clientes, 'cliente', 'clientes')}</span>
        </div>
        {atual.porCliente.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">Nenhuma nota autorizada neste mês.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <tr><th className="px-6 py-2.5">Cliente</th><th className="px-3 py-2.5 text-right">Notas</th><th className="px-3 py-2.5 text-right">Valor</th><th className="hidden w-48 px-6 py-2.5 sm:table-cell">Participação</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {atual.porCliente.map(c => (
                  <tr key={`${c.cnpj}|${c.nome}`}>
                    <td className="px-6 py-2.5"><p className="font-medium text-gray-900">{c.nome}</p>{c.cnpj && <p className="text-[11px] text-gray-400">{c.cnpj}</p>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{c.notas}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-gray-900">{formatCurrency(c.valor)}</td>
                    <td className="hidden px-6 py-2.5 sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full" style={{ width: `${maiorCliente ? (c.valor / maiorCliente) * 100 : 0}%`, backgroundColor: COR_MES }} />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums text-gray-500">{atual.valor ? pct(c.valor / atual.valor) : '–'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Aviso({ children }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{children}</p>
    </div>
  );
}

function Indicador({ icon: Icone, rotulo, valor, nota }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-gray-50 p-2"><Icone className="h-4 w-4 text-gray-600" aria-hidden="true" /></div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{rotulo}</p>
        <p className="text-lg font-semibold tabular-nums text-gray-900">{valor}</p>
        {nota && <p className="text-[11px] text-gray-500">{nota}</p>}
      </div>
    </div>
  );
}
