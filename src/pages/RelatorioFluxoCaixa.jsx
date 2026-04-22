import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

// Codigo sintetico usado para agrupar movimentos sem planoContaGerencial
// (ou com plano nao mapeado) no fluxo. Nao colide com codigos reais.
const SEM_PLANO_PREFIX = '__sem_plano__';

function rangeMes(ano, mes) {
  const mm = String(mes).padStart(2, '0');
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return {
    dataInicial: `${ano}-${mm}-01`,
    dataFinal: `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

// Formata uma duracao em ms em algo curto e legivel (ex: "850 ms", "12,3s", "1m 23s")
function formatDuracao(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace('.', ',')}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s - m * 60);
  return `${m}m ${rest}s`;
}

// redeContexto (opcional): { nomeRede, chaveApiId, empresaCodigos, empresas }.
// Quando passado, o Fluxo de Caixa agrega todas as empresas da rede.
export default function RelatorioFluxoCaixa({ clienteIdOverride, backHref, redeContexto } = {}) {
  const params = useParams();
  const clienteId = clienteIdOverride || params.clienteId;
  const navigate = useNavigate();
  const modoRede = !!redeContexto;
  const backTarget = backHref || (modoRede ? '/admin/relatorios-cliente' : `/admin/relatorios-cliente/${clienteId}`);

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
  const [tempoGeracao, setTempoGeracao] = useState(null); // ms
  const [expandedGrupos, setExpandedGrupos] = useState(new Set());
  const [expandedContas, setExpandedContas] = useState(new Set());
  // Modal de inspecao de movimentos de um tipoDocumentoOrigem especifico

  // Filtro por tipo de conta no fluxo de caixa:
  //  - bancaria: conta corrente
  //  - caixa: caixa fisico
  // Aplicacao (movimento interno) e Outras ficam fora do fluxo por padrao e nao
  // sao selecionaveis aqui - quando necessario, usa o filtro por conta especifica.
  const [tiposContaAtivos, setTiposContaAtivos] = useState(
    () => new Set(['bancaria', 'caixa'])
  );
  const [contasClassificadas, setContasClassificadas] = useState([]);

  // Transferencias (TRANSFERENCIA/TRANSFERENCIA_BANCARIA/TRANSFERENCIA_SANGRIA)
  // sempre entram no fluxo - nao ha mais toggle para excluir.

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
  // Em modo rede monta cliente virtual com chave_api_id e lista de empresas.
  useEffect(() => {
    (async () => {
      try {
        if (modoRede) {
          const virtualCliente = {
            id: `__rede__${redeContexto.chaveApiId}`,
            nome: redeContexto.nomeRede,
            chave_api_id: redeContexto.chaveApiId,
            usa_webposto: true,
            empresa_codigo: redeContexto.empresaCodigos?.[0] ?? null,
            _empresaCodigos: redeContexto.empresaCodigos || [],
            _empresas: redeContexto.empresas || [],
            _nomeRede: redeContexto.nomeRede,
          };
          const masks = await fluxoService.listarMascaras();
          setCliente(virtualCliente);
          setMascaras(masks || []);
          if (masks && masks.length > 0) setMascaraSelecionada(masks[0]);
          try {
            const chavesApi = await mapService.listarChavesApi();
            const chave = chavesApi.find(ch => ch.id === redeContexto.chaveApiId);
            const tasks = [contasBancariasService.listarPorRede(redeContexto.chaveApiId)];
            if (chave?.chave) tasks.push(qualityApi.buscarContas(chave.chave));
            const [classif, ctas] = await Promise.all(tasks);
            setContasClassificadas(classif || []);
            setContasMeta(ctas || []);
          } catch (_) { setContasClassificadas([]); setContasMeta([]); }
        } else {
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
        }
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, modoRede, redeContexto?.chaveApiId]);

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

  // Map codigo do titulo a pagar -> objeto completo do titulo.
  // Usado para: (1) resolver o plano de movimentos TITULO_PAGAR_PAGAMENTO;
  // (2) detalhar o titulo baixado quando o usuario expande o lancamento.
  const [tituloPagarMap, setTituloPagarMap] = useState(new Map());
  // Map codigoPagamento (vem do array nested titulo.pagamento[]) -> lista de titulos.
  // Usado pra resolver MOVIMENTO_CONTA.documentoOrigemCodigo em pagamentos em lote
  // (um pagamento pode aparecer em varios titulos = 1 movimento cobre N titulos).
  const [titulosPorPagamento, setTitulosPorPagamento] = useState(new Map());
  // Lancamentos expandidos mostram os dados do documento origem quando aplicavel
  const [expandedLancamentos, setExpandedLancamentos] = useState(new Set());

  // ─── Fetch MOVIMENTO_CONTA + TITULO_PAGAR ─────────────────
  const carregarDados = useCallback(async () => {
    if (!cliente) return;
    if (!cliente.usa_webposto || !cliente.chave_api_id) {
      setError('Fluxo de Caixa disponivel apenas para clientes Webposto (integracao Quality API).');
      return;
    }
    const _t0 = performance.now();
    try {
      setLoadingDados(true);
      setDadosCarregados(false);
      setError(null);
      setTempoGeracao(null);

      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API nao encontrada para este cliente');

      const total = meses.length;
      let concluidas = 0;
      setLoadingProgress({ atual: 0, total, mensagem: `Buscando movimentos de ${meses.length} mes(es)...` });

      // Em modo rede iteramos todos os empresaCodigos e anotamos empresaCodigo
      // em cada movimento (a API geralmente retorna, mas garantimos consistencia).
      const empresaCodigos = modoRede
        ? (cliente?._empresaCodigos || [])
        : [cliente.empresa_codigo];

      const results = await Promise.all(meses.map(async m => {
        const r = rangeMes(m.ano, m.mes);
        const todos = [];
        for (const ec of empresaCodigos) {
          const filtros = { dataInicial: r.dataInicial, dataFinal: r.dataFinal, empresaCodigo: ec };
          const movs = await qualityApi.buscarMovimentoConta(chave.chave, filtros);
          const annotated = (movs || []).map(mv => modoRede ? ({ ...mv, empresaCodigo: ec }) : mv);
          todos.push(...annotated);
        }
        concluidas++;
        setLoadingProgress({ atual: concluidas, total, mensagem: `${m.label}: ${todos.length} movimentos${modoRede ? ` (${empresaCodigos.length} empresas)` : ''}` });
        return { key: m.key, movimentos: todos };
      }));

      const mapa = {};
      results.forEach(r => { mapa[r.key] = { movimentos: r.movimentos }; });
      setDadosPorMes(mapa);

      // Busca titulos a pagar num intervalo ampliado (12 meses antes do inicio
      // do periodo), pra pegar pagamentos de titulos emitidos ha mais tempo.
      // Ignora erro: se falhar, o TITULO_PAGAR_PAGAMENTO volta pra "sem classificacao".
      try {
        const primeiroMes = meses[0];
        const ultimoMes = meses[meses.length - 1];
        const rInicio = rangeMes(primeiroMes.ano - 1, primeiroMes.mes);
        const rFim = rangeMes(ultimoMes.ano, ultimoMes.mes);
        setLoadingProgress({ atual: total, total, mensagem: 'Buscando titulos a pagar para resolver pagamentos...' });
        // Em modo rede concatena titulos de todas as empresas da rede.
        const allTitulos = [];
        for (const ec of empresaCodigos) {
          const t = await qualityApi.buscarTitulosPagar(chave.chave, {
            dataInicial: rInicio.dataInicial,
            dataFinal: rFim.dataFinal,
            empresaCodigo: ec,
          });
          allTitulos.push(...(t || []));
        }
        const titulos = allTitulos;
        const mapaTitulos = new Map();
        // Indice reverso: titulo.pagamento[].codigoDocumento -> lista de titulos.
        // codigoDocumento casa com MOVIMENTO_CONTA.movimentoContaCodigo (onde
        // tipoDocumentoOrigem = TITULO_PAGAR_PAGAMENTO). Esta e a ligacao real;
        // um mesmo codigoDocumento pode aparecer em varios titulos = pagamento em lote.
        const mapaPorPagamento = new Map();
        (titulos || []).forEach(t => {
          const cod = t.tituloPagarCodigo ?? t.codigo;
          if (cod != null) mapaTitulos.set(Number(cod), t);
          if (Array.isArray(t.pagamento)) {
            t.pagamento.forEach(p => {
              const codDoc = p?.codigoDocumento;
              if (codDoc == null) return;
              const key = Number(codDoc);
              if (!Number.isFinite(key)) return;
              if (!mapaPorPagamento.has(key)) mapaPorPagamento.set(key, []);
              const lista = mapaPorPagamento.get(key);
              if (!lista.includes(t)) lista.push(t);
            });
          }
        });
        setTituloPagarMap(mapaTitulos);
        setTitulosPorPagamento(mapaPorPagamento);
      } catch (_) {
        setTituloPagarMap(new Map());
        setTitulosPorPagamento(new Map());
      }

      setDadosCarregados(true);
      setTempoGeracao(performance.now() - _t0);
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

  // Map contaCodigo (sempre como Number) -> classificacao (tipo).
  // Coagir a Number evita mismatch com m.contaCodigo que pode vir string da API.
  const tipoPorConta = useMemo(() => {
    const m = new Map();
    contasClassificadas.forEach(c => {
      if (c.ativo !== false) m.set(Number(c.conta_codigo), c.tipo);
    });
    return m;
  }, [contasClassificadas]);

  // Quantas contas ATIVAS da rede estao classificadas como bancaria/caixa.
  // Zero = usuario ainda nao classificou nada, fluxo vai sair vazio.
  const qtdContasFluxo = useMemo(
    () => contasClassificadas.filter(c => c.ativo !== false && (c.tipo === 'bancaria' || c.tipo === 'caixa')).length,
    [contasClassificadas],
  );

  // Map contaCodigo (sempre Number) -> descricao (da CONTA endpoint)
  const descricaoPorConta = useMemo(() => {
    const m = new Map();
    contasMeta.forEach(c => {
      const cod = c.contaCodigo ?? c.codigo;
      if (cod != null) m.set(Number(cod), c.descricao || c.nome || `Conta #${cod}`);
    });
    return m;
  }, [contasMeta]);

  // Lista de contas que aparecem nos movimentos da empresa selecionada.
  // Respeita o toggle de tipos (tiposContaAtivos) - conta de tipo nao selecionado
  // nao entra nem no dropdown nem nos calculos.
  const contasDisponiveis = useMemo(() => {
    const set = new Map();
    Object.values(dadosPorMes).forEach(dados => {
      (dados.movimentos || []).forEach(m => {
        if (m.contaCodigo == null) return;
        const cod = Number(m.contaCodigo);
        const tipoConta = tipoPorConta.get(cod);
        if (tipoConta !== 'bancaria' && tipoConta !== 'caixa') return;
        if (!tiposContaAtivos.has(tipoConta)) return;
        if (!set.has(cod)) {
          set.set(cod, descricaoPorConta.get(cod) || `Conta #${cod}`);
        }
      });
    });
    return Array.from(set.entries())
      .map(([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [dadosPorMes, tipoPorConta, descricaoPorConta, tiposContaAtivos]);

  // ─── Indexar movimentos por conta + mes ───────────────────
  // Crédito = +valor (entrou caixa). Débito = -valor (saiu caixa).
  // Aplica filtros: tipo de conta + contas especificas.
  const { totaisPorConta, lancamentosPorConta } = useMemo(() => {
    const totais = {};
    const lancs = {};
    Object.entries(dadosPorMes).forEach(([mesKey, dados]) => {
      (dados.movimentos || []).forEach(m => {
        if (m.contaCodigo == null) return;
        const cod = Number(m.contaCodigo);
        // 1. Filtro por classificacao - precisa ser explicita em Cadastros > Clientes.
        //    Conta sem classificacao (ou aplicacao/outras) NAO entra no fluxo.
        const tipoConta = tipoPorConta.get(cod);
        if (tipoConta !== 'bancaria' && tipoConta !== 'caixa') return;
        if (!tiposContaAtivos.has(tipoConta)) return;
        // 2. Filtro por conta especifica (multiselect); vazio = todas
        if (filtroContas.size > 0 && !filtroContas.has(cod)) return;

        // Movimentos sem planoContaGerencialCodigo (ex: transferencias internas,
        // caixa, suprimento etc) sao agrupados por tipoDocumentoOrigem num
        // bucket "Sem classificacao" para nao sumirem do relatorio.
        let planoBruto = m.planoContaGerencialCodigo;
        let temPlano = planoBruto != null && planoBruto !== 0 && planoBruto !== '';

        const sinal = m.tipo === 'Crédito' ? 1 : -1;
        const valorAbs = Math.abs(Number(m.valor || 0));
        const valor = valorAbs * sinal;
        const idBase = m.codigo || `${m.movimentoContaCodigo}`;

        // ─ TITULO_PAGAR_PAGAMENTO: liga via titulo.pagamento[].codigoDocumento ─
        //   codigoDocumento == MOVIMENTO_CONTA.movimentoContaCodigo.
        //   Valor consumido no fluxo vem do TITULO_PAGAR (pagamento[].valorPago),
        //   NAO do m.valor. Multiplos titulos podem compartilhar o mesmo
        //   movimentoContaCodigo quando o pagamento foi feito em lote.
        if (m.tipoDocumentoOrigem === 'TITULO_PAGAR_PAGAMENTO' && m.movimentoContaCodigo != null) {
          const chave = Number(m.movimentoContaCodigo);
          const lote = titulosPorPagamento.get(chave);
          if (Array.isArray(lote) && lote.length > 0) {
            // Para cada titulo do lote: o valor efetivo no fluxo e o valorPago
            // do PROPRIO titulo (top-level), nao m.valor nem entry.valor (que
            // pode vir com o total do lote, comum em lotes do Quality).
            // Preferencia: entry.valorPago -> t.valorPago -> t.valor.
            const entradas = lote.map(t => {
              const entry = Array.isArray(t.pagamento)
                ? t.pagamento.find(p => Number(p?.codigoDocumento) === chave)
                : null;
              const valorDoTitulo = Math.max(0, Number(
                entry?.valorPago ?? t.valorPago ?? t.valor ?? t.valorTitulo ?? 0
              ));
              return { titulo: t, valorTitulo: valorDoTitulo, planoCod: t.planoContaGerencialCodigo };
            }).filter(x => x.valorTitulo > 0);

            const entradasComPlano = entradas.filter(x => x.planoCod != null && x.planoCod !== 0);
            const totalTitulos = entradasComPlano.reduce((s, x) => s + x.valorTitulo, 0);

            if (entradasComPlano.length > 0 && totalTitulos > 0) {
              // Distribui cada pedaco no plano do seu titulo, com o valor do TITULO_PAGAR.
              entradasComPlano.forEach((x, idx) => {
                const parcela = x.valorTitulo * sinal;
                const planoKey = String(x.planoCod);
                if (!totais[planoKey]) totais[planoKey] = {};
                totais[planoKey][mesKey] = (totais[planoKey][mesKey] || 0) + parcela;
                if (!lancs[planoKey]) lancs[planoKey] = [];
                const tituloCod = x.titulo.tituloPagarCodigo ?? x.titulo.codigo ?? null;
                const partLabel = entradasComPlano.length > 1
                  ? ` · parte do lote (${idx + 1}/${entradasComPlano.length}) · titulo #${tituloCod ?? '—'}`
                  : ` · titulo #${tituloCod ?? '—'}`;
                lancs[planoKey].push({
                  id: entradasComPlano.length > 1 ? `${idBase}-p${idx}` : idBase,
                  mesKey,
                  data: m.dataMovimento,
                  descricao: `${(m.descricao || '').trim() || '—'}${partLabel}`,
                  tipoDoc: m.tipoDocumentoOrigem,
                  movimentoContaCodigo: m.movimentoContaCodigo ?? null,
                  tituloPagarCodigo: tituloCod,
                  valor: x.valorTitulo,
                  sinal,
                });
              });
              return; // movimento distribuido via TITULO_PAGAR, pula o push normal
            }
          }
        }

        const codigo = temPlano
          ? String(planoBruto)
          : `${SEM_PLANO_PREFIX}${m.tipoDocumentoOrigem || 'OUTROS'}`;

        if (!totais[codigo]) totais[codigo] = {};
        totais[codigo][mesKey] = (totais[codigo][mesKey] || 0) + valor;

        if (!lancs[codigo]) lancs[codigo] = [];
        lancs[codigo].push({
          id: idBase,
          mesKey,
          data: m.dataMovimento,
          descricao: (m.descricao || '').trim() || '—',
          tipoDoc: m.tipoDocumentoOrigem,
          movimentoContaCodigo: m.movimentoContaCodigo ?? null,
          valor: valorAbs,
          sinal,
        });
      });
    });
    return { totaisPorConta: totais, lancamentosPorConta: lancs };
  }, [dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas, titulosPorPagamento]);

  // ─── Composicao do saldo por conta (saldo inicial + movs = saldo atual) ─
  // Respeita os mesmos filtros aplicados ao fluxo (bancaria/caixa + multi-select).
  // Fonte dos saldos: campos saldoAnterior e saldoPosterior/saldo do MOVIMENTO_CONTA.
  const composicaoSaldo = useMemo(() => {
    const todos = [];
    Object.values(dadosPorMes).forEach(d => (d.movimentos || []).forEach(m => todos.push(m)));
    todos.sort((a, b) => (a.dataMovimento || '').localeCompare(b.dataMovimento || ''));

    const porConta = new Map();
    todos.forEach(m => {
      if (m.contaCodigo == null) return;
      const cod = Number(m.contaCodigo);
      const tipoConta = tipoPorConta.get(cod);
      if (tipoConta !== 'bancaria' && tipoConta !== 'caixa') return;
      if (!tiposContaAtivos.has(tipoConta)) return;
      if (filtroContas.size > 0 && !filtroContas.has(cod)) return;

      let atual = porConta.get(cod);
      if (!atual) {
        const saldoIniCandidato = m.saldoAnterior ?? m.saldoAnteriorConta;
        atual = {
          contaCodigo: cod,
          contaNome: descricaoPorConta.get(cod) || `Conta #${cod}`,
          saldoInicial: saldoIniCandidato != null ? Number(saldoIniCandidato) : 0,
          entradas: 0,
          saidas: 0,
          saldoAtual: null,
        };
        porConta.set(cod, atual);
      }
      const valor = Math.abs(Number(m.valor || 0));
      if (m.tipo === 'Crédito') atual.entradas += valor;
      else atual.saidas += valor;
      const saldoPos = m.saldoPosterior ?? m.saldoApos ?? m.saldo;
      if (saldoPos != null) atual.saldoAtual = Number(saldoPos);
    });
    // Fallback: se nenhum movimento trouxe saldoPosterior, calcula pela variacao.
    porConta.forEach(c => {
      if (c.saldoAtual == null) c.saldoAtual = c.saldoInicial + c.entradas - c.saidas;
    });
    return Array.from(porConta.values())
      .sort((a, b) => (a.contaNome || '').localeCompare(b.contaNome || ''));
  }, [dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas, descricaoPorConta]);

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

  // ─── Grupo sintetico "Sem classificacao" ───────────────────
  // Captura movimentos que nao foram alocados em nenhum grupo da mascara:
  //   - Movimentos sem planoContaGerencialCodigo (agrupados por tipoDocumentoOrigem)
  //   - Planos gerenciais sem mapeamento pra grupo_fluxo
  // Fica fora do calculo de subtotais/resultado (nao vira "Variacao de Caixa")
  // pra evitar mascarar inconsistencias do DRE gerencial. E renderizado em bloco
  // separado abaixo da arvore principal, puramente informativo.
  const semClassificacaoNode = useMemo(() => {
    const mappedCodes = new Set(mapeamentos.map(m => String(m.plano_conta_codigo)));
    const contas = [];
    Object.entries(totaisPorConta).forEach(([codigo, valoresPorMesAll]) => {
      if (mappedCodes.has(codigo)) return; // ja entrou em algum grupo

      const semPlano = codigo.startsWith(SEM_PLANO_PREFIX);
      const tipoDoc = semPlano ? codigo.substring(SEM_PLANO_PREFIX.length) : null;
      const descricao = semPlano
        ? (tipoDoc || 'OUTROS').replace(/_/g, ' ')
        : `Plano #${codigo} (sem mapeamento)`;

      const valoresPorMes = {};
      let totalPeriodo = 0;
      meses.forEach(mes => {
        const v = valoresPorMesAll[mes.key] || 0;
        valoresPorMes[mes.key] = v;
        totalPeriodo += v;
      });

      const lancs = (lancamentosPorConta[codigo] || [])
        .slice()
        .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

      contas.push({
        id: `sc-${codigo}`,
        codigo,
        descricao,
        valoresPorMes,
        totalPeriodo,
        lancamentos: lancs,
      });
    });

    if (contas.length === 0) return null;

    // Ordena por |totalPeriodo| desc para trazer o maior impacto primeiro
    contas.sort((a, b) => Math.abs(b.totalPeriodo) - Math.abs(a.totalPeriodo));

    const valoresPorMes = {};
    let totalPeriodo = 0;
    meses.forEach(mes => {
      valoresPorMes[mes.key] = contas.reduce((s, c) => s + (c.valoresPorMes[mes.key] || 0), 0);
      totalPeriodo += valoresPorMes[mes.key];
    });

    return {
      id: '__sem_classificacao__',
      nome: 'Sem classificacao',
      tipo: 'grupo',
      contas,
      children: [],
      valoresPorMes,
      totalPeriodo,
      isSemClassificacao: true,
    };
  }, [totaisPorConta, lancamentosPorConta, mapeamentos, meses]);

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

  // ─── Resultado por empresa (apenas em modo rede) ─────────
  // Soma a variacao de caixa (entradas − saidas) por empresa, respeitando os
  // mesmos filtros aplicados na arvore (tipoConta bancaria/caixa explicito,
  // toggles e multi-select). Mostra quanto cada unidade contribuiu pro fluxo total.
  const resultadoPorEmpresa = useMemo(() => {
    if (!modoRede || !cliente?._empresas || cliente._empresas.length === 0) return null;

    const porEmpresa = {};
    cliente._empresas.forEach(emp => {
      const ec = Number(emp.empresa_codigo);
      if (!Number.isFinite(ec)) return;
      porEmpresa[ec] = { empresa: emp, empresaCodigo: ec, entradas: 0, saidas: 0, variacao: 0 };
    });

    Object.values(dadosPorMes).forEach(d => {
      (d.movimentos || []).forEach(m => {
        const ec = Number(m.empresaCodigo);
        if (!porEmpresa[ec]) return;
        if (m.contaCodigo == null) return;
        const contaCod = Number(m.contaCodigo);
        const tipoConta = tipoPorConta.get(contaCod);
        if (tipoConta !== 'bancaria' && tipoConta !== 'caixa') return;
        if (!tiposContaAtivos.has(tipoConta)) return;
        if (filtroContas.size > 0 && !filtroContas.has(contaCod)) return;
        const valor = Math.abs(Number(m.valor || 0));
        if (m.tipo === 'Crédito') porEmpresa[ec].entradas += valor;
        else porEmpresa[ec].saidas += valor;
      });
    });

    const arr = Object.values(porEmpresa).map(p => ({
      ...p,
      variacao: p.entradas - p.saidas,
    })).sort((a, b) => b.variacao - a.variacao);
    const somaAbs = arr.reduce((s, p) => s + Math.abs(p.variacao), 0);
    const totalConsolidado = arr.reduce((s, p) => s + p.variacao, 0);
    return {
      empresas: arr.map(p => ({
        ...p,
        participacao: somaAbs > 0 ? (Math.abs(p.variacao) / somaAbs) * 100 : 0,
      })),
      totalConsolidado,
    };
  }, [modoRede, cliente, dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas]);

  // Nao auto-expande o bloco "Sem classificacao" — usuario abre manualmente
  // quando quiser auditar itens fora da mascara.

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

  const toggleLancamento = (id) => {
    setExpandedLancamentos(prev => {
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
          html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          html *, body * { background: transparent !important; background-color: transparent !important; box-shadow: none !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          aside, header { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          /* Tamanhos reduzidos pra impressao A4 retrato (~194mm utiles).
             IMPORTANTE: nao usar "padding" curto com !important porque isso
             sobrescreve paddingLeft inline usado pra indentacao hierarquica. */
          html, body { font-size: 9pt; }
          table { font-size: 8pt !important; border-collapse: collapse; width: 100% !important; min-width: 0 !important; table-layout: auto !important; }
          table colgroup col { width: auto !important; }
          table th, table td { padding-top: 1.5px !important; padding-bottom: 1.5px !important; padding-right: 3px !important; line-height: 1.15 !important; white-space: normal !important; }
          table th { font-size: 6.5pt !important; }
          table td { font-size: 8pt !important; }
          h1, h2, h3 { font-size: 10pt !important; margin: 3px 0 !important; }
          .rounded-2xl, .rounded-xl, .rounded-lg { border-radius: 3px !important; }
          .border { border-width: 0.4pt !important; }
          .font-mono, .tabular-nums { font-size: 8.5pt !important; letter-spacing: -0.15px; }
          .overflow-x-auto { overflow: visible !important; }
          /* Impede quebra de pagina dentro de cards */
          .print-no-break { page-break-inside: avoid; break-inside: avoid; }
          @page { size: A4 portrait; margin: 8mm; }
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
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {modoRede ? 'Fluxo de Caixa · Rede consolidada' : 'Fluxo de Caixa'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Building2 className="h-3 w-3" />
              <span className="truncate">{cliente.nome}</span>
              {modoRede && cliente._empresaCodigos && (
                <span className="inline-flex items-center gap-1 text-blue-600 ml-1">
                  · {cliente._empresaCodigos.length} empresas
                </span>
              )}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: 0 }}>Fluxo de Caixa</h1>
            <p style={{ fontSize: '10pt', margin: '4px 0' }}>{cliente.nome}{cliente.cnpj ? ` - CNPJ ${cliente.cnpj}` : ''}</p>
            <p style={{ fontSize: '10pt', margin: '4px 0', color: '#666' }}>Periodo: {periodoLabel} &middot; Mascara: {mascaraSelecionada?.nome}</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '8.5pt', color: '#444', lineHeight: 1.25, flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: '9pt', fontWeight: 600, color: '#000' }}>CCI ASSESSORIA E CONSULTORIA INTELIGENTE LTDA</p>
            <p style={{ margin: '2px 0 0 0', fontFamily: 'monospace' }}>CNPJ 57.268.175/0001-00</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '7.5pt', color: '#888' }}>
              Impresso em {new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </div>
        </div>
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

      {cliente && qtdContasFluxo === 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 no-print">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold mb-0.5">Nenhuma conta classificada como bancaria ou caixa</p>
            <p className="text-amber-700">
              O fluxo de caixa consome apenas contas marcadas como <strong>Conta bancaria</strong> ou <strong>Conta caixa</strong> em
              Cadastros &rarr; Clientes &rarr; Classificar contas da rede. Enquanto nao houver ao menos uma
              conta classificada, o relatorio retorna vazio.
            </p>
          </div>
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
            className="space-y-5">
            {modoRede && resultadoPorEmpresa && resultadoPorEmpresa.empresas.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-gray-800">Variacao de caixa por empresa</h3>
                  <span className="text-[11px] text-gray-400">· contribuicao de cada unidade no fluxo consolidado</span>
                  <span className={`ml-auto text-[13px] font-bold ${resultadoPorEmpresa.totalConsolidado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    Total: {formatCurrency(resultadoPorEmpresa.totalConsolidado)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/80 border-b border-gray-100">
                      <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-2.5">#</th>
                        <th className="px-4 py-2.5">Empresa</th>
                        <th className="px-4 py-2.5 text-right">Entradas</th>
                        <th className="px-4 py-2.5 text-right">Saidas</th>
                        <th className="px-4 py-2.5 text-right">Variacao</th>
                        <th className="px-4 py-2.5 text-right">Participacao</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {resultadoPorEmpresa.empresas.map((p, i) => (
                        <tr key={p.empresaCodigo} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2 text-[11px] text-gray-400 font-mono">{i + 1}</td>
                          <td className="px-4 py-2 text-[12.5px] font-medium text-gray-800">{p.empresa?.nome || `#${p.empresaCodigo}`}</td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums text-emerald-600">+{formatCurrency(p.entradas)}</td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums text-red-600">-{formatCurrency(p.saidas)}</td>
                          <td className={`px-4 py-2 text-right font-mono text-[12.5px] font-semibold tabular-nums ${p.variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {p.variacao > 0 ? '+' : ''}{formatCurrency(p.variacao)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums text-gray-800 font-semibold">
                            {p.participacao.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50/60 border-t border-gray-200">
                      <tr className="text-[12px] font-semibold">
                        <td className="px-4 py-3 text-gray-700" colSpan={2}>Consolidado ({resultadoPorEmpresa.empresas.length} empresas)</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                          +{formatCurrency(resultadoPorEmpresa.empresas.reduce((s, p) => s + p.entradas, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">
                          -{formatCurrency(resultadoPorEmpresa.empresas.reduce((s, p) => s + p.saidas, 0))}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums ${resultadoPorEmpresa.totalConsolidado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {resultadoPorEmpresa.totalConsolidado > 0 ? '+' : ''}{formatCurrency(resultadoPorEmpresa.totalConsolidado)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700">100.0%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
            {!modoRede && composicaoSaldo.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-800">Composicao do saldo</h3>
                  <span className="text-[11px] text-gray-400">
                    · Saldo inicial (dia anterior ao periodo) + movimentos = Saldo atual (fim do periodo)
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/80 border-b border-gray-100">
                      <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-2.5">Conta bancaria</th>
                        <th className="px-4 py-2.5 text-right">Saldo inicial</th>
                        <th className="px-4 py-2.5 text-right">Entradas</th>
                        <th className="px-4 py-2.5 text-right">Saidas</th>
                        <th className="px-4 py-2.5 text-right">Variacao</th>
                        <th className="px-4 py-2.5 text-right">Saldo atual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {composicaoSaldo.map(c => {
                        const variacao = c.entradas - c.saidas;
                        return (
                          <tr key={c.contaCodigo} className="hover:bg-gray-50/60">
                            <td className="px-4 py-2 text-[12px] text-gray-800 truncate max-w-[260px]">{c.contaNome}</td>
                            <td className="px-4 py-2 text-right font-mono text-[12px] text-gray-700 tabular-nums">
                              {formatCurrency(c.saldoInicial)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-[12px] text-emerald-600 tabular-nums">
                              +{formatCurrency(c.entradas)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-[12px] text-red-600 tabular-nums">
                              -{formatCurrency(c.saidas)}
                            </td>
                            <td className={`px-4 py-2 text-right font-mono text-[12px] tabular-nums font-semibold ${
                              Math.abs(variacao) < 0.01 ? 'text-gray-500' : variacao > 0 ? 'text-emerald-700' : 'text-red-700'
                            }`}>
                              {variacao > 0 ? '+' : ''}{formatCurrency(variacao)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-sm font-bold text-gray-900 tabular-nums">
                              {formatCurrency(c.saldoAtual)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50/60 border-t border-gray-200">
                      {(() => {
                        const tIni = composicaoSaldo.reduce((s, c) => s + c.saldoInicial, 0);
                        const tEnt = composicaoSaldo.reduce((s, c) => s + c.entradas, 0);
                        const tSai = composicaoSaldo.reduce((s, c) => s + c.saidas, 0);
                        const tVar = tEnt - tSai;
                        const tAtu = composicaoSaldo.reduce((s, c) => s + c.saldoAtual, 0);
                        return (
                          <tr className="text-[12px] font-semibold">
                            <td className="px-4 py-3 text-gray-700">Consolidado</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">{formatCurrency(tIni)}</td>
                            <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">+{formatCurrency(tEnt)}</td>
                            <td className="px-4 py-3 text-right font-mono text-red-700 tabular-nums">-{formatCurrency(tSai)}</td>
                            <td className={`px-4 py-3 text-right font-mono tabular-nums ${
                              Math.abs(tVar) < 0.01 ? 'text-gray-500' : tVar > 0 ? 'text-emerald-700' : 'text-red-700'
                            }`}>
                              {tVar > 0 ? '+' : ''}{formatCurrency(tVar)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-gray-900 tabular-nums">{formatCurrency(tAtu)}</td>
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between no-print">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Layers className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">{mascaraSelecionada?.nome}</h3>
                  <p className="text-[11px] text-gray-400">
                    {periodoLabel}
                    {tempoGeracao != null && (
                      <span className="text-gray-300" title="Tempo total de geracao do relatorio">
                        {' · '}gerado em {formatDuracao(tempoGeracao)}
                      </span>
                    )}
                  </p>
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
                      expandedLancamentos={expandedLancamentos}
                      onToggleLancamento={toggleLancamento}
                      tituloPagarMap={tituloPagarMap}
                      titulosPorPagamento={titulosPorPagamento}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            </div>

            {/* Contas, chaves e lancamentos nao mapeados (diagnostico — apenas admin, fora de impressao) */}
            {!clienteIdOverride && semClassificacaoNode && semClassificacaoNode.contas.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-200/60 shadow-sm overflow-hidden mt-4 no-print">
                <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/40 flex items-center gap-2 flex-wrap">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-amber-800">Contas, chaves e lancamentos nao mapeados</h3>
                  <span className="text-[11px] text-amber-600">
                    · {semClassificacaoNode.contas.length} ite{semClassificacaoNode.contas.length === 1 ? 'm' : 'ns'} · nao entra(m) na variacao de caixa acima
                  </span>
                  <span className={`ml-auto text-[13px] font-bold ${semClassificacaoNode.totalPeriodo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    Impacto: {formatCurrency(semClassificacaoNode.totalPeriodo)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]" style={{ tableLayout: 'fixed', minWidth: 490 + meses.length * 120 + 140 }}>
                    <colgroup>
                      <col style={{ width: 490 }} />
                      {meses.map(m => <col key={`${m.key}-scv`} style={{ width: 120 }} />)}
                      <col style={{ width: 140 }} />
                    </colgroup>
                    <thead className="bg-amber-50/50 border-b border-amber-100">
                      <tr className="text-amber-800">
                        <th className="text-left px-4 py-2 font-medium uppercase text-[10px] tracking-wider">Plano / tipo de documento</th>
                        {meses.map(m => (
                          <th key={`${m.key}-sch`} className="text-right px-3 py-2 font-medium uppercase text-[10px] tracking-wider">{m.label} (R$)</th>
                        ))}
                        <th className="text-right px-3 py-2 font-medium uppercase text-[10px] tracking-wider bg-amber-100/40">Total (R$)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {semClassificacaoNode.contas.map(conta => {
                        const temLancs = conta.lancamentos && conta.lancamentos.length > 0;
                        const isAberta = expandedContas.has(conta.id);
                        return (
                          <React.Fragment key={conta.id}>
                            <tr className="border-b border-amber-50 hover:bg-amber-50/30">
                              <td className="px-4 py-1.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  {temLancs ? (
                                    <button onClick={() => toggleConta(conta.id)}
                                      className="text-amber-500 hover:text-amber-700 transition-colors flex-shrink-0">
                                      <motion.div animate={{ rotate: isAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                        <ChevronRight className="h-3 w-3" />
                                      </motion.div>
                                    </button>
                                  ) : (
                                    <div className="h-1 w-1 rounded-full bg-amber-300 flex-shrink-0" />
                                  )}
                                  <span className="text-[11.5px] text-gray-800 truncate flex-1">{conta.descricao}</span>
                                  {temLancs && (
                                    <span className="text-[9px] text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                      {conta.lancamentos.length}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {meses.map(m => {
                                const v = conta.valoresPorMes[m.key] || 0;
                                return (
                                  <td key={`${m.key}-scv2`} className={`text-right px-3 py-1.5 font-mono tabular-nums text-[11px] ${v >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {formatCurrencyCompact(v)}
                                  </td>
                                );
                              })}
                              <td className={`text-right px-3 py-1.5 font-mono tabular-nums text-[11.5px] font-semibold bg-amber-50/40 ${conta.totalPeriodo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {formatCurrencyCompact(conta.totalPeriodo)}
                              </td>
                            </tr>
                            {isAberta && temLancs && conta.lancamentos.slice(0, 200).map(l => (
                              <tr key={l.id} className="border-b border-gray-50 bg-amber-50/10 hover:bg-amber-50/30">
                                <td className="px-4 py-1" style={{ paddingLeft: 48 }}>
                                  <div className="flex items-center gap-2 text-[10.5px] text-gray-600">
                                    <span className="font-mono tabular-nums flex-shrink-0 text-gray-500">{l.data || '—'}</span>
                                    <span className="truncate" title={l.descricao}>{l.descricao}</span>
                                    {l.tipoDoc && <span className="text-[9px] text-gray-400 uppercase tracking-wider flex-shrink-0">{l.tipoDoc}</span>}
                                  </div>
                                </td>
                                {meses.map(m => {
                                  const v = l.mesKey === m.key ? l.valor * l.sinal : 0;
                                  return (
                                    <td key={`${m.key}-scl`} className={`text-right px-3 py-1 font-mono tabular-nums text-[10.5px] ${v === 0 ? 'text-gray-300' : v >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                      {v === 0 ? '—' : formatCurrencyCompact(v)}
                                    </td>
                                  );
                                })}
                                <td className={`text-right px-3 py-1 font-mono tabular-nums text-[10.5px] ${l.sinal > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                  {formatCurrencyCompact(l.valor * l.sinal)}
                                </td>
                              </tr>
                            ))}
                            {isAberta && temLancs && conta.lancamentos.length > 200 && (
                              <tr className="border-b border-gray-50 bg-amber-50/10">
                                <td colSpan={meses.length + 2} className="px-4 py-1 text-[10px] text-gray-500 italic" style={{ paddingLeft: 48 }}>
                                  ... e mais {conta.lancamentos.length - 200} lancamento(s) — use o filtro de conta para reduzir
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-amber-50/50 border-t border-amber-200">
                      <tr className="text-[12px] font-semibold text-amber-900">
                        <td className="px-4 py-2">Total nao mapeado</td>
                        {meses.map(m => {
                          const v = semClassificacaoNode.valoresPorMes[m.key] || 0;
                          return (
                            <td key={`${m.key}-sctot`} className={`text-right px-3 py-2 font-mono tabular-nums ${v >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                              {formatCurrencyCompact(v)}
                            </td>
                          );
                        })}
                        <td className={`text-right px-3 py-2 font-mono tabular-nums bg-amber-100/40 ${semClassificacaoNode.totalPeriodo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {formatCurrencyCompact(semClassificacaoNode.totalPeriodo)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-5 py-2 bg-amber-50/30 border-t border-amber-100 text-[10.5px] text-amber-900">
                  Estes lancamentos existem nas contas (bancarias/caixa) mas nao estao no mapeamento da mascara — por isso a soma do fluxo acima pode nao bater com a <strong>Composicao do saldo</strong>. Adicione os codigos em <strong>Parametros &gt; Mapeamento Fluxo de Caixa</strong> para que passem a compor a variacao.
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Recursive row renderer ─────────────────────────────────
function FluxoNodeRows({ node, depth, meses, expandedGrupos, expandedContas, onToggleGrupo, onToggleConta, ocultarZeradas, expandedLancamentos, onToggleLancamento, tituloPagarMap, titulosPorPagamento }) {
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
            expandedLancamentos={expandedLancamentos}
            onToggleLancamento={onToggleLancamento}
            tituloPagarMap={tituloPagarMap}
            titulosPorPagamento={titulosPorPagamento}
          />
        ))}
      </AnimatePresence>

      {isExpanded && !isCalc && contasFiltradas.map(conta => {
        const isContaExpanded = expandedContas?.has(conta.id);
        const temLancs = conta.lancamentos && conta.lancamentos.length > 0;
        return (
          <ExpandedConta key={conta.id} conta={conta} indent={indent}
            meses={meses} isContaExpanded={isContaExpanded} temLancs={temLancs}
            onToggleConta={onToggleConta}
            expandedLancamentos={expandedLancamentos}
            onToggleLancamento={onToggleLancamento}
            tituloPagarMap={tituloPagarMap}
            titulosPorPagamento={titulosPorPagamento}
          />
        );
      })}
    </>
  );
}

function ExpandedConta({ conta, indent, meses, isContaExpanded, temLancs, onToggleConta, expandedLancamentos, onToggleLancamento, tituloPagarMap, titulosPorPagamento }) {
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

      {isContaExpanded && temLancs && conta.lancamentos.map(l => {
        // Cada lancamento TITULO_PAGAR_PAGAMENTO ja foi gerado por titulo especifico,
        // entao o ideal e pegar SOMENTE esse titulo (via tituloPagarCodigo do lancamento).
        // Fallback: se nao temos tituloPagarCodigo, cai no lookup por lote.
        let titulosDoLancamento = [];
        if (l.tipoDoc === 'TITULO_PAGAR_PAGAMENTO') {
          if (l.tituloPagarCodigo != null) {
            const t = tituloPagarMap?.get(Number(l.tituloPagarCodigo));
            if (t) titulosDoLancamento = [t];
          } else if (l.movimentoContaCodigo != null) {
            const lote = titulosPorPagamento?.get(Number(l.movimentoContaCodigo)) || [];
            if (lote.length > 0) titulosDoLancamento = lote;
          }
        }
        const podeExpandir = titulosDoLancamento.length > 0;
        const isLancExpanded = podeExpandir && expandedLancamentos?.has(l.id);
        return (
          <React.Fragment key={`l-${l.id}`}>
            <tr
              className={`border-b border-gray-50 bg-gray-50/30 hover:bg-emerald-50/20 ${podeExpandir ? 'cursor-pointer' : ''}`}
              onClick={() => { if (podeExpandir) onToggleLancamento?.(l.id); }}
            >
              <td className="px-4 py-1 overflow-hidden" style={{ paddingLeft: 12 + indent + 48 }}>
                <div className="flex items-center gap-2.5 text-[10.5px] min-w-0">
                  {podeExpandir ? (
                    <motion.div animate={{ rotate: isLancExpanded ? 90 : 0 }} transition={{ duration: 0.15 }} className="flex-shrink-0">
                      <ChevronRight className="h-2.5 w-2.5 text-gray-400" />
                    </motion.div>
                  ) : (
                    <div className="w-2.5 flex-shrink-0" />
                  )}
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
            {isLancExpanded && titulosDoLancamento.length > 0 && (
              <tr className="border-b border-gray-100 bg-blue-50/40">
                <td colSpan={meses.length + 2} className="px-4 py-2" style={{ paddingLeft: 12 + indent + 70 }}>
                  {titulosDoLancamento.length === 1 ? (
                    <TituloDetalhe titulo={titulosDoLancamento[0]} valorPago={l.valor * l.sinal} />
                  ) : (
                    <TitulosLote
                      titulos={titulosDoLancamento}
                      movimentoContaCodigo={l.movimentoContaCodigo}
                      valorTotalPago={l.valor * l.sinal}
                    />
                  )}
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

// Renderiza um pagamento em lote (1 movimento -> N titulos). Agrupa por plano
// gerencial pra que o usuario veja quanto foi pago em cada plano.
function TitulosLote({ titulos, movimentoContaCodigo, valorTotalPago }) {
  const chave = movimentoContaCodigo != null ? Number(movimentoContaCodigo) : null;
  // Soma o valorPago da entry em titulo.pagamento[] cujo codigoDocumento bate
  // com o movimentoContaCodigo (i.e., o pagamento especifico deste movimento).
  const valorNoLote = (t) => {
    if (chave != null && Array.isArray(t.pagamento)) {
      const entry = t.pagamento.find(p => Number(p?.codigoDocumento) === chave);
      if (entry) return Number(entry.valorPago ?? entry.valor ?? 0);
    }
    return Number(t.valor ?? t.valorTitulo ?? 0);
  };

  const porPlano = new Map();
  titulos.forEach(t => {
    const planoCod = t.planoContaGerencialCodigo;
    const planoLabel = planoCod != null && planoCod !== 0
      ? (t.planoContaGerencialDescricao ? `${planoCod} - ${t.planoContaGerencialDescricao}` : `Plano #${planoCod}`)
      : 'Sem plano gerencial';
    if (!porPlano.has(planoLabel)) porPlano.set(planoLabel, { codigo: planoCod, titulos: [], valor: 0 });
    const g = porPlano.get(planoLabel);
    g.titulos.push(t);
    g.valor += valorNoLote(t);
  });
  const grupos = Array.from(porPlano.entries()).map(([label, g]) => ({ label, ...g }))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  const totalCalculado = grupos.reduce((s, g) => s + g.valor, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">
          Pagamento em lote · {titulos.length} titulos em {grupos.length} {grupos.length === 1 ? 'conta gerencial' : 'contas gerenciais'}
        </p>
        <p className="text-[10px] text-gray-500">
          Soma dos titulos: <strong className="text-gray-700">{formatCurrencyCompact(totalCalculado)}</strong>
          {' · '}
          Valor do movimento: <strong className="text-gray-700">{formatCurrencyCompact(Math.abs(valorTotalPago))}</strong>
        </p>
      </div>
      <div className="space-y-1">
        {grupos.map((g, i) => (
          <div key={i} className="rounded-md bg-white/70 border border-blue-100 overflow-hidden">
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-blue-100/40 border-b border-blue-100">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-semibold text-blue-800 truncate">{g.label}</span>
                <span className="text-[9px] text-blue-600 bg-white/60 rounded-full px-1.5 py-0.5 flex-shrink-0">
                  {g.titulos.length} {g.titulos.length === 1 ? 'titulo' : 'titulos'}
                </span>
              </div>
              <span className="text-[10px] font-mono font-semibold text-blue-800 tabular-nums flex-shrink-0">
                {formatCurrencyCompact(g.valor)}
              </span>
            </div>
            <table className="w-full text-[10px]">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left px-2.5 py-1 font-medium">Titulo #</th>
                  <th className="text-left px-2.5 py-1 font-medium">Documento</th>
                  <th className="text-left px-2.5 py-1 font-medium">Vencimento</th>
                  <th className="text-left px-2.5 py-1 font-medium">Fornecedor</th>
                  <th className="text-right px-2.5 py-1 font-medium">Valor no lote</th>
                </tr>
              </thead>
              <tbody>
                {g.titulos.map((t, idx) => (
                  <tr key={idx} className="border-t border-gray-50">
                    <td className="px-2.5 py-1 font-mono text-gray-500">{t.tituloPagarCodigo ?? t.codigo ?? '—'}</td>
                    <td className="px-2.5 py-1 text-gray-700">{t.numeroDocumento || t.documento || '—'}</td>
                    <td className="px-2.5 py-1 font-mono text-gray-500">{formatDataBR(t.dataVencimento || t.vencimento)}</td>
                    <td className="px-2.5 py-1 text-gray-700 truncate max-w-[200px]">
                      {t.fornecedorNome || t.fornecedor || t.razao || t.razaoSocial || (t.fornecedorCodigo != null ? `#${t.fornecedorCodigo}` : '—')}
                    </td>
                    <td className="px-2.5 py-1 text-right font-mono tabular-nums text-gray-700">
                      {formatCurrencyCompact(valorNoLote(t))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function TituloDetalhe({ titulo, valorPago }) {
  const fornecedor = titulo.fornecedorNome || titulo.fornecedor || titulo.razao || titulo.razaoSocial
    || (titulo.fornecedorCodigo != null ? `#${titulo.fornecedorCodigo}` : null);
  const plano = titulo.planoContaGerencialDescricao
    ? `${titulo.planoContaGerencialCodigo ?? ''} - ${titulo.planoContaGerencialDescricao}`.trim()
    : (titulo.planoContaGerencialCodigo != null ? `#${titulo.planoContaGerencialCodigo}` : null);
  const centroCusto = titulo.centroCustoDescricao
    ? `${titulo.centroCustoCodigo ?? ''} - ${titulo.centroCustoDescricao}`.trim()
    : (titulo.centroCustoCodigo != null && titulo.centroCustoCodigo !== 0 ? `#${titulo.centroCustoCodigo}` : null);

  const campos = [
    { label: 'Titulo #',        valor: titulo.tituloPagarCodigo ?? titulo.codigo },
    { label: 'Numero Doc',      valor: titulo.numeroDocumento || titulo.documento },
    { label: 'Parcela',         valor: titulo.parcela ?? titulo.numeroParcela },
    { label: 'Emissao',         valor: titulo.dataEmissao ? formatDataBR(titulo.dataEmissao) : null },
    { label: 'Vencimento',      valor: (titulo.dataVencimento || titulo.vencimento) ? formatDataBR(titulo.dataVencimento || titulo.vencimento) : null },
    { label: 'Data pagamento',  valor: titulo.dataPagamento ? formatDataBR(titulo.dataPagamento) : null },
    { label: 'Valor titulo',    valor: titulo.valor != null || titulo.valorTitulo != null ? formatCurrencyCompact(Number(titulo.valor ?? titulo.valorTitulo ?? 0)) : null },
    { label: 'Valor pago',      valor: formatCurrencyCompact(Math.abs(valorPago)) },
    { label: 'Valor saldo',     valor: titulo.valorSaldo != null ? formatCurrencyCompact(Number(titulo.valorSaldo)) : null },
    { label: 'Juros',           valor: Number(titulo.valorJuros) > 0 ? formatCurrencyCompact(Number(titulo.valorJuros)) : null },
    { label: 'Multa',           valor: Number(titulo.valorMulta) > 0 ? formatCurrencyCompact(Number(titulo.valorMulta)) : null },
    { label: 'Desconto',        valor: Number(titulo.valorDesconto) > 0 ? formatCurrencyCompact(Number(titulo.valorDesconto)) : null },
    { label: 'Acrescimo',       valor: Number(titulo.valorAcrescimo) > 0 ? formatCurrencyCompact(Number(titulo.valorAcrescimo)) : null },
    { label: 'Fornecedor',      valor: fornecedor },
    { label: 'Plano gerencial', valor: plano },
    { label: 'Centro custo',    valor: centroCusto },
    { label: 'Portador',        valor: titulo.portadorDescricao || (titulo.portadorCodigo != null && titulo.portadorCodigo !== 0 ? `#${titulo.portadorCodigo}` : null) },
    { label: 'Situacao',        valor: titulo.situacao },
    { label: 'Natureza',        valor: titulo.natureza },
    { label: 'Historico',       valor: titulo.historico || titulo.observacao || titulo.descricao },
  ].filter(c => c.valor != null && c.valor !== '');

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Titulo a pagar · TITULO_PAGAR</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-[10.5px]">
        {campos.map((c, i) => (
          <div key={i} className="min-w-0">
            <span className="text-gray-500">{c.label}: </span>
            <span className="text-gray-800 font-medium break-words">{c.valor}</span>
          </div>
        ))}
      </div>
    </div>
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

