import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Building2, ArrowRight, ArrowLeft } from 'lucide-react';

export default function LandingPortal() {
  return (
    <div className="min-h-screen bg-[#070912] text-slate-100 antialiased overflow-hidden flex flex-col items-center justify-center px-6 selection:bg-violet-500/30 selection:text-white">
      {/* Background efeitos (auroras + vinheta) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[640px] w-[1200px] -translate-x-1/2 rounded-full bg-violet-600/30 blur-[140px]" />
        <div className="absolute top-[20%] -right-40 h-[500px] w-[700px] rounded-full bg-cyan-500/20 blur-[140px]" />
        <div className="absolute top-[55%] -left-40 h-[500px] w-[700px] rounded-full bg-fuchsia-500/15 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(7,9,18,0.6)_70%,_#070912_100%)]" />
      </div>

      {/* Voltar para landing */}
      <Link
        to="/"
        className="absolute top-6 left-6 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[12px] font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] hover:border-white/20 transition-all backdrop-blur"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </Link>

      {/* Logo + título */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-14"
      >
        <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600 text-white font-bold text-2xl mb-6 shadow-xl shadow-violet-500/40">
          <span className="relative z-10">C</span>
          <span className="absolute inset-0 rounded-2xl bg-violet-500 opacity-40 blur-xl" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-3">
          CCI Consultoria
        </h1>
        <p className="text-slate-400 text-base sm:text-lg max-w-md mx-auto">
          Selecione o portal que deseja acessar
        </p>
      </motion.div>

      {/* Cards de portal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
        {/* Admin */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Link
            to="/admin"
            className="group relative block rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-md hover:border-violet-400/40 hover:bg-white/[0.06] transition-all duration-300"
          >
            {/* Glow no hover */}
            <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-violet-500/0 via-violet-500/0 to-violet-500/0 group-hover:from-violet-500/10 group-hover:to-violet-500/0 transition-all duration-500" />

            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300 ring-1 ring-violet-400/20 mb-5 group-hover:bg-violet-500/20 group-hover:text-violet-200 group-hover:ring-violet-400/40 transition-all duration-300">
                <Shield className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-1.5 tracking-tight">Portal Admin</h2>
              <p className="text-[13px] text-slate-400 mb-6 leading-relaxed">
                Gestão financeira, clientes, notas fiscais, boletos e parametrizações do escritório.
              </p>
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-violet-300 group-hover:text-violet-200 group-hover:gap-2.5 transition-all">
                Acessar <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Cliente */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Link
            to="/cliente/login"
            className="group relative block rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-md hover:border-cyan-400/40 hover:bg-white/[0.06] transition-all duration-300"
          >
            <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-cyan-500/0 via-cyan-500/0 to-cyan-500/0 group-hover:from-cyan-500/10 group-hover:to-cyan-500/0 transition-all duration-500" />

            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-400/20 mb-5 group-hover:bg-cyan-500/20 group-hover:text-cyan-200 group-hover:ring-cyan-400/40 transition-all duration-300">
                <Building2 className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-1.5 tracking-tight">Portal do Cliente</h2>
              <p className="text-[13px] text-slate-400 mb-6 leading-relaxed">
                Relatórios, DRE, fluxo de caixa, serviços BPO, documentos e financeiro.
              </p>
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-cyan-300 group-hover:text-cyan-200 group-hover:gap-2.5 transition-all">
                Acessar <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </Link>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-16 text-[11px] text-slate-500 tracking-wider"
      >
        CCI Consultoria · Todos os dados simulados para demonstração
      </motion.p>
    </div>
  );
}
