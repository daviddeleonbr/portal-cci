import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Building2, ArrowRight } from 'lucide-react';

export default function LandingPortal() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-600 text-white font-bold text-2xl mb-6 shadow-lg shadow-blue-200/50">
          C
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 mb-3">
          CCI Consultoria
        </h1>
        <p className="text-gray-500 text-lg max-w-md mx-auto">
          Selecione o portal que deseja acessar
        </p>
      </motion.div>

      {/* Portal Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
        {/* Admin Portal */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Link
            to="/admin"
            className="group block bg-white rounded-2xl border border-gray-100 p-8 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-100/50 transition-all duration-300"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-6 group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
              <Shield className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Portal Admin</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Gestão financeira, clientes, notas fiscais, boletos e parametrizações do escritório.
            </p>
            <div className="flex items-center gap-2 text-sm font-medium text-blue-600 group-hover:gap-3 transition-all">
              Acessar <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        </motion.div>

        {/* Client Portal */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Link
            to="/cliente/login"
            className="group block bg-white rounded-2xl border border-gray-100 p-8 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-100/50 transition-all duration-300"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mb-6 group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
              <Building2 className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Portal do Cliente</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Relatórios, DRE, fluxo de caixa, serviços BPO, documentos e financeiro.
            </p>
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 group-hover:gap-3 transition-all">
              Acessar <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-16 text-xs text-gray-400"
      >
        CCI Consultoria Contábil - Todos os dados simulados para demonstração
      </motion.p>
    </div>
  );
}
