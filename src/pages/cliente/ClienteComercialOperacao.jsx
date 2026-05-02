import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Building2, Calendar, RefreshCw, Loader2, AlertCircle,
  ChevronDown, ChevronRight, CircleDot, CheckCircle2,
  DollarSign, Fuel, Wrench, Store, Package,
  CreditCard, TrendingUp, TrendingDown, Gauge,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import BarraProgressoTopo from '../../components/ui/BarraProgressoTopo';
import { useClienteSession } from '../../hooks/useAuth';
import * as mapService from '../../services/mapeamentoService';
import * as qualityApi from '../../services/qualityApiService';
import { classificarItem } from '../../services/mapeamentoVendasService';
import { formatCurrency } from '../../utils/format';

// ─── Helpers ─────────────────────────────────────────────────
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function formatDataBR(s) {
  if (!s) return '—';
  const iso = String(s).slice(0, 10);
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

function formatHora(s) {
  if (!s) return '—';
  const str = String(s);
  // Aceita ISO completo (2026-05-01T08:30:00) ou "yyyy-mm-dd HH:MM:SS"
  const m = str.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '—';
}

function formatDataHoraBR(s) {
  if (!s) return '—';
  const data = formatDataBR(s);
  const hora = formatHora(s);
  if (data === '—' && hora === '—') return '—';
  if (hora === '—') return data;
  return `${data} ${hora}`;
}

const toN = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

// ─── Componente principal ────────────────────────────────────
export default function ClienteComercialOperacao() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);

  // Filtros locais — independentes da topbar
  const hojeIso = ymd(new Date());
  const seteDiasAtrasIso = ymd(new Date(Date.now() - 6 * 86400000));

  const [empresasSelIds, setEmpresasSelIds] = useState(() => new Set(cliente?.id ? [cliente.id] : []));
  const [dataInicial, setDataInicial] = useState(seteDiasAtrasIso);
  const [dataFinal, setDataFinal] = useState(hojeIso);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  // dadosPorEmpresa: Map<empresaId, { empresa, caixas, vendas, funcionariosMap }>
  const [dadosPorEmpresa, setDadosPorEmpresa] = useState(new Map());
  const [empresasExpandidas, setEmpresasExpandidas] = useState(new Set());
  const [turnosExpandidos, setTurnosExpandidos] = useState(new Set());

  const empresasSel = useMemo(
    () => clientesRede.filter(c => empresasSelIds.has(c.id)),
    [clientesRede, empresasSelIds]
  );
  const multiEmpresa = empresasSel.length > 1;

  const carregar = useCallback(async () => {
    if (empresasSel.length === 0) {
      setErro('Selecione ao menos uma empresa.');
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const chaves = await mapService.listarChavesApi();
      const filtros = { dataInicial, dataFinal };

      const buscarUmaEmpresa = async (emp) => {
        const chave = chaves.find(c => c.id === emp.chave_api_id);
        if (!chave) {
          return { empresa: emp, caixas: [], vendas: [], vendaItens: [], formasPagto: [], abastecimentos: [],
            funcionariosMap: new Map(), produtosMap: new Map(), gruposMap: new Map(), formasPagtoMap: new Map(),
            bicosMap: new Map(),
            erro: 'Chave API não encontrada' };
        }
        const apiKey = chave.chave;
        const filtrosEmp = { ...filtros, empresaCodigo: emp.empresa_codigo };
        const [caixas, vendas, vendaItens, formasPagto, abastecimentos, funcionarios, produtos, grupos, formasPagtoCatalogo, bicos] = await Promise.all([
          qualityApi.buscarCaixas(apiKey, filtrosEmp).catch(() => []),
          qualityApi.buscarVendas(apiKey, filtrosEmp).catch(() => []),
          qualityApi.buscarVendaItens(apiKey, filtrosEmp).catch(() => []),
          qualityApi.buscarVendaFormaPagamento(apiKey, filtrosEmp).catch(() => []),
          qualityApi.buscarAbastecimentos(apiKey, filtrosEmp).catch(() => []),
          qualityApi.buscarFuncionarios(apiKey).catch(() => []),
          qualityApi.buscarProdutos(apiKey).catch(() => []),
          qualityApi.buscarGrupos(apiKey).catch(() => []),
          qualityApi.buscarFormasPagamento(apiKey).catch(() => []),
          qualityApi.buscarBicos(apiKey).catch(() => []),
        ]);
        const funcionariosMap = new Map();
        (funcionarios || []).forEach(f => {
          const cod = f.funcionarioCodigo || f.codigo;
          if (cod != null) funcionariosMap.set(Number(cod), f);
        });
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
        const formasPagtoMap = new Map();
        (formasPagtoCatalogo || []).forEach(fp => {
          const cod = fp.formaPagamentoCodigo ?? fp.codigo;
          const nome = fp.descricao || fp.nome || fp.formaPagamento;
          if (cod != null && nome) formasPagtoMap.set(Number(cod), String(nome).trim());
        });
        const bicosMap = new Map();
        (bicos || []).forEach(b => {
          const cod = b.codigoBico ?? b.bicoCodigo ?? b.codigo;
          if (cod == null) return;
          bicosMap.set(Number(cod), {
            bicoNumero: b.bicoNumero ?? b.numero ?? null,
            codigoProduto: b.codigoProduto ?? b.produtoCodigo ?? null,
          });
        });
        return {
          empresa: emp,
          caixas: caixas || [], vendas: vendas || [], vendaItens: vendaItens || [],
          formasPagto: formasPagto || [], abastecimentos: abastecimentos || [],
          funcionariosMap, produtosMap, gruposMap, formasPagtoMap, bicosMap,
        };
      };

      const resultados = await Promise.all(empresasSel.map(buscarUmaEmpresa));
      const novoMap = new Map();
      resultados.forEach(r => novoMap.set(r.empresa.id, r));
      setDadosPorEmpresa(novoMap);
      // Auto-expande todas as empresas selecionadas
      setEmpresasExpandidas(new Set(resultados.map(r => r.empresa.id)));
    } catch (err) {
      setErro('Erro ao buscar operação: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  }, [empresasSel, dataInicial, dataFinal]);

  // Auto-fetch quando muda empresa ou data — debounce simples
  useEffect(() => {
    if (empresasSel.length > 0) {
      const t = setTimeout(() => { carregar(); }, 100);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify([...empresasSelIds]), dataInicial, dataFinal]);

  // ─── Enriquecimento dos turnos por empresa ──────────────────
  const empresasComTurnos = useMemo(() => {
    return empresasSel.map(emp => {
      const dados = dadosPorEmpresa.get(emp.id);
      if (!dados) return { empresa: emp, turnos: [], totais: vazioTotais() };

      // Destructure defensivo: cobre cenarios onde o cache em estado pode
      // estar de uma versao anterior do shape (ex: durante hot-reload).
      const caixas         = dados.caixas         || [];
      const vendas         = dados.vendas         || [];
      const vendaItens     = dados.vendaItens     || [];
      const formasPagto    = dados.formasPagto    || [];
      const abastecimentos = dados.abastecimentos || [];
      const funcionariosMap = dados.funcionariosMap || new Map();
      const produtosMap     = dados.produtosMap     || new Map();
      const gruposMap       = dados.gruposMap       || new Map();
      const formasPagtoMap  = dados.formasPagtoMap  || new Map();
      const bicosMap        = dados.bicosMap        || new Map();

      // Indexa vendas por caixaCodigo (so nao canceladas) e cria mapa
      // vendaCodigo -> caixaCodigo para ligar itens/pagamentos ao turno.
      const vendasPorCaixa = new Map();
      const vendaToCaixa = new Map();
      (vendas || []).forEach(v => {
        const vc = v.vendaCodigo ?? v.codigo;
        const cx = v.caixaCodigo;
        if (cx != null && vc != null) vendaToCaixa.set(vc, cx);
        if ((v.cancelada || 'N') === 'S') return;
        if (cx == null) return;
        if (!vendasPorCaixa.has(cx)) vendasPorCaixa.set(cx, []);
        vendasPorCaixa.get(cx).push(v);
      });

      // Indexa itens por caixa (atravessando vendaToCaixa) — somente itens de
      // vendas nao canceladas
      const itensPorCaixa = new Map();
      (vendaItens || []).forEach(item => {
        const cx = vendaToCaixa.get(item.vendaCodigo);
        if (cx == null) return;
        // checa cancelamento via lookup na venda
        if (!itensPorCaixa.has(cx)) itensPorCaixa.set(cx, []);
        itensPorCaixa.get(cx).push(item);
      });

      // Indexa formas de pagamento por caixa
      const formasPorCaixa = new Map();
      (formasPagto || []).forEach(fp => {
        const cx = vendaToCaixa.get(fp.vendaCodigo);
        if (cx == null) return;
        if (!formasPorCaixa.has(cx)) formasPorCaixa.set(cx, []);
        formasPorCaixa.get(cx).push(fp);
      });

      // Aferições estão dentro de ABASTECIMENTO — linhas com `afericao = true`.
      const ehAfericao = (a) => a && a.afericao === true;

      // Helper: extrai data ISO (yyyy-mm-dd) ignorando timezone do dataHora
      const extrairData = (s) => s ? String(s).slice(0, 10) : null;
      // Helper: normaliza datetime para comparacao (yyyy-mm-dd HH:MM:SS)
      const normalizarDt = (s) => {
        if (!s) return null;
        // Remove timezone do final ('-03:00', '+00:00', 'Z') e troca T por espaco
        return String(s).replace(/[+-]\d{2}:?\d{2}$/, '').replace('Z', '').replace('T', ' ').slice(0, 19);
      };

      // Janelas de cada turno (caixa) — matching por datetime quando ABASTECIMENTO
      // nao tem caixaCodigo direto (o que e o caso normal nesse endpoint).
      const janelasCaixa = (caixas || []).map(c => ({
        caixaCodigo: c.caixaCodigo,
        ini: normalizarDt(c.abertura),
        fim: normalizarDt(c.fechamento || c.dataFechamento) || '9999-12-31 23:59:59',
        dataAbertura: extrairData(c.abertura),
      }));
      const acharCaixaPorData = (dataHora) => {
        if (!dataHora) return null;
        const dt = normalizarDt(dataHora);
        if (!dt) return null;
        // 1) Tenta janela exata
        const exato = janelasCaixa.find(j => j.ini && dt >= j.ini && dt <= j.fim);
        if (exato) return exato.caixaCodigo;
        // 2) Fallback: mesma data de abertura do caixa
        const dataDt = extrairData(dataHora);
        const mesmaData = janelasCaixa.find(j => j.dataAbertura === dataDt);
        return mesmaData ? mesmaData.caixaCodigo : null;
      };

      const afericoesPorCaixa = new Map();
      (abastecimentos || []).forEach(a => {
        if (!ehAfericao(a)) return;
        const dataHora = a.dataHoraAbastecimento || a.dataHora || a.data || a.horario;
        const cx = a.caixaCodigo ?? a.codigoCaixa ?? acharCaixaPorData(dataHora);
        if (cx == null) return;
        if (!afericoesPorCaixa.has(cx)) afericoesPorCaixa.set(cx, []);
        afericoesPorCaixa.get(cx).push(a);
      });

      const vendasMapPorCodigo = new Map();
      (vendas || []).forEach(v => vendasMapPorCodigo.set(v.vendaCodigo ?? v.codigo, v));

      const turnos = (caixas || []).map(c => {
        const vendasTurno = vendasPorCaixa.get(c.caixaCodigo) || [];
        const totalVendas = vendasTurno.reduce((s, v) => s + toN(v.totalVenda), 0);
        const qtdVendas = vendasTurno.length;
        const ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0;
        const funcResp = funcionariosMap.get(Number(c.funcionarioCodigo));
        // Detecta fechamento de forma resiliente: aceita boolean, 'S'/'s',
        // 'true', 1, ou — fallback — a presenca de uma data de fechamento.
        // Tambem aceita variacoes do campo (dataFechamento/horaFechamento).
        const dataFech = c.fechamento || c.dataFechamento || c.horaFechamento || c.data_fechamento || null;
        const flagF = c.fechado;
        const fechado = (
          flagF === true ||
          flagF === 'S' || flagF === 's' ||
          flagF === 1 ||
          String(flagF).toLowerCase() === 'true' ||
          (dataFech != null && String(dataFech).trim() !== '')
        );
        const diferenca = toN(c.diferenca);

        // Categorias (combustivel/automotivos/conveniencia/outros) via classificarItem
        const itensTurno = (itensPorCaixa.get(c.caixaCodigo) || [])
          .filter(it => {
            const v = vendasMapPorCodigo.get(it.vendaCodigo);
            return v && (v.cancelada || 'N') !== 'S';
          });
        const categorias = {
          combustivel:  { qtd: 0, receita: 0, custo: 0 },
          automotivos:  { qtd: 0, receita: 0, custo: 0 },
          conveniencia: { qtd: 0, receita: 0, custo: 0 },
          outros:       { qtd: 0, receita: 0, custo: 0 },
        };
        let totalDescontos = 0;
        let totalAcrescimos = 0;
        itensTurno.forEach(it => {
          const cat = classificarItem(it, produtosMap, gruposMap);
          const bucket = categorias[cat] || categorias.outros;
          bucket.qtd     += toN(it.quantidade);
          bucket.receita += toN(it.totalVenda);
          bucket.custo   += toN(it.totalCusto);
          totalDescontos  += toN(it.totalDesconto);
          totalAcrescimos += toN(it.totalAcrescimo);
        });

        // Formas de pagamento agregadas por nome — resolve via catalogo de
        // FORMA_PAGAMENTO (formaPagamentoCodigo -> descricao). Em ultimo
        // caso usa o que vier inline ou um placeholder com codigo.
        const formasMap = new Map();
        (formasPorCaixa.get(c.caixaCodigo) || []).forEach(fp => {
          const v = vendasMapPorCodigo.get(fp.vendaCodigo);
          if (v && (v.cancelada || 'N') === 'S') return;
          const cod = fp.formaPagamentoCodigo ?? fp.codigoFormaPagamento ?? fp.codigo;
          const nomeCatalogo = cod != null ? formasPagtoMap.get(Number(cod)) : null;
          const nome = (nomeCatalogo || fp.formaPagamento || fp.descricao || fp.nome ||
            (cod != null ? `Forma #${cod}` : 'Não identificada')).toString().trim();
          const valor = toN(fp.valor || fp.valorPagamento || fp.totalPagamento);
          if (!formasMap.has(nome)) formasMap.set(nome, { nome, qtd: 0, valor: 0 });
          const ag = formasMap.get(nome);
          ag.qtd  += 1;
          ag.valor += valor;
        });
        const formas = Array.from(formasMap.values()).sort((a, b) => b.valor - a.valor);
        const totalFormas = formas.reduce((s, f) => s + f.valor, 0);

        // Aferições do turno (abastecimentos com afericao=true)
        // Bico/produto resolvidos via catalogo BICO (codigoBico -> bicoNumero,
        // codigoProduto). ABASTECIMENTO normalmente vem com codigoProduto null.
        const afericoesTurno = (afericoesPorCaixa.get(c.caixaCodigo) || []).map(a => {
          const codBico = a.codigoBico ?? a.bicoCodigo;
          const bicoInfo = codBico != null ? bicosMap.get(Number(codBico)) : null;
          const bicoNumero = bicoInfo?.bicoNumero;
          // Produto: usa codigoProduto do abastecimento se houver, senao puxa
          // do catalogo BICO via codigoBico.
          const codProduto = a.codigoProduto ?? a.produtoCodigo ?? bicoInfo?.codigoProduto;
          const produto = codProduto != null ? produtosMap.get(Number(codProduto)) : null;
          const codFrentista = a.codigoFrentista ?? a.funcionarioCodigo;
          return {
            afericaoCodigo: a.abastecimentoCodigo ?? a.afericaoCodigo ?? a.codigo,
            bicoCodigo: codBico,
            bicoNome: bicoNumero != null
              ? `Bico ${bicoNumero}`
              : (a.bicoNome || a.bico || (codBico != null ? `Bico #${codBico}` : '—')),
            produtoNome: produto?.nome || produto?.descricao
              || a.produtoNome || a.produto
              || (codProduto != null ? `Produto #${codProduto}` : '—'),
            quantidade: toN(a.quantidade ?? a.litros),
            valor: toN(a.valorTotal ?? a.valor),
            dataHora: a.dataHoraAbastecimento || a.dataHora || a.data || a.horario || null,
            funcionarioNome: funcionariosMap.get(Number(codFrentista))?.nome ||
              (codFrentista != null ? `Funcionário #${codFrentista}` : '—'),
          };
        });

        return {
          caixaCodigo: c.caixaCodigo,
          turno: c.turno,
          turnoCodigo: c.turnoCodigo,
          abertura: c.abertura,
          fechamento: dataFech,
          fechado,
          funcionarioNome: funcResp?.nome || `Funcionário #${c.funcionarioCodigo}`,
          apurado: toN(c.apurado),
          diferenca,
          fechouSemDiferenca: fechado && Math.abs(diferenca) < 0.005,
          totalVendas,
          qtdVendas,
          ticketMedio,
          // Detalhes para o painel expandido
          categorias,
          totalDescontos,
          totalAcrescimos,
          formas,
          totalFormas,
          afericoes: afericoesTurno,
        };
      }).sort((a, b) => {
        // Ordena por abertura desc, depois turnoCodigo asc
        const cmp = String(b.abertura || '').localeCompare(String(a.abertura || ''));
        if (cmp !== 0) return cmp;
        return (a.turnoCodigo || 0) - (b.turnoCodigo || 0);
      });

      const totais = {
        qtdTurnos: turnos.length,
        qtdAbertos: turnos.filter(t => !t.fechado).length,
        qtdFechados: turnos.filter(t => t.fechado).length,
        totalVendas: turnos.reduce((s, t) => s + t.totalVendas, 0),
        qtdVendas: turnos.reduce((s, t) => s + t.qtdVendas, 0),
        diferencaTotal: turnos.reduce((s, t) => s + t.diferenca, 0),
      };

      return { empresa: emp, turnos, totais, funcionariosMap };
    });
  }, [empresasSel, dadosPorEmpresa]);

  // Totais consolidados (todas empresas selecionadas)
  const totaisGerais = useMemo(() => {
    const ag = vazioTotais();
    empresasComTurnos.forEach(({ totais }) => {
      ag.qtdTurnos      += totais.qtdTurnos;
      ag.qtdAbertos     += totais.qtdAbertos;
      ag.qtdFechados    += totais.qtdFechados;
      ag.totalVendas    += totais.totalVendas;
      ag.qtdVendas      += totais.qtdVendas;
      ag.diferencaTotal += totais.diferencaTotal;
    });
    return ag;
  }, [empresasComTurnos]);

  const toggleEmpresa = (id) => setEmpresasExpandidas(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleTurno = (key) => setTurnosExpandidos(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <div>
      <BarraProgressoTopo loading={loading} />

      <PageHeader
        title="Operação"
        description={`Análise de turnos · ${formatDataBR(dataInicial)} a ${formatDataBR(dataFinal)}`}
      >
        <EmpresaMultiSelect
          clientesRede={clientesRede}
          selecionadas={empresasSelIds}
          onToggle={(id) => setEmpresasSelIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          })}
          onToggleTodas={() => setEmpresasSelIds(prev =>
            prev.size === clientesRede.length ? new Set() : new Set(clientesRede.map(c => c.id))
          )}
        />
        <label className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Calendar className="h-3 w-3" /> De
          </span>
          <input type="date" value={dataInicial} max={dataFinal}
            onChange={(e) => e.target.value && setDataInicial(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Até</span>
          <input type="date" value={dataFinal} min={dataInicial} max={hojeIso}
            onChange={(e) => e.target.value && setDataFinal(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </label>
        <button onClick={carregar} disabled={loading || empresasSel.length === 0}
          className="flex items-center gap-2 h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
      </PageHeader>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{erro}</p>
        </div>
      )}

      {empresasSel.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <Building2 className="h-7 w-7 text-blue-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800">Selecione uma ou mais empresas</p>
          <p className="text-xs text-gray-500 mt-1">A análise é feita por empresa, com os turnos e vendas no período.</p>
        </div>
      ) : (
        <>
          {/* KPIs gerais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <KpiCard icon={Activity} cor="blue"  label="Turnos no período"  valor={totaisGerais.qtdTurnos}
              sub={`${empresasSel.length} ${empresasSel.length === 1 ? 'empresa' : 'empresas'}`} />
            <KpiCard icon={CircleDot} cor="amber" label="Abertos"
              valor={totaisGerais.qtdAbertos}
              sub={totaisGerais.qtdTurnos > 0 ? `${((totaisGerais.qtdAbertos / totaisGerais.qtdTurnos) * 100).toFixed(0)}% do total` : '—'} />
            <KpiCard icon={CheckCircle2} cor="emerald" label="Fechados"
              valor={totaisGerais.qtdFechados}
              sub={totaisGerais.qtdTurnos > 0 ? `${((totaisGerais.qtdFechados / totaisGerais.qtdTurnos) * 100).toFixed(0)}% do total` : '—'} />
            <KpiCard icon={DollarSign} cor="indigo" label="Faturamento total"
              valor={formatCurrency(totaisGerais.totalVendas)}
              sub={`${totaisGerais.qtdVendas} vendas`} raw />
          </div>

          {loading && empresasComTurnos.every(e => e.turnos.length === 0) ? (
            <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
              <Loader2 className="h-6 w-6 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-700">Buscando turnos e vendas…</p>
            </div>
          ) : (
            <div className="space-y-4">
              {empresasComTurnos.map(({ empresa, turnos, totais }) => {
                const empAberta = empresasExpandidas.has(empresa.id);
                return (
                  <div key={empresa.id} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                    {/* Header da empresa (clicavel quando multi) */}
                    <div
                      onClick={() => multiEmpresa && toggleEmpresa(empresa.id)}
                      className={`px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-3 ${multiEmpresa ? 'cursor-pointer hover:bg-gray-50/60 dark:hover:bg-white/5' : ''}`}>
                      {multiEmpresa && (
                        <motion.div animate={{ rotate: empAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </motion.div>
                      )}
                      <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-gray-900 truncate">{empresa.nome}</p>
                        <p className="text-[10.5px] text-gray-500">
                          {totais.qtdTurnos} turno{totais.qtdTurnos === 1 ? '' : 's'}
                          {' · '}{totais.qtdAbertos} aberto{totais.qtdAbertos === 1 ? '' : 's'}
                          {' · '}{totais.qtdFechados} fechado{totais.qtdFechados === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Faturamento</p>
                        <p className="text-[14px] font-bold tabular-nums text-gray-900">{formatCurrency(totais.totalVendas)}</p>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {(empAberta || !multiEmpresa) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          {turnos.length === 0 ? (
                            <div className="px-6 py-10 text-center text-sm text-gray-500">
                              Nenhum turno registrado nesse período.
                            </div>
                          ) : (
                            <TabelaTurnos
                              turnos={turnos}
                              empresaId={empresa.id}
                              turnosExpandidos={turnosExpandidos}
                              onToggleTurno={toggleTurno}
                            />
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function vazioTotais() {
  return { qtdTurnos: 0, qtdAbertos: 0, qtdFechados: 0, totalVendas: 0, qtdVendas: 0, diferencaTotal: 0 };
}

// ─── Tabela de turnos com expansão para vendas ───────────────
function TabelaTurnos({ turnos, empresaId, turnosExpandidos, onToggleTurno }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
          <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2.5">Status</th>
            <th className="px-3 py-2.5">Data</th>
            <th className="px-3 py-2.5">Turno</th>
            <th className="px-3 py-2.5">Responsável</th>
            <th className="px-3 py-2.5">Abertura</th>
            <th className="px-3 py-2.5">Fechamento</th>
            <th className="px-3 py-2.5 text-right">Vendas</th>
            <th className="px-3 py-2.5 text-right">Faturamento</th>
            <th className="px-3 py-2.5 text-right">Aferições</th>
            <th className="px-3 py-2.5 text-right">Apurado</th>
            <th className="px-3 py-2.5 text-right">Diferença</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/10">
          {turnos.map(t => {
            const key = `${empresaId}|${t.caixaCodigo}`;
            const aberto = turnosExpandidos.has(key);
            return (
              <React.Fragment key={key}>
                <tr onClick={() => onToggleTurno(key)}
                  className={`cursor-pointer transition-colors ${aberto ? 'bg-blue-50/30 dark:bg-blue-500/10' : 'hover:bg-gray-50/60 dark:hover:bg-white/5'}`}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <motion.div animate={{ rotate: aberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                      </motion.div>
                      <StatusBadge fechado={t.fechado} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[12.5px] text-gray-800 font-mono tabular-nums">{formatDataBR(t.abertura)}</td>
                  <td className="px-3 py-2 text-[12px] text-gray-700">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-mono tabular-nums text-gray-500">#{t.turnoCodigo ?? '?'}</span>
                      <span>{t.turno || ''}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[12px] text-gray-700 truncate max-w-[200px]">{t.funcionarioNome}</td>
                  <td className="px-3 py-2 text-[11.5px] text-gray-600 font-mono tabular-nums">{formatHora(t.abertura)}</td>
                  <td className="px-3 py-2 text-[11.5px] text-gray-600 font-mono tabular-nums">{t.fechado ? formatHora(t.fechamento) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800">{t.qtdVendas}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatCurrency(t.totalVendas)}</td>
                  <td className="px-3 py-2 text-right">
                    {t.afericoes.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 px-2 py-0.5 text-[11px] font-medium">
                        <Gauge className="h-3 w-3" /> {t.afericoes.length}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[11.5px] text-gray-700">{t.fechado ? formatCurrency(t.apurado) : '—'}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums text-[11.5px] font-semibold ${t.diferenca === 0 ? 'text-gray-500' : t.diferenca > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {t.fechado ? formatCurrency(t.diferenca) : '—'}
                  </td>
                </tr>
                {aberto && (
                  <tr>
                    <td colSpan={11} className="bg-gray-50/40 dark:bg-white/[0.02] px-5 py-4">
                      <DetalheTurno turno={t} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Detalhe expandido do turno ──────────────────────────────
function DetalheTurno({ turno }) {
  const [afericoesAberto, setAfericoesAberto] = useState(false);
  const totalCategorias =
    turno.categorias.combustivel.receita +
    turno.categorias.automotivos.receita +
    turno.categorias.conveniencia.receita +
    turno.categorias.outros.receita;

  const CATS = [
    { key: 'combustivel',  label: 'Combustíveis',  icon: Fuel,    cor: 'amber',   barCor: 'bg-amber-500',   isLitros: true },
    { key: 'automotivos',  label: 'Automotivos',   icon: Wrench,  cor: 'blue',    barCor: 'bg-blue-500',    isLitros: false },
    { key: 'conveniencia', label: 'Conveniência',  icon: Store,   cor: 'emerald', barCor: 'bg-emerald-500', isLitros: false },
    { key: 'outros',       label: 'Outros',        icon: Package, cor: 'gray',    barCor: 'bg-gray-400',    isLitros: false },
  ];

  return (
    <div className="space-y-5">
      {/* Status de fechamento — destaque no topo */}
      <StatusFechamento turno={turno} />

      {/* Vendas por categoria + Descontos/Acrescimos */}
      <section>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Package className="h-3 w-3" /> Vendas por categoria
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {CATS.map(c => {
            const data = turno.categorias[c.key];
            const pct = totalCategorias > 0 ? (data.receita / totalCategorias) * 100 : 0;
            const margem = data.receita - data.custo;
            const margemPct = data.receita > 0 ? (margem / data.receita) * 100 : 0;
            const Icon = c.icon;
            return (
              <div key={c.key} className={`rounded-lg border border-gray-100 bg-white p-3 ${data.receita === 0 ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center bg-${c.cor}-50 text-${c.cor}-600`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">{c.label}</p>
                </div>
                <p className="text-[14px] font-bold tabular-nums text-gray-900">{formatCurrency(data.receita)}</p>
                <p className="text-[10.5px] text-gray-500 tabular-nums">
                  {c.isLitros ? `${data.qtd.toFixed(0)} L` : `${data.qtd.toFixed(0)} ${data.qtd === 1 ? 'item' : 'itens'}`}
                  {data.receita > 0 && ` · ${pct.toFixed(1)}% do total`}
                </p>
                <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${c.barCor}`} style={{ width: `${pct}%` }} />
                </div>
                <p className={`mt-1.5 text-[10.5px] font-medium tabular-nums ${margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Margem {formatCurrency(margem)} {data.receita > 0 ? `(${margemPct.toFixed(1)}%)` : ''}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
            turno.totalDescontos > 0
              ? 'border-rose-100 bg-rose-50/40'
              : 'border-gray-100 bg-gray-50/40'
          }`}>
            <TrendingDown className={`h-4 w-4 flex-shrink-0 ${turno.totalDescontos > 0 ? 'text-rose-600' : 'text-gray-400'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${turno.totalDescontos > 0 ? 'text-rose-700' : 'text-gray-500'}`}>
                Descontos
              </p>
              <p className={`text-[13px] font-bold tabular-nums ${turno.totalDescontos > 0 ? 'text-rose-900' : 'text-gray-500'}`}>
                {formatCurrency(turno.totalDescontos)}
              </p>
            </div>
          </div>
          <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
            turno.totalAcrescimos > 0
              ? 'border-emerald-100 bg-emerald-50/40'
              : 'border-gray-100 bg-gray-50/40'
          }`}>
            <TrendingUp className={`h-4 w-4 flex-shrink-0 ${turno.totalAcrescimos > 0 ? 'text-emerald-600' : 'text-gray-400'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${turno.totalAcrescimos > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
                Acréscimos
              </p>
              <p className={`text-[13px] font-bold tabular-nums ${turno.totalAcrescimos > 0 ? 'text-emerald-900' : 'text-gray-500'}`}>
                {formatCurrency(turno.totalAcrescimos)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Formas de pagamento */}
      <section>
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
          <CreditCard className="h-3 w-3" /> Formas de pagamento
        </p>
        {turno.formas.length === 0 ? (
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-4 text-center text-[12px] text-gray-500">
            Sem dados de pagamento neste turno.
          </div>
        ) : (
          <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2">Forma</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">% do total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {turno.formas.map(f => {
                  const pct = turno.totalFormas > 0 ? (f.valor / turno.totalFormas) * 100 : 0;
                  return (
                    <tr key={f.nome} className="hover:bg-gray-50/40 dark:hover:bg-white/5">
                      <td className="px-3 py-1.5 text-[12px] text-gray-800">{f.nome}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11.5px] text-gray-700">{f.qtd}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-900">{formatCurrency(f.valor)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="font-mono text-[11px] tabular-nums text-gray-600">{pct.toFixed(1)}%</span>
                          <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                            <div className="h-full bg-indigo-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50/60 dark:bg-white/[0.03] border-t border-gray-100 dark:border-white/10">
                <tr className="text-[12px] font-semibold">
                  <td className="px-3 py-2 text-gray-700">Total</td>
                  <td />
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900">{formatCurrency(turno.totalFormas)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Aferições — card clicavel que expande a tabela */}
      <section>
        <button
          type="button"
          onClick={() => turno.afericoes.length > 0 && setAfericoesAberto(o => !o)}
          disabled={turno.afericoes.length === 0}
          className={`w-full rounded-lg border px-4 py-3 flex items-center gap-3 transition-colors ${
            turno.afericoes.length === 0
              ? 'border-gray-100 bg-white cursor-default'
              : afericoesAberto
              ? 'border-violet-200 bg-violet-50/40 dark:border-violet-500/30 dark:bg-violet-500/10 cursor-pointer'
              : 'border-gray-100 bg-white hover:bg-gray-50/60 dark:hover:bg-white/5 cursor-pointer'
          }`}
        >
          {turno.afericoes.length > 0 && (
            <motion.div animate={{ rotate: afericoesAberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </motion.div>
          )}
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            turno.afericoes.length > 0
              ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
              : 'bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500'
          }`}>
            <Gauge className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${
              turno.afericoes.length > 0 ? 'text-violet-700 dark:text-violet-300' : 'text-gray-500 dark:text-gray-400'
            }`}>
              Aferições realizadas
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {turno.afericoes.length === 0
                ? 'Nenhuma aferição registrada neste turno'
                : `${turno.afericoes.length} aferi${turno.afericoes.length === 1 ? 'ção' : 'ções'} · clique para ${afericoesAberto ? 'recolher' : 'ver detalhes'}`}
            </p>
          </div>
          {turno.afericoes.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[2rem] h-7 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200 text-[12px] font-bold tabular-nums px-2.5">
              {turno.afericoes.length}
            </span>
          )}
        </button>

        <AnimatePresence initial={false}>
          {afericoesAberto && turno.afericoes.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-2 rounded-lg border border-gray-100 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                    <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-3 py-2">Hora</th>
                      <th className="px-3 py-2">Bico</th>
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2">Funcionário</th>
                      <th className="px-3 py-2 text-right">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                    {turno.afericoes.map((a, i) => (
                      <tr key={a.afericaoCodigo || i} className="hover:bg-gray-50/40 dark:hover:bg-white/5">
                        <td className="px-3 py-1.5 text-[11.5px] text-gray-700 font-mono tabular-nums">{formatHora(a.dataHora)}</td>
                        <td className="px-3 py-1.5 text-[11.5px] text-gray-700">{a.bicoNome}</td>
                        <td className="px-3 py-1.5 text-[11.5px] text-gray-700">{a.produtoNome || '—'}</td>
                        <td className="px-3 py-1.5 text-[11.5px] text-gray-600 truncate max-w-[180px]">{a.funcionarioNome || '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-900">{a.quantidade.toFixed(2)} L</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

function StatusFechamento({ turno }) {
  if (!turno.fechado) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-4 py-3 flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
        </span>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">Caixa em aberto</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-300/80">Aberto em {formatDataHoraBR(turno.abertura)} · ainda não foi fechado.</p>
        </div>
      </div>
    );
  }
  if (turno.fechouSemDiferenca) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-emerald-900 dark:text-emerald-200">Caixa fechado sem diferença</p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-300/80">
            Fechado em {formatDataHoraBR(turno.fechamento)} · apurado {formatCurrency(turno.apurado)}.
          </p>
        </div>
      </div>
    );
  }
  // Fechado com diferenca
  const positiva = turno.diferenca > 0;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10 px-4 py-3 flex items-center gap-3">
      <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-300 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-[13px] font-semibold text-rose-900 dark:text-rose-200">
          Caixa fechado com diferença {positiva ? '(sobra)' : '(falta)'}
        </p>
        <p className="text-[11px] text-rose-700 dark:text-rose-300/80">
          Fechado em {formatDataHoraBR(turno.fechamento)} · apurado {formatCurrency(turno.apurado)} ·
          diferença <strong className={positiva ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>{formatCurrency(turno.diferenca)}</strong>
        </p>
      </div>
    </div>
  );
}

// ─── Componentes UI ──────────────────────────────────────────
function StatusBadge({ fechado }) {
  if (fechado) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Fechado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
      </span>
      Aberto
    </span>
  );
}

function KpiCard({ icon: Icon, cor, label, valor, sub, raw }) {
  const cores = {
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
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
      <p className={`${raw ? 'text-lg' : 'text-2xl'} font-bold tabular-nums ${c.text}`}>{valor}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
    </motion.div>
  );
}

// ─── Multi-select de empresas (dropdown com checkboxes) ──────
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
              className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left">
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
                    className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer">
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

