import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, Search, RefreshCw, ChevronRight, ChevronDown,
  Clock, AlertTriangle, CheckCircle2, Calendar,
  DollarSign, Building2, CreditCard, FileText, Receipt, Wallet, LayoutGrid, MoreHorizontal,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import { useClienteSession } from '../../../hooks/useAuth';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';
import { ehDiaUtil, proximoDiaUtil, isoDate as isoDateUtil, vencimentoEfetivoIso } from '../../../utils/diasUteis';

// ─── Helpers de data ────────────────────────────────────────────
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

// ─── Categorias por código da conta de crédito ─────────────────
// Ordem importa: mais específico primeiro (1.3.03.1 antes de 1.3.03).
// `null` em prefixo = catch-all.
const CATEGORIAS = [
  { key: 'CARTOES',     label: 'Cartões',           prefixo: '1.3.01',   icone: CreditCard,     cor: 'cyan'    },
  { key: 'NOTAS_PRAZO', label: 'Notas a prazo',     prefixo: '1.3.03.1', icone: Receipt,        cor: 'violet'  },
  { key: 'FATURAS',     label: 'Faturas a receber', prefixo: '1.3.03.2', icone: Wallet,         cor: 'indigo'  },
  { key: 'CHEQUES',     label: 'Cheques',           prefixo: '1.3.02',   icone: FileText,       cor: 'teal'    },
  { key: 'OUTROS',      label: 'Outros',            prefixo: null,       icone: MoreHorizontal, cor: 'gray'    },
];

function classificarConta(codigoDebito) {
  if (codigoDebito == null) return 'OUTROS';
  const c = String(codigoDebito);
  for (const cat of CATEGORIAS) {
    if (cat.prefixo && c.startsWith(cat.prefixo)) return cat.key;
  }
  return 'OUTROS';
}

// Classes Tailwind precisam estar declaradas no source para o JIT incluir.
const TAB_CLASSES = {
  emerald: {
    borda: 'border-emerald-600 text-emerald-700',
    badgeAtivo: 'bg-emerald-100 text-emerald-700',
  },
  cyan:    { borda: 'border-cyan-600 text-cyan-700',       badgeAtivo: 'bg-cyan-100 text-cyan-700'       },
  violet:  { borda: 'border-violet-600 text-violet-700',   badgeAtivo: 'bg-violet-100 text-violet-700'   },
  indigo:  { borda: 'border-indigo-600 text-indigo-700',   badgeAtivo: 'bg-indigo-100 text-indigo-700'   },
  teal:    { borda: 'border-teal-600 text-teal-700',       badgeAtivo: 'bg-teal-100 text-teal-700'       },
  gray:    { borda: 'border-gray-600 text-gray-700',       badgeAtivo: 'bg-gray-200 text-gray-700'       },
};

// ─── Cache em memória ───────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cacheContasReceber = { data: null, key: null, timestamp: 0 };
function chaveCache(empresaIds, venctoDe, venctoAte) {
  return `${[...empresaIds].sort().join(',')}|${venctoDe}|${venctoAte}`;
}
function cacheValido(key) {
  return _cacheContasReceber.data
    && _cacheContasReceber.key === key
    && (Date.now() - _cacheContasReceber.timestamp) < CACHE_TTL_MS;
}

// ─── Componente ─────────────────────────────────────────────────
export default function ClienteContasReceber() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);

  const empresasDisponiveis = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  const [empresasSelIds, setEmpresasSelIds] = useState(() =>
    new Set(empresasDisponiveis.map(c => c.id))
  );
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
  const cacheInicial = cacheValido(cacheKeyInicial) ? _cacheContasReceber.data : null;

  const [loading, setLoading] = useState(!cacheInicial);
  const [titulos, setTitulos] = useState(cacheInicial || []);
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('hoje');
  const [filtroCategoria, setFiltroCategoria] = useState('TODAS');
  const [expandedDates, setExpandedDates] = useState(new Set());
  const [expandedClientes, setExpandedClientes] = useState(new Set());
  const [expandedContas, setExpandedContas] = useState(new Set());
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [empresasExpandidas, setEmpresasExpandidas] = useState(new Set());

  // Categorias que ganham o nível "Cliente" extra na hierarquia.
  // Nessas abas, escondemos as colunas Cliente/Conta da tabela porque já
  // aparecem como nós da árvore.
  const CATS_COM_CLIENTE = new Set(['NOTAS_PRAZO', 'FATURAS', 'CHEQUES']);
  const mostraHierarquiaCliente = CATS_COM_CLIENTE.has(filtroCategoria);

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
      setTitulos(_cacheContasReceber.data);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        empresasSel.map(emp =>
          autosystemService.buscarContasReceber(redeId, emp.empresa_codigo, {
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
      if (erros.length > 0 && todos.length === 0) setError(erros.join(' | '));
      else setError(erros.length > 0 ? `Alguns erros: ${erros.join(' | ')}` : null);
      _cacheContasReceber.data = todos;
      _cacheContasReceber.key = key;
      _cacheContasReceber.timestamp = Date.now();
    } catch (err) {
      setError(err.message);
      setTitulos([]);
    } finally {
      setLoading(false);
    }
  }, [redeId, empresasSel, empresasSelIds, venctoDe, venctoAte]);

  useEffect(() => { carregar(); }, [carregar]);

  const enriched = useMemo(() => {
    return (titulos || []).map(t => {
      const venc = dataIso(t.vencto);
      const efet = vencimentoEfetivoIso(venc) || venc;
      const dias = diffDias(efet);
      const valor = toNumber(t.valor);
      // Em partidas dobradas, o direito a receber é o lançamento que
      // DEBITA uma conta 1.3.x → categorizamos e exibimos por `debito_*`.
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
        contaCodigo: t.debito_codigo || '',
        contaNome: t.debito_nome || '',
        clienteNome: t.pessoa_nome || 'Cliente',
        categoria: classificarConta(t.debito_codigo),
        empresaId: t._empresaId,
        empresaNome: t._empresaNome,
        empresaCnpj: t._empresaCnpj,
      };
    });
  }, [titulos]);

  // "Hoje" considera próximo dia útil
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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return enriched.filter(t => {
      if (filtroCategoria !== 'TODAS' && t.categoria !== filtroCategoria) return false;
      if (filtroStatus === 'hoje' && !(t.vencimento && datasHoje.has(t.vencimento))) return false;
      if (filtroStatus === 'vencidos' && !t.vencido) return false;
      if (filtroStatus === 'proximos' && (t.vencido || !t.proximo)) return false;
      if (filtroStatus === 'futuros' && (t.vencido || t.proximo)) return false;
      if (!q) return true;
      return (
        t.clienteNome.toLowerCase().includes(q) ||
        String(t.documento).toLowerCase().includes(q) ||
        t.contaNome.toLowerCase().includes(q) ||
        (t.historico || '').toLowerCase().includes(q)
      );
    });
  }, [enriched, busca, filtroStatus, filtroCategoria, datasHoje]);

  // Cards de resumo — sempre panorama completo (não filtra por aba/status/busca)
  const totais = useMemo(() => {
    const tot = enriched.reduce((s, t) => s + t.valor, 0);
    const vencidos = enriched.filter(t => t.vencido);
    const proximos = enriched.filter(t => !t.vencido && t.proximo);
    const futuros = enriched.filter(t => !t.vencido && !t.proximo);
    const porCat = {};
    const qtdPorCat = {};
    CATEGORIAS.forEach(c => { porCat[c.key] = 0; qtdPorCat[c.key] = 0; });
    enriched.forEach(t => {
      porCat[t.categoria] = (porCat[t.categoria] || 0) + t.valor;
      qtdPorCat[t.categoria] = (qtdPorCat[t.categoria] || 0) + 1;
    });
    return {
      total: tot, qtd: enriched.length,
      vencidos: vencidos.reduce((s, t) => s + t.valor, 0),
      qtdVencidos: vencidos.length,
      proximos: proximos.reduce((s, t) => s + t.valor, 0),
      qtdProximos: proximos.length,
      futuros: futuros.reduce((s, t) => s + t.valor, 0),
      qtdFuturos: futuros.length,
      porCat, qtdPorCat,
    };
  }, [enriched]);

  // Agrupa por data
  const agruparPorData = (lista) => {
    const mapa = new Map();
    lista.forEach(t => {
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
  };

  // Agrupa por cliente (pessoa). Cada cliente carrega seus grupos por data.
  const agruparPorCliente = (lista) => {
    const porCli = new Map();
    lista.forEach(t => {
      const chave = t.clienteNome || 'Cliente';
      if (!porCli.has(chave)) {
        porCli.set(chave, {
          clienteNome: chave,
          itens: [], total: 0, qtd: 0, qtdVencidos: 0,
        });
      }
      const c = porCli.get(chave);
      c.itens.push(t);
      c.total += t.valor;
      c.qtd += 1;
      if (t.vencido) c.qtdVencidos += 1;
    });
    return Array.from(porCli.values())
      .map(c => ({ ...c, grupos: agruparPorData(c.itens) }))
      .sort((a, b) => b.total - a.total);
  };

  // Agrupa por conta (credito_codigo). Conforme o modo:
  //   - comCliente=true → conta.clientes (array)
  //   - comCliente=false → conta.grupos (array de datas)
  const agruparPorConta = (lista, comCliente) => {
    const porConta = new Map();
    lista.forEach(t => {
      const codigo = t.contaCodigo || 'sem-conta';
      if (!porConta.has(codigo)) {
        porConta.set(codigo, {
          contaCodigo: t.contaCodigo || '',
          contaNome: t.contaNome || 'Sem conta',
          itens: [], total: 0, qtd: 0, qtdVencidos: 0,
        });
      }
      const c = porConta.get(codigo);
      c.itens.push(t);
      c.total += t.valor;
      c.qtd += 1;
      if (t.vencido) c.qtdVencidos += 1;
    });
    return Array.from(porConta.values())
      .map(c => comCliente
        ? { ...c, clientes: agruparPorCliente(c.itens), grupos: null }
        : { ...c, clientes: null,                       grupos: agruparPorData(c.itens) })
      .sort((a, b) => (a.contaCodigo || '').localeCompare(b.contaCodigo || ''));
  };

  // Agrupa por categoria. `comCliente` é repassado para o nível conta.
  const agruparPorCategoria = (lista, comCliente) => {
    const porCat = new Map(CATEGORIAS.map(c => [c.key, {
      key: c.key,
      label: c.label,
      icone: c.icone,
      cor: c.cor,
      itens: [], total: 0, qtd: 0, qtdVencidos: 0,
    }]));
    lista.forEach(t => {
      const cat = porCat.get(t.categoria);
      if (!cat) return;
      cat.itens.push(t);
      cat.total += t.valor;
      cat.qtd += 1;
      if (t.vencido) cat.qtdVencidos += 1;
    });
    return Array.from(porCat.values())
      .filter(c => c.qtd > 0)
      .map(cat => ({ ...cat, contas: agruparPorConta(cat.itens, comCliente) }));
  };

  // Single-empresa: Categoria → Conta → [Cliente →] Data → Títulos
  const categoriasSingle = useMemo(
    () => agruparPorCategoria(filtrados, mostraHierarquiaCliente),
    [filtrados, mostraHierarquiaCliente],
  );

  // Multi-empresa: Empresa → Categoria → Data → Títulos
  const empresasComCategorias = useMemo(() => {
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
    return Array.from(porEmp.values())
      .map(e => ({
        ...e,
        categorias: agruparPorCategoria(e.itens, mostraHierarquiaCliente),
        qtd: e.itens.length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtrados, multiEmpresa, mostraHierarquiaCliente]);

  // Quantas datas totais existem (usado nos contadores do footer)
  const totalDatas = useMemo(() => {
    const contarConta = (conta) => conta.clientes
      ? conta.clientes.reduce((s, cli) => s + cli.grupos.length, 0)
      : conta.grupos.length;
    const contarCats = (categorias) => categorias.reduce(
      (s, cat) => s + cat.contas.reduce((s2, conta) => s2 + contarConta(conta), 0),
      0,
    );
    if (multiEmpresa) {
      return empresasComCategorias.reduce((s, e) => s + contarCats(e.categorias), 0);
    }
    return contarCats(categoriasSingle);
  }, [multiEmpresa, empresasComCategorias, categoriasSingle]);

  useEffect(() => {
    setEmpresasExpandidas(new Set());
    setExpandedCats(new Set());
    setExpandedContas(new Set());
    setExpandedClientes(new Set());
    setExpandedDates(new Set());
  }, [filtroStatus, filtroCategoria, multiEmpresa, empresasComCategorias.length, categoriasSingle.length]);

  const toggleDate = (key) => setExpandedDates(prev => toggleSet(prev, key));
  const toggleCliente = (key) => setExpandedClientes(prev => toggleSet(prev, key));
  const toggleConta = (key) => setExpandedContas(prev => toggleSet(prev, key));
  const toggleCat = (key) => setExpandedCats(prev => toggleSet(prev, key));
  const toggleEmpresa = (id) => setEmpresasExpandidas(prev => toggleSet(prev, id));

  const expandirTodos = () => {
    const emps = new Set();
    const cats = new Set();
    const contas = new Set();
    const clientes = new Set();
    const datas = new Set();
    const consumirCategorias = (categorias, empPrefix) => {
      categorias.forEach(cat => {
        const catKey = empPrefix ? `${empPrefix}|${cat.key}` : cat.key;
        cats.add(catKey);
        cat.contas.forEach(conta => {
          const contaKey = `${catKey}|${conta.contaCodigo || 'sem-conta'}`;
          contas.add(contaKey);
          if (conta.clientes) {
            conta.clientes.forEach(cli => {
              const cliKey = `${contaKey}|${cli.clienteNome}`;
              clientes.add(cliKey);
              cli.grupos.forEach(g => datas.add(`${cliKey}|${g.data || 'sem-data'}`));
            });
          } else {
            conta.grupos.forEach(g => datas.add(`${contaKey}|${g.data || 'sem-data'}`));
          }
        });
      });
    };
    if (multiEmpresa) {
      empresasComCategorias.forEach(emp => {
        emps.add(emp.empresaId);
        consumirCategorias(emp.categorias, emp.empresaId);
      });
    } else {
      consumirCategorias(categoriasSingle, null);
    }
    setEmpresasExpandidas(emps);
    setExpandedCats(cats);
    setExpandedContas(contas);
    setExpandedClientes(clientes);
    setExpandedDates(datas);
  };
  const colapsarTodos = () => {
    setExpandedDates(new Set());
    setExpandedClientes(new Set());
    setExpandedContas(new Set());
    setExpandedCats(new Set());
    setEmpresasExpandidas(new Set());
  };

  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Contas a Receber" description="Títulos a receber em aberto" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>
            Sua rede ainda não tem <strong>empresas Autosystem</strong> com <code className="font-mono bg-amber-100 px-1 rounded">empresa_codigo</code> vinculado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Contas a Receber" description="Títulos, duplicatas e cartões em aberto">
        <div className="hidden md:flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <Calendar className="h-3 w-3" /> Vencimento entre
          </span>
          <input type="date" value={venctoDe} onChange={e => setVenctoDe(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
          <span className="text-[10px] text-gray-400">e</span>
          <input type="date" value={venctoAte} onChange={e => setVenctoAte(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
        </div>
        {podeFiltrarEmpresa && (
          <EmpresaMultiSelect
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresasSelIds(prev => toggleSet(prev, id))}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <ResumoCard icon={DollarSign} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label="Total em aberto" valor={formatCurrency(totais.total)}
          sub={`${totais.qtd} ${totais.qtd === 1 ? 'lancamento' : 'lancamentos'}`} highlight />
        <ResumoCard icon={AlertTriangle} iconBg="bg-red-50" iconColor="text-red-600"
          label="Vencidos" valor={formatCurrency(totais.vencidos)}
          sub={`${totais.qtdVencidos} ${totais.qtdVencidos === 1 ? 'lancamento' : 'lancamentos'}`} />
        <ResumoCard icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600"
          label="Próximos 7 dias" valor={formatCurrency(totais.proximos)}
          sub={`${totais.qtdProximos} ${totais.qtdProximos === 1 ? 'lancamento' : 'lancamentos'}`} />
        <ResumoCard icon={Calendar} iconBg="bg-blue-50" iconColor="text-blue-600"
          label="A vencer" valor={formatCurrency(totais.futuros)}
          sub={`${totais.qtdFuturos} ${totais.qtdFuturos === 1 ? 'lancamento' : 'lancamentos'}`} />
      </div>

      {/* Abas por categoria */}
      <div className="bg-white rounded-xl border border-gray-100 dark:border-white/10 mb-4 overflow-hidden">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 dark:border-white/10 overflow-x-auto">
          {[
            { k: 'TODAS', label: 'Visão Geral', icon: LayoutGrid, qtd: totais.qtd, valor: totais.total, cor: 'emerald' },
            ...CATEGORIAS.map(c => ({
              k: c.key, label: c.label, icon: c.icone,
              qtd: totais.qtdPorCat[c.key] || 0,
              valor: totais.porCat[c.key] || 0,
              cor: c.cor,
            })),
          ].map(a => {
            const Icon = a.icon;
            const ativo = filtroCategoria === a.k;
            const pal = TAB_CLASSES[a.cor] || TAB_CLASSES.gray;
            return (
              <button key={a.k} onClick={() => setFiltroCategoria(a.k)}
                className={`flex flex-col items-start gap-0.5 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap min-w-[140px] ${
                  ativo ? pal.borda : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <span className="flex items-center gap-2 w-full">
                  <Icon className="h-4 w-4" />
                  {a.label}
                  <span className={`ml-auto text-[10.5px] px-1.5 py-0.5 rounded-full ${
                    ativo ? pal.badgeAtivo : 'bg-gray-100 text-gray-500'
                  }`}>
                    {a.qtd}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-[12px] font-semibold text-gray-800">
                  {formatCurrency(a.valor)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtros: busca + status */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por cliente, documento ou histórico..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-colors" />
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
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span className="text-sm">Carregando valores pendentes...</span>
        </div>
      ) : error && enriched.length === 0 ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar os títulos</p>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        </div>
      ) : categoriasSingle.length === 0 && !multiEmpresa || (multiEmpresa && empresasComCategorias.length === 0) ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">
            {enriched.length === 0 ? 'Nenhum título pendente' : 'Nenhum título encontrado para o filtro atual'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {enriched.length === 0 ? 'Sem lançamentos no período selecionado' : 'Tente ajustar a busca, a categoria ou o status'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-gray-800">Lançamentos por vencimento</h3>
            <span className="text-[11px] text-gray-400">
              {multiEmpresa
                ? `· ${empresasComCategorias.length} ${empresasComCategorias.length === 1 ? 'empresa' : 'empresas'} · ${filtrados.length} ${filtrados.length === 1 ? 'titulo' : 'titulos'}`
                : `· ${categoriasSingle.length} ${categoriasSingle.length === 1 ? 'categoria' : 'categorias'} · ${filtrados.length} ${filtrados.length === 1 ? 'titulo' : 'titulos'}`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={expandirTodos} className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium transition-colors">Expandir todos</button>
              <span className="text-[11px] text-gray-300">|</span>
              <button onClick={colapsarTodos} className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium transition-colors">Colapsar todos</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">{multiEmpresa ? 'Empresa / Data / Documento' : 'Vencimento / Documento'}</th>
                  <th className="px-3 py-2.5">Status</th>
                  {!mostraHierarquiaCliente && <th className="px-3 py-2.5">Cliente</th>}
                  {!mostraHierarquiaCliente && <th className="px-3 py-2.5">Conta (Débito)</th>}
                  <th className="px-3 py-2.5">Histórico</th>
                  <th className="px-3 py-2.5 text-right">Qtd</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {(() => {
                  const ctx = {
                    colSpan: mostraHierarquiaCliente ? 3 : 5,
                    mostraHierarquiaCliente,
                    expandedCats, toggleCat,
                    expandedContas, toggleConta,
                    expandedClientes, toggleCliente,
                    expandedDates, toggleDate,
                  };
                  return multiEmpresa
                    ? empresasComCategorias.map(emp => {
                        const empAberta = empresasExpandidas.has(emp.empresaId);
                        return (
                          <React.Fragment key={`emp-${emp.empresaId}`}>
                            <tr onClick={() => toggleEmpresa(emp.empresaId)}
                              className={`cursor-pointer transition-colors ${empAberta ? 'bg-emerald-50/40' : 'hover:bg-gray-50/60'}`}>
                              <td className="px-4 py-2.5" colSpan={ctx.colSpan}>
                                <div className="flex items-center gap-2">
                                  <motion.div animate={{ rotate: empAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                    <ChevronRight className="h-4 w-4 text-gray-400" />
                                  </motion.div>
                                  <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                    <Building2 className="h-3.5 w-3.5" />
                                  </div>
                                  <div>
                                    <p className="text-[13px] font-semibold text-gray-900 truncate">{emp.empresaNome}</p>
                                    <p className="text-[10.5px] text-gray-500">
                                      <span className="font-mono">{emp.empresaCnpj || '—'}</span>
                                      {' · '}{emp.categorias.length} {emp.categorias.length === 1 ? 'forma de recebimento' : 'formas de recebimento'}
                                      {emp.qtdVencidos > 0 && <span className="ml-1 text-red-600">· {emp.qtdVencidos} vencido{emp.qtdVencidos === 1 ? '' : 's'}</span>}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">{emp.qtd}</td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[13px] font-bold text-gray-900">
                                {formatCurrency(emp.total)}
                              </td>
                            </tr>
                            {empAberta && emp.categorias.map(cat =>
                              renderCategoriaTree(cat, emp.empresaId, true, ctx)
                            )}
                          </React.Fragment>
                        );
                      })
                    : categoriasSingle.map(cat =>
                        renderCategoriaTree(cat, null, false, ctx)
                      );
                })()}
              </tbody>
              <tfoot className="bg-gray-50/60 dark:bg-white/[0.03] border-t border-gray-100 dark:border-white/10">
                <tr className="text-[12px] font-semibold">
                  <td className="px-4 py-3" colSpan={mostraHierarquiaCliente ? 3 : 5}>
                    Total · {filtrados.length} {filtrados.length === 1 ? 'titulo' : 'titulos'} em {totalDatas} {totalDatas === 1 ? 'data' : 'datas'}
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

// ─── Helpers ────────────────────────────────────────────────────
function toggleSet(prev, key) {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

// Render do nó de categoria (forma de recebimento).
// `ctx` carrega colSpan + maps de expandido/toggle + flag mostraHierarquiaCliente.
function renderCategoriaTree(cat, prefix, empresaIndent, ctx) {
  const key = prefix ? `${prefix}|${cat.key}` : cat.key;
  const aberta = ctx.expandedCats.has(key);
  const Icone = cat.icone;
  const corBg = {
    cyan:    'bg-cyan-50    text-cyan-600',
    violet:  'bg-violet-50  text-violet-600',
    indigo:  'bg-indigo-50  text-indigo-600',
    teal:    'bg-teal-50    text-teal-600',
    gray:    'bg-gray-100   text-gray-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }[cat.cor] || 'bg-gray-100 text-gray-600';
  const indentPL = empresaIndent ? 48 : 16;
  return (
    <React.Fragment key={key}>
      <tr onClick={() => ctx.toggleCat(key)}
        className={`cursor-pointer transition-colors ${aberta ? 'bg-gray-50/80' : 'hover:bg-gray-50/60'}`}>
        <td className="py-2.5" style={{ paddingLeft: indentPL, paddingRight: 12 }} colSpan={ctx.colSpan}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: aberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            </motion.div>
            <div className={`h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 ${corBg}`}>
              <Icone className="h-3 w-3" />
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-gray-800">{cat.label}</p>
              <p className="text-[10.5px] text-gray-400">
                {cat.contas.length} {cat.contas.length === 1 ? 'conta' : 'contas'}
                {cat.qtdVencidos > 0 && <span className="ml-1 text-red-600">· {cat.qtdVencidos} vencido{cat.qtdVencidos === 1 ? '' : 's'}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">{cat.qtd}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">
          {formatCurrency(cat.total)}
        </td>
      </tr>
      {aberta && cat.contas.map(conta =>
        renderContaTree(conta, key, empresaIndent, ctx)
      )}
    </React.Fragment>
  );
}

// Render do nó de conta (credito_codigo + credito_nome).
function renderContaTree(conta, prefix, empresaIndent, ctx) {
  const contaKey = conta.contaCodigo || 'sem-conta';
  const key = `${prefix}|${contaKey}`;
  const aberta = ctx.expandedContas.has(key);
  const indentPL = empresaIndent ? 80 : 48;
  // Subtítulo muda conforme o modo: clientes (abas com cliente) ou datas
  const subLabel = conta.clientes
    ? `${conta.clientes.length} ${conta.clientes.length === 1 ? 'cliente' : 'clientes'}`
    : `${conta.grupos.length} ${conta.grupos.length === 1 ? 'data' : 'datas'}`;
  return (
    <React.Fragment key={key}>
      <tr onClick={() => ctx.toggleConta(key)}
        className={`cursor-pointer transition-colors ${aberta ? 'bg-gray-50/50' : 'hover:bg-gray-50/40'}`}>
        <td className="py-2" style={{ paddingLeft: indentPL, paddingRight: 12 }} colSpan={ctx.colSpan}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: aberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            </motion.div>
            <div>
              <p className="text-[12px] text-gray-800 truncate max-w-[420px]">{conta.contaNome || '—'}</p>
              <p className="text-[10.5px] text-gray-400 font-mono">
                {conta.contaCodigo || '—'}
                {' · '}{subLabel}
                {conta.qtdVencidos > 0 && <span className="ml-1 text-red-600">· {conta.qtdVencidos} vencido{conta.qtdVencidos === 1 ? '' : 's'}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-700">{conta.qtd}</td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-900">
          {formatCurrency(conta.total)}
        </td>
      </tr>
      {aberta && (conta.clientes
        ? conta.clientes.map(cli => renderClienteTree(cli, key, empresaIndent, ctx))
        : conta.grupos.map(g => renderGrupoTree(g, key, empresaIndent, ctx)))}
    </React.Fragment>
  );
}

// Render do nó de cliente (somente nas abas Notas a prazo / Faturas / Cheques).
function renderClienteTree(cli, prefix, empresaIndent, ctx) {
  const key = `${prefix}|${cli.clienteNome}`;
  const aberta = ctx.expandedClientes.has(key);
  const indentPL = empresaIndent ? 112 : 80;
  return (
    <React.Fragment key={key}>
      <tr onClick={() => ctx.toggleCliente(key)}
        className={`cursor-pointer transition-colors ${aberta ? 'bg-gray-50/40' : 'hover:bg-gray-50/30'}`}>
        <td className="py-2" style={{ paddingLeft: indentPL, paddingRight: 12 }} colSpan={ctx.colSpan}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: aberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            </motion.div>
            <div>
              <p className="text-[12px] text-gray-800 truncate max-w-[420px]">{cli.clienteNome}</p>
              <p className="text-[10.5px] text-gray-400">
                {cli.grupos.length} {cli.grupos.length === 1 ? 'data' : 'datas'}
                {cli.qtdVencidos > 0 && <span className="ml-1 text-red-600">· {cli.qtdVencidos} vencido{cli.qtdVencidos === 1 ? '' : 's'}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-700">{cli.qtd}</td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-900">
          {formatCurrency(cli.total)}
        </td>
      </tr>
      {aberta && cli.grupos.map(g => renderGrupoTree(g, key, empresaIndent, ctx))}
    </React.Fragment>
  );
}

function renderGrupoTree(g, prefix, empresaIndent, ctx) {
  const dataKey = g.data || 'sem-data';
  const key = prefix ? `${prefix}|${dataKey}` : dataKey;
  const aberto = ctx.expandedDates.has(key);
  const efet = vencimentoEfetivoIso(g.data) || g.data;
  const rolou = g.data && efet && g.data !== efet;
  const statusCfg = g.vencido
    ? { bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-200',
        label: g.diasAteVenc !== null ? `Vencido há ${Math.abs(g.diasAteVenc)}d` : 'Vencido',
        bar: 'bg-red-500' }
    : g.proximo
    ? { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',
        label: g.diasAteVenc === 0 ? 'Vence hoje' : `Vence em ${g.diasAteVenc}d`,
        bar: 'bg-amber-500' }
    : { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200',
        label: g.diasAteVenc !== null ? `Em ${g.diasAteVenc}d` : '—',
        bar: 'bg-emerald-500' };
  // empresaIndent adiciona um nível extra (multi-empresa);
  // mostraHierarquiaCliente adiciona o nível de cliente entre conta e data.
  const extraCliente = ctx.mostraHierarquiaCliente ? 32 : 0;
  const indentDataPL = (empresaIndent ? 112 : 80) + extraCliente;
  const indentItemPL = (empresaIndent ? 152 : 120) + extraCliente;
  return (
    <React.Fragment key={key}>
      <tr onClick={() => ctx.toggleDate(key)}
        className={`cursor-pointer transition-colors ${aberto ? 'bg-emerald-50/30' : 'hover:bg-gray-50/60'}`}>
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
                {rolou && <span className="ml-1 text-amber-600">→ recebe em {formatDataBR(efet)}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.bg} ${statusCfg.text} ring-1 ${statusCfg.ring}`}>
            {statusCfg.label}
          </span>
        </td>
        {!ctx.mostraHierarquiaCliente && <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>}
        {!ctx.mostraHierarquiaCliente && <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>}
        <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">
          {g.itens.length}
        </td>
        <td className={`px-3 py-2.5 text-right font-mono tabular-nums text-[12.5px] font-semibold ${g.vencido ? 'text-red-700' : 'text-gray-900'}`}>
          {formatCurrency(g.total)}
        </td>
      </tr>
      {aberto && g.itens.map((t, i) => (
        <tr key={`${key}-${t.documento}-${i}`} className="bg-gray-50/30 hover:bg-gray-50/60">
          <td className="py-1.5" style={{ paddingLeft: indentItemPL, paddingRight: 12 }}>
            <span className="font-mono tabular-nums text-[11.5px] text-gray-700">
              {t.documento || `#${i + 1}`}
            </span>
          </td>
          <td className="px-3 py-1.5" />
          {!ctx.mostraHierarquiaCliente && (
            <td className="px-3 py-1.5 truncate max-w-[240px]">
              <p className="text-[11.5px] text-gray-800 truncate">{t.clienteNome}</p>
            </td>
          )}
          {!ctx.mostraHierarquiaCliente && (
            <td className="px-3 py-1.5">
              <p className="text-[11px] text-gray-700 truncate max-w-[200px]">{t.contaNome || '—'}</p>
              {t.contaCodigo && <p className="text-[10px] text-gray-400 font-mono">{t.contaCodigo}</p>}
            </td>
          )}
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
    <div className={`bg-white rounded-xl border p-5 ${highlight ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white' : 'border-gray-100'}`}>
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
            aberto ? 'border-emerald-400 ring-2 ring-emerald-100 text-gray-800' : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'
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
                onChange={() => {}} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
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
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 mt-0.5" />
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
