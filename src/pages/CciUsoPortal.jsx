// Admin: analytics de uso do portal cliente.
// Mostra acessos por dia, páginas mais/menos visitadas, tempo médio
// na página, usuários ativos — com filtros por período, usuário e rede.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Activity, Users, FileText, Clock, TrendingUp, Search,
  Loader2, RefreshCw, Calendar, Network, ArrowUp, ArrowDown,
  X, Check, AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import * as usoPortalService from '../services/usoPortalService';
import * as usuariosService from '../services/usuariosSistemaService';
import * as mapeamentoService from '../services/mapeamentoService';
import * as autosystemService from '../services/autosystemService';

// Utilitários de data (timezone local — São Paulo)
function isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function hojeIso() { return isoLocal(new Date()); }
function diasAtras(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return isoLocal(d);
}

const PRESETS = [
  { key: '7d',  label: 'Últimos 7 dias',  dias: 6  },
  { key: '30d', label: 'Últimos 30 dias', dias: 29 },
  { key: '90d', label: 'Últimos 90 dias', dias: 89 },
];


export default function CciUsoPortal() {
  const [de, setDe] = useState(diasAtras(6));
  const [ate, setAte] = useState(hojeIso());
  const [preset, setPreset] = useState('7d');
  const [usuarioIds, setUsuarioIds] = useState(() => new Set());
  const [redeFiltro, setRedeFiltro] = useState('todas');

  const [usuarios, setUsuarios] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);
  const [redesAs, setRedesAs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [resumo, setResumo] = useState(null);
  const [serie, setSerie] = useState([]);
  const [rankingRedes, setRankingRedes] = useState([]);
  const [top, setTop] = useState([]);
  const [recentes, setRecentes] = useState([]);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const [buscaPagina, setBuscaPagina] = useState('');

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  // Carrega catálogos uma vez (usuários + redes)
  useEffect(() => {
    Promise.all([
      usuariosService.listarUsuarios().catch(() => []),
      mapeamentoService.listarChavesApi().catch(() => []),
      autosystemService.listarRedes().catch(() => []),
    ]).then(([us, chs, ars]) => {
      setUsuarios((us || []).filter(u => u.status === 'ativo').sort((a, b) => a.nome.localeCompare(b.nome)));
      setChavesApi((chs || []).filter(c => c.ativo !== false));
      setRedesAs((ars || []).filter(r => r.ativo !== false));
    });
  }, []);

  // Carrega métricas sempre que filtros mudam
  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const filtros = {
        de, ate,
        usuarioIds: Array.from(usuarioIds),
        redeFiltro: redeFiltro !== 'todas' ? redeFiltro : null,
      };
      const [r, s, t, rec, rk] = await Promise.all([
        usoPortalService.resumo(filtros),
        usoPortalService.serieDiaria(filtros),
        usoPortalService.topPaginas(filtros),
        usoPortalService.acessosRecentes({ ...filtros, limit: 80 }),
        usoPortalService.rankingRedes(filtros),
      ]);
      setResumo(r);
      setSerie(s);
      setTop(t);
      setRecentes(rec);
      setRankingRedes(rk);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, [de, ate, usuarioIds, redeFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  const aplicarPreset = (key) => {
    const p = PRESETS.find(x => x.key === key);
    if (!p) return;
    setPreset(key);
    setAte(hojeIso());
    setDe(diasAtras(p.dias));
  };

  // Lista de filtro de rede (apenas as que têm pelo menos 1 usuário)
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

  // Top filtrado por busca de página (para mostrar mais ou menos visitadas)
  const topFiltrado = useMemo(() => {
    const q = buscaPagina.trim().toLowerCase();
    if (!q) return top;
    return top.filter(p =>
      p.path.toLowerCase().includes(q) ||
      usoPortalService.labelPath(p.path).toLowerCase().includes(q)
    );
  }, [top, buscaPagina]);

  const menosVisitadas = useMemo(() => {
    return [...top].sort((a, b) => Number(a.acessos) - Number(b.acessos)).slice(0, 50);
  }, [top]);

  // Série pronta pro gráfico (preenche dias sem acesso com 0)
  const serieGrafico = useMemo(() => {
    const map = new Map((serie || []).map(s => [s.dia, s]));
    const out = [];
    const dt = new Date(de + 'T00:00:00');
    const fim = new Date(ate + 'T00:00:00');
    while (dt <= fim) {
      const iso = isoLocal(dt);
      const reg = map.get(iso);
      out.push({
        dia: iso,
        label: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        acessos: Number(reg?.acessos || 0),
        usuarios: Number(reg?.usuarios_unicos || 0),
      });
      dt.setDate(dt.getDate() + 1);
    }
    return out;
  }, [serie, de, ate]);


  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Uso do Portal"
        description="Analytics dos usuários CLIENTE — acessos, páginas mais visitadas e tempo na página.">
        <button onClick={carregar} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </PageHeader>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex items-center gap-3 flex-wrap">
        {/* Presets */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => aplicarPreset(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                preset === p.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Datas custom */}
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <input type="date" value={de} onChange={(e) => { setPreset(''); setDe(e.target.value); }}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <span className="text-xs text-gray-400">→</span>
          <input type="date" value={ate} onChange={(e) => { setPreset(''); setAte(e.target.value); }}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        {/* Rede */}
        <div className="relative">
          <Network className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <select value={redeFiltro} onChange={(e) => setRedeFiltro(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 pl-8 pr-3 text-xs font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-w-[200px]">
            <option value="todas">Todas as redes</option>
            {redesFiltro.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        {/* Usuários — multiselect */}
        <UsuariosMultiSelect
          usuarios={usuarios.filter(u => u.tipo === 'cliente')}
          selecionados={usuarioIds}
          onChange={setUsuarioIds}
        />
        {usuarioIds.size > 1 && (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
            <AlertCircle className="h-3 w-3" /> KPIs e série mostram todos os clientes (RPC não filtra múltiplos)
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi icon={Activity}     cor="blue"    label="Total de acessos"   valor={Number(resumo?.total_acessos || 0).toLocaleString('pt-BR')} />
        <Kpi icon={Users}        cor="emerald" label="Usuários únicos"    valor={Number(resumo?.usuarios_unicos || 0).toLocaleString('pt-BR')} />
        <Kpi icon={FileText}     cor="indigo"  label="Páginas distintas"  valor={Number(resumo?.paginas_distintas || 0).toLocaleString('pt-BR')} />
        <Kpi icon={Clock}        cor="amber"   label="Tempo médio/página" valor={usoPortalService.formatarDuracao(resumo?.tempo_medio_global_seg)} />
      </div>

      {/* Gráficos lado a lado: por dia + por rede */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Acessos por dia</h3>
            <span className="text-[11px] text-gray-400 ml-auto">
              {new Date(de + 'T00:00:00').toLocaleDateString('pt-BR')} → {new Date(ate + 'T00:00:00').toLocaleDateString('pt-BR')}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={serieGrafico} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-acessos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-users" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              <Area type="monotone" dataKey="acessos"  stroke="#3b82f6" strokeWidth={2} fill="url(#grad-acessos)" name="Acessos" />
              <Area type="monotone" dataKey="usuarios" stroke="#10b981" strokeWidth={2} fill="url(#grad-users)"   name="Usuários únicos" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Network className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-gray-800">Acessos por rede</h3>
            <span className="text-[11px] text-gray-400 ml-auto">
              {rankingRedes.length === 0 ? 'sem dados' : `${rankingRedes.length} ${rankingRedes.length === 1 ? 'rede' : 'redes'} no período`}
            </span>
          </div>
          <RankingRedes itens={rankingRedes} />
        </div>
      </div>

      {/* Páginas: mais e menos visitadas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <ArrowUp className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-gray-800">Páginas mais visitadas</h3>
            <div className="ml-auto relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <input value={buscaPagina} onChange={(e) => setBuscaPagina(e.target.value)}
                placeholder="Filtrar..."
                className="h-7 w-32 rounded-md border border-gray-200 pl-6 pr-2 text-[11px] focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
            </div>
          </div>
          <TabelaPaginas itens={topFiltrado.slice(0, 50)} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <ArrowDown className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-800">Páginas menos visitadas</h3>
            <span className="text-[10px] text-gray-400">·  com acesso no período</span>
          </div>
          <TabelaPaginas itens={menosVisitadas} />
        </div>
      </div>

      {/* Últimos acessos */}
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800">Últimos acessos</h3>
          <span className="text-[11px] text-gray-400">· {recentes.length} mais recentes do período</span>
        </div>
        {loading ? (
          <div className="px-6 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400 mx-auto" /></div>
        ) : recentes.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">Nenhum acesso no período.</div>
        ) : (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100 sticky top-0">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Quando</th>
                  <th className="px-4 py-2.5">Usuário</th>
                  <th className="px-4 py-2.5">Rede / Empresa</th>
                  <th className="px-4 py-2.5">Página</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentes.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-[11.5px] text-gray-600">
                      {new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-2 text-[12px]">
                      <p className="font-medium text-gray-900 truncate max-w-[200px]">{r.usuario?.nome || 'Usuário removido'}</p>
                      <p className="text-[10.5px] text-gray-400 truncate max-w-[200px]">{r.usuario?.email}</p>
                    </td>
                    <td className="px-4 py-2 text-[11.5px] text-gray-600">
                      <p>{r.chaves_api?.nome || r.as_rede?.nome || '—'} <span className="text-[9.5px] uppercase text-gray-400">{r.tipo_portal}</span></p>
                      {r.cliente?.nome && <p className="text-[10.5px] text-gray-400 truncate max-w-[180px]">{r.cliente.nome}</p>}
                    </td>
                    <td className="px-4 py-2 text-[12px] text-gray-800">
                      <p className="truncate max-w-[320px]">{usoPortalService.labelPath(r.path)}</p>
                      <p className="text-[10px] text-gray-400 font-mono truncate max-w-[320px]">{r.path}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function UsuariosMultiSelect({ usuarios, selecionados, onChange }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = (id) => {
    const next = new Set(selecionados);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(u => (u.nome || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
  }, [usuarios, busca]);

  const todasMarcadas = selecionados.size === usuarios.length && usuarios.length > 0;
  const label = selecionados.size === 0
    ? 'Todos os usuários'
    : selecionados.size === 1
      ? usuarios.find(u => selecionados.has(u.id))?.nome || '1 usuário'
      : `${selecionados.size} usuários`;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto(o => !o)}
        className={`h-9 inline-flex items-center justify-between gap-2 rounded-lg border pl-8 pr-3 text-xs font-medium transition-colors min-w-[220px] ${
          aberto ? 'border-blue-400 ring-2 ring-blue-100 text-gray-800' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
        }`}>
        <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <span className="truncate">{label}</span>
        <span className="text-gray-300">▾</span>
      </button>
      {aberto && (
        <div className="absolute left-0 top-full mt-1 w-80 max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden">
          <div className="p-2 border-b border-gray-100 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar usuário..." autoFocus
                className="w-full h-8 pl-7 pr-2 text-xs rounded border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
            </div>
            <button onClick={() => onChange(todasMarcadas ? new Set() : new Set(usuarios.map(u => u.id)))}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap px-1">
              {todasMarcadas ? 'Limpar' : 'Todos'}
            </button>
          </div>
          {selecionados.size > 0 && (
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100 bg-blue-50/40">
              <span className="text-[10.5px] text-blue-700">{selecionados.size} selecionado{selecionados.size === 1 ? '' : 's'}</span>
              <button onClick={() => onChange(new Set())}
                className="text-[10.5px] text-gray-500 hover:text-gray-800 inline-flex items-center gap-0.5">
                <X className="h-3 w-3" /> limpar
              </button>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {/* Selecionar todos — afeta o resultado da busca quando há filtro,
                caso contrário, todos os usuários da lista. */}
            {filtrados.length > 0 && (() => {
              const idsVisiveis = filtrados.map(u => u.id);
              const totalVisiveis = idsVisiveis.length;
              const marcadosVisiveis = idsVisiveis.filter(id => selecionados.has(id)).length;
              const todosMarcados = marcadosVisiveis === totalVisiveis;
              const algunsMarcados = marcadosVisiveis > 0 && !todosMarcados;
              return (
                <button onClick={() => {
                  const next = new Set(selecionados);
                  if (todosMarcados) idsVisiveis.forEach(id => next.delete(id));
                  else               idsVisiveis.forEach(id => next.add(id));
                  onChange(next);
                }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] border-b border-gray-100 sticky top-0 z-10 ${
                    todosMarcados ? 'bg-blue-50' : algunsMarcados ? 'bg-blue-50/40' : 'bg-white'
                  } hover:bg-blue-50/60`}>
                  <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    todosMarcados ? 'bg-blue-600 border-blue-600'
                    : algunsMarcados ? 'bg-blue-100 border-blue-400'
                    : 'border-gray-300'
                  }`}>
                    {todosMarcados ? <Check className="h-3 w-3 text-white" />
                    : algunsMarcados ? <span className="h-0.5 w-2 bg-blue-600 rounded" />
                    : null}
                  </span>
                  <span className="text-[12px] font-semibold text-gray-800 flex-1">
                    {todosMarcados ? 'Desmarcar todos' : 'Selecionar todos'}
                    {busca && <span className="text-[10.5px] text-gray-500 font-normal"> ({totalVisiveis} no filtro)</span>}
                  </span>
                </button>
              );
            })()}
            {filtrados.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nenhum usuário</p>
            ) : filtrados.map(u => {
              const marcado = selecionados.has(u.id);
              return (
                <button key={u.id} onClick={() => toggle(u.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-gray-50 transition-colors ${marcado ? 'bg-blue-50/30' : ''}`}>
                  <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${marcado ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                    {marcado && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <p className={`truncate ${marcado ? 'text-blue-900 font-medium' : 'text-gray-800'}`}>{u.nome}</p>
                    {u.email && <p className="text-[10px] text-gray-400 truncate">{u.email}</p>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, cor, label, valor }) {
  const cores = {
    blue:    'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    indigo:  'bg-indigo-50 text-indigo-700',
    amber:   'bg-amber-50 text-amber-700',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${cores[cor]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{valor}</p>
    </div>
  );
}

function RankingRedes({ itens }) {
  if (!itens || itens.length === 0) {
    return <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">Sem acessos no período.</div>;
  }
  const max = Math.max(...itens.map(i => Number(i.acessos))) || 1;
  // ~6 redes visíveis (~52px cada com divider) — restante via scroll.
  return (
    <div className="max-h-[330px] overflow-y-auto divide-y divide-gray-100">
      {itens.map((r, i) => {
        const pct = (Number(r.acessos) / max) * 100;
        const corBg = r.tipo === 'autosystem' ? 'from-blue-500 to-blue-600'
                    : r.tipo === 'webposto'   ? 'from-violet-500 to-violet-600'
                                              : 'from-slate-400 to-slate-500';
        const corBadge = r.tipo === 'autosystem' ? 'bg-blue-50 text-blue-700'
                       : r.tipo === 'webposto'   ? 'bg-violet-50 text-violet-700'
                                                 : 'bg-slate-100 text-slate-600';
        return (
          <div key={`${r.tipo}:${r.nome}`} className="px-2 py-2">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-gray-500 bg-gray-50 flex-shrink-0">
                  {i + 1}
                </span>
                <p className="text-[12.5px] font-medium text-gray-800 truncate">{r.nome}</p>
                {r.tipo && (
                  <span className={`text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${corBadge}`}>
                    {r.tipo === 'webposto' ? 'WP' : 'AS'}
                  </span>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[12.5px] font-semibold text-gray-900 tabular-nums">{Number(r.acessos).toLocaleString('pt-BR')}</p>
                <p className="text-[10px] text-gray-400">{r.usuarios_unicos} {r.usuarios_unicos === 1 ? 'user' : 'users'}</p>
              </div>
            </div>
            <div className="h-1 rounded-full bg-gray-100 overflow-hidden ml-7">
              <div className={`h-full bg-gradient-to-r ${corBg}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Mostra ~6 linhas iniciais; o restante é acessível via scroll.
// Cada linha tem ~60px (incluindo divider) — 6 linhas ≈ 360px.
function TabelaPaginas({ itens }) {
  if (!itens || itens.length === 0) {
    return <div className="px-4 py-10 text-center text-[12px] text-gray-400">Sem dados.</div>;
  }
  const max = Math.max(...itens.map(i => Number(i.acessos))) || 1;
  return (
    <div className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
      {itens.map(p => {
        const pct = (Number(p.acessos) / max) * 100;
        return (
          <div key={p.path} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-gray-800 truncate">{usoPortalService.labelPath(p.path)}</p>
                <p className="text-[10px] text-gray-400 font-mono truncate">{p.path}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[12.5px] font-semibold text-gray-900 tabular-nums">{Number(p.acessos).toLocaleString('pt-BR')}</p>
                <p className="text-[10px] text-gray-400">
                  {p.usuarios_unicos} {p.usuarios_unicos === 1 ? 'user' : 'users'}
                  {p.tempo_medio_seg ? <> · {usoPortalService.formatarDuracao(p.tempo_medio_seg)}</> : null}
                </p>
              </div>
            </div>
            <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
