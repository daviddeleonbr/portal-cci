// Admin: envia notificações in-app para usuários (admin ou cliente).
// Mostra o histórico de envios recentes agrupados por título + remetente
// + timestamp (mesma "campanha"), com contador de leitura.

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Send, Loader2, Search, Users, ChevronDown, BellRing, Network,
  Info, CircleCheck, AlertTriangle, CircleAlert,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import { useAdminSession } from '../hooks/useAuth';
import * as notificacoesService from '../services/notificacoesService';
import * as mapeamentoService from '../services/mapeamentoService';
import * as autosystemService from '../services/autosystemService';

const TIPOS = [
  { v: 'info',    label: 'Informativo', Icon: Info,         cor: 'blue' },
  { v: 'sucesso', label: 'Sucesso',     Icon: CircleCheck,  cor: 'emerald' },
  { v: 'aviso',   label: 'Aviso',       Icon: AlertTriangle,cor: 'amber' },
  { v: 'erro',    label: 'Erro',        Icon: CircleAlert,  cor: 'red' },
];

export default function CciNotificacoes() {
  const session = useAdminSession();
  const remetenteId = session?.usuario?.id;
  const [usuarios, setUsuarios] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);   // redes Webposto
  const [redesAs, setRedesAs] = useState([]);        // redes Autosystem
  const [enviadas, setEnviadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const [form, setForm] = useState({
    titulo: '', mensagem: '', tipo: 'info', link: '',
    destinatarios: new Set(),
    filtroTipoUsuario: 'todos',
    // 'todas' | 'sem_rede' | 'wp:<id>' | 'as:<id>'
    filtroRede: 'todas',
  });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [us, env, chs, ars] = await Promise.all([
        notificacoesService.listarUsuariosDestinatarios(),
        notificacoesService.listarEnviadasResumo({ limit: 200 }),
        mapeamentoService.listarChavesApi().catch(() => []),
        autosystemService.listarRedes().catch(() => []),
      ]);
      setUsuarios(us);
      setEnviadas(env);
      setChavesApi((chs || []).filter(c => c.ativo !== false));
      setRedesAs((ars || []).filter(r => r.ativo !== false));
    } catch (e) { showToast('error', e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Histórico agrupado por (remetente + titulo + segundo)
  const historico = useMemo(() => {
    const m = new Map();
    for (const n of enviadas) {
      const ts = String(n.created_at || '').slice(0, 19);
      const k = `${n.remetente_id || ''}|${n.titulo}|${n.tipo}|${ts}`;
      if (!m.has(k)) {
        m.set(k, {
          chave: k, titulo: n.titulo, tipo: n.tipo, mensagem: n.mensagem,
          link: n.link, created_at: n.created_at, destinatarios: 0, lidas: 0,
        });
      }
      const g = m.get(k);
      g.destinatarios++;
      if (n.lida_em) g.lidas++;
    }
    return Array.from(m.values()).sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at))
    );
  }, [enviadas]);

  const enviar = async (e) => {
    e.preventDefault();
    if (form.destinatarios.size === 0) {
      showToast('error', 'Selecione ao menos um destinatário.');
      return;
    }
    setEnviando(true);
    try {
      const qtd = await notificacoesService.enviar({
        usuario_ids: Array.from(form.destinatarios),
        titulo: form.titulo,
        mensagem: form.mensagem,
        tipo: form.tipo,
        link: form.link,
        remetente_id: remetenteId,
      });
      showToast('success', `Notificação enviada a ${qtd} destinatário${qtd === 1 ? '' : 's'}.`);
      setForm(f => ({ ...f, titulo: '', mensagem: '', link: '', destinatarios: new Set() }));
      carregar();
    } catch (e) { showToast('error', e.message); }
    finally { setEnviando(false); }
  };

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader
        title="Notificações"
        description="Envie avisos in-app para usuários do portal."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-5">
        {/* Coluna esquerda: form */}
        <form onSubmit={enviar} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Nova notificação</h3>

          {/* Tipo */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Tipo</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TIPOS.map(t => {
                const sel = form.tipo === t.v;
                const Icone = t.Icon;
                const palette = sel ? {
                  blue:    'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100',
                  emerald: 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100',
                  amber:   'border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-100',
                  red:     'border-red-500 bg-red-50 text-red-700 ring-2 ring-red-100',
                }[t.cor] : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300';
                return (
                  <button type="button" key={t.v}
                    onClick={() => setForm(f => ({ ...f, tipo: t.v }))}
                    className={`h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border text-[12.5px] font-medium transition-all ${palette}`}>
                    <Icone className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Título *</label>
            <input type="text" required maxLength={120}
              value={form.titulo}
              onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="Ex: Atualização dos relatórios de DRE"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Mensagem */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mensagem</label>
            <textarea rows={3}
              value={form.mensagem}
              onChange={(e) => setForm(f => ({ ...f, mensagem: e.target.value }))}
              placeholder="Mensagem opcional com detalhes da notificação."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
            />
          </div>

          {/* Link */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Link (opcional)</label>
            <input type="text"
              value={form.link}
              onChange={(e) => setForm(f => ({ ...f, link: e.target.value }))}
              placeholder="/admin/relatorios-bi  ou  /cliente/webposto/dre"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono"
            />
            <p className="text-[10.5px] text-gray-400 mt-1">Quando o usuário clicar na notificação, é redirecionado pra esse caminho.</p>
          </div>

          {/* Destinatários */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Destinatários *</span>
            </label>
            <DestinatariosPicker
              usuarios={usuarios}
              chavesApi={chavesApi}
              redesAs={redesAs}
              selecionados={form.destinatarios}
              filtroTipo={form.filtroTipoUsuario}
              onSetFiltroTipo={(v) => setForm(f => ({ ...f, filtroTipoUsuario: v }))}
              filtroRede={form.filtroRede}
              onSetFiltroRede={(v) => setForm(f => ({ ...f, filtroRede: v }))}
              onToggle={(id) => setForm(f => {
                const next = new Set(f.destinatarios);
                if (next.has(id)) next.delete(id); else next.add(id);
                return { ...f, destinatarios: next };
              })}
              onMarcarTodos={(visiveis) => setForm(f => ({ ...f, destinatarios: new Set(visiveis.map(u => u.id)) }))}
              onLimpar={() => setForm(f => ({ ...f, destinatarios: new Set() }))}
            />
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-gray-100">
            <button type="submit" disabled={enviando || form.destinatarios.size === 0 || !form.titulo.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar
            </button>
          </div>
        </form>

        {/* Coluna direita: histórico */}
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Enviadas recentemente</h3>
          {loading ? (
            <div className="py-10 flex items-center justify-center text-gray-400 gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Carregando...</span>
            </div>
          ) : historico.length === 0 ? (
            <div className="py-10 text-center">
              <BellRing className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-[12.5px] text-gray-500">Nenhuma notificação enviada ainda.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto -mx-5">
              {historico.map(h => {
                const t = TIPOS.find(x => x.v === h.tipo) || TIPOS[0];
                const Icone = t.Icon;
                const corBg = { blue: 'bg-blue-50', emerald: 'bg-emerald-50', amber: 'bg-amber-50', red: 'bg-red-50' }[t.cor];
                const corTx = { blue: 'text-blue-600', emerald: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600' }[t.cor];
                return (
                  <li key={h.chave} className="px-5 py-3">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg ${corBg} p-1.5 flex-shrink-0 mt-0.5`}>
                        <Icone className={`h-3.5 w-3.5 ${corTx}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold text-gray-900 truncate">{h.titulo}</p>
                        {h.mensagem && (
                          <p className="text-[11.5px] text-gray-600 mt-0.5 line-clamp-2">{h.mensagem}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-[10.5px] text-gray-400">
                          <span>{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                          <span>·</span>
                          <span>{h.destinatarios} destinatário{h.destinatarios === 1 ? '' : 's'}</span>
                          <span>·</span>
                          <span className={h.lidas === h.destinatarios ? 'text-emerald-600' : ''}>
                            {h.lidas}/{h.destinatarios} lida{h.lidas === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function DestinatariosPicker({
  usuarios, chavesApi = [], redesAs = [],
  selecionados,
  filtroTipo, onSetFiltroTipo,
  filtroRede = 'todas', onSetFiltroRede = () => {},
  onToggle, onMarcarTodos, onLimpar,
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Opções do dropdown de rede (apenas redes que têm pelo menos 1 usuário)
  const redesFiltro = useMemo(() => {
    const wpIds = new Set(usuarios.map(u => u.chave_api_id).filter(Boolean));
    const asIds = new Set(usuarios.map(u => u.as_rede_id).filter(Boolean));
    const out = [];
    for (const r of chavesApi) if (wpIds.has(r.id))
      out.push({ key: `wp:${r.id}`, label: `${r.nome} (Webposto)` });
    for (const r of redesAs)   if (asIds.has(r.id))
      out.push({ key: `as:${r.id}`, label: `${r.nome} (Autosystem)` });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [usuarios, chavesApi, redesAs]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return usuarios.filter(u => {
      if (filtroTipo !== 'todos' && u.tipo !== filtroTipo) return false;
      if (filtroRede !== 'todas') {
        if (filtroRede === 'sem_rede') {
          if (u.chave_api_id || u.as_rede_id) return false;
        } else {
          const [tipo, id] = filtroRede.split(':');
          if (tipo === 'wp' && u.chave_api_id !== id) return false;
          if (tipo === 'as' && u.as_rede_id   !== id) return false;
        }
      }
      if (q) {
        const blob = `${u.nome} ${u.email}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [usuarios, busca, filtroTipo, filtroRede]);

  const label = selecionados.size === 0
    ? 'Selecionar destinatários'
    : selecionados.size === 1
    ? (usuarios.find(u => selecionados.has(u.id))?.nome || '1 selecionado')
    : `${selecionados.size} destinatários`;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto(o => !o)}
        className={`w-full h-10 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-[13px] transition-colors ${
          aberto ? 'border-blue-400 ring-2 ring-blue-100 bg-white' : 'border-gray-200 bg-white hover:border-blue-300'
        }`}>
        <span className="truncate text-gray-700">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-gray-200/70 shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-100 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou e-mail..."
                  className="w-full h-9 rounded-lg border border-gray-200 pl-8 pr-3 text-[12.5px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="flex items-center gap-2">
                {['todos', 'admin', 'cliente'].map(t => (
                  <button type="button" key={t} onClick={() => onSetFiltroTipo(t)}
                    className={`px-2 py-1 text-[11px] font-medium rounded ${
                      filtroTipo === t ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                    }`}>
                    {t === 'todos' ? 'Todos' : t === 'admin' ? 'Admins' : 'Clientes'}
                  </button>
                ))}
                <span className="flex-1" />
                <button type="button" onClick={() => onMarcarTodos(visiveis)}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-medium">Marcar visíveis</button>
                <button type="button" onClick={onLimpar}
                  className="text-[11px] text-gray-500 hover:text-gray-700">Limpar</button>
              </div>
              <div className="relative">
                <Network className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <select value={filtroRede} onChange={(e) => onSetFiltroRede(e.target.value)}
                  className="w-full h-9 rounded-lg border border-gray-200 pl-8 pr-3 text-[12px] font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 appearance-none cursor-pointer">
                  <option value="todas">Todas as redes</option>
                  <option value="sem_rede">— Sem rede (Admin/avulso) —</option>
                  {redesFiltro.map(r => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {visiveis.length === 0 ? (
                <p className="px-3 py-6 text-[12px] text-gray-400 text-center">Nenhum usuário encontrado.</p>
              ) : visiveis.map(u => {
                const marcado = selecionados.has(u.id);
                return (
                  <label key={u.id}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={marcado}
                      onChange={() => onToggle(u.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-gray-800 truncate">{u.nome}</p>
                      <p className="text-[10.5px] text-gray-400 truncate">{u.email}</p>
                    </div>
                    <span className={`text-[9.5px] uppercase font-semibold px-1.5 py-0.5 rounded ring-1 flex-shrink-0 ${
                      u.tipo === 'admin' ? 'bg-blue-50 text-blue-700 ring-blue-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    }`}>
                      {u.tipo}
                    </span>
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
