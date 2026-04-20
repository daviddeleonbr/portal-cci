import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Layers, Loader2, AlertCircle,
  Building2, Zap, RefreshCw, FileBarChart, Printer,
  EyeOff, Eye, ChevronLeft as ChevLeft, Sparkles, Table
} from 'lucide-react';
import InsightsView from '../components/dre/InsightsView';
import * as clientesService from '../services/clientesService';
import * as dreService from '../services/mascaraDreService';
import * as mapService from '../services/mapeamentoService';
import * as manualService from '../services/mapeamentoManualService';
import * as vendasMapService from '../services/mapeamentoVendasService';
import { TIPOS_VENDA } from '../services/mapeamentoVendasService';
import * as qualityApi from '../services/qualityApiService';
import { formatCurrency } from '../utils/format';

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function ymd(d) {
  return d.toISOString().split('T')[0];
}

function rangeMes(ano, mes) {
  // mes 1-12
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0);
  return { dataInicial: ymd(inicio), dataFinal: ymd(fim) };
}

export default function RelatorioDRE({ clienteIdOverride, backHref } = {}) {
  const params = useParams();
  const clienteId = clienteIdOverride || params.clienteId;
  const navigate = useNavigate();
  const backTarget = backHref || `/admin/relatorios-cliente/${clienteId}`;

  const [cliente, setCliente] = useState(null);
  const [mascaras, setMascaras] = useState([]);
  const [mascaraSelecionada, setMascaraSelecionada] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [mapeamentos, setMapeamentos] = useState([]);

  // Periodo: usuario seleciona o mes FINAL; sistema busca N meses para tras (1 ou 3) terminando no mes selecionado
  const today = new Date();
  const [mesFinal, setMesFinal] = useState({ ano: today.getFullYear(), mes: today.getMonth() + 1 });
  const [qtdMeses, setQtdMeses] = useState(3); // 1 ou 3
  const [dreSolicitado, setDreSolicitado] = useState(false);

  const [dadosPorMes, setDadosPorMes] = useState({});       // { 'YYYY-MM': { titulosPagar, titulosReceber, vendaItens, vendas } }
  const [dadosPorMesAnterior, setDadosPorMesAnterior] = useState({});  // mesmo, ano anterior (para AH)
  const [mapeamentoVendas, setMapeamentoVendas] = useState([]);
  // Catalogos (cacheados ao entrar)
  const [produtosMap, setProdutosMap] = useState(new Map());
  const [gruposCatMap, setGruposCatMap] = useState(new Map());

  const [loading, setLoading] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ atual: 0, total: 0, mensagem: '' });
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [loadingMapeamentos, setLoadingMapeamentos] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dre'); // 'dre' | 'insights'

  const [ocultarZeradas, setOcultarZeradas] = useState(true);
  const [showAH, setShowAH] = useState(true);
  const [expandedGrupos, setExpandedGrupos] = useState(new Set());
  const [expandedContas, setExpandedContas] = useState(new Set());

  // ─── Compute meses array: N meses (1 ou 3) terminando em mesFinal ─
  const meses = useMemo(() => {
    const arr = [];
    for (let i = qtdMeses - 1; i >= 0; i--) {
      let y = mesFinal.ano;
      let m = mesFinal.mes - i;
      while (m < 1) { m += 12; y--; }
      arr.push({ ano: y, mes: m, key: `${y}-${String(m).padStart(2, '0')}`, label: `${MESES_NOMES[m - 1]}/${String(y).slice(2)}` });
    }
    return arr;
  }, [mesFinal, qtdMeses]);

  // ─── Init: load cliente + mascaras ──────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [c, masks] = await Promise.all([
          clientesService.buscarCliente(clienteId),
          dreService.listarMascaras(),
        ]);
        setCliente(c);
        setMascaras(masks || []);
        if (masks && masks.length > 0) setMascaraSelecionada(masks[0]);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [clienteId]);

  // ─── Load grupos ────────────────────────────────────────
  useEffect(() => {
    if (!mascaraSelecionada) return;
    setLoadingGrupos(true);
    setReportReady(false);
    (async () => {
      try {
        const [grps, mapVendas] = await Promise.all([
          dreService.listarGrupos(mascaraSelecionada.id),
          vendasMapService.listarMapeamentoVendas(mascaraSelecionada.id),
        ]);
        setGrupos(grps || []);
        setMapeamentoVendas(mapVendas || []);
        setExpandedGrupos(new Set((grps || []).filter(g => !g.parent_id).map(g => g.id)));
      } catch (err) { setError(err.message); }
      finally { setLoadingGrupos(false); }
    })();
  }, [mascaraSelecionada]);

  // ─── Load mapeamentos ───────────────────────────────────
  const carregarMapeamentos = useCallback(async () => {
    if (!cliente || !mascaraSelecionada) return;
    setLoadingMapeamentos(true);
    setReportReady(false);
    try {
      if (cliente.usa_webposto && cliente.chave_api_id) {
        const maps = await mapService.listarMapeamentos(cliente.chave_api_id);
        setMapeamentos(maps || []);
      } else {
        const cts = await manualService.listarContas(cliente.id, mascaraSelecionada.id);
        const adapted = (cts || []).map(c => ({
          id: c.id,
          grupo_dre_id: c.grupo_dre_id,
          plano_conta_codigo: c.conta_codigo || c.id,
          plano_conta_descricao: c.conta_descricao,
          plano_conta_natureza: c.conta_natureza,
          isManual: true,
        }));
        setMapeamentos(adapted);
      }
    } catch (err) { setError(err.message); }
    finally { setLoadingMapeamentos(false); }
  }, [cliente, mascaraSelecionada]);

  useEffect(() => { carregarMapeamentos(); }, [carregarMapeamentos]);

  // ─── Load lancamentos para todos os meses (atual e anterior) ─
  const carregarLancamentos = useCallback(async () => {
    if (!cliente || meses.length === 0) return;
    if (!cliente.usa_webposto || !cliente.chave_api_id) {
      setDadosPorMes({});
      setDadosPorMesAnterior({});
      setDadosCarregados(true);
      return;
    }

    try {
      setLoadingDados(true);
      setDadosCarregados(false);
      setError(null);

      setLoadingProgress({ atual: 0, total: 1, mensagem: 'Conectando com o sistema Webposto...' });
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API nao encontrada');

      // 1. Carregar catalogos (PRODUTO + GRUPO) - apenas se ainda nao carregados
      if (produtosMap.size === 0) {
        setLoadingProgress({ atual: 0, total: 1, mensagem: 'Carregando catalogo de produtos...' });
        const [prods, grps] = await Promise.all([
          qualityApi.buscarProdutos(chave.chave).catch(() => []),
          qualityApi.buscarGrupos(chave.chave).catch(() => []),
        ]);
        const pMap = new Map();
        (prods || []).forEach(p => pMap.set(p.produtoCodigo || p.codigo, p));
        const gMap = new Map();
        (grps || []).forEach(g => gMap.set(g.grupoCodigo || g.codigo, g));
        setProdutosMap(pMap);
        setGruposCatMap(gMap);
      }

      // 2. Buscar atual + ano anterior em paralelo
      const promises = meses.flatMap(m => {
        const r = rangeMes(m.ano, m.mes);
        const rAnt = rangeMes(m.ano - 1, m.mes);
        return [
          { key: m.key, ano: m.ano - 0, ...r, isPrev: false, label: m.label },
          { key: m.key, ano: m.ano - 1, ...rAnt, isPrev: true, label: m.label },
        ];
      });

      const total = promises.length;
      let concluidas = 0;
      setLoadingProgress({ atual: 0, total, mensagem: `Buscando lancamentos de ${meses.length} mes(es)...` });

      const results = await Promise.all(
        promises.map(async (p) => {
          const filtros = { dataInicial: p.dataInicial, dataFinal: p.dataFinal, empresaCodigo: cliente.empresa_codigo };
          const [pagar, receber, vendaItens, vendas] = await Promise.all([
            qualityApi.buscarTitulosPagar(chave.chave, filtros),
            qualityApi.buscarTitulosReceber(chave.chave, filtros),
            qualityApi.buscarVendaItens(chave.chave, filtros).catch(() => []),
            qualityApi.buscarVendas(chave.chave, filtros).catch(() => []),
          ]);
          concluidas++;
          const periodoLabel = p.isPrev ? `${p.label} (ano anterior)` : p.label;
          setLoadingProgress({
            atual: concluidas,
            total,
            mensagem: `${periodoLabel} \u00b7 ${(pagar?.length || 0) + (receber?.length || 0)} lancs \u00b7 ${vendaItens?.length || 0} itens \u00b7 ${vendas?.length || 0} vendas`,
          });
          return { ...p, pagar, receber, vendaItens, vendas };
        })
      );

      const atual = {};
      const anterior = {};
      results.forEach(r => {
        const target = r.isPrev ? anterior : atual;
        target[r.key] = { titulosPagar: r.pagar, titulosReceber: r.receber, vendaItens: r.vendaItens, vendas: r.vendas };
      });
      setLoadingProgress({ atual: total, total, mensagem: 'Montando o relatorio...' });
      // Pequeno delay para o usuario ver a mensagem final
      await new Promise(r => setTimeout(r, 250));
      setDadosPorMes(atual);
      setDadosPorMesAnterior(anterior);
      setDadosCarregados(true);
    } catch (err) {
      setError('Erro ao buscar lancamentos: ' + err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [cliente, meses]);

  // Ao mudar periodo ou mascara apos ja ter gerado, invalida o relatorio (usuario deve clicar "Montar DRE" novamente)
  useEffect(() => {
    setDreSolicitado(false);
    setDadosCarregados(false);
    setReportReady(false);
  }, [mesFinal, qtdMeses, mascaraSelecionada]);

  const handleMontarDRE = useCallback(() => {
    setDreSolicitado(true);
    setDadosCarregados(false);
    setReportReady(false);
    carregarLancamentos();
  }, [carregarLancamentos]);

  // ─── Orquestrar reportReady: so libera quando TUDO esta pronto ─
  // Aguarda: dados carregados + grupos carregados + mapeamentos carregados + memos computados
  useEffect(() => {
    const tudoPronto = dadosCarregados && !loadingGrupos && !loadingMapeamentos && !loadingDados;
    if (!tudoPronto) {
      setReportReady(false);
      return;
    }
    // Aguarda 2 frames para garantir que useMemos terminaram de computar
    // antes de mostrar o relatorio (evita "flash" de zerados)
    let raf1, raf2;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReportReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [dadosCarregados, loadingGrupos, loadingMapeamentos, loadingDados, dadosPorMes, dadosPorMesAnterior, mapeamentos, mapeamentoVendas, grupos]);

  // ─── Indexar lancamentos por conta + mes (totais + itens) ──
  function indexarPorConta(dadosMap) {
    const totais = {};       // { codigo: { mesKey: total } }
    const lancamentos = {};  // { codigo: [lancamento, ...] } (todos do periodo)
    Object.entries(dadosMap).forEach(([mesKey, dados]) => {
      const todos = [
        ...(dados.titulosReceber || []).map(t => ({ ...t, _sinal: 1, _tipo: 'receber' })),
        ...(dados.titulosPagar || []).map(t => ({ ...t, _sinal: -1, _tipo: 'pagar' })),
      ];
      todos.forEach(t => {
        const codigo = String(t.planoContaGerencialCodigo || '');
        if (!codigo) return;
        const valor = Number(t.valorPago || t.valor || 0) * t._sinal;

        if (!totais[codigo]) totais[codigo] = {};
        totais[codigo][mesKey] = (totais[codigo][mesKey] || 0) + valor;

        // Compor descricao: descricao + numeroTitulo (se existe) + nome contraparte
        const partes = [];
        const descBase = (t.descricao || '').trim();
        if (descBase) partes.push(descBase);
        const numTitulo = (t.numeroTitulo || '').trim();
        if (numTitulo) partes.push(`Nº ${numTitulo}`);
        const contraparte = (t.nomeFornecedor || t.nomeCliente || '').trim();
        if (contraparte) partes.push(contraparte);
        const descricaoComposta = partes.join(' \u00b7 ');

        if (!lancamentos[codigo]) lancamentos[codigo] = [];
        lancamentos[codigo].push({
          id: t.codigo || `${t._tipo}-${t.tituloPagarCodigo || t.tituloReceberCodigo}`,
          mesKey,
          data: t.dataMovimento || t.dataPagamento || t.vencimento || '',
          descricao: descricaoComposta || '\u2014',
          valor: Math.abs(Number(t.valorPago || t.valor || 0)),
          sinal: t._sinal,
          situacao: t.situacao,
          tipo: t._tipo,
        });
      });
    });
    return { totais, lancamentos };
  }

  const idxAtualFull = useMemo(() => indexarPorConta(dadosPorMes), [dadosPorMes]);
  const idxAnteriorFull = useMemo(() => indexarPorConta(dadosPorMesAnterior), [dadosPorMesAnterior]);
  const idxAtual = idxAtualFull.totais;
  const idxAnterior = idxAnteriorFull.totais;
  const lancamentosAtual = idxAtualFull.lancamentos;

  // ─── Indexar VENDAS por grupo configurado ──────────────────
  // SEM lancamentos individuais (vendas nao expandem em tela).
  // Apenas agregacao por tipo + mes para maxima performance.
  function indexarVendasPorGrupo(dadosMap) {
    const porGrupo = {};

    const cfgPorTipo = new Map();
    mapeamentoVendas.forEach(m => {
      if (m.grupo_dre_id) cfgPorTipo.set(m.tipo, m);
    });

    // Se nada esta mapeado, nao processa nada (otimizacao curto-circuito)
    if (cfgPorTipo.size === 0) return porGrupo;

    function ensureBucket(grupoId, tipo) {
      const tipoCfg = TIPOS_VENDA.find(t => t.id === tipo);
      if (!tipoCfg) return null;
      if (!porGrupo[grupoId]) porGrupo[grupoId] = {};
      if (!porGrupo[grupoId][tipo]) {
        porGrupo[grupoId][tipo] = { valoresPorMes: {}, tipoCfg };
      }
      return porGrupo[grupoId][tipo];
    }

    Object.entries(dadosMap).forEach(([mesKey, dados]) => {
      const itens = dados.vendaItens || [];
      const vendasArr = dados.vendas || [];
      const vendasMap = new Map();
      vendasArr.forEach(v => vendasMap.set(v.vendaCodigo || v.codigo, v));

      // Apenas agregados por mes (sem percorrer item por item para criar lancamentos)
      const totaisMes = vendasMapService.agregarVendasItens(itens, vendasMap, produtosMap, gruposCatMap);

      Object.entries(totaisMes).forEach(([tipo, valor]) => {
        const cfg = cfgPorTipo.get(tipo);
        if (!cfg) return;
        const tipoCfg = TIPOS_VENDA.find(t => t.id === tipo);
        const valorComSinal = (valor || 0) * tipoCfg.sinal;
        const bucket = ensureBucket(cfg.grupo_dre_id, tipo);
        if (bucket) bucket.valoresPorMes[mesKey] = (bucket.valoresPorMes[mesKey] || 0) + valorComSinal;
      });
    });
    return porGrupo;
  }
  const vendasAtualPorGrupo = useMemo(
    () => indexarVendasPorGrupo(dadosPorMes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dadosPorMes, mapeamentoVendas, produtosMap, gruposCatMap]
  );
  const vendasAnteriorPorGrupo = useMemo(
    () => indexarVendasPorGrupo(dadosPorMesAnterior),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dadosPorMesAnterior, mapeamentoVendas, produtosMap, gruposCatMap]
  );

  // ─── Build DRE tree com totais por mes + total + AH ────
  const dreTree = useMemo(() => {
    if (!grupos.length) return [];

    function buildNode(grupo) {
      const contasMapeadas = mapeamentos.filter(m => m.grupo_dre_id === grupo.id);

      const contas = contasMapeadas.map(m => {
        const codKey = String(m.plano_conta_codigo);
        const valoresPorMes = {};
        const valoresAnt = {};
        let totalPeriodo = 0;
        let totalAnt = 0;
        meses.forEach(mes => {
          const v = idxAtual[codKey]?.[mes.key] || 0;
          const va = idxAnterior[codKey]?.[mes.key] || 0;
          valoresPorMes[mes.key] = v;
          valoresAnt[mes.key] = va;
          totalPeriodo += v;
          totalAnt += va;
        });
        // Lancamentos da conta no periodo (apenas atual)
        const lancs = (lancamentosAtual[codKey] || [])
          .slice()
          .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
        return {
          id: m.id,
          codigo: m.plano_conta_codigo,
          descricao: m.plano_conta_descricao,
          natureza: m.plano_conta_natureza,
          isManual: m.isManual,
          valoresPorMes,
          valoresAnt,
          totalPeriodo,
          totalAnt,
          lancamentos: lancs,
        };
      });

      // Adicionar contas virtuais de VENDAS configuradas para este grupo
      const vendasGrupo = vendasAtualPorGrupo[grupo.id];
      const vendasGrupoAnt = vendasAnteriorPorGrupo[grupo.id];
      if (vendasGrupo) {
        Object.entries(vendasGrupo).forEach(([tipo, dados]) => {
          const valoresPorMes = {};
          const valoresAnt = {};
          let totalPeriodo = 0;
          let totalAnt = 0;
          meses.forEach(mes => {
            const v = dados.valoresPorMes[mes.key] || 0;
            const va = vendasGrupoAnt?.[tipo]?.valoresPorMes[mes.key] || 0;
            valoresPorMes[mes.key] = v;
            valoresAnt[mes.key] = va;
            totalPeriodo += v;
            totalAnt += va;
          });
          contas.push({
            id: `venda-${grupo.id}-${tipo}`,
            codigo: '',
            descricao: `${dados.tipoCfg.label} (vendas)`,
            isVendas: true,
            tipoVenda: tipo,
            valoresPorMes,
            valoresAnt,
            totalPeriodo,
            totalAnt,
            lancamentos: [], // vendas nao expandem - sem lancamentos individuais
          });
        });
      }

      const children = grupos
        .filter(g => g.parent_id === grupo.id)
        .sort((a, b) => a.ordem - b.ordem)
        .map(buildNode);

      // Soma valores por mes do grupo
      const valoresPorMes = {};
      const valoresAnt = {};
      let totalPeriodo = 0;
      let totalAnt = 0;
      meses.forEach(mes => {
        const fromContas = contas.reduce((s, c) => s + (c.valoresPorMes[mes.key] || 0), 0);
        const fromContasAnt = contas.reduce((s, c) => s + (c.valoresAnt[mes.key] || 0), 0);
        const fromChildren = children.reduce((s, c) => s + (c.valoresPorMes[mes.key] || 0), 0);
        const fromChildrenAnt = children.reduce((s, c) => s + (c.valoresAnt[mes.key] || 0), 0);
        valoresPorMes[mes.key] = fromContas + fromChildren;
        valoresAnt[mes.key] = fromContasAnt + fromChildrenAnt;
        totalPeriodo += valoresPorMes[mes.key];
        totalAnt += valoresAnt[mes.key];
      });

      return {
        ...grupo,
        contas,
        children,
        valoresPorMes,
        valoresAnt,
        totalPeriodo,
        totalAnt,
      };
    }

    return grupos
      .filter(g => !g.parent_id)
      .sort((a, b) => a.ordem - b.ordem)
      .map(buildNode);
  }, [grupos, mapeamentos, idxAtual, idxAnterior, lancamentosAtual, vendasAtualPorGrupo, vendasAnteriorPorGrupo, meses]);

  // ─── Acumulado para subtotais/resultados ─────────────────
  const dreComCalculos = useMemo(() => {
    const acumPorMes = {};
    let acumTotal = 0;
    let acumTotalAnt = 0;
    meses.forEach(m => { acumPorMes[m.key] = 0; });

    return dreTree.map(node => {
      if (node.tipo === 'subtotal' || node.tipo === 'resultado') {
        return {
          ...node,
          isCalc: true,
          valoresPorMes: { ...acumPorMes },
          valoresAnt: meses.reduce((acc, m) => { acc[m.key] = 0; return acc; }, {}), // calculados nao tem AH
          totalPeriodo: acumTotal,
          totalAnt: acumTotalAnt,
        };
      }
      meses.forEach(m => { acumPorMes[m.key] += (node.valoresPorMes[m.key] || 0); });
      acumTotal += node.totalPeriodo;
      acumTotalAnt += node.totalAnt;
      return node;
    });
  }, [dreTree, meses]);

  // ─── Base AV (Receita Bruta = primeira linha de receita root) ─
  const baseAVPorMes = useMemo(() => {
    const base = {};
    meses.forEach(m => {
      // primeira root nao calculada
      const primeiraReceita = dreTree.find(n => !['subtotal', 'resultado'].includes(n.tipo));
      base[m.key] = primeiraReceita ? Math.abs(primeiraReceita.valoresPorMes[m.key] || 0) : 0;
    });
    const baseTotal = dreTree.find(n => !['subtotal', 'resultado'].includes(n.tipo))?.totalPeriodo;
    base.total = Math.abs(baseTotal || 0);
    return base;
  }, [dreTree, meses]);

  const totalGeral = useMemo(() =>
    dreComCalculos.find(n => n.tipo === 'resultado')?.totalPeriodo
    ?? dreTree.reduce((s, n) => s + n.totalPeriodo, 0)
  , [dreComCalculos, dreTree]);

  const toggleGrupo = (id) => {
    setExpandedGrupos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleConta = (id) => {
    setExpandedContas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const navMes = (delta) => {
    setMesFinal(prev => {
      let m = prev.mes + delta;
      let y = prev.ano;
      while (m < 1) { m += 12; y--; }
      while (m > 12) { m -= 12; y++; }
      return { ano: y, mes: m };
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }
  if (!cliente) {
    return <div className="text-center py-20 text-gray-500">Cliente nao encontrado</div>;
  }

  const periodoLabel = meses.length === 1
    ? meses[0].label
    : `${meses[0].label} - ${meses[meses.length - 1].label}`;

  return (
    <div>
      {/* Print-only styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-page { padding: 1.5cm; }
          .print-no-break { page-break-inside: avoid; }
          aside, header { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .conta-row, .lanc-row { display: none !important; }
          @page { size: A4 portrait; margin: 1cm; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Header (no-print) */}
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between gap-4 mb-6 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(backTarget)}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <FileBarChart className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">DRE Gerencial</h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Building2 className="h-3 w-3" />
              <span className="truncate">{cliente.nome}</span>
              {cliente.usa_webposto && (
                <span className="inline-flex items-center gap-1 text-amber-600 ml-1">
                  <Zap className="h-2.5 w-2.5" /> Webposto
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleMontarDRE} disabled={loadingDados || !mascaraSelecionada || !dreSolicitado}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
            {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors">
            <Printer className="h-4 w-4" /> Gerar PDF
          </button>
        </div>
      </motion.div>

      {/* Filters bar (no-print) */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-200/60 p-4 mb-5 shadow-sm no-print">
        <div className="flex flex-wrap items-end gap-3">
          {/* Mascara */}
          <div className="min-w-[220px]">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mascara DRE</label>
            <select value={mascaraSelecionada?.id || ''}
              onChange={(e) => setMascaraSelecionada(mascaras.find(m => m.id === e.target.value))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {mascaras.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>

          {/* Mes final (selecionado) — sistema busca 2 meses anteriores automaticamente */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mes (referencia)</label>
            <div className="flex items-center gap-1 h-10 rounded-lg border border-gray-200 bg-white px-1">
              <button onClick={() => navMes(-1)} className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50">
                <ChevLeft className="h-3.5 w-3.5" />
              </button>
              <select value={mesFinal.mes}
                onChange={(e) => setMesFinal(p => ({ ...p, mes: Number(e.target.value) }))}
                className="text-sm border-0 focus:outline-none bg-transparent">
                {MESES_NOMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
              </select>
              <select value={mesFinal.ano}
                onChange={(e) => setMesFinal(p => ({ ...p, ano: Number(e.target.value) }))}
                className="text-sm border-0 focus:outline-none bg-transparent">
                {[today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={() => navMes(1)} className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Quantidade de meses (1 ou 3) */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Analise</label>
            <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5 h-10">
              {[1, 3].map(q => (
                <button key={q} onClick={() => setQtdMeses(q)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                    qtdMeses === q ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {q === 1 ? '1 mes' : '3 meses'}
                </button>
              ))}
            </div>
          </div>

          {/* Montar DRE */}
          <div>
            <button onClick={handleMontarDRE} disabled={loadingDados || !mascaraSelecionada}
              className="flex items-center gap-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
              Montar DRE
            </button>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setOcultarZeradas(!ocultarZeradas)}
              title={ocultarZeradas ? 'Mostrar contas zeradas' : 'Ocultar contas zeradas'}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all border ${
                ocultarZeradas ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {ocultarZeradas ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              Ocultar zeradas
            </button>
            <button onClick={() => setShowAH(!showAH)}
              title={showAH ? 'Ocultar AH (ano anterior)' : 'Mostrar AH (ano anterior)'}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all border ${
                showAH ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              AH
            </button>
          </div>
        </div>
      </motion.div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2 no-print">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Print header (only print) */}
      <div className="print-only" style={{ display: 'none' }}>
        <div style={{ marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
          <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: 0 }}>DRE Gerencial</h1>
          <p style={{ fontSize: '10pt', margin: '4px 0' }}>{cliente.nome}{cliente.cnpj ? ` - CNPJ ${cliente.cnpj}` : ''}</p>
          <p style={{ fontSize: '10pt', margin: '4px 0', color: '#666' }}>Periodo: {periodoLabel} &middot; Mascara: {mascaraSelecionada?.nome}</p>
        </div>
      </div>

      {/* Tabs DRE | Insights (oculto na impressao) */}
      {reportReady && (
        <div className="flex items-center gap-0.5 mb-4 bg-gray-100/80 rounded-lg p-0.5 w-fit no-print">
          <button onClick={() => setActiveTab('dre')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
              activeTab === 'dre' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Table className="h-3.5 w-3.5" /> DRE
          </button>
          <button onClick={() => setActiveTab('insights')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
              activeTab === 'insights' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Sparkles className="h-3.5 w-3.5" /> Insights
          </button>
        </div>
      )}

      {/* Loading state - exibido enquanto dados nao estao prontos OU memos ainda computando */}
      <AnimatePresence mode="wait">
        {!dreSolicitado ? (
          <motion.div key="aguardando" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
              <FileBarChart className="h-7 w-7 text-white" />
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Selecione o periodo e clique em "Montar DRE"</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              O relatorio sera gerado com os 3 meses terminando em <strong>{meses[meses.length - 1]?.label}</strong>: <strong>{meses.map(m => m.label).join(', ')}</strong>.
            </p>
          </motion.div>
        ) : (loadingDados || loadingGrupos || loadingMapeamentos || (!reportReady && cliente.usa_webposto)) ? (
          <FriendlyLoader key="loader" progress={loadingProgress} cliente={cliente} periodoLabel={periodoLabel}
            stageLabel={
              loadingGrupos ? 'Carregando estrutura da mascara...'
                : loadingMapeamentos ? 'Carregando mapeamentos...'
                : loadingDados ? null
                : 'Processando relatorio...'
            }
          />
        ) : !grupos.length ? (
          <motion.div key="empty-mascara" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
            <Layers className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-800 mb-1">Mascara vazia</p>
            <p className="text-xs text-gray-400">Configure a estrutura da mascara em Cadastros &gt; Parametros</p>
          </motion.div>
        ) : activeTab === 'insights' ? (
          <motion.div key="insights" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <InsightsView
              dreTree={dreComCalculos}
              mascara={mascaraSelecionada}
              periodoLabel={periodoLabel}
              cliente={cliente}
            />
          </motion.div>
        ) : (
          <motion.div key="report" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden print-no-break">
            {/* Header (no-print) */}
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between no-print">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Layers className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">{mascaraSelecionada?.nome}</h3>
                  <p className="text-[11px] text-gray-400">{periodoLabel}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Resultado</p>
                <p className={`text-base font-bold ${totalGeral >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(totalGeral)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" style={{ tableLayout: 'fixed', minWidth: 490 + meses.length * 175 + 175 }}>
                <colgroup>
                  <col style={{ width: showAH ? 410 : 490 }} />
                  {meses.map(m => (
                    <>
                      <col key={`${m.key}-v`} style={{ width: 115 }} />
                      <col key={`${m.key}-av`} style={{ width: 55 }} />
                    </>
                  ))}
                  <col style={{ width: 125 }} />
                  <col style={{ width: 55 }} />
                  {showAH && <col style={{ width: 75 }} />}
                </colgroup>
                <thead className="bg-gray-50/80">
                  <tr className="text-gray-500">
                    <th className="text-left px-4 py-2.5 font-medium uppercase text-[10px] tracking-wider whitespace-nowrap">Conta</th>
                    {meses.map(m => (
                      <>
                        <th key={`${m.key}-v`} className="text-right px-3 py-2.5 font-medium uppercase text-[10px] tracking-wider whitespace-nowrap">{m.label} (R$)</th>
                        <th key={`${m.key}-av`} className="text-right px-2 py-2.5 font-medium text-[9px] tracking-wider text-gray-400 whitespace-nowrap">AV%</th>
                      </>
                    ))}
                    <th className="text-right px-3 py-2.5 font-medium uppercase text-[10px] tracking-wider bg-gray-100/60 whitespace-nowrap">Total (R$)</th>
                    <th className="text-right px-2 py-2.5 font-medium text-[9px] tracking-wider text-gray-400 bg-gray-100/60 whitespace-nowrap">AV%</th>
                    {showAH && <th className="text-right px-3 py-2.5 font-medium uppercase text-[10px] tracking-wider bg-gray-100/60 whitespace-nowrap">AH%</th>}
                  </tr>
                </thead>
                <tbody>
                  {dreComCalculos.map((node) => (
                    <DreNodeRows key={node.id} node={node} depth={0}
                      meses={meses}
                      baseAV={baseAVPorMes}
                      expandedGrupos={expandedGrupos}
                      expandedContas={expandedContas}
                      onToggleGrupo={toggleGrupo}
                      onToggleConta={toggleConta}
                      ocultarZeradas={ocultarZeradas}
                      showAH={showAH}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Friendly Loader - mostra progresso durante carregamento
// ═══════════════════════════════════════════════════════════
const TIPS = [
  'A DRE consolida receitas, custos e despesas em um unico relatorio gerencial.',
  'AV (Analise Vertical) mostra o peso de cada linha em relacao a Receita Bruta.',
  'AH (Analise Horizontal) compara os valores com o mesmo periodo do ano anterior.',
  'Voce pode imprimir o relatorio em A4 - apenas os grupos sinteticos serao exportados.',
  'Use o filtro "Ocultar zeradas" para focar apenas nas contas com movimento.',
];

function FriendlyLoader({ progress, cliente, periodoLabel, stageLabel }) {
  const [tipIndex, setTipIndex] = useState(0);
  const pct = stageLabel ? 100 : (progress.total > 0 ? Math.round((progress.atual / progress.total) * 100) : 0);
  const mensagemAtual = stageLabel || progress.mensagem || 'Iniciando...';

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex(i => (i + 1) % TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden no-print">
      <div className="relative px-8 py-12 sm:py-16">
        {/* Background decorative gradient */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-blue-100/40 blur-[80px]" />
          <div className="absolute -bottom-1/2 right-1/4 w-[300px] h-[300px] rounded-full bg-indigo-100/30 blur-[60px]" />
        </div>

        <div className="relative flex flex-col items-center text-center max-w-md mx-auto">
          {/* Animated icon */}
          <div className="relative mb-6">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500 opacity-20 blur-xl"
            />
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30"
            >
              <FileBarChart className="h-9 w-9 text-white" />
              <motion.div
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-400 ring-4 ring-white"
              />
            </motion.div>
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-gray-900 mb-1">Montando seu relatorio</h3>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Estamos buscando os lancamentos de <strong>{cliente.nome}</strong> no periodo de <strong>{periodoLabel}</strong> e do mesmo periodo no ano anterior.
          </p>

          {/* Progress bar */}
          <div className="w-full mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Progresso</span>
              <span className="text-[11px] font-semibold text-blue-600">{pct}%</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
            {progress.total > 0 && (
              <p className="text-[11px] text-gray-400 mt-2">{progress.atual} de {progress.total} consultas concluidas</p>
            )}
          </div>

          {/* Current message */}
          <div className="w-full bg-gray-50 rounded-xl px-4 py-3 mb-6 flex items-center gap-3 border border-gray-100">
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
            <AnimatePresence mode="wait">
              <motion.p
                key={mensagemAtual}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-xs text-gray-700 truncate text-left flex-1"
              >
                {mensagemAtual}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Rotating tips */}
          <div className="w-full bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-3">
            <div className="flex items-start gap-2.5">
              <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-white">i</span>
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={tipIndex}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="text-[11px] text-blue-900 leading-relaxed text-left"
                >
                  <strong className="text-blue-700">Voce sabia?</strong> {TIPS[tipIndex]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Recursive node rows (group + sub-groups + contas) ──────
function DreNodeRows({ node, depth, meses, baseAV, expandedGrupos, expandedContas, onToggleGrupo, onToggleConta, ocultarZeradas, showAH }) {
  const isCalc = node.tipo === 'subtotal' || node.tipo === 'resultado';
  const isResultado = node.tipo === 'resultado';
  const isExpanded = expandedGrupos.has(node.id);
  const indent = depth * 16;

  const hasChildren = (node.children && node.children.length > 0) || (node.contas && node.contas.length > 0);

  // Filtrar contas zeradas se ativo
  const contasFiltradas = ocultarZeradas
    ? (node.contas || []).filter(c => Math.abs(c.totalPeriodo) > 0.01)
    : (node.contas || []);

  const childrenFiltrados = ocultarZeradas
    ? (node.children || []).filter(c => Math.abs(c.totalPeriodo) > 0.01 || c.tipo === 'subtotal' || c.tipo === 'resultado')
    : (node.children || []);

  // Se o grupo tem zero e nao tem subgrupos com valor, oculta tambem
  if (ocultarZeradas && !isCalc && Math.abs(node.totalPeriodo) < 0.01 && contasFiltradas.length === 0 && childrenFiltrados.length === 0) {
    return null;
  }

  const rowBg = isResultado
    ? 'bg-emerald-50'
    : isCalc
      ? 'bg-slate-50'
      : depth === 0 ? 'bg-gray-50/60' : '';

  return (
    <>
      <tr className={`group/row border-b border-gray-50 ${rowBg} ${!isCalc ? 'hover:bg-blue-50/30' : ''}`}>
        <td className="px-4 py-2 grupo-row overflow-hidden" style={{ paddingLeft: 12 + indent }}>
          <div className="flex items-center gap-1.5 min-w-0">
            {hasChildren && !isCalc ? (
              <button onClick={() => onToggleGrupo(node.id)}
                className="text-gray-400 hover:text-gray-700 transition-colors no-print flex-shrink-0">
                <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                  <ChevronRight className="h-3 w-3" />
                </motion.div>
              </button>
            ) : isCalc ? (
              <span className="text-[10px] font-bold text-gray-400 flex-shrink-0">=</span>
            ) : (
              <div className="w-3 flex-shrink-0" />
            )}
            <span title={node.nome} className={`truncate min-w-0 ${
              depth === 0 ? 'text-[12px] font-bold text-gray-900 uppercase tracking-wide'
                : isResultado ? 'text-[12px] font-bold text-emerald-800 uppercase'
                  : isCalc ? 'text-[12px] font-semibold text-gray-700 uppercase'
                    : 'text-[12px] font-semibold text-gray-800 uppercase'
            }`}>
              {node.nome}
            </span>
          </div>
        </td>
        {meses.map(m => {
          const v = node.valoresPorMes[m.key] || 0;
          const av = baseAV[m.key] > 0 ? (v / baseAV[m.key] * 100) : 0;
          return (
            <>
              <td key={`${m.key}-v`} className={`text-right px-3 py-2 font-mono tabular-nums whitespace-nowrap ${
                isResultado ? 'font-bold text-emerald-700'
                  : isCalc ? 'font-semibold text-gray-700'
                    : v >= 0 ? 'text-gray-800' : 'text-red-600'
              }`}>
                {formatCurrencyCompact(v)}
              </td>
              <td key={`${m.key}-av`} className="text-right px-2 py-2 font-mono tabular-nums text-[10px] text-gray-400 whitespace-nowrap">
                {!isCalc && av !== 0 ? `${av.toFixed(1)}%` : ''}
              </td>
            </>
          );
        })}
        <td className={`text-right px-3 py-2 font-mono tabular-nums whitespace-nowrap bg-gray-50/40 ${
          isResultado ? 'font-bold text-emerald-700'
            : isCalc ? 'font-semibold text-gray-700'
              : node.totalPeriodo >= 0 ? 'text-gray-900 font-semibold' : 'text-red-600 font-semibold'
        }`}>
          {formatCurrencyCompact(node.totalPeriodo)}
        </td>
        <td className="text-right px-2 py-2 font-mono tabular-nums text-[10px] text-gray-400 bg-gray-50/40 whitespace-nowrap">
          {!isCalc && baseAV.total > 0 ? `${(node.totalPeriodo / baseAV.total * 100).toFixed(1)}%` : ''}
        </td>
        {showAH && (
          <td className="text-right px-3 py-2 font-mono tabular-nums text-[11px] bg-gray-50/40 whitespace-nowrap">
            {!isCalc && Math.abs(node.totalAnt) > 0.01 ? (
              <AHBadge atual={node.totalPeriodo} anterior={node.totalAnt} />
            ) : ''}
          </td>
        )}
      </tr>

      {/* Sub-grupos (quando expandido) */}
      <AnimatePresence>
        {isExpanded && !isCalc && childrenFiltrados.map(child => (
          <DreNodeRows key={child.id} node={child} depth={depth + 1}
            meses={meses}
            baseAV={baseAV}
            expandedGrupos={expandedGrupos}
            expandedContas={expandedContas}
            onToggleGrupo={onToggleGrupo}
            onToggleConta={onToggleConta}
            ocultarZeradas={ocultarZeradas}
            showAH={showAH}
          />
        ))}
      </AnimatePresence>

      {/* Contas mapeadas */}
      {isExpanded && !isCalc && contasFiltradas.map(conta => {
        const isContaExpanded = expandedContas?.has(conta.id);
        const temLancs = conta.lancamentos && conta.lancamentos.length > 0;
        const totalCols = 1 + (meses.length * 2) + 2 + (showAH ? 1 : 0);
        return (
          <>
            <tr key={conta.id} className="conta-row border-b border-gray-50 hover:bg-indigo-50/30 transition-colors">
              <td className="px-4 py-1.5 overflow-hidden" style={{ paddingLeft: 12 + indent + 24 }}>
                <div className="flex items-center gap-2 min-w-0">
                  {temLancs ? (
                    <button onClick={() => onToggleConta(conta.id)}
                      className="text-gray-400 hover:text-gray-700 transition-colors no-print flex-shrink-0">
                      <motion.div animate={{ rotate: isContaExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                        <ChevronRight className="h-3 w-3" />
                      </motion.div>
                    </button>
                  ) : (
                    <div className="h-1 w-1 rounded-full bg-indigo-300 flex-shrink-0" />
                  )}
                  <span title={conta.descricao} className="text-[11px] text-gray-600 truncate min-w-0 flex-1">{conta.descricao}</span>
                  {temLancs && (
                    <span className="text-[9px] text-gray-400 bg-gray-50 rounded-full px-1.5 py-0.5 flex-shrink-0 no-print">
                      {conta.lancamentos.length}
                    </span>
                  )}
                </div>
              </td>
              {meses.map(m => {
                const v = conta.valoresPorMes[m.key] || 0;
                const av = baseAV[m.key] > 0 ? (v / baseAV[m.key] * 100) : 0;
                return (
                  <>
                    <td key={`${m.key}-v`} className={`text-right px-3 py-1.5 font-mono tabular-nums text-[11px] whitespace-nowrap ${
                      v >= 0 ? 'text-gray-700' : 'text-red-600'
                    }`}>
                      {formatCurrencyCompact(v)}
                    </td>
                    <td key={`${m.key}-av`} className="text-right px-2 py-1.5 font-mono tabular-nums text-[10px] text-gray-400 whitespace-nowrap">
                      {av !== 0 ? `${av.toFixed(1)}%` : ''}
                    </td>
                  </>
                );
              })}
              <td className={`text-right px-3 py-1.5 font-mono tabular-nums text-[11px] bg-gray-50/40 whitespace-nowrap ${
                conta.totalPeriodo >= 0 ? 'text-gray-700' : 'text-red-600'
              }`}>
                {formatCurrencyCompact(conta.totalPeriodo)}
              </td>
              <td className="text-right px-2 py-1.5 font-mono tabular-nums text-[10px] text-gray-400 bg-gray-50/40 whitespace-nowrap">
                {baseAV.total > 0 && conta.totalPeriodo !== 0 ? `${(conta.totalPeriodo / baseAV.total * 100).toFixed(1)}%` : ''}
              </td>
              {showAH && (
                <td className="text-right px-3 py-1.5 font-mono tabular-nums text-[10px] bg-gray-50/40 whitespace-nowrap">
                  {Math.abs(conta.totalAnt) > 0.01 ? (
                    <AHBadge atual={conta.totalPeriodo} anterior={conta.totalAnt} small />
                  ) : ''}
                </td>
              )}
            </tr>

            {/* Lancamentos (quando conta expandida) - cada valor na coluna do mes correspondente */}
            {isContaExpanded && temLancs && conta.lancamentos.map(l => {
              const valorComSinal = l.valor * l.sinal;
              const valorClasses = `text-right px-3 py-1 font-mono tabular-nums text-[10.5px] whitespace-nowrap ${l.sinal > 0 ? 'text-emerald-700' : 'text-red-600'}`;
              return (
                <tr key={`l-${l.id}`} className="lanc-row border-b border-gray-50 bg-gray-50/30 hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-1 overflow-hidden" style={{ paddingLeft: 12 + indent + 24 + 24 }}>
                    <div className="flex items-center gap-2.5 text-[10.5px] min-w-0">
                      <span className="font-mono text-gray-400 w-14 flex-shrink-0">{formatDataBR(l.data)}</span>
                      <span title={l.descricao} className="text-gray-700 truncate min-w-0 flex-1">{l.descricao}</span>
                      {l.situacao && (
                        <span className={`text-[9px] rounded px-1.5 py-0.5 flex-shrink-0 ${
                          l.situacao === 'Pago' ? 'bg-emerald-50 text-emerald-600' :
                          l.situacao === 'Aberto' ? 'bg-amber-50 text-amber-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>{l.situacao}</span>
                      )}
                    </div>
                  </td>
                  {meses.map(m => (
                    <>
                      <td key={`${m.key}-v`} className={valorClasses}>
                        {l.mesKey === m.key ? formatCurrencyCompact(valorComSinal) : ''}
                      </td>
                      <td key={`${m.key}-av`} className="px-2 py-1"></td>
                    </>
                  ))}
                  <td className={`${valorClasses} bg-gray-100/40`}>
                    {formatCurrencyCompact(valorComSinal)}
                  </td>
                  <td className="px-2 py-1 bg-gray-100/40"></td>
                  {showAH && <td className="px-3 py-1 bg-gray-100/40"></td>}
                </tr>
              );
            })}
          </>
        );
      })}
    </>
  );
}

function formatDataBR(d) {
  if (!d) return '\u2014';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y.slice(2)}`;
}

// Formatacao monetaria compacta (sem prefixo R$) para caber na coluna
function formatCurrencyCompact(value) {
  if (value == null || isNaN(value)) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ─── AH Badge (variacao % vs ano anterior) ──────────────────
function AHBadge({ atual, anterior, small }) {
  if (!anterior) return <span className="text-gray-300">—</span>;
  const variacao = ((atual - anterior) / Math.abs(anterior)) * 100;
  const positivo = variacao >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 ${small ? 'text-[10px]' : 'text-[11px]'} font-semibold ${
      positivo ? 'text-emerald-600' : 'text-red-600'
    }`}>
      {positivo ? '▲' : '▼'} {Math.abs(variacao).toFixed(1)}%
    </span>
  );
}
