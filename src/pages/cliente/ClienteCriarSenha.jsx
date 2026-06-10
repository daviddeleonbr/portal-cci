import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, KeyRound, AlertCircle, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { getClienteSession } from '../../lib/auth';
import LogoCCI from '../../components/ui/LogoCCI';
import {
  verificarPrimeiroAcesso,
  definirSenhaPrimeiroAcesso,
} from '../../services/userImportService';

export default function ClienteCriarSenha() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = useMemo(() => (params.get('email') || '').toLowerCase().trim(), [params]);

  const [verificando, setVerificando] = useState(true);
  const [elegivel, setElegivel] = useState(false);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  // Se já estiver logado, manda direto pro dashboard
  useEffect(() => {
    const s = getClienteSession();
    if (s) {
      navigate(`/cliente/${s.tipoCliente || 'webposto'}/dashboard`, { replace: true });
    }
  }, [navigate]);

  // Verifica elegibilidade ao montar
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!email) { setVerificando(false); return; }
      try {
        const ok = await verificarPrimeiroAcesso(email);
        if (!cancel) { setElegivel(ok); setVerificando(false); }
      } catch {
        if (!cancel) { setElegivel(false); setVerificando(false); }
      }
    })();
    return () => { cancel = true; };
  }, [email]);

  const valido = senha.length >= 6 && senha === confirmacao;

  const submit = async (e) => {
    e.preventDefault();
    setErro('');
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return; }
    if (senha !== confirmacao) { setErro('A confirmação não bate com a senha.'); return; }

    setLoading(true);
    try {
      const session = await definirSenhaPrimeiroAcesso(email, senha);
      navigate(`/cliente/${session.tipoCliente || 'webposto'}/dashboard`, { replace: true });
    } catch (err) {
      setErro(err.message || 'Falha ao criar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070912] text-slate-100 antialiased overflow-hidden flex selection:bg-blue-500/30 selection:text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[640px] w-[1200px] -translate-x-1/2 rounded-full bg-blue-500/25 blur-[140px]" />
        <div className="absolute top-[20%] -right-40 h-[500px] w-[700px] rounded-full bg-blue-600/20 blur-[140px]" />
        <div className="absolute top-[55%] -left-40 h-[500px] w-[700px] rounded-full bg-emerald-500/15 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(7,9,18,0.6)_70%,_#070912_100%)]" />
      </div>

      <Link to="/cliente/login"
        className="absolute top-6 left-6 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[12px] font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] hover:border-white/20 transition-all backdrop-blur">
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar ao login
      </Link>

      <div className="flex flex-1 flex-col justify-center px-6 lg:px-16 xl:px-24 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto w-full max-w-md"
        >
          <div className="flex items-center gap-2.5 mb-10">
            <span className="relative inline-flex h-11 w-11 items-center justify-center">
              <LogoCCI className="h-full w-full" title="CCI" />
            </span>
            <div className="leading-none">
              <p className="text-[15px] font-semibold tracking-tight text-white">CCI</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Primeiro acesso</p>
            </div>
          </div>

          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/20 border border-blue-400/30 backdrop-blur mb-5">
            <KeyRound className="h-5 w-5 text-blue-200" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-2 leading-tight">
            Crie sua senha
          </h1>
          <p className="text-slate-400 mb-8 text-[14px] leading-relaxed">
            Identificamos que este é seu primeiro acesso. Defina uma senha para entrar.
          </p>

          {verificando ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-blue-300 animate-spin" />
            </div>
          ) : !email ? (
            <MensagemBloqueio
              icone={<AlertCircle className="h-5 w-5 text-amber-300" />}
              titulo="E-mail não informado"
              corpo="Volte para a tela de login e digite seu e-mail para iniciar o primeiro acesso."
            />
          ) : !elegivel ? (
            <MensagemBloqueio
              icone={<CheckCircle2 className="h-5 w-5 text-emerald-300" />}
              titulo="Este e-mail já tem senha cadastrada"
              corpo={<>Use a tela de login com sua senha atual. Esqueceu? Clique em <em>“Esqueceu a senha?”</em> no login.</>}
            />
          ) : (
            <form onSubmit={submit} className="space-y-5">
              {erro && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 backdrop-blur"
                >
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{erro}</p>
                </motion.div>
              )}

              <div>
                <label className="block text-[12px] font-medium text-slate-300 mb-1.5 uppercase tracking-wider">E-mail</label>
                <input type="email" value={email} readOnly
                  className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm text-slate-400 cursor-not-allowed" />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Nova senha</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} required autoFocus
                    value={senha} onChange={(e) => setSenha(e.target.value)}
                    minLength={6}
                    className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-4 pr-11 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/60 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all backdrop-blur"
                    placeholder="Mínimo 6 caracteres" />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Confirme a senha</label>
                <div className="relative">
                  <input type={showConfirm ? 'text' : 'password'} required
                    value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
                    minLength={6}
                    className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-4 pr-11 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/60 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all backdrop-blur"
                    placeholder="Repita a senha" />
                  <button type="button" onClick={() => setShowConfirm(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmacao && senha !== confirmacao && (
                  <p className="mt-1.5 text-[11px] text-amber-300">As senhas não batem.</p>
                )}
              </div>

              <button type="submit" disabled={loading || !valido}
                className="group relative w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-blue-500 text-sm font-semibold text-white shadow-xl shadow-blue-500/30 hover:bg-blue-400 hover:shadow-blue-400/50 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#070912] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all">
                <span className="absolute inset-0 rounded-xl bg-blue-400 opacity-0 group-hover:opacity-100 blur-md transition-opacity -z-10" />
                {loading ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Criar senha e entrar
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <Link to="/cliente/login" className="text-sm font-medium text-blue-300 hover:text-blue-200 transition-colors">
              Já tenho uma senha — ir para o login
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function MensagemBloqueio({ icone, titulo, corpo }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">{icone}</div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">{titulo}</p>
          <p className="text-[12.5px] text-slate-400 leading-relaxed">{corpo}</p>
        </div>
      </div>
    </div>
  );
}
