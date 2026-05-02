import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Shield, AlertCircle, ArrowLeft } from 'lucide-react';
import { loginAdmin, getAdminSession } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (getAdminSession()) navigate('/admin/dashboard', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      await loginAdmin(email, senha);
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setErro(err.message || 'Falha ao entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070912] text-slate-100 antialiased overflow-hidden flex selection:bg-violet-500/30 selection:text-white">
      {/* Background efeitos */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[640px] w-[1200px] -translate-x-1/2 rounded-full bg-violet-600/30 blur-[140px]" />
        <div className="absolute top-[20%] -right-40 h-[500px] w-[700px] rounded-full bg-cyan-500/20 blur-[140px]" />
        <div className="absolute top-[55%] -left-40 h-[500px] w-[700px] rounded-full bg-fuchsia-500/15 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(7,9,18,0.6)_70%,_#070912_100%)]" />
      </div>

      {/* Voltar */}
      <Link
        to="/portais"
        className="absolute top-6 left-6 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[12px] font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] hover:border-white/20 transition-all backdrop-blur"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </Link>

      {/* Lado esquerdo - Form */}
      <div className="flex flex-1 flex-col justify-center px-8 lg:px-16 xl:px-24 relative">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto w-full max-w-sm"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 mb-12 group w-fit">
            <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white font-bold text-base shadow-lg shadow-violet-500/30">
              <span className="relative z-10">C</span>
              <span className="absolute inset-0 rounded-xl bg-violet-500 opacity-0 group-hover:opacity-100 transition-opacity blur-md" />
            </span>
            <div className="leading-none">
              <p className="text-[15px] font-semibold tracking-tight text-white">CCI Admin</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Portal Administrativo</p>
            </div>
          </Link>

          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-2 leading-tight">
            Bem-vindo de volta
          </h1>
          <p className="text-slate-400 mb-9">
            Acesse o portal administrativo da CCI Consultoria.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {erro && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 backdrop-blur"
              >
                <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{erro}</p>
              </motion.div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                E-mail
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all backdrop-blur"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-4 pr-11 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all backdrop-blur"
                  placeholder="Sua senha"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/40 focus:ring-offset-0"
                />
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Lembrar-me</span>
              </label>
              <button type="button" className="text-sm font-medium text-violet-300 hover:text-violet-200 transition-colors">
                Esqueceu a senha?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-semibold text-white shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-[#070912] disabled:opacity-70 disabled:hover:scale-100 transition-all"
            >
              <span className="absolute inset-0 rounded-xl bg-violet-500 opacity-0 group-hover:opacity-100 blur-md transition-opacity -z-10" />
              {loading ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-9 pt-6 border-t border-white/10 text-center">
            <p className="text-sm text-slate-400">
              É cliente?{' '}
              <Link to="/cliente/login" className="font-medium text-violet-300 hover:text-violet-200 transition-colors">
                Acessar Portal do Cliente
              </Link>
            </p>
          </div>
        </motion.div>
      </div>

      {/* Lado direito - Visual */}
      <div className="hidden lg:flex flex-1 items-center justify-center relative overflow-hidden border-l border-white/5">
        {/* Auroras locais reforçando o lado direito */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />
        </div>

        {/* Grid sutil */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative z-10 max-w-md text-center px-8"
        >
          <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-600/20 border border-violet-400/30 backdrop-blur mb-8">
            <Shield className="h-10 w-10 text-violet-200" />
            <span className="absolute inset-0 rounded-2xl bg-violet-500/30 blur-xl -z-10" />
          </div>

          <h2 className="text-3xl sm:text-4xl font-semibold text-white mb-4 tracking-tight leading-tight">
            Portal{' '}
            <span className="text-violet-300">Administrativo</span>
          </h2>
          <p className="text-slate-400 text-[15px] leading-relaxed">
            Gerencie clientes, financeiro, notas fiscais e parametrizações em um único lugar — com inteligência e dados em tempo real.
          </p>

          <div className="mt-10 flex justify-center gap-2">
            <div className="h-1.5 w-8 rounded-full bg-violet-400" />
            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
