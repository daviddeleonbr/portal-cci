import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Search, UserRound, Mail, Phone,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import * as cciService from '../services/cciFinanceiroService';

export default function CciFornecedores() {
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState({ open: false, data: null });
  const [confirm, setConfirm] = useState({ open: false });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const data = await cciService.listarFornecedores();
      setFornecedores(data || []);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (form) => {
    try {
      if (form.id) {
        await cciService.atualizarFornecedor(form.id, form);
        showToast('success', 'Fornecedor atualizado');
      } else {
        await cciService.criarFornecedor(form);
        showToast('success', 'Fornecedor criado');
      }
      setModal({ open: false, data: null });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const excluir = async (id) => {
    try {
      await cciService.excluirFornecedor(id);
      showToast('success', 'Fornecedor excluido');
      setConfirm({ open: false });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const filtrados = fornecedores.filter(f => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return f.nome.toLowerCase().includes(q)
      || (f.cpf_cnpj || '').includes(busca)
      || (f.email || '').toLowerCase().includes(q);
  });

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Fornecedores CCI" description="Cadastro de fornecedores da CCI">
        <button onClick={() => setModal({ open: true, data: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Novo Fornecedor
        </button>
      </PageHeader>

      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou email..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
          <UserRound className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{fornecedores.length === 0 ? 'Nenhum fornecedor cadastrado.' : 'Nenhum fornecedor corresponde a busca.'}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map(f => (
            <div key={f.id} className="bg-white rounded-xl border border-gray-200/60 p-4 hover:border-blue-200 hover:shadow-sm transition-all group">
              <div className="flex items-start justify-between mb-2">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <UserRound className="h-4 w-4 text-white" />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setModal({ open: true, data: f })} className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setConfirm({ open: true, nome: f.nome, onConfirm: () => excluir(f.id) })}
                    className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm font-semibold text-gray-900 truncate">{f.nome}</p>
              {f.cpf_cnpj && <p className="text-[11px] text-gray-400 font-mono mt-0.5">{f.cpf_cnpj}</p>}
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                {f.email && (
                  <p className="text-[11px] text-gray-500 truncate flex items-center gap-1.5">
                    <Mail className="h-3 w-3 text-gray-400" /> {f.email}
                  </p>
                )}
                {f.telefone && (
                  <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-gray-400" /> {f.telefone}
                  </p>
                )}
              </div>
              {!f.ativo && (
                <span className="inline-flex mt-2 text-[9px] rounded px-1.5 py-0.5 bg-gray-100 text-gray-500">Inativo</span>
              )}
            </div>
          ))}
        </div>
      )}

      <ModalFornecedor open={modal.open} data={modal.data}
        onClose={() => setModal({ open: false, data: null })} onSave={salvar} />

      <Modal open={confirm.open} onClose={() => setConfirm({ open: false })} title="Excluir" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Excluir o fornecedor <strong>{confirm.nome}</strong>?</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirm({ open: false })} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={confirm.onConfirm} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">Excluir</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ModalFornecedor({ open, data, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(data?.id ? { ...data } : {
        nome: '', cpf_cnpj: '', email: '', telefone: '', observacoes: '', ativo: true,
      });
    }
  }, [open, data]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nome?.trim()) return;
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={data?.id ? 'Editar Fornecedor' : 'Novo Fornecedor'} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
          <input type="text" required autoFocus value={form.nome || ''}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Nome ou razão social"
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">CPF / CNPJ</label>
          <input type="text" value={form.cpf_cnpj || ''}
            onChange={e => setForm(f => ({ ...f, cpf_cnpj: e.target.value }))}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email || ''}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Telefone</label>
            <input type="text" value={form.telefone || ''}
              onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Observacoes</label>
          <textarea rows={2} value={form.observacoes || ''}
            onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <input type="checkbox" checked={form.ativo !== false}
              onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
              className="rounded border-gray-300" />
            Ativo
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="submit" disabled={saving || !form.nome?.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {data?.id ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
