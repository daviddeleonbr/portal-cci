// Admin: cadastro de Relatorios de BI (Power BI) por rede / cliente.
// O cliente do portal so ve nome + descricao + botao "Visualizar dados";
// o link publico fica restrito ao admin (e ao iframe que carrega).

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Search, BarChart3, ExternalLink, EyeOff,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import * as relatoriosBiService from '../services/relatoriosBiService';
import * as mapeamentoService from '../services/mapeamentoService';
import * as clientesService from '../services/clientesService';

export default function CciRelatoriosBi() {
  const [lista, setLista] = useState([]);
  const [redes, setRedes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroRede, setFiltroRede] = useState('todas');
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
      const [rs, cs, ls] = await Promise.all([
        mapeamentoService.listarChavesApi(),
        clientesService.listarClientes(),
        relatoriosBiService.listarTodos(),
      ]);
      setRedes((rs || []).filter(r => r.ativo !== false));
      setClientes(cs || []);
      setLista(ls || []);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(r => {
      if (filtroRede !== 'todas' && r.chave_api_id !== filtroRede) return false;
      if (q) {
        const blob = `${r.nome} ${r.descricao || ''} ${r.chaves_api?.nome || ''} ${r.clientes?.nome || ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [lista, busca, filtroRede]);

  const salvar = async (form) => {
    try {
      if (form.id) {
        await relatoriosBiService.atualizar(form.id, form);
        showToast('success', 'Relatório atualizado');
      } else {
        await relatoriosBiService.criar(form);
        showToast('success', 'Relatório criado');
      }
      setModal({ open: false, data: null });
      carregar();
    } catch (e) { showToast('error', e.message); }
  };

  const excluir = async (id) => {
    try {
      await relatoriosBiService.excluir(id);
      showToast('success', 'Relatório excluido');
      setConfirm({ open: false, item: null });
      carregar();
    } catch (e) { showToast('error', e.message); }
  };

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader
        title="Relatórios de BI"
        description="Cadastre os paineis de Power BI disponíveis para os clientes no portal."
      >
        <button
          onClick={() => setModal({ open: true, data: null })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-[13px] font-semibold transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo relatório
        </button>
      </PageHeader>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, descrição, rede ou cliente..."
            className="w-full h-9 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select
          value={filtroRede}
          onChange={(e) => setFiltroRede(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="todas">Todas as redes ({redes.length})</option>
          {redes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
        <span className="ml-auto text-[11px] text-gray-400">
          {filtrados.length} relatório{filtrados.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 py-12 justify-center text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <BarChart3 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700">Nenhum relatório cadastrado</p>
            <p className="text-[12.5px] text-gray-500 mt-1">Clique em "Novo relatório" para comecar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Nome</th>
                  <th className="px-4 py-2.5">Rede / Cliente</th>
                  <th className="px-4 py-2.5">Link</th>
                  <th className="px-4 py-2.5 text-right">Ordem</th>
                  <th className="px-4 py-2.5 text-center">Ativo</th>
                  <th className="px-4 py-2.5 text-right w-20">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5">
                      <p className="text-[13px] font-semibold text-gray-900 truncate max-w-[260px]">{r.nome}</p>
                      {r.descricao && (
                        <p className="text-[11.5px] text-gray-500 truncate max-w-[260px]">{r.descricao}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-[12.5px] text-gray-800 truncate max-w-[180px]">{r.chaves_api?.nome || '—'}</p>
                      <p className="text-[11px] text-gray-500 truncate max-w-[180px]">
                        {r.clientes?.nome || <span className="italic text-gray-400">Toda a rede</span>}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <a href={r.link_publico} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-800 max-w-[200px]"
                        title={r.link_publico}>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{abreviarUrl(r.link_publico)}</span>
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">{r.ordem}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.ativo ? (
                        <span className="inline-block rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase px-2 py-0.5">Sim</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold uppercase px-2 py-0.5">
                          <EyeOff className="h-3 w-3" /> Não
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => setModal({ open: true, data: r })}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setConfirm({ open: true, item: r })}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalRelatorio
        open={modal.open}
        data={modal.data}
        redes={redes}
        clientes={clientes}
        onClose={() => setModal({ open: false, data: null })}
        onSave={salvar}
      />

      <Modal open={confirm.open} onClose={() => setConfirm({ open: false, item: null })} title="Excluir relatório">
        <p className="text-sm text-gray-700 mb-4">
          Tem certeza que quer excluir o relatório <strong>{confirm.item?.nome}</strong>? Essa ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setConfirm({ open: false, item: null })}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={() => excluir(confirm.item.id)}
            className="px-4 py-2 text-[13px] font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
            Excluir
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ModalRelatorio({ open, data, redes, clientes, onClose, onSave }) {
  const [form, setForm] = useState(novoForm());

  useEffect(() => {
    if (open) {
      setForm(data ? {
        id: data.id,
        chave_api_id: data.chave_api_id || '',
        cliente_id: data.cliente_id || '',
        nome: data.nome || '',
        descricao: data.descricao || '',
        link_publico: data.link_publico || '',
        ordem: data.ordem ?? 0,
        ativo: data.ativo !== false,
      } : novoForm());
    }
  }, [open, data]);

  // Filtra clientes da rede selecionada
  const clientesDaRede = useMemo(() => {
    if (!form.chave_api_id) return [];
    return clientes.filter(c => c.chave_api_id === form.chave_api_id && c.status === 'ativo');
  }, [form.chave_api_id, clientes]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      cliente_id: form.cliente_id || null,
      ordem: Number(form.ordem) || 0,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={data ? 'Editar relatório de BI' : 'Novo relatório de BI'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Rede *</label>
            <select required
              value={form.chave_api_id}
              onChange={(e) => setForm(f => ({ ...f, chave_api_id: e.target.value, cliente_id: '' }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Selecione...</option>
              {redes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Empresa (opcional)</label>
            <select
              value={form.cliente_id}
              onChange={(e) => setForm(f => ({ ...f, cliente_id: e.target.value }))}
              disabled={!form.chave_api_id}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">Toda a rede</option>
              {clientesDaRede.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <p className="text-[10.5px] text-gray-400 mt-1">Vazio = visivel para todas as empresas da rede.</p>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Nome do relatório *</label>
          <input type="text" required
            value={form.nome}
            onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Vendas por loja"
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Descrição</label>
          <textarea rows={2}
            value={form.descricao}
            onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Breve descrição do que o relatório mostra"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Link público do Power BI *</label>
          <input type="url" required
            value={form.link_publico}
            onChange={(e) => setForm(f => ({ ...f, link_publico: e.target.value }))}
            placeholder="https://app.powerbi.com/view?r=..."
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono"
          />
          <p className="text-[10.5px] text-gray-400 mt-1">Use a URL "Publish to web" do Power BI Service. O cliente não vera essa URL.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Ordem</label>
            <input type="number"
              value={form.ordem}
              onChange={(e) => setForm(f => ({ ...f, ordem: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 cursor-pointer h-10">
              <input type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm(f => ({ ...f, ativo: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[13px] text-gray-700">Ativo (visivel ao cliente)</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit"
            className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm">
            {data ? 'Salvar alteracoes' : 'Criar relatório'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function novoForm() {
  return {
    id: null, chave_api_id: '', cliente_id: '',
    nome: '', descricao: '', link_publico: '',
    ordem: 0, ativo: true,
  };
}

function abreviarUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.length > 30 ? u.pathname.slice(0, 30) + '...' : u.pathname}`;
  } catch {
    return url.length > 50 ? url.slice(0, 50) + '...' : url;
  }
}
