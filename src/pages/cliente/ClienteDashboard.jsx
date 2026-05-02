import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import {
  AlertCircle, CheckCircle2, Coins, FileSpreadsheet, ListTodo,
  ChevronRight, Calendar, Clock, User, Zap,
  ShoppingCart, ArrowUpRight, ArrowDownLeft,
  TrendingUp, TrendingDown, Loader2,
  ScrollText, Landmark, CreditCard, FileCheck, MoreHorizontal,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { CardSkeleton } from '../../components/ui/LoadingSkeleton';
import BarraProgressoFetch from '../../components/ui/BarraProgressoFetch';
import { useSimulatedLoading } from '../../hooks/useSimulatedLoading';
import { useClienteSession } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import * as tarefasService from '../../services/clienteTarefasService';
import * as mapService from '../../services/mapeamentoService';
import * as qualityApi from '../../services/qualityApiService';
import { agregarVendasItens } from '../../services/mapeamentoVendasService';
import { formatCurrency } from '../../utils/format';
import { ehDiaUtil, proximoDiaUtil, isoDate as isoDateUtil } from '../../utils/diasUteis';

// ─── Helpers de data ────────────────────────────────────────────
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Dias uteis (seg-sex) do mes atual ate ontem
function diasUteisDoMesAteOntem() {
  const hoje = new Date();
  const dias = [];
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  for (let d = 1; d <= ontem.getDate(); d++) {
    const dt = new Date(ano, mes, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    dias.push(`${yy}-${mm}-${dd}`);
  }
  return dias;
}

function formatDataBR(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

function diaSemana(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dt.getDay()];
}

const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

function extrairValor(t) {
  return toNumber(
    t.valorSaldo ?? t.saldo ?? t.valorAberto ?? t.valorPendente ??
    t.valor ?? t.valorTitulo ?? t.valorOriginal ?? t.valorLiquido
  );
}

function extrairVencimento(t) {
  const raw = t.dataVencimento || t.vencimento || t.dataVenc || t.data_vencimento ||
    t.dataCredito || t.dataPrevisao || t.dataPrevisaoCredito ||
    t.dataBomPara || t.dataDeposito || t.dataCompensacao || null;
  return raw ? String(raw).slice(0, 10) : null;
}

function extrairFornecedorNome(t) {
  return t.fornecedorNome || t.fornecedor || t.nomeFornecedor || t.razao || t.razaoSocial || t.fantasia || 'Fornecedor';
}

function extrairClienteNome(t) {
  return t.clienteNome || t.cliente || t.nomeCliente || t.razao || t.razaoSocial || t.fantasia || 'Cliente';
}

function diffDias(dataIso) {
  if (!dataIso) return null;
  const [y, m, d] = String(dataIso).slice(0, 10).split('-');
  if (!y || !m || !d) return null;
  const alvo = new Date(+y, +m - 1, +d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}

// ─── Cache em memoria do Dashboard ──────────────────────────────
// Evita refetch quando o usuario navega para outra pagina e volta
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cacheDashboard = { quality: null }; // { data, timestamp, key }

export default function ClienteDashboard() {
  const loading = useSimulatedLoading(400);
  const session = useClienteSession();
  const cliente = session?.cliente;
  const usuario = session?.usuario;
  const primeiroNome = (usuario?.nome || cliente?.contato_nome || 'Cliente').split(' ')[0];

  const temAcessoTotal = !!usuario?.permissoes?.includes('gerenciar_usuarios');
  const meuNome = (usuario?.nome || '').trim().toLowerCase();
  const chaveApiSessao = session?.chaveApi;

  // ─── Pendencias (sangrias / extratos / tarefas) ─────────────
  const [pendencias, setPendencias] = useState({ sangrias: [], extratos: [], tarefas: [] });
  const [loadingPend, setLoadingPend] = useState(true);

  useEffect(() => {
    if (!cliente?.id) return;
    (async () => {
      try {
        setLoadingPend(true);
        const diasUteis = diasUteisDoMesAteOntem();
        if (diasUteis.length === 0) {
          setPendencias({ sangrias: [], extratos: [], tarefas: [] });
          return;
        }
        const mesInicio = diasUteis[0];
        const mesFim = diasUteis[diasUteis.length - 1];

        const [{ data: fechs }, { data: exts }] = await Promise.all([
          supabase.from('cliente_sangrias_fechamento')
            .select('data')
            .eq('cliente_id', cliente.id)
            .gte('data', mesInicio).lte('data', mesFim),
          supabase.from('extratos_bancarios')
            .select('data_inicial, data_final')
            .eq('cliente_id', cliente.id)
            .gte('data_final', mesInicio).lte('data_inicial', mesFim),
        ]);

        const diasFechados = new Set((fechs || []).map(r => r.data));
        const diasComExtrato = new Set();
        (exts || []).forEach(e => {
          const ini = new Date(e.data_inicial + 'T00:00:00');
          const fim = new Date(e.data_final + 'T00:00:00');
          for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
            const yy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            diasComExtrato.add(`${yy}-${mm}-${dd}`);
          }
        });

        const sangriasPendentes = diasUteis.filter(d => !diasFechados.has(d));
        const extratosPendentes = diasUteis.filter(d => !diasComExtrato.has(d));

        let tarefasPend = [];
        if (chaveApiSessao?.id) {
          try {
            const todas = await tarefasService.listar(chaveApiSessao.id);
            tarefasPend = todas.filter(t => t.status === 'pendente' || t.status === 'em_andamento');
            if (!temAcessoTotal) {
              tarefasPend = tarefasPend.filter(t =>
                (t.responsavel || '').trim().toLowerCase() === meuNome
              );
            }
          } catch (_) { /* noop */ }
        }

        setPendencias({
          sangrias: sangriasPendentes,
          extratos: extratosPendentes,
          tarefas: tarefasPend,
        });
      } finally { setLoadingPend(false); }
    })();
  }, [cliente?.id, chaveApiSessao?.id, temAcessoTotal, meuNome]);

  // ─── Dados Quality (vendas + a pagar + a receber) ──────────
  const [dadosQuality, setDadosQuality] = useState(() => {
    const c = _cacheDashboard.quality;
    return c?.data || { vendas: [], vendaItens: [], produtosMap: new Map(), gruposMap: new Map(), pagar: [], receber: [] };
  });
  const [loadingQuality, setLoadingQuality] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });

  const carregarQuality = useCallback(async () => {
    if (!cliente?.chave_api_id || !cliente?.empresa_codigo) return;
    const cacheKey = `${cliente.chave_api_id}|${cliente.empresa_codigo}`;
    const c = _cacheDashboard.quality;
    if (c && c.key === cacheKey && (Date.now() - c.timestamp) < CACHE_TTL_MS) {
      setDadosQuality(c.data);
      return;
    }
    setLoadingQuality(true);
    // 9 tarefas: 7 endpoints da empresa + 2 catalogos compartilhados
    const totalTarefas = 9;
    setProgresso({ feitos: 0, total: totalTarefas });
    const tick = () => setProgresso(p => ({ ...p, feitos: p.feitos + 1 }));
    const tarefa = (p) => p.finally(tick);
    try {
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(ch => ch.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API não encontrada');
      const apiKey = chave.chave;

      // Vendas: ultimos 14 dias para o chart + dia atual no card
      const hoje = new Date();
      const ha14d = new Date(hoje); ha14d.setDate(hoje.getDate() - 13);
      const filtrosVendas = {
        empresaCodigo: cliente.empresa_codigo,
        dataInicial: isoDate(ha14d),
        dataFinal: isoDate(hoje),
        situacao: 'A',
      };
      // Contas: vencimentos -30d a +30d (cobre vencidos recentes + proximos)
      const ha30d = new Date(hoje); ha30d.setDate(hoje.getDate() - 30);
      const em30d = new Date(hoje); em30d.setDate(hoje.getDate() + 30);
      const filtrosContas30 = {
        empresaCodigo: cliente.empresa_codigo,
        dataInicial: isoDate(ha30d),
        dataFinal: isoDate(em30d),
        apenasPendente: true,
      };

      const [vendas, vendaItens, pagar, receber, duplicatas, cartoes, cheques, produtos, grupos] = await Promise.all([
        tarefa(qualityApi.buscarVendas(apiKey, filtrosVendas).catch(() => [])),
        tarefa(qualityApi.buscarVendaItens(apiKey, filtrosVendas).catch(() => [])),
        tarefa(qualityApi.buscarTitulosPagar(apiKey, filtrosContas30).catch(() => [])),
        tarefa(qualityApi.buscarTitulosReceber(apiKey, filtrosContas30).catch(() => [])),
        tarefa(qualityApi.buscarDuplicatas(apiKey, filtrosContas30).catch(() => [])),
        tarefa(qualityApi.buscarCartoes(apiKey, filtrosContas30).catch(() => [])),
        tarefa(qualityApi.buscarCheques(apiKey, filtrosContas30).catch(() => [])),
        tarefa(qualityApi.buscarProdutos(apiKey).catch(() => [])),
        tarefa(qualityApi.buscarGrupos(apiKey).catch(() => [])),
      ]);

      const produtosMap = new Map();
      (produtos || []).forEach(p => {
        const cod = p.produtoCodigo ?? p.codigo;
        if (cod != null) {
          produtosMap.set(Number(cod), p);
          produtosMap.set(String(cod), p);
        }
      });
      const gruposMap = new Map();
      (grupos || []).forEach(g => {
        const cod = g.grupoCodigo ?? g.codigo;
        if (cod != null) gruposMap.set(Number(cod), g);
      });

      const tag = (arr, fonte) => (arr || []).map(r => ({ fonte, raw: r }));
      const novoDado = {
        vendas: vendas || [],
        vendaItens: vendaItens || [],
        produtosMap,
        gruposMap,
        pagar: tag(pagar, 'titulo').map(t => ({ ...t, raw: t.raw })),
        receber: [
          ...tag(receber, 'titulo'),
          ...tag(duplicatas, 'duplicata'),
          ...tag(cartoes, 'cartao'),
          ...tag(cheques, 'cheque'),
        ],
      };
      setDadosQuality(novoDado);
      _cacheDashboard.quality = { data: novoDado, timestamp: Date.now(), key: cacheKey };
    } catch (err) {
      console.warn('[Dashboard] Falha ao carregar Quality:', err);
    } finally {
      setLoadingQuality(false);
    }
  }, [cliente?.chave_api_id, cliente?.empresa_codigo]);

  useEffect(() => { carregarQuality(); }, [carregarQuality]);

  // ─── Stats (calculados a partir de dadosQuality) ────────────
  const stats = useMemo(() => {
    if (!dadosQuality.vendas) return null;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeIso = isoDate(hoje);
    const hojeEhDiaUtil = ehDiaUtil(hoje);

    // ── Vendas: dia atual
    const vendasHoje = (dadosQuality.vendas || []).filter(v => {
      const d = String(v.dataHora || v.dataVenda || v.dataEmissao || v.data || '').slice(0, 10);
      return d === hojeIso;
    });
    const receitaGeralHoje = vendasHoje.reduce((s, v) => s + toNumber(v.totalVenda), 0);
    const qtdVendasHoje = vendasHoje.length;

    // CMV/margem do dia (a partir dos itens classificados)
    const vendasMap = new Map();
    (dadosQuality.vendas || []).forEach(v => {
      const cod = v.vendaCodigo ?? v.codigo;
      if (cod != null) vendasMap.set(cod, v);
    });
    const itensHoje = (dadosQuality.vendaItens || []).filter(it => {
      const venda = vendasMap.get(it.vendaCodigo);
      const d = String(venda?.dataHora || venda?.dataVenda || '').slice(0, 10);
      return d === hojeIso;
    });
    const totaisHoje = agregarVendasItens(itensHoje, vendasMap, dadosQuality.produtosMap, dadosQuality.gruposMap);
    const cmvGeralHoje = totaisHoje.cmv_combustivel + totaisHoje.cmv_automotivos + totaisHoje.cmv_conveniencia;
    const margemHoje = receitaGeralHoje > 0 ? ((receitaGeralHoje - cmvGeralHoje) / receitaGeralHoje) * 100 : 0;

    // Chart 14 dias: agrupa vendas por dia
    const porDiaVenda = new Map();
    (dadosQuality.vendas || []).forEach(v => {
      const d = String(v.dataHora || v.dataVenda || '').slice(0, 10);
      if (!d) return;
      porDiaVenda.set(d, (porDiaVenda.get(d) || 0) + toNumber(v.totalVenda));
    });
    const dadosChart = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(hoje); dt.setDate(hoje.getDate() - i);
      const di = isoDate(dt);
      dadosChart.push({
        data: di,
        label: `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`,
        valor: Number((porDiaVenda.get(di) || 0).toFixed(2)),
        ehHoje: di === hojeIso,
      });
    }

    // ── Contas a pagar (mesmas semanticas do dashboard antigo)
    const pagarEnriched = (dadosQuality.pagar || []).map(item => {
      const t = item.raw || item;
      const venc = extrairVencimento(t);
      const dias = diffDias(venc);
      return {
        fornecedor: extrairFornecedorNome(t),
        vencimento: venc,
        diasAteVenc: dias,
        saldo: extrairValor(t),
        vencido: dias !== null && dias < 0,
      };
    });
    const pagarTotal = pagarEnriched.reduce((s, t) => s + t.saldo, 0);
    const pagarVencidos = pagarEnriched.filter(t => t.vencido);
    const pagarVencidosTotal = pagarVencidos.reduce((s, t) => s + t.saldo, 0);

    // "A pagar hoje" — antecipa para proximo dia util quando hoje nao e util
    const diaPagarAlvo = proximoDiaUtil(hoje);
    const datasPagarAlvo = new Set();
    datasPagarAlvo.add(isoDate(diaPagarAlvo));
    {
      const cur = new Date(diaPagarAlvo);
      cur.setDate(cur.getDate() - 1);
      while (!ehDiaUtil(cur)) {
        datasPagarAlvo.add(isoDate(cur));
        cur.setDate(cur.getDate() - 1);
      }
    }
    const pagarHojeItens = pagarEnriched.filter(t =>
      t.vencimento && datasPagarAlvo.has(t.vencimento)
    );
    const pagarHojeValor = pagarHojeItens.reduce((s, t) => s + t.saldo, 0);
    const pagarHojeAntecipado = !hojeEhDiaUtil;
    const pagarHojeDataAlvo = isoDate(diaPagarAlvo);

    // Top 5 proximas a pagar — apenas nao vencidas, ordenadas por data
    const pagarTop = pagarEnriched
      .filter(t => t.diasAteVenc != null && !t.vencido)
      .sort((a, b) => {
        if (a.diasAteVenc === b.diasAteVenc) return b.saldo - a.saldo;
        return a.diasAteVenc - b.diasAteVenc;
      })
      .slice(0, 5);

    // ── Contas a receber
    const receberEnriched = (dadosQuality.receber || []).map(item => {
      const t = item.raw;
      const venc = extrairVencimento(t);
      const dias = diffDias(venc);
      return {
        fonte: item.fonte,
        cliente: extrairClienteNome(t),
        vencimento: venc,
        diasAteVenc: dias,
        saldo: extrairValor(t),
        vencido: dias !== null && dias < 0,
      };
    });
    const receberTotal = receberEnriched.reduce((s, t) => s + t.saldo, 0);
    const receberVencidos = receberEnriched.filter(t => t.vencido);
    const receberVencidosTotal = receberVencidos.reduce((s, t) => s + t.saldo, 0);

    const diaReceberAlvo = proximoDiaUtil(hoje);
    const datasReceberAlvo = new Set();
    datasReceberAlvo.add(isoDate(diaReceberAlvo));
    {
      const cur = new Date(diaReceberAlvo);
      cur.setDate(cur.getDate() - 1);
      while (!ehDiaUtil(cur)) {
        datasReceberAlvo.add(isoDate(cur));
        cur.setDate(cur.getDate() - 1);
      }
    }
    const receberHojeItens = receberEnriched.filter(t =>
      t.vencimento && datasReceberAlvo.has(t.vencimento)
    );
    const receberHojeValor = receberHojeItens.reduce((s, t) => s + t.saldo, 0);
    const receberHojeAntecipado = !hojeEhDiaUtil;
    const receberHojeDataAlvo = isoDate(diaReceberAlvo);

    const FONTES_CONHECIDAS = new Set(['titulo', 'duplicata', 'cartao', 'cheque']);
    const receberPorFonte = { titulo: 0, duplicata: 0, cartao: 0, cheque: 0, outros: 0 };
    const receberQtdPorFonte = { titulo: 0, duplicata: 0, cartao: 0, cheque: 0, outros: 0 };
    receberEnriched.forEach(t => {
      const k = FONTES_CONHECIDAS.has(t.fonte) ? t.fonte : 'outros';
      receberPorFonte[k] += t.saldo;
      receberQtdPorFonte[k] += 1;
    });

    return {
      hojeEhDiaUtil,
      receitaGeralHoje, cmvGeralHoje, margemHoje, qtdVendasHoje,
      dadosChart,
      pagarTotal, pagarVencidosQtd: pagarVencidos.length, pagarVencidosTotal,
      pagarHojeValor, pagarHojeQtd: pagarHojeItens.length,
      pagarHojeAntecipado, pagarHojeDataAlvo, pagarTop,
      receberTotal, receberVencidosQtd: receberVencidos.length, receberVencidosTotal,
      receberHojeValor, receberHojeQtd: receberHojeItens.length,
      receberHojeAntecipado, receberHojeDataAlvo,
      receberPorFonte, receberQtdPorFonte,
    };
  }, [dadosQuality]);

  const totalPendencias = pendencias.sangrias.length + pendencias.extratos.length + pendencias.tarefas.length;
  const titulo = `Olá, ${primeiroNome}`;

  if (loading || loadingPend) {
    return (
      <div>
        <PageHeader title={titulo} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={titulo} />

      {/* Barra de progresso da busca de dados Quality */}
      <BarraProgressoFetch
        loading={loadingQuality}
        feitos={progresso.feitos}
        total={progresso.total}
      />

      {/* KPIs Quality (vendas/pagar/receber hoje) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <KpiCard
          icon={ShoppingCart} cor="emerald"
          label="Vendas hoje"
          valor={stats ? formatCurrency(stats.receitaGeralHoje) : '...'}
          sub={stats
            ? (stats.qtdVendasHoje > 0
                ? `${stats.qtdVendasHoje} ${stats.qtdVendasHoje === 1 ? 'venda' : 'vendas'}`
                : 'sem vendas registradas')
            : 'carregando...'}
          badge={stats && stats.receitaGeralHoje > 0 ? `Margem ${stats.margemHoje.toFixed(1)}%` : null}
          loading={loadingQuality && !stats}
        />
        <KpiCard
          icon={ArrowUpRight} cor="amber"
          label={stats?.pagarHojeAntecipado ? 'A pagar (próximo dia útil)' : 'A pagar hoje'}
          valor={stats ? formatCurrency(stats.pagarHojeValor) : '...'}
          sub={stats
            ? (stats.pagarHojeAntecipado
                ? (stats.pagarHojeQtd > 0
                    ? `${stats.pagarHojeQtd} ${stats.pagarHojeQtd === 1 ? 'lançamento' : 'lançamentos'} em ${formatDataBR(stats.pagarHojeDataAlvo)}`
                    : `previsto para ${formatDataBR(stats.pagarHojeDataAlvo)}`)
                : (stats.pagarHojeQtd > 0
                    ? `${stats.pagarHojeQtd} ${stats.pagarHojeQtd === 1 ? 'lançamento' : 'lançamentos'} vence hoje`
                    : 'nenhum vencimento hoje'))
            : 'carregando...'}
          loading={loadingQuality && !stats}
        />
        <KpiCard
          icon={ArrowDownLeft} cor="blue"
          label={stats?.receberHojeAntecipado ? 'A receber (próximo dia útil)' : 'A receber hoje'}
          valor={stats ? formatCurrency(stats.receberHojeValor) : '...'}
          sub={stats
            ? (stats.receberHojeAntecipado
                ? (stats.receberHojeQtd > 0
                    ? `${stats.receberHojeQtd} ${stats.receberHojeQtd === 1 ? 'lançamento' : 'lançamentos'} em ${formatDataBR(stats.receberHojeDataAlvo)}`
                    : `previsto para ${formatDataBR(stats.receberHojeDataAlvo)}`)
                : (stats.receberHojeQtd > 0
                    ? `${stats.receberHojeQtd} ${stats.receberHojeQtd === 1 ? 'lançamento' : 'lançamentos'} vence hoje`
                    : 'nenhum vencimento hoje'))
            : 'carregando...'}
          loading={loadingQuality && !stats}
        />
      </div>

      {/* Vendas chart 14 dias */}
      <VendasChart stats={stats} loading={loadingQuality && !stats} />

      {/* Próximas a pagar / Agrupamento receber */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
        <ProximasContasCard
          titulo="Próximas a pagar"
          icon={ArrowUpRight}
          cor="amber"
          itens={stats?.pagarTop || []}
          loading={loadingQuality && !stats}
          link="/cliente/financeiro/contas-pagar"
          campoNome="fornecedor"
        />
        <AgrupamentoReceberCard
          porFonte={stats?.receberPorFonte}
          qtdPorFonte={stats?.receberQtdPorFonte}
          total={stats?.receberTotal || 0}
          loading={loadingQuality && !stats}
          link="/cliente/financeiro/contas-receber"
        />
      </div>

      {/* Pendencias (existente) */}
      {totalPendencias === 0 ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-emerald-200/60 dark:bg-emerald-500/10 p-6 flex items-center gap-4 shadow-sm">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20 flex-shrink-0">
            <CheckCircle2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Tudo em dia!</p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Nenhuma tarefa pendente para este mês
              {!temAcessoTotal && ' atribuída a você'}.
            </p>
          </div>
        </motion.div>
      ) : (
        <>
          {/* Resumo das pendencias */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <ResumoCard
              icon={Coins} cor="amber"
              label="Sangrias pendentes" valor={pendencias.sangrias.length}
              sub={pendencias.sangrias.length === 0 ? 'Nenhuma pendente' : 'dias úteis sem fechamento'}
            />
            <ResumoCard
              icon={FileSpreadsheet} cor="blue"
              label="Extratos pendentes" valor={pendencias.extratos.length}
              sub={pendencias.extratos.length === 0 ? 'Nenhum pendente' : 'dias úteis sem extrato'}
            />
            <ResumoCard
              icon={ListTodo} cor="indigo"
              label="Tarefas em aberto" valor={pendencias.tarefas.length}
              sub={temAcessoTotal ? 'da rede toda' : 'atribuídas a você'}
            />
          </div>

          {/* Detalhes */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
            <DiasPendentesCard
              titulo="Sangrias do mês não enviadas"
              icon={Coins}
              cor="amber"
              dias={pendencias.sangrias}
              linkLabel="Enviar sangrias"
              link="/cliente/sangrias"
            />
            <DiasPendentesCard
              titulo="Extratos bancários não enviados"
              icon={FileSpreadsheet}
              cor="blue"
              dias={pendencias.extratos}
              linkLabel="Enviar extratos"
              link="/cliente/documentos"
            />
          </div>

          {pendencias.tarefas.length > 0 && (
            <TarefasCard tarefas={pendencias.tarefas} temAcessoTotal={temAcessoTotal} />
          )}
        </>
      )}
    </div>
  );
}

// ─── KPI card (Quality) ──────────────────────────────────────────
function KpiCard({ icon: Icon, cor, label, valor, sub, badge, loading }) {
  const cores = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', iconBg: 'bg-emerald-100' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   iconBg: 'bg-amber-100' },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    iconBg: 'bg-blue-100' },
  };
  const c = cores[cor] || cores.blue;
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <div className={`h-8 w-8 rounded-md flex items-center justify-center border ${c.bg} ${c.border}`}>
          <Icon className={`h-4 w-4 ${c.text}`} />
        </div>
      </div>
      {loading ? (
        <div className="h-7 w-32 bg-gray-100 rounded animate-pulse" />
      ) : (
        <p className={`text-2xl font-bold tabular-nums ${c.text}`}>{valor}</p>
      )}
      <div className="flex items-center justify-between mt-1">
        <p className="text-[11px] text-gray-500">{sub}</p>
        {badge && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.iconBg} ${c.text}`}>
            {badge}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Vendas chart 14 dias ────────────────────────────────────────
function VendasChart({ stats, loading }) {
  if (loading || !stats) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-800 mb-3">Vendas dos últimos 14 dias</p>
        <div className="h-48 bg-gray-50 rounded animate-pulse" />
      </div>
    );
  }
  const dados = stats.dadosChart || [];
  if (dados.every(d => d.valor === 0)) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200/60 p-5 mb-5 shadow-sm">
      <p className="text-sm font-semibold text-gray-800 mb-3">Vendas dos últimos 14 dias</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip
              cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
              formatter={(v) => [formatCurrency(v), 'Vendas']}
            />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
              {dados.map((d, i) => (
                <Cell key={i} fill={d.ehHoje ? '#10b981' : '#a7f3d0'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

// ─── Próximas contas (a pagar) ───────────────────────────────────
function ProximasContasCard({ titulo, icon: Icon, cor, itens, loading, link, campoNome }) {
  const cores = {
    amber: { bgGrad: 'from-amber-400 to-orange-500', linkBg: 'bg-amber-600 hover:bg-amber-700' },
    blue:  { bgGrad: 'from-blue-500 to-indigo-600',  linkBg: 'bg-blue-600 hover:bg-blue-700' },
  };
  const c = cores[cor] || cores.blue;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${c.bgGrad} flex items-center justify-center shadow-sm flex-shrink-0`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{titulo}</p>
          <p className="text-[11px] text-gray-500">
            {loading ? 'carregando...' : 'top 5 por data de vencimento'}
          </p>
        </div>
        <Link to={link}
          className={`inline-flex items-center gap-1 rounded-lg ${c.linkBg} text-white px-3 py-1.5 text-xs font-medium transition-colors`}>
          Ver tudo <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {loading ? (
        <div className="px-5 py-6 space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-50 rounded animate-pulse" />)}
        </div>
      ) : itens.length === 0 ? (
        <div className="px-5 py-10 text-center flex-1 flex flex-col items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-400 mb-2" />
          <p className="text-xs text-gray-500">Nenhuma pendência próxima</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2">Vencimento</th>
                <th className="px-4 py-2">{campoNome === 'fornecedor' ? 'Fornecedor' : 'Cliente'}</th>
                <th className="px-4 py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itens.map((t, i) => {
                const venc = t.diasAteVenc;
                const dotCor = t.vencido ? 'bg-red-500' : venc === 0 ? 'bg-amber-500' : 'bg-emerald-500';
                const labelDias = venc < 0 ? `${Math.abs(venc)}d atrás`
                  : venc === 0 ? 'hoje'
                  : `em ${venc}d`;
                return (
                  <tr key={i} className="hover:bg-gray-50/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${dotCor} flex-shrink-0`} />
                        <span className="text-[12.5px] font-mono tabular-nums text-gray-800">
                          {formatDataBR(t.vencimento)}
                        </span>
                        <span className={`text-[10px] ${t.vencido ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                          {labelDias}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-[12.5px] text-gray-800 truncate max-w-[260px]">{t[campoNome]}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900 whitespace-nowrap">
                      {formatCurrency(t.saldo)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

// ─── Agrupamento "A receber" por fonte ───────────────────────────
function AgrupamentoReceberCard({ porFonte, qtdPorFonte, total, loading, link }) {
  const fontes = [
    { k: 'titulo',    label: 'Títulos',    icon: ScrollText,      iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600', barCor: 'bg-indigo-500' },
    { k: 'duplicata', label: 'Duplicatas', icon: Landmark,        iconBg: 'bg-violet-50', iconColor: 'text-violet-600', barCor: 'bg-violet-500' },
    { k: 'cartao',    label: 'Cartões',    icon: CreditCard,      iconBg: 'bg-cyan-50',   iconColor: 'text-cyan-600',   barCor: 'bg-cyan-500'   },
    { k: 'cheque',    label: 'Cheques',    icon: FileCheck,       iconBg: 'bg-teal-50',   iconColor: 'text-teal-600',   barCor: 'bg-teal-500'   },
    { k: 'outros',    label: 'Outros',     icon: MoreHorizontal,  iconBg: 'bg-gray-50',   iconColor: 'text-gray-500',   barCor: 'bg-gray-400'   },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
          <ArrowDownLeft className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">A receber por tipo</p>
          <p className="text-[11px] text-gray-500">
            {loading ? 'carregando...' : 'distribuição por forma de recebimento'}
          </p>
        </div>
        <Link to={link}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-medium transition-colors">
          Ver tudo <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {loading ? (
        <div className="px-5 py-6 space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-gray-50 rounded animate-pulse" />)}
        </div>
      ) : !porFonte || total === 0 ? (
        <div className="px-5 py-10 text-center flex-1 flex flex-col items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-400 mb-2" />
          <p className="text-xs text-gray-500">Nenhum valor a receber</p>
        </div>
      ) : (
        <div className="px-5 py-3">
          <div className="space-y-2.5">
            {fontes.map(f => {
              const valor = porFonte[f.k] || 0;
              const qtd = qtdPorFonte?.[f.k] || 0;
              const pct = total > 0 ? (valor / total) * 100 : 0;
              const Icon = f.icon;
              return (
                <div key={f.k}>
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`h-7 w-7 rounded-lg ${f.iconBg} ${f.iconColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-[12.5px] font-medium text-gray-800 flex-1">{f.label}</p>
                    <span className="text-[10.5px] text-gray-400 tabular-nums">
                      {qtd} {qtd === 1 ? 'lanç.' : 'lançs.'}
                    </span>
                    <span className="text-[12.5px] font-semibold tabular-nums text-gray-900 whitespace-nowrap min-w-[90px] text-right">
                      {formatCurrency(valor)}
                    </span>
                  </div>
                  <div className="ml-10 h-1 rounded-full bg-gray-100 overflow-hidden">
                    <motion.div className={`h-full ${f.barCor}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="ml-10 mt-0.5 text-[10px] text-gray-400 tabular-nums">
                    {pct.toFixed(1)}% do total
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Total em aberto</p>
            <p className="text-sm font-bold tabular-nums text-gray-900">{formatCurrency(total)}</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Resumo card (pendências) ────────────────────────────────────
function ResumoCard({ icon: Icon, cor, label, valor, sub }) {
  const cores = {
    amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700', border: 'border-amber-200' },
    blue:  { bg: 'bg-blue-50 dark:bg-blue-500/10',   text: 'text-blue-700',  border: 'border-blue-200' },
    indigo:{ bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-700', border: 'border-indigo-200' },
  };
  const c = cores[cor] || cores.blue;
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <div className={`h-8 w-8 rounded-md flex items-center justify-center border ${c.bg} ${c.border}`}>
          <Icon className={`h-4 w-4 ${c.text}`} />
        </div>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valor > 0 ? c.text : 'text-gray-500'}`}>{valor}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
    </motion.div>
  );
}

// ─── Card de dias pendentes (sangria ou extrato) ─────────────────
function DiasPendentesCard({ titulo, icon: Icon, cor, dias, linkLabel, link }) {
  const cores = {
    amber: { bg: 'from-amber-400 to-orange-500', chip: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 border-amber-200' },
    blue:  { bg: 'from-blue-500 to-indigo-600',   chip: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 border-blue-200' },
  };
  const c = cores[cor] || cores.blue;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${c.bg} flex items-center justify-center shadow-sm flex-shrink-0`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{titulo}</p>
          <p className="text-[11px] text-gray-500">
            {dias.length === 0 ? 'Nenhuma pendência' : `${dias.length} dia${dias.length === 1 ? '' : 's'} útil${dias.length === 1 ? '' : 'eis'}`}
          </p>
        </div>
        {dias.length > 0 && (
          <Link to={link}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors">
            {linkLabel} <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {dias.length === 0 ? (
        <div className="px-5 py-10 text-center flex-1 flex flex-col items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-400 mb-2" />
          <p className="text-xs text-gray-500">Todos os dias do mês em dia</p>
        </div>
      ) : (
        <div className="p-3 flex flex-wrap gap-1.5">
          {dias.map(d => (
            <span key={d} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${c.chip}`}>
              <Calendar className="h-3 w-3 opacity-70" />
              <span className="font-mono tabular-nums">{formatDataBR(d)}</span>
              <span className="text-[9px] opacity-70 uppercase">{diaSemana(d)}</span>
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Card de tarefas do gestor ───────────────────────────────────
function TarefasCard({ tarefas, temAcessoTotal }) {
  const coresPrio = {
    urgente: 'bg-red-50 dark:bg-red-500/10 text-red-700 border-red-200',
    alta:    'bg-amber-50 dark:bg-amber-500/10 text-amber-700 border-amber-200',
    normal:  'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 border-indigo-200',
    baixa:   'bg-gray-50 text-gray-600 border-gray-200',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm flex-shrink-0">
          <ListTodo className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            Tarefas em aberto
            {!temAcessoTotal && <span className="ml-2 text-[10px] font-normal text-gray-500 uppercase tracking-wider">atribuídas a você</span>}
          </p>
          <p className="text-[11px] text-gray-500">
            {tarefas.length} {tarefas.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'}
          </p>
        </div>
        <Link to="/cliente/tarefas"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          Ver todas <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="divide-y divide-gray-100">
        {tarefas.slice(0, 8).map(t => {
          const atrasada = tarefasService.isAtrasada(t);
          return (
            <Link key={t.id} to="/cliente/tarefas"
              className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50/60 transition-colors">
              <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                atrasada ? 'bg-red-500' : t.status === 'em_andamento' ? 'bg-blue-500' : 'bg-amber-500'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 font-medium truncate">{t.titulo}</p>
                {t.descricao && (
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{t.descricao}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                  {t.prioridade && t.prioridade !== 'normal' && (
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 border ${coresPrio[t.prioridade] || coresPrio.normal}`}>
                      {t.prioridade}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-[10px] rounded-full px-1.5 py-0.5 border ${
                    t.status === 'em_andamento' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 border-blue-200'
                    : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 border-amber-200'
                  }`}>
                    {t.status === 'em_andamento' ? <><Zap className="h-2.5 w-2.5" /> em andamento</> : <><Clock className="h-2.5 w-2.5" /> pendente</>}
                  </span>
                  {t.responsavel && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                      <User className="h-2.5 w-2.5 text-gray-400" /> {t.responsavel}
                    </span>
                  )}
                  {t.prazo && (
                    <span className={`inline-flex items-center gap-1 text-[10px] ${atrasada ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                      <Calendar className="h-2.5 w-2.5 text-gray-400" /> {formatDataBR(t.prazo)}
                      {atrasada && ' · atrasada'}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
            </Link>
          );
        })}
        {tarefas.length > 8 && (
          <Link to="/cliente/tarefas"
            className="block px-5 py-2.5 text-center text-[11px] font-medium text-blue-600 hover:bg-gray-50/60">
            + {tarefas.length - 8} tarefa{tarefas.length - 8 === 1 ? '' : 's'} adicional{tarefas.length - 8 === 1 ? '' : 'is'}
          </Link>
        )}
      </div>
    </motion.div>
  );
}
