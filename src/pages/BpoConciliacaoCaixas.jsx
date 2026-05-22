import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Coins, Loader2, AlertCircle, Building2, Zap, Calendar,
  UserRound, CheckCircle2, TrendingUp, TrendingDown, RefreshCw, Clock, ChevronRight,
  Fuel, Wrench, ShoppingBag, Package, CreditCard, Banknote, FileText, MoreHorizontal,
  XCircle, ChevronDown, PlusCircle, MinusCircle, Printer,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as autosystemService from '../services/autosystemService';
import * as sangriasService from '../services/clienteSangriasService';
import * as bpoConciliacaoService from '../services/bpoConciliacaoService';
import { classificarItem } from '../services/mapeamentoVendasService';
import SeletorRedeBPO from '../components/ui/SeletorRedeBPO';
import { formatCurrency } from '../utils/format';
import { Lock, CheckCircle } from 'lucide-react';

function hojeStr() { return new Date().toISOString().split('T')[0]; }

// Categoriza nome da forma de pagamento em 4 grupos padrao
function classificarForma(nome) {
  const n = (nome || '').toUpperCase();
  if (/DINHEIRO|ESPECIE/.test(n)) return 'dinheiro';
  if (/CARTAO|CARTÃO|CREDITO|DEBITO|DÉBITO|CRÉDITO|PIX/.test(n)) return 'cartao';
  if (/CHEQUE/.test(n)) return 'cheque';
  return 'outros';
}

export default function BpoConciliacaoCaixas({
  // Modo cliente: cliente fixo vindo da sessao (nao permite trocar rede/empresa).
  clienteFixed = null,
  // Gating: so renderiza o relatorio quando admin tiver marcado como concluida.
  requerConciliacaoConcluida = false,
  // Quem esta logado (pra registrar quem marcou a conciliacao).
  usuarioLogado = '',
  // Data inicial (ISO yyyy-mm-dd) para pre-selecionar ao abrir.
  dataInitial = null,
} = {}) {
  const modoCliente = !!clienteFixed;

  const [clientes, setClientes] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  // Em modo admin, `redeSel` é o objeto { tipo, id }; redeId só captura tipo=webposto.
  const [redeSel, setRedeSel] = useState(null);
  const [redeId, setRedeId] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [cliente, setCliente] = useState(null);
  const [data, setData] = useState(dataInitial || hojeStr());
  const [loading, setLoading] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [vendas, setVendas] = useState([]);
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [caixas, setCaixas] = useState([]);
  const [caixasApresentados, setCaixasApresentados] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [vendaItens, setVendaItens] = useState([]);
  const [vendasCanceladas, setVendasCanceladas] = useState([]);
  // ─── Estado Autosystem (carregado quando rede selecionada é Autosystem)
  const [vendasAutosystem, setVendasAutosystem] = useState([]);
  const [recebimentosAutosystem, setRecebimentosAutosystem] = useState([]);
  const [outrasEntradasAutosystem, setOutrasEntradasAutosystem] = useState([]);
  const [mapaGruposAutosystem, setMapaGruposAutosystem] = useState(new Map());
  const [mapaContasAutosystem, setMapaContasAutosystem] = useState(new Map());
  // Mapa codigo → nome da conta (catálogo remoto do plano de contas)
  const [mapaNomesContasAutosystem, setMapaNomesContasAutosystem] = useState(new Map());
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const [produtos, setProdutos] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [clientesQuality, setClientesQuality] = useState([]);
  const [error, setError] = useState(null);
  const [carregado, setCarregado] = useState(false);
  const [expandidos, setExpandidos] = useState(new Set());
  // Fechamento de sangria registrado pelo responsavel no portal do cliente
  const [fechamentoSangria, setFechamentoSangria] = useState(null);
  // Status da conciliacao (admin marca como concluida)
  const [statusConciliacao, setStatusConciliacao] = useState(null);
  const [salvandoStatus, setSalvandoStatus] = useState(false);

  useEffect(() => {
    if (modoCliente) {
      // Em modo cliente nao precisa carregar lista de clientes/redes.
      setClientes([clienteFixed]);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [lista, chs, redesAS] = await Promise.all([
          clientesService.listarClientes(),
          mapService.listarChavesApi(),
          autosystemService.listarRedes().catch(() => []),
        ]);
        const clientesValidos = (lista || []).filter(c =>
          (c.usa_webposto && c.chave_api_id && c.empresa_codigo) ||
          (c.as_rede_id && c.empresa_codigo != null)
        );
        setClientes(clientesValidos);
        const idsWb = new Set(clientesValidos.filter(c => c.chave_api_id).map(c => c.chave_api_id));
        setChavesApi((chs || []).filter(ch => ch.ativo !== false && idsWb.has(ch.id)));
        const idsAS = new Set(clientesValidos.filter(c => c.as_rede_id).map(c => c.as_rede_id));
        setRedesAutosystem((redesAS || []).filter(r => idsAS.has(r.id)));
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [modoCliente, clienteFixed]);

  const contagensPorRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => {
      const key = c.chave_api_id || c.as_rede_id;
      if (!key) return;
      m.set(key, (m.get(key) || 0) + 1);
    });
    return m;
  }, [clientes]);

  // Sincroniza `redeId` (string) com `redeSel` (objeto). Mantém compatibilidade
  // com o fluxo Quality existente — `redeId` só fica preenchido para Webposto.
  useEffect(() => {
    setRedeId(redeSel?.tipo === 'webposto' ? redeSel.id : '');
  }, [redeSel]);

  // Em modo cliente, fixa o cliente e pula a selecao de rede/empresa
  useEffect(() => {
    if (modoCliente && clienteFixed) {
      setCliente(clienteFixed);
      if (clienteFixed.chave_api_id) {
        setRedeSel({ tipo: 'webposto', id: clienteFixed.chave_api_id });
      } else if (clienteFixed.as_rede_id) {
        setRedeSel({ tipo: 'autosystem', id: clienteFixed.as_rede_id });
      } else {
        setRedeSel(null);
      }
      setClienteId(clienteFixed.id || '');
    }
  }, [modoCliente, clienteFixed]);

  // Recarrega status da conciliacao sempre que trocar cliente ou data
  useEffect(() => {
    if (!cliente?.id || !data) { setStatusConciliacao(null); return; }
    (async () => {
      try {
        const s = await bpoConciliacaoService.buscarStatus(cliente.id, data);
        setStatusConciliacao(s);
      } catch { setStatusConciliacao(null); }
    })();
  }, [cliente?.id, data]);

  // Empresas da rede selecionada (Webposto OU Autosystem)
  const empresasDaRede = useMemo(() => {
    if (!redeSel) return [];
    return clientes
      .filter(c => {
        if (redeSel.tipo === 'webposto') return c.chave_api_id === redeSel.id;
        if (redeSel.tipo === 'autosystem') return c.as_rede_id === redeSel.id;
        return false;
      })
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [redeSel, clientes]);

  // Ao trocar de rede, limpa a empresa selecionada se nao pertencer a rede nova
  useEffect(() => {
    if (clienteId && !empresasDaRede.some(c => c.id === clienteId)) {
      setClienteId('');
    }
  }, [redeId, empresasDaRede, clienteId]);

  useEffect(() => {
    setCliente(clientes.find(c => c.id === clienteId) || null);
    setCarregado(false);
    setVendas([]); setCaixas([]); setFormasPagamento([]); setCaixasApresentados([]); setFechamentoSangria(null);
    setVendaItens([]); setVendasCanceladas([]);
  }, [clienteId, clientes]);

  useEffect(() => {
    setCarregado(false);
    setVendas([]); setCaixas([]); setFormasPagamento([]); setCaixasApresentados([]); setFechamentoSangria(null);
    setVendaItens([]); setVendasCanceladas([]);
  }, [data]);

  // Auto-carrega os dados quando em modo cliente e cliente/data estao prontos
  // e o gate de conciliacao esta liberado (ou nao e exigido).
  useEffect(() => {
    if (!modoCliente) return;
    if (!cliente || !data) return;
    if (requerConciliacaoConcluida && !statusConciliacao?.concluida) return;
    if (loadingDados || carregado) return;
    carregar(); // eslint-disable-line
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoCliente, cliente?.id, data, statusConciliacao?.concluida, requerConciliacaoConcluida]);

  const carregar = useCallback(async () => {
    if (!cliente) return;
    // ─── Caminho Autosystem ────────────────────────────────────
    // Por enquanto só temos os itens de venda (lancto). Mostramos
    // resumo por categoria e tabela de produtos. As demais seções
    // (formas de pagamento, caixas/turnos, apresentado) seguem ocultas
    // até as Edge Functions complementares estarem prontas.
    if (cliente.as_rede_id && !cliente.chave_api_id) {
      setLoadingDados(true);
      setError(null);
      try {
        // Pré-busca as contas categorizadas pra derivar as contas de
        // sobra de caixa (que precisam ser injetadas na query de
        // recebimentos como filtro extra em `conta_creditar`).
        const contasAS = await autosystemService.listarContasCategorizadasRede(cliente.as_rede_id).catch(() => []);
        const contasSobraCodigos = (contasAS || [])
          .filter(c => c.categoria === 'sobra_caixa')
          .map(c => String(c.codigo));

        const [vendasAS, recebAS, outrasAS, gruposAS, contasRemotas, fechSangria] = await Promise.all([
          autosystemService.buscarVendasAutosystem(
            cliente.as_rede_id,
            [cliente.empresa_codigo],
            { data_de: data, data_ate: data },
          ),
          autosystemService.buscarRecebimentosAutosystem(
            cliente.as_rede_id,
            [cliente.empresa_codigo],
            { data_de: data, data_ate: data, contas_creditar_extras: contasSobraCodigos },
          ),
          autosystemService.buscarOutrasEntradasAutosystem(
            cliente.as_rede_id,
            [cliente.empresa_codigo],
            { data_de: data, data_ate: data, contas_creditar_excluir: contasSobraCodigos },
          ).catch(() => []),
          autosystemService.listarGruposProdutoRede(cliente.as_rede_id).catch(() => []),
          autosystemService.buscarContasAutosystem(cliente.as_rede_id).catch(() => []),
          sangriasService.buscarFechamento(cliente.id, data).catch(() => null),
        ]);
        const mapaG = new Map();
        (gruposAS || []).forEach(g => {
          // Grupos: indexa pelo grid (produto.grupo no Autosystem é grid).
          if (g.grid != null) mapaG.set(Number(g.grid), g.categoria);
        });
        const mapaC = new Map();
        (contasAS || []).forEach(c => {
          // Contas: indexa pelo codigo textual (m.conta_debitar é "1.1.x.y").
          if (c.codigo) mapaC.set(String(c.codigo), c.categoria);
        });
        const mapaNomes = new Map();
        (contasRemotas || []).forEach(c => {
          if (c.codigo) mapaNomes.set(String(c.codigo), c.nome || '');
        });
        // Reforça com nomes vindos da categorização salva (caso o catálogo remoto falhe)
        (contasAS || []).forEach(c => {
          if (c.codigo && c.nome && !mapaNomes.has(String(c.codigo))) {
            mapaNomes.set(String(c.codigo), c.nome);
          }
        });
        setVendasAutosystem(vendasAS || []);
        setRecebimentosAutosystem(recebAS || []);
        setOutrasEntradasAutosystem(outrasAS || []);
        setMapaGruposAutosystem(mapaG);
        setMapaContasAutosystem(mapaC);
        setMapaNomesContasAutosystem(mapaNomes);
        setFechamentoSangria(fechSangria || null);
        // Limpa estados Webposto (não usados aqui)
        setVendas([]); setCaixas([]); setFuncionarios([]);
        setFormasPagamento([]); setCaixasApresentados([]);
        setVendaItens([]); setProdutos([]); setGrupos([]);
        setVendasCanceladas([]); setClientesQuality([]);
        setCarregado(true);
      } catch (err) {
        setError('Erro ao carregar dados Autosystem: ' + err.message);
      } finally {
        setLoadingDados(false);
      }
      return;
    }
    setLoadingDados(true);
    setError(null);
    try {
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API não encontrada para este cliente');

      const filtros = { dataInicial: data, dataFinal: data, empresaCodigo: cliente.empresa_codigo };
      // Para vendas aprovadas usamos situacao=A (filtro do endpoint VENDA do Quality)
      const filtrosAprovadas = { ...filtros, situacao: 'A' };
      const [vs, cxs, fs, fps, cas, fech, itens, prods, grps, vcanc, cqs] = await Promise.all([
        qualityApi.buscarVendas(chave.chave, filtrosAprovadas),
        qualityApi.buscarCaixas(chave.chave, filtros),
        qualityApi.buscarFuncionarios(chave.chave),
        qualityApi.buscarVendaFormaPagamento(chave.chave, filtros),
        qualityApi.buscarCaixasApresentados(chave.chave, filtros),
        sangriasService.buscarFechamento(cliente.id, data).catch(() => null),
        qualityApi.buscarVendaItens(chave.chave, filtrosAprovadas).catch(() => []),
        qualityApi.buscarProdutos(chave.chave).catch(() => []),
        qualityApi.buscarGrupos(chave.chave).catch(() => []),
        qualityApi.buscarVendas(chave.chave, { ...filtros, situacao: 'C' }).catch(() => []),
        qualityApi.buscarClientesQuality(chave.chave).catch(() => []),
      ]);
      setVendas(vs || []);
      setCaixas(cxs || []);
      setFuncionarios(fs || []);
      setFormasPagamento(fps || []);
      // API ignora empresaCodigo em CAIXA_APRESENTADO, filtramos manualmente
      setCaixasApresentados((cas || []).filter(ca => ca.empresaCodigo === cliente.empresa_codigo));
      setFechamentoSangria(fech || null);
      setVendaItens(itens || []);
      setProdutos(prods || []);
      setGrupos(grps || []);
      setVendasCanceladas(vcanc || []);
      setClientesQuality(cqs || []);
      setCarregado(true);
    } catch (err) {
      setError('Erro ao carregar dados: ' + err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [cliente, data]);

  const mapaFuncionarios = useMemo(() => {
    const m = new Map();
    funcionarios.forEach(f => m.set(f.funcionarioCodigo || f.codigo, f));
    return m;
  }, [funcionarios]);

  // Dinheiro contado por funcionario, vindo do fechamento salvo no portal cliente
  const dinheiroContadoPorFunc = useMemo(() => {
    const m = new Map();
    (fechamentoSangria?.registros || []).forEach(r => {
      m.set(r.funcionarioCodigo, Number(r.dinheiroApresentado || 0));
    });
    return m;
  }, [fechamentoSangria]);

  // Conjunto de vendas aprovadas (endpoint VENDA ja vem com situacao=A).
  // Usado para filtrar itens (VENDA_ITEM nao filtra por situacao no servidor).
  const vendasAprovadasSet = useMemo(() => {
    return new Set(vendas.map(v => v.vendaCodigo || v.codigo));
  }, [vendas]);

  // Vendas do dia por categoria. Aplica filtro de vendas aprovadas no cliente.
  // Formula: item.totalVenda + item.totalAcrescimo.
  // (Descontos nao sao subtraidos: totalVenda ja vem liquido).
  const totaisPorCategoria = useMemo(() => {
    const t = { combustivel: 0, automotivos: 0, conveniencia: 0, outros: 0 };
    if (!vendaItens.length) return t;
    const produtosMap = new Map();
    produtos.forEach(p => produtosMap.set(p.produtoCodigo || p.codigo, p));
    const gruposMap = new Map();
    grupos.forEach(g => gruposMap.set(g.grupoCodigo || g.codigo, g));

    vendaItens.forEach(item => {
      if (!vendasAprovadasSet.has(item.vendaCodigo)) return;
      const valor = Number(item.totalVenda || 0)
        + Number(item.totalAcrescimo || 0);
      const cat = classificarItem(item, produtosMap, gruposMap);
      t[cat] = (t[cat] || 0) + valor;
    });
    return t;
  }, [vendaItens, produtos, grupos, vendasAprovadasSet]);

  // ─── Derivados Autosystem ───────────────────────────────────
  const isAutosystem = !!(cliente?.as_rede_id) && !cliente?.chave_api_id;

  // Totais por categoria (Autosystem). Usa as_rede_grupo_produto pra classificar.
  const totaisPorCategoriaAS = useMemo(() => {
    const t = { combustivel: 0, automotivos: 0, conveniencia: 0, outros: 0 };
    let semCategoriaValor = 0, semCategoriaQtd = 0;
    if (!isAutosystem) return { ...t, semCategoriaValor, semCategoriaQtd };
    vendasAutosystem.forEach(v => {
      const grupoCod = v.grupo_produto_codigo != null ? Number(v.grupo_produto_codigo) : null;
      const cat = grupoCod != null ? mapaGruposAutosystem.get(grupoCod) : null;
      const valor = Number(v.valor) || 0;
      if (cat === 'combustivel' || cat === 'automotivos' || cat === 'conveniencia') {
        t[cat] += valor;
      } else if (cat === 'outros') {
        t.outros += valor;
      } else {
        // sem categoria ainda → considerar como "outros" pra fechar o total,
        // mas também contabilizar para mostrar aviso de pendente.
        t.outros += valor;
        semCategoriaValor += valor;
        semCategoriaQtd += 1;
      }
    });
    return { ...t, semCategoriaValor, semCategoriaQtd };
  }, [isAutosystem, vendasAutosystem, mapaGruposAutosystem]);

  // Produtos vendidos agregados (apenas Autosystem) — usado na tabela detalhada
  const produtosVendidosAS = useMemo(() => {
    if (!isAutosystem) return [];
    const m = new Map();
    vendasAutosystem.forEach(v => {
      const k = v.produto_codigo;
      if (!m.has(k)) {
        const grupoCod = v.grupo_produto_codigo != null ? Number(v.grupo_produto_codigo) : null;
        const cat = grupoCod != null ? (mapaGruposAutosystem.get(grupoCod) || null) : null;
        m.set(k, {
          codigo: v.produto_codigo,
          nome: v.produto_nome || `Produto #${v.produto_codigo}`,
          categoria: cat,
          quantidade: 0,
          valor: 0,
          itens: 0,
        });
      }
      const p = m.get(k);
      p.quantidade += Number(v.quantidade) || 0;
      p.valor += Number(v.valor) || 0;
      p.itens += 1;
    });
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor);
  }, [isAutosystem, vendasAutosystem, mapaGruposAutosystem]);

  const totalCategoriaAS = totaisPorCategoriaAS.combustivel + totaisPorCategoriaAS.automotivos
    + totaisPorCategoriaAS.conveniencia + totaisPorCategoriaAS.outros;

  // Total das outras entradas (não-venda) somado globalmente.
  const totalOutrasEntradasAS = useMemo(() => {
    if (!isAutosystem) return 0;
    return outrasEntradasAutosystem.reduce((s, e) => s + (Number(e.valor) || 0), 0);
  }, [isAutosystem, outrasEntradasAutosystem]);

  // Detalhamento por conta_creditar para o modal de outras entradas.
  const outrasEntradasPorContaAS = useMemo(() => {
    if (!isAutosystem) return [];
    const m = new Map();
    outrasEntradasAutosystem.forEach(e => {
      const codigo = e.conta_creditar ? String(e.conta_creditar) : 'sem-conta';
      const atual = m.get(codigo) || {
        codigo,
        nome: mapaNomesContasAutosystem.get(codigo) || '—',
        valor: 0,
        qtd: 0,
      };
      atual.valor += Number(e.valor) || 0;
      atual.qtd += 1;
      m.set(codigo, atual);
    });
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor);
  }, [isAutosystem, outrasEntradasAutosystem, mapaNomesContasAutosystem]);

  // Total Entradas = vendas (totalCategoriaAS) + outras entradas
  const totalEntradasAS = totalCategoriaAS + totalOutrasEntradasAS;

  // Totais por forma de recebimento (Autosystem).
  // Cruza `recebimento.modo_recebimento` (= movto.conta_debitar) com
  // as_rede_conta_categoria para classificar.
  const totaisPorFormaAS = useMemo(() => {
    const t = {
      dinheiro: 0, cartao_pix: 0, cheque: 0, a_prazo: 0, outros: 0,
      sobra_caixa: 0, falta_caixa: 0,             // separados, fora do total
      sobra_caixa_qtd: 0, falta_caixa_qtd: 0,
    };
    let semCategoriaValor = 0, semCategoriaQtd = 0;
    const semCategoriaPorConta = new Map(); // codigo → { valor, qtd }
    if (!isAutosystem) return { ...t, semCategoriaValor, semCategoriaQtd, semCategoriaPorConta };

    recebimentosAutosystem.forEach(r => {
      const valor = Number(r.valor) || 0;

      // Sobra de caixa: lançamento que CREDITA uma conta classificada como sobra
      // (recebida via filtro `contas_creditar_extras` na Edge Function).
      const credito = r.conta_creditar ? String(r.conta_creditar) : null;
      const catCredito = credito ? mapaContasAutosystem.get(credito) : null;
      if (catCredito === 'sobra_caixa') {
        t.sobra_caixa += valor;
        t.sobra_caixa_qtd += 1;
        return;
      }

      // Demais formas: classifica pelo conta_debitar (modo_recebimento).
      const codigo = r.modo_recebimento ? String(r.modo_recebimento) : null;
      const cat = codigo ? mapaContasAutosystem.get(codigo) : null;
      if (cat === 'dinheiro' || cat === 'cartao_pix' || cat === 'cheque' || cat === 'a_prazo') {
        t[cat] += valor;
      } else if (cat === 'sobra_caixa') {
        // (redundância) caso uma sobra apareça também pelo conta_debitar
        t.sobra_caixa += valor;
        t.sobra_caixa_qtd += 1;
      } else if (cat === 'falta_caixa') {
        t.falta_caixa += valor;
        t.falta_caixa_qtd += 1;
      } else if (cat === 'outros') {
        t.outros += valor;
      } else {
        // Conta não classificada ainda → conta como "outros" e marca pendência
        t.outros += valor;
        semCategoriaValor += valor;
        semCategoriaQtd += 1;
        const chave = codigo || 'sem-conta';
        const atual = semCategoriaPorConta.get(chave) || {
          codigo: chave,
          nome: mapaNomesContasAutosystem.get(chave) || '—',
          valor: 0,
          qtd: 0,
        };
        atual.valor += valor;
        atual.qtd += 1;
        semCategoriaPorConta.set(chave, atual);
      }
    });
    return { ...t, semCategoriaValor, semCategoriaQtd, semCategoriaPorConta };
  }, [isAutosystem, recebimentosAutosystem, mapaContasAutosystem, mapaNomesContasAutosystem]);

  // Sobra / Falta de caixa NÃO entram no total de formas de recebimento —
  // são exibidas em uma seção própria abaixo do painel.
  const totalFormaAS = totaisPorFormaAS.dinheiro + totaisPorFormaAS.cartao_pix
    + totaisPorFormaAS.cheque + totaisPorFormaAS.a_prazo + totaisPorFormaAS.outros;

  // Agrega vendas e recebimentos por funcionário.
  // A chave canônica é `pessoa.grid`:
  //   - vendas:       vendedor_pessoa_id = lancto.vendedor (== pessoa.grid)
  //   - recebimentos: usuario_pessoa_id  = usuario.pessoa  (== pessoa.grid)
  // Quando faltar pessoa_id, cai no nome bruto como fallback.
  const funcionariosAS = useMemo(() => {
    if (!isAutosystem) return [];
    const map = new Map();
    const getOuCriar = (chave, nome) => {
      if (!map.has(chave)) {
        map.set(chave, {
          chave,
          nome: nome || '—',
          vendas: { combustivel: 0, automotivos: 0, conveniencia: 0, outros: 0, total: 0 },
          outras_entradas: 0,
          entradas_total: 0,
          recebimentos: { dinheiro: 0, cartao_pix: 0, cheque: 0, a_prazo: 0, outros: 0, total: 0 },
          sobra_caixa: 0,
          falta_caixa: 0,
        });
      } else if ((!map.get(chave).nome || map.get(chave).nome === '—') && nome) {
        // Atualiza o nome se foi descoberto numa entrada subsequente
        map.get(chave).nome = nome;
      }
      return map.get(chave);
    };
    const chaveDe = (pessoaId, nomeBruto) => {
      if (pessoaId != null && pessoaId !== '') return `p:${pessoaId}`;
      const n = (nomeBruto || '').toString().trim();
      return n ? `n:${n.toLowerCase()}` : 'sem-id';
    };

    vendasAutosystem.forEach(v => {
      const pessoaId = v.vendedor_pessoa_id != null ? v.vendedor_pessoa_id : null;
      const nome = (v.vendedor_nome && v.vendedor_nome.trim())
        || (v.vendedor || '').toString().trim()
        || 'Sem identificação';
      const f = getOuCriar(chaveDe(pessoaId, nome), nome);
      const valor = Number(v.valor) || 0;
      const grupoCod = v.grupo_produto_codigo != null ? Number(v.grupo_produto_codigo) : null;
      const cat = grupoCod != null ? (mapaGruposAutosystem.get(grupoCod) || null) : null;
      if (cat === 'combustivel' || cat === 'automotivos' || cat === 'conveniencia') {
        f.vendas[cat] += valor;
      } else {
        f.vendas.outros += valor;
      }
      f.vendas.total += valor;
      f.entradas_total += valor;
    });

    // Outras entradas (não-venda): conta_debitar 1.1.2% e conta_creditar não inicia com 4.1
    (outrasEntradasAutosystem || []).forEach(e => {
      const pessoaId = e.usuario_pessoa_id != null ? e.usuario_pessoa_id : null;
      const nome = (e.usuario_nome && e.usuario_nome.trim())
        || (e.usuario || '').toString().trim()
        || 'Sem identificação';
      const f = getOuCriar(chaveDe(pessoaId, nome), nome);
      const valor = Number(e.valor) || 0;
      f.outras_entradas += valor;
      f.entradas_total += valor;
    });

    recebimentosAutosystem.forEach(r => {
      const pessoaId = r.usuario_pessoa_id != null ? r.usuario_pessoa_id : null;
      const nome = (r.usuario_nome && r.usuario_nome.trim())
        || (r.usuario || '').toString().trim()
        || 'Sem identificação';
      const f = getOuCriar(chaveDe(pessoaId, nome), nome);
      const valor = Number(r.valor) || 0;

      // Sobra de caixa: lançamento que credita conta classificada como sobra
      const credito = r.conta_creditar ? String(r.conta_creditar) : null;
      const catCredito = credito ? mapaContasAutosystem.get(credito) : null;
      if (catCredito === 'sobra_caixa') {
        f.sobra_caixa += valor;
        return;
      }

      const codigo = r.modo_recebimento ? String(r.modo_recebimento) : null;
      const cat = codigo ? mapaContasAutosystem.get(codigo) : null;
      if (cat === 'dinheiro' || cat === 'cartao_pix' || cat === 'cheque' || cat === 'a_prazo') {
        f.recebimentos[cat] += valor;
        f.recebimentos.total += valor;
      } else if (cat === 'sobra_caixa') {
        f.sobra_caixa += valor;
      } else if (cat === 'falta_caixa') {
        f.falta_caixa += valor;
      } else {
        f.recebimentos.outros += valor;
        f.recebimentos.total += valor;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.entradas_total - a.entradas_total);
  }, [isAutosystem, vendasAutosystem, recebimentosAutosystem, outrasEntradasAutosystem, mapaGruposAutosystem, mapaContasAutosystem]);

  // Ajustes (acréscimos / descontos) Autosystem.
  // Convenção: lancto.valor_desconto > 0 => acréscimo, < 0 => desconto.
  // Devoluções (operacao = 'DC') já são excluídas pela Edge Function de vendas.
  const ajustesAutosystem = useMemo(() => {
    let acrescimos = 0, descontos = 0;
    let itensComAcrescimo = 0, itensComDesconto = 0;
    if (!isAutosystem) return { acrescimos, descontos, itensComAcrescimo, itensComDesconto };
    vendasAutosystem.forEach(v => {
      const vd = Number(v.valor_desconto || 0);
      if (vd > 0) { acrescimos += vd; itensComAcrescimo += 1; }
      else if (vd < 0) { descontos += Math.abs(vd); itensComDesconto += 1; }
    });
    return { acrescimos, descontos, itensComAcrescimo, itensComDesconto };
  }, [isAutosystem, vendasAutosystem]);

  // Totais de acrescimos e descontos do dia (apenas itens de vendas aprovadas)
  const ajustesItens = useMemo(() => {
    let acrescimos = 0, descontos = 0, itensComAcrescimo = 0, itensComDesconto = 0;
    vendaItens.forEach(item => {
      if (!vendasAprovadasSet.has(item.vendaCodigo)) return;
      const acr = Number(item.totalAcrescimo || 0);
      const desc = Number(item.totalDesconto || 0);
      if (acr > 0) { acrescimos += acr; itensComAcrescimo += 1; }
      if (desc > 0) { descontos += desc; itensComDesconto += 1; }
    });
    return { acrescimos, descontos, itensComAcrescimo, itensComDesconto };
  }, [vendaItens, vendasAprovadasSet]);

  // Recebido por forma de pagamento (reutiliza classificarForma)
  const totaisPorForma = useMemo(() => {
    const t = { dinheiro: 0, cartao: 0, cheque: 0, outros: 0 };
    const vendasCanceladas = new Set();
    vendas.forEach(v => { if (v.cancelada === 'S') vendasCanceladas.add(v.vendaCodigo || v.codigo); });
    formasPagamento.forEach(fp => {
      if (vendasCanceladas.has(fp.vendaCodigo)) return;
      const cat = classificarForma(fp.nomeFormaPagamento);
      t[cat] = (t[cat] || 0) + Number(fp.valorPagamento || 0);
    });
    return t;
  }, [formasPagamento, vendas]);

  const totalCategoria = totaisPorCategoria.combustivel + totaisPorCategoria.automotivos
    + totaisPorCategoria.conveniencia + totaisPorCategoria.outros;
  const totalForma = totaisPorForma.dinheiro + totaisPorForma.cartao
    + totaisPorForma.cheque + totaisPorForma.outros;

  // Mapa vendaCodigo -> funcionarioCodigo + caixaCodigo (para linkar pagamento -> funcionario)
  const vendaMeta = useMemo(() => {
    const m = new Map();
    vendas.forEach(v => {
      if (v.cancelada === 'S') return;
      const vc = v.vendaCodigo || v.codigo;
      m.set(vc, { funcionarioCodigo: v.funcionarioCodigo, caixaCodigo: v.caixaCodigo });
    });
    return m;
  }, [vendas]);

  // Vendas agrupadas por caixa + detalhe por funcionario, com breakdown por forma de pagamento
  const vendasPorCaixa = useMemo(() => {
    const m = new Map();
    const novaAgg = () => ({
      totalVendas: 0, totalRecebido: 0, qtdVendas: 0,
      apurDinheiro: 0, apurCartao: 0, apurCheque: 0, apurOutros: 0,
    });
    // init por venda (agrega total venda + zera recebido, preenchido depois)
    vendas.forEach(v => {
      if (v.cancelada === 'S') return;
      const cx = v.caixaCodigo;
      if (!cx) return;
      const atual = m.get(cx) || { ...novaAgg(), vendedores: new Map() };
      atual.totalVendas += Number(v.totalVenda || 0);
      atual.qtdVendas += 1;
      const fcod = v.funcionarioCodigo;
      if (fcod) {
        const vend = atual.vendedores.get(fcod) || { funcionarioCodigo: fcod, ...novaAgg() };
        vend.totalVendas += Number(v.totalVenda || 0);
        vend.qtdVendas += 1;
        atual.vendedores.set(fcod, vend);
      }
      m.set(cx, atual);
    });
    // Agora adiciona forma de pagamento (apurado por tipo)
    formasPagamento.forEach(fp => {
      const meta = vendaMeta.get(fp.vendaCodigo);
      if (!meta || !meta.caixaCodigo) return;
      const valor = Number(fp.valorPagamento || 0);
      const cat = classificarForma(fp.nomeFormaPagamento);
      const chaveCat = { dinheiro: 'apurDinheiro', cartao: 'apurCartao', cheque: 'apurCheque', outros: 'apurOutros' }[cat];
      const caixa = m.get(meta.caixaCodigo);
      if (!caixa) return;
      caixa.totalRecebido += valor;
      caixa[chaveCat] += valor;
      if (meta.funcionarioCodigo) {
        const vend = caixa.vendedores.get(meta.funcionarioCodigo);
        if (vend) {
          vend.totalRecebido += valor;
          vend[chaveCat] += valor;
        }
      }
    });
    return m;
  }, [vendas, formasPagamento, vendaMeta]);

  // Indexa apresentado por caixaCodigo (dados do fechamento real, agregado por turno)
  const apresentadoPorCaixa = useMemo(() => {
    const m = new Map();
    caixasApresentados.forEach(ca => {
      const totalApresentado = (ca.dinheiroApresentado || 0) + (ca.cartaoApresentado || 0) + (ca.chequeApresentado || 0)
        + (ca.chequePreApresentado || 0) + (ca.cartaFreteApresentado || 0) + (ca.valeClienteApresentado || 0)
        + (ca.emprestimoApresentado || 0) + (ca.prePagApresentado || 0) + (ca.valeFunApresentado || 0)
        + (ca.chequePagarApresentado || 0) + (ca.transfBancApresentado || 0) + (ca.transfDebApresentado || 0)
        + (ca.fundoCxDebApresentado || 0) + (ca.notaPrazoApresentado || 0) + (ca.despesaApresentado || 0);
      const totalApurado = (ca.dinheiroApurado || 0) + (ca.cartaoApurado || 0) + (ca.chequeApurado || 0)
        + (ca.chequePreApurado || 0) + (ca.cartaFreteApurado || 0) + (ca.valeClienteApurado || 0)
        + (ca.emprestimoApurado || 0) + (ca.prePagApurado || 0) + (ca.valeFunApurado || 0)
        + (ca.chequePagarApurado || 0) + (ca.transfBancApurado || 0) + (ca.transfDebApurado || 0)
        + (ca.fundoCxDebApurado || 0) + (ca.notaPrazoApurado || 0) + (ca.despesaApurado || 0);
      m.set(ca.caixaCodigo, {
        dinheiroApresentado: Number(ca.dinheiroApresentado || 0),
        dinheiroApurado: Number(ca.dinheiroApurado || 0),
        dinheiroDiferenca: Number(ca.dinheiroDiferenca || 0),
        cartaoApresentado: Number(ca.cartaoApresentado || 0),
        cartaoApurado: Number(ca.cartaoApurado || 0),
        cartaoDiferenca: Number(ca.cartaoDiferenca || 0),
        chequeApresentado: Number(ca.chequeApresentado || 0),
        chequeApurado: Number(ca.chequeApurado || 0),
        chequeDiferenca: Number(ca.chequeDiferenca || 0),
        totalApresentado,
        totalApurado,
        totalDiferenca: totalApresentado - totalApurado,
      });
    });
    return m;
  }, [caixasApresentados]);

  // Lista de caixas (turnos) enriquecida com vendas + apresentado/apurado + lista de vendedores
  const caixasEnriquecidos = useMemo(() => {
    return caixas.map(c => {
      const v = vendasPorCaixa.get(c.caixaCodigo) || {
        totalVendas: 0, totalRecebido: 0, qtdVendas: 0,
        apurDinheiro: 0, apurCartao: 0, apurCheque: 0, apurOutros: 0,
        vendedores: new Map(),
      };
      const ap = apresentadoPorCaixa.get(c.caixaCodigo) || null;
      const funcResp = mapaFuncionarios.get(c.funcionarioCodigo);
      const vendedores = Array.from(v.vendedores.values())
        .map(item => {
          const f = mapaFuncionarios.get(item.funcionarioCodigo);
          return {
            ...item,
            nome: f?.nome || `Funcionário #${item.funcionarioCodigo}`,
            numeroReferencia: f?.numeroReferencia || '',
          };
        })
        .sort((a, b) => b.totalVendas - a.totalVendas);
      return {
        caixaCodigo: c.caixaCodigo,
        turno: c.turno,
        turnoCodigo: c.turnoCodigo,
        funcionarioCodigo: c.funcionarioCodigo,
        funcionarioNome: funcResp?.nome || `Funcionário #${c.funcionarioCodigo}`,
        funcionarioReferencia: funcResp?.numeroReferencia || '',
        abertura: c.abertura,
        fechamento: c.fechamento,
        totalVendas: v.totalVendas,
        totalRecebido: v.totalRecebido,
        qtdVendas: v.qtdVendas,
        qtdVendedores: v.vendedores.size,
        vendedores,
        apresentado: ap,
        apuradoApi: Number(c.apurado || 0),
        diferencaApi: Number(c.diferenca || 0),
        fechado: c.fechado,
      };
    }).sort((a, b) => (a.turnoCodigo || 0) - (b.turnoCodigo || 0));
  }, [caixas, vendasPorCaixa, apresentadoPorCaixa, mapaFuncionarios]);

  const toggleCaixa = (cx) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(cx) ? next.delete(cx) : next.add(cx);
      return next;
    });
  };

  const totais = useMemo(() => {
    let vendasTotal = 0, apresentadoTotal = 0, apuradoTotal = 0;
    caixasEnriquecidos.forEach(c => {
      vendasTotal += c.totalVendas;
      apresentadoTotal += c.apresentado?.totalApresentado || 0;
      apuradoTotal += c.apresentado?.totalApurado || c.totalRecebido;
    });
    return { vendasTotal, apresentadoTotal, apuradoTotal, diferencaTotal: apresentadoTotal - apuradoTotal };
  }, [caixasEnriquecidos]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }

  const redeAtual = redeId ? chavesApi.find(ch => ch.id === redeId) : null;

  return (
    <div>
      <PrintStyles />

      <div className="no-print">
        <PageHeader
          title={modoCliente ? 'Fechamento de Caixas' : 'Conciliação de Caixas'}
          description={modoCliente
            ? 'Relatório do dia com vendas, formas de pagamento e caixas apresentados'
            : 'Compara vendas com o total recebido em formas de pagamento por funcionário para apontar sobras/faltas'}
        >
          <div className="flex items-center gap-2">
            {!modoCliente && carregado && statusConciliacao?.concluida && (
              <button
                onClick={async () => {
                  try {
                    setSalvandoStatus(true);
                    const s = await bpoConciliacaoService.reabrir(cliente.id, data);
                    setStatusConciliacao(s);
                  } catch (err) { setError(err.message); }
                  finally { setSalvandoStatus(false); }
                }}
                disabled={salvandoStatus}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Lock className="h-4 w-4" /> Reabrir
              </button>
            )}
            {!modoCliente && carregado && !statusConciliacao?.concluida && (
              <button
                onClick={async () => {
                  try {
                    setSalvandoStatus(true);
                    const s = await bpoConciliacaoService.marcarConcluida(cliente.id, data, { por: usuarioLogado });
                    setStatusConciliacao(s);
                  } catch (err) { setError(err.message); }
                  finally { setSalvandoStatus(false); }
                }}
                disabled={salvandoStatus}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
              >
                {salvandoStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Marcar como concluído
              </button>
            )}
            {carregado && (
              <button onClick={() => window.print()}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <Printer className="h-4 w-4" /> Gerar PDF
              </button>
            )}
          </div>
        </PageHeader>
      </div>

      {/* Cabecalho visivel apenas na impressao */}
      {carregado && cliente && (
        <PrintHeader cliente={cliente} rede={redeAtual} data={data} />
      )}

      {/* Seletor rede + empresa + data (admin) / apenas data (cliente) */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-4 shadow-sm no-print">
      {modoCliente ? (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
          <div className="flex items-center gap-3 h-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex-shrink-0">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Empresa</p>
              <p className="text-sm font-semibold text-gray-900 truncate">{cliente?.nome || '—'}</p>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <button onClick={carregar} disabled={!cliente || loadingDados || (requerConciliacaoConcluida && !statusConciliacao?.concluida)}
            className="flex items-center gap-2 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_180px_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">1. Rede</label>
            <SeletorRedeBPO
              chavesApi={chavesApi}
              redesAutosystem={redesAutosystem}
              contagensPorRede={contagensPorRede}
              value={redeSel}
              onChange={setRedeSel}
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">2. Empresa</label>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}
              disabled={!redeSel}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400">
              <option value="">{redeSel ? 'Selecione uma empresa...' : 'Escolha a rede primeiro'}</option>
              {empresasDaRede.map(c => (
                <option key={c.id} value={c.id}>{c.nome}{c.cnpj ? ` (${c.cnpj})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <button onClick={carregar} disabled={!cliente || loadingDados}
            className="flex items-center gap-2 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Carregar
          </button>
        </div>
      )}
      </div>

      {/* Badge de status da conciliacao (admin + cliente) */}
      {cliente && statusConciliacao?.concluida && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 flex items-center gap-3 no-print">
          <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex-1 text-[12px] text-emerald-800">
            <p className="font-semibold">Conciliação concluída</p>
            <p className="text-[11px] text-emerald-700/80">
              Marcada em <strong>{new Date(statusConciliacao.concluida_em).toLocaleString('pt-BR')}</strong>
              {statusConciliacao.concluida_por && <> por <strong>{statusConciliacao.concluida_por}</strong></>}
            </p>
          </div>
        </div>
      )}

      {/* Gate: cliente so ve quando conciliacao esta concluida */}
      {modoCliente && requerConciliacaoConcluida && !statusConciliacao?.concluida && (
        <div className="bg-white rounded-2xl border border-amber-200 px-6 py-12 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-7 w-7 text-amber-600" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Relatório ainda não disponível</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            A conciliação do dia <strong>{formatDataBR(data)}</strong> ainda não foi concluída pelo responsavel do BPO.
            O relatório ficara visivel aqui assim que a equipe finalizar a conferência do caixa.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Se cliente-mode + gate bloqueado, ja mostramos o lock acima e nao renderizamos o resto */}
      {(modoCliente && requerConciliacaoConcluida && !statusConciliacao?.concluida) ? null : !cliente ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
            <Coins className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Selecione a rede, a empresa e a data</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">Escolha primeiro a rede e em seguida a empresa dentro dela.</p>
        </div>
      ) : loadingDados ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <Loader2 className="h-7 w-7 text-emerald-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800">Buscando caixas e vendas de {formatDataBR(data)}...</p>
        </div>
      ) : carregado && isAutosystem ? (
        <PainelAutosystem
          data={data}
          fechamentoSangria={fechamentoSangria}
          vendas={vendasAutosystem}
          produtos={produtosVendidosAS}
          totais={totaisPorCategoriaAS}
          totalGeral={totalCategoriaAS}
          totalOutrasEntradas={totalOutrasEntradasAS}
          totalEntradas={totalEntradasAS}
          outrasEntradasPorConta={outrasEntradasPorContaAS}
          recebimentos={recebimentosAutosystem}
          totaisForma={totaisPorFormaAS}
          totalForma={totalFormaAS}
          ajustes={ajustesAutosystem}
          funcionarios={funcionariosAS}
        />
      ) : !carregado ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
            <Calendar className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Clique em "Carregar" para comecar</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">Buscaremos todos os caixas fechados e as vendas do dia <strong>{formatDataBR(data)}</strong>.</p>
        </div>
      ) : caixasEnriquecidos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Nenhum caixa encontrado em {formatDataBR(data)}.</p>
        </div>
      ) : (
        <>
          {/* Status da sangria conferida pelo cliente */}
          {fechamentoSangria ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/40 dark:bg-none dark:bg-emerald-500/10 p-3 flex items-center gap-3 print-no-break">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-900">Sangria conferida pelo cliente</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Fechado em <strong>{new Date(fechamentoSangria.confirmado_em).toLocaleString('pt-BR')}</strong>
                  {fechamentoSangria.confirmado_por && <> por <strong>{fechamentoSangria.confirmado_por}</strong></>}
                  {' · '}{(fechamentoSangria.registros || []).length} funcionário(s)
                </p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Total contado</p>
                <p className="text-sm font-mono font-semibold text-emerald-800 tabular-nums">
                  {formatCurrency(Number(fechamentoSangria.total_apresentado || 0))}
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-500/10 p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">Sangria ainda não conferida</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  O responsavel do cliente ainda não registrou a contagem de dinheiro deste dia no portal.
                  As colunas Dinh. Contado aparecerao quando o fechamento for confirmado.
                </p>
              </div>
            </div>
          )}

          <div className="print-section-title">Resumo do movimento</div>

          {/* Breakdown por categoria (esquerda) + por forma de pagamento (direita) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5 print-no-break print-grid-2">
            {/* Vendas por categoria de produto */}
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-800">Vendas por categoria</h3>
                </div>
                <span className="text-[11px] text-gray-400">{(vendaItens || []).length} itens</span>
              </div>
              <div className="divide-y divide-gray-100 flex-1">
                <LinhaBreakdown icon={Fuel} iconColor="text-amber-600" iconBg="bg-amber-50" barHex="#f59e0b"
                  label="Combustíveis" valor={totaisPorCategoria.combustivel} total={totalCategoria} />
                <LinhaBreakdown icon={Wrench} iconColor="text-slate-600" iconBg="bg-slate-100 dark:bg-slate-500/25" barHex="#64748b"
                  label="Produtos automotivos" valor={totaisPorCategoria.automotivos} total={totalCategoria} />
                <LinhaBreakdown icon={ShoppingBag} iconColor="text-emerald-600" iconBg="bg-emerald-50" barHex="#10b981"
                  label="Conveniência" valor={totaisPorCategoria.conveniencia} total={totalCategoria} />
                {totaisPorCategoria.outros > 0 && (
                  <LinhaBreakdown icon={MoreHorizontal} iconColor="text-gray-500" iconBg="bg-gray-100 dark:bg-gray-500/25" barHex="#6b7280"
                    label="Outros (não classificados)" valor={totaisPorCategoria.outros} total={totalCategoria} />
                )}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</span>
                <span className="text-sm font-mono font-bold text-gray-900 tabular-nums">{formatCurrency(totalCategoria)}</span>
              </div>
            </div>

            {/* Recebido por forma de pagamento */}
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-800">Recebido por forma de pagamento</h3>
                </div>
                <span className="text-[11px] text-gray-400">{(formasPagamento || []).length} registros</span>
              </div>
              <div className="divide-y divide-gray-100 flex-1">
                <LinhaBreakdown icon={Banknote} iconColor="text-emerald-600" iconBg="bg-emerald-50" barHex="#10b981"
                  label="Dinheiro" valor={totaisPorForma.dinheiro} total={totalForma} />
                <LinhaBreakdown icon={CreditCard} iconColor="text-blue-600" iconBg="bg-blue-50" barHex="#14b8a6"
                  label="Cartão / PIX" valor={totaisPorForma.cartao} total={totalForma} />
                <LinhaBreakdown icon={FileText} iconColor="text-blue-600" iconBg="bg-blue-50" barHex="#8b5cf6"
                  label="Cheque" valor={totaisPorForma.cheque} total={totalForma} />
                {totaisPorForma.outros > 0 && (
                  <LinhaBreakdown icon={MoreHorizontal} iconColor="text-gray-500" iconBg="bg-gray-100 dark:bg-gray-500/25" barHex="#6b7280"
                    label="Outros" valor={totaisPorForma.outros} total={totalForma} />
                )}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Total recebido</span>
                <span className="text-sm font-mono font-bold text-gray-900 tabular-nums">{formatCurrency(totalForma)}</span>
              </div>
            </div>
          </div>

          {/* Acrescimos e Descontos do dia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 print-no-break print-grid-2">
            <AjusteCard
              label="Acréscimos aplicados"
              valor={ajustesItens.acrescimos}
              qtd={ajustesItens.itensComAcrescimo}
              icon={PlusCircle}
              accent="emerald"
              prefixo="+"
            />
            <AjusteCard
              label="Descontos concedidos"
              valor={ajustesItens.descontos}
              qtd={ajustesItens.itensComDesconto}
              icon={MinusCircle}
              accent="red"
              prefixo="-"
            />
          </div>

          <div className="print-section-title">Indicadores do dia</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5 print-no-break print-grid-4">
            <ResumoCard label="Caixas/Turnos" valor={caixasEnriquecidos.length} icon={Clock} color="blue" />
            <ResumoCard label="Apresentado (turno)" valor={formatCurrency(totais.apresentadoTotal)} icon={TrendingUp} color="blue" />
            <ResumoCard label="Apurado (turno)" valor={formatCurrency(totais.apuradoTotal)} icon={CheckCircle2} color="emerald" />
            <ResumoCard label="Diferença (turno)"
              valor={formatCurrency(totais.diferencaTotal)}
              icon={Math.abs(totais.diferencaTotal) < 0.01 ? CheckCircle2 : totais.diferencaTotal > 0 ? TrendingUp : TrendingDown}
              color={Math.abs(totais.diferencaTotal) < 0.01 ? 'emerald' : totais.diferencaTotal > 0 ? 'amber' : 'red'} />
          </div>

          {/* Vendas canceladas */}
          <div className="print-section-title">Vendas canceladas</div>
          <VendasCanceladas vendas={vendasCanceladas} mapaFuncionarios={mapaFuncionarios} caixas={caixas}
            clientesQuality={clientesQuality}
            aberto={mostrarCanceladas} onToggle={() => setMostrarCanceladas(!mostrarCanceladas)} />

          <div className="print-section-title">Detalhamento por caixa / turno</div>
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 no-print">
              <Building2 className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-800">{cliente.nome}</h3>
              <span className="text-[11px] text-gray-400">· {formatDataBR(data)}</span>
              {cliente.usa_webposto && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 ml-auto">
                  <Zap className="h-2.5 w-2.5" /> Webposto
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Caixa / Turno</th>
                    <th className="px-4 py-3">Responsavel</th>
                    <th className="px-4 py-3 text-right">Vendedores</th>
                    <th className="px-4 py-3 text-right">Qtd vendas</th>
                    <th className="px-4 py-3 text-right">Apresentado</th>
                    <th className="px-4 py-3 text-right">Apurado</th>
                    <th className="px-4 py-3 text-right">Diferença</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {caixasEnriquecidos.map(c => {
                    const apresentado = c.apresentado?.totalApresentado || 0;
                    const apurado = c.apresentado?.totalApurado || c.totalRecebido;
                    const diff = apresentado - apurado;
                    const conciliado = Math.abs(diff) < 0.01;
                    const expanded = expandidos.has(c.caixaCodigo);
                    return (
                      <React.Fragment key={c.caixaCodigo}>
                        <tr onClick={() => toggleCaixa(c.caixaCodigo)}
                          className={`cursor-pointer transition-colors ${expanded ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }} className="no-print">
                                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                              </motion.div>
                              <Clock className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-gray-900">{c.turno || `Turno ${c.turnoCodigo}`}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                                {(c.funcionarioNome || '?').charAt(0)}
                              </div>
                              <div>
                                <p className="text-[12px] font-medium text-gray-900">{c.funcionarioNome}</p>
                                {c.funcionarioReferencia && (
                                  <p className="text-[10px] text-gray-400 font-mono">{c.funcionarioReferencia}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                              <UserRound className="h-3 w-3 text-gray-400" /> {c.qtdVendedores}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm text-gray-600 tabular-nums">{c.qtdVendas}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-900 tabular-nums">{formatCurrency(apresentado)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-900 tabular-nums">{formatCurrency(apurado)}</td>
                          <td className={`px-4 py-2.5 text-right font-mono text-sm tabular-nums font-semibold ${
                            conciliado ? 'text-emerald-600'
                              : diff > 0 ? 'text-amber-600'
                              : 'text-red-600'
                          }`}>
                            {formatCurrency(diff)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {conciliado ? (
                              <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Conciliado
                              </span>
                            ) : diff > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
                                <TrendingUp className="h-2.5 w-2.5" /> Sobra
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-red-50 text-red-700 border border-red-200">
                                <TrendingDown className="h-2.5 w-2.5" /> Falta
                              </span>
                            )}
                          </td>
                        </tr>
                        {/* Linhas expandidas: apurado detalhado por vendedor + ref turno */}
                        {c.vendedores.length > 0 && (
                          <tr className={`bg-gray-50/50 print-detalhe ${expanded ? '' : 'hidden print-show-table-row'}`}>
                            <td colSpan={8} className="px-0 py-0">
                              <div className="px-6 py-3">
                                {/* Ref turno */}
                                {c.apresentado && (
                                  <div className="mb-3 p-2 rounded-lg bg-blue-50/40 border border-blue-100/60 dark:border-blue-400/25">
                                    <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider mb-1">Apresentado do turno (agregado)</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                      <DetalheTurno label="Dinheiro" apr={c.apresentado.dinheiroApresentado} apu={c.apresentado.dinheiroApurado} diff={c.apresentado.dinheiroDiferenca} />
                                      <DetalheTurno label="Cartão" apr={c.apresentado.cartaoApresentado} apu={c.apresentado.cartaoApurado} diff={c.apresentado.cartaoDiferenca} />
                                      <DetalheTurno label="Cheque" apr={c.apresentado.chequeApresentado} apu={c.apresentado.chequeApurado} diff={c.apresentado.chequeDiferenca} />
                                      <DetalheTurno label="Total" apr={c.apresentado.totalApresentado} apu={c.apresentado.totalApurado} diff={c.apresentado.totalDiferenca} bold />
                                    </div>
                                  </div>
                                )}

                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                  Apurado por vendedor ({c.vendedores.length}) · dinheiro contado vem do fechamento salvo pelo cliente
                                </p>
                                <table className="w-full text-[12px]">
                                  <thead>
                                    <tr className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                                      <th className="text-left py-1.5 pr-2">Funcionário</th>
                                      <th className="text-right py-1.5 pr-2">Qtd</th>
                                      <th className="text-right py-1.5 pr-2">Vendas</th>
                                      <th className="text-right py-1.5 pr-2">Dinh. Apurado</th>
                                      <th className="text-right py-1.5 pr-2">Cartão</th>
                                      <th className="text-right py-1.5 pr-2">Cheque</th>
                                      <th className="text-right py-1.5 pr-2">Outros</th>
                                      <th className="text-right py-1.5 pr-2">Dinh. Contado</th>
                                      <th className="text-right py-1.5 pr-2">Diferença</th>
                                      <th className="text-center py-1.5 pr-2">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100/70 dark:divide-slate-700/50">
                                    {c.vendedores.map(v => {
                                      const aprNum = dinheiroContadoPorFunc.get(v.funcionarioCodigo);
                                      const temApr = aprNum != null && fechamentoSangria != null;
                                      const diff = temApr ? aprNum - v.apurDinheiro : null;
                                      const conciliado = diff != null && Math.abs(diff) < 0.01;
                                      return (
                                        <tr key={v.funcionarioCodigo}>
                                          <td className="py-1.5 pr-2">
                                            <div className="flex items-center gap-2">
                                              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0">
                                                {(v.nome || '?').charAt(0)}
                                              </div>
                                              <div>
                                                <p className="text-[12px] text-gray-800">{v.nome}</p>
                                                {v.numeroReferencia && (
                                                  <p className="text-[9px] text-gray-400 font-mono">{v.numeroReferencia}</p>
                                                )}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="text-right py-1.5 pr-2 font-mono text-gray-600 tabular-nums">{v.qtdVendas}</td>
                                          <td className="text-right py-1.5 pr-2 font-mono text-gray-900 tabular-nums">{formatCurrency(v.totalVendas)}</td>
                                          <td className="text-right py-1.5 pr-2 font-mono tabular-nums text-emerald-700">{formatCurrency(v.apurDinheiro)}</td>
                                          <td className="text-right py-1.5 pr-2 font-mono tabular-nums text-blue-700">{formatCurrency(v.apurCartao)}</td>
                                          <td className="text-right py-1.5 pr-2 font-mono tabular-nums text-blue-700">{formatCurrency(v.apurCheque)}</td>
                                          <td className="text-right py-1.5 pr-2 font-mono tabular-nums text-gray-600">{formatCurrency(v.apurOutros)}</td>
                                          <td className="text-right py-1.5 pr-2 font-mono tabular-nums text-emerald-700">
                                            {temApr ? formatCurrency(aprNum) : <span className="text-gray-300">—</span>}
                                          </td>
                                          <td className={`text-right py-1.5 pr-2 font-mono tabular-nums font-semibold ${
                                            !temApr ? 'text-gray-300'
                                              : conciliado ? 'text-emerald-600'
                                              : diff > 0 ? 'text-amber-600'
                                              : 'text-red-600'
                                          }`}>
                                            {temApr ? formatCurrency(diff) : '—'}
                                          </td>
                                          <td className="text-center py-1.5 pr-2">
                                            {!temApr ? (
                                              <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-gray-100 text-gray-500">Aguardando</span>
                                            ) : conciliado ? (
                                              <span className="inline-flex items-center gap-1 text-[9px] rounded-full px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                <CheckCircle2 className="h-2 w-2" /> OK
                                              </span>
                                            ) : diff > 0 ? (
                                              <span className="inline-flex items-center gap-1 text-[9px] rounded-full px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
                                                <TrendingUp className="h-2 w-2" /> Sobra
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 text-[9px] rounded-full px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200">
                                                <TrendingDown className="h-2 w-2" /> Falta
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                <p className="text-[10px] text-gray-400 mt-2 italic">
                                  Dinh. Contado vem do fechamento de sangria registrado pelo responsavel no portal do cliente.
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50/60 border-t border-gray-200">
                  <tr className="text-sm font-semibold">
                    <td className="px-4 py-3 text-gray-700" colSpan={2}>Totais</td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">—</td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                      {caixasEnriquecidos.reduce((s, c) => s + c.qtdVendas, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900 tabular-nums">{formatCurrency(totais.apresentadoTotal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900 tabular-nums">{formatCurrency(totais.apuradoTotal)}</td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${
                      Math.abs(totais.diferencaTotal) < 0.01 ? 'text-emerald-600'
                        : totais.diferencaTotal > 0 ? 'text-amber-600'
                        : 'text-red-600'
                    }`}>{formatCurrency(totais.diferencaTotal)}</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ResumoCard({ label, valor, icon: Icon, color }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    red:     'bg-red-50 text-red-600',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{valor}</p>
    </motion.div>
  );
}

function VendasCanceladas({ vendas, mapaFuncionarios, caixas = [], clientesQuality = [], aberto, onToggle }) {
  const total = vendas.reduce((s, v) => s + Number(v.totalVenda || 0), 0);
  const mapaCaixas = new Map();
  (caixas || []).forEach(c => mapaCaixas.set(c.caixaCodigo, c));
  const mapaClientes = new Map();
  (clientesQuality || []).forEach(c => {
    const id = c.clienteCodigo ?? c.codigo ?? c.id ?? c.pessoaCodigo;
    if (id != null) mapaClientes.set(id, c);
  });
  const ordenadas = [...vendas].sort((a, b) => {
    const ha = a.dataHora || a.dataHoraVenda || a.dataVenda || '';
    const hb = b.dataHora || b.dataHoraVenda || b.dataVenda || '';
    return hb.localeCompare(ha);
  });

  if (vendas.length === 0) {
    return (
      <div className="mb-5 rounded-xl border border-gray-200/60 bg-white p-3 flex items-center gap-2 text-xs text-gray-500">
        <XCircle className="h-4 w-4 text-gray-300" />
        Nenhuma venda cancelada no dia.
      </div>
    );
  }

  return (
    <div className="mb-5 bg-white rounded-2xl border border-red-200/60 shadow-sm overflow-hidden print-keep">
      <button onClick={onToggle}
        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-red-50/40 dark:hover:bg-red-500/10 transition-colors text-left">
        <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0">
          <XCircle className="h-4 w-4 text-red-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">Vendas canceladas</p>
          <p className="text-[11px] text-gray-500">
            {vendas.length} venda{vendas.length === 1 ? '' : 's'} · total {formatCurrency(total)}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform no-print ${aberto ? 'rotate-180' : ''}`} />
      </button>

      <div className={`${aberto ? '' : 'hidden print-show'} overflow-x-auto border-t border-gray-100`}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2.5">Nota</th>
                <th className="px-4 py-2.5">Hora</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Funcionário</th>
                <th className="px-4 py-2.5">Caixa</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ordenadas.map(v => {
                const vc = v.vendaCodigo || v.codigo;
                const func = mapaFuncionarios.get(v.funcionarioCodigo);
                const nome = func?.nome || `Funcionário #${v.funcionarioCodigo || '—'}`;
                const referencia = func?.numeroReferencia || '';
                const dh = v.dataHora || v.dataHoraVenda || v.dataVenda || '';
                const hora = formatHora(dh);
                const caixa = mapaCaixas.get(v.caixaCodigo);
                const caixaLabel = caixa?.turno || (v.caixaCodigo ? `Turno ${caixa?.turnoCodigo || v.caixaCodigo}` : '—');
                // Busca no cadastro CLIENTE via clienteCodigo. Prioriza razao social
                // sobre fantasia (Quality usa varios nomes de campo dependendo do tenant).
                const cliQuality = mapaClientes.get(v.clienteCodigo);
                const cpfCnpj = (v.clienteCpfCnpj || '').trim();
                const cpfZerado = /^[0.\-\/\s]+$/.test(cpfCnpj);
                const nomeCliente = cliQuality?.clienteRazaoSocial
                  || cliQuality?.razaoSocial
                  || cliQuality?.nomeRazaoSocial
                  || cliQuality?.clienteNome
                  || cliQuality?.nome
                  || cliQuality?.clienteNomeFantasia
                  || cliQuality?.nomeFantasia
                  || cliQuality?.fantasia
                  || cliQuality?.descricao
                  || (cpfCnpj && !cpfZerado ? cpfCnpj : 'Consumidor final');
                const nota = v.notaNumero || v.numeroNota || v.nota || '—';
                return (
                  <tr key={vc} className="hover:bg-red-50/30">
                    <td className="px-4 py-2 font-mono text-[12px] text-gray-700">{nota}</td>
                    <td className="px-4 py-2 font-mono text-[12px] text-gray-700 tabular-nums">{hora}</td>
                    <td className="px-4 py-2 text-[12px] text-gray-700 truncate max-w-[160px]">{nomeCliente}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0">
                          {(nome || '?').charAt(0)}
                        </div>
                        <div>
                          <p className="text-[12px] text-gray-800">{nome}</p>
                          {referencia && <p className="text-[9px] text-gray-400 font-mono">{referencia}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-[12px] text-gray-700">{caixaLabel}</td>
                    <td className="px-4 py-2 text-right font-mono text-[12px] text-red-600 tabular-nums line-through decoration-red-300">
                      {formatCurrency(Number(v.totalVenda || 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-red-50/40 border-t border-red-200">
              <tr className="text-[12px] font-semibold">
                <td className="px-4 py-2 text-gray-700" colSpan={5}>Total cancelado</td>
                <td className="px-4 py-2 text-right font-mono text-red-700 tabular-nums">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          </table>
      </div>
    </div>
  );
}

function formatHora(s) {
  if (!s) return '—';
  try {
    const iso = String(s).includes('T') ? s : String(s).replace(' ', 'T');
    const d = new Date(iso);
    if (isNaN(d)) return s;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch { return s; }
}

function formatDataHora(s) {
  if (!s) return '—';
  // Aceita 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm:ss' (ou variacoes)
  try {
    if (s.includes('T') || s.includes(' ')) {
      const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
      if (!isNaN(d)) return d.toLocaleString('pt-BR');
    }
    const [y, m, d] = s.split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
  } catch { /* noop */ }
  return s;
}

function AjusteCard({ label, valor, qtd, icon: Icon, accent, prefixo }) {
  const accents = {
    emerald: {
      iconBg: 'bg-emerald-100 dark:bg-emerald-500/20', iconColor: 'text-emerald-600',
      text: 'text-emerald-700', border: 'border-emerald-200/60',
      bg: 'bg-gradient-to-br from-emerald-50/60 to-white dark:bg-none dark:bg-emerald-500/10',
    },
    red: {
      iconBg: 'bg-red-100 dark:bg-red-500/20', iconColor: 'text-red-600',
      text: 'text-red-700', border: 'border-red-200/60',
      bg: 'bg-gradient-to-br from-red-50/60 to-white dark:bg-none dark:bg-red-500/10',
    },
  };
  const a = accents[accent] || accents.emerald;
  return (
    <div className={`rounded-xl border ${a.border} ${a.bg} shadow-sm p-4 flex items-center gap-3`}>
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${a.iconBg}`}>
        <Icon className={`h-5 w-5 ${a.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <p className={`text-xl font-mono font-bold tabular-nums mt-0.5 ${a.text}`}>
          {prefixo}{formatCurrency(valor)}
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {qtd} {qtd === 1 ? 'item afetado' : 'itens afetados'}
        </p>
      </div>
    </div>
  );
}

function LinhaBreakdown({ icon: Icon, iconColor, iconBg, barHex, label, valor, total, onClick }) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  const conteudo = (
    <>
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm text-gray-800 truncate pt-0.5 flex items-center gap-1">
            {label}
            {onClick && <ChevronRight className="h-3 w-3 text-gray-400" />}
          </p>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-mono font-semibold text-gray-900 tabular-nums leading-tight">
              {formatCurrency(valor)}
            </p>
            <p className="text-[10px] text-gray-400 font-mono tabular-nums leading-tight mt-0.5">
              {pct.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="h-1 bg-gray-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: barHex || '#9ca3af' }} />
        </div>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick}
        className="w-full flex items-start gap-3 px-5 py-2.5 text-left hover:bg-gray-50/80 transition-colors">
        {conteudo}
      </button>
    );
  }
  return <div className="flex items-start gap-3 px-5 py-2.5">{conteudo}</div>;
}

function DetalheTurno({ label, apr, apu, diff, bold }) {
  const conciliado = Math.abs(diff) < 0.01;
  return (
    <div className={`bg-white rounded border border-blue-100/60 dark:border-blue-400/25 px-2 py-1.5 ${bold ? 'ring-1 ring-blue-200 dark:ring-blue-400/40' : ''}`}>
      <p className={`text-[9px] uppercase tracking-wider ${bold ? 'text-blue-700 font-bold' : 'text-gray-500 font-semibold'}`}>{label}</p>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[9px] text-gray-400">Apr.</span>
        <span className="font-mono tabular-nums text-gray-700">{formatCurrency(apr || 0)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-gray-400">Apu.</span>
        <span className="font-mono tabular-nums text-gray-700">{formatCurrency(apu || 0)}</span>
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 mt-0.5 pt-0.5">
        <span className="text-[9px] text-gray-400">Dif.</span>
        <span className={`font-mono tabular-nums font-semibold ${
          conciliado ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-red-600'
        }`}>
          {formatCurrency(diff || 0)}
        </span>
      </div>
    </div>
  );
}

function formatDataBR(d) {
  if (!d) return '—';
  const [y, m, dd] = String(d).split('-');
  if (!y || !m || !dd) return d;
  return `${dd}/${m}/${y}`;
}

// ================== Impressao A4 ==================

function PrintStyles() {
  return (
    <style>{`
      .print-only { display: none; }
      .print-section-title { display: none; }
      @media print {
        @page { size: A4 portrait; margin: 1cm 0.9cm 1.2cm; }

        /* Fundo totalmente branco */
        html, body, #root, main, .app-bg {
          background: white !important;
          background-image: none !important;
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #111; }

        /* Visibilidade */
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        .print-show { display: block !important; }
        .print-show-table-row { display: table-row !important; }
        [aria-hidden="true"] { display: none !important; }
        .app-bg, .app-vignette { background: none !important; }

        /* Layout base: esconde shell do app */
        main { padding: 0 !important; margin-left: 0 !important; }
        aside { display: none !important; }
        header { display: none !important; }

        /* Grids forcadas no A4 */
        .print-grid-2 {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 0.5rem !important;
          align-items: stretch !important;
        }
        .print-grid-4 {
          display: grid !important;
          grid-template-columns: 1fr 1fr 1fr 1fr !important;
          gap: 0.4rem !important;
        }

        /* Tipografia com leading um pouco mais aberto */
        body, p, span, div { font-size: 8pt !important; line-height: 1.4 !important; }
        td, th { font-size: 7.5pt !important; line-height: 1.3 !important; }
        h1 { font-size: 13pt !important; line-height: 1.2 !important; }
        h2 { font-size: 10pt !important; line-height: 1.2 !important; }
        h3 { font-size: 9pt !important; line-height: 1.2 !important; }

        /* Secoes com titulo - respiro generoso antes, compacto depois */
        .print-section-title {
          display: block !important;
          font-size: 8.5pt !important;
          font-weight: 700 !important;
          color: #111 !important;
          margin: 0.75rem 0 0.4rem !important;
          padding: 0.25rem 0.5rem !important;
          background: #e5e7eb !important;
          border-left: 3px solid #1f2937 !important;
          letter-spacing: 0.08em !important;
          text-transform: uppercase !important;
        }
        /* Primeiro titulo nao empurra conteudo */
        .print-section-title:first-of-type { margin-top: 0.35rem !important; }

        /* Cards sem decoracoes pesadas */
        .rounded-xl, .rounded-2xl { border-radius: 3px !important; }
        .shadow-sm, .shadow, .shadow-md, .shadow-lg { box-shadow: none !important; }
        [class*="border-gray-"], [class*="border-blue-"], [class*="border-emerald-"],
        [class*="border-red-"], [class*="border-amber-"], [class*="border-indigo-"] {
          border-color: #cbd5e1 !important;
        }

        /* Gradientes -> flat */
        .bg-gradient-to-br, .bg-gradient-to-r, [class*="from-"] {
          background: #f8fafc !important;
          color: #111 !important;
        }

        /* Tabelas com padding confortavel */
        table { border-collapse: collapse !important; width: 100% !important; margin: 0 !important; }
        th, td { border: 1px solid #cbd5e1 !important; padding: 5px 7px !important; vertical-align: middle !important; }
        thead tr { background: #f1f5f9 !important; color: #111 !important; }
        tfoot tr { background: #f8fafc !important; font-weight: bold !important; }

        /* Detalhe de vendedor expandido - mais respiravel */
        .print-detalhe td, .print-detalhe th { font-size: 6.8pt !important; padding: 3px 4px !important; }

        /* Espacamentos verticais equilibrados */
        .mb-3 { margin-bottom: 0.4rem !important; }
        .mb-4 { margin-bottom: 0.55rem !important; }
        .mb-5 { margin-bottom: 0.7rem !important; }
        .mb-6 { margin-bottom: 0.85rem !important; }
        .mt-3 { margin-top: 0.4rem !important; }
        .mt-4 { margin-top: 0.55rem !important; }
        .mt-6 { margin-top: 0.85rem !important; }

        /* Paddings internos dos cards e containers */
        .p-3 { padding: 0.4rem !important; }
        .p-4 { padding: 0.5rem !important; }
        .p-5 { padding: 0.55rem !important; }
        .py-2\\.5 { padding-top: 0.35rem !important; padding-bottom: 0.35rem !important; }
        .py-3 { padding-top: 0.4rem !important; padding-bottom: 0.4rem !important; }
        .px-4 { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
        .px-5 { padding-left: 0.55rem !important; padding-right: 0.55rem !important; }
        .px-6 { padding-left: 0.6rem !important; padding-right: 0.6rem !important; }

        /* Gaps entre grid items */
        .gap-2 { gap: 0.35rem !important; }
        .gap-3 { gap: 0.45rem !important; }
        .gap-4 { gap: 0.55rem !important; }

        /* Icones: reduz sem amassar */
        .h-8, .h-9, .h-10 { height: 1.35rem !important; }
        .w-8, .w-9, .w-10 { width: 1.35rem !important; }
        .h-14, .w-14 { height: 1.6rem !important; width: 1.6rem !important; }

        /* Linhas das barras de progresso ficam mais discretas mas visiveis */
        .print-grid-2 .flex-1.h-1 { height: 2px !important; }

        /* Espacamento entre linhas do breakdown */
        .divide-y > * + * { border-top: 1px solid #e5e7eb !important; }

        /* Page breaks */
        .print-no-break { page-break-inside: avoid; break-inside: avoid; }
        .print-page-break { page-break-before: always; break-before: page; }

        /* Hierarquia de espaco extra antes/depois dos titulos de secao */
        .print-section-title + div,
        .print-section-title + table { margin-top: 0 !important; }
      }
    `}</style>
  );
}

function PrintHeader({ cliente, rede, data }) {
  return (
    <div className="print-only print-no-break"
      style={{ marginBottom: '0.5rem', paddingBottom: '0.4rem', borderBottom: '2px solid #111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '7.5pt', color: '#6b7280', margin: 0, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
            CCI Consultoria · Relatório de Conciliação de Caixas
          </p>
          <h1 style={{ fontSize: '13pt', fontWeight: 700, margin: '0.15rem 0 0.1rem', lineHeight: 1.1 }}>
            {cliente?.nome || ''}
          </h1>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '8.5pt', color: '#374151', flexWrap: 'wrap' }}>
            {cliente?.cnpj && <span>CNPJ <strong>{cliente.cnpj}</strong></span>}
            {cliente?.empresa_codigo && <span>Empresa <strong>#{cliente.empresa_codigo}</strong></span>}
            {rede?.nome && <span>Rede <strong>{rede.nome}</strong></span>}
            <span>Data <strong>{formatDataBR(data)}</strong></span>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '7.5pt', color: '#6b7280', minWidth: '90px' }}>
          <p style={{ margin: 0, letterSpacing: '0.05em' }}>GERADO EM</p>
          <p style={{ margin: 0, fontWeight: 700, color: '#111', fontSize: '8.5pt' }}>
            {new Date().toLocaleString('pt-BR')}
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Painel Autosystem (subset: hoje só temos vendas detalhadas)
// ═══════════════════════════════════════════════════════════
function PainelAutosystem({
  data, fechamentoSangria, vendas, produtos, totais, totalGeral,
  totalOutrasEntradas = 0, totalEntradas = 0, outrasEntradasPorConta = [],
  recebimentos, totaisForma, totalForma, ajustes, funcionarios = [],
}) {
  const { semCategoriaQtd, semCategoriaValor } = totais;
  const formaSemCat = totaisForma?.semCategoriaQtd || 0;
  const formaSemCatValor = totaisForma?.semCategoriaValor || 0;
  const ajustesOk = ajustes || { acrescimos: 0, descontos: 0, itensComAcrescimo: 0, itensComDesconto: 0 };
  const [modalOutrosOpen, setModalOutrosOpen] = useState(false);
  const [modalOutrasEntradasOpen, setModalOutrasEntradasOpen] = useState(false);
  const [funcExpandidos, setFuncExpandidos] = useState(new Set());
  const contasNaoClassificadas = useMemo(() => {
    if (!totaisForma?.semCategoriaPorConta) return [];
    return Array.from(totaisForma.semCategoriaPorConta.values())
      .sort((a, b) => b.valor - a.valor);
  }, [totaisForma]);

  const toggleFunc = (chave) => {
    setFuncExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave); else next.add(chave);
      return next;
    });
  };

  return (
    <>
      {/* Status da sangria conferida pelo cliente */}
      {fechamentoSangria ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/40 p-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <CheckCircle2 className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-900">Sangria conferida pelo cliente</p>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              Fechado em <strong>{new Date(fechamentoSangria.confirmado_em).toLocaleString('pt-BR')}</strong>
              {fechamentoSangria.confirmado_por && <> por <strong>{fechamentoSangria.confirmado_por}</strong></>}
              {' · '}{(fechamentoSangria.registros || []).length} funcionário(s)
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Total contado</p>
            <p className="text-sm font-mono font-semibold text-emerald-800 tabular-nums">
              {formatCurrency(Number(fechamentoSangria.total_apresentado || 0))}
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Sangria ainda não conferida</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              O responsável do cliente ainda não registrou a contagem de dinheiro deste dia.
            </p>
          </div>
        </div>
      )}

      {/* Aviso de itens sem categoria */}
      {semCategoriaQtd > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 flex items-start gap-2.5 text-[12px]">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-800">
            <strong>{semCategoriaQtd}</strong> ite{semCategoriaQtd === 1 ? 'm' : 'ns'} sem categoria
            (totalizando <strong>{formatCurrency(semCategoriaValor)}</strong>).
            Classifique os grupos de produto em <em>/admin/clientes → Redes Autosystem → Classificar grupos</em>.
          </p>
        </div>
      )}

      <div className="print-section-title">Resumo do movimento</div>

      {/* Breakdown por categoria + Aviso de seções pendentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Entradas (vendas por categoria + outras entradas não-venda) */}
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-800">Entradas</h3>
            </div>
            <span className="text-[11px] text-gray-400">{vendas.length} itens</span>
          </div>
          <div className="divide-y divide-gray-100 flex-1">
            <LinhaBreakdown icon={Fuel} iconColor="text-amber-600" iconBg="bg-amber-50" barHex="#f59e0b"
              label="Combustíveis" valor={totais.combustivel} total={totalEntradas} />
            <LinhaBreakdown icon={Wrench} iconColor="text-slate-600" iconBg="bg-slate-100" barHex="#64748b"
              label="Produtos automotivos" valor={totais.automotivos} total={totalEntradas} />
            <LinhaBreakdown icon={ShoppingBag} iconColor="text-emerald-600" iconBg="bg-emerald-50" barHex="#10b981"
              label="Conveniência" valor={totais.conveniencia} total={totalEntradas} />
            {totais.outros > 0 && (
              <LinhaBreakdown icon={MoreHorizontal} iconColor="text-gray-500" iconBg="bg-gray-100" barHex="#6b7280"
                label="Outros / não classificados" valor={totais.outros} total={totalEntradas} />
            )}
            <LinhaBreakdown icon={PlusCircle} iconColor="text-blue-600" iconBg="bg-blue-50" barHex="#6366f1"
              label="Outras entradas (não-venda)" valor={totalOutrasEntradas} total={totalEntradas}
              onClick={outrasEntradasPorConta.length > 0 ? () => setModalOutrasEntradasOpen(true) : undefined} />
          </div>
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</span>
            <span className="text-sm font-mono font-bold text-gray-900 tabular-nums">{formatCurrency(totalEntradas)}</span>
          </div>
        </div>

        {/* Saídas (recebido por forma de pagamento — sob a ótica do caixa) */}
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-800">Saídas</h3>
            </div>
            <span className="text-[11px] text-gray-400">{(recebimentos || []).length} registros</span>
          </div>
          <div className="divide-y divide-gray-100 flex-1">
            <LinhaBreakdown icon={Banknote} iconColor="text-emerald-600" iconBg="bg-emerald-50" barHex="#10b981"
              label="Dinheiro" valor={totaisForma?.dinheiro || 0} total={totalForma} />
            <LinhaBreakdown icon={CreditCard} iconColor="text-blue-600" iconBg="bg-blue-50" barHex="#14b8a6"
              label="Cartão / PIX" valor={totaisForma?.cartao_pix || 0} total={totalForma} />
            <LinhaBreakdown icon={FileText} iconColor="text-blue-600" iconBg="bg-blue-50" barHex="#8b5cf6"
              label="Cheque" valor={totaisForma?.cheque || 0} total={totalForma} />
            <LinhaBreakdown icon={Calendar} iconColor="text-amber-600" iconBg="bg-amber-50" barHex="#f59e0b"
              label="A prazo" valor={totaisForma?.a_prazo || 0} total={totalForma} />
            <LinhaBreakdown icon={MoreHorizontal} iconColor="text-gray-500" iconBg="bg-gray-100" barHex="#6b7280"
              label="Outros / não classificados" valor={totaisForma?.outros || 0} total={totalForma}
              onClick={contasNaoClassificadas.length > 0 ? () => setModalOutrosOpen(true) : undefined} />
          </div>
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</span>
            <span className="text-sm font-mono font-bold text-gray-900 tabular-nums">{formatCurrency(totalForma)}</span>
          </div>
        </div>
      </div>


      {/* Sobra / Falta de caixa (fora do total de formas de recebimento) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <AjusteCard
          label="Sobra de caixa"
          valor={totaisForma?.sobra_caixa || 0}
          qtd={totaisForma?.sobra_caixa_qtd || 0}
          icon={TrendingUp}
          accent="emerald"
          prefixo="+"
        />
        <AjusteCard
          label="Falta de caixa"
          valor={totaisForma?.falta_caixa || 0}
          qtd={totaisForma?.falta_caixa_qtd || 0}
          icon={TrendingDown}
          accent="red"
          prefixo="-"
        />
      </div>

      {/* Acréscimos e Descontos do dia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <AjusteCard
          label="Acréscimos aplicados"
          valor={ajustesOk.acrescimos}
          qtd={ajustesOk.itensComAcrescimo}
          icon={PlusCircle}
          accent="emerald"
          prefixo="+"
        />
        <AjusteCard
          label="Descontos concedidos"
          valor={ajustesOk.descontos}
          qtd={ajustesOk.itensComDesconto}
          icon={MinusCircle}
          accent="red"
          prefixo="-"
        />
      </div>

      {/* Vendas + Recebimentos por funcionário */}
      {funcionarios.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Vendas e recebimentos por funcionário</h3>
            <span className="text-[11px] text-gray-400">· {funcionarios.length} funcionário{funcionarios.length === 1 ? '' : 's'}</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setFuncExpandidos(new Set(funcionarios.map(f => f.chave)))}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors">Expandir todos</button>
              <span className="text-[11px] text-gray-300">|</span>
              <button onClick={() => setFuncExpandidos(new Set())}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors">Colapsar</button>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {funcionarios.map(f => {
              const aberto = funcExpandidos.has(f.chave);
              // Diferença pura: recebimentos vs entradas (vendas + outras entradas)
              const diff = f.recebimentos.total - f.entradas_total;
              const conciliado = Math.abs(diff) < 0.01;
              return (
                <FuncionarioRow key={f.chave}
                  funcionario={f}
                  aberto={aberto}
                  onToggle={() => toggleFunc(f.chave)}
                  diff={diff}
                  conciliado={conciliado} />
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: detalhamento das contas não classificadas */}
      <Modal open={modalOutrosOpen} onClose={() => setModalOutrosOpen(false)}
        title="Detalhamento de contas não classificadas" size="md">
        <div className="space-y-4">
          <p className="text-xs text-gray-600">
            As contas abaixo não foram categorizadas em <strong>Dinheiro · Cartão/PIX · Cheque · A prazo · Sobra/Falta caixa</strong>.
            Por isso elas estão somadas em "Outros". Acesse <em>/admin/clientes → Redes Autosystem → Classificar contas</em> para classificá-las.
          </p>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2">Conta</th>
                  <th className="px-3 py-2 text-right">Lançamentos</th>
                  <th className="px-3 py-2 text-right">Valor total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contasNaoClassificadas.map(c => (
                  <tr key={c.codigo} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2">
                      <p className="text-sm text-gray-900 truncate max-w-[380px]">{c.nome || '—'}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{c.codigo}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-xs text-gray-500">
                      {c.qtd.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-sm font-semibold text-gray-900">
                      {formatCurrency(c.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/60 border-t border-gray-200">
                <tr className="text-[12px] font-semibold">
                  <td className="px-3 py-2.5 text-gray-700">Total</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-700">
                    {contasNaoClassificadas.reduce((s, c) => s + c.qtd, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900">
                    {formatCurrency(contasNaoClassificadas.reduce((s, c) => s + c.valor, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => setModalOutrosOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
              Fechar
            </button>
            <a href="/admin/clientes" target="_blank" rel="noreferrer"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2">
              Abrir Classificar contas
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </Modal>

      {/* Modal: detalhamento das outras entradas (não-venda) */}
      <Modal open={modalOutrasEntradasOpen} onClose={() => setModalOutrasEntradasOpen(false)}
        title="Detalhamento de outras entradas (não-venda)" size="md">
        <div className="space-y-4">
          <p className="text-xs text-gray-600">
            Lançamentos com <code className="font-mono bg-gray-100 px-1 rounded">conta_debitar</code> começando com
            <strong> 1.1.2</strong> e <code className="font-mono bg-gray-100 px-1 rounded">conta_creditar</code> diferente de
            <strong> 4.1</strong> (receita de vendas) e das contas classificadas como Sobra de caixa. Agrupados pela conta de crédito.
          </p>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2">Conta de crédito</th>
                  <th className="px-3 py-2 text-right">Lançamentos</th>
                  <th className="px-3 py-2 text-right">Valor total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {outrasEntradasPorConta.map(c => (
                  <tr key={c.codigo} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2">
                      <p className="text-sm text-gray-900 truncate max-w-[380px]">{c.nome || '—'}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{c.codigo}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-xs text-gray-500">
                      {c.qtd.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-sm font-semibold text-gray-900">
                      {formatCurrency(c.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/60 border-t border-gray-200">
                <tr className="text-[12px] font-semibold">
                  <td className="px-3 py-2.5 text-gray-700">Total</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-700">
                    {outrasEntradasPorConta.reduce((s, c) => s + c.qtd, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900">
                    {formatCurrency(outrasEntradasPorConta.reduce((s, c) => s + c.valor, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={() => setModalOutrasEntradasOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
              Fechar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Linha de funcionário com expand (vendas/recebimentos) ─────
function FuncionarioRow({ funcionario, aberto, onToggle, diff, conciliado }) {
  const f = funcionario;
  const iniciais = (f.nome || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  return (
    <div>
      <button onClick={onToggle}
        className={`w-full grid grid-cols-[1fr_140px_140px_120px] gap-3 px-4 py-3 text-left transition-colors ${
          aberto ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'
        }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <motion.div animate={{ rotate: aberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          </motion.div>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0">
            {iniciais}
          </div>
          <p className="text-sm font-medium text-gray-900 truncate">{f.nome}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-gray-400">Entradas</p>
          <p className="text-sm font-mono font-semibold text-gray-900 tabular-nums">{formatCurrency(f.entradas_total)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-gray-400">Recebimentos</p>
          <p className="text-sm font-mono font-semibold text-gray-900 tabular-nums">{formatCurrency(f.recebimentos.total)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-gray-400">Sobra/Falta</p>
          <p className={`text-sm font-mono font-semibold tabular-nums ${
            conciliado ? 'text-emerald-600' : diff > 0 ? 'text-emerald-600' : 'text-red-600'
          }`}>
            {conciliado ? '—' : (diff > 0 ? '+' : '') + formatCurrency(diff)}
          </p>
        </div>
      </button>

      {aberto && (
        <div className="px-4 pb-4 pt-1 bg-gray-50/40 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Entradas (vendas + outras entradas não-venda) */}
            <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-blue-50/40">
                <div className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-blue-500" />
                  <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Entradas</p>
                </div>
                <p className="text-xs font-mono font-bold text-gray-900 tabular-nums">{formatCurrency(f.entradas_total)}</p>
              </div>
              <div className="divide-y divide-gray-50">
                <LinhaItem icon={Fuel}        iconColor="text-amber-600"   iconBg="bg-amber-50"   label="Combustíveis"  valor={f.vendas.combustivel} />
                <LinhaItem icon={Wrench}      iconColor="text-slate-600"   iconBg="bg-slate-100"  label="Automotivos"   valor={f.vendas.automotivos} />
                <LinhaItem icon={ShoppingBag} iconColor="text-emerald-600" iconBg="bg-emerald-50" label="Conveniência"  valor={f.vendas.conveniencia} />
                {f.vendas.outros > 0 && (
                  <LinhaItem icon={MoreHorizontal} iconColor="text-gray-500" iconBg="bg-gray-100" label="Outros (sem categoria)" valor={f.vendas.outros} />
                )}
                {f.outras_entradas > 0 && (
                  <LinhaItem icon={PlusCircle} iconColor="text-blue-600" iconBg="bg-blue-50" label="Outras entradas (não-venda)" valor={f.outras_entradas} />
                )}
              </div>
            </div>

            {/* Recebimentos por forma */}
            <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-blue-50/40">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-blue-500" />
                  <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Recebimentos</p>
                </div>
                <p className="text-xs font-mono font-bold text-gray-900 tabular-nums">{formatCurrency(f.recebimentos.total)}</p>
              </div>
              <div className="divide-y divide-gray-50">
                <LinhaItem icon={Banknote}   iconColor="text-emerald-600" iconBg="bg-emerald-50" label="Dinheiro"       valor={f.recebimentos.dinheiro} />
                <LinhaItem icon={CreditCard} iconColor="text-blue-600"    iconBg="bg-blue-50"    label="Cartão / PIX"   valor={f.recebimentos.cartao_pix} />
                <LinhaItem icon={FileText}   iconColor="text-blue-600"  iconBg="bg-blue-50"  label="Cheque"         valor={f.recebimentos.cheque} />
                <LinhaItem icon={Calendar}   iconColor="text-amber-600"   iconBg="bg-amber-50"   label="A prazo"        valor={f.recebimentos.a_prazo} />
                {f.recebimentos.outros > 0 && (
                  <LinhaItem icon={MoreHorizontal} iconColor="text-gray-500" iconBg="bg-gray-100" label="Outros"     valor={f.recebimentos.outros} />
                )}
              </div>
            </div>
          </div>

          {/* Footer com a diferença pura (receb − vendas) */}
          <div className="mt-3">
            <div className={`rounded-lg border px-3 py-2 flex items-center justify-between text-[11px] ${
              conciliado ? 'border-gray-200 bg-gray-50/80' :
              diff > 0 ? 'border-emerald-200 bg-emerald-50/60' :
              'border-red-200 bg-red-50/60'
            }`}>
              <span className={`font-medium uppercase tracking-wider ${
                conciliado ? 'text-gray-600' : diff > 0 ? 'text-emerald-700' : 'text-red-700'
              }`}>Diferença (Receb − Vendas)</span>
              <span className={`font-mono font-semibold tabular-nums ${
                conciliado ? 'text-gray-700' : diff > 0 ? 'text-emerald-800' : 'text-red-800'
              }`}>
                {conciliado ? '—' : (diff > 0 ? '+' : '') + formatCurrency(diff)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaItem({ icon: Icon, iconColor, iconBg, label, valor }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5">
      <div className={`h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon className={`h-3 w-3 ${iconColor}`} />
      </div>
      <span className="text-[12px] text-gray-700 flex-1 truncate">{label}</span>
      <span className="text-[12px] font-mono tabular-nums text-gray-900">{formatCurrency(valor)}</span>
    </div>
  );
}
