import { NavLink, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layers, Link2, FlaskConical, Wallet } from 'lucide-react';

const tabs = [
  { name: 'Mascaras DRE', href: '/admin/parametros/mascaras', icon: Layers },
  { name: 'Mascaras Fluxo de Caixa', href: '/admin/parametros/fluxo-caixa', icon: Wallet },
  { name: 'Mapeamento', href: '/admin/parametros/mapeamento', icon: Link2 },
  { name: 'Analise de Lancamentos', href: '/admin/parametros/analise-lancamentos', icon: FlaskConical },
];

export default function Parametros() {
  return (
    <div>
      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-0.5 mb-5 bg-gray-100/80 rounded-lg p-0.5 w-fit"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.name}
            to={tab.href}
            className={({ isActive }) =>
              `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`
            }
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.name}
          </NavLink>
        ))}
      </motion.div>

      {/* Tab content */}
      <Outlet />
    </div>
  );
}
