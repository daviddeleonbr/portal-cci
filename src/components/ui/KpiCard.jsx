import { motion } from 'framer-motion';

export default function KpiCard({ title, value, subtitle, icon: Icon, trend, trendUp }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-md transition-shadow duration-200"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-lg bg-gray-50 p-2.5">
            <Icon className="h-5 w-5 text-gray-600" />
          </div>
          {trend && (
            <span className={`text-xs font-medium ${trendUp ? 'text-emerald-600' : 'text-red-500'}`}>
              {trendUp ? '+' : ''}{trend}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
