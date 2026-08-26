import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import LogoCCI from '../components/ui/LogoCCI';

// Seletor do Visor360: o cliente escolhe a versão conforme o ERP de origem
// (Webposto ou Autosystem). Cada card leva ao app externo correspondente.
const VISORES = [
  {
    tipo: 'webposto',
    nome: 'Visor360 · Webposto',
    descricao: 'Para redes que operam com o ERP Webposto. Painéis, indicadores e relatórios integrados à sua base Webposto.',
    url: 'https://visor360.cci.app.br',
    logo: '/webposto-logo.png',
  },
  {
    tipo: 'autosystem',
    nome: 'Visor360 · Autosystem',
    descricao: 'Para redes que operam com o ERP Autosystem. Painéis, indicadores e relatórios integrados à sua base Autosystem.',
    url: 'https://visor360-as.cci.app.br',
    logo: '/logo-autosystem.png',
  },
];

export default function LandingVisor360() {
  return (
    <div className="min-h-screen bg-[#070912] text-slate-100 antialiased overflow-hidden flex flex-col items-center justify-center px-6 selection:bg-blue-500/30 selection:text-white">
      {/* Background efeitos (auroras + vinheta) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[640px] w-[1200px] -translate-x-1/2 rounded-full bg-blue-600/30 blur-[140px]" />
        <div className="absolute top-[20%] -right-40 h-[500px] w-[700px] rounded-full bg-blue-500/20 blur-[140px]" />
        <div className="absolute top-[55%] -left-40 h-[500px] w-[700px] rounded-full bg-blue-500/15 blur-[140px]" />
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
        <div className="relative inline-flex h-20 w-20 items-center justify-center mb-6">
          <LogoCCI className="h-full w-full" title="CCI" />
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-3">
          Visor360
        </h1>
        <p className="text-slate-400 text-base sm:text-lg max-w-md mx-auto">
          Selecione a versão conforme o sistema do seu posto
        </p>
      </motion.div>

      {/* Cards do Visor360 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
        {VISORES.map((v, i) => (
          <motion.div
            key={v.tipo}
            initial={{ opacity: 0, x: i === 0 ? -30 : 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
          >
            <a
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-md hover:border-blue-400/40 hover:bg-white/[0.06] transition-all duration-300"
            >
              <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/10 group-hover:to-blue-500/0 transition-all duration-500" />

              <div className="relative">
                <div className="flex h-14 items-center justify-start mb-5">
                  <img
                    src={v.logo}
                    alt={v.nome}
                    className="h-12 w-auto max-w-[180px] object-contain"
                    draggable={false}
                  />
                </div>
                <h2 className="text-lg font-semibold text-white mb-1.5 tracking-tight">{v.nome}</h2>
                <p className="text-[13px] text-slate-400 mb-6 leading-relaxed">{v.descricao}</p>
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-blue-300 group-hover:text-blue-200 group-hover:gap-2.5 transition-all">
                  Abrir Visor360 <ExternalLink className="h-3.5 w-3.5" />
                </div>
              </div>
            </a>
          </motion.div>
        ))}
      </div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-16 text-[11px] text-slate-500 tracking-wider"
      >
        Não sabe qual é o seu? Fale com a CCI.
      </motion.p>
    </div>
  );
}
