// Admin: analytics de uso do portal cliente.
// Mostra acessos por dia, páginas mais/menos visitadas, tempo médio
// na página, usuários ativos — com filtros por período, usuário e rede.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity, Users, FileText, Clock, TrendingUp, Search,
  Loader2, RefreshCw, Calendar, Network, ArrowUp, ArrowDown,
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
  const [de, setDe] = useState(diasAtras(29));
  const [ate, setAte] = useState(hojeIso());
  const [preset, setPreset] = useState('30d');
  const [usuarioId, setUsuarioId] = useState('');
  const [redeFiltro, setRedeFiltro] = useState('todas');

  const [usuarios, setUsuarios] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);
  const [redesAs, setRedesAs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [resumo, setResumo] = useState(null);
  const [serie, setSerie] = useState([]);
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
        usuarioId: usuarioId || null,
        redeFiltro: redeFiltro !== 'todas' ? redeFiltro : null,
      };
      const [r, s, t, rec] = await Promise.all([
        usoPortalService.resumo(filtros),
        usoPortalService.serieDiaria(filtros),
        usoPortalService.topPaginas(filtros),
        usoPortalService.acessosRecentes({ ...filtros, limit: 80 }),
      ]);
      setResumo(r);
      setSerie(s);
      setTop(t);
      setRecentes(rec);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, [de, ate, usuarioId, redeFiltro]);

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
    return [...top].sort((a, b) => Number(a.acessos) - Number(b.acessos)).slice(0, 10);
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
        description="Analytics de acessos, páginas mais visitadas e tempo na página — apenas portal cliente.">
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

        {/* Usuário */}
        <div className="relative">
          <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 pl-8 pr-3 text-xs font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-w-[200px]">
            <option value="">Todos os usuários</option>
            {usuarios.filter(u => u.tipo === 'cliente').map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi icon={Activity}     cor="blue"    label="Total de acessos"   valor={Number(resumo?.total_acessos || 0).toLocaleString('pt-BR')} />
        <Kpi icon={Users}        cor="emerald" label="Usuários únicos"    valor={Number(resumo?.usuarios_unicos || 0).toLocaleString('pt-BR')} />
        <Kpi icon={FileText}     cor="indigo"  label="Páginas distintas"  valor={Number(resumo?.paginas_distintas || 0).toLocaleString('pt-BR')} />
        <Kpi icon={Clock}        cor="amber"   label="Tempo médio/página" valor={usoPortalService.formatarDuracao(resumo?.tempo_medio_global_seg)} />
      </div>

      {/* Gráfico acessos por dia */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-4 shadow-sm">
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
          <TabelaPaginas itens={topFiltrado.slice(0, 12)} />
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

function TabelaPaginas({ itens }) {
  if (!itens || itens.length === 0) {
    return <div className="px-4 py-10 text-center text-[12px] text-gray-400">Sem dados.</div>;
  }
  const max = Math.max(...itens.map(i => Number(i.acessos))) || 1;
  return (
    <div className="divide-y divide-gray-100">
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
