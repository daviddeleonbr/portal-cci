// "Meu perfil" do portal do cliente (clique no usuário, no rodapé do menu) —
// igual ao do Visor360: dados do usuário, rede, páginas liberadas, empresas
// com acesso (troca a empresa ativa, se permitido), alterar a própria senha
// (confere a atual no servidor) e sair.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Mail, Network, Building2, LayoutGrid, KeyRound, Eye, EyeOff, Loader2, Check, Lock, LogOut, ShieldCheck,
} from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import { trocarEmpresaAtiva } from '../../../lib/auth';
import { PERMISSOES_CLIENTE, alterarMinhaSenha } from '../../../services/usuariosSistemaService';

const nomeEmp = (c) => c?.razao_social || c?.nome || 'Empresa';

export default function PerfilModalCliente({ onClose, onSair }) {
  const session = useClienteSession();
  const u = session?.usuario;
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex shrink-0 items-center gap-4 border-b border-gray-100 px-6 py-5">
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-lg font-semibold text-white shadow-md shadow-blue-500/20">{iniciais}</span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-gray-900">{u.nome}</h3>
            {u.email && <p className="flex items-center gap-1.5 truncate text-[13px] text-gray-500"><Mail className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate font-mono">{u.email}</span></p>}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Cliente</span>
              {perms.has('gerenciar_usuarios') && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"><ShieldCheck className="h-3 w-3" /> Gerencia usuários</span>
              )}
              {demo && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">Demonstração</span>}
            </div>
          </div>
          <button onClick={onClose} className="self-start rounded-md p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2">
          {/* Dados e acessos */}
          <div className="space-y-4 border-gray-100 px-6 py-5 md:border-r">
            {rede && <Info icon={<Network className="h-4 w-4" />} titulo="Rede">{rede}</Info>}
            <Info icon={<LayoutGrid className="h-4 w-4" />} titulo="Páginas">
              {paginas.length} de {PERMISSOES_CLIENTE.length} páginas
              {paginas.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {paginas.map(p => <span key={p.key} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10.5px] text-gray-600">{p.label}</span>)}
                </div>
              )}
            </Info>
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <Building2 className="h-4 w-4" /> Empresas com acesso
                <span className="ml-auto rounded bg-gray-100 px-1.5 text-[10px] font-semibold normal-case tracking-normal text-gray-500">{restrito ? empresas.length : 'todas'}</span>
              </div>
              {empresas.length === 0 ? (
                <p className="text-[12px] text-gray-400">Nenhuma empresa.</p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {empresas.map(e => {
                    const eAtiva = e.id === ativa;
                    const cls = `flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] ${eAtiva ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-gray-100 bg-gray-50 text-gray-700'}`;
                    const conteudo = (
                      <>
                        {e.empresa_codigo != null && <span className="font-mono text-[10px] text-gray-400">{e.empresa_codigo}</span>}
                        <span className="min-w-0 flex-1 truncate">{nomeEmp(e)}</span>
                        {eAtiva && <span className="text-[10px] font-semibold uppercase">ativa</span>}
                      </>
                    );
                    return (
                      <li key={e.id}>
                        {podeTrocar && !eAtiva
                          ? <button type="button" onClick={() => trocarEmpresaAtiva(e.id)} title="Usar esta empresa" className={`${cls} hover:border-teal-300`}>{conteudo}</button>
                          : <div className={cls}>{conteudo}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {podeTrocar && <p className="mt-1 text-[11px] text-gray-400">Clique numa empresa para trocar a empresa ativa.</p>}
            </div>
          </div>

          {/* Troca de senha */}
          <TrocarSenha demo={demo} />
        </div>

        <div className="flex shrink-0 justify-end border-t border-gray-100 px-6 py-3">
          <button onClick={onSair} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Info({ icon, titulo, children }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{icon} {titulo}</div>
      <div className="pl-6 text-[13px] text-gray-800">{children}</div>
    </div>
  );
}

const inp = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 pr-10 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:opacity-60';

function CampoSenha({ label, valor, onChange, ver, onVer, erro, auto }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <div className="relative">
        <input type={ver ? 'text' : 'password'} value={valor} onChange={e => onChange(e.target.value)} autoComplete={auto} className={inp} />
        <button type="button" onClick={onVer} tabIndex={-1} title={ver ? 'Ocultar' : 'Mostrar'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600">{ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
      </div>
      {erro && <p className="mt-1 text-[11px] text-red-600">{erro}</p>}
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
    <form onSubmit={enviar} className="space-y-3 px-6 py-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600"><KeyRound className="h-4 w-4" /></span>
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Alterar senha</h4>
          <p className="text-[11px] text-gray-400">Vale a partir do próximo login.</p>
        </div>
      </div>
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Alterar senha
          </button>
        </>
      )}
    </form>
  );
}
