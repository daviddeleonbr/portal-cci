// Admin: cadastro de Relatórios de BI (Power BI) por rede.
// Suporta redes Webposto (chave_api_id) e Autosystem (as_rede_id).
// O acesso de cada relatório é controlado por USUÁRIOS específicos da
// rede (cci_usuarios_sistema, tipo=cliente). Se nenhum usuário for
// vinculado, o relatório fica visível a TODOS os usuários da rede.

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Search, BarChart3, ExternalLink, EyeOff,
  Users, ChevronDown, Globe, Building2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import * as relatoriosBiService from '../services/relatoriosBiService';
import * as mapeamentoService from '../services/mapeamentoService';
import * as autosystemService from '../services/autosystemService';

export default function CciRelatoriosBi() {
  const [lista, setLista] = useState([]);
  const [acessosPorRel, setAcessosPorRel] = useState(new Map());
  const [redesWp, setRedesWp] = useState([]);
  const [redesAs, setRedesAs] = useState([]);
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
      const [rsWp, rsAs, ls] = await Promise.all([
        mapeamentoService.listarChavesApi().catch(() => []),
        autosystemService.listarRedes().catch(() => []),
        relatoriosBiService.listarTodos(),
      ]);
      setRedesWp((rsWp || []).filter(r => r.ativo !== false));
      setRedesAs((rsAs || []).filter(r => r.ativo !== false));
      setLista(ls || []);
      // Contagem de usuários permitidos por relatório (em batch)
      const acessos = await relatoriosBiService
        .contarAcessosPorRelatorio((ls || []).map(r => r.id))
        .catch(() => new Map());
      setAcessosPorRel(acessos);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Map de id → { nome, tipo } pra render
  const mapaRedes = useMemo(() => {
    const m = new Map();
    for (const r of redesWp) m.set(`wp:${r.id}`, { nome: r.nome, tipo: 'webposto' });
    for (const r of redesAs) m.set(`as:${r.id}`, { nome: r.nome, tipo: 'autosystem' });
    return m;
  }, [redesWp, redesAs]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(r => {
      if (filtroRede !== 'todas') {
        const [tipo, id] = filtroRede.split(':');
        if (tipo === 'wp' && r.chave_api_id !== id) return false;
        if (tipo === 'as' && r.as_rede_id !== id)   return false;
      }
      if (q) {
        const redeNome = r.chaves_api?.nome || r.as_rede?.nome || '';
        const blob = `${r.nome} ${r.descricao || ''} ${redeNome}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [lista, busca, filtroRede]);

  const salvar = async (form) => {
    try {
      let id = form.id;
      if (id) {
        await relatoriosBiService.atualizar(id, form);
      } else {
        const novo = await relatoriosBiService.criar(form);
        id = novo.id;
      }
      // Persiste acesso por usuário
      await relatoriosBiService.definirUsuariosDoRelatorio(id, form.usuario_ids || []);
      showToast('success', form.id ? 'Relatório atualizado' : 'Relatório criado');
      setModal({ open: false, data: null });
      carregar();
    } catch (e) { showToast('error', e.message); }
  };

  const excluir = async (id) => {
    try {
      await relatoriosBiService.excluir(id);
      showToast('success', 'Relatório excluído');
      setConfirm({ open: false, item: null });
      carregar();
    } catch (e) { showToast('error', e.message); }
  };

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader
        title="Relatórios de BI"
        description="Cadastre os painéis de Power BI disponíveis para os clientes no portal."
      >
        <button
          onClick={() => setModal({ open: true, data: null })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-[13px] font-semibold transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo relatório
        </button>
      </PageHeader>

      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, descrição ou rede..."
            className="w-full h-9 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select
          value={filtroRede}
          onChange={(e) => setFiltroRede(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="todas">Todas as redes</option>
          {redesWp.length > 0 && <optgroup label="Webposto">
            {redesWp.map(r => <option key={`wp:${r.id}`} value={`wp:${r.id}`}>{r.nome}</option>)}
          </optgroup>}
          {redesAs.length > 0 && <optgroup label="Autosystem">
            {redesAs.map(r => <option key={`as:${r.id}`} value={`as:${r.id}`}>{r.nome}</option>)}
          </optgroup>}
        </select>
        <span className="ml-auto text-[11px] text-gray-400">
          {filtrados.length} relatório{filtrados.length === 1 ? '' : 's'}
        </span>
      </div>

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
            <p className="text-[12.5px] text-gray-500 mt-1">Clique em "Novo relatório" para começar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Nome</th>
                  <th className="px-4 py-2.5">Rede</th>
                  <th className="px-4 py-2.5">Link</th>
                  <th className="px-4 py-2.5 text-center">Acessos</th>
                  <th className="px-4 py-2.5 text-right">Ordem</th>
                  <th className="px-4 py-2.5 text-center">Ativo</th>
                  <th className="px-4 py-2.5 text-right w-20">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map(r => {
                  const tipo = r.chave_api_id ? 'webposto' : 'autosystem';
                  const redeNome = r.chaves_api?.nome || r.as_rede?.nome || '—';
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2.5">
                        <p className="text-[13px] font-semibold text-gray-900 truncate max-w-[260px]">{r.nome}</p>
                        {r.descricao && (
                          <p className="text-[11.5px] text-gray-500 truncate max-w-[260px]">{r.descricao}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${tipo === 'webposto' ? 'bg-blue-500' : 'bg-blue-500'}`} />
                          <p className="text-[12.5px] text-gray-800 truncate max-w-[180px]">{redeNome}</p>
                        </div>
                        <p className="text-[10px] uppercase text-gray-400 tracking-wider mt-0.5">{tipo === 'webposto' ? 'Webposto' : 'Autosystem'}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <a href={r.link_publico} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-800 max-w-[200px]"
                          title={r.link_publico}>
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{abreviarUrl(r.link_publico)}</span>
                        </a>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {(() => {
                          const n = acessosPorRel.get(r.id) || 0;
                          if (n === 0) {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10.5px] font-semibold px-2 py-0.5"
                                title="Nenhum usuário associado — visível a todos os usuários da rede">
                                <Globe className="h-3 w-3" /> Todos
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10.5px] font-semibold px-2 py-0.5"
                              title={`${n} usuário(s) com acesso permitido`}>
                              <Users className="h-3 w-3" /> {n}
                            </span>
                          );
                        })()}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalRelatorio
        open={modal.open}
        data={modal.data}
        redesWp={redesWp}
        redesAs={redesAs}
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

function ModalRelatorio({ open, data, redesWp, redesAs, onClose, onSave }) {
  const [form, setForm] = useState(novoForm());
  const [usuariosDaRede, setUsuariosDaRede] = useState([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [passo, setPasso] = useState(1);

  // Reseta o form quando abre/troca
  useEffect(() => {
    if (!open) return;
    setPasso(1);
    if (data) {
      const tipoRede = data.chave_api_id ? 'webposto' : 'autosystem';
      setForm({
        id: data.id,
        tipoRede,
        rede_id: data.chave_api_id || data.as_rede_id || '',
        nome: data.nome || '',
        descricao: data.descricao || '',
        link_publico: data.link_publico || '',
        ordem: data.ordem ?? 0,
        ativo: data.ativo !== false,
        usuario_ids: [],
      });
      // Carrega usuários atualmente vinculados
      relatoriosBiService.listarUsuariosDoRelatorio(data.id)
        .then(ids => setForm(f => ({ ...f, usuario_ids: ids })))
        .catch(() => {});
    } else {
      setForm(novoForm());
    }
  }, [open, data]);

  // Carrega usuários da rede selecionada
  useEffect(() => {
    if (!open || !form.rede_id) {
      setUsuariosDaRede([]);
      return;
    }
    let cancelado = false;
    setLoadingUsuarios(true);
    const filtros = form.tipoRede === 'webposto'
      ? { chave_api_id: form.rede_id }
      : { as_rede_id: form.rede_id };
    relatoriosBiService.listarUsuariosDaRede(filtros)
      .then(us => { if (!cancelado) setUsuariosDaRede(us); })
      .catch(() => { if (!cancelado) setUsuariosDaRede([]); })
      .finally(() => { if (!cancelado) setLoadingUsuarios(false); });
    return () => { cancelado = true; };
  }, [open, form.tipoRede, form.rede_id]);

  const redesDoTipo = form.tipoRede === 'webposto' ? redesWp : redesAs;

  const podeAvancar = form.tipoRede && form.rede_id
    && form.nome.trim() && form.link_publico.trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (passo === 1) {
      if (podeAvancar) setPasso(2);
      return;
    }
    const payload = {
      id: form.id,
      chave_api_id: form.tipoRede === 'webposto'   ? form.rede_id : null,
      as_rede_id:   form.tipoRede === 'autosystem' ? form.rede_id : null,
      nome: form.nome,
      descricao: form.descricao,
      link_publico: form.link_publico,
      ordem: Number(form.ordem) || 0,
      ativo: form.ativo,
      usuario_ids: form.usuario_ids || [],
    };
    onSave(payload);
  };

  const toggleUsuario = (id) => setForm(f => {
    const set = new Set(f.usuario_ids || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    return { ...f, usuario_ids: Array.from(set) };
  });

  return (
    <Modal open={open} onClose={onClose} title={data ? 'Editar relatório de BI' : 'Novo relatório de BI'} size="lg">
      {/* Indicador de progresso */}
      <div className="flex items-center gap-2 mb-4">
        <StepDot ativo={passo === 1} concluido={passo > 1} numero={1} label="Identificação" />
        <div className={`flex-1 h-0.5 rounded ${passo > 1 ? 'bg-blue-500' : 'bg-gray-200'}`} />
        <StepDot ativo={passo === 2} concluido={false} numero={2} label="Acesso" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {passo === 1 && (
          <>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Tipo de rede *</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: 'webposto',   label: 'Webposto',   cor: 'blue' },
                  { v: 'autosystem', label: 'Autosystem', cor: 'violet' },
                ].map(opt => {
                  const sel = form.tipoRede === opt.v;
                  return (
                    <button type="button" key={opt.v}
                      onClick={() => setForm(f => ({ ...f, tipoRede: opt.v, rede_id: '', usuario_ids: [] }))}
                      className={`h-10 inline-flex items-center justify-center gap-2 rounded-lg border text-[13px] font-medium transition-all ${
                        sel
                          ? opt.cor === 'blue'
                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100'
                            : 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}>
                      <Building2 className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Rede *</label>
              <select required
                value={form.rede_id}
                onChange={(e) => setForm(f => ({ ...f, rede_id: e.target.value, usuario_ids: [] }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Selecione a rede...</option>
                {redesDoTipo.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
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
              <input type="text"
                value={form.descricao}
                onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Breve descrição do que o relatório mostra"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
              <p className="text-[10.5px] text-gray-400 mt-1">URL "Publish to web" do Power BI Service. O cliente não verá essa URL.</p>
            </div>
          </>
        )}

        {passo === 2 && (
          <>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                <span className="inline-flex items-center gap-1.5"><Users className="h-3 w-3" /> Acesso de usuários</span>
              </label>
              <UsuarioMultiCheck
                usuarios={usuariosDaRede}
                selecionados={new Set(form.usuario_ids || [])}
                loading={loadingUsuarios}
                disabled={!form.rede_id}
                onToggle={toggleUsuario}
              />
              <p className="text-[10.5px] text-gray-400 mt-1.5 inline-flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Sem marcar nenhum: relatório fica visível a todos os usuários da rede.
              </p>
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
                  <span className="text-[13px] text-gray-700">Ativo (visível ao cliente)</span>
                </label>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          {passo === 1 ? (
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              Cancelar
            </button>
          ) : (
            <button type="button" onClick={() => setPasso(1)}
              className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              ← Voltar
            </button>
          )}
          {passo === 1 ? (
            <button type="submit" disabled={!podeAvancar}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              Próximo →
            </button>
          ) : (
            <button type="submit"
              className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm">
              {data ? 'Salvar alterações' : 'Criar relatório'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function StepDot({ ativo, concluido, numero, label }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-7 w-7 inline-flex items-center justify-center rounded-full text-[11px] font-bold transition-all ${
        concluido ? 'bg-blue-500 text-white'
        : ativo ? 'bg-blue-600 text-white ring-4 ring-blue-100'
        : 'bg-gray-100 text-gray-400'
      }`}>
        {concluido ? '✓' : numero}
      </div>
      <span className={`text-[12px] font-semibold ${
        ativo || concluido ? 'text-gray-800' : 'text-gray-400'
      }`}>{label}</span>
    </div>
  );
}

function UsuarioMultiCheck({ usuarios, selecionados, loading, disabled, onToggle }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const totalSel = selecionados.size;
  const label = disabled
    ? 'Selecione a rede primeiro'
    : loading
    ? 'Carregando usuários...'
    : usuarios.length === 0
    ? 'Nenhum usuário nessa rede'
    : totalSel === 0
    ? `Todos os usuários (${usuarios.length})`
    : totalSel === 1
    ? (usuarios.find(u => selecionados.has(u.id))?.nome || '1 usuário')
    : `${totalSel} usuários selecionados`;

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled || loading || usuarios.length === 0}
        onClick={() => setAberto(o => !o)}
        className={`w-full h-10 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-[13px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          aberto ? 'border-blue-400 ring-2 ring-blue-100 text-gray-800 bg-white' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
        }`}>
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-gray-200/70 shadow-xl z-50 overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              {usuarios.map(u => {
                const marcada = selecionados.has(u.id);
                return (
                  <label key={u.id}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={marcada}
                      onChange={() => onToggle(u.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-gray-800 truncate">{u.nome}</p>
                      {u.email && <p className="text-[10.5px] text-gray-400 truncate">{u.email}</p>}
                    </div>
                    {u.ativo === false && (
                      <span className="text-[9.5px] uppercase font-semibold text-gray-400 ring-1 ring-gray-200 px-1 rounded">inativo</span>
                    )}
                  </label>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function novoForm() {
  return {
    id: null,
    tipoRede: 'webposto',
    rede_id: '',
    nome: '', descricao: '', link_publico: '',
    ordem: 0, ativo: true,
    usuario_ids: [],
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
