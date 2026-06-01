// Admin: painel de Melhorias do Sistema enviadas pelos clientes.
// Lista todas as solicitações, filtra por tipo/status/rede/busca,
// mostra autor + rede/empresa, e abre modal de detalhe com timeline
// + ação de mudar status (com comentário/justificativa).

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, Lightbulb, Bug, Search, MessageSquare, Send, Clock,
  Network, Mail, Building2, ChevronRight,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import { useAdminSession } from '../hooks/useAuth';
import * as melhoriasService from '../services/melhoriasService';

const STATUS_COR = {
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  blue:    'bg-blue-50 text-blue-700 border-blue-200',
  rose:    'bg-rose-50 text-rose-700 border-rose-200',
  indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function CciMelhorias() {
  const session = useAdminSession();
  const usuarioAdmin = session?.usuario;

  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroRede, setFiltroRede] = useState('todas');
  const [detalhe, setDetalhe] = useState(null);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const data = await melhoriasService.listarTodas();
      setLista(data);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Redes que aparecem nas solicitações (pra montar dropdown)
  const redesFiltro = useMemo(() => {
    const map = new Map();
    for (const m of lista) {
      if (m.chaves_api?.id) map.set(`wp:${m.chaves_api.id}`, { key: `wp:${m.chaves_api.id}`, label: `${m.chaves_api.nome} (Webposto)` });
      if (m.as_rede?.id)    map.set(`as:${m.as_rede.id}`,    { key: `as:${m.as_rede.id}`,    label: `${m.as_rede.nome} (Autosystem)` });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [lista]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(m => {
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
      if (filtroStatus !== 'todos' && m.status !== filtroStatus) return false;
      if (filtroRede !== 'todas') {
        const [tipo, id] = filtroRede.split(':');
        if (tipo === 'wp' && m.chave_api_id !== id) return false;
        if (tipo === 'as' && m.as_rede_id !== id)   return false;
      }
      if (!q) return true;
      return m.titulo.toLowerCase().includes(q)
        || (m.descricao || '').toLowerCase().includes(q)
        || (m.usuario?.nome || '').toLowerCase().includes(q)
        || (m.usuario?.email || '').toLowerCase().includes(q);
    });
  }, [lista, busca, filtroTipo, filtroStatus, filtroRede]);

  const stats = useMemo(() => {
    const r = { total: lista.length };
    for (const s of melhoriasService.STATUS) r[s.key] = lista.filter(m => m.status === s.key).length;
    return r;
  }, [lista]);

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Melhorias do Sistema"
        description="Sugestões e relatos de falha enviados pelos clientes. Mude o status com uma resposta para o cliente." />

      {/* KPIs por status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <CardStat label="Total" valor={stats.total} cor="gray" />
        {melhoriasService.STATUS.map(s => (
          <CardStat key={s.key} label={s.label} valor={stats[s.key]} cor={s.cor} />
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, descrição, autor..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="todos">Todos os tipos</option>
          {melhoriasService.TIPOS.map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="todos">Todos os status</option>
          {melhoriasService.STATUS.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select value={filtroRede} onChange={(e) => setFiltroRede(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-w-[180px]">
          <option value="todas">Todas as redes</option>
          {redesFiltro.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
          <Lightbulb className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            {lista.length === 0 ? 'Nenhuma solicitação dos clientes ainda.' : 'Nenhuma solicitação corresponde aos filtros.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 w-12">Tipo</th>
                  <th className="px-4 py-3">Solicitação</th>
                  <th className="px-4 py-3 w-56">Autor / Rede / Empresa</th>
                  <th className="px-4 py-3 w-36 text-center">Status</th>
                  <th className="px-4 py-3 w-36">Enviada em</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map(m => {
                  const meta = melhoriasService.metaStatus(m.status);
                  const IconeTipo = m.tipo === 'falha' ? Bug : Lightbulb;
                  const redeNome = m.chaves_api?.nome || m.as_rede?.nome || '—';
                  const redeTipo = m.chaves_api?.id ? 'Webposto' : m.as_rede?.id ? 'Autosystem' : '';
                  return (
                    <tr key={m.id} onClick={() => setDetalhe(m)}
                      className="hover:bg-blue-50/30 cursor-pointer">
                      <td className="px-4 py-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          m.tipo === 'falha' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          <IconeTipo className="h-3.5 w-3.5" />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-semibold text-gray-900 truncate max-w-[420px]">{m.titulo}</p>
                        <p className="text-[11.5px] text-gray-500 line-clamp-1 max-w-[420px] mt-0.5">{m.descricao}</p>
                      </td>
                      <td className="px-4 py-3 text-[11.5px] text-gray-600">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Mail className="h-3 w-3 text-gray-400 flex-shrink-0" />
                          <p className="truncate font-medium text-gray-800">{m.usuario?.nome || 'Usuário removido'}</p>
                        </div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Network className="h-3 w-3 text-gray-400 flex-shrink-0" />
                          <p className="truncate">
                            {redeNome}
                            {redeTipo && <span className="text-[10px] text-gray-400 ml-1">· {redeTipo}</span>}
                          </p>
                        </div>
                        {m.empresa?.nome && (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3 w-3 text-gray-400 flex-shrink-0" />
                            <p className="truncate">{m.empresa.nome}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 border font-semibold ${STATUS_COR[meta.cor]}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11.5px] text-gray-600 inline-flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 text-gray-400" />
                        {new Date(m.created_at).toLocaleDateString('pt-BR')}
                        <span className="text-gray-400">{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModalDetalheAdmin melhoria={detalhe} usuarioAdmin={usuarioAdmin}
        onClose={() => setDetalhe(null)} onMudou={() => { carregar(); setDetalhe(null); }}
        showToast={showToast} />
    </div>
  );
}

function CardStat({ label, valor, cor }) {
  const cores = {
    gray:    'bg-gray-50 text-gray-700 border-gray-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
    rose:    'bg-rose-50 text-rose-700 border-rose-200',
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cores[cor]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-lg font-bold mt-0.5">{valor}</p>
    </div>
  );
}

function ModalDetalheAdmin({ melhoria, usuarioAdmin, onClose, onMudou, showToast }) {
  const [comentarios, setComentarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [novoStatus, setNovoStatus] = useState('');
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!melhoria) return;
    setNovoStatus(melhoria.status);
    setComentario('');
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        const data = await melhoriasService.listarComentarios(melhoria.id);
        if (!cancel) setComentarios(data);
      } catch { /* noop */ }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [melhoria]);

  if (!melhoria) return null;
  const metaAtual = melhoriasService.metaStatus(melhoria.status);
  const IconeTipo = melhoria.tipo === 'falha' ? Bug : Lightbulb;
  const houveMudancaStatus = novoStatus && novoStatus !== melhoria.status;

  const aplicar = async () => {
    if (!houveMudancaStatus && !comentario.trim()) return;
    setSalvando(true);
    try {
      if (houveMudancaStatus) {
        await melhoriasService.atualizarStatus({
          melhoriaId: melhoria.id,
          novoStatus,
          statusAnterior: melhoria.status,
          autor: usuarioAdmin,
          comentario,
        });
        showToast('success', 'Status atualizado e cliente notificado.');
      } else {
        await melhoriasService.adicionarComentario({
          melhoriaId: melhoria.id, autor: usuarioAdmin, autorTipo: 'admin', texto: comentario,
        });
        showToast('success', 'Comentário adicionado.');
      }
      onMudou();
    } catch (err) { showToast('error', err.message); }
    finally { setSalvando(false); }
  };

  const redeNome = melhoria.chaves_api?.nome || melhoria.as_rede?.nome || '—';
  const redeTipo = melhoria.chaves_api?.id ? 'Webposto' : melhoria.as_rede?.id ? 'Autosystem' : '';

  return (
    <Modal open={!!melhoria} onClose={onClose} title="Detalhes da solicitação" size="xl">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        {/* Coluna principal */}
        <div className="space-y-5">
          {/* Cabeçalho */}
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${
              melhoria.tipo === 'falha' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
            }`}>
              <IconeTipo className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900 mb-1">{melhoria.titulo}</h2>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 border font-semibold ${STATUS_COR[metaAtual.cor]}`}>
                  {metaAtual.label}
                </span>
                <span className="text-[11px] text-gray-500">
                  {melhoriasService.metaTipo(melhoria.tipo).label}
                </span>
              </div>
            </div>
          </div>

          {/* Descrição */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Descrição</p>
            <p className="text-[13px] text-gray-800 whitespace-pre-line leading-relaxed">{melhoria.descricao}</p>
          </div>

          {/* Timeline */}
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 mb-2.5 inline-flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" /> Histórico ({comentarios.length})
            </p>
            {loading ? (
              <div className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin text-gray-400 mx-auto" /></div>
            ) : comentarios.length === 0 ? (
              <p className="text-[12px] text-gray-400 italic py-3">Sem comentários. Use o painel ao lado pra responder ao cliente.</p>
            ) : (
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                {comentarios.map(c => <ItemComentarioAdmin key={c.id} c={c} />)}
              </div>
            )}
          </div>
        </div>

        {/* Coluna lateral: contexto + ação */}
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-3.5 space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Contexto</p>
            <Info label="Autor" valor={melhoria.usuario?.nome || 'Usuário removido'} sub={melhoria.usuario?.email} icone={Mail} />
            <Info label="Rede" valor={redeNome} sub={redeTipo} icone={Network} />
            {melhoria.empresa?.nome && (
              <Info label="Empresa" valor={melhoria.empresa.nome} sub={melhoria.empresa.cnpj} icone={Building2} />
            )}
            <Info label="Enviada em" valor={new Date(melhoria.created_at).toLocaleString('pt-BR')} icone={Clock} />
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-3.5 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Ação</p>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1">Mudar status para</label>
              <select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value)}
                className="w-full h-9 rounded-lg border border-gray-200 px-2 text-xs font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                {melhoriasService.STATUS.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
                Comentário {houveMudancaStatus ? <span className="text-gray-400 normal-case font-normal tracking-normal">(opcional)</span> : <span className="text-rose-500">*</span>}
              </label>
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={4}
                placeholder={houveMudancaStatus
                  ? 'Justifique a mudança para o cliente. Opcional.'
                  : 'Adicione um comentário ou peça mais informações ao cliente.'}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <button onClick={aplicar}
              disabled={salvando || (!houveMudancaStatus && !comentario.trim())}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-3.5 w-3.5" />
              {houveMudancaStatus ? 'Atualizar status' : 'Adicionar comentário'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Info({ label, valor, sub, icone: Icone }) {
  return (
    <div className="flex items-start gap-2">
      {Icone && <Icone className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-[12.5px] text-gray-800 truncate">{valor}</p>
        {sub && <p className="text-[10.5px] text-gray-500 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function ItemComentarioAdmin({ c }) {
  const ehAdmin = c.autor_tipo === 'admin';
  const ehMudancaStatus = c.status_anterior || c.status_novo;
  const metaNovo = c.status_novo ? melhoriasService.metaStatus(c.status_novo) : null;
  return (
    <div className={`rounded-lg border px-3 py-2 ${ehAdmin ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[11.5px] font-semibold text-gray-800">
          {ehAdmin ? '🛠️ ' : '👤 '}{c.autor_nome || (ehAdmin ? 'Admin' : 'Cliente')}
        </p>
        <p className="text-[10.5px] text-gray-400">{new Date(c.created_at).toLocaleString('pt-BR')}</p>
      </div>
      {ehMudancaStatus && metaNovo && (
        <p className="text-[10.5px] mb-1">
          Status →{' '}
          <span className={`inline-flex items-center text-[10px] uppercase tracking-wider rounded-full px-1.5 py-0.5 border font-semibold ${STATUS_COR[metaNovo.cor]}`}>
            {metaNovo.label}
          </span>
        </p>
      )}
      {c.texto && (
        <p className="text-[12.5px] text-gray-700 whitespace-pre-line">{c.texto}</p>
      )}
    </div>
  );
}
