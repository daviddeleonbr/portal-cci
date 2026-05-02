import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Search, Shield, Users, Mail,
  Check, Eye, EyeOff, KeyRound, UserCog, ChevronLeft, ChevronRight,
  IdCard, Lock as LockIcon, ShieldCheck, Network,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import * as usuariosService from '../services/usuariosSistemaService';
import * as clientesService from '../services/clientesService';
import * as mapeamentoService from '../services/mapeamentoService';

export default function CciUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [chavesApi, setChavesApi] = useState([]); // lista de redes
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [modal, setModal] = useState({ open: false, data: null });
  const [confirm, setConfirm] = useState({ open: false });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  };

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const [us, cs, chs] = await Promise.all([
        usuariosService.listarUsuarios(),
        clientesService.listarClientes(),
        mapeamentoService.listarChavesApi(),
      ]);
      setUsuarios(us);
      setClientes(cs || []);
      setChavesApi((chs || []).filter(c => c.ativo !== false));
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

  // Conta quantas empresas cada rede (chave_api) possui
  const empresasPorRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => {
      if (!c.chave_api_id) return;
      m.set(c.chave_api_id, (m.get(c.chave_api_id) || 0) + 1);
    });
    return m;
  }, [clientes]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return usuarios.filter(u => {
      if (filtroTipo !== 'todos' && u.tipo !== filtroTipo) return false;
      if (!q) return true;
      return u.nome.toLowerCase().includes(q)
        || (u.email || '').toLowerCase().includes(q)
        || (u.chaves_api?.nome || '').toLowerCase().includes(q);
    });
  }, [usuarios, busca, filtroTipo]);

  const stats = useMemo(() => ({
    total: usuarios.length,
    admins: usuarios.filter(u => u.tipo === 'admin').length,
    clientes: usuarios.filter(u => u.tipo === 'cliente').length,
    inativos: usuarios.filter(u => u.status === 'inativo').length,
  }), [usuarios]);

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Usuários do Sistema" description="Gerenciamento de acessos aos portais admin e cliente">
        <button onClick={() => setModal({ open: true, data: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Novo Usuário
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total" valor={stats.total} icon={Users} color="blue" />
        <StatCard label="Admins" valor={stats.admins} icon={Shield} color="indigo" />
        <StatCard label="Clientes" valor={stats.clientes} icon={UserCog} color="emerald" />
        <StatCard label="Inativos" valor={stats.inativos} icon={EyeOff} color="gray" />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, email ou cliente..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
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
        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Rede Vinculada</th>
                  <th className="px-4 py-3 text-center">Permissões</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/60 group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 bg-gradient-to-br ${
                          u.tipo === 'admin' ? 'from-indigo-500 to-blue-600' : 'from-emerald-500 to-teal-600'
                        }`}>
                          {u.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{u.nome}</p>
                          <p className="text-[11px] text-gray-500 flex items-center gap-1">
                            <Mail className="h-3 w-3 text-gray-400" />{u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.tipo === 'admin' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Shield className="h-3 w-3" /> Admin CCI
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <UserCog className="h-3 w-3" /> Cliente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.chaves_api ? (
                        <div className="flex items-center gap-2">
                          <Network className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                          <div>
                            <p className="text-sm text-gray-800 truncate max-w-[220px]">{u.chaves_api.nome}</p>
                            <p className="text-[10px] text-gray-400">
                              {empresasPorRede.get(u.chaves_api.id) || 0} empresa(s)
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200">
                        {(u.permissoes || []).length} {(u.permissoes || []).length === 1 ? 'permissao' : 'permissoes'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.status === 'ativo' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Check className="h-3 w-3" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setModal({ open: true, data: u })} title="Editar"
                          className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setConfirm({ open: true, nome: u.nome, onConfirm: () => excluir(u.id) })}
                          title="Excluir"
                          className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModalUsuario open={modal.open} data={modal.data}
        chavesApi={chavesApi} empresasPorRede={empresasPorRede} clientes={clientes}
        onClose={() => setModal({ open: false, data: null })} onSave={salvar} />

      <Modal open={confirm.open} onClose={() => setConfirm({ open: false })} title="Excluir usuário" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Excluir o usuário <strong>{confirm.nome}</strong>? O acesso sera removido imediatamente.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirm({ open: false })} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={confirm.onConfirm} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">Excluir</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ label, valor, icon: Icon, color }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-600',
    indigo:  'bg-indigo-50 text-indigo-600',
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

function ModalUsuario({ open, data, chavesApi, empresasPorRede, clientes, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (data?.id) {
      setForm({ ...data, senha: '', empresas_permitidas: data.empresas_permitidas || null });
    } else {
      setForm({
        nome: '', email: '', senha: '', tipo: 'admin', chave_api_id: null,
        empresas_permitidas: null, // null = acesso total na rede
        permissoes: [], status: 'ativo', observacoes: '',
      });
    }
    setStep(1);
    setMostrarSenha(false);
  }, [open, data]);

  // Empresas da rede selecionada
  const empresasDaRede = useMemo(() => {
    if (!form.chave_api_id) return [];
    return (clientes || []).filter(c => c.chave_api_id === form.chave_api_id);
  }, [form.chave_api_id, clientes]);

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
      empresas_permitidas: novoTipo === 'admin' ? null : f.empresas_permitidas,
      permissoes: (f.permissoes || []).filter(p => permsValidas.includes(p)),
    }));
  };

  const togglePermissao = (key) => {
    setForm(f => {
      const atual = new Set(f.permissoes || []);
      if (atual.has(key)) atual.delete(key); else atual.add(key);
      return { ...f, permissoes: Array.from(atual) };
    });
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
      if (form.tipo === 'cliente' && !form.chave_api_id) return false;
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
  const permsPorGrupo = permsDisponiveis.reduce((acc, p) => {
    (acc[p.grupo] = acc[p.grupo] || []).push(p);
    return acc;
  }, {});
  const temPermissao = (key) => (form.permissoes || []).includes(key);

  return (
    <Modal open={open} onClose={onClose} title={data?.id ? 'Editar Usuário' : 'Novo Usuário'} size="lg">
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
                      ? 'border-indigo-400 bg-indigo-50/60'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}>
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center flex-shrink-0">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">Rede vinculada *</label>
                  <select value={form.chave_api_id || ''}
                    onChange={e => setForm(f => ({ ...f, chave_api_id: e.target.value || null, empresas_permitidas: null }))}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    <option value="">Selecione uma rede</option>
                    {(chavesApi || []).map(ch => {
                      const qtd = (empresasPorRede?.get(ch.id)) || 0;
                      return (
                        <option key={ch.id} value={ch.id}>
                          {ch.nome} · {qtd} empresa{qtd === 1 ? '' : 's'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {form.chave_api_id && empresasDaRede.length > 0 && (
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

                {form.chave_api_id && empresasDaRede.length === 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-700">
                    Esta rede ainda não possui empresas cadastradas. Cadastre clientes com esta chave API antes de criar usuários.
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
              <label className="text-xs font-semibold text-gray-700">
                Selecione as permissões ({(form.permissoes || []).length}/{permsDisponiveis.length})
              </label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={marcarTodas}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-800">Marcar todas</button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={desmarcarTodas}
                  className="text-[11px] font-medium text-gray-500 hover:text-gray-800">Limpar</button>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-3 space-y-3">
              {Object.entries(permsPorGrupo).map(([grupo, perms]) => (
                <div key={grupo}>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{grupo}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {perms.map(p => (
                      <label key={p.key}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-all ${
                          temPermissao(p.key)
                            ? 'border-blue-300 bg-blue-50 text-blue-900'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}>
                        <input type="checkbox" checked={temPermissao(p.key)}
                          onChange={() => togglePermissao(p.key)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navegacao */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-100 mt-4">
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
    </Modal>
  );
}
