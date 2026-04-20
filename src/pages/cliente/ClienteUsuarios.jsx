import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Search, Users, Mail, Building2,
  Check, Eye, EyeOff, KeyRound, ShieldCheck, AlertCircle,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import { useClienteSession } from '../../hooks/useAuth';
import * as usuariosService from '../../services/usuariosSistemaService';

export default function ClienteUsuarios() {
  const session = useClienteSession();
  const chaveApi = session?.chaveApi;
  const usuarioLogado = session?.usuario;
  const empresasDisponiveis = session?.clientesRede || [];
  const podeGerenciar = !!usuarioLogado?.permissoes?.includes('gerenciar_usuarios');

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState({ open: false, data: null });
  const [confirm, setConfirm] = useState({ open: false });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  };

  const carregar = useCallback(async () => {
    if (!chaveApi?.id) return;
    try {
      setLoading(true);
      const data = await usuariosService.listarUsuariosDaRede(chaveApi.id);
      setUsuarios(data);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, [chaveApi?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (form) => {
    try {
      // Forca tipo=cliente e a rede do admin logado
      const payload = { ...form, tipo: 'cliente', chave_api_id: chaveApi.id };
      if (form.id) {
        await usuariosService.atualizarUsuario(form.id, payload);
        showToast('success', 'Usuario atualizado');
      } else {
        await usuariosService.criarUsuario(payload);
        showToast('success', 'Usuario criado');
      }
      setModal({ open: false, data: null });
      await carregar();
    } catch (err) {
      const msg = err.message?.includes('duplicate') || err.message?.includes('unique')
        ? 'Ja existe um usuario com esse e-mail.'
        : err.message;
      showToast('error', msg);
    }
  };

  const excluir = async (id) => {
    try {
      await usuariosService.excluirUsuario(id);
      showToast('success', 'Usuario excluido');
      setConfirm({ open: false });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(u =>
      u.nome.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
  }, [usuarios, busca]);

  if (!podeGerenciar) {
    return (
      <div>
        <PageHeader title="Usuarios da Rede" description="Gerenciamento de acessos dos usuarios da sua rede" />
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-900 mb-1">Acesso restrito</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Voce nao tem permissao para gerenciar usuarios. Contate o administrador da rede.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Usuarios da Rede"
        description={`Gerencie os acessos dos usuarios da rede ${chaveApi?.nome || ''}`}>
        <button onClick={() => setModal({ open: true, data: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Novo Usuario
        </button>
      </PageHeader>

      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou email..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
          <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            {usuarios.length === 0 ? 'Nenhum usuario cadastrado na sua rede ainda.' : 'Nenhum usuario corresponde a busca.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3 text-center">Empresas</th>
                  <th className="px-4 py-3 text-center">Permissoes</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map(u => {
                  const qtdEmp = Array.isArray(u.empresas_permitidas) && u.empresas_permitidas.length > 0
                    ? u.empresas_permitidas.length
                    : empresasDisponiveis.length;
                  const acessoTotal = !u.empresas_permitidas || u.empresas_permitidas.length === 0;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/60 group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600">
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
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border ${
                          acessoTotal ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                          <Building2 className="h-3 w-3" /> {acessoTotal ? `Todas (${qtdEmp})` : `${qtdEmp} empresa${qtdEmp === 1 ? '' : 's'}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <ShieldCheck className="h-3 w-3" /> {(u.permissoes || []).length}
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
                          {u.id !== usuarioLogado?.id && (
                            <button onClick={() => setConfirm({ open: true, nome: u.nome, onConfirm: () => excluir(u.id) })}
                              title="Excluir"
                              className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModalUsuarioRede open={modal.open} data={modal.data} empresas={empresasDisponiveis}
        onClose={() => setModal({ open: false, data: null })} onSave={salvar} />

      <Modal open={confirm.open} onClose={() => setConfirm({ open: false })} title="Excluir usuario" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Excluir o usuario <strong>{confirm.nome}</strong>? O acesso sera removido imediatamente.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirm({ open: false })} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={confirm.onConfirm} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">Excluir</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ModalUsuarioRede({ open, data, empresas, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (data?.id) {
      setForm({ ...data, senha: '', empresas_permitidas: data.empresas_permitidas || null });
    } else {
      setForm({
        nome: '', email: '', senha: '',
        empresas_permitidas: null, // acesso total por padrao
        permissoes: ['dashboard', 'dre', 'fluxo_caixa'], // defaults razoaveis
        status: 'ativo',
      });
    }
    setMostrarSenha(false);
  }, [open, data]);

  const acessoTotal = !form.empresas_permitidas || form.empresas_permitidas.length === 0;
  const empresaOk = (id) => acessoTotal || (form.empresas_permitidas || []).includes(id);

  const toggleEmpresa = (id) => {
    setForm(f => {
      const atuais = Array.isArray(f.empresas_permitidas) ? [...f.empresas_permitidas] : empresas.map(e => e.id);
      const idx = atuais.indexOf(id);
      if (idx >= 0) atuais.splice(idx, 1); else atuais.push(id);
      if (atuais.length === empresas.length) return { ...f, empresas_permitidas: null };
      return { ...f, empresas_permitidas: atuais };
    });
  };

  const togglePermissao = (key) => {
    setForm(f => {
      const s = new Set(f.permissoes || []);
      if (s.has(key)) s.delete(key); else s.add(key);
      return { ...f, permissoes: Array.from(s) };
    });
  };

  const permsPorGrupo = usuariosService.PERMISSOES_CLIENTE.reduce((acc, p) => {
    (acc[p.grupo] = acc[p.grupo] || []).push(p);
    return acc;
  }, {});
  const temPerm = (k) => (form.permissoes || []).includes(k);

  const submit = async () => {
    if (!form.nome?.trim() || !form.email?.trim()) return;
    if (!data?.id && !form.senha?.trim()) return;
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={data?.id ? 'Editar Usuario' : 'Novo Usuario da Rede'} size="lg">
      <div className="space-y-4">
        {/* Dados */}
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

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {data?.id ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial *'}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type={mostrarSenha ? 'text' : 'password'}
                value={form.senha || ''}
                onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                placeholder={data?.id ? '••••••••' : 'Minimo 6 caracteres'}
                className="w-full h-10 rounded-lg border border-gray-200 pl-9 pr-10 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              <button type="button" onClick={() => setMostrarSenha(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-700">
                {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status || 'ativo'}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
        </div>

        {/* Empresas */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-700">
              Empresas permitidas ({acessoTotal ? empresas.length : (form.empresas_permitidas || []).length}/{empresas.length})
            </label>
            <button type="button" onClick={() => setForm(f => ({ ...f, empresas_permitidas: null }))}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-800">Acesso total</button>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-2 max-h-32 overflow-y-auto space-y-1">
            {empresas.map(emp => (
              <label key={emp.id}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer transition-all ${
                  empresaOk(emp.id) ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}>
                <input type="checkbox" checked={empresaOk(emp.id)}
                  onChange={() => toggleEmpresa(emp.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                <span className="flex-1 truncate">{emp.nome}</span>
                {emp.cnpj && <span className="text-[10px] text-gray-400 font-mono">{emp.cnpj}</span>}
              </label>
            ))}
          </div>
        </div>

        {/* Permissoes */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Permissoes ({(form.permissoes || []).length}/{usuariosService.PERMISSOES_CLIENTE.length})
          </label>
          <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-3 space-y-3">
            {Object.entries(permsPorGrupo).map(([grupo, perms]) => (
              <div key={grupo}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{grupo}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {perms.map(p => (
                    <label key={p.key}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-all ${
                        temPerm(p.key) ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}>
                      <input type="checkbox" checked={temPerm(p.key)}
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

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="button" onClick={submit}
            disabled={saving || !form.nome?.trim() || !form.email?.trim() || (!data?.id && !form.senha?.trim())}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {data?.id ? 'Salvar alteracoes' : 'Criar usuario'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
