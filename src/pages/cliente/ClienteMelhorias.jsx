// Cliente: envia sugestões de melhorias / relata falhas + acompanha
// status de cada solicitação que ENVIOU (não vê de outros usuários).

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Loader2, Lightbulb, Bug, Search, MessageSquare, Send,
  CheckCircle2, X, Clock,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import { useClienteSession } from '../../hooks/useAuth';
import * as melhoriasService from '../../services/melhoriasService';

const STATUS_COR = {
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  blue:    'bg-blue-50 text-blue-700 border-blue-200',
  rose:    'bg-rose-50 text-rose-700 border-rose-200',
  indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function ClienteMelhorias() {
  const session = useClienteSession();
  const usuario = session?.usuario;
  const cliente = session?.cliente;
  const chaveApi = session?.chaveApi;
  const asRede = session?.asRede;

  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [modalNovo, setModalNovo] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const carregar = useCallback(async () => {
    if (!usuario?.id) return;
    try {
      setLoading(true);
      const data = await melhoriasService.listarMinhas(usuario.id);
      setLista(data);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, [usuario?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarNova = async ({ tipo, titulo, descricao }) => {
    try {
      await melhoriasService.criar({
        usuario,
        tipo, titulo, descricao,
        contexto: {
          chave_api_id: chaveApi?.id || null,
          as_rede_id:   asRede?.id   || null,
          empresa_id:   cliente?.id  || null,
        },
      });
      showToast('success', 'Solicitação enviada. Acompanhe o status aqui.');
      setModalNovo(false);
      carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(m => {
      if (filtroStatus !== 'todos' && m.status !== filtroStatus) return false;
      if (!q) return true;
      return m.titulo.toLowerCase().includes(q) || (m.descricao || '').toLowerCase().includes(q);
    });
  }, [lista, busca, filtroStatus]);

  const stats = useMemo(() => {
    const r = { total: lista.length };
    for (const s of melhoriasService.STATUS) {
      r[s.key] = lista.filter(m => m.status === s.key).length;
    }
    return r;
  }, [lista]);

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Melhorias do Sistema"
        description="Envie sugestões de novas funcionalidades ou relate falhas. Acompanhe o status de cada solicitação aqui.">
        <button onClick={() => setModalNovo(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Nova solicitação
        </button>
      </PageHeader>

      {/* Stats por status */}
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
            placeholder="Buscar por título ou descrição..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="todos">Todos os status</option>
          {melhoriasService.STATUS.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
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
            {lista.length === 0
              ? 'Você ainda não enviou nenhuma solicitação.'
              : 'Nenhuma solicitação corresponde aos filtros.'}
          </p>
          {lista.length === 0 && (
            <button onClick={() => setModalNovo(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Enviar a primeira sugestão
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(m => {
            const meta = melhoriasService.metaStatus(m.status);
            const IconeTipo = m.tipo === 'falha' ? Bug : Lightbulb;
            return (
              <button key={m.id} onClick={() => setDetalhe(m)}
                className="w-full text-left bg-white rounded-xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-blue-200 transition-all p-4 flex items-start gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
                  m.tipo === 'falha' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  <IconeTipo className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{m.titulo}</p>
                    <span className={`inline-flex items-center text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 border font-semibold ${STATUS_COR[meta.cor]}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-gray-600 line-clamp-2">{m.descricao}</p>
                  <p className="text-[10.5px] text-gray-400 mt-1.5 inline-flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(m.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ModalNovaSolicitacao open={modalNovo} onClose={() => setModalNovo(false)} onSave={salvarNova} />

      <ModalDetalhe melhoria={detalhe} usuario={usuario} onClose={() => setDetalhe(null)}
        onComentou={() => carregar()} showToast={showToast} />
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

export function ModalNovaSolicitacao({ open, onClose, onSave }) {
  const [tipo, setTipo] = useState('melhoria');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setTipo('melhoria'); setTitulo(''); setDescricao(''); setSaving(false); }
  }, [open]);

  const pode = titulo.trim().length > 0 && descricao.trim().length >= 10;

  const submit = async () => {
    if (!pode) return;
    setSaving(true);
    try { await onSave({ tipo, titulo, descricao }); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nova solicitação" size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTipo('melhoria')}
              className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                tipo === 'melhoria'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              <Lightbulb className="h-4 w-4" />
              <div className="text-left">
                <p>Sugestão de melhoria</p>
                <p className="text-[11px] font-normal opacity-70">Nova ferramenta ou funcionalidade</p>
              </div>
            </button>
            <button type="button" onClick={() => setTipo('falha')}
              className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                tipo === 'falha'
                  ? 'border-rose-500 bg-rose-50 text-rose-700 ring-2 ring-rose-100'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              <Bug className="h-4 w-4" />
              <div className="text-left">
                <p>Relato de falha</p>
                <p className="text-[11px] font-normal opacity-70">Algo errado no sistema</p>
              </div>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Título <span className="text-rose-500">*</span>
          </label>
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus
            placeholder={tipo === 'falha' ? 'Ex: Erro ao exportar contas a pagar' : 'Ex: Filtro por grupo de produto no Vendas'}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Descrição <span className="text-rose-500">*</span>
            <span className="ml-2 text-[10px] text-gray-400 normal-case font-normal tracking-normal">
              ({descricao.length}/10 mín.)
            </span>
          </label>
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={6}
            placeholder={tipo === 'falha'
              ? 'Conte o que aconteceu, em qual tela e o que você esperava ver.'
              : 'Descreva a ideia, qual problema ela resolve e onde encaixaria no sistema.'}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="button" onClick={submit} disabled={!pode || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" /> Enviar solicitação
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ModalDetalhe({ melhoria, usuario, onClose, onComentou, showToast }) {
  const [comentarios, setComentarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [novoComentario, setNovoComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!melhoria) return;
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
  const meta = melhoriasService.metaStatus(melhoria.status);
  const IconeTipo = melhoria.tipo === 'falha' ? Bug : Lightbulb;

  const enviarComentario = async () => {
    if (!novoComentario.trim()) return;
    setEnviando(true);
    try {
      const c = await melhoriasService.adicionarComentario({
        melhoriaId: melhoria.id, autor: usuario, autorTipo: 'cliente', texto: novoComentario,
      });
      setComentarios(prev => [...prev, c]);
      setNovoComentario('');
      onComentou();
    } catch (err) { showToast('error', err.message); }
    finally { setEnviando(false); }
  };

  return (
    <Modal open={!!melhoria} onClose={onClose} title="Detalhes da solicitação" size="lg">
      <div className="space-y-5">
        {/* Cabeçalho */}
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${
            melhoria.tipo === 'falha' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
          }`}>
            <IconeTipo className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-base font-semibold text-gray-900">{melhoria.titulo}</h2>
              <span className={`inline-flex items-center text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 border font-semibold ${STATUS_COR[meta.cor]}`}>
                {meta.label}
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Enviada em {new Date(melhoria.created_at).toLocaleString('pt-BR')}
            </p>
          </div>
        </div>

        {/* Descrição original */}
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Descrição</p>
          <p className="text-[13px] text-gray-800 whitespace-pre-line leading-relaxed">{melhoria.descricao}</p>
        </div>

        {/* Timeline de comentários */}
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 mb-2.5 inline-flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3" /> Atualizações ({comentarios.length})
          </p>
          {loading ? (
            <div className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin text-gray-400 mx-auto" /></div>
          ) : comentarios.length === 0 ? (
            <p className="text-[12px] text-gray-400 italic py-3">Nenhuma atualização ainda. Aguarde a resposta da equipe.</p>
          ) : (
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {comentarios.map(c => (
                <ItemComentario key={c.id} c={c} />
              ))}
            </div>
          )}
        </div>

        {/* Novo comentário */}
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Adicionar comentário</p>
          <textarea value={novoComentario} onChange={(e) => setNovoComentario(e.target.value)} rows={3}
            placeholder="Algo a acrescentar, contexto novo, etc."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <div className="flex justify-end mt-2">
            <button onClick={enviarComentario} disabled={!novoComentario.trim() || enviando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Send className="h-3.5 w-3.5" /> Enviar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ItemComentario({ c }) {
  const ehAdmin = c.autor_tipo === 'admin';
  const ehMudancaStatus = c.status_anterior || c.status_novo;
  const metaNovo = c.status_novo ? melhoriasService.metaStatus(c.status_novo) : null;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${ehAdmin ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[11.5px] font-semibold text-gray-800">
          {ehAdmin ? '🛠️ Equipe CCI' : (c.autor_nome || 'Você')}
          {ehAdmin && c.autor_nome && <span className="font-normal text-gray-500"> · {c.autor_nome}</span>}
        </p>
        <p className="text-[10.5px] text-gray-400">{new Date(c.created_at).toLocaleString('pt-BR')}</p>
      </div>
      {ehMudancaStatus && metaNovo && (
        <p className="text-[10.5px] mb-1.5">
          <CheckCircle2 className="h-2.5 w-2.5 inline mr-0.5 text-emerald-500" />
          Status alterado para{' '}
          <span className={`inline-flex items-center text-[10px] uppercase tracking-wider rounded-full px-1.5 py-0.5 border font-semibold ${STATUS_COR[metaNovo.cor]}`}>
            {metaNovo.label}
          </span>
        </p>
      )}
      {c.texto && (
        <p className="text-[13px] text-gray-700 whitespace-pre-line">{c.texto}</p>
      )}
    </div>
  );
}
