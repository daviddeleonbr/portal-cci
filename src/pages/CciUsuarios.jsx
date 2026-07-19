import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Search, Shield, Users, Mail,
  Check, Eye, EyeOff, KeyRound, UserCog, ChevronLeft, ChevronRight,
  IdCard, Lock as LockIcon, ShieldCheck, Network, Calendar,
  SlidersHorizontal, RotateCcw, Building2,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import SeletorPermissoes from '../components/usuarios/SeletorPermissoes';
import * as usuariosService from '../services/usuariosSistemaService';
import * as clientesService from '../services/clientesService';
import * as mapeamentoService from '../services/mapeamentoService';
import * as autosystemService from '../services/autosystemService';
import { useAdminSession } from '../hooks/useAuth';

// Pill do nível/tipo do usuário (N1/N2/N3 ou Cliente).
function NivelPill({ usuario }) {
  if (usuario.tipo !== 'admin') {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
        <UserCog className="h-3 w-3" /> Cliente
      </span>
    );
  }
  const n = usuariosService.nivelAdmin(usuario);
  const cor = n === 3 ? 'bg-blue-50 text-blue-700 border-blue-200'
            : n === 2 ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
            : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full px-2 py-0.5 border ${cor}`}>
      <Shield className="h-3 w-3" /> Admin · N{n}
    </span>
  );
}

export default function CciUsuarios({ embedded = false }) {
  const session = useAdminSession();
  const ator = session?.usuario || null;
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [chavesApi, setChavesApi] = useState([]); // lista de redes Webposto
  const [redesAutosystem, setRedesAutosystem] = useState([]); // lista de redes Autosystem
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  // 'todas' | 'sem_rede' | 'wp:<id>' | 'as:<id>'
  const [filtroRede, setFiltroRede] = useState('todas');
  const [modal, setModal] = useState({ open: false, data: null });
  const [modalPerms, setModalPerms] = useState({ open: false, data: null });
  const [confirm, setConfirm] = useState({ open: false });
  const [resetInfo, setResetInfo] = useState({ open: false });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  };

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const [us, cs, chs, ars] = await Promise.all([
        usuariosService.listarUsuarios(),
        clientesService.listarClientes(),
        mapeamentoService.listarChavesApi(),
        autosystemService.listarRedes().catch(() => []),
      ]);
      setUsuarios(us);
      setClientes(cs || []);
      setChavesApi((chs || []).filter(c => c.ativo !== false));
      setRedesAutosystem((ars || []).filter(r => r.ativo !== false));
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (form) => {
    try {
      if (form.id) {
        await usuariosService.atualizarUsuario(form.id, form);
        showToast('success', 'Usuário atualizado');
      } else {
        await usuariosService.criarUsuario(form);
        showToast('success', 'Usuário criado');
      }
      setModal({ open: false, data: null });
      await carregar();
    } catch (err) {
      const msg = err.message?.includes('duplicate') || err.message?.includes('unique')
        ? 'Já existe um usuário com esse e-mail.'
        : err.message;
      showToast('error', msg);
    }
  };

  const excluir = async (id) => {
    try {
      await usuariosService.excluirUsuario(id);
      showToast('success', 'Usuário excluido');
      setConfirm({ open: false });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  // Salva só permissões/empresas/nível (via modal de permissões).
  const salvarPermissoes = async (u, patch) => {
    try {
      await usuariosService.atualizarUsuario(u.id, { tipo: u.tipo, ...patch });
      showToast('success', 'Permissões atualizadas');
      setModalPerms({ open: false, data: null });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const resetarSenha = async (u) => {
    try {
      const senha = await usuariosService.resetarSenha(u.id);
      setConfirm({ open: false });
      setResetInfo({ open: true, nome: u.nome, senha });
    } catch (err) { showToast('error', err.message); }
  };

  // Conta quantas empresas cada rede (Webposto OU Autosystem) possui
  const empresasPorRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => {
      if (c.chave_api_id) m.set(c.chave_api_id, (m.get(c.chave_api_id) || 0) + 1);
      if (c.as_rede_id) m.set(c.as_rede_id, (m.get(c.as_rede_id) || 0) + 1);
    });
    return m;
  }, [clientes]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return usuarios.filter(u => {
      if (filtroTipo !== 'todos' && u.tipo !== filtroTipo) return false;
      if (filtroRede !== 'todas') {
        if (filtroRede === 'sem_rede') {
          if (u.chave_api_id || u.as_rede_id) return false;
        } else {
          const [tipo, id] = filtroRede.split(':');
          if (tipo === 'wp' && u.chave_api_id !== id) return false;
          if (tipo === 'as' && u.as_rede_id !== id)   return false;
        }
      }
      if (!q) return true;
      return u.nome.toLowerCase().includes(q)
        || (u.email || '').toLowerCase().includes(q)
        || (u.chaves_api?.nome || '').toLowerCase().includes(q)
        || (u.as_rede?.nome || '').toLowerCase().includes(q);
    });
  }, [usuarios, busca, filtroTipo, filtroRede]);

  const stats = useMemo(() => ({
    total: usuarios.length,
    admins: usuarios.filter(u => u.tipo === 'admin').length,
    clientes: usuarios.filter(u => u.tipo === 'cliente').length,
    inativos: usuarios.filter(u => u.status === 'inativo').length,
  }), [usuarios]);

  const podeGerir = usuariosService.podeGerirUsuarios(ator);

  // Nível 1 (ou sem nível) não tem acesso à gestão de usuários.
  if (!podeGerir) {
    return (
      <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 mb-3">
          <LockIcon className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-gray-900">Acesso restrito</p>
        <p className="text-[13px] text-gray-500 mt-1">A gestão de usuários é exclusiva de administradores nível 2 e 3.</p>
      </div>
    );
  }

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      {!embedded && (
        <PageHeader title="Usuários do Sistema" description="Gerenciamento de acessos aos portais admin e cliente">
          <button onClick={() => setModal({ open: true, data: null })}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Novo Usuário
          </button>
        </PageHeader>
      )}
      {embedded && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setModal({ open: true, data: null })}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Novo Usuário
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total" valor={stats.total} icon={Users} color="blue" />
        <StatCard label="Admins" valor={stats.admins} icon={Shield} color="indigo" />
        <StatCard label="Clientes" valor={stats.clientes} icon={UserCog} color="emerald" />
        <StatCard label="Inativos" valor={stats.inativos} icon={EyeOff} color="gray" />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, email ou rede..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <div className="relative">
          <Network className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <select value={filtroRede} onChange={(e) => setFiltroRede(e.target.value)}
            title="Filtrar por rede"
            className="h-9 rounded-lg border border-gray-200 pl-8 pr-8 text-xs font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 appearance-none cursor-pointer min-w-[200px]">
            <option value="todas">Todas as redes</option>
            <option value="sem_rede">— Sem rede (Admin) —</option>
            {chavesApi.length > 0 && (
              <optgroup label="Webposto">
                {chavesApi.map(r => (
                  <option key={`wp:${r.id}`} value={`wp:${r.id}`}>{r.nome}</option>
                ))}
              </optgroup>
            )}
            {redesAutosystem.length > 0 && (
              <optgroup label="Autosystem">
                {redesAutosystem.map(r => (
                  <option key={`as:${r.id}`} value={`as:${r.id}`}>{r.nome}</option>
                ))}
              </optgroup>
            )}
          </select>
          <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none rotate-90" />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {['todos', 'admin', 'cliente'].map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filtroTipo === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {t === 'todos' ? 'Todos' : t === 'admin' ? 'Admin' : 'Cliente'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
          <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            {usuarios.length === 0 ? 'Nenhum usuário cadastrado ainda.' : 'Nenhum usuário corresponde aos filtros.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtrados.map(u => {
            const podeGerir = usuariosService.podeGerirUsuario(ator, u);
            const rede = u.chaves_api || u.as_rede;
            const redeTipo = u.chaves_api ? 'Webposto' : u.as_rede ? 'Autosystem' : null;
            const qtdEmp = rede ? (empresasPorRede.get(rede.id) || 0) : 0;
            const nPerms = (u.permissoes || []).length;
            const restrito = Array.isArray(u.empresas_permitidas) && u.empresas_permitidas.length > 0;
            return (
              <li key={u.id}
                className="bg-white rounded-xl border border-gray-200/70 shadow-sm px-3.5 py-3 flex items-center gap-3 hover:border-gray-300 transition-colors">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0 bg-gradient-to-br ${
                  u.tipo === 'admin' ? 'from-blue-500 to-blue-600' : 'from-emerald-500 to-teal-600'
                }`}>
                  {u.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 truncate">{u.nome}</p>
                    <NivelPill usuario={u} />
                    {u.status !== 'ativo' && (
                      <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">Inativo</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 font-mono flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3 text-gray-400 flex-shrink-0" />{u.email}
                  </p>
                  <p className="text-[10.5px] text-gray-400 truncate">
                    {rede ? <><Network className="inline h-3 w-3 mr-0.5 -mt-0.5 text-gray-400" />{rede.nome} · {redeTipo} · {qtdEmp} empresa(s)</> : 'Admin CCI'}
                    <span className="mx-1.5 text-gray-300">·</span>
                    {nPerms} {nPerms === 1 ? 'permissão' : 'permissões'}
                    {u.tipo === 'cliente' && <>{' · '}{restrito ? `${u.empresas_permitidas.length} empresa(s)` : 'todas as empresas'}</>}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <IconeAcao title="Permissões" disabled={!podeGerir}
                    onClick={() => setModalPerms({ open: true, data: u })}
                    className="hover:text-blue-600 hover:bg-blue-50"><SlidersHorizontal className="h-4 w-4" /></IconeAcao>
                  <IconeAcao title="Editar" disabled={!podeGerir}
                    onClick={() => setModal({ open: true, data: u })}
                    className="hover:text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></IconeAcao>
                  <IconeAcao title="Resetar senha (123456)" disabled={!podeGerir}
                    onClick={() => setConfirm({ open: true, tipo: 'reset', nome: u.nome, onConfirm: () => resetarSenha(u) })}
                    className="hover:text-amber-600 hover:bg-amber-50"><RotateCcw className="h-3.5 w-3.5" /></IconeAcao>
                  <IconeAcao title="Excluir" disabled={!podeGerir}
                    onClick={() => setConfirm({ open: true, tipo: 'del', nome: u.nome, onConfirm: () => excluir(u.id) })}
                    className="hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></IconeAcao>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ModalUsuario open={modal.open} data={modal.data}
        chavesApi={chavesApi} redesAutosystem={redesAutosystem}
        empresasPorRede={empresasPorRede} clientes={clientes}
        onClose={() => setModal({ open: false, data: null })} onSave={salvar} />

      <ModalPermissoes open={modalPerms.open} usuario={modalPerms.data} ator={ator}
        clientes={clientes}
        onClose={() => setModalPerms({ open: false, data: null })}
        onSave={salvarPermissoes} />

      <Modal open={confirm.open} onClose={() => setConfirm({ open: false })}
        title={confirm.tipo === 'reset' ? 'Resetar senha' : 'Excluir usuário'} size="sm"
        footer={(
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirm({ open: false })} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={confirm.onConfirm}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white ${confirm.tipo === 'reset' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}`}>
              {confirm.tipo === 'reset' ? 'Resetar' : 'Excluir'}
            </button>
          </div>
        )}>
        <p className="text-sm text-gray-600">
          {confirm.tipo === 'reset'
            ? <>Resetar a senha de <strong>{confirm.nome}</strong> para <code className="font-mono bg-gray-100 px-1 rounded">123456</code>? O usuário poderá trocá-la no próximo acesso.</>
            : <>Excluir o usuário <strong>{confirm.nome}</strong>? O acesso será removido imediatamente.</>}
        </p>
      </Modal>

      <Modal open={resetInfo.open} onClose={() => setResetInfo({ open: false })} title="Senha redefinida" size="sm"
        footer={(
          <div className="flex justify-end">
            <button onClick={() => setResetInfo({ open: false })} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Entendi</button>
          </div>
        )}>
        <p className="text-sm text-gray-600">
          A senha de <strong>{resetInfo.nome}</strong> agora é <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-blue-700">{resetInfo.senha}</code>. Informe ao usuário — ele poderá trocá-la após o acesso.
        </p>
      </Modal>
    </div>
  );
}

// Botão de ícone de ação (desabilita quando o ator não pode gerir o alvo).
function IconeAcao({ title, onClick, disabled, className = '', children }) {
  return (
    <button type="button" title={disabled ? 'Sem permissão para este usuário' : title}
      onClick={onClick} disabled={disabled}
      className={`rounded-lg p-2 text-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${disabled ? '' : className}`}>
      {children}
    </button>
  );
}

// Editor de permissões estilo cci_v360_as: modal compacto com abas segmentadas
// (Permissões / Empresas / Nível) e chips de toggle.
function ModalPermissoes({ open, usuario, ator, clientes, onClose, onSave }) {
  const [aba, setAba] = useState('permissoes');
  const [draft, setDraft] = useState({ permissoes: [], empresas_permitidas: null, nivel_admin: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !usuario) return;
    setDraft({
      permissoes: usuario.permissoes || [],
      empresas_permitidas: usuario.empresas_permitidas || null,
      nivel_admin: usuariosService.nivelAdmin(usuario),
    });
    setAba('permissoes');
  }, [open, usuario]);

  const ehCliente = usuario?.tipo === 'cliente';
  const redeTipo = usuario?.as_rede_id ? 'autosystem' : 'webposto';
  const podeNivel = !ehCliente && usuariosService.podeDefinirNivel(ator);
  const catalogo = usuario ? usuariosService.permissoesPorTipo(usuario.tipo) : [];

  const empresasDaRede = useMemo(() => {
    if (!usuario || !ehCliente) return [];
    return (clientes || []).filter(c =>
      (usuario.chave_api_id && c.chave_api_id === usuario.chave_api_id) ||
      (usuario.as_rede_id && c.as_rede_id === usuario.as_rede_id));
  }, [clientes, usuario, ehCliente]);

  const acessoTotal = !draft.empresas_permitidas || draft.empresas_permitidas.length === 0;
  const empPermitida = (id) => acessoTotal || (draft.empresas_permitidas || []).includes(id);
  const toggleEmp = (id) => setDraft(d => {
    const atuais = Array.isArray(d.empresas_permitidas) ? [...d.empresas_permitidas] : empresasDaRede.map(e => e.id);
    const i = atuais.indexOf(id);
    if (i >= 0) atuais.splice(i, 1); else atuais.push(id);
    return { ...d, empresas_permitidas: atuais.length === empresasDaRede.length ? null : atuais };
  });

  const abas = [
    { id: 'permissoes', label: 'Permissões', icon: <ShieldCheck className="h-3.5 w-3.5" />, badge: (draft.permissoes || []).length || '—' },
    ...(ehCliente ? [{ id: 'empresas', label: 'Empresas', icon: <Building2 className="h-3.5 w-3.5" />, badge: acessoTotal ? 'todas' : (draft.empresas_permitidas || []).length }] : []),
    ...(podeNivel ? [{ id: 'nivel', label: 'Nível', icon: <Shield className="h-3.5 w-3.5" />, badge: `N${draft.nivel_admin || 1}` }] : []),
  ];

  const aplicar = async () => {
    setSaving(true);
    try {
      const patch = { permissoes: draft.permissoes };
      if (ehCliente) patch.empresas_permitidas = draft.empresas_permitidas;
      if (podeNivel) patch.nivel_admin = draft.nivel_admin;
      await onSave(usuario, patch);
    } finally { setSaving(false); }
  };

  if (!usuario) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Permissões · ${usuario.nome}`} size="md"
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button onClick={aplicar} disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aplicar
          </button>
        </div>
      )}>
      {/* Abas segmentadas */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 mb-3">
        {abas.map(a => (
          <button key={a.id} type="button" onClick={() => setAba(a.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              aba === a.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {a.icon}<span>{a.label}</span>
            {a.badge !== undefined && a.badge !== '' && (
              <span className={`rounded px-1 text-[9px] font-semibold ${aba === a.id ? 'bg-blue-50 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>{a.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-[240px] max-h-[52vh] overflow-y-auto pr-1">
        {aba === 'permissoes' && (
          <>
            <div className="flex justify-end gap-2 mb-2 text-[11px]">
              <button type="button" onClick={() => setDraft(d => ({ ...d, permissoes: usuariosService.todasPermissoes(usuario.tipo) }))}
                className="font-medium text-blue-600 hover:underline">Marcar todas</button>
              <span className="text-gray-300">·</span>
              <button type="button" onClick={() => setDraft(d => ({ ...d, permissoes: [] }))}
                className="font-medium text-gray-500 hover:underline">Limpar</button>
            </div>
            <SeletorPermissoes catalogo={catalogo} value={draft.permissoes}
              onChange={(arr) => setDraft(d => ({ ...d, permissoes: arr }))}
              tipoCliente={ehCliente ? redeTipo : undefined} />
          </>
        )}

        {aba === 'empresas' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-gray-500">
                {acessoTotal ? 'Acesso total (todas as empresas, incl. futuras)' : `${(draft.empresas_permitidas || []).length}/${empresasDaRede.length} empresas`}
              </p>
              <button type="button" onClick={() => setDraft(d => ({ ...d, empresas_permitidas: null }))}
                className="text-[11px] font-medium text-blue-600 hover:underline">Acesso total</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {empresasDaRede.map(emp => {
                const on = empPermitida(emp.id);
                return (
                  <button key={emp.id} type="button" onClick={() => toggleEmp(emp.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                      on ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}>
                    <span className={`flex h-3 w-3 items-center justify-center rounded-[3px] border ${on ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300'}`}>
                      {on && <Check className="h-2 w-2" strokeWidth={3.5} />}
                    </span>
                    {emp.nome}
                  </button>
                );
              })}
              {empresasDaRede.length === 0 && <p className="text-xs text-gray-400">Nenhuma empresa nesta rede.</p>}
            </div>
          </div>
        )}

        {aba === 'nivel' && (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500 mb-1">Só administradores nível 3 podem alterar o nível.</p>
            {usuariosService.NIVEIS_ADMIN.map(n => {
              const on = (draft.nivel_admin || 1) === n.v;
              return (
                <button key={n.v} type="button" onClick={() => setDraft(d => ({ ...d, nivel_admin: n.v }))}
                  className={`w-full flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${
                    on ? 'border-blue-400 bg-blue-50/60' : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${on ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{n.label}</p>
                    <p className="text-[11px] text-gray-500">{n.desc}</p>
                  </div>
                  {on && <Check className="ml-auto h-4 w-4 text-blue-600" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function StatCard({ label, valor, icon: Icon, color }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-600',
    indigo:  'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    gray:    'bg-gray-100 text-gray-500',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{valor}</p>
    </div>
  );
}

const STEPS = [
  { id: 1, titulo: 'Tipo e identificação', icon: IdCard },
  { id: 2, titulo: 'Credenciais de acesso', icon: LockIcon },
  { id: 3, titulo: 'Permissões', icon: ShieldCheck },
];

function ModalUsuario({ open, data, chavesApi, redesAutosystem, empresasPorRede, clientes, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (data?.id) {
      // Deduz tipo de portal a partir do que está preenchido
      const redeTipo = data.as_rede_id ? 'autosystem' : 'webposto';
      setForm({
        ...data,
        senha: '',
        empresas_permitidas: data.empresas_permitidas || null,
        rede_tipo: redeTipo,
      });
    } else {
      setForm({
        nome: '', email: '', senha: '', tipo: 'admin',
        rede_tipo: 'webposto',
        chave_api_id: null, as_rede_id: null,
        empresas_permitidas: null, // null = acesso total na rede
        permissoes: [], status: 'ativo', observacoes: '',
      });
    }
    setStep(1);
    setMostrarSenha(false);
  }, [open, data]);

  // Empresas da rede selecionada (Webposto ou Autosystem)
  const empresasDaRede = useMemo(() => {
    if (form.rede_tipo === 'autosystem') {
      if (!form.as_rede_id) return [];
      return (clientes || []).filter(c => c.as_rede_id === form.as_rede_id);
    }
    if (!form.chave_api_id) return [];
    return (clientes || []).filter(c => c.chave_api_id === form.chave_api_id);
  }, [form.rede_tipo, form.chave_api_id, form.as_rede_id, clientes]);

  const redeIdSelecionada = form.rede_tipo === 'autosystem' ? form.as_rede_id : form.chave_api_id;

  const acessoTotalEmpresas = !form.empresas_permitidas || form.empresas_permitidas.length === 0;

  const toggleEmpresaPermitida = (empId) => {
    setForm(f => {
      const atuais = Array.isArray(f.empresas_permitidas) ? [...f.empresas_permitidas] : empresasDaRede.map(e => e.id);
      const idx = atuais.indexOf(empId);
      if (idx >= 0) atuais.splice(idx, 1); else atuais.push(empId);
      // Se selecionou todas, volta para null (acesso total)
      if (atuais.length === empresasDaRede.length) return { ...f, empresas_permitidas: null };
      return { ...f, empresas_permitidas: atuais };
    });
  };

  const marcarTodasEmpresas = () => setForm(f => ({ ...f, empresas_permitidas: null }));
  const desmarcarTodasEmpresas = () => setForm(f => ({ ...f, empresas_permitidas: [] }));

  const empresaEstaPermitida = (empId) => {
    if (acessoTotalEmpresas) return true;
    return (form.empresas_permitidas || []).includes(empId);
  };

  const trocarTipo = (novoTipo) => {
    const permsValidas = usuariosService.todasPermissoes(novoTipo);
    setForm(f => ({
      ...f,
      tipo: novoTipo,
      chave_api_id: novoTipo === 'admin' ? null : f.chave_api_id,
      as_rede_id: novoTipo === 'admin' ? null : f.as_rede_id,
      empresas_permitidas: novoTipo === 'admin' ? null : f.empresas_permitidas,
      permissoes: (f.permissoes || []).filter(p => permsValidas.includes(p)),
    }));
  };

  // Alterna entre rede Webposto/Autosystem, zerando o vínculo oposto
  const trocarRedeTipo = (novoRedeTipo) => {
    setForm(f => ({
      ...f,
      rede_tipo: novoRedeTipo,
      chave_api_id: novoRedeTipo === 'webposto' ? f.chave_api_id : null,
      as_rede_id: novoRedeTipo === 'autosystem' ? f.as_rede_id : null,
      empresas_permitidas: null,
    }));
  };

  const marcarTodas = () => {
    setForm(f => ({ ...f, permissoes: usuariosService.todasPermissoes(f.tipo) }));
  };

  const desmarcarTodas = () => {
    setForm(f => ({ ...f, permissoes: [] }));
  };

  // Validacao por passo
  const passoValido = (n) => {
    if (n === 1) {
      if (!form.nome?.trim() || !form.email?.trim()) return false;
      if (form.tipo === 'cliente') {
        if (form.rede_tipo === 'autosystem' && !form.as_rede_id) return false;
        if (form.rede_tipo !== 'autosystem' && !form.chave_api_id) return false;
      }
      return true;
    }
    if (n === 2) {
      if (!data?.id && !form.senha?.trim()) return false;
      return true;
    }
    return true;
  };

  const proximoPasso = () => {
    if (passoValido(step) && step < STEPS.length) setStep(step + 1);
  };
  const passoAnterior = () => {
    if (step > 1) setStep(step - 1);
  };

  const submit = async () => {
    if (!passoValido(1) || !passoValido(2)) return;
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  const permsDisponiveis = usuariosService.permissoesPorTipo(form.tipo);

  return (
    <Modal open={open} onClose={onClose} title={data?.id ? 'Editar Usuário' : 'Novo Usuário'} size="lg"
      footer={(
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {step > 1 && (
              <button type="button" onClick={passoAnterior}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </button>
            )}
            {step < STEPS.length ? (
              <button type="button" onClick={proximoPasso} disabled={!passoValido(step)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Avancar <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={saving || !passoValido(1) || !passoValido(2)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {data?.id ? 'Salvar alteracoes' : 'Criar usuário'}
              </button>
            )}
          </div>
        </div>
      )}>
      {/* Indicador de passos */}
      <div className="flex items-center justify-between mb-5">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          const ativo = step === s.id;
          const concluido = step > s.id;
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex items-center gap-2.5">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center transition-all ${
                  concluido ? 'bg-emerald-500 text-white'
                    : ativo ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  {concluido ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="hidden sm:block">
                  <p className={`text-[10px] font-medium uppercase tracking-wider ${
                    ativo ? 'text-blue-700' : concluido ? 'text-emerald-700' : 'text-gray-400'
                  }`}>Passo {s.id}</p>
                  <p className={`text-xs font-semibold ${
                    ativo || concluido ? 'text-gray-900' : 'text-gray-400'
                  }`}>{s.titulo}</p>
                </div>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 rounded-full ${concluido ? 'bg-emerald-300' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Conteudo do passo */}
      <div className="min-h-[320px]">
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Tipo de acesso *</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => trocarTipo('admin')}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                    form.tipo === 'admin'
                      ? 'border-blue-400 bg-blue-50/60'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}>
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <Shield className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Admin CCI</p>
                    <p className="text-[11px] text-gray-500">Colaborador interno</p>
                  </div>
                </button>
                <button type="button" onClick={() => trocarTipo('cliente')}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                    form.tipo === 'cliente'
                      ? 'border-emerald-400 bg-emerald-50/60'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}>
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                    <UserCog className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Cliente</p>
                    <p className="text-[11px] text-gray-500">Acesso ao portal do cliente</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" autoFocus value={form.nome || ''}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">E-mail *</label>
                <input type="email" value={form.email || ''}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>

            {form.tipo === 'cliente' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Tipo de portal *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => trocarRedeTipo('webposto')}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border-2 text-left transition-all ${
                        form.rede_tipo !== 'autosystem'
                          ? 'border-amber-400 bg-amber-50/60'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}>
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                        <Network className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-900">Webposto</p>
                        <p className="text-[10px] text-gray-500">Integração Quality</p>
                      </div>
                    </button>
                    <button type="button" onClick={() => trocarRedeTipo('autosystem')}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border-2 text-left transition-all ${
                        form.rede_tipo === 'autosystem'
                          ? 'border-blue-400 bg-blue-50/60'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}>
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                        <Network className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-900">Autosystem</p>
                        <p className="text-[10px] text-gray-500">Conexão Postgres remoto</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Rede vinculada *</label>
                  {form.rede_tipo === 'autosystem' ? (
                    <select value={form.as_rede_id || ''}
                      onChange={e => setForm(f => ({ ...f, as_rede_id: e.target.value || null, empresas_permitidas: null }))}
                      className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                      <option value="">Selecione uma rede Autosystem</option>
                      {(redesAutosystem || []).map(r => {
                        const qtd = (empresasPorRede?.get(r.id)) || 0;
                        return (
                          <option key={r.id} value={r.id}>
                            {r.nome} · {qtd} empresa{qtd === 1 ? '' : 's'}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <select value={form.chave_api_id || ''}
                      onChange={e => setForm(f => ({ ...f, chave_api_id: e.target.value || null, empresas_permitidas: null }))}
                      className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                      <option value="">Selecione uma rede Webposto</option>
                      {(chavesApi || []).map(ch => {
                        const qtd = (empresasPorRede?.get(ch.id)) || 0;
                        return (
                          <option key={ch.id} value={ch.id}>
                            {ch.nome} · {qtd} empresa{qtd === 1 ? '' : 's'}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {redeIdSelecionada && empresasDaRede.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-700">
                        Empresas permitidas ({acessoTotalEmpresas ? empresasDaRede.length : (form.empresas_permitidas || []).length}/{empresasDaRede.length})
                      </label>
                      <button type="button" onClick={marcarTodasEmpresas}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-800">Acesso total</button>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-2 max-h-32 overflow-y-auto space-y-1">
                      {empresasDaRede.map(emp => (
                        <label key={emp.id}
                          className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer transition-all ${
                            empresaEstaPermitida(emp.id)
                              ? 'border-blue-300 bg-blue-50 text-blue-900'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}>
                          <input type="checkbox" checked={empresaEstaPermitida(emp.id)}
                            onChange={() => toggleEmpresaPermitida(emp.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                          <span className="flex-1 truncate">{emp.nome}</span>
                          {emp.cnpj && <span className="text-[10px] text-gray-400 font-mono">{emp.cnpj}</span>}
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {acessoTotalEmpresas
                        ? 'Acesso total: o usuário vera todas as empresas da rede (incluindo futuras).'
                        : 'Acesso restrito: o usuário só vera as empresas marcadas.'}
                    </p>
                  </div>
                )}

                {redeIdSelecionada && empresasDaRede.length === 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-700">
                    Esta rede ainda não possui empresas cadastradas. Importe/cadastre empresas nesta rede antes de criar usuários.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {data?.id ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial *'}
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type={mostrarSenha ? 'text' : 'password'}
                  autoFocus
                  value={form.senha || ''}
                  onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                  placeholder={data?.id ? '••••••••' : 'Mínimo 6 caracteres'}
                  minLength={data?.id ? 0 : 6}
                  className="w-full h-10 rounded-lg border border-gray-200 pl-9 pr-10 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                <button type="button" onClick={() => setMostrarSenha(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-700">
                  {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {!data?.id && (
                <p className="mt-1 text-[11px] text-gray-500">O usuário podera alterar a senha após o primeiro acesso.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status || 'ativo'}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                <option value="ativo">Ativo (pode acessar o sistema)</option>
                <option value="inativo">Inativo (acesso bloqueado)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Observacoes</label>
              <textarea rows={3} value={form.observacoes || ''}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                placeholder="Notas internas sobre este usuário"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700">Selecione as permissões</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={marcarTodas}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-800">Marcar todas</button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={desmarcarTodas}
                  className="text-[11px] font-medium text-gray-500 hover:text-gray-800">Limpar</button>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
              <SeletorPermissoes
                catalogo={permsDisponiveis}
                value={form.permissoes || []}
                onChange={(arr) => setForm(f => ({ ...f, permissoes: arr }))}
                tipoCliente={form.rede_tipo}
              />
            </div>
          </div>
        )}
      </div>

    </Modal>
  );
}
