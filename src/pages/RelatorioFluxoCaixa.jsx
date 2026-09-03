import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Layers, Loader2, AlertCircle,
  Building2, Zap, RefreshCw, Wallet, Printer,
  EyeOff, Eye, ChevronLeft as ChevLeft, Download,
  LineChart as LineChartIcon, TrendingUp, TrendingDown, X, CalendarRange, Scale,
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ReferenceLine, Layer, useXAxisScale, usePlotArea,
} from 'recharts';
import * as clientesService from '../services/clientesService';
import * as fluxoService from '../services/mascaraFluxoCaixaService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as contasBancariasService from '../services/clienteContasBancariasService';
import * as autosystemService from '../services/autosystemService';
import * as XLSX from 'xlsx';
import { formatCurrency } from '../utils/format';
import { useAnonimizador } from '../services/anonimizarService';
import { nomeEmpresa } from '../utils/nomeEmpresa';
import { useUsarApelido } from '../lib/apelidoPref';
import ApelidoToggle from '../components/ui/ApelidoToggle';

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Codigo sintetico usado para agrupar movimentos sem planoContaGerencial
// (ou com plano nao mapeado) no fluxo. Nao colide com codigos reais.
const SEM_PLANO_PREFIX = '__sem_plano__';

// Rótulo/código do grupo sintético de transferências entre contas próprias.
// Só aparece quando o usuário filtra um subconjunto de contas (Autosystem):
// transferências vindas de contas fora da seleção contam como entrada/saída
// real e vão pra ESTE grupo, que É somado na Variação de Caixa (diferente de
// "Sem classificação", que fica de fora).
const TRANSFER_TIPO_DOC = 'Transferências entre contas';
const TRANSFER_CODE = `${SEM_PLANO_PREFIX}${TRANSFER_TIPO_DOC}`;

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
//
// modoCliente (opcional, default false): quando true, oculta seções e
// avisos voltados ao admin (ex.: bloco "Contas, chaves e lançamentos não
// mapeados" — útil pra consultoria, ruído pro cliente final).
export default function RelatorioFluxoCaixa({ clienteIdOverride, backHref, redeContexto, modoCliente = false, seletorEmpresas } = {}) {
  const { labelEmpresa, labelCnpj } = useAnonimizador();
  const usarApelido = useUsarApelido();
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
  // Saldo de abertura REAL por conta (código -> saldo), obtido do último movimento
  // ANTES do início do período (mesmo mecanismo do fechamento, que bate com a Quality).
  const [aberturaPorConta, setAberturaPorConta] = useState(() => new Map());
  // Código do plano gerencial (Webposto) -> nome, p/ mostrar nome no diagnóstico
  const [nomePlanoGerencial, setNomePlanoGerencial] = useState(() => new Map());
  // Saldos iniciais por empresa (Autosystem) — soma do efeito líquido das contas
  // caixa/banco anteriores à data inicial do período.
  const [saldosIniciaisPorEmpresa, setSaldosIniciaisPorEmpresa] = useState({});

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
  const [activeTab, setActiveTab] = useState('fluxo'); // 'fluxo' | 'empresa' | 'evolucao'
  // Granularidade do gráfico de Evolução: 'auto' (pelo período) | 'dia' | 'semana' | 'mes'.
  const [granEvol, setGranEvol] = useState('auto');
  // Modo do gráfico de Evolução: 'saldo' (saldo acumulado) | 'variacao' (variação por período).
  const [modoGrafico, setModoGrafico] = useState('saldo');
  // Período específico da Evolução (recorte dentro do período carregado). Vazio = todo o período.
  const [evolRange, setEvolRange] = useState({ ini: '', fim: '' });
  // Modal de detalhamento ao clicar num marcador do gráfico de evolução.
  const [modalEvol, setModalEvol] = useState(null); // ponto clicado | null
  // Mes selecionado da aba "Por Empresa" (so modoRede). Default: ultimo mes do periodo.
  const [mesEmpresaKey, setMesEmpresaKey] = useState(null);
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
  // Autosystem: códigos das contas marcadas como "aplicação financeira" (subconjunto
  // das caixa/banco). Na Evolução, o usuário pode excluí-las da análise do fluxo.
  const [contasAplicacao, setContasAplicacao] = useState(() => new Set());
  const [incluirAplicacoes, setIncluirAplicacoes] = useState(true);
  // Análise "Capacidade de geração de caixa": grupos escolhidos como
  // Recebimentos de clientes e Pagamentos a fornecedores (null = auto pelo nome).
  const [grpRecebId, setGrpRecebId] = useState(null);
  const [grpFornId, setGrpFornId] = useState(null);
  // Meses expandidos na Capacidade (mostra como a sobra foi consumida).
  const [capExpMes, setCapExpMes] = useState(() => new Set());
  // Grupos expandidos dentro de cada mês (chave `${mesKey}:${grupoId}`) — drill até nível 3.
  const [capExpGrupo, setCapExpGrupo] = useState(() => new Set());

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
          const isAutosystem = !!redeContexto.asRedeId;
          const idChave = isAutosystem ? redeContexto.asRedeId : redeContexto.chaveApiId;
          const virtualCliente = {
            id: `__rede__${idChave}`,
            nome: redeContexto.nomeRede,
            chave_api_id: isAutosystem ? null : redeContexto.chaveApiId,
            as_rede_id:   isAutosystem ? redeContexto.asRedeId : null,
            usa_webposto: !isAutosystem,
            empresa_codigo: redeContexto.empresaCodigos?.[0] ?? null,
            _empresaCodigos: redeContexto.empresaCodigos || [],
            _empresas: redeContexto.empresas || [],
            _nomeRede: redeContexto.nomeRede,
          };
          // Só as máscaras liberadas pra esta rede (vazia = todas).
          const masks = await fluxoService.listarMascaras({
            asRedeId: redeContexto.asRedeId || null,
            chaveApiId: redeContexto.chaveApiId || null,
          });
          setCliente(virtualCliente);
          setMascaras(masks || []);
          if (masks && masks.length > 0) setMascaraSelecionada(masks.find(m => m.padrao) || masks[0]);
          try {
            if (isAutosystem) {
              // Autosystem: as "contas classificadas" e o "catalogo de contas"
              // vêm de as_rede_conta_caixa_banco (todas tratadas como 'caixa').
              const cbList = await autosystemService
                .listarContasCaixaBancoRede(redeContexto.asRedeId)
                .catch(() => []);
              const classif = (cbList || []).map(c => ({
                conta_codigo: c.codigo,
                tipo: 'caixa',
                ativo: true,
              }));
              const ctas = (cbList || []).map(c => ({
                contaCodigo: c.codigo,
                descricao: c.nome || `Conta ${c.codigo}`,
              }));
              setContasClassificadas(classif);
              setContasMeta(ctas);
              const aplList = await autosystemService
                .listarContasAplicacaoRede(redeContexto.asRedeId)
                .catch(() => []);
              setContasAplicacao(new Set((aplList || []).map(a => String(a.codigo))));
            } else {
              const chavesApi = await mapService.listarChavesApi();
              const chave = chavesApi.find(ch => ch.id === redeContexto.chaveApiId);
              const tasks = [contasBancariasService.listarPorRede(redeContexto.chaveApiId)];
              if (chave?.chave) tasks.push(qualityApi.buscarContas(chave.chave));
              const [classif, ctas] = await Promise.all(tasks);
              setContasClassificadas(classif || []);
              setContasMeta(ctas || []);
            }
          } catch (_) { setContasClassificadas([]); setContasMeta([]); }
        } else {
          const c = await clientesService.buscarCliente(clienteId);
          const masks = await fluxoService.listarMascaras({
            asRedeId: c?.as_rede_id || null,
            chaveApiId: c?.chave_api_id || null,
          });
          setCliente(c);
          setMascaras(masks || []);
          if (masks && masks.length > 0) setMascaraSelecionada(masks.find(m => m.padrao) || masks[0]);
          if (c?.as_rede_id) {
            // Cliente Autosystem individual
            try {
              const cbList = await autosystemService
                .listarContasCaixaBancoRede(c.as_rede_id)
                .catch(() => []);
              const classif = (cbList || []).map(cb => ({
                conta_codigo: cb.codigo,
                tipo: 'caixa',
                ativo: true,
              }));
              const ctas = (cbList || []).map(cb => ({
                contaCodigo: cb.codigo,
                descricao: cb.nome || `Conta ${cb.codigo}`,
              }));
              setContasClassificadas(classif);
              setContasMeta(ctas);
              const aplList = await autosystemService
                .listarContasAplicacaoRede(c.as_rede_id)
                .catch(() => []);
              setContasAplicacao(new Set((aplList || []).map(a => String(a.codigo))));
            } catch (_) { setContasClassificadas([]); setContasMeta([]); }
          } else if (c?.chave_api_id) {
            // Carrega classificacao das contas + catalogo CONTA da rede
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
  }, [clienteId, modoRede, redeContexto?.chaveApiId, redeContexto?.asRedeId]);

  // ─── Carregar grupos + mapeamentos ─────────────────────────
  useEffect(() => {
    if (!mascaraSelecionada || !cliente) return;
    setReportReady(false);
    (async () => {
      try {
        const tasks = [fluxoService.listarGrupos(mascaraSelecionada.id)];
        if (cliente.usa_webposto && cliente.chave_api_id) {
          tasks.push(fluxoService.listarMapeamentosEmpresa(cliente.chave_api_id));
        } else if (cliente.as_rede_id) {
          // Autosystem: config por rede (compartilhada entre empresas).
          tasks.push(fluxoService.listarContasManualPorRede(cliente.as_rede_id, mascaraSelecionada.id));
        } else {
          // Fallback p/ cliente_id (legado) quando a empresa não tem as_rede_id.
          tasks.push(fluxoService.listarContasManual(cliente.id, mascaraSelecionada.id));
        }
        const [grps, maps] = await Promise.all(tasks);
        setGrupos(grps || []);
        // IMPORTANTE: listarMapeamentosEmpresa (webposto) retorna os mapeamentos
        // de TODAS as máscaras da empresa. Filtramos SÓ os grupos DESTA máscara —
        // senão um código mapeado apenas em outra máscara some do fluxo (não entra
        // na árvore, cujos grupos são desta máscara, nem no "não mapeado", que o
        // considerava mapeado globalmente).
        const grupoIds = new Set((grps || []).map(g => g.id));
        // Normaliza: mapeamentos webposto tem plano_conta_codigo, manuais tem conta_codigo
        const adaptados = (maps || [])
          .filter(m => grupoIds.has(m.grupo_fluxo_id))
          .map(m => ({
            id: m.id,
            grupo_fluxo_id: m.grupo_fluxo_id,
            plano_conta_codigo: m.plano_conta_codigo || m.conta_codigo,
            plano_conta_descricao: m.plano_conta_descricao || m.conta_descricao,
            // Direção (Autosystem): 'D'=aplica só quando a conta é debitada (saída),
            // 'C'=só quando creditada (entrada), null=ambos (líquido). Webposto = null.
            lado: m.lado === 'D' || m.lado === 'C' ? m.lado : null,
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
    setSaldosIniciaisPorEmpresa({});
  }, [mesFinal, qtdMeses, mascaraSelecionada]);

  // Sincroniza mesEmpresaKey (aba "Por Empresa") com o periodo carregado.
  useEffect(() => {
    if (meses.length === 0) { setMesEmpresaKey(null); return; }
    setMesEmpresaKey(prev => {
      if (prev && meses.some(m => m.key === prev)) return prev;
      return meses[meses.length - 1].key;
    });
  }, [meses]);

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

    // ─ Autosystem: usa contas caixa/banco + lançamentos do movto ─
    if (!cliente.usa_webposto && cliente.as_rede_id) {
      const _t0 = performance.now();
      try {
        setLoadingDados(true);
        setDadosCarregados(false);
        setError(null);
        setTempoGeracao(null);

        const empresaCodigos = (cliente._empresaCodigos && cliente._empresaCodigos.length)
          ? cliente._empresaCodigos
          : (cliente.empresa_codigo != null ? [cliente.empresa_codigo] : []);
        if (empresaCodigos.length === 0) {
          throw new Error('Cliente Autosystem sem empresa_codigo definido.');
        }

        const contasCaixaBanco = (await autosystemService
          .listarContasCaixaBancoRede(cliente.as_rede_id)
          .catch(() => []))
          .map(c => String(c.codigo));
        if (contasCaixaBanco.length === 0) {
          setError('Nenhuma conta caixa/banco marcada. Configure em '
            + '/admin/parametros/mapeamento → Autosystem → Fluxo → "Contas Caixa / Banco".');
          setDadosPorMes({});
          setDadosCarregados(true);
          return;
        }

        const total = meses.length;
        let concluidas = 0;
        setLoadingProgress({ atual: 0, total, mensagem: `Buscando fluxo Autosystem (${meses.length} mês(es))...` });

        const results = await Promise.all(meses.map(async m => {
          const r = rangeMes(m.ano, m.mes);
          let lancs = [], saldosIniciais = {};
          try {
            const out = await autosystemService.buscarFluxoCaixaAutosystem(
              cliente.as_rede_id,
              empresaCodigos,
              {
                data_de: r.dataInicial, data_ate: r.dataFinal,
                contas_caixa_banco: contasCaixaBanco,
                // Subconjunto selecionado no filtro de contas → cálculo relativo
                // a essas contas (transferências de fora contam de verdade).
                contas_selecionadas: [...filtroContas],
              },
            );
            lancs = out.lancamentos || [];
            saldosIniciais = out.saldosIniciais || {};
          } catch (e) {
            console.error('[Fluxo Autosystem] Falha no fetch', { mes: m.key, err: e });
          }
          concluidas++;
          setLoadingProgress({ atual: concluidas, total, mensagem: `${m.label}: ${lancs.length} lancamentos` });
          return { key: m.key, mesIdx: meses.indexOf(m), lancs, saldosIniciais };
        }));

        // Saldos iniciais do período = do primeiro mês (data mais antiga)
        const primeiroMes = results.find(r => r.mesIdx === 0);
        const saldosIniciaisPeriodo = primeiroMes?.saldosIniciais || {};

        // Converte lançamentos Autosystem para o formato MOVIMENTO_CONTA que
        // o resto do componente já entende. A conta caixa/banco vira contaCodigo;
        // a contraparte vira planoContaGerencialCodigo (para casar com mapeamentos
        // de fluxo); o sinal (debit=+ / credit=-) vira tipo Crédito/Débito.
        //
        // Quando contraparte é 2.1.1.x (conta-ponte), preferimos a
        // `contraparte_resolvida_codigo` (despesa real) vinda da provisão.
        // Se não houver provisão, marcamos com flag pra mostrar como
        // "Despesa não classificada (2.1.1)".
        const mapa = {};
        let totalConvertidos = 0;
        let naoClassificadas211 = 0;
        results.forEach(r => {
          const movs = (r.lancs || []).map(l => {
            const sinal = Number(l.sinal) || 0;
            const tipo = sinal > 0 ? 'Crédito' : 'Débito';
            const cpBruto = String(l.contraparte_codigo ?? '');
            const cpResolv = l.contraparte_resolvida_codigo != null
              ? String(l.contraparte_resolvida_codigo)
              : null;
            const isPonte211 = /^2\.1\.1/.test(cpBruto);
            const naoClassificada = isPonte211 && !cpResolv;
            if (naoClassificada) naoClassificadas211++;
            // Transferência entre contas próprias (a contraparte também é
            // caixa/banco). Sobrevive só quando cruza a fronteira da seleção →
            // vai pro grupo "Transferências entre contas" (contado na variação).
            const ehTransferencia = !!l.contraparte_eh_caixa;
            const planoEfetivo = ehTransferencia ? null : (cpResolv || cpBruto);
            return {
              codigo: l.lancamento_id != null ? `as-${l.lancamento_id}` : undefined,
              movimentoContaCodigo: l.lancamento_id ?? null,
              contaCodigo: l.lado_caixa === 'debito' ? String(l.debito_codigo ?? '') : String(l.credito_codigo ?? ''),
              planoContaGerencialCodigo: planoEfetivo,
              planoContaGerencialDescricao: l.contraparte_resolvida_nome || l.contraparte_nome || null,
              // Campos extras pra diagnóstico/badge no front
              _viaProvisao: !!l.via_provisao,
              _naoClassificada211: naoClassificada,
              _contraparteBruta: cpBruto,
              tipo,
              valor: Math.abs(Number(l.valor || 0)),
              dataMovimento: String(l.data ?? '').slice(0, 10),
              descricao: [
                ehTransferencia ? `↔ ${l.contraparte_nome || ('conta ' + cpBruto)}` : '',
                naoClassificada ? '[2.1.1 sem provisão]' : '',
                l.documento ? `Nº ${l.documento}` : '',
                l.pessoa_nome || '',
                l.obs || '',
              ].filter(Boolean).join(' · '),
              tipoDocumentoOrigem: ehTransferencia ? TRANSFER_TIPO_DOC : 'AUTOSYSTEM',
              empresaCodigo: l.empresa,
            };
          });
          totalConvertidos += movs.length;
          mapa[r.key] = { movimentos: movs };
        });

        console.info('[Fluxo Autosystem] Carregado:', {
          asRedeId: cliente.as_rede_id,
          empresas: empresaCodigos.length,
          contasCaixaBanco: contasCaixaBanco.length,
          totalConvertidos,
          provisoes211NaoResolvidas: naoClassificadas211,
        });

        setDadosPorMes(mapa);
        setSaldosIniciaisPorEmpresa(saldosIniciaisPeriodo);
        setTituloPagarMap(new Map());
        setTitulosPorPagamento(new Map());
        setDadosCarregados(true);
        setTempoGeracao(performance.now() - _t0);
      } catch (err) {
        setError('Erro ao buscar fluxo de caixa Autosystem: ' + err.message);
      } finally {
        setLoadingDados(false);
      }
      return;
    }

    if (!cliente.usa_webposto || !cliente.chave_api_id) {
      setError('Fluxo de Caixa disponível apenas para clientes Webposto ou Autosystem.');
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
      if (!chave) throw new Error('Chave API não encontrada para este cliente');

      const total = meses.length;
      let concluidas = 0;
      setLoadingProgress({ atual: 0, total, mensagem: `Buscando movimentos de ${meses.length} mês(es)...` });

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

      // ─── Ajuste CARTAO_REMESSA: usa o valor LÍQUIDO no fluxo ──────────
      // Em MOVIMENTO_CONTA, movimentos com tipoDocumentoOrigem === 'CARTAO_REMESSA'
      // trazem o valor BRUTO. O que de fato cai no banco é o `valorLiquido` da remessa
      // (endpoint CARTAO_REMESSA), já descontadas taxas e somados acréscimos. A ligação
      // é MOVIMENTO_CONTA.documentoOrigemCodigo === CARTAO_REMESSA.cartaoRemessaCodigo.
      // Trocamos o valor no próprio movimento pra que TODO o fluxo (composição, grupos,
      // totais, não mapeados) use o líquido. Best-effort: se falhar, mantém o bruto.
      const liquidoPorRemessa = new Map(); // cartaoRemessaCodigo -> valorLiquido
      try {
        const primeiroMes = meses[0];
        const ultimoMes = meses[meses.length - 1];
        const fmtR = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        // Janela ampliada (1 mês antes até 1 mês depois): a data que o endpoint filtra
        // (remessa/recebimento) pode cair fora do mês do movimento no banco.
        const rIni = fmtR(new Date(primeiroMes.ano, primeiroMes.mes - 1 - 1, 1));
        const rFim = fmtR(new Date(ultimoMes.ano, ultimoMes.mes - 1 + 2, 0));
        setLoadingProgress({ atual: total, total, mensagem: 'Buscando remessas de cartão (valor líquido)...' });
        for (const ec of empresaCodigos) {
          const remessas = await qualityApi.buscarCartaoRemessa(chave.chave, {
            dataInicial: rIni, dataFinal: rFim, empresaCodigo: ec,
          });
          (remessas || []).forEach(rm => {
            const cod = rm.cartaoRemessaCodigo ?? rm.codigo;
            const vl = rm.valorLiquido;
            if (cod == null || vl == null) return;
            liquidoPorRemessa.set(Number(cod), Number(vl));
          });
        }
      } catch (_) { /* mantém o valor bruto se a busca falhar */ }

      const ajustarCartao = (m) => {
        if (m.tipoDocumentoOrigem !== 'CARTAO_REMESSA' || m.documentoOrigemCodigo == null) return m;
        const liquido = liquidoPorRemessa.get(Number(m.documentoOrigemCodigo));
        if (liquido == null) return m;
        return { ...m, valor: liquido, valorBrutoCartao: m.valor };
      };

      const mapa = {};
      results.forEach(r => { mapa[r.key] = { movimentos: r.movimentos.map(ajustarCartao) }; });
      setDadosPorMes(mapa);

      // ─── Saldo de ABERTURA real por conta ───────────────────────────
      // O campo `saldo` do MOVIMENTO_CONTA é lançado em lote/retro-datado, então
      // NÃO dá pra reconstruir a abertura pela variação movimento-a-movimento.
      // Mas o ÚLTIMO movimento ANTES do período deixa a conta exatamente no saldo
      // de abertura (mesmo mecanismo do fechamento, que bate com a Quality ao centavo).
      // Buscamos uma janela de 3 meses antes do início e pegamos, por conta, o saldo
      // do movimento mais recente (por data + sequência). Best-effort: se falhar, a
      // composição cai no cálculo derivado.
      try {
        const primeiroMes = meses[0];
        const fmtD = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const iniAbertura = fmtD(new Date(primeiroMes.ano, primeiroMes.mes - 1 - 3, 1)); // 3 meses antes
        const fimAbertura = fmtD(new Date(primeiroMes.ano, primeiroMes.mes - 1, 0));      // véspera do início
        setLoadingProgress({ atual: total, total, mensagem: 'Buscando saldo de abertura das contas...' });
        const saldoDepois = (m) => {
          const v = m.saldoPosterior ?? m.saldoApos ?? m.saldoAtual ?? m.saldo ?? m.saldoConta;
          return v != null ? Number(v) : null;
        };
        // cod -> { key, saldo } do movimento mais recente da janela
        const ultimoPorConta = new Map();
        for (const ec of empresaCodigos) {
          const movs = await qualityApi.buscarMovimentoConta(chave.chave, {
            dataInicial: iniAbertura, dataFinal: fimAbertura, empresaCodigo: ec,
          });
          (movs || []).forEach(m => {
            if (m.contaCodigo == null) return;
            const cod = String(m.contaCodigo);
            const sd = saldoDepois(m);
            if (sd == null) return;
            const key = `${m.dataMovimento || ''}|${String(m.movimentoContaCodigo || 0).padStart(20, '0')}`;
            const prev = ultimoPorConta.get(cod);
            if (!prev || key > prev.key) ultimoPorConta.set(cod, { key, saldo: sd });
          });
        }
        const mapAbertura = new Map();
        ultimoPorConta.forEach((v, cod) => mapAbertura.set(cod, v.saldo));
        setAberturaPorConta(mapAbertura);
      } catch (_) {
        setAberturaPorConta(new Map());
      }

      // Catálogo do plano gerencial (código -> nome) p/ mostrar o NOME das
      // contas não mapeadas no diagnóstico. Best-effort: se falhar, usa o código.
      qualityApi.buscarPlanoContasGerencial(chave.chave)
        .then(plano => {
          const m = new Map();
          (plano || []).forEach(p => {
            const cod = p.codigo ?? p.planoContaGerencialCodigo;
            const nome = p.descricao ?? p.nome ?? p.planoContaGerencialDescricao;
            if (cod != null && nome) m.set(String(cod), nome);
          });
          setNomePlanoGerencial(m);
        })
        .catch(() => { /* nome é opcional */ });

      // Busca titulos a pagar num intervalo ampliado (12 meses antes do inicio
      // do periodo), pra pegar pagamentos de titulos emitidos ha mais tempo.
      // Ignora erro: se falhar, o TITULO_PAGAR_PAGAMENTO volta pra "sem classificacao".
      try {
        const primeiroMes = meses[0];
        const ultimoMes = meses[meses.length - 1];
        const rInicio = rangeMes(primeiroMes.ano - 1, primeiroMes.mes);
        const rFim = rangeMes(ultimoMes.ano, ultimoMes.mes);
        setLoadingProgress({ atual: total, total, mensagem: 'Buscando títulos a pagar para resolver pagamentos...' });
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
  }, [cliente, meses, filtroContas]);

  const handleMontarFluxo = useCallback(() => {
    setReportSolicitado(true);
    setDadosCarregados(false);
    setReportReady(false);
    carregarDados();
  }, [carregarDados]);

  // Autosystem: o filtro de contas afeta o CÁLCULO (transferências de contas
  // fora da seleção contam como entrada/saída real), então re-busca ao mudar a
  // seleção — mas só depois do 1º "Montar Fluxo" e só no Autosystem (Webposto
  // filtra no cliente, sem custo de rede).
  useEffect(() => {
    if (!reportSolicitado) return;
    if (!cliente || cliente.usa_webposto || !cliente.as_rede_id) return;
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroContas]);

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

  // Map contaCodigo (sempre como String) -> classificacao (tipo).
  // String suporta tanto Webposto (códigos numéricos) quanto Autosystem
  // (códigos hierárquicos do plano de contas, ex: "1.1.2.001").
  const tipoPorConta = useMemo(() => {
    const m = new Map();
    contasClassificadas.forEach(c => {
      if (c.ativo !== false) m.set(String(c.conta_codigo), c.tipo);
    });
    return m;
  }, [contasClassificadas]);

  // Quantas contas ATIVAS da rede estao classificadas como bancaria/caixa.
  // Zero = usuario ainda nao classificou nada, fluxo vai sair vazio.
  const qtdContasFluxo = useMemo(
    () => contasClassificadas.filter(c => c.ativo !== false && (c.tipo === 'bancaria' || c.tipo === 'caixa')).length,
    [contasClassificadas],
  );

  // Map contaCodigo (String) -> descricao (da CONTA endpoint ou contas caixa/banco)
  const descricaoPorConta = useMemo(() => {
    const m = new Map();
    contasMeta.forEach(c => {
      const cod = c.contaCodigo ?? c.codigo;
      if (cod != null) m.set(String(cod), c.descricao || c.nome || `Conta #${cod}`);
    });
    return m;
  }, [contasMeta]);

  // Lista de contas que aparecem nos movimentos da empresa selecionada.
  // Respeita o toggle de tipos (tiposContaAtivos) - conta de tipo nao selecionado
  // nao entra nem no dropdown nem nos calculos.
  const contasDisponiveis = useMemo(() => {
    // Fonte ESTÁVEL = contas classificadas como caixa/banco (config), pra que o
    // dropdown não colapse quando o fetch é filtrado por seleção (Autosystem).
    // Fallback (redes sem classificação carregada): deriva dos movimentos.
    if (contasClassificadas.length > 0) {
      return contasClassificadas
        .filter(c => c.ativo !== false && (c.tipo === 'bancaria' || c.tipo === 'caixa') && tiposContaAtivos.has(c.tipo))
        .map(c => {
          const cod = String(c.conta_codigo);
          return { codigo: cod, nome: descricaoPorConta.get(cod) || `Conta #${cod}` };
        })
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }
    const set = new Map();
    Object.values(dadosPorMes).forEach(dados => {
      (dados.movimentos || []).forEach(m => {
        if (m.contaCodigo == null) return;
        const cod = String(m.contaCodigo);
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
  }, [contasClassificadas, dadosPorMes, tipoPorConta, descricaoPorConta, tiposContaAtivos]);

  // ─── Indexar movimentos por conta + mes ───────────────────
  // Crédito = +valor (entrou caixa). Débito = -valor (saiu caixa).
  // Aplica filtros: tipo de conta + contas especificas.
  const { totaisPorConta, totaisPorContaLado, lancamentosPorConta, nomesPorPlano } = useMemo(() => {
    const totais = {};
    // Totais SEPARADOS por direção (crédito/entrada 'C' vs débito/saída 'D') por
    // conta+mês. Usado pelo mapeamento por direção do Autosystem (mesma conta em
    // grupos diferentes conforme debitada/creditada). 'C' guarda entradas (>0),
    // 'D' guarda saídas (<0).
    const totaisLado = {};
    const addLado = (codigo, mesKey, valorSignado, sinal) => {
      const dir = sinal > 0 ? 'C' : 'D';
      if (!totaisLado[codigo]) totaisLado[codigo] = { C: {}, D: {} };
      totaisLado[codigo][dir][mesKey] = (totaisLado[codigo][dir][mesKey] || 0) + valorSignado;
    };
    const lancs = {};
    const nomes = {}; // codigo do plano -> nome da conta gerencial (p/ diagnostico)
    Object.entries(dadosPorMes).forEach(([mesKey, dados]) => {
      (dados.movimentos || []).forEach(m => {
        if (m.contaCodigo == null) return;
        const cod = String(m.contaCodigo);
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
                if (x.titulo.planoContaGerencialDescricao && !nomes[planoKey]) {
                  nomes[planoKey] = x.titulo.planoContaGerencialDescricao;
                }
                if (!totais[planoKey]) totais[planoKey] = {};
                totais[planoKey][mesKey] = (totais[planoKey][mesKey] || 0) + parcela;
                addLado(planoKey, mesKey, parcela, sinal);
                if (!lancs[planoKey]) lancs[planoKey] = [];
                const tituloCod = x.titulo.tituloPagarCodigo ?? x.titulo.codigo ?? null;
                const partLabel = entradasComPlano.length > 1
                  ? ` · parte do lote (${idx + 1}/${entradasComPlano.length}) · título #${tituloCod ?? '—'}`
                  : ` · título #${tituloCod ?? '—'}`;
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
        if (temPlano && m.planoContaGerencialDescricao && !nomes[codigo]) {
          nomes[codigo] = m.planoContaGerencialDescricao;
        }

        if (!totais[codigo]) totais[codigo] = {};
        totais[codigo][mesKey] = (totais[codigo][mesKey] || 0) + valor;
        addLado(codigo, mesKey, valor, sinal);

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
    return { totaisPorConta: totais, totaisPorContaLado: totaisLado, lancamentosPorConta: lancs, nomesPorPlano: nomes };
  }, [dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas, titulosPorPagamento]);

  // ─── Composicao do saldo por conta (saldo inicial + movs = saldo atual) ─
  // Respeita os mesmos filtros aplicados ao fluxo (bancaria/caixa + multi-select).
  // Fonte dos saldos: MOVIMENTO_CONTA com mostraSaldo=true (saldo anterior/posterior
  // por movimento). Se a API só trouxer o saldo pós-movimento, derivamos o inicial.
  const composicaoSaldo = useMemo(() => {
    // Saldo ANTES do movimento (opening candidate) e DEPOIS (closing candidate).
    const saldoAntes = (mm) => {
      const v = mm.saldoAnterior ?? mm.saldoAnteriorConta ?? mm.saldoInicial;
      return v != null ? Number(v) : null;
    };
    const saldoDepois = (mm) => {
      const v = mm.saldoPosterior ?? mm.saldoApos ?? mm.saldoAtual ?? mm.saldo ?? mm.saldoConta;
      return v != null ? Number(v) : null;
    };

    const todos = [];
    Object.values(dadosPorMes).forEach(d => (d.movimentos || []).forEach(m => todos.push(m)));
    todos.sort((a, b) => (a.dataMovimento || '').localeCompare(b.dataMovimento || ''));

    const porConta = new Map();
    todos.forEach(m => {
      if (m.contaCodigo == null) return;
      const cod = String(m.contaCodigo);
      const tipoConta = tipoPorConta.get(cod);
      if (tipoConta !== 'bancaria' && tipoConta !== 'caixa') return;
      if (!tiposContaAtivos.has(tipoConta)) return;
      if (filtroContas.size > 0 && !filtroContas.has(cod)) return;

      const valorSinal = Math.abs(Number(m.valor || 0)) * (m.tipo === 'Crédito' ? 1 : -1);

      let atual = porConta.get(cod);
      if (!atual) {
        // Saldo inicial: fonte confiável = saldo do último movimento ANTES do período
        // (aberturaPorConta, buscado à parte). Só cai no derivado (saldo antes do 1º
        // movimento do período, ou saldoDepois − valor) se a conta não teve movimento
        // na janela anterior.
        const sb = saldoAntes(m);
        const sd = saldoDepois(m);
        const iniDerivado = sb != null ? sb : (sd != null ? sd - valorSinal : 0);
        const iniReal = aberturaPorConta.get(cod);
        const ini = iniReal != null ? iniReal : iniDerivado;
        atual = {
          contaCodigo: cod,
          contaNome: descricaoPorConta.get(cod) || `Conta #${cod}`,
          saldoInicial: ini,
          entradas: 0,
          saidas: 0,
          saldoAtual: null,
        };
        porConta.set(cod, atual);
      }
      const valor = Math.abs(Number(m.valor || 0));
      if (m.tipo === 'Crédito') atual.entradas += valor;
      else atual.saidas += valor;
      const sd = saldoDepois(m); // o último (mais recente) prevalece = saldo atual
      if (sd != null) atual.saldoAtual = sd;
    });
    // Fallback: se nenhum movimento trouxe saldoPosterior, calcula pela variacao.
    porConta.forEach(c => {
      if (c.saldoAtual == null) c.saldoAtual = c.saldoInicial + c.entradas - c.saidas;
    });
    return Array.from(porConta.values())
      .sort((a, b) => (a.contaNome || '').localeCompare(b.contaNome || ''));
  }, [dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas, descricaoPorConta, aberturaPorConta]);

  // ─── Build Fluxo tree ─────────────────────────────────────
  const fluxoTree = useMemo(() => {
    if (!grupos.length) return [];

    function buildNode(grupo) {
      const contasMapeadas = mapeamentos.filter(m => m.grupo_fluxo_id === grupo.id);
      const contas = contasMapeadas.map(m => {
        const codKey = String(m.plano_conta_codigo);
        // Direção (Autosystem): 'C' usa só entradas, 'D' só saídas, null = líquido.
        const fonte = m.lado === 'C' ? (totaisPorContaLado[codKey]?.C)
          : m.lado === 'D' ? (totaisPorContaLado[codKey]?.D)
          : totaisPorConta[codKey];
        const valoresPorMes = {};
        let totalPeriodo = 0;
        meses.forEach(mes => {
          const v = fonte?.[mes.key] || 0;
          valoresPorMes[mes.key] = v;
          totalPeriodo += v;
        });
        let lancs = lancamentosPorConta[codKey] || [];
        if (m.lado === 'C') lancs = lancs.filter(l => l.sinal > 0);
        else if (m.lado === 'D') lancs = lancs.filter(l => l.sinal < 0);
        lancs = lancs.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
        return {
          id: m.id,
          codigo: m.plano_conta_codigo,
          descricao: m.plano_conta_descricao,
          lado: m.lado,
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
  }, [grupos, mapeamentos, totaisPorConta, totaisPorContaLado, lancamentosPorConta, meses]);

  // ─── Grupo sintetico "Sem classificacao" ───────────────────
  // Captura movimentos que nao foram alocados em nenhum grupo da mascara:
  //   - Movimentos sem planoContaGerencialCodigo (agrupados por tipoDocumentoOrigem)
  //   - Planos gerenciais sem mapeamento pra grupo_fluxo
  // Fica fora do calculo de subtotais/resultado (nao vira "Variacao de Caixa")
  // pra evitar mascarar inconsistencias do DRE gerencial. E renderizado em bloco
  // separado abaixo da arvore principal, puramente informativo.
  const semClassificacaoNode = useMemo(() => {
    // Mapeamento sensível à direção (Autosystem): 'null'=ambos, 'C'=crédito, 'D'=débito.
    const mapNull = new Set(mapeamentos.filter(m => !m.lado).map(m => String(m.plano_conta_codigo)));
    const mapC = new Set(mapeamentos.filter(m => m.lado === 'C').map(m => String(m.plano_conta_codigo)));
    const mapD = new Set(mapeamentos.filter(m => m.lado === 'D').map(m => String(m.plano_conta_codigo)));
    const contas = [];
    Object.entries(totaisPorConta).forEach(([codigo, valoresPorMesAll]) => {
      if (codigo === TRANSFER_CODE) return; // vai pro grupo "Transferências", não aqui
      if (mapNull.has(codigo)) return; // vínculo "ambos" cobre a conta inteira
      // Direções ainda NÃO mapeadas desta conta (se só um lado tem vínculo, o
      // outro fica sem classificação — ex.: conta só mapeada como crédito).
      const dirsNaoMapeadas = [];
      if (!mapC.has(codigo)) dirsNaoMapeadas.push('C');
      if (!mapD.has(codigo)) dirsNaoMapeadas.push('D');
      if (dirsNaoMapeadas.length === 0) return; // ambas direções já mapeadas
      const soUmaDirecao = dirsNaoMapeadas.length === 1;

      const semPlano = codigo.startsWith(SEM_PLANO_PREFIX);
      const tipoDoc = semPlano ? codigo.substring(SEM_PLANO_PREFIX.length) : null;
      const nomeConta = semPlano
        ? null
        : ((nomesPorPlano && nomesPorPlano[codigo]) || nomePlanoGerencial.get(String(codigo)) || null);
      // Nome principal: para plano, o nome da conta gerencial (se houver);
      // para grupos sem plano, o proprio tipo de documento.
      const descricao = semPlano
        ? (tipoDoc || 'OUTROS').replace(/_/g, ' ')
        : (nomeConta || `Plano #${codigo} (sem mapeamento)`);

      const valoresPorMes = {};
      let totalPeriodo = 0;
      meses.forEach(mes => {
        // Se só uma direção está sem mapa, mostra apenas o valor daquela direção;
        // se ambas, o total líquido da conta.
        const v = soUmaDirecao
          ? (totaisPorContaLado[codigo]?.[dirsNaoMapeadas[0]]?.[mes.key] || 0)
          : (valoresPorMesAll[mes.key] || 0);
        valoresPorMes[mes.key] = v;
        totalPeriodo += v;
      });

      let lancs = lancamentosPorConta[codigo] || [];
      if (soUmaDirecao) {
        const d = dirsNaoMapeadas[0];
        lancs = lancs.filter(l => (l.sinal > 0 ? 'C' : 'D') === d);
      }
      lancs = lancs.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));

      // Tipos de documento distintos que compoem este grupo
      const tiposDoc = semPlano
        ? [(tipoDoc || 'OUTROS').replace(/_/g, ' ')]
        : [...new Set(lancs.map(l => l.tipoDoc).filter(Boolean))];

      contas.push({
        id: `sc-${codigo}`,
        codigo,
        semPlano,
        nomeConta,
        tiposDoc,
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
      nome: 'Sem classificação',
      tipo: 'grupo',
      contas,
      children: [],
      valoresPorMes,
      totalPeriodo,
      isSemClassificacao: true,
    };
  }, [totaisPorConta, totaisPorContaLado, lancamentosPorConta, nomesPorPlano, nomePlanoGerencial, mapeamentos, meses]);

  // 🔍 DIAGNÓSTICO TEMPORÁRIO — por que contas mapeadas ainda caem em "não
  // mapeados". Compara os códigos mapeados × não-mapeados (JSON revela espaços).
  // REMOVER depois de identificar a causa.
  useEffect(() => {
    if (!semClassificacaoNode || !mapeamentos.length) return;
    const mapCodes = mapeamentos.map(m => String(m.plano_conta_codigo));
    const mapTrim = new Set(mapCodes.map(c => c.trim()));
    const naoMap = (semClassificacaoNode.contas || []).map(c => String(c.codigo));
    console.group('%c🔍 DIAG não-mapeados (temporário)', 'color:#a50;font-weight:bold');
    console.log('MAPEADOS (raw):', mapCodes.map(c => JSON.stringify(c)));
    console.log('NÃO-MAPEADOS (raw):', naoMap.map(c => JSON.stringify(c)));
    const casamSoAposTrim = naoMap.filter(c => !mapCodes.includes(c) && mapTrim.has(c.trim()));
    console.log('%cNÃO-MAPEADOS que casariam SÓ APÓS TRIM (=problema de espaço):',
      'color:#c00;font-weight:bold', casamSoAposTrim.map(c => JSON.stringify(c)));
    console.log('detalhe vínculos:', mapeamentos.map(m => ({ cod: JSON.stringify(String(m.plano_conta_codigo)), lado: m.lado, grupo: m.grupo_fluxo_id })));
    console.groupEnd();
  }, [semClassificacaoNode, mapeamentos]);

  // Exporta o bloco "não mapeados" para XLSX (resumo por grupo + lançamentos).
  const exportarNaoMapeadosXlsx = useCallback(() => {
    const node = semClassificacaoNode;
    if (!node || !node.contas.length) return;
    const mesCols = meses.map(m => `${m.label} (R$)`);

    const aoaResumo = [
      ['Nome da conta / Tipo de documento', 'Plano', 'Tipo(s) de documento', 'Qtd lançamentos', ...mesCols, 'Total (R$)'],
      ...node.contas.map(c => [
        c.descricao,
        c.semPlano ? '' : c.codigo,
        (c.tiposDoc || []).join(', '),
        c.lancamentos.length,
        ...meses.map(m => Number(c.valoresPorMes[m.key] || 0)),
        Number(c.totalPeriodo || 0),
      ]),
      ['Total não mapeado', '', '', '', ...meses.map(m => Number(node.valoresPorMes[m.key] || 0)), Number(node.totalPeriodo || 0)],
    ];

    const aoaLancs = [['Conta / Tipo de documento', 'Data', 'Descrição', 'Tipo de documento', 'Mês', 'Valor (R$)']];
    node.contas.forEach(c => {
      (c.lancamentos || []).forEach(l => {
        const mesLabel = meses.find(m => m.key === l.mesKey)?.label || l.mesKey || '';
        aoaLancs.push([c.descricao, l.data || '', l.descricao || '', l.tipoDoc || '', mesLabel, Number((l.valor || 0) * (l.sinal || 1))]);
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaResumo), 'Não mapeados');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaLancs), 'Lançamentos');
    const periodo = meses.length ? `-${meses[0].key}_a_${meses[meses.length - 1].key}` : '';
    XLSX.writeFile(wb, `fluxo-nao-mapeados${periodo}.xlsx`);
  }, [semClassificacaoNode, meses]);

  // ─── Grupo sintético "Transferências entre contas" ─────────
  // Movimentos cuja contraparte também é caixa/banco (transferências que
  // cruzaram a fronteira da seleção). Diferente de "Sem classificação", ESTE
  // grupo É somado na Variação de Caixa — é o que faz o total bater com o
  // extrato quando se filtra uma conta.
  const transferenciasNode = useMemo(() => {
    const valoresPorMesAll = totaisPorConta[TRANSFER_CODE];
    if (!valoresPorMesAll) return null;
    const valoresPorMes = {};
    let totalPeriodo = 0;
    meses.forEach(mes => { const v = valoresPorMesAll[mes.key] || 0; valoresPorMes[mes.key] = v; totalPeriodo += v; });
    const temValor = Math.abs(totalPeriodo) > 0.005 || meses.some(m => Math.abs(valoresPorMes[m.key]) > 0.005);
    if (!temValor) return null;
    const lancs = (lancamentosPorConta[TRANSFER_CODE] || [])
      .slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    return {
      id: '__transferencias__',
      nome: TRANSFER_TIPO_DOC,
      tipo: 'grupo',
      contas: [{ id: 'tr-contas', codigo: TRANSFER_CODE, descricao: 'Entre contas próprias', valoresPorMes, totalPeriodo, lancamentos: lancs }],
      children: [],
      valoresPorMes,
      totalPeriodo,
      isTransferencias: true,
    };
  }, [totaisPorConta, lancamentosPorConta, meses]);

  // ─── Acumulado para subtotais/resultados ───────────────────
  const fluxoComCalculos = useMemo(() => {
    const acumPorMes = {};
    let acumTotal = 0;
    meses.forEach(m => { acumPorMes[m.key] = 0; });

    // Insere o grupo de transferências imediatamente ANTES da linha de resultado
    // final (Variação de Caixa), pra que ela some as transferências no total.
    let nodes = fluxoTree;
    if (transferenciasNode) {
      nodes = [...fluxoTree];
      let idx = -1;
      for (let i = nodes.length - 1; i >= 0; i--) { if (nodes[i].tipo === 'resultado') { idx = i; break; } }
      if (idx === -1) nodes.push(transferenciasNode);
      else nodes.splice(idx, 0, transferenciasNode);
    }

    return nodes.map(node => {
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
  }, [fluxoTree, transferenciasNode, meses]);

  const totalGeral = useMemo(() =>
    fluxoComCalculos.find(n => n.tipo === 'resultado')?.totalPeriodo
    ?? (fluxoTree.reduce((s, n) => s + n.totalPeriodo, 0) + (transferenciasNode?.totalPeriodo || 0))
  , [fluxoComCalculos, fluxoTree, transferenciasNode]);


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
      const saldoInicial = Number(saldosIniciaisPorEmpresa?.[String(ec)] ?? 0);
      porEmpresa[ec] = {
        empresa: emp, empresaCodigo: ec,
        saldoInicial,
        entradas: 0, saidas: 0, variacao: 0, saldoFinal: saldoInicial,
      };
    });

    Object.values(dadosPorMes).forEach(d => {
      (d.movimentos || []).forEach(m => {
        const ec = Number(m.empresaCodigo);
        if (!porEmpresa[ec]) return;
        if (m.contaCodigo == null) return;
        const contaCod = String(m.contaCodigo);
        const tipoConta = tipoPorConta.get(contaCod);
        if (tipoConta !== 'bancaria' && tipoConta !== 'caixa') return;
        if (!tiposContaAtivos.has(tipoConta)) return;
        if (filtroContas.size > 0 && !filtroContas.has(contaCod)) return;
        const valor = Math.abs(Number(m.valor || 0));
        if (m.tipo === 'Crédito') porEmpresa[ec].entradas += valor;
        else porEmpresa[ec].saidas += valor;
      });
    });

    const arr = Object.values(porEmpresa).map(p => {
      const variacao = p.entradas - p.saidas;
      return { ...p, variacao, saldoFinal: p.saldoInicial + variacao };
    }).sort((a, b) => b.variacao - a.variacao);
    const somaAbs = arr.reduce((s, p) => s + Math.abs(p.variacao), 0);
    const totalConsolidado = arr.reduce((s, p) => s + p.variacao, 0);
    return {
      empresas: arr.map(p => ({
        ...p,
        participacao: somaAbs > 0 ? (Math.abs(p.variacao) / somaAbs) * 100 : 0,
      })),
      totalConsolidado,
      totalSaldoInicial: arr.reduce((s, p) => s + p.saldoInicial, 0),
      totalSaldoFinal:   arr.reduce((s, p) => s + p.saldoFinal, 0),
    };
  }, [modoRede, cliente, dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas, saldosIniciaisPorEmpresa]);

  // ─── Evolução do Caixa (saldo acumulado ao longo do período) ────────────
  // Reaproveita: saldo inicial REAL (resultadoPorEmpresa/composicaoSaldo) + os
  // MESMOS movimentos filtrados (tipo de conta, contas específicas, empresas da
  // seleção). Bucketiza por dia/semana/mês conforme o tamanho do período e
  // acumula: saldo = saldo inicial + Σ(entradas − saídas) até o ponto.
  const evolucaoCaixa = useMemo(() => {
    if (!dadosCarregados || !meses.length) return null;

    // Contas de aplicação financeira a EXCLUIR (quando o toggle está off). O filtro
    // é pela CONTRAPARTIDA do lançamento — planoContaGerencialCodigo (contraparte
    // resolvida) ou _contraparteBruta (crua, ex.: transferência p/ aplicação).
    const excluirApl = !incluirAplicacoes && contasAplicacao.size > 0 ? contasAplicacao : null;
    const ehAplicacao = (m) => !!excluirApl && (
      excluirApl.has(String(m.planoContaGerencialCodigo)) || excluirApl.has(String(m._contraparteBruta))
    );

    const saldoInicialPeriodo = modoRede
      ? (resultadoPorEmpresa?.totalSaldoInicial ?? 0)
      : composicaoSaldo.reduce((s, c) => s + (Number(c.saldoInicial) || 0), 0);

    // Em rede, conta só movimentos de empresas da seleção (igual à "Variação por
    // empresa"), pra o saldo final bater com aquela tabela.
    const empresasValidas = modoRede
      ? new Set((cliente?._empresas || []).map(e => Number(e.empresa_codigo)).filter(Number.isFinite))
      : null;

    // Todos os movimentos do período CARREGADO (data + entrada + saída).
    const movsAll = [];
    Object.values(dadosPorMes).forEach(d => (d.movimentos || []).forEach(m => {
      if (m.contaCodigo == null || !m.dataMovimento) return;
      const cod = String(m.contaCodigo);
      const tc = tipoPorConta.get(cod);
      if (tc !== 'bancaria' && tc !== 'caixa') return;
      if (!tiposContaAtivos.has(tc)) return;
      if (filtroContas.size > 0 && !filtroContas.has(cod)) return;
      if (ehAplicacao(m)) return;
      if (empresasValidas && !empresasValidas.has(Number(m.empresaCodigo))) return;
      const abs = Math.abs(Number(m.valor || 0));
      movsAll.push({
        data: String(m.dataMovimento).slice(0, 10),
        contaCodigo: cod,
        contaNome: descricaoPorConta.get(cod) || `Conta #${cod}`,
        descricao: (m.descricao || '').trim(),
        entrada: m.tipo === 'Crédito' ? abs : 0,
        saida: m.tipo === 'Crédito' ? 0 : abs,
      });
    }));

    // Limites do período carregado (dos meses selecionados no relatório).
    const loadedIni = rangeMes(meses[0].ano, meses[0].mes).dataInicial;
    const loadedFim = rangeMes(meses[meses.length - 1].ano, meses[meses.length - 1].mes).dataFinal;
    // Recorte específico da Evolução (seleção do usuário), clampado aos limites.
    const clampD = (d, lo, hi) => (d < lo ? lo : d > hi ? hi : d);
    const dataIni = evolRange.ini ? clampD(evolRange.ini, loadedIni, loadedFim) : loadedIni;
    const dataFim = evolRange.fim ? clampD(evolRange.fim, dataIni, loadedFim) : loadedFim;

    // Saldo no INÍCIO do recorte = abertura do período + Σ(net) antes do recorte.
    const netAntes = movsAll.reduce((s, m) => s + (m.data < dataIni ? (m.entrada - m.saida) : 0), 0);
    const saldoInicial = saldoInicialPeriodo + netAntes;
    // Movimentos dentro do recorte.
    const movs = movsAll.filter(m => m.data >= dataIni && m.data <= dataFim);

    const parse = (s) => { const [y, mo, d] = s.split('-').map(Number); return new Date(y, mo - 1, d); };
    const iniDate = parse(dataIni);
    const dias = Math.round((parse(dataFim) - iniDate) / 86400000) + 1;
    // Granularidade: escolha do usuário, ou automática pelo tamanho do período.
    const gran = granEvol !== 'auto' ? granEvol : (dias <= 31 ? 'dia' : dias <= 92 ? 'semana' : 'mes');
    const dd = (n) => String(n).padStart(2, '0');
    const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const chaveBucket = (dataStr) => {
      const dt = parse(dataStr);
      // Diário: inclui o dia da semana (Seg, Ter…) pra ver o padrão do fluxo.
      if (gran === 'dia') return { k: dataStr, ord: dt.getTime(), lbl: `${DIAS_SEM[dt.getDay()]} ${dd(dt.getDate())}/${dd(dt.getMonth() + 1)}` };
      if (gran === 'semana') {
        const wk = Math.floor((dt - iniDate) / (7 * 86400000));
        const ini = new Date(iniDate.getTime() + wk * 7 * 86400000);
        return { k: `w${wk}`, ord: ini.getTime(), lbl: `${dd(ini.getDate())}/${dd(ini.getMonth() + 1)}` };
      }
      return { k: `${dt.getFullYear()}-${dt.getMonth()}`, ord: new Date(dt.getFullYear(), dt.getMonth(), 1).getTime(), lbl: `${MESES_NOMES[dt.getMonth()]}/${String(dt.getFullYear()).slice(2)}` };
    };

    const buckets = new Map();
    movs.forEach(m => {
      const b = chaveBucket(m.data);
      let cur = buckets.get(b.k);
      if (!cur) { cur = { ord: b.ord, lbl: b.lbl, entradas: 0, saidas: 0, movs: [] }; buckets.set(b.k, cur); }
      cur.entradas += m.entrada; cur.saidas += m.saida; cur.movs.push(m);
    });

    const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    const arr = Array.from(buckets.values()).sort((a, b) => a.ord - b.ord);
    let acum = saldoInicial;
    const pontos = [{ label: 'Início', saldo: r2(saldoInicial), entradas: 0, saidas: 0, variacao: 0, varAcum: 0, inicio: true, movimentos: [], fds: false }];
    arr.forEach(b => {
      const varP = b.entradas - b.saidas;
      acum += varP;
      // Fim de semana (só faz sentido na visão diária) → coluna amarela no gráfico.
      const fds = gran === 'dia' && [0, 6].includes(new Date(b.ord).getDay());
      // varAcum = soma das variações desde o início do recorte (= saldo − saldo inicial).
      pontos.push({ label: b.lbl, saldo: r2(acum), entradas: r2(b.entradas), saidas: r2(b.saidas), variacao: r2(varP), varAcum: r2(acum - saldoInicial), movimentos: b.movs, fds });
    });

    const saldoFinal = pontos[pontos.length - 1].saldo;
    let menor = pontos[0], maior = pontos[0], idxMenor = 0;
    pontos.forEach((p, i) => { if (p.saldo < menor.saldo) { menor = p; idxMenor = i; } if (p.saldo > maior.saldo) maior = p; });
    const variacao = saldoFinal - saldoInicial;
    const variacaoPct = saldoInicial !== 0 ? (variacao / Math.abs(saldoInicial)) * 100 : null;
    const amplitude = maior.saldo - menor.saldo;
    // Min/max de cada série (pro gradiente verde-acima / vermelho-abaixo do zero).
    const varMin = Math.min(0, ...pontos.map(p => p.variacao));
    const varMax = Math.max(0, ...pontos.map(p => p.variacao));
    // Offset (fração do topo até o zero) pro gradiente de cor da área.
    const calcOff = (mn, mx) => (mn >= 0 ? 1 : mx <= 0 ? 0 : mx / (mx - mn));
    const offSaldo = calcOff(menor.saldo, maior.saldo);
    const offVar = calcOff(varMin, varMax);

    // Linha de tendência (regressão linear por mínimos quadrados) da variação
    // acumulada — mostra se, no geral, o caixa está subindo ou caindo no período.
    const N = pontos.length;
    let tendenciaDir = 'estavel';
    if (N >= 2) {
      const sx = (N - 1) * N / 2;                       // Σi
      const sxx = (N - 1) * N * (2 * N - 1) / 6;         // Σi²
      let sy = 0, sxy = 0;
      pontos.forEach((p, i) => { sy += p.varAcum; sxy += i * p.varAcum; });
      const denom = N * sxx - sx * sx;
      const slope = denom !== 0 ? (N * sxy - sx * sy) / denom : 0;
      const intercept = (sy - slope * sx) / N;
      pontos.forEach((p, i) => { p.tendencia = r2(intercept + slope * i); });
      tendenciaDir = slope > 0.0001 ? 'alta' : slope < -0.0001 ? 'queda' : 'estavel';
    } else {
      pontos.forEach((p) => { p.tendencia = p.varAcum; });
    }

    // Domínios fixos do eixo Y (usados nos dois gráficos: o do eixo fixo e o
    // rolável — assim os ticks alinham na vertical). Com uma folga de 8%.
    const padDom = (mn, mx) => { const r = (mx - mn) || Math.abs(mx) || 1; return [mn - r * 0.08, mx + r * 0.08]; };
    const domSaldo = padDom(Math.min(...pontos.map((p) => p.saldo)), Math.max(...pontos.map((p) => p.saldo)));
    const varTodos = [0, ...pontos.map((p) => p.variacao), ...pontos.map((p) => p.varAcum), ...pontos.map((p) => p.tendencia)];
    const domVar = padDom(Math.min(...varTodos), Math.max(...varTodos));

    // Diagnóstico dinâmico, com números reais.
    const pctTxt = variacaoPct != null ? ` (${variacaoPct >= 0 ? '+' : ''}${variacaoPct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)` : '';
    const partes = [];
    if (variacao > 0) partes.push(`O caixa apresentou evolução positiva no período, com crescimento líquido de ${formatCurrency(variacao)}${pctTxt}, encerrando acima do saldo inicial.`);
    else if (variacao < 0) partes.push(`O caixa apresentou redução no período, com consumo líquido de ${formatCurrency(Math.abs(variacao))}${pctTxt} de recursos.`);
    else partes.push('O caixa encerrou o período praticamente no mesmo nível do início.');
    if (saldoInicial !== 0 && amplitude > Math.abs(saldoInicial) * 0.4) {
      partes.push(`Houve elevada oscilação, com diferença de ${formatCurrency(amplitude)} entre o maior e o menor saldo.`);
    }
    if (!menor.inicio) partes.push(`O menor nível de caixa ocorreu em ${menor.label}, quando o saldo chegou a ${formatCurrency(menor.saldo)}.`);

    // Com muitos pontos (ex.: diário em 3 meses), o gráfico fica largo e o
    // container rola na horizontal, mostrando cada dia legível.
    const larguraPx = pontos.length > 16 ? Math.max(720, pontos.length * 46) : null;

    return {
      pontos, saldoInicial, saldoFinal, maiorSaldo: maior.saldo, menorSaldo: menor.saldo,
      menorLabel: menor.label, idxMenor, variacao, variacaoPct, amplitude,
      diagnostico: partes.join(' '), granularidade: gran, dataIni, dataFim, larguraPx,
      loadedIni, loadedFim, varMin, varMax, offSaldo, offVar,
      tendenciaDir, domSaldo, domVar, movimentos: movs,
    };
  }, [dadosCarregados, modoRede, resultadoPorEmpresa, composicaoSaldo, cliente, dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas, descricaoPorConta, meses, granEvol, evolRange, incluirAplicacoes, contasAplicacao]);

  // Giro semanal "de segunda a segunda": agrupa TODOS os movimentos do período em
  // semanas (2ª→dom) e monta o perfil médio por dia da semana, pra revelar a
  // habitualidade (ex.: compras concentradas na sexta, pagamentos na segunda).
  const giroSemanal = useMemo(() => {
    const movs = evolucaoCaixa?.movimentos || [];
    if (movs.length === 0) return null;
    const NOMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const dowSeg = (ymd) => (new Date(ymd + 'T00:00:00').getDay() + 6) % 7; // 0=segunda … 6=domingo
    const segundaDa = (ymd) => { const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() - dowSeg(ymd)); return d.toISOString().slice(0, 10); };

    const semanas = new Map();
    movs.forEach((m) => {
      const key = segundaDa(m.data);
      if (!semanas.has(key)) {
        const fim = new Date(key + 'T00:00:00'); fim.setDate(fim.getDate() + 6);
        semanas.set(key, { ini: key, fim: fim.toISOString().slice(0, 10), entradas: 0, saidas: 0, dia: Array.from({ length: 7 }, () => ({ e: 0, s: 0 })) });
      }
      const w = semanas.get(key); const dow = dowSeg(m.data);
      w.entradas += m.entrada; w.saidas += m.saida;
      w.dia[dow].e += m.entrada; w.dia[dow].s += m.saida;
    });
    const lista = [...semanas.values()].sort((a, b) => a.ini.localeCompare(b.ini))
      .map((w) => ({ ...w, variacao: w.entradas - w.saidas }));
    const n = lista.length || 1;

    // Perfil médio por dia da semana (média sobre o total de semanas do período).
    const perfil = NOMES.map((nome, i) => {
      let e = 0, s = 0, oc = 0;
      lista.forEach((w) => { e += w.dia[i].e; s += w.dia[i].s; if (w.dia[i].e || w.dia[i].s) oc++; });
      return { nome, mediaE: e / n, mediaS: s / n, totalE: e, totalS: s, semanasComMov: oc };
    });
    const maxMedia = Math.max(1, ...perfil.map((p) => Math.max(p.mediaE, p.mediaS)));
    const idxMaiorS = perfil.reduce((mi, p, i, a) => (p.mediaS > a[mi].mediaS ? i : mi), 0);
    const idxMaiorE = perfil.reduce((mi, p, i, a) => (p.mediaE > a[mi].mediaE ? i : mi), 0);

    // Habitualidade: em quantas semanas o dia de pico coincidiu com o pico geral.
    const topS = lista.filter((w) => w.saidas > 0).map((w) => w.dia.reduce((mi, d, i, a) => (d.s > a[mi].s ? i : mi), 0));
    const topE = lista.filter((w) => w.entradas > 0).map((w) => w.dia.reduce((mi, d, i, a) => (d.e > a[mi].e ? i : mi), 0));
    const habitS = topS.length ? topS.filter((i) => i === idxMaiorS).length / topS.length : 0;
    const habitE = topE.length ? topE.filter((i) => i === idxMaiorE).length / topE.length : 0;

    return { lista, perfil, maxMedia, diaMaiorS: perfil[idxMaiorS], diaMaiorE: perfil[idxMaiorE], habitS, habitE, nSemanas: lista.length };
  }, [evolucaoCaixa]);

  // Achata a árvore de grupos do fluxo (com caminho no rótulo) pra o usuário
  // escolher quais grupos representam Recebimentos de clientes e Pagamentos a
  // fornecedores na análise de "Capacidade de geração de caixa".
  const nosFluxo = useMemo(() => {
    const out = [];
    const walk = (nodes, prefix) => (nodes || []).forEach(n => {
      const label = prefix ? `${prefix} › ${n.nome}` : n.nome;
      out.push({ id: n.id, nome: n.nome, label, valoresPorMes: n.valoresPorMes, totalPeriodo: n.totalPeriodo });
      if (n.children?.length) walk(n.children, label);
    });
    walk(fluxoTree, '');
    return out;
  }, [fluxoTree]);

  // Recebimentos de clientes × Pagamentos a fornecedores → capacidade de gerar
  // caixa pra pagar fornecedores. Grupos detectados pelo nome (ou escolhidos).
  const capacidadeCaixa = useMemo(() => {
    if (nosFluxo.length === 0) return null;
    const achar = (re) => nosFluxo.find(n => re.test(n.nome || ''));
    const recNo = nosFluxo.find(n => n.id === grpRecebId) || achar(/client/i) || achar(/receb/i);
    const fornNo = nosFluxo.find(n => n.id === grpFornId) || achar(/fornecedor/i) || achar(/pagament/i);
    if (!recNo && !fornNo) return null;

    const porMes = meses.map(m => {
      const rec = recNo ? Math.abs(recNo.valoresPorMes[m.key] || 0) : 0;
      const pag = fornNo ? Math.abs(fornNo.valoresPorMes[m.key] || 0) : 0;
      return { key: m.key, label: m.label, rec, pag, saldo: rec - pag };
    });
    const totalRec = porMes.reduce((s, x) => s + x.rec, 0);
    const totalPag = porMes.reduce((s, x) => s + x.pag, 0);
    const saldo = totalRec - totalPag;
    const cobertura = totalPag > 0 ? totalRec / totalPag : null;
    const maxBar = Math.max(1, ...porMes.map(x => Math.max(x.rec, x.pag)));
    // Como a sobra do mês foi consumida pelos DEMAIS grupos — árvore até o nível 3,
    // em sequência de grupo (1, 2, 3…). Os grupos que contêm clientes/fornecedores
    // têm esses valores DESCONTADOS (senão a sobra seria contada duas vezes), então
    // o "Resultado do mês" bate com a variação real de caixa.
    const contem = (node, id) => !!id && (node.id === id || (node.children || []).some(ch => contem(ch, id)));
    const buildOutro = (node, key, nivel) => {
      if (node.id === recNo?.id || node.id === fornNo?.id) return null; // podado (é clientes/fornecedores)
      const recV = recNo && contem(node, recNo.id) ? Number(recNo.valoresPorMes[key] || 0) : 0;
      const fornV = fornNo && contem(node, fornNo.id) ? Number(fornNo.valoresPorMes[key] || 0) : 0;
      const valor = Number(node.valoresPorMes[key] || 0) - recV - fornV;
      const children = nivel < 3
        ? (node.children || []).map(ch => buildOutro(ch, key, nivel + 1)).filter(Boolean).sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
        : [];
      if (Math.abs(valor) < 0.005 && children.length === 0) return null;
      return { id: node.id, nome: node.nome, ordem: node.ordem, valor, children };
    };
    porMes.forEach(row => {
      const arvore = fluxoTree.map(n => buildOutro(n, row.key, 1)).filter(Boolean).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      const consumoOutros = arvore.reduce((s, o) => s + o.valor, 0);
      row.outros = arvore;
      row.resultado = row.saldo + consumoOutros; // sobra + demais grupos = variação real do mês
    });

    return { porMes, totalRec, totalPag, saldo, cobertura, maxBar, recNome: recNo?.nome, fornNome: fornNo?.nome, recId: recNo?.id, fornId: fornNo?.id };
  }, [nosFluxo, fluxoTree, grpRecebId, grpFornId, meses]);

  // Nao auto-expande o bloco "Sem classificacao" — usuario abre manualmente
  // quando quiser auditar itens fora da mascara.

  // ═══════════════════════════════════════════════════════════
  // ABA "POR EMPRESA": mesma mascara do fluxo, mas com empresas
  // da rede como COLUNAS (em vez de meses). Mes unico selecionavel.
  // ═══════════════════════════════════════════════════════════

  const colunasEmpresa = useMemo(() => {
    if (!modoRede) return [];
    return (cliente?._empresas || [])
      .filter(emp => Number.isFinite(Number(emp.empresa_codigo)))
      .map(emp => {
        const ec = Number(emp.empresa_codigo);
        const nome = nomeEmpresa(emp, usarApelido) || `#${ec}`;
        return {
          key: String(ec),
          label: nome.length > 18 ? nome.substring(0, 18) + '…' : nome,
          _empresaCodigo: ec,
          _empresa: emp,
        };
      });
  }, [modoRede, cliente, usarApelido]);

  const mesEmpresa = useMemo(
    () => meses.find(m => m.key === mesEmpresaKey) || null,
    [meses, mesEmpresaKey]
  );

  // Indexa MOVIMENTO_CONTA do mes selecionado por (plano, empresa).
  // Espelha o memo principal (totaisPorConta/lancamentosPorConta) mas com
  // empresaCodigo como "mesKey". Respeita os mesmos filtros.
  const { totaisPorContaEmpresa, totaisPorContaLadoEmpresa, lancamentosPorContaEmpresa } = useMemo(() => {
    const totais = {};
    const totaisLado = {};
    const addLado = (codigo, empKey, valorSignado, sinal) => {
      const dir = sinal > 0 ? 'C' : 'D';
      if (!totaisLado[codigo]) totaisLado[codigo] = { C: {}, D: {} };
      totaisLado[codigo][dir][empKey] = (totaisLado[codigo][dir][empKey] || 0) + valorSignado;
    };
    const lancs = {};
    const vazio = { totaisPorContaEmpresa: totais, totaisPorContaLadoEmpresa: totaisLado, lancamentosPorContaEmpresa: lancs };
    if (!mesEmpresa) return vazio;
    const dados = dadosPorMes[mesEmpresa.key];
    if (!dados) return vazio;

    (dados.movimentos || []).forEach(m => {
      if (m.contaCodigo == null) return;
      const cod = String(m.contaCodigo);
      const tipoConta = tipoPorConta.get(cod);
      if (tipoConta !== 'bancaria' && tipoConta !== 'caixa') return;
      if (!tiposContaAtivos.has(tipoConta)) return;
      if (filtroContas.size > 0 && !filtroContas.has(cod)) return;
      const empKey = String(m.empresaCodigo ?? '');
      if (!empKey) return;

      let planoBruto = m.planoContaGerencialCodigo;
      const temPlano = planoBruto != null && planoBruto !== 0 && planoBruto !== '';
      const sinal = m.tipo === 'Crédito' ? 1 : -1;
      const valorAbs = Math.abs(Number(m.valor || 0));
      const valor = valorAbs * sinal;
      const idBase = m.codigo || `${m.movimentoContaCodigo}`;

      // Distribuicao TITULO_PAGAR_PAGAMENTO em lote (mesmo tratamento do memo principal).
      if (m.tipoDocumentoOrigem === 'TITULO_PAGAR_PAGAMENTO' && m.movimentoContaCodigo != null) {
        const chave = Number(m.movimentoContaCodigo);
        const lote = titulosPorPagamento.get(chave);
        if (Array.isArray(lote) && lote.length > 0) {
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
            entradasComPlano.forEach((x, idx) => {
              const parcela = x.valorTitulo * sinal;
              const planoKey = String(x.planoCod);
              if (!totais[planoKey]) totais[planoKey] = {};
              totais[planoKey][empKey] = (totais[planoKey][empKey] || 0) + parcela;
              addLado(planoKey, empKey, parcela, sinal);
              if (!lancs[planoKey]) lancs[planoKey] = [];
              const tituloCod = x.titulo.tituloPagarCodigo ?? x.titulo.codigo ?? null;
              const partLabel = entradasComPlano.length > 1
                ? ` · parte do lote (${idx + 1}/${entradasComPlano.length}) · título #${tituloCod ?? '—'}`
                : ` · título #${tituloCod ?? '—'}`;
              lancs[planoKey].push({
                id: entradasComPlano.length > 1 ? `${idBase}-p${idx}-e${empKey}` : `${idBase}-e${empKey}`,
                mesKey: empKey, // FluxoNodeRows usa l.mesKey pra coluna
                data: m.dataMovimento,
                descricao: `${(m.descricao || '').trim() || '—'}${partLabel}`,
                tipoDoc: m.tipoDocumentoOrigem,
                movimentoContaCodigo: m.movimentoContaCodigo ?? null,
                tituloPagarCodigo: tituloCod,
                valor: x.valorTitulo,
                sinal,
              });
            });
            return;
          }
        }
      }

      const codigo = temPlano
        ? String(planoBruto)
        : `${SEM_PLANO_PREFIX}${m.tipoDocumentoOrigem || 'OUTROS'}`;

      if (!totais[codigo]) totais[codigo] = {};
      totais[codigo][empKey] = (totais[codigo][empKey] || 0) + valor;
      addLado(codigo, empKey, valor, sinal);
      if (!lancs[codigo]) lancs[codigo] = [];
      lancs[codigo].push({
        id: `${idBase}-e${empKey}`,
        mesKey: empKey,
        data: m.dataMovimento,
        descricao: (m.descricao || '').trim() || '—',
        tipoDoc: m.tipoDocumentoOrigem,
        movimentoContaCodigo: m.movimentoContaCodigo ?? null,
        valor: valorAbs,
        sinal,
      });
    });
    return { totaisPorContaEmpresa: totais, totaisPorContaLadoEmpresa: totaisLado, lancamentosPorContaEmpresa: lancs };
  }, [mesEmpresa, dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas, titulosPorPagamento]);

  // Arvore Fluxo com empresas como colunas (espelha fluxoTree com colunasEmpresa)
  const fluxoTreeEmpresa = useMemo(() => {
    if (!modoRede || !grupos.length || colunasEmpresa.length === 0) return [];

    function buildNode(grupo) {
      const contasMapeadas = mapeamentos.filter(m => m.grupo_fluxo_id === grupo.id);
      const contas = contasMapeadas.map(m => {
        const codKey = String(m.plano_conta_codigo);
        const fonte = m.lado === 'C' ? (totaisPorContaLadoEmpresa[codKey]?.C)
          : m.lado === 'D' ? (totaisPorContaLadoEmpresa[codKey]?.D)
          : totaisPorContaEmpresa[codKey];
        const valoresPorMes = {};
        let totalPeriodo = 0;
        colunasEmpresa.forEach(col => {
          const v = fonte?.[col.key] || 0;
          valoresPorMes[col.key] = v;
          totalPeriodo += v;
        });
        let lancs = lancamentosPorContaEmpresa[codKey] || [];
        if (m.lado === 'C') lancs = lancs.filter(l => l.sinal > 0);
        else if (m.lado === 'D') lancs = lancs.filter(l => l.sinal < 0);
        lancs = lancs.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
        return {
          id: m.id,
          codigo: m.plano_conta_codigo,
          descricao: m.plano_conta_descricao,
          lado: m.lado,
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
      colunasEmpresa.forEach(col => {
        const fromContas = contas.reduce((s, c) => s + (c.valoresPorMes[col.key] || 0), 0);
        const fromChildren = children.reduce((s, c) => s + (c.valoresPorMes[col.key] || 0), 0);
        valoresPorMes[col.key] = fromContas + fromChildren;
        totalPeriodo += valoresPorMes[col.key];
      });
      return { ...grupo, contas, children, valoresPorMes, totalPeriodo };
    }

    return grupos
      .filter(g => !g.parent_id)
      .sort((a, b) => a.ordem - b.ordem)
      .map(buildNode);
  }, [modoRede, grupos, mapeamentos, colunasEmpresa, totaisPorContaEmpresa, totaisPorContaLadoEmpresa, lancamentosPorContaEmpresa]);

  // Grupo "Transferências entre contas" para a aba Por Empresa (colunas=empresas).
  const transferenciasNodeEmpresa = useMemo(() => {
    if (!modoRede || colunasEmpresa.length === 0) return null;
    const valoresPorColAll = totaisPorContaEmpresa[TRANSFER_CODE];
    if (!valoresPorColAll) return null;
    const valoresPorMes = {};
    let totalPeriodo = 0;
    colunasEmpresa.forEach(col => { const v = valoresPorColAll[col.key] || 0; valoresPorMes[col.key] = v; totalPeriodo += v; });
    const temValor = Math.abs(totalPeriodo) > 0.005 || colunasEmpresa.some(c => Math.abs(valoresPorMes[c.key]) > 0.005);
    if (!temValor) return null;
    const lancs = (lancamentosPorContaEmpresa[TRANSFER_CODE] || [])
      .slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    return {
      id: '__transferencias_emp__', nome: TRANSFER_TIPO_DOC, tipo: 'grupo',
      contas: [{ id: 'tr-contas-emp', codigo: TRANSFER_CODE, descricao: 'Entre contas próprias', valoresPorMes, totalPeriodo, lancamentos: lancs }],
      children: [], valoresPorMes, totalPeriodo, isTransferencias: true,
    };
  }, [modoRede, colunasEmpresa, totaisPorContaEmpresa, lancamentosPorContaEmpresa]);

  const fluxoComCalculosEmpresa = useMemo(() => {
    const acum = {};
    let acumTotal = 0;
    colunasEmpresa.forEach(c => { acum[c.key] = 0; });

    let nodes = fluxoTreeEmpresa;
    if (transferenciasNodeEmpresa) {
      nodes = [...fluxoTreeEmpresa];
      let idx = -1;
      for (let i = nodes.length - 1; i >= 0; i--) { if (nodes[i].tipo === 'resultado') { idx = i; break; } }
      if (idx === -1) nodes.push(transferenciasNodeEmpresa);
      else nodes.splice(idx, 0, transferenciasNodeEmpresa);
    }

    return nodes.map(node => {
      if (node.tipo === 'subtotal' || node.tipo === 'resultado') {
        return {
          ...node,
          isCalc: true,
          valoresPorMes: { ...acum },
          totalPeriodo: acumTotal,
        };
      }
      colunasEmpresa.forEach(c => { acum[c.key] += (node.valoresPorMes[c.key] || 0); });
      acumTotal += node.totalPeriodo;
      return node;
    });
  }, [fluxoTreeEmpresa, transferenciasNodeEmpresa, colunasEmpresa]);

  const totalGeralEmpresa = useMemo(() =>
    fluxoComCalculosEmpresa.find(n => n.tipo === 'resultado')?.totalPeriodo
    ?? (fluxoTreeEmpresa.reduce((s, n) => s + n.totalPeriodo, 0) + (transferenciasNodeEmpresa?.totalPeriodo || 0))
  , [fluxoComCalculosEmpresa, fluxoTreeEmpresa, transferenciasNodeEmpresa]);

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
    return <div className="text-center py-20 text-gray-500">Cliente não encontrado</div>;
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
              <span className="truncate">{labelEmpresa(cliente)}</span>
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
            <p style={{ fontSize: '10pt', margin: '4px 0' }}>{labelEmpresa(cliente)}{cliente.cnpj ? ` - CNPJ ${labelCnpj(cliente.cnpj)}` : ''}</p>
            <p style={{ fontSize: '10pt', margin: '4px 0', color: '#666' }}>Período: {periodoLabel} &middot; Máscara: {mascaraSelecionada?.nome}</p>
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
        className="bg-white rounded-xl border border-gray-200/60 px-3 py-2.5 mb-5 shadow-sm no-print">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-[180px]">
            <label className="block text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Máscara Fluxo de Caixa</label>
            <select value={mascaraSelecionada?.id || ''}
              onChange={(e) => setMascaraSelecionada(mascaras.find(m => m.id === e.target.value))}
              className="w-full h-8 rounded-lg border border-gray-200 px-2 text-[11px] focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">
              {mascaras.length === 0 && <option value="">Nenhuma máscara cadastrada</option>}
              {mascaras.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mês (referência)</label>
            <div className="flex items-center gap-0.5 h-8 rounded-lg border border-gray-200 bg-white px-0.5">
              <button onClick={() => navMes(-1)} className="rounded-md p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-50">
                <ChevLeft className="h-3 w-3" />
              </button>
              <select value={mesFinal.mes}
                onChange={(e) => setMesFinal(p => ({ ...p, mes: Number(e.target.value) }))}
                className="text-[11px] border-0 focus:outline-none bg-transparent">
                {MESES_NOMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
              </select>
              <select value={mesFinal.ano}
                onChange={(e) => setMesFinal(p => ({ ...p, ano: Number(e.target.value) }))}
                className="text-[11px] border-0 focus:outline-none bg-transparent">
                {[today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={() => navMes(1)} className="rounded-md p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-50">
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Análise</label>
            <div className="flex items-center gap-0.5 bg-gray-100/80 rounded-lg p-0.5 h-8">
              {[1, 3, 6].map(q => (
                <button key={q} onClick={() => setQtdMeses(q)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                    qtdMeses === q ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {q === 1 ? '1 mês' : `${q} meses`}
                </button>
              ))}
            </div>
          </div>

          {/* Seletor de empresas (injetado pelo wrapper cliente) */}
          {seletorEmpresas && (
            <div className="h-8 flex items-end">{seletorEmpresas}</div>
          )}

          <div>
            <button onClick={handleMontarFluxo} disabled={loadingDados || !mascaraSelecionada}
              className="flex items-center gap-1.5 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 text-[11px] font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loadingDados ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
              Montar Fluxo
            </button>
          </div>

          <div className="flex items-center gap-1.5 ml-auto flex-wrap h-8">
            <ApelidoToggle empresas={redeContexto?.empresas} somenteQuandoHaApelidos={false} />
            {/* Filtros de tipo e conta específica ficam só para admin */}
            {!modoCliente && (
              <>
                <div className="flex items-center gap-0.5 bg-gray-100/80 rounded-lg p-0.5 h-8">
                  <span className="px-1.5 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Tipo:</span>
                  {[
                    { key: 'bancaria', label: 'Bancária' },
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
                        className={`rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-all ${
                          ativo ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700'
                        }`}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <MultiSelectContas
                  contas={contasDisponiveis}
                  selecionadas={filtroContas}
                  onChange={setFiltroContas}
                  open={filtroContasOpen}
                  setOpen={setFiltroContasOpen}
                />
              </>
            )}
            <button onClick={() => setOcultarZeradas(!ocultarZeradas)}
              className={`flex items-center gap-1 h-8 rounded-lg px-2.5 text-[10.5px] font-medium transition-all border ${
                ocultarZeradas ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {ocultarZeradas ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
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
            <p className="font-semibold mb-0.5">Nenhuma conta classificada como bancária ou caixa</p>
            <p className="text-amber-700">
              O fluxo de caixa consome apenas contas marcadas como <strong>Conta bancária</strong> ou <strong>Conta caixa</strong> em
              Cadastros &rarr; Clientes &rarr; Classificar contas da rede. Enquanto não houver ao menos uma
              conta classificada, o relatório retorna vazio.
            </p>
          </div>
        </div>
      )}


      {/* Tabs Fluxo | Por Empresa (rede) | Evolução — após relatório pronto */}
      {reportReady && (
        <div className="flex items-center gap-0.5 mb-4 bg-gray-100/80 rounded-lg p-0.5 w-fit no-print">
          <button onClick={() => setActiveTab('fluxo')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
              activeTab === 'fluxo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Wallet className="h-3.5 w-3.5" /> Fluxo
          </button>
          {modoRede && colunasEmpresa.length > 0 && (
            <button onClick={() => setActiveTab('empresa')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
                activeTab === 'empresa' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Building2 className="h-3.5 w-3.5" /> Por Empresa
            </button>
          )}
          <button onClick={() => setActiveTab('evolucao')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
              activeTab === 'evolucao' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <LineChartIcon className="h-3.5 w-3.5" /> Evolução
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {!reportSolicitado ? (
          <motion.div key="aguardando" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
              <Wallet className="h-7 w-7 text-white" />
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Selecione o período e clique em "Montar Fluxo"</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              O relatório sera gerado a partir das movimentações de caixa em <strong>{meses.map(m => m.label).join(', ')}</strong>.
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
            <p className="text-sm font-medium text-gray-800 mb-1">Máscara vazia</p>
            <p className="text-xs text-gray-400">Configure a estrutura em Parâmetros &gt; Máscaras Fluxo de Caixa</p>
          </motion.div>
        ) : activeTab === 'evolucao' ? (
          <motion.div key="evolucao" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="space-y-5">
            {!evolucaoCaixa || evolucaoCaixa.pontos.length <= 1 ? (
              <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center">
                <LineChartIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-800 mb-1">Sem movimentações no período</p>
                <p className="text-xs text-gray-400">Não há dados suficientes para montar a evolução do caixa.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <CardEvol titulo="Saldo inicial" valor={formatCurrency(evolucaoCaixa.saldoInicial)} />
                  <CardEvol titulo="Saldo final" valor={formatCurrency(evolucaoCaixa.saldoFinal)}
                    destaque={evolucaoCaixa.saldoFinal >= evolucaoCaixa.saldoInicial ? 'bom' : 'ruim'} />
                  <CardEvol titulo="Variação" valor={`${evolucaoCaixa.variacao >= 0 ? '+' : ''}${formatCurrency(evolucaoCaixa.variacao)}`}
                    sub={evolucaoCaixa.variacaoPct != null ? `${evolucaoCaixa.variacaoPct >= 0 ? '+' : ''}${evolucaoCaixa.variacaoPct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : 'saldo inicial zero'}
                    destaque={evolucaoCaixa.variacao >= 0 ? 'bom' : 'ruim'} />
                  <CardEvol titulo="Maior saldo" valor={formatCurrency(evolucaoCaixa.maiorSaldo)} />
                  <CardEvol titulo="Menor saldo" valor={formatCurrency(evolucaoCaixa.menorSaldo)} sub={evolucaoCaixa.menorLabel} destaque="ruim" />
                </div>

                <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <LineChartIcon className="h-4 w-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold text-gray-800">Evolução do Caixa</h3>
                    <div className="flex items-center gap-1">
                      <input type="date" value={evolRange.ini || evolucaoCaixa.dataIni}
                        min={evolucaoCaixa.loadedIni} max={evolucaoCaixa.loadedFim}
                        onChange={(e) => setEvolRange(r => ({ ...r, ini: e.target.value }))}
                        title="Início do recorte da evolução"
                        className="h-7 rounded-md border border-gray-200 px-1.5 text-[11px] text-gray-600 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                      <span className="text-[11px] text-gray-400">—</span>
                      <input type="date" value={evolRange.fim || evolucaoCaixa.dataFim}
                        min={evolRange.ini || evolucaoCaixa.loadedIni} max={evolucaoCaixa.loadedFim}
                        onChange={(e) => setEvolRange(r => ({ ...r, fim: e.target.value }))}
                        title="Fim do recorte da evolução"
                        className="h-7 rounded-md border border-gray-200 px-1.5 text-[11px] text-gray-600 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                      {(evolRange.ini || evolRange.fim) && (
                        <button type="button" onClick={() => setEvolRange({ ini: '', fim: '' })}
                          className="text-[11px] text-blue-500 hover:text-blue-700 ml-0.5">limpar</button>
                      )}
                    </div>
                    {contasAplicacao.size > 0 && (
                      <button type="button" onClick={() => setIncluirAplicacoes(v => !v)}
                        title="Incluir ou excluir as contas de aplicação financeira na análise do fluxo"
                        className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${
                          incluirAplicacoes
                            ? 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                            : 'border-amber-300 bg-amber-50 text-amber-700'
                        }`}>
                        {incluirAplicacoes ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        Aplicações {incluirAplicacoes ? 'incluídas' : 'excluídas'}
                      </button>
                    )}
                    <div className={`flex items-center gap-0.5 ${contasAplicacao.size > 0 ? '' : 'ml-auto'} bg-gray-100/80 rounded-lg p-0.5`}>
                      {[
                        { v: 'saldo', label: 'Saldo' },
                        { v: 'variacao', label: 'Variação' },
                      ].map(op => (
                        <button key={op.v} type="button" onClick={() => setModoGrafico(op.v)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                            modoGrafico === op.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          }`}>
                          {op.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-0.5 bg-gray-100/80 rounded-lg p-0.5">
                      {[
                        { v: 'dia', label: 'Dia' },
                        { v: 'semana', label: 'Semana' },
                        { v: 'mes', label: 'Mês' },
                      ].map(op => (
                        <button key={op.v} type="button" onClick={() => setGranEvol(op.v)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                            evolucaoCaixa.granularidade === op.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          }`}>
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex">
                    {/* Eixo Y fixo — não acompanha o scroll horizontal. Renderiza só o
                        eixo (mesmo domínio do gráfico ao lado), pra rótulos ficarem visíveis. */}
                    <div style={{ width: 74, flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height={360}>
                        {/* Sem XAxis: a margem inferior replica (altura do XAxis + margem)
                            do gráfico ao lado, pra área de plotagem alinhar na vertical. */}
                        <ComposedChart data={evolucaoCaixa.pontos} margin={{ top: 10, right: 0, left: 4, bottom: evolucaoCaixa.larguraPx ? 80 : 34 }}>
                          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={70} tickFormatter={fmtEixoCaixa}
                            domain={modoGrafico === 'variacao' ? evolucaoCaixa.domVar : evolucaoCaixa.domSaldo} allowDataOverflow />
                          <Area dataKey={modoGrafico === 'variacao' ? 'variacao' : 'saldo'} stroke="none" fill="none" isAnimationActive={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Gráfico rolável (eixo Y oculto — quem mostra os rótulos é o fixo à esquerda). */}
                    <div className="overflow-x-auto flex-1">
                      <div style={{ height: 360, width: evolucaoCaixa.larguraPx || '100%', minWidth: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={evolucaoCaixa.pontos} margin={{ top: 10, right: 16, left: 0, bottom: evolucaoCaixa.larguraPx ? 24 : 4 }}
                        style={{ cursor: 'pointer' }}>
                        <defs>
                          <linearGradient id="evolFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#10b981" stopOpacity={0.35} />
                            <stop offset={modoGrafico === 'variacao' ? evolucaoCaixa.offVar : evolucaoCaixa.offSaldo} stopColor="#10b981" stopOpacity={0.06} />
                            <stop offset={modoGrafico === 'variacao' ? evolucaoCaixa.offVar : evolucaoCaixa.offSaldo} stopColor="#ef4444" stopOpacity={0.06} />
                            <stop offset="1" stopColor="#ef4444" stopOpacity={0.35} />
                          </linearGradient>
                          <linearGradient id="evolStroke" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#059669" />
                            <stop offset={modoGrafico === 'variacao' ? evolucaoCaixa.offVar : evolucaoCaixa.offSaldo} stopColor="#059669" />
                            <stop offset={modoGrafico === 'variacao' ? evolucaoCaixa.offVar : evolucaoCaixa.offSaldo} stopColor="#dc2626" />
                            <stop offset="1" stopColor="#dc2626" />
                          </linearGradient>
                        </defs>
                        {/* Colunas amarelas dos fins de semana (visão Dia) — desenhadas por trás
                            via hooks do recharts v3 (Customized foi deprecado e não injeta escala). */}
                        {evolucaoCaixa.granularidade === 'dia' && <BandasFimDeSemana pontos={evolucaoCaixa.pontos} />}
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickMargin={8}
                          interval={evolucaoCaixa.larguraPx ? 0 : 'preserveStartEnd'} minTickGap={evolucaoCaixa.larguraPx ? 0 : 16}
                          angle={evolucaoCaixa.larguraPx ? -40 : 0} textAnchor={evolucaoCaixa.larguraPx ? 'end' : 'middle'}
                          height={evolucaoCaixa.larguraPx ? 56 : 30} />
                        <YAxis hide width={0} tickFormatter={fmtEixoCaixa}
                          domain={modoGrafico === 'variacao' ? evolucaoCaixa.domVar : evolucaoCaixa.domSaldo} allowDataOverflow />
                        <RTooltip content={<TooltipEvol />} />
                        {modoGrafico === 'variacao' && <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" />}
                        <Area type="monotone" dataKey={modoGrafico === 'variacao' ? 'variacao' : 'saldo'}
                          name={modoGrafico === 'variacao' ? 'Variação' : 'Saldo'} baseValue={0}
                          stroke="url(#evolStroke)" strokeWidth={2} fill="url(#evolFill)"
                          dot={<DotEvol mode={modoGrafico} />}
                          activeDot={<DotEvol mode={modoGrafico} active />}
                          style={{ pointerEvents: 'none' }} isAnimationActive={false} />
                        {modoGrafico === 'variacao' && (
                          <Line type="monotone" dataKey="varAcum" name="Variação acumulada"
                            stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} style={{ pointerEvents: 'none' }} isAnimationActive={false} />
                        )}
                        {modoGrafico === 'variacao' && (
                          <Line type="monotone" dataKey="tendencia" name="Tendência"
                            stroke="#eab308" strokeWidth={2} strokeDasharray="2 4" dot={false} activeDot={false} style={{ pointerEvents: 'none' }} isAnimationActive={false} />
                        )}
                        {/* Áreas de clique (coluna inteira do dia) — por cima de tudo. */}
                        <ColunasClicaveis pontos={evolucaoCaixa.pontos} onSelect={setModalEvol} />
                      </ComposedChart>
                    </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  {/* Legenda das séries e da coluna de fim de semana. */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 pt-3 text-[11px] text-gray-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: 'linear-gradient(90deg,#10b981,#ef4444)' }} />
                      {modoGrafico === 'variacao' ? 'Variação do período (verde +, vermelho −)' : 'Saldo acumulado (verde +, vermelho −)'}
                    </span>
                    {modoGrafico === 'variacao' && (
                      <span className="inline-flex items-center gap-1.5">
                        <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#2563eb" strokeWidth="2" strokeDasharray="6 4" /></svg>
                        Variação acumulada
                      </span>
                    )}
                    {modoGrafico === 'variacao' && (
                      <span className="inline-flex items-center gap-1.5">
                        <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#eab308" strokeWidth="2" strokeDasharray="2 4" /></svg>
                        Tendência {evolucaoCaixa.tendenciaDir === 'alta' ? '(alta)' : evolucaoCaixa.tendenciaDir === 'queda' ? '(queda)' : '(estável)'}
                      </span>
                    )}
                    {evolucaoCaixa.granularidade === 'dia' && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: '#fde047', opacity: 0.6 }} />
                        Fim de semana
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50/60 to-white rounded-2xl border border-emerald-100 p-4 sm:p-5">
                  <div className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      {evolucaoCaixa.variacao >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-gray-800 mb-0.5">Diagnóstico</p>
                      <p className="text-[13px] text-gray-600 leading-relaxed">{evolucaoCaixa.diagnostico}</p>
                    </div>
                  </div>
                </div>

                {giroSemanal && (
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <CalendarRange className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Giro semanal (segunda a segunda)</p>
                        <p className="text-[11px] text-gray-400">{giroSemanal.nSemanas} semana(s) no período · padrão por dia e habitualidade</p>
                      </div>
                    </div>

                    {/* Conclusão de habitualidade */}
                    <div className="px-5 py-3 bg-indigo-50/40 border-b border-indigo-100/60 text-[12.5px] text-gray-700 leading-relaxed">
                      As <strong className="text-red-700">saídas</strong> se concentram na <strong>{giroSemanal.diaMaiorS.nome}</strong>{' '}
                      (~{formatCurrency(giroSemanal.diaMaiorS.mediaS)}/semana), padrão que se repetiu em <strong>{Math.round(giroSemanal.habitS * 100)}%</strong> das semanas.
                      {' '}As <strong className="text-emerald-700">entradas</strong> se concentram na <strong>{giroSemanal.diaMaiorE.nome}</strong>{' '}
                      (~{formatCurrency(giroSemanal.diaMaiorE.mediaE)}/semana), em <strong>{Math.round(giroSemanal.habitE * 100)}%</strong> das semanas.
                      {' '}{(giroSemanal.habitS >= 0.6 || giroSemanal.habitE >= 0.6)
                        ? 'Há uma habitualidade semanal clara.'
                        : 'O padrão varia entre as semanas — habitualidade fraca.'}
                    </div>

                    <div className="grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                      {/* Perfil médio por dia da semana */}
                      <div className="p-4 sm:p-5">
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Padrão por dia da semana (média/semana)</p>
                        <div className="space-y-2.5">
                          {giroSemanal.perfil.map((p) => {
                            const destaqueS = p.nome === giroSemanal.diaMaiorS.nome;
                            const destaqueE = p.nome === giroSemanal.diaMaiorE.nome;
                            return (
                              <div key={p.nome} className="flex items-center gap-2.5">
                                <span className={`w-16 text-[11.5px] flex-shrink-0 ${destaqueS || destaqueE ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>{p.nome}</span>
                                <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                                  <div className="h-2 rounded-sm bg-emerald-400" style={{ width: `${Math.max(p.mediaE > 0 ? 3 : 0, (p.mediaE / giroSemanal.maxMedia) * 100)}%` }} />
                                  <div className="h-2 rounded-sm bg-red-400" style={{ width: `${Math.max(p.mediaS > 0 ? 3 : 0, (p.mediaS / giroSemanal.maxMedia) * 100)}%` }} />
                                </div>
                                <span className="text-[10px] font-mono w-[120px] text-right flex-shrink-0 tabular-nums">
                                  <span className="text-emerald-600">+{fmtEixoCaixa(p.mediaE)}</span>
                                  <span className="text-gray-300"> / </span>
                                  <span className="text-red-600">-{fmtEixoCaixa(p.mediaS)}</span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
                          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-emerald-400" />entradas</span>
                          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-red-400" />saídas</span>
                        </div>
                      </div>

                      {/* Semanas do período */}
                      <div className="p-4 sm:p-5">
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Semanas do período</p>
                        <div className="overflow-y-auto max-h-[280px] pr-3">
                          <table className="w-full text-[12px]">
                            <thead className="text-gray-400 text-[10px] uppercase tracking-wider sticky top-0 bg-white">
                              <tr>
                                <th className="text-left py-1.5 font-medium">Semana</th>
                                <th className="text-right py-1.5 font-medium">Entradas</th>
                                <th className="text-right py-1.5 font-medium">Saídas</th>
                                <th className="text-right py-1.5 pr-1 font-medium">Variação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {giroSemanal.lista.map((w) => (
                                <tr key={w.ini} className="hover:bg-gray-50/50">
                                  <td className="py-1.5 text-gray-600 whitespace-nowrap">{formatarDataBr(w.ini).slice(0, 5)}–{formatarDataBr(w.fim).slice(0, 5)}</td>
                                  <td className="py-1.5 text-right font-mono text-emerald-600 tabular-nums">+{fmtEixoCaixa(w.entradas)}</td>
                                  <td className="py-1.5 text-right font-mono text-red-600 tabular-nums">-{fmtEixoCaixa(w.saidas)}</td>
                                  <td className={`py-1.5 pr-1 text-right font-mono tabular-nums font-semibold ${w.variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{w.variacao >= 0 ? '+' : ''}{fmtEixoCaixa(w.variacao)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {capacidadeCaixa && (
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Scale className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Capacidade de geração de caixa</p>
                          <p className="text-[11px] text-gray-400">Recebimentos de clientes × Pagamentos a fornecedores no período</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] flex-wrap no-print">
                        <label className="flex items-center gap-1 text-gray-500">Clientes:
                          <select value={capacidadeCaixa.recId || ''} onChange={e => setGrpRecebId(e.target.value || null)}
                            className="h-7 rounded-md border border-gray-200 px-1.5 text-[11px] text-gray-700 max-w-[150px] focus:border-blue-400 focus:outline-none">
                            <option value="">— selecionar —</option>
                            {nosFluxo.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1 text-gray-500">Fornecedores:
                          <select value={capacidadeCaixa.fornId || ''} onChange={e => setGrpFornId(e.target.value || null)}
                            className="h-7 rounded-md border border-gray-200 px-1.5 text-[11px] text-gray-700 max-w-[150px] focus:border-blue-400 focus:outline-none">
                            <option value="">— selecionar —</option>
                            {nosFluxo.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="px-5 py-3 bg-blue-50/40 border-b border-blue-100/60 text-[12.5px] text-gray-700 leading-relaxed">
                      {capacidadeCaixa.cobertura != null ? (
                        <>Os recebimentos de clientes cobriram <strong>{Math.round(capacidadeCaixa.cobertura * 100)}%</strong> dos
                          {' '}pagamentos a fornecedores no período
                          {capacidadeCaixa.saldo >= 0
                            ? <> — sobraram <strong className="text-emerald-700">{formatCurrency(capacidadeCaixa.saldo)}</strong> de caixa.</>
                            : <> — faltaram <strong className="text-red-700">{formatCurrency(-capacidadeCaixa.saldo)}</strong>.</>}
                          {' '}Para cada <strong>R$ 1,00</strong> pago a fornecedores, entraram <strong>{formatCurrency(capacidadeCaixa.cobertura)}</strong> de clientes.</>
                      ) : 'Sem pagamentos a fornecedores no período para comparar.'}
                    </div>

                    <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                      <div className="p-4 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Recebido de clientes</p>
                        <p className="text-[15px] font-semibold text-emerald-700 tabular-nums">{formatCurrency(capacidadeCaixa.totalRec)}</p>
                      </div>
                      <div className="p-4 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Pago a fornecedores</p>
                        <p className="text-[15px] font-semibold text-red-600 tabular-nums">{formatCurrency(capacidadeCaixa.totalPag)}</p>
                      </div>
                      <div className="p-4 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Sobra de caixa</p>
                        <p className={`text-[15px] font-semibold tabular-nums ${capacidadeCaixa.saldo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {capacidadeCaixa.saldo >= 0 ? '+' : ''}{formatCurrency(capacidadeCaixa.saldo)}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 space-y-2">
                      <p className="text-[10.5px] text-gray-400 -mt-1 mb-1">Clique num mês para ver como a sobra foi consumida pelos demais grupos.</p>
                      {capacidadeCaixa.porMes.map(mrow => {
                        const aberto = capExpMes.has(mrow.key);
                        return (
                          <div key={mrow.key} className="rounded-lg border border-gray-100 overflow-hidden">
                            <button type="button"
                              onClick={() => setCapExpMes(prev => { const n = new Set(prev); if (n.has(mrow.key)) n.delete(mrow.key); else n.add(mrow.key); return n; })}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50/60 transition-colors">
                              <div className="flex items-center gap-2 mb-1">
                                <ChevronRight className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`} />
                                <span className="font-medium text-gray-700 text-[11.5px] flex-1">{mrow.label}</span>
                                <span className={`font-mono text-[11px] tabular-nums ${mrow.saldo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                  {mrow.saldo >= 0 ? 'sobra ' : 'falta '}{formatCurrency(Math.abs(mrow.saldo))}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 pl-5">
                                <span className="w-14 text-[10px] text-emerald-600 text-right flex-shrink-0">recebido</span>
                                <div className="flex-1 bg-gray-100 rounded-sm h-3 overflow-hidden"><div className="h-full bg-emerald-400 rounded-sm" style={{ width: `${(mrow.rec / capacidadeCaixa.maxBar) * 100}%` }} /></div>
                                <span className="w-[86px] text-[10px] font-mono text-emerald-600 text-right tabular-nums flex-shrink-0">{fmtEixoCaixa(mrow.rec)}</span>
                              </div>
                              <div className="flex items-center gap-2 pl-5 mt-0.5">
                                <span className="w-14 text-[10px] text-red-600 text-right flex-shrink-0">pago</span>
                                <div className="flex-1 bg-gray-100 rounded-sm h-3 overflow-hidden"><div className="h-full bg-red-400 rounded-sm" style={{ width: `${(mrow.pag / capacidadeCaixa.maxBar) * 100}%` }} /></div>
                                <span className="w-[86px] text-[10px] font-mono text-red-600 text-right tabular-nums flex-shrink-0">{fmtEixoCaixa(mrow.pag)}</span>
                              </div>
                            </button>
                            {aberto && (
                              <div className="border-t border-gray-100 px-3 py-2.5 bg-gray-50/50 space-y-1.5">
                                <div className="flex items-center justify-between text-[11.5px]">
                                  <span className="text-gray-500">Sobra de caixa (clientes − fornecedores)</span>
                                  <span className={`font-mono tabular-nums font-medium ${mrow.saldo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{mrow.saldo >= 0 ? '+' : ''}{formatCurrency(mrow.saldo)}</span>
                                </div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 pt-0.5">Consumo pelos demais grupos</p>
                                {mrow.outros.length === 0 ? (
                                  <p className="text-[11px] text-gray-400 pl-2">Nenhum outro grupo com movimento neste mês.</p>
                                ) : (
                                  <div className="space-y-1">
                                    {mrow.outros.map(o => (
                                      <GrupoConsumo key={o.id} node={o} mesKey={mrow.key} nivel={0}
                                        expandidos={capExpGrupo} onToggle={(k) => setCapExpGrupo(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center justify-between text-[12px] pt-1.5 mt-1 border-t border-gray-200">
                                  <span className="font-semibold text-gray-700">Resultado do mês (variação de caixa)</span>
                                  <span className={`font-mono tabular-nums font-semibold ${mrow.resultado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{mrow.resultado >= 0 ? '+' : ''}{formatCurrency(mrow.resultado)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <p className="text-[10.5px] text-gray-400 pt-1 border-t border-gray-100">
                        Grupos usados: <strong>{capacidadeCaixa.recNome || '—'}</strong> (clientes) e
                        {' '}<strong>{capacidadeCaixa.fornNome || '—'}</strong> (fornecedores). Ajuste nos seletores acima se necessário.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        ) : activeTab === 'empresa' && modoRede ? (
          <motion.div key="empresa" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
              <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap no-print">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-800">{mascaraSelecionada?.nome}</h3>
                    <p className="text-[11px] text-gray-400">
                      Por empresa · {mesEmpresa?.label || '—'} · {colunasEmpresa.length} empresas
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Mês:</label>
                  <select value={mesEmpresaKey || ''}
                    onChange={(e) => setMesEmpresaKey(e.target.value)}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">
                    {meses.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                  <div className="text-right ml-2">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Variação de caixa</p>
                    <p className={`text-base font-bold ${totalGeralEmpresa >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(totalGeralEmpresa)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]" style={{ tableLayout: 'fixed', minWidth: 420 + colunasEmpresa.length * 110 + 130 }}>
                  <colgroup>
                    <col style={{ width: 420 }} />
                    {colunasEmpresa.map(c => <col key={`${c.key}-cg`} style={{ width: 110 }} />)}
                    <col style={{ width: 130 }} />
                  </colgroup>
                  <thead className="bg-gray-50/80">
                    <tr className="text-gray-500">
                      <th className="text-left px-4 py-2.5 font-medium uppercase text-[10px] tracking-wider whitespace-nowrap">Linha</th>
                      {colunasEmpresa.map(c => (
                        <th key={`${c.key}-h`} title={c._empresa ? labelEmpresa(c._empresa) : c.label}
                          className="text-right px-3 py-2.5 font-medium uppercase text-[10px] tracking-wider whitespace-nowrap truncate max-w-[110px]">
                          {c.label}
                        </th>
                      ))}
                      <th className="text-right px-3 py-2.5 font-medium uppercase text-[10px] tracking-wider bg-gray-100/60 whitespace-nowrap">Total (R$)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fluxoComCalculosEmpresa.map(node => (
                      <FluxoNodeRows key={node.id} node={node} depth={0}
                        meses={colunasEmpresa}
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
          </motion.div>
        ) : (
          <motion.div key="report" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="space-y-5">
            {modoRede && resultadoPorEmpresa && resultadoPorEmpresa.empresas.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-gray-800">Variação de caixa por empresa</h3>
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
                        <th className="px-4 py-2.5 text-right">Saldo inicial</th>
                        <th className="px-4 py-2.5 text-right">Entradas</th>
                        <th className="px-4 py-2.5 text-right">Saídas</th>
                        <th className="px-4 py-2.5 text-right">Variação</th>
                        <th className="px-4 py-2.5 text-right">Saldo final</th>
                        <th className="px-4 py-2.5 text-right">Participação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {resultadoPorEmpresa.empresas.map((p, i) => (
                        <tr key={p.empresaCodigo} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2 text-[11px] text-gray-400 font-mono">{i + 1}</td>
                          <td className="px-4 py-2 text-[12.5px] font-medium text-gray-800">{p.empresa ? labelEmpresa(p.empresa) : `#${p.empresaCodigo}`}</td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums text-gray-700">
                            {formatCurrency(p.saldoInicial)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums text-emerald-600">+{formatCurrency(p.entradas)}</td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums text-red-600">-{formatCurrency(p.saidas)}</td>
                          <td className={`px-4 py-2 text-right font-mono text-[12.5px] font-semibold tabular-nums ${p.variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {p.variacao > 0 ? '+' : ''}{formatCurrency(p.variacao)}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono text-[12.5px] font-bold tabular-nums ${p.saldoFinal >= 0 ? 'text-gray-900' : 'text-red-700'}`}>
                            {formatCurrency(p.saldoFinal)}
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
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700">
                          {formatCurrency(resultadoPorEmpresa.totalSaldoInicial)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                          +{formatCurrency(resultadoPorEmpresa.empresas.reduce((s, p) => s + p.entradas, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">
                          -{formatCurrency(resultadoPorEmpresa.empresas.reduce((s, p) => s + p.saidas, 0))}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums ${resultadoPorEmpresa.totalConsolidado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {resultadoPorEmpresa.totalConsolidado > 0 ? '+' : ''}{formatCurrency(resultadoPorEmpresa.totalConsolidado)}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums ${resultadoPorEmpresa.totalSaldoFinal >= 0 ? 'text-gray-900' : 'text-red-700'}`}>
                          {formatCurrency(resultadoPorEmpresa.totalSaldoFinal)}
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
                  <h3 className="text-sm font-semibold text-gray-800">Composição do saldo</h3>
                  <span className="text-[11px] text-gray-400">
                    · Saldo inicial (dia anterior ao período) + movimentos = Saldo atual (fim do período)
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/80 border-b border-gray-100">
                      <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-2.5">Conta bancária</th>
                        <th className="px-4 py-2.5 text-right">Saldo inicial</th>
                        <th className="px-4 py-2.5 text-right">Entradas</th>
                        <th className="px-4 py-2.5 text-right">Saídas</th>
                        <th className="px-4 py-2.5 text-right">Variação</th>
                        <th className="px-4 py-2.5 text-right">Saldo atual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {composicaoSaldo.map(c => {
                        // Variação = diferença REAL entre abertura e fechamento (ambos do extrato).
                        // Não usamos entradas−saídas porque movimentos contábeis (desconto/
                        // acréscimo/taxa de cartão) têm valor mas não mexem no saldo do banco.
                        const variacao = c.saldoAtual - c.saldoInicial;
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
                        const tAtu = composicaoSaldo.reduce((s, c) => s + c.saldoAtual, 0);
                        const tVar = tAtu - tIni;
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
                      <span className="text-gray-300" title="Tempo total de geração do relatório">
                        {' · '}gerado em {formatDuracao(tempoGeracao)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Variação de caixa</p>
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
            {!modoCliente && !clienteIdOverride && semClassificacaoNode && semClassificacaoNode.contas.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-200/60 shadow-sm overflow-hidden mt-4 no-print">
                <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/40 flex items-center gap-2 flex-wrap">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-amber-800">Contas, chaves e lançamentos não mapeados</h3>
                  <span className="text-[11px] text-amber-600">
                    · {semClassificacaoNode.contas.length} ite{semClassificacaoNode.contas.length === 1 ? 'm' : 'ns'} · não entra(m) na variação de caixa acima
                  </span>
                  <span className={`ml-auto text-[13px] font-bold ${semClassificacaoNode.totalPeriodo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    Impacto: {formatCurrency(semClassificacaoNode.totalPeriodo)}
                  </span>
                  <button onClick={exportarNaoMapeadosXlsx}
                    title="Exportar contas/lançamentos não mapeados para Excel"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 transition-colors flex-shrink-0">
                    <Download className="h-3.5 w-3.5" /> Exportar XLSX
                  </button>
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
                        // Subtítulo: código do plano (quando o nome é o principal) + tipo(s) de documento.
                        const subPartes = [];
                        if (conta.nomeConta) subPartes.push(`Plano #${conta.codigo}`);
                        if (!conta.semPlano && conta.tiposDoc?.length > 0) subPartes.push(conta.tiposDoc.join(', '));
                        else if (conta.semPlano) subPartes.push('Tipo de documento');
                        const subtitulo = subPartes.join(' · ');
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
                                  <div className="min-w-0 flex-1">
                                    <span className="block text-[11.5px] text-gray-800 truncate" title={conta.descricao}>{conta.descricao}</span>
                                    {subtitulo && (
                                      <span className="block text-[9.5px] text-gray-400 truncate" title={subtitulo}>{subtitulo}</span>
                                    )}
                                  </div>
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
                                  ... e mais {conta.lancamentos.length - 200} lançamento(s) — use o filtro de conta para reduzir
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-amber-50/50 border-t border-amber-200">
                      <tr className="text-[12px] font-semibold text-amber-900">
                        <td className="px-4 py-2">Total não mapeado</td>
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
                  Estes lançamentos existem nas contas (bancárias/caixa) mas não estao no mapeamento da máscara — por isso a soma do fluxo acima pode não bater com a <strong>Composição do saldo</strong>. Adicione os códigos em <strong>Parâmetros &gt; Mapeamento Fluxo de Caixa</strong> para que passem a compor a variação.
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {modalEvol && <ModalDetalheEvol ponto={modalEvol} onClose={() => setModalEvol(null)} />}
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
          Pagamento em lote · {titulos.length} títulos em {grupos.length} {grupos.length === 1 ? 'conta gerencial' : 'contas gerenciais'}
        </p>
        <p className="text-[10px] text-gray-500">
          Soma dos títulos: <strong className="text-gray-700">{formatCurrencyCompact(totalCalculado)}</strong>
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
                  <th className="text-left px-2.5 py-1 font-medium">Título #</th>
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
    { label: 'Título #',        valor: titulo.tituloPagarCodigo ?? titulo.codigo },
    { label: 'Número Doc',      valor: titulo.numeroDocumento || titulo.documento },
    { label: 'Parcela',         valor: titulo.parcela ?? titulo.numeroParcela },
    { label: 'Emissão',         valor: titulo.dataEmissao ? formatDataBR(titulo.dataEmissao) : null },
    { label: 'Vencimento',      valor: (titulo.dataVencimento || titulo.vencimento) ? formatDataBR(titulo.dataVencimento || titulo.vencimento) : null },
    { label: 'Data pagamento',  valor: titulo.dataPagamento ? formatDataBR(titulo.dataPagamento) : null },
    { label: 'Valor título',    valor: titulo.valor != null || titulo.valorTitulo != null ? formatCurrencyCompact(Number(titulo.valor ?? titulo.valorTitulo ?? 0)) : null },
    { label: 'Valor pago',      valor: formatCurrencyCompact(Math.abs(valorPago)) },
    { label: 'Valor saldo',     valor: titulo.valorSaldo != null ? formatCurrencyCompact(Number(titulo.valorSaldo)) : null },
    { label: 'Juros',           valor: Number(titulo.valorJuros) > 0 ? formatCurrencyCompact(Number(titulo.valorJuros)) : null },
    { label: 'Multa',           valor: Number(titulo.valorMulta) > 0 ? formatCurrencyCompact(Number(titulo.valorMulta)) : null },
    { label: 'Desconto',        valor: Number(titulo.valorDesconto) > 0 ? formatCurrencyCompact(Number(titulo.valorDesconto)) : null },
    { label: 'Acréscimo',       valor: Number(titulo.valorAcrescimo) > 0 ? formatCurrencyCompact(Number(titulo.valorAcrescimo)) : null },
    { label: 'Fornecedor',      valor: fornecedor },
    { label: 'Plano gerencial', valor: plano },
    { label: 'Centro custo',    valor: centroCusto },
    { label: 'Portador',        valor: titulo.portadorDescricao || (titulo.portadorCodigo != null && titulo.portadorCodigo !== 0 ? `#${titulo.portadorCodigo}` : null) },
    { label: 'Situação',        valor: titulo.situacao },
    { label: 'Natureza',        valor: titulo.natureza },
    { label: 'Histórico',       valor: titulo.historico || titulo.observacao || titulo.descricao },
  ].filter(c => c.valor != null && c.valor !== '');

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Título a pagar · TITULO_PAGAR</p>
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
              <p className="px-3 py-3 text-xs text-gray-500">Nenhuma conta com movimento no período.</p>
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


// Linha (recursiva) de um grupo no consumo da sobra — drill até o nível 3.
function GrupoConsumo({ node, mesKey, nivel, expandidos, onToggle }) {
  const temFilhos = node.children && node.children.length > 0;
  const chave = `${mesKey}:${node.id}`;
  const aberto = expandidos.has(chave);
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px]" style={{ paddingLeft: 8 + nivel * 16 }}>
        <span className="flex items-center gap-1 min-w-0 pr-2">
          {temFilhos ? (
            <button type="button" onClick={() => onToggle(chave)} className="flex-shrink-0 -ml-0.5">
              <ChevronRight className={`h-3 w-3 text-gray-400 transition-transform ${aberto ? 'rotate-90' : ''}`} />
            </button>
          ) : <span className="w-3 flex-shrink-0" />}
          <span className={`truncate ${nivel === 0 ? 'text-gray-700 font-medium' : 'text-gray-600'}`}>{node.nome}</span>
        </span>
        <span className={`font-mono tabular-nums flex-shrink-0 ${node.valor >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {node.valor >= 0 ? '+' : ''}{formatCurrency(node.valor)}
        </span>
      </div>
      {aberto && temFilhos && (
        <div className="space-y-1 mt-1">
          {node.children.map(ch => (
            <GrupoConsumo key={ch.id} node={ch} mesKey={mesKey} nivel={nivel + 1} expandidos={expandidos} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers da aba "Evolução do Caixa" ───────────────────────────────────
// Formata a data ISO (YYYY-MM-DD) em DD/MM/YYYY.
function formatarDataBr(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = String(ymd).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Rótulo compacto do eixo Y (evita números gigantes): R$ 1,2M / R$ 850k.
function fmtEixoCaixa(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return formatCurrency(v);
}

// Cartão de indicador (mesmo estilo dos KPIs do relatório).
function CardEvol({ titulo, valor, sub, destaque }) {
  const cor = destaque === 'bom' ? 'text-emerald-700' : destaque === 'ruim' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm px-3.5 py-3">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{titulo}</p>
      <p className={`text-[15px] font-bold tabular-nums mt-1 ${cor}`}>{valor}</p>
      {sub != null && <p className="text-[10.5px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// Tooltip customizado do gráfico de evolução.
function TooltipEvol({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg px-3 py-2 text-[12px]">
      <p className="font-semibold text-gray-800 mb-1">{p.inicio ? 'Início do período' : p.label}</p>
      <p className="text-gray-700">Saldo: <span className="font-mono font-semibold tabular-nums">{formatCurrency(p.saldo)}</span></p>
      {!p.inicio && (
        <>
          <p className="text-emerald-600">Entradas: <span className="font-mono tabular-nums">+{formatCurrency(p.entradas)}</span></p>
          <p className="text-red-600">Saídas: <span className="font-mono tabular-nums">-{formatCurrency(p.saidas)}</span></p>
          <p className={p.variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}>
            Variação: <span className="font-mono font-semibold tabular-nums">{p.variacao >= 0 ? '+' : ''}{formatCurrency(p.variacao)}</span>
          </p>
          {p.varAcum != null && (
            <p className="text-blue-600 mt-0.5 pt-0.5 border-t border-gray-100">
              Acumulado: <span className="font-mono font-semibold tabular-nums">{p.varAcum >= 0 ? '+' : ''}{formatCurrency(p.varAcum)}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Colunas amarelas de fim de semana desenhadas ATRÁS do gráfico. Usa os hooks
// do recharts v3 (useXAxisScale/usePlotArea) pra pegar a escala e a área de
// plotagem — o antigo <Customized> não injeta mais essas infos no v3.
function BandasFimDeSemana({ pontos }) {
  const scale = useXAxisScale(0);
  const plot = usePlotArea();
  if (!scale || !plot) return null;
  const cxDe = (lbl) => { const v = scale(lbl); return typeof v === 'number' && !Number.isNaN(v) ? v : null; };
  let step = plot.width;
  if (pontos.length > 1) {
    const a = cxDe(pontos[0].label), b = cxDe(pontos[1].label);
    if (a != null && b != null && Math.abs(b - a) > 0) step = Math.abs(b - a);
  }
  return (
    <Layer className="recharts-fds">
      {pontos.map((p, i) => {
        if (!p.fds) return null;
        const cx = cxDe(p.label);
        if (cx == null) return null;
        return <rect key={i} x={cx - step / 2} y={plot.y} width={step} height={plot.height} fill="#fde047" fillOpacity={0.3} />;
      })}
    </Layer>
  );
}

// Áreas de clique de coluna inteira: um retângulo transparente de altura total
// por dia/bucket. Clicar em qualquer ponto da coluna abre o modal do dia — não
// precisa acertar o marcador. Fica por cima das séries (mas deixa o tooltip
// funcionar, pois os eventos de mouse sobem pro container do gráfico).
function ColunasClicaveis({ pontos, onSelect }) {
  const scale = useXAxisScale(0);
  const plot = usePlotArea();
  if (!scale || !plot) return null;
  const cxDe = (lbl) => { const v = scale(lbl); return typeof v === 'number' && !Number.isNaN(v) ? v : null; };
  let step = plot.width;
  if (pontos.length > 1) {
    const a = cxDe(pontos[0].label), b = cxDe(pontos[1].label);
    if (a != null && b != null && Math.abs(b - a) > 0) step = Math.abs(b - a);
  }
  return (
    <Layer className="recharts-col-click">
      {pontos.map((p, i) => {
        if (p.inicio || !p.movimentos?.length) return null;
        const cx = cxDe(p.label);
        if (cx == null) return null;
        return (
          <rect key={i} x={cx - step / 2} y={plot.y} width={step} height={plot.height}
            fill="transparent" style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onSelect(p); }} />
        );
      })}
    </Layer>
  );
}

// Marcador colorido do gráfico de evolução: verde se o valor do ponto é >= 0,
// vermelho se < 0. `mode` decide qual série lê (saldo x variação).
function DotEvol({ cx, cy, payload, mode, active }) {
  const d = payload?.payload ?? payload;
  if (cx == null || cy == null || !d || d.inicio) return null;
  const val = mode === 'variacao' ? d.variacao : d.saldo;
  const fill = val >= 0 ? '#059669' : '#dc2626';
  return <circle cx={cx} cy={cy} r={active ? 5.5 : 3.4} fill={fill} stroke="#fff" strokeWidth={active ? 1.5 : 1} pointerEvents="none" />;
}

// Modal de detalhamento de um ponto: entradas/saídas separadas por CONTA de fluxo.
function ModalDetalheEvol({ ponto, onClose }) {
  const porConta = {};
  (ponto.movimentos || []).forEach(m => {
    const k = m.contaNome || '—';
    if (!porConta[k]) porConta[k] = { nome: k, entradas: 0, saidas: 0, itens: [] };
    porConta[k].entradas += m.entrada;
    porConta[k].saidas += m.saida;
    porConta[k].itens.push(m);
  });
  const contas = Object.values(porConta)
    .map(c => ({ ...c, itens: c.itens.slice().sort((a, b) => (a.data || '').localeCompare(b.data || '')) }))
    .sort((a, b) => (b.entradas + b.saidas) - (a.entradas + a.saidas));

  // Contas recolhidas por padrão (árvore) — o usuário expande a que quiser.
  const [abertas, setAbertas] = useState(() => new Set());
  const toggleConta = (nome) => setAbertas(prev => {
    const next = new Set(prev);
    if (next.has(nome)) next.delete(nome); else next.add(nome);
    return next;
  });
  const todasAbertas = contas.length > 0 && abertas.size === contas.length;
  const alternarTodas = () => setAbertas(todasAbertas ? new Set() : new Set(contas.map(c => c.nome)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 no-print" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Detalhamento · {ponto.label}</p>
            <p className="text-[11.5px] text-gray-500">
              Entradas <span className="text-emerald-600 font-medium">+{formatCurrency(ponto.entradas)}</span>
              {' · '}Saídas <span className="text-red-600 font-medium">-{formatCurrency(ponto.saidas)}</span>
              {' · '}Variação <span className={`font-medium ${ponto.variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{ponto.variacao >= 0 ? '+' : ''}{formatCurrency(ponto.variacao)}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex-shrink-0"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
          {contas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sem lançamentos neste ponto.</p>
          ) : (
            <>
              {/* Cabeçalho de colunas + expandir/recolher todas. */}
              <div className="flex items-center gap-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <button type="button" onClick={alternarTodas}
                  className="flex-1 text-left normal-case text-[10px] font-medium text-blue-500 hover:text-blue-700 tracking-normal">
                  {todasAbertas ? 'Recolher todas' : 'Expandir todas'}
                </button>
                <span className="w-[104px] text-right flex-shrink-0">Entradas</span>
                <span className="w-[104px] text-right flex-shrink-0">Saídas</span>
              </div>
              {contas.map((c) => {
                const aberta = abertas.has(c.nome);
                return (
                  <div key={c.nome} className="rounded-xl border border-gray-200/70 overflow-hidden">
                    <button type="button" onClick={() => toggleConta(c.nome)}
                      className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100/70 flex items-center gap-2 text-left transition-colors">
                      <ChevronRight className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberta ? 'rotate-90' : ''}`} />
                      <span className="text-[12.5px] font-semibold text-gray-800 truncate flex-1">{c.nome}</span>
                      <span className="text-[10px] text-gray-400 bg-white border border-gray-200 rounded-full px-1.5 py-0.5 flex-shrink-0">{c.itens.length}</span>
                      <span className="w-[104px] text-right flex-shrink-0 text-[11.5px] font-mono tabular-nums text-emerald-600">{c.entradas > 0 ? `+${formatCurrency(c.entradas)}` : ''}</span>
                      <span className="w-[104px] text-right flex-shrink-0 text-[11.5px] font-mono tabular-nums text-red-600">{c.saidas > 0 ? `-${formatCurrency(c.saidas)}` : ''}</span>
                    </button>
                    {aberta && (
                      <div className="divide-y divide-gray-50">
                        {c.itens.map((it, j) => (
                          <div key={j} className="px-3 py-1.5 flex items-center gap-2 text-[12px]">
                            <span className="text-gray-400 font-mono text-[10.5px] w-[42px] flex-shrink-0 pl-5">{formatarDataBr(it.data).slice(0, 5)}</span>
                            <span className="text-gray-600 truncate flex-1">{it.descricao || '—'}</span>
                            <span className="w-[104px] text-right flex-shrink-0 font-mono tabular-nums text-emerald-600">{it.entrada > 0 ? `+${formatCurrency(it.entrada)}` : ''}</span>
                            <span className="w-[104px] text-right flex-shrink-0 font-mono tabular-nums text-red-600">{it.saida > 0 ? `-${formatCurrency(it.saida)}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
        {/* Rodapé fixo */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
          <span className="text-[11px] text-gray-400">
            {contas.length} conta(s) · {ponto.movimentos?.length || 0} lançamento(s)
          </span>
          <button onClick={onClose}
            className="rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[12px] font-medium px-4 py-1.5 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
