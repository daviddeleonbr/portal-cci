import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import * as authResetService from '../../services/authResetService';

export default function ClienteRedefinirSenha() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [validando, setValidando] = useState(true);
  const [usuario, setUsuario] = useState(null);
  const [erroValidacao, setErroValidacao] = useState('');

  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [show, setShow] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await authResetService.validarToken(token);
        if (cancelado) return;
        if (!r.ok) {
          const map = {
            token_vazio:     'Link inválido. Verifique se você copiou a URL completa.',
            nao_encontrado:  'Link inválido ou inexistente.',
            ja_usado:        'Este link já foi usado. Solicite uma nova redefinição.',
            expirado:        'Este link expirou. Solicite uma nova redefinição.',
            usuario_invalido:'Usuário inválido ou inativo.',
          };
          setErroValidacao(map[r.motivo] || 'Link inválido.');
        } else {
          setUsuario(r.usuario);
        }
      } catch (e) {
        if (!cancelado) setErroValidacao(e.message || 'Falha ao validar link.');
      } finally {
        if (!cancelado) setValidando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas não coincidem.');
      return;
    }
    setSalvando(true);
    try {
      const r = await authResetService.redefinirSenha(token, senha);
      setSucesso(true);
      const destino = r?.usuario?.tipo === 'admin' ? '/admin' : '/cliente/login';
      setTimeout(() => navigate(destino, { replace: true }), 2200);
    } catch (e) {
      setErro(e.message || 'Falha ao redefinir senha.');
    } finally {
      setSalvando(false);
    }
  };

  const portalNome = usuario?.tipo === 'admin' ? 'Admin' : 'Cliente';
  const linkVoltar = usuario?.tipo === 'admin' ? '/admin' : '/cliente/login';

  return (
    <div className="min-h-screen bg-[#070912] text-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[640px] w-[1200px] -translate-x-1/2 rounded-full bg-blue-500/20 blur-[140px]" />
        <div className="absolute top-[55%] -left-40 h-[500px] w-[700px] rounded-full bg-blue-600/15 blur-[140px]" />
      </div>

      <Link to={linkVoltar}
        className="absolute top-6 left-6 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[12px] font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] hover:border-white/20 transition-all backdrop-blur">
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar ao login
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/20 border border-blue-400/30 backdrop-blur mb-4">
            <Lock className="h-6 w-6 text-blue-200" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Redefinir senha</h1>
          <p className="text-sm text-slate-400 mt-1.5">
            {usuario ? `Para ${usuario.email}` : 'Crie uma nova senha de acesso ao portal'}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-6">
          {validando ? (
            <div className="py-8 flex items-center justify-center gap-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Validando link...</span>
            </div>
          ) : erroValidacao ? (
            <div className="text-center py-6 space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 border border-red-500/30">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <p className="text-sm text-red-300">{erroValidacao}</p>
              <Link to={linkVoltar}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-400/30 px-4 py-2 text-sm font-medium text-blue-200 hover:bg-blue-500/20 transition-colors">
                Voltar ao login
              </Link>
            </div>
          ) : sucesso ? (
            <div className="text-center py-6 space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <p className="text-sm text-emerald-200">Senha redefinida com sucesso!</p>
              <p className="text-xs text-slate-400">Redirecionando para o login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {erro && (
                <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{erro}</p>
                </div>
              )}

              <div>
                <label className="block text-[12px] font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Nova senha</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    required minLength={6}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-4 pr-11 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/60 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button type="button" onClick={() => setShow(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Confirme a nova senha</label>
                <div className="relative">
                  <input
                    type={showConf ? 'text' : 'password'}
                    required minLength={6}
                    value={confirmacao}
                    onChange={(e) => setConfirmacao(e.target.value)}
                    className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] px-4 pr-11 text-sm text-white placeholder:text-slate-500 focus:border-blue-400/60 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Repita a senha"
                  />
                  <button type="button" onClick={() => setShowConf(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                    {showConf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={salvando}
                className="w-full h-11 rounded-xl bg-blue-500 text-sm font-semibold text-white shadow-xl shadow-blue-500/30 hover:bg-blue-400 transition-all disabled:opacity-70">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Redefinir senha'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
