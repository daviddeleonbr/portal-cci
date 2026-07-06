import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Shield, AlertCircle, ArrowLeft, X, Mail, Copy, CheckCircle2, Loader2 } from 'lucide-react';
import { loginAdmin, getAdminSession } from '../lib/auth';
import * as authResetService from '../services/authResetService';
import LogoCCI from '../components/ui/LogoCCI';

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [resetOpen, setResetOpen] = useState(false);

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
    <div className="min-h-screen bg-[#070912] text-slate-100 antialiased overflow-hidden flex selection:bg-blue-500/30 selection:text-white">
      {/* Background efeitos */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[640px] w-[1200px] -translate-x-1/2 rounded-full bg-blue-600/30 blur-[140px]" />
        <div className="absolute top-[20%] -right-40 h-[500px] w-[700px] rounded-full bg-blue-500/20 blur-[140px]" />
        <div className="absolute top-[55%] -left-40 h-[500px] w-[700px] rounded-full bg-blue-500/15 blur-[140px]" />
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
            <span className="relative inline-flex h-11 w-11 items-center justify-center">
              <LogoCCI className="h-full w-full" title="CCI Admin" />
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
                className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/60 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all backdrop-blur"
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
                  className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-4 pr-11 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/60 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all backdrop-blur"
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
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/40 focus:ring-offset-0"
                />
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Lembrar-me</span>
              </label>
              <button type="button" onClick={() => setResetOpen(true)}
                className="text-sm font-medium text-blue-300 hover:text-blue-200 transition-colors">
                Esqueceu a senha?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#070912] disabled:opacity-70 disabled:hover:scale-100 transition-all"
            >
              <span className="absolute inset-0 rounded-xl bg-blue-500 opacity-0 group-hover:opacity-100 blur-md transition-opacity -z-10" />
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
              <Link to="/cliente/login" className="font-medium text-blue-300 hover:text-blue-200 transition-colors">
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
          <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />
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
          <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-600/20 border border-blue-400/30 backdrop-blur mb-8">
            <Shield className="h-10 w-10 text-blue-200" />
            <span className="absolute inset-0 rounded-2xl bg-blue-500/30 blur-xl -z-10" />
          </div>

          <h2 className="text-3xl sm:text-4xl font-semibold text-white mb-4 tracking-tight leading-tight">
            Portal{' '}
            <span className="text-blue-300">Administrativo</span>
          </h2>
          <p className="text-slate-400 text-[15px] leading-relaxed">
            Gerencie clientes, financeiro, notas fiscais e parametrizações em um único lugar — com inteligência e dados em tempo real.
          </p>

          <div className="mt-10 flex justify-center gap-2">
            <div className="h-1.5 w-8 rounded-full bg-blue-400" />
            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
          </div>
        </motion.div>
      </div>

      <ModalEsqueceuSenha open={resetOpen} onClose={() => setResetOpen(false)} initialEmail={email} />
    </div>
  );
}

function ModalEsqueceuSenha({ open, onClose, initialEmail = '' }) {
  const [emailReset, setEmailReset] = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (open) {
      setEmailReset(initialEmail);
      setEnviado(false);
      setResposta(null);
      setErro('');
      setCopiado(false);
    }
  }, [open, initialEmail]);

  const submit = async (e) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      const r = await authResetService.solicitarReset(emailReset);
      setResposta(r);
      setEnviado(true);
    } catch (err) {
      setErro(err.message || 'Falha ao processar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const copiarLink = async () => {
    if (!resposta?.link) return;
    try {
      await navigator.clipboard.writeText(resposta.link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch { /* noop */ }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1020] backdrop-blur shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-400/30">
                  <Mail className="h-4 w-4 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Recuperar acesso</h3>
                  <p className="text-[11px] text-slate-400">Informe seu e-mail cadastrado</p>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              {enviado ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="text-[12.5px] text-emerald-200 leading-relaxed">
                      {resposta?.link
                        ? 'Se este e-mail estiver cadastrado, geramos um link de redefinição (validade de 1 hora).'
                        : 'Se este e-mail estiver cadastrado, enviamos um link de redefinição para o seu e-mail (validade de 1 hora). Verifique também a caixa de spam.'}
                    </div>
                  </div>

                  {resposta?.ok && resposta.link && (
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Link de redefinição</label>
                      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                        <p className="text-[10.5px] text-slate-400 font-mono break-all">{resposta.link}</p>
                      </div>
                      <button onClick={copiarLink}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-[12px] font-medium text-blue-200 hover:bg-blue-500/20 transition-colors">
                        {copiado ? <><CheckCircle2 className="h-3.5 w-3.5" /> Link copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar link</>}
                      </button>
                      <p className="text-[10.5px] text-amber-300/80 leading-relaxed">
                        O envio automático por e-mail não está ativo no momento — copie e abra a URL acima para redefinir a senha.
                      </p>
                    </div>
                  )}

                  <button onClick={onClose}
                    className="w-full h-10 rounded-lg bg-white/5 border border-white/10 text-sm font-medium text-slate-200 hover:bg-white/10 transition-colors">
                    Fechar
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  {erro && (
                    <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5">
                      <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-300">{erro}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">E-mail</label>
                    <input type="email" required autoFocus
                      value={emailReset}
                      onChange={(e) => setEmailReset(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/60 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    Vamos gerar um link de redefinição com validade de 1 hora. O link funciona para o seu portal (Admin ou Cliente) automaticamente.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={onClose}
                      className="flex-1 h-10 rounded-lg border border-white/10 text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" disabled={loading}
                      className="flex-1 h-10 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-70 inline-flex items-center justify-center gap-1.5">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
