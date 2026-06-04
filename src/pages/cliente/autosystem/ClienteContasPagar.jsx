import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, Search, RefreshCw, ChevronRight, ChevronDown,
  Clock, AlertTriangle, CheckCircle2, Calendar,
  DollarSign, Building2, BarChart3, TrendingDown,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
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
function chaveCache(empresaIds, venctoDe, venctoAte, ignorarPeriodo) {
  return `${[...empresaIds].sort().join(',')}|${ignorarPeriodo ? 'ALL' : `${venctoDe}|${venctoAte}`}`;
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

  // Persiste a seleção entre sessões (chave por rede pra não vazar entre clientes)
  const storageKey = asRede?.id ? `cci_cp_as_empresas_${asRede.id}` : null;
  const lerSelecaoSalva = () => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : null;
    } catch { return null; }
  };

  // Multi-seleção: tenta restaurar do localStorage; senão default = todas
  const [empresasSelIds, setEmpresasSelIds] = useState(() => {
    const salva = lerSelecaoSalva();
    if (salva && salva.size > 0) return salva;
    return new Set(empresasDisponiveis.map(c => c.id));
  });

  // Quando a lista de disponíveis muda (sessão recarregada / troca de rede):
  //  - se nada selecionado → marca todas
  //  - se algumas das selecionadas saíram da rede → remove-as
  useEffect(() => {
    setEmpresasSelIds(prev => {
      const idsValidos = new Set(empresasDisponiveis.map(c => c.id));
      const filtradas = new Set([...prev].filter(id => idsValidos.has(id)));
      if (filtradas.size === 0 && empresasDisponiveis.length > 0) {
        return idsValidos;
      }
      return filtradas;
    });
  }, [empresasDisponiveis]);

  // Salva no localStorage sempre que a seleção muda
  useEffect(() => {
    if (!storageKey) return;
    try {
      const todas = empresasSelIds.size === empresasDisponiveis.length;
      // Remove a chave quando seleciona todas (default) — limpa storage
      if (todas) localStorage.removeItem(storageKey);
      else       localStorage.setItem(storageKey, JSON.stringify([...empresasSelIds]));
    } catch { /* noop */ }
  }, [empresasSelIds, empresasDisponiveis.length, storageKey]);

  const empresasSel = useMemo(
    () => empresasDisponiveis.filter(c => empresasSelIds.has(c.id)),
    [empresasDisponiveis, empresasSelIds]
  );
  const podeFiltrarEmpresa = empresasDisponiveis.length > 1;
  const multiEmpresa = empresasSel.length > 1;

  const [venctoDe, setVenctoDe] = useState(inicioMesAtual());
  const [venctoAte, setVenctoAte] = useState(fimMesAtual());
  const [ignorarPeriodo, setIgnorarPeriodo] = useState(false);

  const cacheKeyInicial = chaveCache(empresasSelIds, venctoDe, venctoAte, ignorarPeriodo);
  const cacheInicial = cacheValido(cacheKeyInicial) ? _cacheContasPagar.data : null;

  const [loading, setLoading] = useState(!cacheInicial);
  const [titulos, setTitulos] = useState(cacheInicial || []);
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('hoje');
  const [expandedDates, setExpandedDates] = useState(new Set());
  const [empresasExpandidas, setEmpresasExpandidas] = useState(new Set());
  // Modal de detalhe disparado pelos gráficos
  // { tipo: 'dia' | 'faixa', titulo: string, titulos: titulo[] } | null
  const [modalDetalhe, setModalDetalhe] = useState(null);

  const redeId = asRede?.id;

  const carregar = useCallback(async ({ force = false } = {}) => {
    if (!redeId) return;
    if (empresasSel.length === 0) {
      setError('Selecione ao menos uma empresa.');
      setTitulos([]);
      setLoading(false);
      return;
    }

    const key = chaveCache(empresasSelIds, venctoDe, venctoAte, ignorarPeriodo);
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
            vencto_de: ignorarPeriodo ? null : (venctoDe || null),
            vencto_ate: ignorarPeriodo ? null : (venctoAte || null),
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
  }, [redeId, empresasSel, empresasSelIds, venctoDe, venctoAte, ignorarPeriodo]);

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

  // Contagem de títulos + valor pendente por empresa — alimenta o dropdown
  // (mostra quanto cada empresa contribui no conjunto atualmente carregado).
  const statsPorEmpresa = useMemo(() => {
    const m = new Map();
    for (const t of titulos || []) {
      const id = t._empresaId;
      if (!id) continue;
      const cur = m.get(id) || { qtd: 0, valor: 0 };
      cur.qtd++;
      cur.valor += Number(t.valor || 0);
      m.set(id, cur);
    }
    return m;
  }, [titulos]);

  // ─── Dados pros gráficos ─────────────────────────────────────

  // Próximos 7 dias (hoje + 6) — agrupa títulos por dia de vencimento
  // efetivo (já antecipa fim-de-semana/feriado pro próximo útil).
  const proximos7dias = useMemo(() => {
    const buckets = new Map(); // iso → { valor, qtd }
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    // Inicializa 7 dias zerados pra garantir todas as barras
    for (let i = 0; i < 7; i++) {
      const d = new Date(hoje); d.setDate(d.getDate() + i);
      buckets.set(isoDateUtil(d), { valor: 0, qtd: 0 });
    }
    for (const t of enriched) {
      if (!t.vencimentoEfetivo) continue;
      const cur = buckets.get(t.vencimentoEfetivo);
      if (cur) { cur.valor += t.valor; cur.qtd++; }
    }
    return Array.from(buckets.entries()).map(([iso, v]) => {
      const d = new Date(iso + 'T00:00:00');
      const diaSemana = ['dom','seg','ter','qua','qui','sex','sáb'][d.getDay()];
      const ehFimSemana = d.getDay() === 0 || d.getDay() === 6;
      return {
        iso,
        label: `${diaSemana} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        valor: v.valor,
        qtd:   v.qtd,
        ehFimSemana,
      };
    });
  }, [enriched]);

  // Vencidos agrupados por faixa de atraso (em dias)
  const vencidosPorFaixa = useMemo(() => {
    const faixas = [
      { key: '1-30',  label: '1 a 30 dias',  min: 1,   max: 30,  valor: 0, qtd: 0, cor: '#f59e0b' },
      { key: '31-60', label: '31 a 60 dias', min: 31,  max: 60,  valor: 0, qtd: 0, cor: '#f97316' },
      { key: '61-90', label: '61 a 90 dias', min: 61,  max: 90,  valor: 0, qtd: 0, cor: '#ef4444' },
      { key: '90+',   label: 'Mais de 90',   min: 91,  max: Infinity, valor: 0, qtd: 0, cor: '#b91c1c' },
    ];
    for (const t of enriched) {
      if (!t.vencido || t.diasAteVenc == null) continue;
      const atraso = Math.abs(t.diasAteVenc);
      const f = faixas.find(x => atraso >= x.min && atraso <= x.max);
      if (f) { f.valor += t.valor; f.qtd++; }
    }
    return faixas;
  }, [enriched]);

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
          <span className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 whitespace-nowrap transition-colors ${ignorarPeriodo ? 'text-gray-300' : 'text-gray-500'}`}>
            <Calendar className="h-3 w-3" /> Vencimento entre
          </span>
          <input type="date" value={venctoDe} onChange={e => setVenctoDe(e.target.value)}
            disabled={ignorarPeriodo}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed" />
          <span className={`text-[10px] ${ignorarPeriodo ? 'text-gray-300' : 'text-gray-400'}`}>e</span>
          <input type="date" value={venctoAte} onChange={e => setVenctoAte(e.target.value)}
            disabled={ignorarPeriodo}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed" />
          <label
            title="Ignora o filtro de vencimento e busca todos os títulos pendentes do banco"
            className={`inline-flex items-center gap-1.5 h-9 rounded-lg border px-2.5 text-xs font-medium cursor-pointer select-none transition-colors ${
              ignorarPeriodo
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}>
            <input type="checkbox" checked={ignorarPeriodo}
              onChange={e => setIgnorarPeriodo(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
            Todo o período
          </label>
        </div>
        {podeFiltrarEmpresa && (
          <EmpresaMultiSelect
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            statsPorEmpresa={statsPorEmpresa}
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

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <GraficoProximos7Dias dados={proximos7dias}
          onClickDia={(iso, labelData) => {
            const titulos = enriched
              .filter(t => t.vencimentoEfetivo === iso)
              .sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0));
            if (titulos.length === 0) return;
            setModalDetalhe({ tipo: 'dia', titulo: `Vencimentos em ${labelData}`, titulos });
          }} />
        <GraficoInadimplencia faixas={vencidosPorFaixa}
          totalVencido={totais.vencidos} qtdVencidos={totais.qtdVencidos}
          onClickFaixa={(faixa) => {
            const titulos = enriched
              .filter(t => t.vencido && t.diasAteVenc != null &&
                Math.abs(t.diasAteVenc) >= faixa.min && Math.abs(t.diasAteVenc) <= faixa.max)
              .sort((a, b) => Math.abs(b.diasAteVenc) - Math.abs(a.diasAteVenc));
            if (titulos.length === 0) return;
            setModalDetalhe({ tipo: 'faixa', titulo: `Vencidos — ${faixa.label}`, titulos });
          }} />
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

      <ModalDetalheTitulos detalhe={modalDetalhe} onClose={() => setModalDetalhe(null)} />
    </div>
  );
}

// ─── Modal de detalhe dos títulos (disparado pelos gráficos) ─────

function ModalDetalheTitulos({ detalhe, onClose }) {
  if (!detalhe) return null;
  const { titulo, titulos, tipo } = detalhe;
  const total = titulos.reduce((s, t) => s + Number(t.valor || 0), 0);
  return (
    <Modal open={!!detalhe} onClose={onClose} title={titulo} size="xl">
      <div>
        {/* Resumo */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
          <p className="text-[12px] text-gray-500">
            {titulos.length} {titulos.length === 1 ? 'título' : 'títulos'}
          </p>
          <p className="text-lg font-bold text-gray-900 font-mono tabular-nums">
            {formatCurrency(total)}
          </p>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100 sticky top-0">
              <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-2">Vencimento</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Fornecedor</th>
                <th className="px-3 py-2">Doc / Motivo</th>
                <th className="px-3 py-2 text-right">Valor</th>
                {tipo === 'faixa' && <th className="px-3 py-2 text-center">Atraso</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {titulos.map((t, i) => (
                <tr key={i} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2 text-[12px] font-mono tabular-nums text-gray-700">
                    {t.vencimento ? formatDataBR(t.vencimento) : '—'}
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    <p className="text-gray-900 truncate max-w-[160px]" title={t.empresaNome}>{t.empresaNome}</p>
                    {t.empresaCnpj && <p className="text-[10px] text-gray-400 font-mono">{t.empresaCnpj}</p>}
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    <p className="text-gray-900 truncate max-w-[180px]" title={t.fornecedorNome}>{t.fornecedorNome}</p>
                  </td>
                  <td className="px-3 py-2 text-[11.5px]">
                    {t.documento && <p className="text-gray-800 font-mono">{t.documento}</p>}
                    {t.motivoNome && <p className="text-gray-500 truncate max-w-[200px]" title={t.motivoNome}>{t.motivoNome}</p>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">
                    {formatCurrency(t.valor)}
                  </td>
                  {tipo === 'faixa' && (
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                        {Math.abs(t.diasAteVenc)}d
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
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
// ─── Gráficos ─────────────────────────────────────────────────

function GraficoProximos7Dias({ dados, onClickDia }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const totalQtd = dados.reduce((s, d) => s + d.qtd, 0);
  const handleBarClick = (data) => {
    if (!onClickDia || !data?.qtd) return;
    onClickDia(data.iso, data.label);
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 flex-shrink-0">
          <Calendar className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">Próximos 7 dias</h3>
          <p className="text-[10.5px] text-gray-400">
            {totalQtd} {totalQtd === 1 ? 'título' : 'títulos'} · {formatCurrency(total)}
          </p>
        </div>
      </div>
      {totalQtd === 0 ? (
        <div className="px-6 py-10 text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Nenhum vencimento nos próximos 7 dias</p>
        </div>
      ) : (
        <div className="p-3" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10.5, fill: '#94a3b8' }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => formatCompact(v)} />
              <Tooltip content={<TooltipDinheiro labelSuffix="vence" qtdLabel="titulos" />} cursor={{ fill: 'rgba(245, 158, 11, 0.06)' }} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]} onClick={handleBarClick}
                style={{ cursor: 'pointer' }}>
                {dados.map((d, i) => (
                  <Cell key={i} fill={d.ehFimSemana ? '#cbd5e1' : '#f59e0b'}
                    cursor={d.qtd > 0 ? 'pointer' : 'default'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {totalQtd > 0 && (
        <p className="px-5 pb-3 text-[10.5px] text-gray-400 italic">Clique em uma barra para ver os títulos do dia</p>
      )}
    </div>
  );
}

function GraficoInadimplencia({ faixas, totalVencido, qtdVencidos, onClickFaixa }) {
  const handleBarClick = (data) => {
    if (!onClickFaixa || !data?.qtd) return;
    onClickFaixa(data);
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 flex-shrink-0">
          <TrendingDown className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">Inadimplência por faixa de atraso</h3>
          <p className="text-[10.5px] text-gray-400">
            {qtdVencidos} {qtdVencidos === 1 ? 'título vencido' : 'títulos vencidos'} · {formatCurrency(totalVencido)}
          </p>
        </div>
      </div>
      {qtdVencidos === 0 ? (
        <div className="px-6 py-10 text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Nenhum título vencido — parabéns!</p>
        </div>
      ) : (
        <div className="p-3" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={faixas} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10.5, fill: '#94a3b8' }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => formatCompact(v)} />
              <Tooltip content={<TooltipDinheiro labelSuffix="" qtdLabel="titulos" />} cursor={{ fill: 'rgba(239, 68, 68, 0.06)' }} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]} onClick={handleBarClick}
                style={{ cursor: 'pointer' }}>
                {faixas.map((f, i) => (
                  <Cell key={i} fill={f.cor} cursor={f.qtd > 0 ? 'pointer' : 'default'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {qtdVencidos > 0 && (
        <p className="px-5 pb-3 text-[10.5px] text-gray-400 italic">Clique em uma barra para ver os títulos da faixa</p>
      )}
    </div>
  );
}

function TooltipDinheiro({ active, payload, label, labelSuffix, qtdLabel }) {
  if (!active || !payload || !payload[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-lg px-3 py-2 text-[12px]">
      <p className="font-semibold text-gray-900">{label} {labelSuffix && <span className="text-gray-500 font-normal">{labelSuffix}</span>}</p>
      <p className="font-mono font-bold text-gray-900 tabular-nums">{formatCurrency(d.valor)}</p>
      <p className="text-[10.5px] text-gray-500">{d.qtd} {d.qtd === 1 ? 'título' : qtdLabel}</p>
    </div>
  );
}

function formatCompact(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function EmpresaMultiSelect({ clientesRede, selecionadas, statsPorEmpresa, onToggle, onToggleTodas }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Limpa a busca ao fechar pra não confundir na próxima abertura
  useEffect(() => { if (!aberto) setBusca(''); }, [aberto]);

  // Filtra por nome ou CNPJ (case-insensitive, ignora máscara de CNPJ)
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return clientesRede;
    const qDig = q.replace(/\D/g, '');
    return clientesRede.filter(c => {
      const nomeOk = (c.nome || '').toLowerCase().includes(q);
      if (nomeOk) return true;
      if (qDig && c.cnpj) return c.cnpj.replace(/\D/g, '').includes(qDig);
      return false;
    });
  }, [clientesRede, busca]);

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
            className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
            {/* Busca */}
            {clientesRede.length > 6 && (
              <div className="px-2.5 pt-2.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou CNPJ..." autoFocus
                    className="w-full h-8 rounded-md border border-gray-200 pl-8 pr-2.5 text-[12px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
              </div>
            )}

            {/* Marcar/Desmarcar todas */}
            <button type="button" onClick={onToggleTodas}
              className="w-full flex items-center gap-2 px-3 py-2 mt-2 border-y border-gray-100 hover:bg-gray-50 transition-colors text-left">
              <input type="checkbox" checked={todasMarcadas}
                onChange={() => {}} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-[12.5px] font-medium text-gray-700">
                {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
              </span>
              <span className="ml-auto text-[10.5px] text-gray-400">
                {selecionadas.size}/{clientesRede.length}
              </span>
            </button>

            {/* Lista */}
            <div className="max-h-72 overflow-y-auto">
              {visiveis.length === 0 ? (
                <p className="px-3 py-6 text-[12px] text-gray-400 text-center">Nenhuma empresa encontrada.</p>
              ) : visiveis.map(emp => {
                const marcada = selecionadas.has(emp.id);
                const stats = statsPorEmpresa?.get(emp.id);
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
                    {/* Contagem só faz sentido pra empresas marcadas (são as carregadas) */}
                    {marcada && stats && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-[11px] font-semibold text-blue-700 tabular-nums">{stats.qtd}</p>
                        <p className="text-[9.5px] text-gray-400 font-mono">
                          {stats.valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      </div>
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
