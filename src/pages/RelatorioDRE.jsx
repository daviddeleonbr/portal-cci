import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import * as vendasAutosystemMapService from '../services/mapeamentoVendasAutosystemService';
import * as autosystemService from '../services/autosystemService';
import * as qualityApi from '../services/qualityApiService';
import { formatCurrency } from '../utils/format';
import { useAnonimizador } from '../services/anonimizarService';

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

// redeContexto (opcional): { nomeRede, chaveApiId, empresaCodigos: number[] }
// Quando passado, a DRE agrega as empresas da rede usando o mesmo mapeamento
// (mapeamento_empresa_contas e sempre por chave_api_id).
export default function RelatorioDRE({ clienteIdOverride, backHref, redeContexto, seletorEmpresas } = {}) {
  const { labelEmpresa, labelCnpj } = useAnonimizador();
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

  // Periodo: usuario seleciona o mes FINAL; sistema busca N meses para tras (1 ou 3) terminando no mes selecionado
  const today = new Date();
  const [mesFinal, setMesFinal] = useState({ ano: today.getFullYear(), mes: today.getMonth() + 1 });
  const [qtdMeses, setQtdMeses] = useState(3); // 1 ou 3
  const [dreSolicitado, setDreSolicitado] = useState(false);

  const [dadosPorMes, setDadosPorMes] = useState({});       // { 'YYYY-MM': { titulosPagar, titulosReceber, vendaItens, vendas } }
  const [dadosPorMesAnterior, setDadosPorMesAnterior] = useState({});  // mesmo, ano anterior (para AH)
  const [mapeamentoVendas, setMapeamentoVendas] = useState([]);
  // Autosystem: vendas/custo agregados por (categoria, mes)
  // categorias: combustivel | automotivos | conveniencia
  // { atual: { [categoria]: { [mesKey]: { venda, custo } } }, anterior: idem }
  const [vendasAutosystemPorMes, setVendasAutosystemPorMes] = useState({ atual: {}, anterior: {} });
  const [mapVendasAutosystem, setMapVendasAutosystem] = useState([]);
  // Categorização de grupo_produto → categoria, vinda de as_rede_grupo_produto
  // (parametrizada em /cliente/autosystem/configuracoes).
  const [categoriasGruposProduto, setCategoriasGruposProduto] = useState(new Map());
  // Catalogos (cacheados ao entrar)
  const [produtosMap, setProdutosMap] = useState(new Map());
  const [gruposCatMap, setGruposCatMap] = useState(new Map());
  // Catálogo PLANO_CONTA_GERENCIAL da Quality — usado como fallback de
  // descrição quando o título vem sem `planoContaGerencialDescricao`
  const [planoContasMap, setPlanoContasMap] = useState(new Map());
  // Mapa GRID (INT) → HIERARQUIA ("1.02.06") do plano gerencial
  const [planoContasHierarquiaMap, setPlanoContasHierarquiaMap] = useState(new Map());

  const [loading, setLoading] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ atual: 0, total: 0, mensagem: '' });
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [loadingMapeamentos, setLoadingMapeamentos] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dre'); // 'dre' | 'empresa' | 'insights'

  // Tabs flutuantes — versão fixa no topo aparece só quando o original
  // sai da viewport durante o scroll.
  const tabsAnchorRef = useRef(null);
  const [tabsFlutuando, setTabsFlutuando] = useState(false);
  useEffect(() => {
    const el = tabsAnchorRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setTabsFlutuando(!entry.isIntersecting),
      // rootMargin negativo no topo: dispara assim que o bloco passa do
      // cabeçalho. -64px ≈ altura típica do header da aplicação.
      { threshold: 0, rootMargin: '-64px 0px 0px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Mes selecionado da aba "Por Empresa" (so modoRede). Default: ultimo mes do periodo.
  const [mesEmpresaKey, setMesEmpresaKey] = useState(null);

  const [ocultarZeradas, setOcultarZeradas] = useState(true);
  const [showAH, setShowAH] = useState(true);
  const [mostrarTotal, setMostrarTotal] = useState(true);
  const [expandedGrupos, setExpandedGrupos] = useState(new Set());
  const [expandedContas, setExpandedContas] = useState(new Set());
  const [tempoGeracao, setTempoGeracao] = useState(null); // ms

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
  // Em modo rede, pula o fetch de cliente e cria um objeto "virtual" com
  // os campos que o resto do componente espera (nome, chave_api_id, empresa_codigo).
  useEffect(() => {
    (async () => {
      try {
        if (modoRede) {
          // Autosystem vs Webposto: o redeContexto traz asRedeId OU chaveApiId.
          const isAutosystem = !!redeContexto.asRedeId;
          const idChave = isAutosystem ? redeContexto.asRedeId : redeContexto.chaveApiId;
          const virtualCliente = {
            id: `__rede__${idChave}`,
            nome: redeContexto.nomeRede,
            chave_api_id: isAutosystem ? null : redeContexto.chaveApiId,
            as_rede_id:   isAutosystem ? redeContexto.asRedeId : null,
            usa_webposto: !isAutosystem,
            // Usa o primeiro empresaCodigo como "representativo" (legacy);
            // o fetch real usa a lista completa via modoRede.
            empresa_codigo: redeContexto.empresaCodigos?.[0] ?? null,
            _empresaCodigos: redeContexto.empresaCodigos || [],
            _empresas: redeContexto.empresas || [],
            _nomeRede: redeContexto.nomeRede,
          };
          const masks = await dreService.listarMascaras();
          setCliente(virtualCliente);
          setMascaras(masks || []);
          if (masks && masks.length > 0) setMascaraSelecionada(masks[0]);
        } else {
          const [c, masks] = await Promise.all([
            clientesService.buscarCliente(clienteId),
            dreService.listarMascaras(),
          ]);
          setCliente(c);
          setMascaras(masks || []);
          if (masks && masks.length > 0) setMascaraSelecionada(masks[0]);
        }
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, modoRede, redeContexto?.chaveApiId, redeContexto?.asRedeId]);

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
        setMapVendasAutosystem([]);
      } else {
        // Autosystem: config por rede (compartilhada entre empresas).
        // Fallback p/ cliente_id (legado) quando a empresa não tem as_rede_id.
        const cts = cliente.as_rede_id
          ? await manualService.listarContasPorRede(cliente.as_rede_id, mascaraSelecionada.id)
          : await manualService.listarContas(cliente.id, mascaraSelecionada.id);
        const adapted = (cts || []).map(c => ({
          id: c.id,
          grupo_dre_id: c.grupo_dre_id,
          plano_conta_codigo: c.conta_codigo || c.id,
          plano_conta_descricao: c.conta_descricao,
          plano_conta_natureza: c.conta_natureza,
          isManual: true,
        }));
        setMapeamentos(adapted);
        // Mapeamento de vendas/custo por categoria + categorização dos grupos
        if (cliente.as_rede_id) {
          let vmaps = [], gruposProd = [];
          try {
            vmaps = await vendasAutosystemMapService.listarMapeamentos(
              cliente.as_rede_id, mascaraSelecionada.id,
            );
          } catch (e) {
            console.error('[DRE Autosystem] Falha em listarMapeamentos (mapeamento_vendas_autosystem). '
              + 'Verifique se a migration 049 foi aplicada.', e);
          }
          try {
            gruposProd = await autosystemService.listarGruposProdutoRede(cliente.as_rede_id);
          } catch (e) {
            console.error('[DRE Autosystem] Falha em listarGruposProdutoRede', e);
          }
          console.info('[DRE Autosystem] Mapeamentos carregados:', {
            asRedeId: cliente.as_rede_id,
            mascaraId: mascaraSelecionada.id,
            mapVendasCount: vmaps.length,
            mapVendas: vmaps.map(m => ({ categoria: m.categoria, tipo: m.tipo, destino: m.grupo_dre_id || m.grupo_fluxo_id })),
            gruposProdutoCategorizados: gruposProd.length,
          });
          if (vmaps.length === 0) {
            console.warn('[DRE Autosystem] Nenhum mapeamento de vendas/custo configurado. '
              + 'Configure em /admin/parametros/mapeamento → aba Autosystem → "Vendas / Custo por categoria".');
          }
          setMapVendasAutosystem(vmaps || []);
          // A venda traz `grupo_produto_codigo = produto.grupo` (que na verdade
          // é o GRID do grupo na tabela grupo_produto). Indexamos prioritariamente
          // por grid; codigo fica como fallback caso a categorização só tenha codigo.
          const catMap = new Map();
          (gruposProd || []).forEach(g => {
            if (!g.categoria) return;
            if (g.grid != null) catMap.set(Number(g.grid), g.categoria);
            if (g.codigo != null && !catMap.has(Number(g.codigo))) {
              catMap.set(Number(g.codigo), g.categoria);
            }
          });
          setCategoriasGruposProduto(catMap);
        } else {
          setMapVendasAutosystem([]);
          setCategoriasGruposProduto(new Map());
        }
      }
    } catch (err) { setError(err.message); }
    finally { setLoadingMapeamentos(false); }
  }, [cliente, mascaraSelecionada]);

  useEffect(() => { carregarMapeamentos(); }, [carregarMapeamentos]);

  // ─── Load lancamentos para todos os meses (atual e anterior) ─
  const carregarLancamentos = useCallback(async () => {
    if (!cliente || meses.length === 0) return;

    // Cliente Autosystem: busca vendas/custo agregados por (grupo_produto, mês)
    // usando a mesma edge function que /cliente/autosystem/comercial/vendas.
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

        const promises = meses.flatMap(m => {
          const r = rangeMes(m.ano, m.mes);
          const rAnt = rangeMes(m.ano - 1, m.mes);
          return [
            { key: m.key, ...r, isPrev: false, label: m.label },
            { key: m.key, ...rAnt, isPrev: true, label: m.label },
          ];
        });

        // Códigos das contas mapeadas (apenas Autosystem): puxa lançamentos
        // do movto onde a conta aparece em conta_debitar OU conta_creditar.
        const contasCodigosMapeados = Array.from(new Set(
          (mapeamentos || [])
            .map(m => String(m.plano_conta_codigo || '').trim())
            .filter(c => c.length > 0),
        ));

        const total = promises.length;
        let concluidas = 0;
        setLoadingProgress({ atual: 0, total, mensagem: `Buscando dados Autosystem de ${meses.length} mês(es)...` });

        const results = await Promise.all(promises.map(async (p) => {
          // Vendas: `agregado: true` retorna 1 linha por (empresa, produto, vendedor)
          // com sum(valor), sum(quantidade), sum(custo) etc.
          // Lançamentos: filtra movto pelos conta_codigo mapeados.
          let vendas = [], lancs = [];
          try {
            [vendas, lancs] = await Promise.all([
              autosystemService.buscarVendasAutosystem(
                cliente.as_rede_id,
                empresaCodigos,
                { data_de: p.dataInicial, data_ate: p.dataFinal, agregado: true },
              ),
              contasCodigosMapeados.length > 0
                ? autosystemService.buscarLancamentosAutosystem(
                    cliente.as_rede_id,
                    empresaCodigos,
                    { data_de: p.dataInicial, data_ate: p.dataFinal, contas_codigos: contasCodigosMapeados },
                  )
                : Promise.resolve([]),
            ]);
          } catch (err) {
            console.error('[DRE Autosystem] Falha em buscar dados', { periodo: p, err });
          }
          concluidas++;
          const periodoLabel = p.isPrev ? `${p.label} (ano anterior)` : p.label;
          setLoadingProgress({
            atual: concluidas, total,
            mensagem: `${periodoLabel} · ${vendas.length} itens · ${lancs.length} lancamentos`,
          });
          return { ...p, vendas, lancs };
        }));

        // Diagnóstico: avisa se nada veio do Autosystem
        const totalItens = results.reduce((s, r) => s + (r.vendas?.length || 0), 0);
        if (totalItens === 0) {
          console.warn('[DRE Autosystem] Nenhum item de venda retornado para a rede', {
            asRedeId: cliente.as_rede_id, empresaCodigos, meses: meses.map(m => m.key),
          });
        }
        if (categoriasGruposProduto.size === 0) {
          console.warn('[DRE Autosystem] Grupos de produto não categorizados em as_rede_grupo_produto. '
            + 'Configure em /cliente/autosystem/configuracoes — todos os itens serão ignorados.');
        }

        // Agrega por (categoria, mesKey, empresaCodigo) → { venda, custo }
        // Granularidade por empresa é necessária pra aba "Por Empresa".
        // Usa a categorização vinda de as_rede_grupo_produto. Itens cuja
        // categoria não está classificada são ignorados.
        const atual = {};
        const anterior = {};
        let ignoradosSemCategoria = 0;
        let aproveitados = 0;
        const gruposIgnoradosSet = new Set();
        results.forEach(r => {
          const target = r.isPrev ? anterior : atual;
          (r.vendas || []).forEach(v => {
            const gp = Number(v.grupo_produto_codigo ?? 0);
            const categoria = categoriasGruposProduto.get(gp);
            if (!categoria) {
              ignoradosSemCategoria++;
              gruposIgnoradosSet.add(gp);
              return;
            }
            aproveitados++;
            const ec = String(v.empresa ?? '');
            const valor = Number(v.valor || 0);
            const custo = Number(v.valor_custo || 0);
            if (!target[categoria]) target[categoria] = {};
            if (!target[categoria][r.key]) target[categoria][r.key] = {};
            if (!target[categoria][r.key][ec]) target[categoria][r.key][ec] = { venda: 0, custo: 0 };
            target[categoria][r.key][ec].venda += valor;
            target[categoria][r.key][ec].custo += custo;
          });
        });
        if (ignoradosSemCategoria > 0) {
          console.warn('[DRE Autosystem] Itens ignorados por grupo de produto sem categoria:', {
            ignorados: ignoradosSemCategoria,
            aproveitados,
            gruposSemCategoria: Array.from(gruposIgnoradosSet),
          });
        }

        // Converte lançamentos Autosystem para o formato titulosReceber/Pagar
        // usado pela indexação Webposto. Regra contábil:
        //   • lado = 'credito' → soma + (vai pra titulosReceber)
        //   • lado = 'debito'  → soma − (vai pra titulosPagar)
        //   • lado = 'ambos'   → insere em ambos (raríssimo; conta consigo mesma)
        // O `planoContaGerencialCodigo` é o conta_codigo daquele lado.
        function lancToTitulo(l, codigo, lado) {
          return {
            codigo: l.lancamento_id != null ? `as-${l.lancamento_id}-${lado}` : undefined,
            planoContaGerencialCodigo: codigo,
            empresaCodigo: l.empresa,
            // movto.data como única fonte de data do lançamento
            dataMovimento: l.data,
            dataPagamento: l.data,
            vencimento: l.data,
            valor: Number(l.valor || 0),
            valorPago: Number(l.valor || 0),
            // descricao base vazia → composição mostra só doc + fornecedor + obs
            descricao: '',
            numeroTitulo: l.documento || '',
            nomeFornecedor: l.pessoa_nome || '',
            nomeCliente: l.pessoa_nome || '',
            observacao: (l.obs || '').trim(),
            situacao: 'pago',
          };
        }
        const dadosAtualPorMes = {};
        const dadosAnteriorPorMes = {};
        let totalLancsCarregados = 0;
        let lancsSemMatch = 0;
        results.forEach(r => {
          const bucket = r.isPrev ? dadosAnteriorPorMes : dadosAtualPorMes;
          if (!bucket[r.key]) bucket[r.key] = { titulosReceber: [], titulosPagar: [], vendaItens: [], vendas: [] };
          (r.lancs || []).forEach(l => {
            const cred = String(l.credito_codigo ?? '');
            const deb  = String(l.debito_codigo ?? '');
            let matched = false;
            if ((l.lado === 'credito' || l.lado === 'ambos') && cred) {
              bucket[r.key].titulosReceber.push(lancToTitulo(l, cred, 'credito'));
              matched = true;
            }
            if ((l.lado === 'debito' || l.lado === 'ambos') && deb) {
              bucket[r.key].titulosPagar.push(lancToTitulo(l, deb, 'debito'));
              matched = true;
            }
            if (matched) totalLancsCarregados++;
            else lancsSemMatch++;
          });
        });
        if (lancsSemMatch > 0) {
          console.warn('[DRE Autosystem] Lancamentos sem lado/codigo:', { semMatch: lancsSemMatch });
        }
        console.info('[DRE Autosystem] Lancamentos carregados:', {
          totalLancsCarregados,
          contasMapeadasUsadas: contasCodigosMapeados.length,
        });

        setLoadingProgress({ atual: total, total, mensagem: 'Montando o relatório...' });
        await new Promise(rsv => setTimeout(rsv, 200));
        setDadosPorMes(dadosAtualPorMes);
        setDadosPorMesAnterior(dadosAnteriorPorMes);
        setVendasAutosystemPorMes({ atual, anterior });
        setDadosCarregados(true);
        setTempoGeracao(performance.now() - _t0);
      } catch (err) {
        setError('Erro ao buscar vendas Autosystem: ' + err.message);
      } finally {
        setLoadingDados(false);
      }
      return;
    }

    if (!cliente.usa_webposto || !cliente.chave_api_id) {
      setDadosPorMes({});
      setDadosPorMesAnterior({});
      setVendasAutosystemPorMes({ atual: {}, anterior: {} });
      setDadosCarregados(true);
      return;
    }

    const _t0 = performance.now();
    try {
      setLoadingDados(true);
      setDadosCarregados(false);
      setError(null);
      setTempoGeracao(null);

      setLoadingProgress({ atual: 0, total: 1, mensagem: 'Conectando com o sistema Webposto...' });
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API não encontrada');

      // 1. Carregar catalogos (PRODUTO + GRUPO + PLANO_CONTA_GERENCIAL) - apenas se ainda nao carregados
      if (produtosMap.size === 0) {
        setLoadingProgress({ atual: 0, total: 1, mensagem: 'Carregando catalogo de produtos...' });
        const [prods, grps, planos] = await Promise.all([
          qualityApi.buscarProdutos(chave.chave).catch(() => []),
          qualityApi.buscarGrupos(chave.chave).catch(() => []),
          qualityApi.buscarPlanoContasGerencial(chave.chave).catch(() => []),
        ]);
        const pMap = new Map();
        (prods || []).forEach(p => pMap.set(p.produtoCodigo || p.codigo, p));
        const gMap = new Map();
        (grps || []).forEach(g => gMap.set(g.grupoCodigo || g.codigo, g));
        // Plano de contas:
        //  - planoContasMap: GRID → DESCRIÇÃO (fallback de "não mapeadas")
        //  - planoContasHierarquiaMap: GRID → HIERARQUIA ("1.02.06") pra
        //    permitir match por hierarquia em vez do INT.
        const pcMap = new Map();
        const pcHierMap = new Map();
        (planos || []).forEach(p => {
          const cod = p.planoContaCodigo ?? p.planoContaGerencialCodigo ?? p.codigo;
          const desc = p.descricao || p.nome || '';
          const hier = p.hierarquia || '';
          if (cod != null) {
            if (desc) pcMap.set(String(cod), desc.trim());
            if (hier) pcHierMap.set(String(cod), String(hier).trim());
          }
        });
        setProdutosMap(pMap);
        setGruposCatMap(gMap);
        setPlanoContasMap(pcMap);
        setPlanoContasHierarquiaMap(pcHierMap);
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
      setLoadingProgress({ atual: 0, total, mensagem: `Buscando lançamentos de ${meses.length} mês(es)...` });

      const results = await Promise.all(
        promises.map(async (p) => {
          // Em modo rede iteramos os empresaCodigos da rede e concatenamos os resultados.
          const empresaCodigos = modoRede
            ? (cliente?._empresaCodigos || [])
            : [cliente.empresa_codigo];
          const allPagar = [], allReceber = [], allMovimentos = [], allRemessas = [], allVendaItens = [], allVendas = [];
          for (const ec of empresaCodigos) {
            const filtros = { dataInicial: p.dataInicial, dataFinal: p.dataFinal, empresaCodigo: ec };
            const [pagar, receber, movimentos, remessas, vendaItens, vendas] = await Promise.all([
              qualityApi.buscarTitulosPagar(chave.chave, filtros),
              qualityApi.buscarTitulosReceber(chave.chave, { ...filtros, convertido: null }),
              qualityApi.buscarMovimentoConta(chave.chave, filtros).catch(() => []),
              qualityApi.buscarCartaoRemessa(chave.chave, filtros).catch(() => []),
              qualityApi.buscarVendaItens(chave.chave, filtros).catch(() => []),
              qualityApi.buscarVendas(chave.chave, filtros).catch(() => []),
            ]);
            const annot = modoRede ? (arr) => (arr || []).map(x => ({ ...x, empresaCodigo: ec })) : (arr) => (arr || []);
            allPagar.push(...annot(pagar));
            allReceber.push(...annot(receber));
            allMovimentos.push(...annot(movimentos));
            allRemessas.push(...annot(remessas));
            allVendaItens.push(...annot(vendaItens));
            allVendas.push(...annot(vendas));
          }
          concluidas++;
          const periodoLabel = p.isPrev ? `${p.label} (ano anterior)` : p.label;
          setLoadingProgress({
            atual: concluidas,
            total,
            mensagem: `${periodoLabel} \u00b7 ${allPagar.length + allReceber.length} lancs \u00b7 ${allVendaItens.length} itens \u00b7 ${allVendas.length} vendas${modoRede ? ` · ${empresaCodigos.length} empresas` : ''}`,
          });
          return { ...p, pagar: allPagar, receber: allReceber, movimentos: allMovimentos, remessasCartao: allRemessas, vendaItens: allVendaItens, vendas: allVendas };
        })
      );

      const atual = {};
      const anterior = {};
      results.forEach(r => {
        const target = r.isPrev ? anterior : atual;
        target[r.key] = { titulosPagar: r.pagar, titulosReceber: r.receber, movimentos: r.movimentos, remessasCartao: r.remessasCartao, vendaItens: r.vendaItens, vendas: r.vendas };
      });
      setLoadingProgress({ atual: total, total, mensagem: 'Montando o relatório...' });
      // Pequeno delay para o usuario ver a mensagem final
      await new Promise(r => setTimeout(r, 250));
      setDadosPorMes(atual);
      setDadosPorMesAnterior(anterior);
      setDadosCarregados(true);
      setTempoGeracao(performance.now() - _t0);
    } catch (err) {
      setError('Erro ao buscar lançamentos: ' + err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [cliente, meses, categoriasGruposProduto, mapeamentos]);

  // Ao mudar periodo ou mascara apos ja ter gerado, invalida o relatorio (usuario deve clicar "Montar DRE" novamente)
  useEffect(() => {
    setDreSolicitado(false);
    setDadosCarregados(false);
    setReportReady(false);
  }, [mesFinal, qtdMeses, mascaraSelecionada]);

  // Sincroniza mesEmpresaKey (aba "Por Empresa") com o periodo carregado:
  // sempre que o array de meses mudar, se o valor atual nao pertence mais
  // a ele, reseta pro ultimo mes (mais recente).
  useEffect(() => {
    if (meses.length === 0) { setMesEmpresaKey(null); return; }
    setMesEmpresaKey(prev => {
      if (prev && meses.some(m => m.key === prev)) return prev;
      return meses[meses.length - 1].key;
    });
  }, [meses]);

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
  }, [dadosCarregados, loadingGrupos, loadingMapeamentos, loadingDados, dadosPorMes, dadosPorMesAnterior, mapeamentos, mapeamentoVendas, vendasAutosystemPorMes, mapVendasAutosystem, grupos]);

  // GRID destino pras TAXAS de CARTAO_REMESSA. Procura no mapeamento da
  // DRE uma conta cuja descrição contém "TAXA" + "CART"/"CARD". Como pode
  // haver várias (ex: "TAXAS DE CARTAO" + "TAXA ANTECIPAÇÃO DE CARTÕES"),
  // prefere a descrição MAIS CURTA (genérica) — descrições longas têm
  // qualificadores como "antecipação", "shell", "pagpix", etc.
  const gridTaxaCartao = useMemo(() => {
    const norm = s => String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const candidatos = mapeamentos.filter(m => {
      const d = norm(m.plano_conta_descricao || '');
      return d.includes('taxa') && (d.includes('cart') || d.includes('card'));
    });
    if (candidatos.length === 0) return null;
    // Prefere descrição com menos palavras (mais genérica)
    candidatos.sort((a, b) => {
      const wa = norm(a.plano_conta_descricao || '').trim().split(/\s+/).length;
      const wb = norm(b.plano_conta_descricao || '').trim().split(/\s+/).length;
      return wa - wb;
    });
    return String(candidatos[0].plano_conta_codigo);
  }, [mapeamentos]);

  // ─── Montar lançamentos de UM mês (fonte única usada pelo DRE sintético
  // e pela aba "Por Empresa") ──────────────────────────────────────
  // Inclui: títulos receber/pagar + movimentos extras + remessas cartão.
  // Cada item já vem com _sinal (+1 / -1) e _tipo aplicados.
  function montarLancamentosDoMes(dados, gridTaxaCartao) {
    // MOVIMENTO_CONTA: indexa TODOS os movimentos (mapeados ou não) pra
    // que GRIDs não mapeados apareçam na seção "Contas não mapeadas".
    // Filtros:
    //   - `tipoDocumentoOrigem` começando com "TITULO_" é PAGAMENTO de
    //     título — já foi contado em TITULO_PAGAR/RECEBER. Ignora pra
    //     não duplicar (regime competência usa título, não pagamento).
    //   - Sinal vem de m.tipo: "Crédito" = +, "Débito" = -.
    const movsExtras = (dados.movimentos || []).filter(m => {
      const cod = String(m.planoContaGerencialCodigo || '');
      if (!cod || cod === '0') return false;
      const origem = String(m.tipoDocumentoOrigem || '').toUpperCase();
      if (origem.startsWith('TITULO_')) return false;
      return true;
    }).map(m => {
      const isCredito = String(m.tipo || '').toLowerCase().startsWith('cr');
      return {
        ...m,
        _sinal: isCredito ? 1 : -1,
        _tipo: 'movimento',
        valor: Math.abs(Number(m.valor || 0)),
        dataMovimento: m.dataMovimento || m.data,
        descricao: m.descricao || m.historico || '',
        nomeFornecedor: m.nomePessoa || '',
        nomeCliente: m.nomePessoa || '',
        numeroTitulo: m.documento || '',
      };
    });

    // CARTAO_REMESSA: cada remessa tem `taxasDespesas` (taxa cobrada
    // pela adquirente) + `acrescimos` (encargos adicionais). Ambos são
    // despesas — vão pra conta mapeada como "TAXAS DE CARTAO".
    const remessasTaxa = gridTaxaCartao
      ? (dados.remessasCartao || [])
          .map(r => {
            const taxas = Math.abs(Number(r.taxasDespesas || 0));
            const acrescimos = Math.abs(Number(r.acrescimos || 0));
            const total = taxas + acrescimos;
            if (total <= 0) return null;
            return {
              planoContaGerencialCodigo: gridTaxaCartao,
              valor: total,
              _sinal: -1,
              _tipo: 'remessa-cartao',
              codigo: `cr-${r.cartaoRemessaCodigo ?? r.codigo}`,
              dataMovimento: r.dataPagamento || r.dataRecebimento || r.dataRemessa,
              descricao: `Taxa cartão${r.administradora ? ` · ${r.administradora}` : ''}${acrescimos > 0 ? ` (taxa ${taxas.toFixed(2)} + acréscimo ${acrescimos.toFixed(2)})` : ''}`,
              numeroTitulo: r.cartaoRemessaReferenciaCodigo || '',
              nomeFornecedor: r.administradora || '',
              empresaCodigo: r.empresaCodigo,
              situacao: 'pago',
            };
          })
          .filter(Boolean)
      : [];

    return [
      ...(dados.titulosReceber || []).map(t => ({ ...t, _sinal: 1, _tipo: 'receber' })),
      ...(dados.titulosPagar   || []).map(t => ({ ...t, _sinal: -1, _tipo: 'pagar' })),
      ...movsExtras,
      ...remessasTaxa,
    ];
  }

  // ─── Indexar lancamentos por conta + mes (totais + itens) ──
  function indexarPorConta(dadosMap) {
    const totais = {};       // { codigo: { mesKey: total } }
    const lancamentos = {};  // { codigo: [lancamento, ...] } (todos do periodo)
    const descricoes = {};   // { codigo: "Descrição do plano" } — primeira encontrada
    Object.entries(dadosMap).forEach(([mesKey, dados]) => {
      const todos = montarLancamentosDoMes(dados, gridTaxaCartao);
      todos.forEach(t => {
        const codigo = String(t.planoContaGerencialCodigo || '');
        if (!codigo) return;
        if (!descricoes[codigo] && t.planoContaGerencialDescricao) {
          descricoes[codigo] = String(t.planoContaGerencialDescricao).trim();
        }
        const valor = Number(t.valor || 0) * t._sinal;

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
        const observ = (t.observacao || t.obs || '').trim();
        if (observ) partes.push(observ);
        const descricaoComposta = partes.join(' \u00b7 ');

        if (!lancamentos[codigo]) lancamentos[codigo] = [];
        lancamentos[codigo].push({
          id: t.codigo || `${t._tipo}-${t.tituloPagarCodigo || t.tituloReceberCodigo}`,
          mesKey,
          data: t.dataMovimento || t.dataPagamento || t.vencimento || '',
          descricao: descricaoComposta || '\u2014',
          valor: Math.abs(Number(t.valor || 0)),
          sinal: t._sinal,
          situacao: t.situacao,
          tipo: t._tipo,
        });
      });
    });
    return { totais, lancamentos, descricoes };
  }

  const idxAtualFull = useMemo(() => indexarPorConta(dadosPorMes), [dadosPorMes, gridTaxaCartao]);

  const idxAnteriorFull = useMemo(() => indexarPorConta(dadosPorMesAnterior), [dadosPorMesAnterior, gridTaxaCartao]);
  const idxAtual = idxAtualFull.totais;
  const idxAnterior = idxAnteriorFull.totais;
  const descricoesAtual = idxAtualFull.descricoes || {};
  const descricoesAnterior = idxAnteriorFull.descricoes || {};
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

  // ─── Indexar VENDAS/CUSTO Autosystem por grupo DRE ──────────
  // Para cada mapeamento (categoria, tipo) → soma vendas[categoria][mes].(venda|custo)
  // no grupo_dre_id, com sinal: venda = +, custo = − (CMV).
  function indexarVendasAutosystemPorGrupoDRE(porCategoria) {
    const out = {}; // { grupo_dre_id: { key: { valoresPorMes, label } } }
    if (!Array.isArray(mapVendasAutosystem) || mapVendasAutosystem.length === 0) return out;
    const LABELS = {
      combustivel: 'Combustível',
      automotivos: 'Automotivos',
      conveniencia: 'Conveniência',
    };
    mapVendasAutosystem.forEach(m => {
      const gpId = m.grupo_dre_id || m.grupo_fluxo_id;
      if (!gpId) return;
      const catLabel = LABELS[m.categoria] || m.categoria;
      const sinal = m.tipo === 'custo' ? -1 : 1;
      const label = `${catLabel} (${m.tipo === 'custo' ? 'custo' : 'vendas'})`;
      const key = `as-${m.categoria}-${m.tipo}`;
      meses.forEach(mes => {
        // Soma todas empresas do mês (granularidade por-empresa preservada
        // só pra aba "Por Empresa"; no DRE principal somamos tudo).
        const porEmp = porCategoria?.[m.categoria]?.[mes.key] || {};
        let val = 0;
        Object.values(porEmp).forEach(x => {
          val += m.tipo === 'custo' ? Number(x?.custo || 0) : Number(x?.venda || 0);
        });
        if (!out[gpId]) out[gpId] = {};
        if (!out[gpId][key]) out[gpId][key] = { valoresPorMes: {}, label };
        out[gpId][key].valoresPorMes[mes.key] =
          (out[gpId][key].valoresPorMes[mes.key] || 0) + (val * sinal);
      });
    });
    return out;
  }
  const vendasASAtualPorGrupo = useMemo(
    () => indexarVendasAutosystemPorGrupoDRE(vendasAutosystemPorMes.atual),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendasAutosystemPorMes.atual, mapVendasAutosystem, meses]
  );
  const vendasASAnteriorPorGrupo = useMemo(
    () => indexarVendasAutosystemPorGrupoDRE(vendasAutosystemPorMes.anterior),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendasAutosystemPorMes.anterior, mapVendasAutosystem, meses]
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

      // Contas virtuais Vendas/Custo do AUTOSYSTEM (por grupo de produto)
      const vendasAS = vendasASAtualPorGrupo[grupo.id];
      const vendasASAnt = vendasASAnteriorPorGrupo[grupo.id];
      if (vendasAS) {
        Object.entries(vendasAS).forEach(([key, dados]) => {
          const valoresPorMes = {};
          const valoresAnt = {};
          let totalPeriodo = 0;
          let totalAnt = 0;
          meses.forEach(mes => {
            const v = dados.valoresPorMes[mes.key] || 0;
            const va = vendasASAnt?.[key]?.valoresPorMes[mes.key] || 0;
            valoresPorMes[mes.key] = v;
            valoresAnt[mes.key] = va;
            totalPeriodo += v;
            totalAnt += va;
          });
          contas.push({
            id: `${key}-${grupo.id}`,
            codigo: '',
            descricao: dados.label,
            isVendas: true,
            valoresPorMes,
            valoresAnt,
            totalPeriodo,
            totalAnt,
            lancamentos: [],
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
  }, [grupos, mapeamentos, idxAtual, idxAnterior, lancamentosAtual, vendasAtualPorGrupo, vendasAnteriorPorGrupo, vendasASAtualPorGrupo, vendasASAnteriorPorGrupo, meses]);

  // ─── Contas NÃO MAPEADAS (admin only) ──────────────────────────
  // Lista títulos com `planoContaGerencialCodigo` que NÃO estão no
  // mapeamento ↔ grupo DRE. Fica numa seção SEPARADA da DRE — não
  // distorce os cálculos e não é exibida pra cliente (esta página é
  // exclusiva do admin).
  const contasNaoMapeadas = useMemo(() => {
    const codigosMapeados = new Set(mapeamentos.map(m => String(m.plano_conta_codigo)));
    const codigosVistos = new Set([
      ...Object.keys(idxAtual || {}),
      ...Object.keys(idxAnterior || {}),
    ]);
    const codigosNaoMapeados = [...codigosVistos].filter(c => !codigosMapeados.has(c));
    if (codigosNaoMapeados.length === 0) return [];

    return codigosNaoMapeados.map(codKey => {
      const valoresPorMes = {};
      let totalPeriodo = 0;
      meses.forEach(mes => {
        const v = idxAtual[codKey]?.[mes.key] || 0;
        valoresPorMes[mes.key] = v;
        totalPeriodo += v;
      });
      const lancs = (lancamentosAtual[codKey] || [])
        .slice()
        .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
      const descricao = descricoesAtual[codKey]
        || descricoesAnterior[codKey]
        || planoContasMap.get(codKey)
        || '(sem descrição)';
      return {
        codigo: codKey,
        descricao,
        valoresPorMes,
        totalPeriodo,
        qtdLancamentos: lancs.length,
        lancamentos: lancs,
      };
    }).sort((a, b) => Math.abs(b.totalPeriodo) - Math.abs(a.totalPeriodo));
  }, [mapeamentos, idxAtual, idxAnterior, lancamentosAtual, descricoesAtual, descricoesAnterior, meses, planoContasMap]);

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

  // Pega o ÚLTIMO node de tipo='resultado' = "Resultado Gerencial Líquido"
  // (o primeiro normalmente é "Resultado antes do IRPJ/CSLL").
  const totalGeral = useMemo(() => {
    const resultados = dreComCalculos.filter(n => n.tipo === 'resultado');
    return resultados[resultados.length - 1]?.totalPeriodo
      ?? dreTree.reduce((s, n) => s + n.totalPeriodo, 0);
  }, [dreComCalculos, dreTree]);

  // ─── Resultado por empresa (apenas em modo rede) ─────────
  // Calcula o resultado (receita liquida − custos, conforme mapeamento) por
  // empresa da rede e computa a participacao de cada uma no total.
  const resultadoPorEmpresa = useMemo(() => {
    if (!modoRede || !cliente?._empresas || cliente._empresas.length === 0) return null;

    const codigosMapeados = new Set(mapeamentos.map(m => String(m.plano_conta_codigo)));
    const tiposVendaMap = new Map();
    mapeamentoVendas.forEach(m => {
      if (m.grupo_dre_id) tiposVendaMap.set(m.tipo, m);
    });

    const porEmpresa = {};
    cliente._empresas.forEach(emp => {
      const ec = Number(emp.empresa_codigo);
      if (!Number.isFinite(ec)) return;
      porEmpresa[ec] = { empresa: emp, empresaCodigo: ec, total: 0 };
    });

    // Autosystem: soma vendas/custo dos mapeamentos (todos os meses do período)
    // por empresa. tipo='venda' soma +, tipo='custo' soma −.
    if (Array.isArray(mapVendasAutosystem) && mapVendasAutosystem.length > 0) {
      mapVendasAutosystem.forEach(m => {
        if (!m.grupo_dre_id && !m.grupo_fluxo_id) return;
        const sinal = m.tipo === 'custo' ? -1 : 1;
        meses.forEach(mes => {
          const porEmp = vendasAutosystemPorMes.atual?.[m.categoria]?.[mes.key] || {};
          Object.entries(porEmp).forEach(([ec, x]) => {
            const ecNum = Number(ec);
            if (!porEmpresa[ecNum]) return;
            const val = (m.tipo === 'custo' ? Number(x?.custo || 0) : Number(x?.venda || 0)) * sinal;
            porEmpresa[ecNum].total += val;
          });
        });
      });
    }

    // "Pseudo-empresa" pra lançamentos sem empresaCodigo válido. Só
    // entra no resultado final se algum lançamento órfão aparecer.
    const REDE_KEY = '_rede';

    Object.values(dadosPorMes).forEach(d => {
      // Lançamentos contábeis: títulos + movimentos extras + remessas cartão
      // (mesma fonte do DRE sintético — `_sinal` já aplicado).
      const lancs = montarLancamentosDoMes(d, gridTaxaCartao);
      lancs.forEach(t => {
        const cod = String(t.planoContaGerencialCodigo || '');
        if (!cod || !codigosMapeados.has(cod)) return;
        const ecRaw = Number(t.empresaCodigo);
        const bucket = Number.isFinite(ecRaw) && porEmpresa[ecRaw]
          ? porEmpresa[ecRaw]
          : (porEmpresa[REDE_KEY] ??= {
              empresa: { fantasia: 'Rede / Não alocado', razao_social: 'Rede / Não alocado' },
              empresaCodigo: REDE_KEY, _isRede: true, total: 0,
            });
        bucket.total += Number(t.valor || 0) * (t._sinal || 1);
      });

      // Vendas: agrega por empresa usando vendaItens + vendas
      if (tiposVendaMap.size > 0) {
        const itensPorEmp = new Map();
        (d.vendaItens || []).forEach(item => {
          const ec = Number(item.empresaCodigo);
          if (!porEmpresa[ec]) return;
          if (!itensPorEmp.has(ec)) itensPorEmp.set(ec, []);
          itensPorEmp.get(ec).push(item);
        });
        const vendasPorEmp = new Map();
        (d.vendas || []).forEach(v => {
          const ec = Number(v.empresaCodigo);
          if (!porEmpresa[ec]) return;
          if (!vendasPorEmp.has(ec)) vendasPorEmp.set(ec, new Map());
          vendasPorEmp.get(ec).set(v.vendaCodigo || v.codigo, v);
        });
        itensPorEmp.forEach((itens, ec) => {
          const vMap = vendasPorEmp.get(ec) || new Map();
          const totais = vendasMapService.agregarVendasItens(itens, vMap, produtosMap, gruposCatMap);
          Object.entries(totais).forEach(([tipo, valor]) => {
            if (!tiposVendaMap.has(tipo)) return;
            const tipoCfg = TIPOS_VENDA.find(t => t.id === tipo);
            if (!tipoCfg) return;
            porEmpresa[ec].total += (valor || 0) * tipoCfg.sinal;
          });
        });
      }
    });

    const arr = Object.values(porEmpresa).sort((a, b) => b.total - a.total);
    const somaAbsoluta = arr.reduce((s, p) => s + Math.abs(p.total), 0);
    const totalConsolidado = arr.reduce((s, p) => s + p.total, 0);
    return {
      empresas: arr.map(p => ({
        ...p,
        participacao: somaAbsoluta > 0 ? (Math.abs(p.total) / somaAbsoluta) * 100 : 0,
      })),
      totalConsolidado,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoRede, cliente, dadosPorMes, mapeamentos, mapeamentoVendas, produtosMap, gruposCatMap, mapVendasAutosystem, vendasAutosystemPorMes.atual, meses, gridTaxaCartao]);

  // ═══════════════════════════════════════════════════════════
  // ABA "POR EMPRESA": mesmo relatorio da mascara DRE, mas com
  // empresas da rede como COLUNAS (em vez de meses). Mes unico,
  // selecionado pelo usuario via mesEmpresaKey.
  // ═══════════════════════════════════════════════════════════

  // "Colunas" virtuais = uma por empresa da rede. Mesmo shape que meses
  // ({key, label}) para que o renderer DreNodeRows funcione sem mudancas.
  const colunasEmpresaBase = useMemo(() => {
    if (!modoRede) return [];
    return (cliente?._empresas || [])
      .filter(emp => Number.isFinite(Number(emp.empresa_codigo)))
      .map(emp => {
        const ec = Number(emp.empresa_codigo);
        const nome = emp.fantasia || emp.razao_social || emp.nome || `#${ec}`;
        return {
          key: String(ec),
          label: nome.length > 18 ? nome.substring(0, 18) + '…' : nome,
          _empresaCodigo: ec,
          _empresa: emp,
        };
      });
  }, [modoRede, cliente]);

  // Mes de referencia da aba Por Empresa (objeto completo)
  const mesEmpresa = useMemo(
    () => meses.find(m => m.key === mesEmpresaKey) || null,
    [meses, mesEmpresaKey]
  );

  // Indexacao de titulos do mes selecionado por (plano, empresa)
  // Retorna mesma shape de idxAtualFull mas usando empresaCodigo como "mesKey".
  const idxEmpresaFull = useMemo(() => {
    const totais = {};
    const lancamentos = {};
    if (!mesEmpresa) return { totais, lancamentos };
    const dados = dadosPorMes[mesEmpresa.key];
    if (!dados) return { totais, lancamentos };
    // Mesma fonte do DRE sintético: títulos + movimentos extras + remessas cartão.
    const todos = montarLancamentosDoMes(dados, gridTaxaCartao);
    // Bandeira: ao menos 1 lançamento órfão (sem empresaCodigo). Usado
    // pra decidir se mostramos a coluna virtual "Rede" no header.
    let temOrfaos = false;
    todos.forEach(t => {
      const codigo = String(t.planoContaGerencialCodigo || '');
      if (!codigo) return;
      // Lançamento SEM empresaCodigo vai pra coluna virtual '_rede'
      // (lançamentos centralizados — matriz/holding). Sem essa rede,
      // o total da quebra por empresa não bate com o DRE sintético.
      const empKeyRaw = String(t.empresaCodigo ?? '');
      const empKey = empKeyRaw || '_rede';
      if (!empKeyRaw) temOrfaos = true;
      const valor = Number(t.valor || 0) * t._sinal;
      if (!totais[codigo]) totais[codigo] = {};
      totais[codigo][empKey] = (totais[codigo][empKey] || 0) + valor;

      const partes = [];
      const descBase = (t.descricao || '').trim();
      if (descBase) partes.push(descBase);
      const numTitulo = (t.numeroTitulo || '').trim();
      if (numTitulo) partes.push(`Nº ${numTitulo}`);
      const contraparte = (t.nomeFornecedor || t.nomeCliente || '').trim();
      if (contraparte) partes.push(contraparte);
      const descricaoComposta = partes.join(' · ');

      if (!lancamentos[codigo]) lancamentos[codigo] = [];
      lancamentos[codigo].push({
        id: t.codigo || `${t._tipo}-${t.tituloPagarCodigo || t.tituloReceberCodigo}`,
        mesKey: empKey, // DreNodeRows usa l.mesKey pra decidir coluna; aqui empresa
        data: t.dataMovimento || t.dataPagamento || t.vencimento || '',
        descricao: descricaoComposta || '—',
        valor: Math.abs(Number(t.valor || 0)),
        sinal: t._sinal,
        situacao: t.situacao,
        tipo: t._tipo,
      });
    });
    return { totais, lancamentos, temOrfaos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesEmpresa, dadosPorMes, gridTaxaCartao]);

  // Adiciona coluna virtual "Rede" no fim quando há lançamentos órfãos
  // (sem empresaCodigo) no mês selecionado. Sem isso, o total não bate
  // com o DRE sintético.
  const colunasEmpresa = useMemo(() => {
    if (!colunasEmpresaBase.length) return colunasEmpresaBase;
    if (!idxEmpresaFull.temOrfaos) return colunasEmpresaBase;
    return [
      ...colunasEmpresaBase,
      { key: '_rede', label: 'Rede', _isRede: true },
    ];
  }, [colunasEmpresaBase, idxEmpresaFull.temOrfaos]);

  // Vendas/custo Autosystem do mes selecionado, por (grupo_dre, key, empresaCodigo)
  // — espelha vendasASAtualPorGrupo mas com empresa como "coluna".
  const vendasASEmpresaPorGrupo = useMemo(() => {
    const out = {};
    if (!mesEmpresa || !Array.isArray(mapVendasAutosystem) || mapVendasAutosystem.length === 0) return out;
    const LABELS = {
      combustivel: 'Combustível',
      automotivos: 'Automotivos',
      conveniencia: 'Conveniência',
    };
    mapVendasAutosystem.forEach(m => {
      const gpId = m.grupo_dre_id || m.grupo_fluxo_id;
      if (!gpId) return;
      const catLabel = LABELS[m.categoria] || m.categoria;
      const sinal = m.tipo === 'custo' ? -1 : 1;
      const label = `${catLabel} (${m.tipo === 'custo' ? 'custo' : 'vendas'})`;
      const key = `as-${m.categoria}-${m.tipo}`;
      const porEmp = vendasAutosystemPorMes.atual?.[m.categoria]?.[mesEmpresa.key] || {};
      Object.entries(porEmp).forEach(([ec, x]) => {
        const val = (m.tipo === 'custo' ? Number(x?.custo || 0) : Number(x?.venda || 0)) * sinal;
        if (!out[gpId]) out[gpId] = {};
        if (!out[gpId][key]) out[gpId][key] = { valoresPorMes: {}, label };
        out[gpId][key].valoresPorMes[ec] = (out[gpId][key].valoresPorMes[ec] || 0) + val;
      });
    });
    return out;
  }, [mesEmpresa, mapVendasAutosystem, vendasAutosystemPorMes.atual]);

  // Vendas do mes selecionado agregadas por (grupo, empresa, tipo)
  const vendasEmpresaPorGrupo = useMemo(() => {
    const porGrupo = {};
    if (!mesEmpresa) return porGrupo;
    const dados = dadosPorMes[mesEmpresa.key];
    if (!dados) return porGrupo;

    const cfgPorTipo = new Map();
    mapeamentoVendas.forEach(m => { if (m.grupo_dre_id) cfgPorTipo.set(m.tipo, m); });
    if (cfgPorTipo.size === 0) return porGrupo;

    // Agrupa itens e vendas por empresa. Sem empresaCodigo → coluna '_rede'.
    const itensPorEmp = new Map();
    (dados.vendaItens || []).forEach(item => {
      const ec = String(item.empresaCodigo ?? '') || '_rede';
      if (!itensPorEmp.has(ec)) itensPorEmp.set(ec, []);
      itensPorEmp.get(ec).push(item);
    });
    const vendasPorEmp = new Map();
    (dados.vendas || []).forEach(v => {
      const ec = String(v.empresaCodigo ?? '') || '_rede';
      if (!vendasPorEmp.has(ec)) vendasPorEmp.set(ec, new Map());
      vendasPorEmp.get(ec).set(v.vendaCodigo || v.codigo, v);
    });

    itensPorEmp.forEach((itens, empKey) => {
      const vMap = vendasPorEmp.get(empKey) || new Map();
      const totaisMes = vendasMapService.agregarVendasItens(itens, vMap, produtosMap, gruposCatMap);
      Object.entries(totaisMes).forEach(([tipo, valor]) => {
        const cfg = cfgPorTipo.get(tipo);
        if (!cfg) return;
        const tipoCfg = TIPOS_VENDA.find(t => t.id === tipo);
        if (!tipoCfg) return;
        const valorComSinal = (valor || 0) * tipoCfg.sinal;
        if (!porGrupo[cfg.grupo_dre_id]) porGrupo[cfg.grupo_dre_id] = {};
        if (!porGrupo[cfg.grupo_dre_id][tipo]) {
          porGrupo[cfg.grupo_dre_id][tipo] = { valoresPorMes: {}, tipoCfg };
        }
        porGrupo[cfg.grupo_dre_id][tipo].valoresPorMes[empKey] =
          (porGrupo[cfg.grupo_dre_id][tipo].valoresPorMes[empKey] || 0) + valorComSinal;
      });
    });
    return porGrupo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesEmpresa, dadosPorMes, mapeamentoVendas, produtosMap, gruposCatMap]);

  // Arvore DRE com empresas como colunas (espelha dreTree com colunasEmpresa)
  const dreTreeEmpresa = useMemo(() => {
    if (!modoRede || !grupos.length || colunasEmpresa.length === 0) return [];
    const idxE = idxEmpresaFull.totais;
    const lancsE = idxEmpresaFull.lancamentos;

    function buildNode(grupo) {
      const contasMapeadas = mapeamentos.filter(m => m.grupo_dre_id === grupo.id);
      const contas = contasMapeadas.map(m => {
        const codKey = String(m.plano_conta_codigo);
        const valoresPorMes = {};
        const valoresAnt = {};
        let totalPeriodo = 0;
        colunasEmpresa.forEach(col => {
          const v = idxE[codKey]?.[col.key] || 0;
          valoresPorMes[col.key] = v;
          valoresAnt[col.key] = 0;
          totalPeriodo += v;
        });
        const lancs = (lancsE[codKey] || [])
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
          totalAnt: 0,
          lancamentos: lancs,
        };
      });

      const vendasGrupo = vendasEmpresaPorGrupo[grupo.id];
      if (vendasGrupo) {
        Object.entries(vendasGrupo).forEach(([tipo, dados]) => {
          const valoresPorMes = {};
          const valoresAnt = {};
          let totalPeriodo = 0;
          colunasEmpresa.forEach(col => {
            const v = dados.valoresPorMes[col.key] || 0;
            valoresPorMes[col.key] = v;
            valoresAnt[col.key] = 0;
            totalPeriodo += v;
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
            totalAnt: 0,
            lancamentos: [],
          });
        });
      }

      // Contas virtuais Vendas/Custo do AUTOSYSTEM por empresa
      const vendasASGrupo = vendasASEmpresaPorGrupo[grupo.id];
      if (vendasASGrupo) {
        Object.entries(vendasASGrupo).forEach(([key, dados]) => {
          const valoresPorMes = {};
          const valoresAnt = {};
          let totalPeriodo = 0;
          colunasEmpresa.forEach(col => {
            const v = dados.valoresPorMes[col.key] || 0;
            valoresPorMes[col.key] = v;
            valoresAnt[col.key] = 0;
            totalPeriodo += v;
          });
          contas.push({
            id: `${key}-emp-${grupo.id}`,
            codigo: '',
            descricao: dados.label,
            isVendas: true,
            valoresPorMes,
            valoresAnt,
            totalPeriodo,
            totalAnt: 0,
            lancamentos: [],
          });
        });
      }

      const children = grupos
        .filter(g => g.parent_id === grupo.id)
        .sort((a, b) => a.ordem - b.ordem)
        .map(buildNode);

      const valoresPorMes = {};
      const valoresAnt = {};
      let totalPeriodo = 0;
      colunasEmpresa.forEach(col => {
        const fromContas = contas.reduce((s, c) => s + (c.valoresPorMes[col.key] || 0), 0);
        const fromChildren = children.reduce((s, c) => s + (c.valoresPorMes[col.key] || 0), 0);
        valoresPorMes[col.key] = fromContas + fromChildren;
        valoresAnt[col.key] = 0;
        totalPeriodo += valoresPorMes[col.key];
      });

      return {
        ...grupo,
        contas,
        children,
        valoresPorMes,
        valoresAnt,
        totalPeriodo,
        totalAnt: 0,
      };
    }

    return grupos
      .filter(g => !g.parent_id)
      .sort((a, b) => a.ordem - b.ordem)
      .map(buildNode);
  }, [modoRede, grupos, mapeamentos, colunasEmpresa, idxEmpresaFull, vendasEmpresaPorGrupo, vendasASEmpresaPorGrupo]);

  // Acumulado (subtotais / resultado) espelhando dreComCalculos mas com colunasEmpresa
  const dreComCalculosEmpresa = useMemo(() => {
    const acum = {};
    let acumTotal = 0;
    colunasEmpresa.forEach(c => { acum[c.key] = 0; });
    return dreTreeEmpresa.map(node => {
      if (node.tipo === 'subtotal' || node.tipo === 'resultado') {
        return {
          ...node,
          isCalc: true,
          valoresPorMes: { ...acum },
          valoresAnt: colunasEmpresa.reduce((a, c) => { a[c.key] = 0; return a; }, {}),
          totalPeriodo: acumTotal,
          totalAnt: 0,
        };
      }
      colunasEmpresa.forEach(c => { acum[c.key] += (node.valoresPorMes[c.key] || 0); });
      acumTotal += node.totalPeriodo;
      return node;
    });
  }, [dreTreeEmpresa, colunasEmpresa]);

  // Base AV (receita bruta) por empresa
  const baseAVEmpresa = useMemo(() => {
    const base = {};
    const primeiraReceita = dreTreeEmpresa.find(n => !['subtotal', 'resultado'].includes(n.tipo));
    colunasEmpresa.forEach(c => {
      base[c.key] = primeiraReceita ? Math.abs(primeiraReceita.valoresPorMes[c.key] || 0) : 0;
    });
    base.total = Math.abs(primeiraReceita?.totalPeriodo || 0);
    return base;
  }, [dreTreeEmpresa, colunasEmpresa]);

  // Pega o ÚLTIMO node de tipo='resultado' = "Resultado Gerencial Líquido".
  const totalGeralEmpresa = useMemo(() => {
    const resultados = dreComCalculosEmpresa.filter(n => n.tipo === 'resultado');
    return resultados[resultados.length - 1]?.totalPeriodo
      ?? dreTreeEmpresa.reduce((s, n) => s + n.totalPeriodo, 0);
  }, [dreComCalculosEmpresa, dreTreeEmpresa]);

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
    return <div className="text-center py-20 text-gray-500">Cliente não encontrado</div>;
  }

  const periodoLabel = meses.length === 1
    ? meses[0].label
    : `${meses[0].label} - ${meses[meses.length - 1].label}`;

  // 1 mes: retrato (mais altura para linhas da mascara). 2+ meses: paisagem
  // para acomodar as colunas extras (Valor/% por mes) sem apertar demais.
  const orientacaoA4 = meses.length === 1 ? 'portrait' : 'landscape';

  return (
    <div>
      {/* Print-only styles — orientacao e fontes mudam conforme meses.length */}
      <style>{`
        @media print {
          html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body, main, #root, .app-bg, .min-h-screen { background: white !important; background-image: none !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-page { padding: 0; background: white !important; }
          .print-no-break { page-break-inside: avoid; }
          aside, header { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .conta-row, .lanc-row { display: none !important; }
          /* Remove blurs decorativos do AppLayout que pintam o fundo */
          [aria-hidden="true"] { display: none !important; }
          /* IMPORTANTE: nao usar "padding" curto com !important — sobrescreve
             paddingLeft inline usado pra indentacao hierarquica da mascara. */
          table { border-collapse: collapse; width: 100% !important; min-width: 0 !important; table-layout: auto !important; }
          table colgroup col { width: auto !important; }
          table th, table td { padding-top: 3.5px !important; padding-bottom: 3.5px !important; padding-right: 4px !important; line-height: 1.25 !important; white-space: normal !important; }
          h1, h2, h3 { margin: 3px 0 !important; }
          .rounded-2xl, .rounded-xl, .rounded-lg { border-radius: 3px !important; }
          .border { border-width: 0.4pt !important; }
          .shadow-sm, .shadow-lg { box-shadow: none !important; }
          .overflow-x-auto { overflow: visible !important; }

          ${orientacaoA4 === 'portrait' ? `
            /* A4 Retrato (~194mm) — 1 mes, layout mais compacto */
            html, body { font-size: 9pt; }
            table { font-size: 8pt !important; }
            table th { font-size: 6.5pt !important; }
            table td { font-size: 8pt !important; }
            h1, h2, h3 { font-size: 10pt !important; }
            .font-mono, .tabular-nums { font-size: 8.5pt !important; letter-spacing: -0.15px; }
            @page { size: A4 portrait; margin: 8mm; }
          ` : `
            /* A4 Paisagem (~281mm) — 3 meses, mais folga para as colunas */
            html, body { font-size: 10pt; }
            table { font-size: 9pt !important; }
            table th { font-size: 7.5pt !important; }
            table td { font-size: 9pt !important; }
            h1, h2, h3 { font-size: 11pt !important; }
            .font-mono, .tabular-nums { font-size: 9.5pt !important; letter-spacing: -0.1px; }
            @page { size: A4 landscape; margin: 8mm 10mm; }
          `}
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
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <FileBarChart className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {modoRede ? 'DRE Gerencial · Rede consolidada' : 'DRE Gerencial'}
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
        className="bg-white rounded-xl border border-gray-200/60 px-3 py-2.5 mb-5 shadow-sm no-print">
        <div className="flex flex-wrap items-end gap-2.5">
          {/* Mascara */}
          <div className="min-w-[180px]">
            <label className="block text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Máscara DRE</label>
            <select value={mascaraSelecionada?.id || ''}
              onChange={(e) => setMascaraSelecionada(mascaras.find(m => m.id === e.target.value))}
              className="w-full h-8 rounded-lg border border-gray-200 px-2 text-[11px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {mascaras.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>

          {/* Mes final (selecionado) — sistema busca 2 meses anteriores automaticamente */}
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

          {/* Quantidade de meses (1 ou 3) */}
          <div>
            <label className="block text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Análise</label>
            <div className="flex items-center gap-0.5 bg-gray-100/80 rounded-lg p-0.5 h-8">
              {[1, 3].map(q => (
                <button key={q} onClick={() => setQtdMeses(q)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                    qtdMeses === q ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {q === 1 ? '1 mês' : '3 meses'}
                </button>
              ))}
            </div>
          </div>

          {/* Seletor de empresas (injetado pelo wrapper cliente) */}
          {seletorEmpresas && (
            <div className="h-8 flex items-end">{seletorEmpresas}</div>
          )}

          {/* Montar DRE */}
          <div>
            <button onClick={handleMontarDRE} disabled={loadingDados || !mascaraSelecionada}
              className="flex items-center gap-1.5 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 text-[11px] font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loadingDados ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileBarChart className="h-3.5 w-3.5" />}
              Montar DRE
            </button>
          </div>

          {/* Toggles — ficam à direita, na mesma linha quando couber */}
          <div className="flex items-center gap-1.5 ml-auto h-8">
            <button onClick={() => setOcultarZeradas(!ocultarZeradas)}
              title={ocultarZeradas ? 'Mostrar contas zeradas' : 'Ocultar contas zeradas'}
              className={`flex items-center gap-1 h-8 rounded-lg px-2.5 text-[10.5px] font-medium transition-all border ${
                ocultarZeradas ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {ocultarZeradas ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              Ocultar zeradas
            </button>
            <button onClick={() => setShowAH(!showAH)}
              title={showAH ? 'Ocultar AH (ano anterior)' : 'Mostrar AH (ano anterior)'}
              className={`flex items-center gap-1 h-8 rounded-lg px-2.5 text-[10.5px] font-medium transition-all border ${
                showAH ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              AH
            </button>
            <button onClick={() => setMostrarTotal(!mostrarTotal)}
              title={mostrarTotal ? 'Ocultar coluna Total' : 'Mostrar coluna Total'}
              className={`flex items-center gap-1 h-8 rounded-lg px-2.5 text-[10.5px] font-medium transition-all border ${
                mostrarTotal ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              Total
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
        <div style={{ marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: 0 }}>DRE Gerencial</h1>
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

      {/* Tabs DRE | Por Empresa | Insights — versão inline + versão flutuante
          quando o usuário rola e o original sai da viewport. */}
      {reportReady && (
        <>
          <div ref={tabsAnchorRef}>
            <TabsBar
              activeTab={activeTab} setActiveTab={setActiveTab}
              mostrarEmpresa={modoRede && colunasEmpresa.length > 0}
            />
          </div>
          <AnimatePresence>
            {tabsFlutuando && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="fixed top-4 left-1/2 -translate-x-1/2 z-40 no-print"
              >
                <div className="bg-white shadow-lg shadow-gray-900/10 border border-gray-200/80 rounded-xl px-1 py-1">
                  <TabsBar
                    activeTab={activeTab} setActiveTab={setActiveTab}
                    mostrarEmpresa={modoRede && colunasEmpresa.length > 0}
                    floating
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Loading state - exibido enquanto dados nao estao prontos OU memos ainda computando */}
      <AnimatePresence mode="wait">
        {!dreSolicitado ? (
          <motion.div key="aguardando" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
              <FileBarChart className="h-7 w-7 text-white" />
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Selecione o período e clique em "Montar DRE"</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              O relatório sera gerado com os 3 meses terminando em <strong>{meses[meses.length - 1]?.label}</strong>: <strong>{meses.map(m => m.label).join(', ')}</strong>.
            </p>
          </motion.div>
        ) : (loadingDados || loadingGrupos || loadingMapeamentos || (!reportReady && (cliente.usa_webposto || cliente.as_rede_id))) ? (
          <FriendlyLoader key="loader" progress={loadingProgress} cliente={cliente} periodoLabel={periodoLabel}
            stageLabel={
              loadingGrupos ? 'Carregando estrutura da máscara...'
                : loadingMapeamentos ? 'Carregando mapeamentos...'
                : loadingDados ? null
                : 'Processando relatório...'
            }
          />
        ) : !grupos.length ? (
          <motion.div key="empty-mascara" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
            <Layers className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-800 mb-1">Máscara vazia</p>
            <p className="text-xs text-gray-400">Configure a estrutura da máscara em Cadastros &gt; Parâmetros</p>
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
        ) : activeTab === 'empresa' && modoRede ? (
          <motion.div key="empresa" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
              <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap no-print">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-800">{mascaraSelecionada?.nome}</h3>
                    <p className="text-[11px] text-gray-400">
                      Por empresa · {mesEmpresa?.label || '—'} · {colunasEmpresaBase.length} empresas
                      {idxEmpresaFull.temOrfaos && <span className="text-blue-500"> + rede</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Mês:</label>
                  <select value={mesEmpresaKey || ''}
                    onChange={(e) => setMesEmpresaKey(e.target.value)}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    {meses.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                  <div className="text-right ml-2">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Resultado</p>
                    <p className={`text-base font-bold ${totalGeralEmpresa >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(totalGeralEmpresa)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[12px]" style={{ tableLayout: 'fixed', minWidth: 420 + colunasEmpresa.length * 130 + 140 }}>
                  <colgroup>
                    <col style={{ width: 420 }} />
                    {colunasEmpresa.map(c => (
                      <>
                        <col key={`${c.key}-cv`} style={{ width: 90 }} />
                        <col key={`${c.key}-cav`} style={{ width: 45 }} />
                      </>
                    ))}
                    {mostrarTotal && <col style={{ width: 110 }} />}
                    {mostrarTotal && <col style={{ width: 45 }} />}
                  </colgroup>
                  <thead className="bg-gray-50/80">
                    <tr className="text-gray-500">
                      <th className="text-left px-4 py-2.5 font-medium uppercase text-[10px] tracking-wider whitespace-nowrap">Conta</th>
                      {colunasEmpresa.map(c => (
                        <>
                          <th key={`${c.key}-h`}
                            title={c._isRede
                              ? 'Lançamentos da rede sem empresa específica (matriz, despesas centralizadas, rateios). Inclui pra fechar o total com o DRE sintético.'
                              : (c._empresa ? labelEmpresa(c._empresa) : c.label)}
                            className={`text-right px-2 py-2.5 font-medium uppercase text-[10px] tracking-wider whitespace-nowrap truncate max-w-[90px] ${c._isRede ? 'bg-blue-50/60 text-blue-700' : ''}`}>
                            {c.label}
                          </th>
                          <th key={`${c.key}-hav`} className={`text-right px-1 py-2.5 font-medium text-[9px] tracking-wider whitespace-nowrap ${c._isRede ? 'bg-blue-50/60 text-blue-400' : 'text-gray-400'}`}>AV%</th>
                        </>
                      ))}
                      {mostrarTotal && (
                        <>
                          <th className="text-right px-3 py-2.5 font-medium uppercase text-[10px] tracking-wider bg-gray-100/60 whitespace-nowrap">Total (R$)</th>
                          <th className="text-right px-2 py-2.5 font-medium text-[9px] tracking-wider text-gray-400 bg-gray-100/60 whitespace-nowrap">AV%</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {dreComCalculosEmpresa.map((node) => (
                      <DreNodeRows key={node.id} node={node} depth={0}
                        meses={colunasEmpresa}
                        baseAV={baseAVEmpresa}
                        expandedGrupos={expandedGrupos}
                        expandedContas={expandedContas}
                        onToggleGrupo={toggleGrupo}
                        onToggleConta={toggleConta}
                        ocultarZeradas={ocultarZeradas}
                        showAH={false}
                        mostrarTotal={mostrarTotal}
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
                <Building2 className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-800">Resultado por empresa</h3>
                <span className="text-[11px] text-gray-400">· participação de cada unidade no total consolidado</span>
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
                      <th className="px-4 py-2.5">CNPJ</th>
                      <th className="px-4 py-2.5 text-right">Resultado</th>
                      <th className="px-4 py-2.5 text-right">Participação</th>
                      <th className="px-4 py-2.5 w-[180px]">Peso relativo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resultadoPorEmpresa.empresas.map((p, i) => (
                      <tr key={p.empresaCodigo} className={`hover:bg-gray-50/60 ${p._isRede ? 'bg-blue-50/40' : ''}`}>
                        <td className="px-4 py-2 text-[11px] text-gray-400 font-mono">{p._isRede ? '—' : i + 1}</td>
                        <td className={`px-4 py-2 text-[12.5px] font-medium ${p._isRede ? 'text-blue-700 italic' : 'text-gray-800'}`}
                          title={p._isRede ? 'Lançamentos sem empresa específica (matriz, despesas centralizadas, rateios)' : undefined}>
                          {p._isRede ? 'Rede / Não alocado' : (p.empresa ? labelEmpresa(p.empresa) : `#${p.empresaCodigo}`)}
                        </td>
                        <td className="px-4 py-2 text-[11px] text-gray-500 font-mono">{p._isRede ? '—' : (p.empresa?.cnpj ? labelCnpj(p.empresa.cnpj) : '—')}</td>
                        <td className={`px-4 py-2 text-right font-mono text-[12.5px] font-semibold tabular-nums ${p.total >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {formatCurrency(p.total)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums text-gray-800 font-semibold">
                          {p.participacao.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2">
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full transition-all ${p.total >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(100, p.participacao)}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50/60 border-t border-gray-200">
                    <tr className="text-[12px] font-semibold">
                      <td className="px-4 py-3 text-gray-700" colSpan={3}>Consolidado ({resultadoPorEmpresa.empresas.length} empresas)</td>
                      <td className={`px-4 py-3 text-right font-mono tabular-nums ${resultadoPorEmpresa.totalConsolidado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatCurrency(resultadoPorEmpresa.totalConsolidado)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700">100.0%</td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            {/* Header (no-print) */}
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between no-print">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
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
                  {mostrarTotal && <col style={{ width: 125 }} />}
                  {mostrarTotal && <col style={{ width: 55 }} />}
                  {mostrarTotal && showAH && <col style={{ width: 75 }} />}
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
                    {mostrarTotal && (
                      <>
                        <th className="text-right px-3 py-2.5 font-medium uppercase text-[10px] tracking-wider bg-gray-100/60 whitespace-nowrap">Total (R$)</th>
                        <th className="text-right px-2 py-2.5 font-medium text-[9px] tracking-wider text-gray-400 bg-gray-100/60 whitespace-nowrap">AV%</th>
                        {showAH && <th className="text-right px-3 py-2.5 font-medium uppercase text-[10px] tracking-wider bg-gray-100/60 whitespace-nowrap">AH%</th>}
                      </>
                    )}
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
                      mostrarTotal={mostrarTotal}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Contas não mapeadas (admin only — esta página é exclusiva do admin) ─── */}
      {!loading && contasNaoMapeadas.length > 0 && (
        <SecaoContasNaoMapeadas
          contas={contasNaoMapeadas}
          meses={meses}
          showAH={showAH}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Seção SEPARADA pra contas não mapeadas (admin only)
// ═══════════════════════════════════════════════════════════
function SecaoContasNaoMapeadas({ contas, meses }) {
  const [expandida, setExpandida] = useState(false);
  const totalGeral = contas.reduce((s, c) => s + c.totalPeriodo, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 bg-amber-50/40 border border-amber-200 rounded-2xl overflow-hidden no-print"
    >
      <button
        type="button"
        onClick={() => setExpandida(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-amber-50/70 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <span className="text-amber-700 text-base">⚠</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-[13.5px] font-bold text-amber-900">
              Contas não mapeadas <span className="text-amber-700">({contas.length})</span>
            </h3>
            <p className="text-[11px] text-amber-700/80">
              Lançamentos com plano de contas que ainda não foi vinculado a um grupo da DRE.
              Não aparecem pro cliente.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-[13px] font-bold tabular-nums ${totalGeral < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGeral)}
          </span>
          <svg className={`h-4 w-4 text-amber-700 transition-transform ${expandida ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expandida && (
        <div className="border-t border-amber-200/70 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-amber-50/60 text-amber-800 border-b border-amber-100">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold uppercase text-[10px] tracking-wider">Código</th>
                  <th className="text-left px-4 py-2 font-semibold uppercase text-[10px] tracking-wider">Descrição</th>
                  <th className="text-right px-4 py-2 font-semibold uppercase text-[10px] tracking-wider">Lançamentos</th>
                  {meses.map(m => (
                    <th key={m.key} className="text-right px-3 py-2 font-semibold uppercase text-[10px] tracking-wider whitespace-nowrap">{m.label}</th>
                  ))}
                  <th className="text-right px-4 py-2 font-semibold uppercase text-[10px] tracking-wider bg-amber-100/40">Total</th>
                </tr>
              </thead>
              <tbody>
                {contas.map(conta => (
                  <tr key={conta.codigo} className="border-b border-amber-50 hover:bg-amber-50/30">
                    <td className="px-4 py-2 font-mono text-[11px] text-gray-700">{conta.codigo}</td>
                    <td className="px-4 py-2 text-gray-800">{conta.descricao}</td>
                    <td className="px-4 py-2 text-right text-gray-500 tabular-nums">{conta.qtdLancamentos}</td>
                    {meses.map(m => {
                      const v = conta.valoresPorMes[m.key] || 0;
                      return (
                        <td key={m.key} className={`px-3 py-2 text-right tabular-nums ${v < 0 ? 'text-rose-600' : v > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {v === 0 ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}
                        </td>
                      );
                    })}
                    <td className={`px-4 py-2 text-right font-semibold tabular-nums bg-amber-50/30 ${conta.totalPeriodo < 0 ? 'text-rose-700' : conta.totalPeriodo > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(conta.totalPeriodo)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-amber-50 border-t border-amber-200">
                  <td colSpan={3 + meses.length} className="px-4 py-2.5 font-bold text-amber-900 text-right text-[11px] uppercase tracking-wider">Total geral</td>
                  <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${totalGeral < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGeral)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Friendly Loader - mostra progresso durante carregamento
// ═══════════════════════════════════════════════════════════
const TIPS = [
  'A DRE consolida receitas, custos e despesas em um unico relatório gerencial.',
  'AV (Análise Vertical) mostra o peso de cada linha em relacao a Receita Bruta.',
  'AH (Análise Horizontal) compara os valores com o mesmo período do ano anterior.',
  'Você pode imprimir o relatório em A4 - apenas os grupos sinteticos serao exportados.',
  'Use o filtro "Ocultar zeradas" para focar apenas nas contas com movimento.',
];

function FriendlyLoader({ progress, cliente, periodoLabel, stageLabel }) {
  const { labelEmpresa } = useAnonimizador();
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
          <div className="absolute -bottom-1/2 right-1/4 w-[300px] h-[300px] rounded-full bg-blue-100/30 blur-[60px]" />
        </div>

        <div className="relative flex flex-col items-center text-center max-w-md mx-auto">
          {/* Animated icon */}
          <div className="relative mb-6">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-500 opacity-20 blur-xl"
            />
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30"
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
          <h3 className="text-base font-semibold text-gray-900 mb-1">Montando seu relatório</h3>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Estamos buscando os lançamentos de <strong>{labelEmpresa(cliente)}</strong> no período de <strong>{periodoLabel}</strong> e do mesmo período no ano anterior.
          </p>

          {/* Progress bar */}
          <div className="w-full mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Progresso</span>
              <span className="text-[11px] font-semibold text-blue-600">{pct}%</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
            {progress.total > 0 && (
              <p className="text-[11px] text-gray-400 mt-2">{progress.atual} de {progress.total} consultas concluídas</p>
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
                  <strong className="text-blue-700">Você sabia?</strong> {TIPS[tipIndex]}
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
function DreNodeRows({ node, depth, meses, baseAV, expandedGrupos, expandedContas, onToggleGrupo, onToggleConta, ocultarZeradas, showAH, mostrarTotal = true }) {
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

  // Resultado verde/vermelho conforme positivo/negativo
  const resultadoPositivo = node.totalPeriodo >= 0;
  const rowBg = isResultado
    ? (resultadoPositivo ? 'bg-emerald-50' : 'bg-rose-50')
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
                : isResultado ? `text-[12px] font-bold uppercase ${resultadoPositivo ? 'text-emerald-800' : 'text-rose-800'}`
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
                isResultado ? `font-bold ${v > 0 ? 'text-emerald-700' : v < 0 ? 'text-rose-700' : 'text-gray-400'}`
                  : isCalc ? `font-semibold ${v > 0 ? 'text-emerald-700' : v < 0 ? 'text-rose-700' : 'text-gray-400'}`
                    : v > 0 ? 'text-emerald-700' : v < 0 ? 'text-rose-700' : 'text-gray-400'
              }`}>
                {formatCurrencyCompact(v)}
              </td>
              <td key={`${m.key}-av`} className="text-right px-2 py-2 font-mono tabular-nums text-[10px] text-gray-400 whitespace-nowrap">
                {!isCalc && av !== 0 ? `${av.toFixed(1)}%` : ''}
              </td>
            </>
          );
        })}
        {mostrarTotal && (
          <>
            <td className={`text-right px-3 py-2 font-mono tabular-nums whitespace-nowrap bg-gray-50/40 font-semibold ${
              isResultado ? `font-bold ${node.totalPeriodo > 0 ? 'text-emerald-700' : node.totalPeriodo < 0 ? 'text-rose-700' : 'text-gray-400'}`
                : node.totalPeriodo > 0 ? 'text-emerald-700' : node.totalPeriodo < 0 ? 'text-rose-700' : 'text-gray-400'
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
          </>
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
            mostrarTotal={mostrarTotal}
          />
        ))}
      </AnimatePresence>

      {/* Contas mapeadas */}
      {isExpanded && !isCalc && contasFiltradas.map(conta => {
        const isContaExpanded = expandedContas?.has(conta.id);
        const temLancs = conta.lancamentos && conta.lancamentos.length > 0;
        const totalCols = 1 + (meses.length * 2) + (mostrarTotal ? 2 + (showAH ? 1 : 0) : 0);
        return (
          <>
            <tr key={conta.id} className="conta-row border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
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
                    <div className="h-1 w-1 rounded-full bg-blue-300 flex-shrink-0" />
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
              {mostrarTotal && (
                <>
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
                </>
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
                  {mostrarTotal && (
                    <>
                      <td className={`${valorClasses} bg-gray-100/40`}>
                        {formatCurrencyCompact(valorComSinal)}
                      </td>
                      <td className="px-2 py-1 bg-gray-100/40"></td>
                      {showAH && <td className="px-3 py-1 bg-gray-100/40"></td>}
                    </>
                  )}
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
  // Aceita "YYYY-MM-DD" e ISO com timestamp ("YYYY-MM-DDTHH:mm:ss.sssZ")
  const apenasData = String(d).slice(0, 10);
  const [y, m, dd] = apenasData.split('-');
  if (!y || !m || !dd) return String(d);
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

// ═══════════════════════════════════════════════════════════
// TabsBar — DRE | Por Empresa | Insights.
// Usada inline + na versão flutuante (idêntica visualmente exceto pelo
// container externo, que é o pai quem decide).
// ═══════════════════════════════════════════════════════════
function TabsBar({ activeTab, setActiveTab, mostrarEmpresa, floating = false }) {
  // No modo flutuante, removemos o background do container interno —
  // o container externo já dá a estética de "card flutuante".
  const containerCls = floating
    ? 'flex items-center gap-0.5'
    : 'flex items-center gap-0.5 mb-4 bg-gray-100/80 rounded-lg p-0.5 w-fit no-print';
  return (
    <div className={containerCls}>
      <button onClick={() => setActiveTab('dre')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
          activeTab === 'dre' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}>
        <Table className="h-3.5 w-3.5" /> DRE
      </button>
      {mostrarEmpresa && (
        <button onClick={() => setActiveTab('empresa')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
            activeTab === 'empresa' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <Building2 className="h-3.5 w-3.5" /> Por Empresa
        </button>
      )}
      <button onClick={() => setActiveTab('insights')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
          activeTab === 'insights' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}>
        <Sparkles className="h-3.5 w-3.5" /> Insights
      </button>
    </div>
  );
}
