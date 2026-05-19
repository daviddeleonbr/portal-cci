import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, Search, RefreshCw, ChevronRight, ChevronDown,
  Clock, AlertTriangle, CheckCircle2, Calendar,
  DollarSign, Building2,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import { useClienteSession } from '../../../hooks/useAuth';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';
import { ehDiaUtil, proximoDiaUtil, isoDate as isoDateUtil, vencimentoEfetivoIso } from '../../../utils/diasUteis';

// ─── Helpers ────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function inicioMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
function fimMesAtual() {
  const d = new Date();
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${ultimo.getFullYear()}-${pad(ultimo.getMonth() + 1)}-${pad(ultimo.getDate())}`;
}

function formatDataBR(s) {
  if (!s) return '—';
  const iso = String(s).slice(0, 10);
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function diaSemana(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  const dt = new Date(+y, +m - 1, +d);
  return DIAS_SEMANA[dt.getDay()] || '';
}

function dataIso(vencto) {
  if (!vencto) return '';
  return typeof vencto === 'string' ? vencto.slice(0, 10) : '';
}

function diffDias(dataIsoStr) {
  if (!dataIsoStr) return null;
  const [y, m, d] = String(dataIsoStr).slice(0, 10).split('-');
  if (!y || !m || !d) return null;
  const alvo = new Date(+y, +m - 1, +d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}

const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

// ─── Cache em memoria por conjunto de empresas + janela de datas ────
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cacheContasPagar = {
  data: null,    // titulos enriquecidos
  key: null,
  timestamp: 0,
};
function chaveCache(empresaIds, venctoDe, venctoAte) {
  return `${[...empresaIds].sort().join(',')}|${venctoDe}|${venctoAte}`;
}
function cacheValido(key) {
  return _cacheContasPagar.data
    && _cacheContasPagar.key === key
    && (Date.now() - _cacheContasPagar.timestamp) < CACHE_TTL_MS;
}

// ─── Componente ─────────────────────────────────────────────────
export default function ClienteContasPagar() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);

  // Só empresas vinculadas ao Autosystem (empresa_codigo preenchido)
  const empresasDisponiveis = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  // Multi-seleção independente da topbar — default: todas
  const [empresasSelIds, setEmpresasSelIds] = useState(() =>
    new Set(empresasDisponiveis.map(c => c.id))
  );
  // Sincroniza quando a lista de disponíveis muda (sessão recarregada)
  useEffect(() => {
    setEmpresasSelIds(prev => {
      if (prev.size === 0 && empresasDisponiveis.length > 0) {
        return new Set(empresasDisponiveis.map(c => c.id));
      }
      return prev;
    });
  }, [empresasDisponiveis]);

  const empresasSel = useMemo(
    () => empresasDisponiveis.filter(c => empresasSelIds.has(c.id)),
    [empresasDisponiveis, empresasSelIds]
  );
  const podeFiltrarEmpresa = empresasDisponiveis.length > 1;
  const multiEmpresa = empresasSel.length > 1;

  const [venctoDe, setVenctoDe] = useState(inicioMesAtual());
  const [venctoAte, setVenctoAte] = useState(fimMesAtual());

  const cacheKeyInicial = chaveCache(empresasSelIds, venctoDe, venctoAte);
  const cacheInicial = cacheValido(cacheKeyInicial) ? _cacheContasPagar.data : null;

  const [loading, setLoading] = useState(!cacheInicial);
  const [titulos, setTitulos] = useState(cacheInicial || []);
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('hoje');
  const [expandedDates, setExpandedDates] = useState(new Set());
  const [empresasExpandidas, setEmpresasExpandidas] = useState(new Set());

  const redeId = asRede?.id;

  const carregar = useCallback(async ({ force = false } = {}) => {
    if (!redeId) return;
    if (empresasSel.length === 0) {
      setError('Selecione ao menos uma empresa.');
      setTitulos([]);
      setLoading(false);
      return;
    }

    const key = chaveCache(empresasSelIds, venctoDe, venctoAte);
    if (!force && cacheValido(key)) {
      setTitulos(_cacheContasPagar.data);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        empresasSel.map(emp =>
          autosystemService.buscarContasPagar(redeId, emp.empresa_codigo, {
            vencto_de: venctoDe || null,
            vencto_ate: venctoAte || null,
          }).then(contas => contas.map(c => ({
            ...c,
            _empresaId: emp.id,
            _empresaNome: emp.nome,
            _empresaCnpj: emp.cnpj,
          }))),
        ),
      );
      const erros = [];
      const todos = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') todos.push(...r.value);
        else erros.push(`${empresasSel[i].nome}: ${r.reason?.message || 'falha'}`);
      });
      setTitulos(todos);
      if (erros.length > 0 && todos.length === 0) {
        setError(erros.join(' | '));
      } else {
        setError(erros.length > 0 ? `Alguns erros: ${erros.join(' | ')}` : null);
      }
      _cacheContasPagar.data = todos;
      _cacheContasPagar.key = key;
      _cacheContasPagar.timestamp = Date.now();
    } catch (err) {
      setError(err.message);
      setTitulos([]);
    } finally {
      setLoading(false);
    }
  }, [redeId, empresasSel, empresasSelIds, venctoDe, venctoAte]);

  useEffect(() => { carregar(); }, [carregar]);

  // Enriquece cada título com dados derivados
  const enriched = useMemo(() => {
    return (titulos || []).map(t => {
      const venc = dataIso(t.vencto);
      const efet = vencimentoEfetivoIso(venc) || venc;
      const dias = diffDias(efet);
      const valor = toNumber(t.valor);
      return {
        raw: t,
        valor,
        vencimento: venc,
        vencimentoEfetivo: efet,
        diasAteVenc: dias,
        vencido: dias !== null && dias < 0,
        proximo: dias !== null && dias >= 0 && dias <= 7,
        documento: t.documento || '',
        historico: t.obs || '',
        motivoNome: t.motivo_nome || '',
        debitoNome: t.debito_nome || '',
        debitoCodigo: t.debito_codigo || '',
        fornecedorNome: t.pessoa_nome || 'Fornecedor',
        empresaId: t._empresaId,
        empresaNome: t._empresaNome,
        empresaCnpj: t._empresaCnpj,
      };
    });
  }, [titulos]);

  // "Hoje" considera o próximo dia útil quando hoje não é útil
  const datasHoje = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const diaAlvo = proximoDiaUtil(hoje);
    const datas = new Set();
    datas.add(isoDateUtil(diaAlvo));
    const cur = new Date(diaAlvo);
    cur.setDate(cur.getDate() - 1);
    while (!ehDiaUtil(cur)) {
      datas.add(isoDateUtil(cur));
      cur.setDate(cur.getDate() - 1);
    }
    return datas;
  }, []);

  const hojeAntecipado = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return !ehDiaUtil(hoje);
  }, []);
  const proximoUtilIso = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return isoDateUtil(proximoDiaUtil(hoje));
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return enriched.filter(t => {
      if (filtroStatus === 'hoje' && !(t.vencimento && datasHoje.has(t.vencimento))) return false;
      if (filtroStatus === 'vencidos' && !t.vencido) return false;
      if (filtroStatus === 'proximos' && (t.vencido || !t.proximo)) return false;
      if (filtroStatus === 'futuros' && (t.vencido || t.proximo)) return false;
      if (!q) return true;
      return (
        t.fornecedorNome.toLowerCase().includes(q) ||
        String(t.documento).toLowerCase().includes(q) ||
        t.debitoNome.toLowerCase().includes(q) ||
        (t.historico || '').toLowerCase().includes(q)
      );
    });
  }, [enriched, busca, filtroStatus, datasHoje]);

  // Agrupa por data de vencimento
  const grupos = useMemo(() => {
    const mapa = new Map();
    filtrados.forEach(t => {
      const key = t.vencimento || 'sem-data';
      if (!mapa.has(key)) mapa.set(key, { data: t.vencimento, itens: [], total: 0 });
      const g = mapa.get(key);
      g.itens.push(t);
      g.total += t.valor;
    });
    const arr = Array.from(mapa.values());
    arr.sort((a, b) => {
      if (!a.data) return 1;
      if (!b.data) return -1;
      return a.data.localeCompare(b.data);
    });
    arr.forEach(g => {
      const dias = diffDias(vencimentoEfetivoIso(g.data) || g.data);
      g.diasAteVenc = dias;
      g.vencido = dias !== null && dias < 0;
      g.proximo = dias !== null && dias >= 0 && dias <= 7;
      g.itens.sort((a, b) => b.valor - a.valor);
    });
    return arr;
  }, [filtrados]);

  // Totais (sem filtro de status/busca — cards refletem panorama completo)
  const totais = useMemo(() => {
    const tot = enriched.reduce((s, t) => s + t.valor, 0);
    const vencidos = enriched.filter(t => t.vencido);
    const proximos = enriched.filter(t => !t.vencido && t.proximo);
    const futuros = enriched.filter(t => !t.vencido && !t.proximo);
    const hoje = enriched.filter(t => t.vencimento && datasHoje.has(t.vencimento));
    return {
      total: tot,
      qtd: enriched.length,
      vencidos: vencidos.reduce((s, t) => s + t.valor, 0),
      qtdVencidos: vencidos.length,
      proximos: proximos.reduce((s, t) => s + t.valor, 0),
      qtdProximos: proximos.length,
      futuros: futuros.reduce((s, t) => s + t.valor, 0),
      qtdFuturos: futuros.length,
      hoje: hoje.reduce((s, t) => s + t.valor, 0),
      qtdHoje: hoje.length,
    };
  }, [enriched, datasHoje]);

  // Tree multi-empresa: empresa → data → títulos
  const treeEmpresas = useMemo(() => {
    if (!multiEmpresa) return [];
    const porEmp = new Map();
    filtrados.forEach(t => {
      const empId = t.empresaId ?? 'sem-empresa';
      if (!porEmp.has(empId)) {
        porEmp.set(empId, {
          empresaId: empId,
          empresaNome: t.empresaNome || 'Sem empresa',
          empresaCnpj: t.empresaCnpj || '',
          itens: [], total: 0, qtdVencidos: 0,
        });
      }
      const e = porEmp.get(empId);
      e.itens.push(t);
      e.total += t.valor;
      if (t.vencido) e.qtdVencidos += 1;
    });
    const arr = Array.from(porEmp.values()).map(emp => {
      const mapaData = new Map();
      emp.itens.forEach(t => {
        const k = t.vencimento || 'sem-data';
        if (!mapaData.has(k)) mapaData.set(k, { data: t.vencimento, itens: [], total: 0 });
        const g = mapaData.get(k);
        g.itens.push(t);
        g.total += t.valor;
      });
      const gruposLocal = Array.from(mapaData.values()).sort((a, b) => {
        if (!a.data) return 1;
        if (!b.data) return -1;
        return a.data.localeCompare(b.data);
      });
      gruposLocal.forEach(g => {
        const dias = diffDias(vencimentoEfetivoIso(g.data) || g.data);
        g.diasAteVenc = dias;
        g.vencido = dias !== null && dias < 0;
        g.proximo = dias !== null && dias >= 0 && dias <= 7;
        g.itens.sort((a, b) => b.valor - a.valor);
      });
      return { ...emp, grupos: gruposLocal, qtd: emp.itens.length };
    });
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [filtrados, multiEmpresa]);

  // Recolhe quando muda filtro/seleção
  useEffect(() => {
    setEmpresasExpandidas(new Set());
    setExpandedDates(new Set());
  }, [filtroStatus, multiEmpresa, treeEmpresas, grupos.length]);

  const toggleDate = (key) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleEmpresa = (empId) => {
    setEmpresasExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  };
  const expandirTodos = () => {
    if (multiEmpresa) {
      setEmpresasExpandidas(new Set(treeEmpresas.map(e => e.empresaId)));
      const datas = new Set();
      treeEmpresas.forEach(e =>
        e.grupos.forEach(g => datas.add(`${e.empresaId}|${g.data || 'sem-data'}`))
      );
      setExpandedDates(datas);
    } else {
      setExpandedDates(new Set(grupos.map(g => g.data || 'sem-data')));
    }
  };
  const colapsarTodos = () => {
    setExpandedDates(new Set());
    setEmpresasExpandidas(new Set());
  };

  // Sem empresas com vínculo Autosystem
  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Contas a Pagar" description="Títulos pendentes de pagamento" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>
            Sua rede ainda não tem <strong>empresas Autosystem</strong> com <code className="font-mono bg-amber-100 px-1 rounded">empresa_codigo</code> vinculado.
            Contate o administrador para importar as empresas em <em>/admin/clientes → Importar empresas</em>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Contas a Pagar" description="Títulos pendentes de pagamento">
        {/* Filtro de data */}
        <div className="hidden md:flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <Calendar className="h-3 w-3" /> Vencimento entre
          </span>
          <input type="date" value={venctoDe} onChange={e => setVenctoDe(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <span className="text-[10px] text-gray-400">e</span>
          <input type="date" value={venctoAte} onChange={e => setVenctoAte(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        {podeFiltrarEmpresa && (
          <EmpresaMultiSelect
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresasSelIds(prev => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })}
            onToggleTodas={() => setEmpresasSelIds(prev =>
              prev.size === empresasDisponiveis.length ? new Set() : new Set(empresasDisponiveis.map(c => c.id))
            )}
          />
        )}
        <button onClick={() => carregar({ force: true })}
          disabled={loading || empresasSel.length === 0}
          title="Força recarga ignorando o cache"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </PageHeader>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <ResumoCard icon={DollarSign} iconBg="bg-blue-50" iconColor="text-blue-600"
          label={hojeAntecipado ? 'A pagar (próximo dia útil)' : 'A pagar hoje'}
          valor={formatCurrency(totais.hoje)}
          sub={hojeAntecipado
            ? (totais.qtdHoje > 0
                ? `${totais.qtdHoje} ${totais.qtdHoje === 1 ? 'titulo' : 'titulos'} em ${formatDataBR(proximoUtilIso)}`
                : `previsto para ${formatDataBR(proximoUtilIso)}`)
            : (totais.qtdHoje > 0
                ? `${totais.qtdHoje} ${totais.qtdHoje === 1 ? 'titulo vence' : 'titulos vencem'} hoje`
                : 'nenhum vencimento hoje')}
          highlight />
        <ResumoCard icon={AlertTriangle} iconBg="bg-red-50" iconColor="text-red-600"
          label="Vencidos" valor={formatCurrency(totais.vencidos)}
          sub={`${totais.qtdVencidos} ${totais.qtdVencidos === 1 ? 'titulo' : 'titulos'}`} />
        <ResumoCard icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600"
          label="Próximos 7 dias" valor={formatCurrency(totais.proximos)}
          sub={`${totais.qtdProximos} ${totais.qtdProximos === 1 ? 'titulo' : 'titulos'}`} />
        <ResumoCard icon={Calendar} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label="A vencer" valor={formatCurrency(totais.futuros)}
          sub={`${totais.qtdFuturos} ${totais.qtdFuturos === 1 ? 'titulo' : 'titulos'}`} />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por fornecedor, documento, conta ou observação..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors" />
        </div>
        <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
          {[
            { k: 'todos', label: 'Todos' },
            { k: 'hoje', label: 'Hoje' },
            { k: 'vencidos', label: 'Vencidos' },
            { k: 'proximos', label: 'Próximos 7d' },
            { k: 'futuros', label: 'A vencer' },
          ].map(tab => (
            <button key={tab.k} onClick={() => setFiltroStatus(tab.k)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                filtroStatus === tab.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tree */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando títulos pendentes...</span>
        </div>
      ) : error && enriched.length === 0 ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar os títulos</p>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        </div>
      ) : grupos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">
            {enriched.length === 0 ? 'Nenhum título pendente' : 'Nenhum título encontrado para o filtro atual'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {enriched.length === 0 ? 'Todas as contas estão em dia' : 'Tente ajustar a busca ou o filtro'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Títulos por vencimento</h3>
            <span className="text-[11px] text-gray-400">
              {multiEmpresa
                ? `· ${treeEmpresas.length} ${treeEmpresas.length === 1 ? 'empresa' : 'empresas'} · ${filtrados.length} ${filtrados.length === 1 ? 'titulo' : 'titulos'}`
                : `· ${grupos.length} ${grupos.length === 1 ? 'data' : 'datas'} · ${filtrados.length} ${filtrados.length === 1 ? 'titulo' : 'titulos'}`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={expandirTodos} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors">
                Expandir todos
              </button>
              <span className="text-[11px] text-gray-300">|</span>
              <button onClick={colapsarTodos} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors">
                Colapsar todos
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">{multiEmpresa ? 'Empresa / Data / Documento' : 'Vencimento / Documento'}</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Fornecedor</th>
                  <th className="px-3 py-2.5">Conta (Débito)</th>
                  <th className="px-3 py-2.5">Histórico</th>
                  <th className="px-3 py-2.5 text-right">Qtd</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {multiEmpresa
                  ? treeEmpresas.map(emp => {
                      const empAberta = empresasExpandidas.has(emp.empresaId);
                      return (
                        <React.Fragment key={`emp-${emp.empresaId}`}>
                          <tr onClick={() => toggleEmpresa(emp.empresaId)}
                            className={`cursor-pointer transition-colors ${empAberta ? 'bg-blue-50/40 dark:bg-blue-500/15' : 'hover:bg-gray-50/60 dark:hover:bg-white/5'}`}>
                            <td className="px-4 py-2.5" colSpan={5}>
                              <div className="flex items-center gap-2">
                                <motion.div animate={{ rotate: empAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                  <ChevronRight className="h-4 w-4 text-gray-400" />
                                </motion.div>
                                <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center flex-shrink-0">
                                  <Building2 className="h-3.5 w-3.5" />
                                </div>
                                <div>
                                  <p className="text-[13px] font-semibold text-gray-900 truncate">{emp.empresaNome}</p>
                                  <p className="text-[10.5px] text-gray-500">
                                    <span className="font-mono">{emp.empresaCnpj || '—'}</span>
                                    {' · '}{emp.grupos.length} {emp.grupos.length === 1 ? 'data' : 'datas'}
                                    {emp.qtdVencidos > 0 && <span className="ml-1 text-red-600 dark:text-red-400">· {emp.qtdVencidos} vencido{emp.qtdVencidos === 1 ? '' : 's'}</span>}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">
                              {emp.qtd}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[13px] font-bold text-gray-900">
                              {formatCurrency(emp.total)}
                            </td>
                          </tr>
                          {empAberta && emp.grupos.map(g => renderGrupoTree(g, emp.empresaId, multiEmpresa, expandedDates, toggleDate))}
                        </React.Fragment>
                      );
                    })
                  : grupos.map(g => renderGrupoTree(g, null, multiEmpresa, expandedDates, toggleDate))
                }
              </tbody>
              <tfoot className="bg-gray-50/60 dark:bg-white/[0.03] border-t border-gray-100 dark:border-white/10">
                <tr className="text-[12px] font-semibold">
                  <td className="px-4 py-3" colSpan={5}>
                    Total · {filtrados.length} {filtrados.length === 1 ? 'titulo' : 'titulos'} em {grupos.length} {grupos.length === 1 ? 'data' : 'datas'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-700">{filtrados.length}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900">
                    {formatCurrency(filtrados.reduce((s, t) => s + t.valor, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Render do grupo (data + títulos) ───────────────────────────
function renderGrupoTree(g, empresaId, multiEmpresa, expandedDates, toggleDate) {
  const dataKey = g.data || 'sem-data';
  const key = empresaId ? `${empresaId}|${dataKey}` : dataKey;
  const aberto = expandedDates.has(key);
  const efet = vencimentoEfetivoIso(g.data) || g.data;
  const rolou = g.data && efet && g.data !== efet;
  const statusCfg = g.vencido
    ? { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-300', ring: 'ring-red-200 dark:ring-red-500/30',
        label: g.diasAteVenc !== null ? `Vencido há ${Math.abs(g.diasAteVenc)}d` : 'Vencido',
        bar: 'bg-red-500' }
    : g.proximo
    ? { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', ring: 'ring-amber-200 dark:ring-amber-500/30',
        label: g.diasAteVenc === 0 ? 'Vence hoje' : `Vence em ${g.diasAteVenc}d`,
        bar: 'bg-amber-500' }
    : { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-500/30',
        label: g.diasAteVenc !== null ? `Em ${g.diasAteVenc}d` : '—',
        bar: 'bg-emerald-500' };
  const indentDataPL = multiEmpresa ? 48 : 16;
  const indentItemPL = multiEmpresa ? 88 : 56;
  return (
    <React.Fragment key={key}>
      <tr onClick={() => toggleDate(key)}
        className={`cursor-pointer transition-colors ${aberto ? 'bg-blue-50/30 dark:bg-blue-500/10' : 'hover:bg-gray-50/60 dark:hover:bg-white/5'}`}>
        <td className="py-2.5" style={{ paddingLeft: indentDataPL, paddingRight: 12 }}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: aberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            </motion.div>
            <span className={`inline-block w-1 h-5 rounded-full ${statusCfg.bar} flex-shrink-0`} />
            <div>
              <p className="text-[12.5px] font-semibold text-gray-900 font-mono tabular-nums">
                {g.data ? formatDataBR(g.data) : 'Sem data'}
              </p>
              <p className="text-[10.5px] text-gray-400">
                {g.data ? diaSemana(g.data) : '—'}
                {rolou && <span className="ml-1 text-amber-600">→ paga em {formatDataBR(efet)}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.bg} ${statusCfg.text} ring-1 ${statusCfg.ring}`}>
            {statusCfg.label}
          </span>
        </td>
        <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">
          {g.itens.length}
        </td>
        <td className={`px-3 py-2.5 text-right font-mono tabular-nums text-[12.5px] font-semibold ${g.vencido ? 'text-red-700 dark:text-red-400' : 'text-gray-900'}`}>
          {formatCurrency(g.total)}
        </td>
      </tr>
      {aberto && g.itens.map((t, i) => (
        <tr key={`${key}-${t.documento}-${i}`} className="bg-gray-50/30 dark:bg-white/[0.02] hover:bg-gray-50/60 dark:hover:bg-white/5">
          <td className="py-1.5" style={{ paddingLeft: indentItemPL, paddingRight: 12 }}>
            <span className="font-mono tabular-nums text-[11.5px] text-gray-700">
              {t.documento || `#${i + 1}`}
            </span>
          </td>
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 truncate max-w-[240px]">
            <p className="text-[11.5px] text-gray-800 truncate">{t.fornecedorNome}</p>
          </td>
          <td className="px-3 py-1.5">
            <p className="text-[11px] text-gray-700 truncate max-w-[200px]">{t.debitoNome || '—'}</p>
            {t.debitoCodigo && <p className="text-[10px] text-gray-400 font-mono">{t.debitoCodigo}</p>}
          </td>
          <td className="px-3 py-1.5 text-[11px] text-gray-500 truncate max-w-[260px]">{t.historico || '—'}</td>
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-900">
            {formatCurrency(t.valor)}
          </td>
        </tr>
      ))}
    </React.Fragment>
  );
}

function ResumoCard({ icon: Icon, iconBg, iconColor, label, valor, sub, highlight }) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${highlight ? 'border-blue-200 bg-gradient-to-br from-blue-50/50 to-white' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${iconBg} p-2.5 flex-shrink-0`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className="text-lg font-semibold text-gray-900 tracking-tight truncate">{valor}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Multi-select de empresas (dropdown com checkboxes) ─────────
function EmpresaMultiSelect({ clientesRede, selecionadas, onToggle, onToggleTodas }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (clientesRede.length === 0) return null;

  const todasMarcadas = selecionadas.size === clientesRede.length;
  const label = selecionadas.size === 0
    ? 'Nenhuma'
    : todasMarcadas
    ? `Todas (${clientesRede.length})`
    : selecionadas.size === 1
    ? clientesRede.find(c => selecionadas.has(c.id))?.nome || '1 selecionada'
    : `${selecionadas.size} empresas`;

  return (
    <div ref={ref} className="relative">
      <label className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
          <Building2 className="h-3 w-3" /> Empresas
        </span>
        <button type="button" onClick={() => setAberto(o => !o)}
          className={`h-9 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-xs transition-colors min-w-[180px] max-w-[260px] ${
            aberto ? 'border-blue-400 ring-2 ring-blue-100 text-gray-800' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
          }`}>
          <span className="truncate">{label}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
      </label>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
            <button type="button" onClick={onToggleTodas}
              className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
              <input type="checkbox" checked={todasMarcadas}
                onChange={() => {}} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-[12.5px] font-medium text-gray-700">
                {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
              </span>
            </button>
            <div className="max-h-72 overflow-y-auto">
              {clientesRede.map(emp => {
                const marcada = selecionadas.has(emp.id);
                return (
                  <label key={emp.id}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={marcada}
                      onChange={() => onToggle(emp.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-gray-800 truncate">{emp.nome}</p>
                      {emp.cnpj && <p className="text-[10px] text-gray-400 font-mono truncate">{emp.cnpj}</p>}
                    </div>
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
