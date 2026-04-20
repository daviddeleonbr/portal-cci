import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Layers, Loader2, AlertCircle,
  Building2, Zap, RefreshCw, Wallet, Printer,
  EyeOff, Eye, ChevronLeft as ChevLeft,
} from 'lucide-react';
import * as clientesService from '../services/clientesService';
import * as fluxoService from '../services/mascaraFluxoCaixaService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as contasBancariasService from '../services/clienteContasBancariasService';
import { formatCurrency } from '../utils/format';

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function rangeMes(ano, mes) {
  const mm = String(mes).padStart(2, '0');
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return {
    dataInicial: `${ano}-${mm}-01`,
    dataFinal: `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

export default function RelatorioFluxoCaixa({ clienteIdOverride, backHref } = {}) {
  const params = useParams();
  const clienteId = clienteIdOverride || params.clienteId;
  const navigate = useNavigate();
  const backTarget = backHref || `/admin/relatorios-cliente/${clienteId}`;

  const [cliente, setCliente] = useState(null);
  const [mascaras, setMascaras] = useState([]);
  const [mascaraSelecionada, setMascaraSelecionada] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [mapeamentos, setMapeamentos] = useState([]);

  const today = new Date();
  const [mesFinal, setMesFinal] = useState({ ano: today.getFullYear(), mes: today.getMonth() + 1 });
  const [qtdMeses, setQtdMeses] = useState(3);

  const [dadosPorMes, setDadosPorMes] = useState({});

  const [loading, setLoading] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ atual: 0, total: 0, mensagem: '' });
  const [reportSolicitado, setReportSolicitado] = useState(false);
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [error, setError] = useState(null);

  const [ocultarZeradas, setOcultarZeradas] = useState(true);
  const [expandedGrupos, setExpandedGrupos] = useState(new Set());
  const [expandedContas, setExpandedContas] = useState(new Set());

  // Filtro por tipo de conta no fluxo de caixa:
  //  - bancaria: conta corrente
  //  - caixa: caixa fisico
  //  - recebimento: adquirente (PagPix/Cielo/Brinks) - recebe de cliente
  // NAO inclui aplicacao (movimento interno) nem outras (fora do fluxo).
  const [tiposContaAtivos, setTiposContaAtivos] = useState(() => new Set(['bancaria', 'caixa', 'recebimento']));
  const [contasClassificadas, setContasClassificadas] = useState([]);

  // Transferencias entre contas (transferencia=S) sao EXCLUIDAS por padrao
  // para evitar duplicidade (ex: repasse PagPix -> Conta Bancaria).
  const [incluirTransferencias, setIncluirTransferencias] = useState(false);

  // Filtro por conta especifica (multiselecao). Vazio = todas.
  const [filtroContas, setFiltroContas] = useState(() => new Set());
  const [filtroContasOpen, setFiltroContasOpen] = useState(false);
  // Metadados das contas (descricao) do endpoint CONTA, para exibir nomes no filtro
  const [contasMeta, setContasMeta] = useState([]);

  // ─── Meses ────────────────────────────────────────────────
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

  // ─── Init: cliente + mascaras ────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [c, masks] = await Promise.all([
          clientesService.buscarCliente(clienteId),
          fluxoService.listarMascaras(),
        ]);
        setCliente(c);
        setMascaras(masks || []);
        if (masks && masks.length > 0) setMascaraSelecionada(masks[0]);
        // Carrega classificacao das contas + catalogo CONTA da rede
        if (c?.chave_api_id) {
          try {
            const chavesApi = await mapService.listarChavesApi();
            const chave = chavesApi.find(ch => ch.id === c.chave_api_id);
            const tasks = [contasBancariasService.listarPorRede(c.chave_api_id)];
            if (chave?.chave) tasks.push(qualityApi.buscarContas(chave.chave));
            const [classif, ctas] = await Promise.all(tasks);
            setContasClassificadas(classif || []);
            setContasMeta(ctas || []);
          } catch (_) { setContasClassificadas([]); setContasMeta([]); }
        }
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [clienteId]);

  // ─── Carregar grupos + mapeamentos ─────────────────────────
  useEffect(() => {
    if (!mascaraSelecionada || !cliente) return;
    setReportReady(false);
    (async () => {
      try {
        const tasks = [fluxoService.listarGrupos(mascaraSelecionada.id)];
        if (cliente.usa_webposto && cliente.chave_api_id) {
          tasks.push(fluxoService.listarMapeamentosEmpresa(cliente.chave_api_id));
        } else {
          tasks.push(fluxoService.listarContasManual(cliente.id, mascaraSelecionada.id));
        }
        const [grps, maps] = await Promise.all(tasks);
        setGrupos(grps || []);
        // Normaliza: mapeamentos webposto tem plano_conta_codigo, manuais tem conta_codigo
        const adaptados = (maps || []).map(m => ({
          id: m.id,
          grupo_fluxo_id: m.grupo_fluxo_id,
          plano_conta_codigo: m.plano_conta_codigo || m.conta_codigo,
          plano_conta_descricao: m.plano_conta_descricao || m.conta_descricao,
          isManual: !cliente.usa_webposto,
        }));
        setMapeamentos(adaptados);
        // Expande somente ate o 3o nivel hierarquico por padrao (depth 0 e 1 abertos → depth 0,1,2 visiveis).
        const byId = new Map((grps || []).map(g => [g.id, g]));
        const depthCache = new Map();
        const getDepth = (g) => {
          if (depthCache.has(g.id)) return depthCache.get(g.id);
          if (!g.parent_id) { depthCache.set(g.id, 0); return 0; }
          const parent = byId.get(g.parent_id);
          const d = parent ? getDepth(parent) + 1 : 0;
          depthCache.set(g.id, d);
          return d;
        };
        const autoExpand = new Set(
          (grps || [])
            .filter(g => ['grupo', 'entrada', 'saida'].includes(g.tipo))
            .filter(g => getDepth(g) < 2)
            .map(g => g.id)
        );
        setExpandedGrupos(autoExpand);
      } catch (err) { setError(err.message); }
    })();
  }, [mascaraSelecionada, cliente]);

  // ─── Invalida ao mudar periodo/mascara ────────────────────
  useEffect(() => {
    setReportSolicitado(false);
    setDadosCarregados(false);
    setReportReady(false);
    setDadosPorMes({});
  }, [mesFinal, qtdMeses, mascaraSelecionada]);

  // ─── Fetch MOVIMENTO_CONTA ────────────────────────────────
  const carregarDados = useCallback(async () => {
    if (!cliente) return;
    if (!cliente.usa_webposto || !cliente.chave_api_id) {
      setError('Fluxo de Caixa disponivel apenas para clientes Webposto (integracao Quality API).');
      return;
    }
    try {
      setLoadingDados(true);
      setDadosCarregados(false);
      setError(null);

      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API nao encontrada para este cliente');

      const total = meses.length;
      let concluidas = 0;
      setLoadingProgress({ atual: 0, total, mensagem: `Buscando movimentos de ${meses.length} mes(es)...` });

      const results = await Promise.all(meses.map(async m => {
        const r = rangeMes(m.ano, m.mes);
        const filtros = { dataInicial: r.dataInicial, dataFinal: r.dataFinal, empresaCodigo: cliente.empresa_codigo };
        const movs = await qualityApi.buscarMovimentoConta(chave.chave, filtros);
        concluidas++;
        setLoadingProgress({ atual: concluidas, total, mensagem: `${m.label}: ${movs?.length || 0} movimentos` });
        return { key: m.key, movimentos: movs || [] };
      }));

      const mapa = {};
      results.forEach(r => { mapa[r.key] = { movimentos: r.movimentos }; });
      setDadosPorMes(mapa);
      setDadosCarregados(true);
    } catch (err) {
      setError('Erro ao buscar movimentos: ' + err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [cliente, meses]);

  const handleMontarFluxo = useCallback(() => {
    setReportSolicitado(true);
    setDadosCarregados(false);
    setReportReady(false);
    carregarDados();
  }, [carregarDados]);

  // ─── Report ready orchestration ───────────────────────────
  useEffect(() => {
    const tudoPronto = dadosCarregados && !loadingDados && reportSolicitado;
    if (!tudoPronto) { setReportReady(false); return; }
    let raf1, raf2;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReportReady(true));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [dadosCarregados, loadingDados, reportSolicitado, dadosPorMes, grupos, mapeamentos]);

  // Map contaCodigo -> classificacao (tipo). Se nao tem classif, default = 'bancaria'
  const tipoPorConta = useMemo(() => {
    const m = new Map();
    contasClassificadas.forEach(c => {
      if (c.ativo !== false) m.set(c.conta_codigo, c.tipo);
    });
    return m;
  }, [contasClassificadas]);

  // Map contaCodigo -> descricao (da CONTA endpoint)
  const descricaoPorConta = useMemo(() => {
    const m = new Map();
    contasMeta.forEach(c => {
      const cod = c.contaCodigo ?? c.codigo;
      if (cod != null) m.set(cod, c.descricao || c.nome || `Conta #${cod}`);
    });
    return m;
  }, [contasMeta]);

  // Lista de contas que aparecem nos movimentos E passam no filtro de tipo.
  // Usada para popular o multiselect (so mostra contas elegiveis para fluxo de caixa
  // da empresa selecionada).
  const contasDisponiveis = useMemo(() => {
    const set = new Map();
    Object.values(dadosPorMes).forEach(dados => {
      (dados.movimentos || []).forEach(m => {
        if (m.contaCodigo == null) return;
        const ehTransferencia = m.transferencia === 'S' || m.transferencia === true;
        if (ehTransferencia && !incluirTransferencias) return;
        const tipoConta = tipoPorConta.get(m.contaCodigo) || 'bancaria';
        if (!tiposContaAtivos.has(tipoConta)) return;
        if (!set.has(m.contaCodigo)) {
          set.set(m.contaCodigo, descricaoPorConta.get(m.contaCodigo) || `Conta #${m.contaCodigo}`);
        }
      });
    });
    return Array.from(set.entries())
      .map(([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [dadosPorMes, tipoPorConta, tiposContaAtivos, descricaoPorConta, incluirTransferencias]);

  // ─── Indexar movimentos por conta + mes ───────────────────
  // Crédito = +valor (entrou caixa). Débito = -valor (saiu caixa).
  // Aplica filtros: transferencias internas + tipo de conta + contas especificas.
  const { totaisPorConta, lancamentosPorConta } = useMemo(() => {
    const totais = {};
    const lancs = {};
    Object.entries(dadosPorMes).forEach(([mesKey, dados]) => {
      (dados.movimentos || []).forEach(m => {
        // 0. Filtra transferencias internas (repasse entre contas proprias).
        //    Quality marca transferencia='S' em ambos os lados do lancamento.
        //    Excluimos por default para nao duplicar entradas no fluxo.
        const ehTransferencia = m.transferencia === 'S' || m.transferencia === true;
        if (ehTransferencia && !incluirTransferencias) return;

        // 1. Filtro por classificacao
        const tipoConta = tipoPorConta.get(m.contaCodigo) || 'bancaria';
        if (!tiposContaAtivos.has(tipoConta)) return;
        // 2. Filtro por conta especifica (multiselect); vazio = todas
        if (filtroContas.size > 0 && !filtroContas.has(m.contaCodigo)) return;

        const codigo = String(m.planoContaGerencialCodigo || '');
        if (!codigo) return;
        const sinal = m.tipo === 'Crédito' ? 1 : -1;
        const valor = Math.abs(Number(m.valor || 0)) * sinal;

        if (!totais[codigo]) totais[codigo] = {};
        totais[codigo][mesKey] = (totais[codigo][mesKey] || 0) + valor;

        if (!lancs[codigo]) lancs[codigo] = [];
        lancs[codigo].push({
          id: m.codigo || `${m.movimentoContaCodigo}`,
          mesKey,
          data: m.dataMovimento,
          descricao: (m.descricao || '').trim() || '—',
          tipoDoc: m.tipoDocumentoOrigem,
          valor: Math.abs(Number(m.valor || 0)),
          sinal,
        });
      });
    });
    return { totaisPorConta: totais, lancamentosPorConta: lancs };
  }, [dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas, incluirTransferencias]);

  // ─── Build Fluxo tree ─────────────────────────────────────
  const fluxoTree = useMemo(() => {
    if (!grupos.length) return [];

    function buildNode(grupo) {
      const contasMapeadas = mapeamentos.filter(m => m.grupo_fluxo_id === grupo.id);
      const contas = contasMapeadas.map(m => {
        const codKey = String(m.plano_conta_codigo);
        const valoresPorMes = {};
        let totalPeriodo = 0;
        meses.forEach(mes => {
          const v = totaisPorConta[codKey]?.[mes.key] || 0;
          valoresPorMes[mes.key] = v;
          totalPeriodo += v;
        });
        const lancs = (lancamentosPorConta[codKey] || [])
          .slice()
          .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
        return {
          id: m.id,
          codigo: m.plano_conta_codigo,
          descricao: m.plano_conta_descricao,
          isManual: m.isManual,
          valoresPorMes,
          totalPeriodo,
          lancamentos: lancs,
        };
      });

      const children = grupos
        .filter(g => g.parent_id === grupo.id)
        .sort((a, b) => a.ordem - b.ordem)
        .map(buildNode);

      const valoresPorMes = {};
      let totalPeriodo = 0;
      meses.forEach(mes => {
        const fromContas = contas.reduce((s, c) => s + (c.valoresPorMes[mes.key] || 0), 0);
        const fromChildren = children.reduce((s, c) => s + (c.valoresPorMes[mes.key] || 0), 0);
        valoresPorMes[mes.key] = fromContas + fromChildren;
        totalPeriodo += valoresPorMes[mes.key];
      });

      return { ...grupo, contas, children, valoresPorMes, totalPeriodo };
    }

    return grupos
      .filter(g => !g.parent_id)
      .sort((a, b) => a.ordem - b.ordem)
      .map(buildNode);
  }, [grupos, mapeamentos, totaisPorConta, lancamentosPorConta, meses]);

  // ─── Acumulado para subtotais/resultados ───────────────────
  const fluxoComCalculos = useMemo(() => {
    const acumPorMes = {};
    let acumTotal = 0;
    meses.forEach(m => { acumPorMes[m.key] = 0; });

    return fluxoTree.map(node => {
      if (node.tipo === 'subtotal' || node.tipo === 'resultado') {
        return {
          ...node,
          isCalc: true,
          valoresPorMes: { ...acumPorMes },
          totalPeriodo: acumTotal,
        };
      }
      meses.forEach(m => { acumPorMes[m.key] += (node.valoresPorMes[m.key] || 0); });
      acumTotal += node.totalPeriodo;
      return node;
    });
  }, [fluxoTree, meses]);

  const totalGeral = useMemo(() =>
    fluxoComCalculos.find(n => n.tipo === 'resultado')?.totalPeriodo
    ?? fluxoTree.reduce((s, n) => s + n.totalPeriodo, 0)
  , [fluxoComCalculos, fluxoTree]);

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

  const handlePrint = () => window.print();

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
      <style>{`
        @media print {
          html, body { background: white !important; }
          html *, body * { background: transparent !important; background-color: transparent !important; box-shadow: none !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          aside, header { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          @page { size: A4 portrait; margin: 1.2cm; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between gap-4 mb-6 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(backTarget)}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">Fluxo de Caixa</h2>
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
          <button onClick={handleMontarFluxo} disabled={loadingDados || !mascaraSelecionada || !reportSolicitado}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
            {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
          <button onClick={handlePrint} disabled={!reportReady}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50">
            <Printer className="h-4 w-4" /> Gerar PDF
          </button>
        </div>
      </motion.div>

      {/* Print header */}
      <div className="print-only" style={{ display: 'none', marginBottom: 16, borderBottom: '2px solid #000', paddingBottom: 10 }}>
        <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: 0 }}>Fluxo de Caixa</h1>
        <p style={{ fontSize: '10pt', margin: '4px 0' }}>{cliente.nome}{cliente.cnpj ? ` - CNPJ ${cliente.cnpj}` : ''}</p>
        <p style={{ fontSize: '10pt', margin: '4px 0', color: '#666' }}>Periodo: {periodoLabel} &middot; Mascara: {mascaraSelecionada?.nome}</p>
      </div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-200/60 p-4 mb-5 shadow-sm no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mascara Fluxo de Caixa</label>
            <select value={mascaraSelecionada?.id || ''}
              onChange={(e) => setMascaraSelecionada(mascaras.find(m => m.id === e.target.value))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">
              {mascaras.length === 0 && <option value="">Nenhuma mascara cadastrada</option>}
              {mascaras.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>

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

          <div>
            <button onClick={handleMontarFluxo} disabled={loadingDados || !mascaraSelecionada}
              className="flex items-center gap-2 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Montar Fluxo
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {/* Filtro por tipo de conta */}
            <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
              <span className="px-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Tipo:</span>
              {[
                { key: 'bancaria', label: 'Bancaria' },
                { key: 'caixa', label: 'Caixa' },
                { key: 'recebimento', label: 'Recebimento' },
              ].map(opt => {
                const ativo = tiposContaAtivos.has(opt.key);
                return (
                  <button key={opt.key} type="button"
                    onClick={() => setTiposContaAtivos(prev => {
                      const next = new Set(prev);
                      next.has(opt.key) ? next.delete(opt.key) : next.add(opt.key);
                      return next.size === 0 ? prev : next;
                    })}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                      ativo ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700'
                    }`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {/* Filtro multi-select por conta especifica */}
            <MultiSelectContas
              contas={contasDisponiveis}
              selecionadas={filtroContas}
              onChange={setFiltroContas}
              open={filtroContasOpen}
              setOpen={setFiltroContasOpen}
            />
            <button onClick={() => setIncluirTransferencias(!incluirTransferencias)}
              title="Por padrao transferencias entre contas (transferencia=S) sao excluidas do fluxo. Ative para inclui-las."
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all border ${
                incluirTransferencias ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              <RefreshCw className="h-3.5 w-3.5" />
              {incluirTransferencias ? 'Com transferencias' : 'Sem transferencias'}
            </button>
            <button onClick={() => setOcultarZeradas(!ocultarZeradas)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all border ${
                ocultarZeradas ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {ocultarZeradas ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              Ocultar zeradas
            </button>
          </div>
        </div>
      </motion.div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2 no-print">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {!reportSolicitado ? (
          <motion.div key="aguardando" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
              <Wallet className="h-7 w-7 text-white" />
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Selecione o periodo e clique em "Montar Fluxo"</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              O relatorio sera gerado a partir das movimentacoes de caixa em <strong>{meses.map(m => m.label).join(', ')}</strong>.
            </p>
          </motion.div>
        ) : loadingDados ? (
          <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
            <Loader2 className="h-7 w-7 text-emerald-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-800 mb-1">{loadingProgress.mensagem}</p>
            <p className="text-xs text-gray-400">{loadingProgress.atual} de {loadingProgress.total}</p>
          </motion.div>
        ) : !grupos.length ? (
          <motion.div key="empty-mascara" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
            <Layers className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-800 mb-1">Mascara vazia</p>
            <p className="text-xs text-gray-400">Configure a estrutura em Parametros &gt; Mascaras Fluxo de Caixa</p>
          </motion.div>
        ) : (
          <motion.div key="report" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between no-print">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Layers className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">{mascaraSelecionada?.nome}</h3>
                  <p className="text-[11px] text-gray-400">{periodoLabel}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Variacao de caixa</p>
                <p className={`text-base font-bold ${totalGeral >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(totalGeral)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" style={{ tableLayout: 'fixed', minWidth: 490 + meses.length * 120 + 140 }}>
                <colgroup>
                  <col style={{ width: 490 }} />
                  {meses.map(m => <col key={`${m.key}-v`} style={{ width: 120 }} />)}
                  <col style={{ width: 140 }} />
                </colgroup>
                <thead className="bg-gray-50/80">
                  <tr className="text-gray-500">
                    <th className="text-left px-4 py-2.5 font-medium uppercase text-[10px] tracking-wider whitespace-nowrap">Linha</th>
                    {meses.map(m => (
                      <th key={`${m.key}-h`} className="text-right px-3 py-2.5 font-medium uppercase text-[10px] tracking-wider whitespace-nowrap">
                        {m.label} (R$)
                      </th>
                    ))}
                    <th className="text-right px-3 py-2.5 font-medium uppercase text-[10px] tracking-wider bg-gray-100/60 whitespace-nowrap">Total (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {fluxoComCalculos.map(node => (
                    <FluxoNodeRows key={node.id} node={node} depth={0}
                      meses={meses}
                      expandedGrupos={expandedGrupos}
                      expandedContas={expandedContas}
                      onToggleGrupo={toggleGrupo}
                      onToggleConta={toggleConta}
                      ocultarZeradas={ocultarZeradas}
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

// ─── Recursive row renderer ─────────────────────────────────
function FluxoNodeRows({ node, depth, meses, expandedGrupos, expandedContas, onToggleGrupo, onToggleConta, ocultarZeradas }) {
  const isCalc = node.tipo === 'subtotal' || node.tipo === 'resultado';
  const isResultado = node.tipo === 'resultado';
  const isExpanded = expandedGrupos.has(node.id);
  const indent = depth * 16;

  const hasChildren = (node.children && node.children.length > 0) || (node.contas && node.contas.length > 0);

  const contasFiltradas = ocultarZeradas
    ? (node.contas || []).filter(c => Math.abs(c.totalPeriodo) > 0.01)
    : (node.contas || []);

  const childrenFiltrados = ocultarZeradas
    ? (node.children || []).filter(c => Math.abs(c.totalPeriodo) > 0.01 || ['subtotal', 'resultado'].includes(c.tipo))
    : (node.children || []);

  if (ocultarZeradas && !isCalc && Math.abs(node.totalPeriodo) < 0.01 && contasFiltradas.length === 0 && childrenFiltrados.length === 0) {
    return null;
  }

  const rowBg = isResultado
    ? (node.totalPeriodo >= 0 ? 'bg-emerald-50' : 'bg-red-50')
    : isCalc
      ? 'bg-slate-50'
      : depth === 0 ? 'bg-gray-50/60' : '';

  return (
    <>
      <tr className={`border-b border-gray-50 ${rowBg} ${!isCalc ? 'hover:bg-emerald-50/30' : ''}`}>
        <td className="px-4 py-2 overflow-hidden" style={{ paddingLeft: 12 + indent }}>
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
                : isResultado ? `text-[12px] font-bold uppercase ${node.totalPeriodo >= 0 ? 'text-emerald-800' : 'text-red-700'}`
                  : isCalc ? 'text-[12px] font-semibold text-gray-700 uppercase'
                    : depth === 1 ? 'text-[12px] font-semibold text-gray-800 uppercase'
                      : 'text-[12px] font-normal text-gray-700'
            }`}>{node.nome}</span>
          </div>
        </td>
        {meses.map(m => {
          const v = node.valoresPorMes[m.key] || 0;
          return (
            <td key={`${m.key}-v`} className={`text-right px-3 py-2 font-mono tabular-nums whitespace-nowrap ${
              isResultado ? `font-bold ${v >= 0 ? 'text-emerald-700' : 'text-red-600'}`
                : isCalc ? 'font-semibold text-gray-700'
                  : v >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}>
              {formatCurrencyCompact(v)}
            </td>
          );
        })}
        <td className={`text-right px-3 py-2 font-mono tabular-nums whitespace-nowrap bg-gray-50/40 ${
          isResultado ? `font-bold ${node.totalPeriodo >= 0 ? 'text-emerald-700' : 'text-red-600'}`
            : isCalc ? 'font-semibold text-gray-700'
              : node.totalPeriodo >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'
        }`}>
          {formatCurrencyCompact(node.totalPeriodo)}
        </td>
      </tr>

      <AnimatePresence>
        {isExpanded && !isCalc && childrenFiltrados.map(child => (
          <FluxoNodeRows key={child.id} node={child} depth={depth + 1}
            meses={meses}
            expandedGrupos={expandedGrupos}
            expandedContas={expandedContas}
            onToggleGrupo={onToggleGrupo}
            onToggleConta={onToggleConta}
            ocultarZeradas={ocultarZeradas}
          />
        ))}
      </AnimatePresence>

      {isExpanded && !isCalc && contasFiltradas.map(conta => {
        const isContaExpanded = expandedContas?.has(conta.id);
        const temLancs = conta.lancamentos && conta.lancamentos.length > 0;
        return (
          <ExpandedConta key={conta.id} conta={conta} indent={indent}
            meses={meses} isContaExpanded={isContaExpanded} temLancs={temLancs}
            onToggleConta={onToggleConta} />
        );
      })}
    </>
  );
}

function ExpandedConta({ conta, indent, meses, isContaExpanded, temLancs, onToggleConta }) {
  return (
    <>
      <tr className="border-b border-gray-50 hover:bg-emerald-50/20">
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
              <div className="h-1 w-1 rounded-full bg-emerald-300 flex-shrink-0" />
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
          return (
            <td key={`${m.key}-v`} className={`text-right px-3 py-1.5 font-mono tabular-nums text-[11px] whitespace-nowrap ${
              v >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}>
              {formatCurrencyCompact(v)}
            </td>
          );
        })}
        <td className={`text-right px-3 py-1.5 font-mono tabular-nums text-[11px] bg-gray-50/40 whitespace-nowrap ${
          conta.totalPeriodo >= 0 ? 'text-emerald-700' : 'text-red-600'
        }`}>
          {formatCurrencyCompact(conta.totalPeriodo)}
        </td>
      </tr>

      {isContaExpanded && temLancs && conta.lancamentos.map(l => (
        <tr key={`l-${l.id}`} className="border-b border-gray-50 bg-gray-50/30 hover:bg-emerald-50/20">
          <td className="px-4 py-1 overflow-hidden" style={{ paddingLeft: 12 + indent + 48 }}>
            <div className="flex items-center gap-2.5 text-[10.5px] min-w-0">
              <span className="font-mono text-gray-400 w-14 flex-shrink-0">{formatDataBR(l.data)}</span>
              <span title={l.descricao} className="text-gray-700 truncate min-w-0 flex-1">{l.descricao}</span>
              {l.tipoDoc && (
                <span className="text-[9px] rounded px-1.5 py-0.5 bg-gray-100 text-gray-500 flex-shrink-0">
                  {l.tipoDoc}
                </span>
              )}
            </div>
          </td>
          {meses.map(m => (
            <td key={`${m.key}-v`} className={`text-right px-3 py-1 font-mono tabular-nums text-[10.5px] whitespace-nowrap ${l.sinal > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {l.mesKey === m.key ? formatCurrencyCompact(l.valor * l.sinal) : ''}
            </td>
          ))}
          <td className={`text-right px-3 py-1 font-mono tabular-nums text-[10.5px] bg-gray-100/40 whitespace-nowrap ${l.sinal > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {formatCurrencyCompact(l.valor * l.sinal)}
          </td>
        </tr>
      ))}
    </>
  );
}

function formatDataBR(d) {
  if (!d) return '—';
  const [y, m, dd] = String(d).split('-');
  if (!y || !m || !dd) return d;
  return `${dd}/${m}/${y.slice(2)}`;
}

function formatCurrencyCompact(value) {
  if (value == null || isNaN(value)) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function MultiSelectContas({ contas, selecionadas, onChange, open, setOpen }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  const toggle = (codigo) => {
    const next = new Set(selecionadas);
    next.has(codigo) ? next.delete(codigo) : next.add(codigo);
    onChange(next);
  };
  const marcarTodas = () => onChange(new Set(contas.map(c => c.codigo)));
  const limpar = () => onChange(new Set());

  const label = selecionadas.size === 0
    ? 'Todas as contas'
    : selecionadas.size === 1
      ? (contas.find(c => c.codigo === [...selecionadas][0])?.nome || '1 conta')
      : `${selecionadas.size} contas`;

  return (
    <div ref={ref} className="relative min-w-[200px]">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-left flex items-center gap-2 hover:border-blue-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
        <span className="flex-1 truncate text-gray-700">{label}</span>
        {selecionadas.size > 0 && (
          <span className="rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 flex-shrink-0">
            {selecionadas.size}
          </span>
        )}
        <span className={`text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-30 w-[260px] bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/60">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Contas</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={marcarTodas}
                className="text-[10px] font-medium text-blue-600 hover:text-blue-800">Todas</button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={limpar}
                className="text-[10px] font-medium text-gray-500 hover:text-gray-800">Limpar</button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {contas.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-500">Nenhuma conta com movimento no periodo.</p>
            ) : contas.map(c => {
              const marcada = selecionadas.has(c.codigo);
              return (
                <label key={c.codigo}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${marcada ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>
                  <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    marcada ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                  }`}>
                    {marcada && <span className="text-white text-[10px] leading-none">✓</span>}
                  </div>
                  <input type="checkbox" className="hidden" checked={marcada} onChange={() => toggle(c.codigo)} />
                  <span className="flex-1 text-xs text-gray-800 truncate">{c.nome}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
