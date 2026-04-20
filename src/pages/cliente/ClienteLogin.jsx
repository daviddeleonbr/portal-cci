import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Building2, AlertCircle } from 'lucide-react';
import { loginCliente, getClienteSession } from '../../lib/auth';

export default function ClienteLogin() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (getClienteSession()) navigate('/cliente/dashboard', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      await loginCliente(email, senha);
      navigate('/cliente/dashboard', { replace: true });
    } catch (err) {
      setErro(err.message || 'Falha ao entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - Visual */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-br from-emerald-600 via-teal-700 to-cyan-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.05),transparent_50%)]" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative z-10 max-w-md text-center px-8"
        >
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm mb-8">
            <Building2 className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-3xl font-semibold text-white mb-4">
            Portal do Cliente
          </h2>
          <p className="text-emerald-100 text-lg leading-relaxed">
            Acompanhe seus relatorios, servicos de BPO, documentos e muito mais.
          </p>
          <div className="mt-12 flex justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-white/20" />
            <div className="h-2 w-8 rounded-full bg-white/40" />
            <div className="h-2 w-2 rounded-full bg-white/20" />
          </div>
        </motion.div>

        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-white/5" />
      </div>

      {/* Right - Form */}
      <div className="flex flex-1 flex-col justify-center px-8 lg:px-16 xl:px-24">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto w-full max-w-sm"
        >
          <div className="flex items-center gap-2.5 mb-12">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-lg">
              C
            </div>
            <div>
              <span className="text-xl font-semibold tracking-tight text-gray-900">CCI</span>
              <span className="text-xs block text-gray-500 -mt-0.5">Portal do Cliente</span>
            </div>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-2">
            Acesse sua conta
          </h1>
          <p className="text-gray-500 mb-8">
            Visualize relatorios, acompanhe servicos e gerencie documentos.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {erro && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{erro}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 rounded-lg border border-gray-200 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full h-11 rounded-lg border border-gray-200 px-4 pr-11 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all"
                  placeholder="Sua senha"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm text-gray-600">Lembrar-me</span>
              </label>
              <button type="button" className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
                Esqueceu a senha?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-70 transition-all"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Acesso administrativo?{' '}
              <Link to="/admin" className="font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
                Ir para Admin
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
