import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileBarChart, Download, Calendar, ChevronDown } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend,
} from 'recharts';
import PageHeader from '../components/ui/PageHeader';
import { ChartSkeleton } from '../components/ui/LoadingSkeleton';
import { useSimulatedLoading } from '../hooks/useSimulatedLoading';
import { dreData, fluxoCaixaData } from '../data/mockData';
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

export default function Relatorios() {
  const loading = useSimulatedLoading(600);
  const [tab, setTab] = useState('dre');

  if (loading) return (
    <div>
      <PageHeader title="Relatórios" description="DRE e Fluxo de Caixa" />
      <ChartSkeleton />
    </div>
  );

  return (
    <div>
      <PageHeader title="Relatórios" description="Demonstrativos financeiros e contábeis">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">
          <Calendar className="h-4 w-4" />
          <span>Jan - Mar 2026</span>
          <ChevronDown className="h-3 w-3" />
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <Download className="h-4 w-4" />
          Exportar
        </button>
      </PageHeader>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('dre')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === 'dre' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          DRE
        </button>
        <button
          onClick={() => setTab('fluxo')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === 'fluxo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Fluxo de Caixa
        </button>
      </div>

      {tab === 'dre' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* DRE Table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Demonstrativo de Resultado do Exercicio</h3>
                <p className="text-xs text-gray-500 mt-0.5">{dreData.periodo}</p>
              </div>
              <FileBarChart className="h-5 w-5 text-gray-400" />
            </div>
            <div className="divide-y divide-gray-50">
              {dreData.itens.map((item) => {
                const isTotal = item.nivel === 0;
                const isResult = item.tipo === 'resultado';
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-6 py-3 ${
                      isResult ? 'bg-blue-50/50' : isTotal ? 'bg-gray-50/50' : ''
                    }`}
                  >
                    <span
                      className={`text-sm ${
                        isResult
                          ? 'font-bold text-blue-700'
                          : isTotal
                          ? 'font-semibold text-gray-900'
                          : 'text-gray-600 pl-6'
                      }`}
                    >
                      {item.descricao}
                    </span>
                    <span
                      className={`text-sm font-mono ${
                        isResult
                          ? 'font-bold text-blue-700'
                          : item.valor < 0
                          ? 'text-red-500 font-medium'
                          : isTotal
                          ? 'font-semibold text-gray-900'
                          : 'text-gray-700'
                      }`}
                    >
                      {formatCurrency(item.valor)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DRE Visual Summary */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-xs text-gray-500 mb-1">Receita Liquida</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(438885)}</p>
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-xs text-gray-500 mb-1">Lucro Bruto</p>
              <p className="text-2xl font-semibold text-emerald-600">{formatCurrency(263715)}</p>
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '60.1%' }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">Margem: 60.1%</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-xs text-gray-500 mb-1">Lucro Operacional</p>
              <p className="text-2xl font-semibold text-blue-600">{formatCurrency(175170)}</p>
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: '35.9%' }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">Margem: 35.9%</p>
            </div>
          </div>
        </motion.div>
      )}

      {tab === 'fluxo' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Cash Flow Chart */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-6">Fluxo de Caixa Mensal</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={fluxoCaixaData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={customTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="entradas" name="Entradas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Saldo Chart */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-6">Evolucao do Saldo</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={fluxoCaixaData}>
                <defs>
                  <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={customTooltip} />
                <Area type="monotone" dataKey="saldo" name="Saldo" stroke="#3b82f6" strokeWidth={2} fill="url(#colorSaldo)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Cash Flow Table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Detalhamento Mensal</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mês</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Entradas</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saídas</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fluxoCaixaData.map(row => (
                    <tr key={row.mes} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{row.mes}</td>
                      <td className="px-6 py-3 text-sm text-right text-emerald-600 font-medium">{formatCurrency(row.entradas)}</td>
                      <td className="px-6 py-3 text-sm text-right text-red-500 font-medium">{formatCurrency(row.saidas)}</td>
                      <td className="px-6 py-3 text-sm text-right font-semibold text-blue-600">{formatCurrency(row.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-100">
                    <td className="px-6 py-3 text-sm font-semibold text-gray-900">Total</td>
                    <td className="px-6 py-3 text-sm text-right font-semibold text-emerald-600">
                      {formatCurrency(fluxoCaixaData.reduce((s, r) => s + r.entradas, 0))}
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-semibold text-red-500">
                      {formatCurrency(fluxoCaixaData.reduce((s, r) => s + r.saidas, 0))}
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-bold text-blue-600">
                      {formatCurrency(fluxoCaixaData.reduce((s, r) => s + r.saldo, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
