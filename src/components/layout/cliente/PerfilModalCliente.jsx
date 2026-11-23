// "Meu perfil" do portal do cliente (clique no usuário, no rodapé do menu) —
// igual ao do Visor360: dados do usuário, rede, páginas liberadas, empresas
// com acesso (troca a empresa ativa, se permitido), alterar a própria senha
// (confere a atual no servidor). Sair fica no rodapé do menu, não aqui.
// Celular: gaveta de baixo pra cima (alça, safe-area), "Alterar senha"
// recolhido num acordeão, linhas de empresa com 48px e campos em 16px
// (abaixo disso o iOS dá zoom no foco). Desktop (md+): modal em 2 colunas.

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Mail, Network, Building2, LayoutGrid, KeyRound, Eye, EyeOff, Loader2, Check, Lock, ShieldCheck, ChevronDown, CircleCheck,
} from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import { trocarEmpresaAtiva } from '../../../lib/auth';
import { PERMISSOES_CLIENTE, alterarMinhaSenha } from '../../../services/usuariosSistemaService';
import { VERSAO_ATUAL } from '../../../lib/novidades';

const nomeEmp = (c) => c?.razao_social || c?.nome || 'Empresa';

export default function PerfilModalCliente({ onClose }) {
  const session = useClienteSession();
  const u = session?.usuario;
  const [verPaginas, setVerPaginas] = useState(false);

  // Esc fecha; trava o scroll da página por trás enquanto aberto
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ov; };
  }, [onClose]);

  if (!u) return null;

  const rede = session.asRede?.nome || session.chaveApi?.nome || '';
  const empresas = [...(session.clientesRede || [])].sort((a, b) => nomeEmp(a).localeCompare(nomeEmp(b)));
  const ativa = session.cliente?.id;
  const perms = new Set(u.permissoes || []);
  const paginas = PERMISSOES_CLIENTE.filter(p => perms.has(p.key));
  const podeTrocar = perms.has('trocar_empresa') && empresas.length > 1;
  const restrito = Array.isArray(u.empresas_permitidas) && u.empresas_permitidas.length > 0;
  const iniciais = (u.nome || '?').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const demo = !!session._demo;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/40 md:p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="perfil-titulo"
        className="flex max-h-[94dvh] md:max-h-[88vh] w-full md:max-w-2xl flex-col overflow-hidden rounded-t-2xl md:rounded-2xl border border-gray-200/70 bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Alça (celular) */}
        <div className="md:hidden flex shrink-0 justify-center pt-2"><span className="h-1 w-10 rounded-full bg-gray-300" /></div>
        {/* Cabeçalho */}
        <div className="flex shrink-0 items-center gap-3 md:gap-4 border-b border-gray-100 px-4 md:px-6 py-3 md:py-5">
          <span className="flex h-12 w-12 md:h-14 md:w-14 flex-shrink-0 items-center justify-center rounded-full bg-blue-700 text-base md:text-lg font-semibold text-white" aria-hidden="true">{iniciais}</span>
          <div className="min-w-0 flex-1">
            <h3 id="perfil-titulo" className="truncate text-base md:text-lg font-semibold text-gray-900">{u.nome}</h3>
            {u.email && <p className="flex items-center gap-1.5 truncate text-[13px] text-gray-600"><Mail className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /> <span className="truncate">{u.email}</span></p>}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Cliente</span>
              {perms.has('gerenciar_usuarios') && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"><ShieldCheck className="h-3 w-3" /> Gerencia usuários</span>
              )}
              {demo && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">Demonstração</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="self-start -mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto overscroll-contain md:grid-cols-2">
          {/* Dados e acessos */}
          <div className="space-y-5 border-gray-100 px-4 md:px-6 py-4 md:py-5 md:border-r">
            {rede && <Info icon={<Network className="h-4 w-4" />} titulo="Rede">{rede}</Info>}
            <Info icon={<LayoutGrid className="h-4 w-4" />} titulo="Páginas">
              {paginas.length} de {PERMISSOES_CLIENTE.length} páginas
              {paginas.length > 0 && (
                <>
                  {/* Celular: lista recolhida por padrão */}
                  <button type="button" onClick={() => setVerPaginas(v => !v)} aria-expanded={verPaginas}
                    className="md:hidden ml-1 inline-flex items-center gap-0.5 text-[13px] font-semibold text-blue-700">
                    {verPaginas ? 'ocultar' : 'ver quais'} <ChevronDown className={`h-4 w-4 transition-transform ${verPaginas ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`mt-1.5 flex-wrap gap-1.5 ${verPaginas ? 'flex' : 'hidden md:flex'}`}>
                    {paginas.map(p => <span key={p.key} className="rounded-md bg-gray-100 px-2 py-1 text-[12px] md:text-[10.5px] md:px-1.5 md:py-0.5 text-gray-700">{p.label}</span>)}
                  </div>
                </>
              )}
            </Info>
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                <Building2 className="h-4 w-4" aria-hidden="true" /> Empresas com acesso
                <span className="ml-auto rounded bg-gray-100 px-1.5 text-[10px] font-semibold normal-case tracking-normal text-gray-500">{restrito ? empresas.length : 'todas'}</span>
              </div>
              {empresas.length === 0 ? (
                <p className="text-[12px] text-gray-400">Nenhuma empresa.</p>
              ) : (
                <ul className="md:max-h-56 space-y-1.5 md:space-y-1 md:overflow-y-auto md:pr-1">
                  {empresas.map(e => {
                    const eAtiva = e.id === ativa;
                    const cls = `flex w-full items-center gap-2.5 rounded-lg border px-3 md:px-2.5 min-h-[48px] md:min-h-0 py-2 md:py-1.5 text-left text-sm md:text-[12.5px] ${eAtiva ? 'border-blue-700 bg-blue-50 text-blue-800 font-semibold' : 'border-gray-200 md:border-gray-100 bg-white md:bg-gray-50 text-gray-800'}`;
                    const conteudo = (
                      <>
                        {eAtiva
                          ? <CircleCheck className="h-5 w-5 md:h-4 md:w-4 flex-shrink-0 text-blue-700" aria-hidden="true" />
                          : <span className="h-5 w-5 md:h-4 md:w-4 flex-shrink-0 rounded-full border-2 border-gray-300" aria-hidden="true" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{nomeEmp(e)}</span>
                          {e.empresa_codigo != null && <span className="block text-[11px] md:text-[10px] font-normal text-gray-500 tabular-nums">cód. {e.empresa_codigo}</span>}
                        </span>
                        {eAtiva && <span className="text-[10px] font-semibold uppercase">ativa</span>}
                      </>
                    );
                    return (
                      <li key={e.id}>
                        {podeTrocar && !eAtiva
                          ? <button type="button" onClick={() => trocarEmpresaAtiva(e.id)} title="Usar esta empresa" className={`${cls} hover:border-blue-400 active:bg-gray-50`}>{conteudo}</button>
                          : <div className={cls} aria-current={eAtiva ? 'true' : undefined}>{conteudo}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {podeTrocar && <p className="mt-1.5 text-[12px] md:text-[11px] text-gray-600">Toque numa empresa para trocar a empresa ativa.</p>}
            </div>
          </div>

          {/* Troca de senha */}
          <TrocarSenha demo={demo} />
        </div>
        {/* Rodapé: versão do portal (de public/novidades.json). Sem "Sair" — fica no menu. */}
        {VERSAO_ATUAL && (
          <p className="shrink-0 border-t border-gray-100 px-4 md:px-6 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] md:pb-2.5 text-center text-xs text-gray-600">
            Portal CCI · versão <span className="tabular-nums font-medium">{VERSAO_ATUAL}</span>
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Info({ icon, titulo, children }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-600">{icon} {titulo}</div>
      <div className="pl-6 text-sm md:text-[13px] text-gray-900">{children}</div>
    </div>
  );
}

const inp = 'w-full h-12 md:h-auto rounded-lg border border-gray-200 bg-white px-3 py-2.5 pr-12 text-base md:text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60';

function CampoSenha({ label, valor, onChange, ver, onVer, erro, auto }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">
        {label}
        <div className="relative mt-1">
          <input type={ver ? 'text' : 'password'} value={valor} onChange={e => onChange(e.target.value)} autoComplete={auto}
            aria-invalid={!!erro} className={`${inp} ${erro ? '!border-red-500' : ''}`} />
          <button type="button" onClick={onVer} aria-label={ver ? 'Ocultar senhas' : 'Mostrar senhas'} aria-pressed={ver}
            className="absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:text-gray-700">{ver ? <EyeOff className="h-5 w-5 md:h-4 md:w-4" /> : <Eye className="h-5 w-5 md:h-4 md:w-4" />}</button>
        </div>
      </label>
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  );
}

function TrocarSenha({ demo }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [conf, setConf] = useState('');
  const [ver, setVer] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(false);
  const [aberto, setAberto] = useState(false); // só no celular (md+ sempre aberto)

  const curta = nova.length > 0 && nova.length < 6;
  const diferente = conf.length > 0 && conf !== nova;
  const pronto = atual.length > 0 && nova.length >= 6 && conf === nova && !salvando;

  const enviar = async (e) => {
    e.preventDefault(); setErro(null); setOk(false);
    if (!pronto) return;
    setSalvando(true);
    try {
      await alterarMinhaSenha(atual, nova);
      setOk(true); setAtual(''); setNova(''); setConf('');
    } catch (err) { setErro(err.message || 'Falha ao alterar a senha.'); }
    finally { setSalvando(false); }
  };

  return (
    <form onSubmit={enviar} className="space-y-3 border-t md:border-t-0 border-gray-100 px-4 md:px-6 py-4 md:py-5">
      <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto}
        className="flex w-full items-center gap-3 text-left md:pointer-events-none min-h-[44px]">
        <span className="flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><KeyRound className="h-5 w-5 md:h-4 md:w-4" /></span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-gray-900">Alterar senha</span>
          <span className="block text-xs md:text-[11px] text-gray-600">Vale a partir do próximo login.</span>
        </span>
        <ChevronDown className={`md:hidden h-5 w-5 text-gray-500 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <div className={`space-y-3 ${aberto ? 'block' : 'hidden md:block'}`}>
      {demo ? (
        <p className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-[12px] text-gray-500"><Lock className="h-4 w-4" /> O acesso de demonstração não permite alterar a senha.</p>
      ) : (
        <>
          <CampoSenha label="Senha atual" valor={atual} onChange={setAtual} ver={ver} onVer={() => setVer(v => !v)} auto="current-password" />
          <CampoSenha label="Nova senha" valor={nova} onChange={setNova} ver={ver} onVer={() => setVer(v => !v)} erro={curta && 'Mínimo de 6 caracteres.'} auto="new-password" />
          <CampoSenha label="Confirmar nova senha" valor={conf} onChange={setConf} ver={ver} onVer={() => setVer(v => !v)} erro={diferente && 'As senhas não conferem.'} auto="new-password" />
          {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}
          {ok && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><Check className="h-4 w-4" /> Senha alterada com sucesso.</div>}
          <button type="submit" disabled={!pronto}
            className="inline-flex w-full h-12 md:h-auto items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-base md:text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Alterar senha
          </button>
        </>
      )}
      </div>
    </form>
  );
}
