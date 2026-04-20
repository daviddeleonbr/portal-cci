import { motion } from 'framer-motion';
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Users,
  FileText,
  Receipt,
  Target,
  ArrowUpRight,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import KpiCard from '../components/ui/KpiCard';
import { CardSkeleton, ChartSkeleton } from '../components/ui/LoadingSkeleton';
import StatusBadge from '../components/ui/StatusBadge';
import PageHeader from '../components/ui/PageHeader';
import { useSimulatedLoading } from '../hooks/useSimulatedLoading';
import { kpis, receitaMensalData, despesasPorCategoria, resumoClientes } from '../data/mockData';
import { formatCurrency } from '../utils/format';

const customTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-900 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const loading = useSimulatedLoading(700);

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Visao geral do seu negocio" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Visao geral do seu negocio" />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <KpiCard
          title="Receita Total"
          value={formatCurrency(kpis.receitaTotal)}
          icon={DollarSign}
          trend="12.5%"
          trendUp
        />
        <KpiCard
          title="Despesas"
          value={formatCurrency(kpis.despesaTotal)}
          icon={TrendingDown}
          trend="3.2%"
          trendUp={false}
        />
        <KpiCard
          title="Lucro Liquido"
          value={formatCurrency(kpis.lucroLiquido)}
          subtitle={`Margem: ${kpis.margemLucro}%`}
          icon={TrendingUp}
          trend="8.1%"
          trendUp
        />
        <KpiCard
          title="Clientes Ativos"
          value={kpis.clientesAtivos}
          icon={Users}
          trend="+3"
          trendUp
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <KpiCard title="Notas Emitidas" value={kpis.notasEmitidas} icon={FileText} />
        <KpiCard title="Boletos em Aberto" value={kpis.boletosEmAberto} icon={Receipt} />
        <KpiCard title="Ticket Medio" value={formatCurrency(kpis.ticketMedio)} icon={Target} trend="5.3%" trendUp />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Revenue Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="xl:col-span-2 bg-white rounded-xl border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Receita vs Despesas</h3>
              <p className="text-xs text-gray-500 mt-0.5">Evolucao mensal do exercicio</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Receita
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Despesa
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={receitaMensalData}>
              <defs>
                <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDespesa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f87171" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={customTooltip} />
              <Area type="monotone" dataKey="receita" name="Receita" stroke="#3b82f6" strokeWidth={2} fill="url(#colorReceita)" />
              <Area type="monotone" dataKey="despesa" name="Despesa" stroke="#f87171" strokeWidth={2} fill="url(#colorDespesa)" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-gray-100 p-6"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-6">Despesas por Categoria</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={despesasPorCategoria}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="valor"
              >
                {despesasPorCategoria.map((entry, index) => (
                  <Cell key={index} fill={entry.cor} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {despesasPorCategoria.map((item) => (
              <div key={item.categoria} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.cor }} />
                  <span className="text-gray-600">{item.categoria}</span>
                </span>
                <span className="font-medium text-gray-900">{formatCurrency(item.valor)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Lucro Mensal */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl border border-gray-100 p-6"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-6">Lucro Mensal</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={receitaMensalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={customTooltip} />
              <Bar dataKey="lucro" name="Lucro" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Top Clients */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-gray-900">Principais Clientes</h3>
            <button className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-3">
            {resumoClientes.map((cliente, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold text-gray-600">
                    {cliente.nome.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{cliente.nome}</p>
                    <p className="text-xs text-gray-500">Receita mensal</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(cliente.receita)}</p>
                  <StatusBadge status={cliente.status} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
