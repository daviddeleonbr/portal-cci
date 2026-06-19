// Admin: cadastro de Mensagens Iniciais que aparecem em modal
// "Novidades" para clientes ao logar — UMA vez por usuário, com
// segmentação por tipo de portal (webposto / autosystem / ambos).

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Search, Megaphone, Eye, EyeOff,
  Sparkles, Wrench, AlertTriangle, Info, Globe, Calendar, Users,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import { useAdminSession } from '../hooks/useAuth';
import * as mensagensService from '../services/mensagensIniciaisService';

const CAT_META = {
  novidade:    { label: 'Novidade',    icone: Sparkles,       cor: 'bg-blue-100 text-blue-700 border-blue-200' },
  atualizacao: { label: 'Atualização', icone: Wrench,         cor: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  manutencao:  { label: 'Manutenção',  icone: AlertTriangle,  cor: 'bg-amber-100 text-amber-700 border-amber-200' },
  aviso:       { label: 'Aviso',       icone: Info,           cor: 'bg-rose-100 text-rose-700 border-rose-200' },
};
const PUB_META = {
  ambos:      { label: 'Ambos os portais', cor: 'bg-gray-100 text-gray-700 border-gray-200' },
  webposto:   { label: 'Webposto',         cor: 'bg-blue-50 text-blue-700 border-blue-200' },
  autosystem: { label: 'Autosystem',       cor: 'bg-blue-50 text-blue-700 border-blue-200' },
};

export default function CciMensagensIniciais() {
  const session = useAdminSession();
  const [lista, setLista] = useState([]);
  const [views, setViews] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState({ open: false, data: null });
  const [confirm, setConfirm] = useState({ open: false, item: null });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const data = await mensagensService.listar();
      setLista(data);
      const counts = await mensagensService.contarVisualizacoes(data.map(d => d.id)).catch(() => new Map());
      setViews(counts);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (form) => {
    try {
      const payload = { ...form, created_by: form.created_by || session?.usuario?.id || null };
      if (form.id) await mensagensService.atualizar(form.id, payload);
      else         await mensagensService.criar(payload);
      showToast('success', form.id ? 'Mensagem atualizada' : 'Mensagem publicada');
      setModal({ open: false, data: null });
      carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const excluir = async (id) => {
    try {
      await mensagensService.excluir(id);
      showToast('success', 'Mensagem excluída');
      setConfirm({ open: false, item: null });
      carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const toggleAtiva = async (m) => {
    try {
      await mensagensService.atualizar(m.id, { ativa: !m.ativa });
      showToast('success', `Mensagem ${!m.ativa ? 'reativada' : 'desativada'}`);
      carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(m =>
      m.titulo.toLowerCase().includes(q) || (m.conteudo || '').toLowerCase().includes(q)
    );
  }, [lista, busca]);

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Mensagens Iniciais"
        description="Avisos que aparecem em modal para o cliente ao logar — uma vez por usuário.">
        <button onClick={() => setModal({ open: true, data: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Nova mensagem
        </button>
      </PageHeader>

      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título ou conteúdo..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
          <Megaphone className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            {lista.length === 0 ? 'Nenhuma mensagem cadastrada ainda.' : 'Nenhuma mensagem corresponde à busca.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Título / Conteúdo</th>
                  <th className="px-4 py-3 w-36">Categoria</th>
                  <th className="px-4 py-3 w-40">Público</th>
                  <th className="px-4 py-3 text-center w-32">Status</th>
                  <th className="px-4 py-3 text-center w-28">Visualizações</th>
                  <th className="px-4 py-3 w-36">Publicada em</th>
                  <th className="px-4 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map(m => {
                  const cat = CAT_META[m.categoria] || CAT_META.novidade;
                  const pub = PUB_META[m.publico_alvo] || PUB_META.ambos;
                  const Icone = cat.icone;
                  const qtdViews = views.get(m.id) || 0;
                  const expirada = m.expira_em && new Date(m.expira_em) < new Date();
                  return (
                    <tr key={m.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-semibold text-gray-900 truncate max-w-[340px]">{m.titulo}</p>
                        <p className="text-[11.5px] text-gray-500 truncate max-w-[340px] mt-0.5">
                          {m.conteudo}
                        </p>
                        {m.expira_em && (
                          <p className={`text-[10.5px] mt-0.5 inline-flex items-center gap-1 ${expirada ? 'text-rose-600' : 'text-gray-400'}`}>
                            <Calendar className="h-2.5 w-2.5" />
                            {expirada ? 'expirada em ' : 'expira em '} {new Date(m.expira_em).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10.5px] rounded-full px-2 py-0.5 border font-semibold ${cat.cor}`}>
                          <Icone className="h-3 w-3" /> {cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10.5px] rounded-full px-2 py-0.5 border ${pub.cor}`}>
                          <Globe className="h-3 w-3" /> {pub.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleAtiva(m)}
                          title={m.ativa ? 'Clique para desativar' : 'Clique para reativar'}
                          className={`inline-flex items-center gap-1 text-[10.5px] rounded-full px-2 py-0.5 border font-semibold transition-colors ${
                            m.ativa
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200'
                              : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                          }`}>
                          {m.ativa ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {m.ativa ? 'Ativa' : 'Inativa'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200">
                          <Users className="h-3 w-3" /> {qtdViews}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11.5px] text-gray-600">
                        {m.publicada_em ? new Date(m.publicada_em).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => setModal({ open: true, data: m })}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setConfirm({ open: true, item: m })}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      <ModalMensagem open={modal.open} data={modal.data}
        onClose={() => setModal({ open: false, data: null })} onSave={salvar} />

      <Modal open={confirm.open} onClose={() => setConfirm({ open: false, item: null })}
        title="Excluir mensagem" size="sm"
        footer={(
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirm({ open: false, item: null })}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={() => excluir(confirm.item.id)}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">Excluir</button>
          </div>
        )}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Excluir a mensagem <strong>{confirm.item?.titulo}</strong>? Os registros de visualização também serão removidos.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function ModalMensagem({ open, data, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (data?.id) {
      setForm({
        id: data.id,
        titulo: data.titulo || '',
        conteudo: data.conteudo || '',
        categoria: data.categoria || 'novidade',
        publico_alvo: data.publico_alvo || 'ambos',
        ativa: data.ativa !== false,
        expira_em: data.expira_em ? toLocalDatetimeInput(data.expira_em) : '',
      });
    } else {
      setForm({
        titulo: '', conteudo: '',
        categoria: 'novidade',
        publico_alvo: 'ambos',
        ativa: true,
        expira_em: '',
      });
    }
  }, [open, data]);

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));
  const podeSalvar = (form.titulo || '').trim().length > 0 && (form.conteudo || '').trim().length > 0;

  const submit = async () => {
    if (!podeSalvar) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        expira_em: form.expira_em ? new Date(form.expira_em).toISOString() : null,
      });
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose}
      title={data?.id ? 'Editar mensagem' : 'Nova mensagem inicial'} size="lg"
      footer={(
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="button" onClick={submit} disabled={!podeSalvar || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {data?.id ? 'Salvar alterações' : 'Publicar mensagem'}
          </button>
        </div>
      )}>
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Título <span className="text-rose-500">*</span>
          </label>
          <input type="text" value={form.titulo || ''} onChange={set('titulo')} autoFocus
            placeholder="Ex: Nova funcionalidade — DRE projetada"
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Conteúdo <span className="text-rose-500">*</span>
          </label>
          <textarea value={form.conteudo || ''} onChange={set('conteudo')} rows={6}
            placeholder="Descreva a novidade. Quebras de linha são preservadas."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <p className="text-[10.5px] text-gray-400 mt-1">
            Texto simples. Quebras de linha aparecem no modal do cliente.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Categoria</label>
            <select value={form.categoria || 'novidade'} onChange={set('categoria')}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {mensagensService.CATEGORIAS.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Público-alvo</label>
            <select value={form.publico_alvo || 'ambos'} onChange={set('publico_alvo')}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {mensagensService.PUBLICOS.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Expira em <span className="text-gray-400 normal-case font-normal tracking-normal">(opcional)</span>
            </label>
            <input type="datetime-local" value={form.expira_em || ''} onChange={set('expira_em')}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            <p className="text-[10.5px] text-gray-400 mt-1">
              Após esta data a mensagem para de aparecer no modal do cliente.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 h-10 cursor-pointer">
            <input type="checkbox" checked={form.ativa !== false}
              onChange={(e) => setForm(f => ({ ...f, ativa: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-[13px] text-gray-700">Ativa (visível ao cliente)</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

// Converte ISO em formato aceito pelo <input type="datetime-local"> (sem timezone)
function toLocalDatetimeInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
