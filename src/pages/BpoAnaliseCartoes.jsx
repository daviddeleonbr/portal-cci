import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  CreditCard, Loader2, AlertCircle, Building2, Calendar,
  Search, ArrowUpDown, RefreshCw, ChevronRight, Package, Banknote, Printer,
} from 'lucide-react';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as autosystemService from '../services/autosystemService';
import { classificarItem } from '../services/mapeamentoVendasService';
import SeletorRedeBPO from '../components/ui/SeletorRedeBPO';
import { formatCurrency } from '../utils/format';

function hojeStr() { return new Date().toISOString().split('T')[0]; }
function ontemStr() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// Mesma heurística usada em BpoConciliacaoCaixas
function classificarForma(nome) {
  const n = (nome || '').toUpperCase();
  if (/DINHEIRO|ESPECIE/.test(n)) return 'dinheiro';
  if (/CARTAO|CARTÃO|CREDITO|DEBITO|DÉBITO|CRÉDITO|PIX/.test(n)) return 'cartao';
  if (/CHEQUE/.test(n)) return 'cheque';
  return 'outros';
}

function formatDataBR(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  if (!y || !m || !dd) return s;
  return `${dd}/${m}/${y.slice(2)}`;
}

// Extrai HH:mm de "2026-04-22T15:30:00" ou "2026-04-22 15:30:00" ou ISO
function formatHora(d) {
  if (!d) return '—';
  const s = String(d);
  // Pega o trecho HH:mm após T ou espaço
  const m = s.match(/[T\s](\d{2}:\d{2})/);
  if (m) return m[1];
  // Fallback: tenta parsear como Date
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
  }
  return '—';
}

// ═══════════════════════════════════════════════════════════
// Análise de cartões — Webposto
// Mostra apenas vendas cujo total de formas de pagamento NÃO bate
// com o valor da venda, e ao menos uma forma é cartão/PIX.
// ═══════════════════════════════════════════════════════════
export default function BpoAnaliseCartoes() {
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [chavesApi, setChavesApi] = useState([]);
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [redeSel, setRedeSel] = useState(null);
  const [empresaId, setEmpresaId] = useState('');
  const [dataDe, setDataDe] = useState(ontemStr());
  const [dataAte, setDataAte] = useState(hojeStr());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [divergencias, setDivergencias] = useState([]);
  const [resumo, setResumo] = useState({ vendas: 0, comMultiCombustivel: 0 });
  const [busca, setBusca] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtrosAdm, setFiltrosAdm] = useState(() => new Set());
  const [admDropdownOpen, setAdmDropdownOpen] = useState(false);
  const admBtnRef = useRef(null);
  const [admDropdownPos, setAdmDropdownPos] = useState({ top: 0, left: 0, width: 260 });

  // Recalcula posição do dropdown sempre que abrir (e fecha no clique fora / esc / scroll)
  useEffect(() => {
    if (!admDropdownOpen) return;
    const place = () => {
      const r = admBtnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 280;
      // Alinha pela direita do botão se houver espaço; senão pela esquerda
      const right = r.right;
      const left = Math.max(8, Math.min(right - width, window.innerWidth - width - 8));
      setAdmDropdownPos({ top: r.bottom + 4, left, width });
    };
    place();
    const onScroll = () => place();
    const onClick = (e) => {
      if (admBtnRef.current?.contains(e.target)) return;
      // Ignora cliques dentro do próprio dropdown (marcado com data-adm-dropdown)
      if (e.target.closest?.('[data-adm-dropdown]')) return;
      setAdmDropdownOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setAdmDropdownOpen(false); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [admDropdownOpen]);
  const [ordenacao, setOrdenacao] = useState({ campo: 'qtdCombustiveis', dir: 'desc' });
  const [expandidas, setExpandidas] = useState(new Set());

  const toggleExpand = (id) => {
    setExpandidas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ─── Init: redes + clientes
  useEffect(() => {
    (async () => {
      try {
        setLoadingMeta(true);
        const [chvs, todosClientes, redesAS] = await Promise.all([
          mapService.listarChavesApi(),
          clientesService.listarClientes(),
          autosystemService.listarRedes().catch(() => []),
        ]);
        setChavesApi(chvs || []);
        setClientes(todosClientes || []);
        setRedesAutosystem(redesAS || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, []);

  // Empresas Webposto da rede selecionada
  const empresasDaRede = useMemo(() => {
    if (!redeSel || redeSel.tipo !== 'webposto') return [];
    return (clientes || []).filter(c =>
      c.chave_api_id === redeSel.id
      && c.usa_webposto
      && c.empresa_codigo != null
      && c.status === 'ativo'
    );
  }, [clientes, redeSel]);

  // Auto-seleciona a primeira empresa ao trocar rede (uma por vez)
  useEffect(() => {
    if (empresasDaRede.length > 0) {
      setEmpresaId(empresasDaRede[0].id);
    } else {
      setEmpresaId('');
    }
  }, [empresasDaRede]);

  const analisar = useCallback(async () => {
    if (!redeSel || redeSel.tipo !== 'webposto') {
      setError('Selecione uma rede Webposto.');
      return;
    }
    const empresa = empresasDaRede.find(e => e.id === empresaId);
    if (!empresa) {
      setError('Selecione uma empresa.');
      return;
    }
    const chave = chavesApi.find(c => c.id === redeSel.id);
    if (!chave) { setError('Chave API não encontrada.'); return; }

    setLoading(true);
    setError(null);
    setDivergencias([]);
    setResumo({ vendas: 0, comCartao: 0, divergentes: 0, totalDiferenca: 0 });

    try {
      const empresaCodigo = Number(empresa.empresa_codigo);
      const filtros = { dataInicial: dataDe, dataFinal: dataAte, empresaCodigo };

      const [vendas, formas, funcionarios, itens, produtos, grupos, administradoras, abastecimentos] = await Promise.all([
        qualityApi.buscarVendas(chave.chave, { ...filtros, situacao: 'A' }),
        qualityApi.buscarVendaFormaPagamento(chave.chave, filtros),
        qualityApi.buscarFuncionarios(chave.chave),
        qualityApi.buscarVendaItens(chave.chave, { ...filtros, situacao: 'A' }).catch(() => []),
        qualityApi.buscarProdutos(chave.chave).catch(() => []),
        qualityApi.buscarGrupos(chave.chave).catch(() => []),
        qualityApi.buscarAdministradoras(chave.chave).catch(() => []),
        qualityApi.buscarAbastecimentos(chave.chave, filtros).catch(() => []),
      ]);

      const mapFunc = new Map();
      (funcionarios || []).forEach(f => {
        const cod = f.funcionarioCodigo || f.codigo;
        if (cod != null) mapFunc.set(cod, f);
      });

      const mapProd = new Map();
      (produtos || []).forEach(p => {
        const cod = p.produtoCodigo || p.codigo;
        if (cod != null) mapProd.set(cod, p);
      });

      const mapGrp = new Map();
      (grupos || []).forEach(g => {
        const cod = g.grupoCodigo || g.codigo;
        if (cod != null) mapGrp.set(cod, g);
      });

      const mapAdm = new Map();
      (administradoras || []).forEach(a => {
        const cod = a.administradoraCodigo ?? a.codigo;
        if (cod != null) mapAdm.set(Number(cod), a);
      });

      // Indexa abastecimentos por VENDA_ITEM.vendaItemCodigo (ligação direta).
      const abastPorVendaItem = new Map();
      (abastecimentos || []).forEach(a => {
        const vic = a.vendaItemCodigo;
        if (vic != null) abastPorVendaItem.set(Number(vic), a);
      });

      // Indexa formas de pagamento por vendaCodigo
      const formasPorVenda = new Map();
      (formas || []).forEach(fp => {
        const key = fp.vendaCodigo;
        if (!formasPorVenda.has(key)) formasPorVenda.set(key, []);
        formasPorVenda.get(key).push(fp);
      });

      // Indexa itens por vendaCodigo
      const itensPorVenda = new Map();
      (itens || []).forEach(it => {
        const key = it.vendaCodigo;
        if (!itensPorVenda.has(key)) itensPorVenda.set(key, []);
        itensPorVenda.get(key).push(it);
      });

      const out = [];
      (vendas || []).forEach(v => {
        if (v.cancelada === 'S') return;
        const vc = v.vendaCodigo || v.codigo;
        const itensV = itensPorVenda.get(vc) || [];

        // Mapeia itens já com categoria + nome do produto + hora REAL do abastecimento
        // resolvida via ABASTECIMENTO.vendaItemCodigo = VENDA_ITEM.vendaItemCodigo.
        const itensProc = itensV.map(it => {
          const cod = it.produtoCodigo;
          const prod = mapProd.get(cod);
          const qtd = Number(it.quantidade || 0);
          const valorTotal = Number(it.totalVenda || 0) + Number(it.totalAcrescimo || 0);
          const valorUnitario = qtd > 0 ? valorTotal / qtd : 0;
          const categoria = classificarItem(it, mapProd, mapGrp);
          const vic = it.vendaItemCodigo != null ? Number(it.vendaItemCodigo) : null;
          const abast = vic != null ? abastPorVendaItem.get(vic) : null;
          const dataHoraAbast = abast?.dataHoraAbastecimento ?? null;

          return {
            produtoCodigo: cod,
            produtoNome: prod?.descricao || prod?.nome || `Produto #${cod}`,
            quantidade: qtd,
            valorUnitario,
            valorTotal,
            categoria,
            dataHora: dataHoraAbast,
          };
        });

        // Conta produtos DISTINTOS classificados como combustível
        const combustiveisDistintos = new Set();
        itensProc.forEach(it => {
          if (it.categoria === 'combustivel' && it.produtoCodigo != null) {
            combustiveisDistintos.add(it.produtoCodigo);
          }
        });
        if (combustiveisDistintos.size <= 1) return; // só vendas com >1 combustível distinto

        const formasV = formasPorVenda.get(vc) || [];
        const func = mapFunc.get(v.funcionarioCodigo);
        // Campos reais do Quality: notaNumero/numeroNota/nota
        const cupom = v.notaNumero ?? v.numeroNota ?? v.nota
          ?? v.numeroCupom ?? v.cupomFiscal ?? v.cupom ?? null;
        const data = v.dataHora ?? v.dataHoraVenda ?? v.dataVenda ?? v.data ?? null;

        out.push({
          id: `${vc}`,
          vendaCodigo: vc,
          cupom,
          data,
          funcionarioCodigo: v.funcionarioCodigo ?? null,
          vendedor: func?.nome || (v.funcionarioCodigo ? `Func #${v.funcionarioCodigo}` : '—'),
          valorVenda: Number(v.totalVenda ?? v.valor ?? 0),
          qtdCombustiveis: combustiveisDistintos.size,
          formas: formasV.map(f => {
            const admCod = f.administradoraCodigo != null ? Number(f.administradoraCodigo) : null;
            const adm = admCod != null ? mapAdm.get(admCod) : null;
            // Hora da baixa: tenta múltiplos nomes possíveis do Quality
            const dataBaixa = f.dataHora ?? f.dataHoraPagamento ?? f.dataPagamento
              ?? f.dataBaixa ?? f.dataMovimento ?? null;
            return {
              nome: f.nomeFormaPagamento,
              valor: Number(f.valorPagamento || 0),
              categoria: classificarForma(f.nomeFormaPagamento),
              administradoraCodigo: admCod,
              administradora: adm?.descricao || adm?.nome || null,
              dataBaixa,
            };
          }),
          somaFormas: formasV.reduce((s, f) => s + Number(f.valorPagamento || 0), 0),
          itens: itensProc,
        });
      });

      setDivergencias(out);
      setResumo({
        vendas: (vendas || []).length,
        comMultiCombustivel: out.length,
      });
    } catch (err) {
      setError('Erro na análise: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [redeSel, empresaId, dataDe, dataAte, chavesApi, empresasDaRede]);

  // Opções únicas de vendedor e administradora (extraídas das vendas retornadas)
  const vendedoresUnicos = useMemo(() => {
    const set = new Map();
    divergencias.forEach(d => {
      const key = d.vendedor || '—';
      set.set(key, (set.get(key) || 0) + 1);
    });
    return Array.from(set.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([nome, qtd]) => ({ nome, qtd }));
  }, [divergencias]);

  const administradorasUnicas = useMemo(() => {
    const set = new Map();
    divergencias.forEach(d => {
      d.formas.forEach(f => {
        if (!f.administradora) return;
        set.set(f.administradora, (set.get(f.administradora) || 0) + 1);
      });
    });
    return Array.from(set.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([nome, qtd]) => ({ nome, qtd }));
  }, [divergencias]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let lista = divergencias;
    if (filtroVendedor) {
      lista = lista.filter(d => (d.vendedor || '—') === filtroVendedor);
    }
    if (filtrosAdm.size > 0) {
      lista = lista.filter(d => d.formas.some(f => f.administradora && filtrosAdm.has(f.administradora)));
    }
    if (q) {
      lista = lista.filter(d =>
        String(d.cupom ?? d.vendaCodigo).includes(q)
        || (d.vendedor || '').toLowerCase().includes(q)
      );
    }
    const { campo, dir } = ordenacao;
    const m = dir === 'asc' ? 1 : -1;
    return [...lista].sort((a, b) => {
      let av = a[campo], bv = b[campo];
      if (typeof av === 'string') return av.localeCompare(bv) * m;
      return ((av ?? 0) - (bv ?? 0)) * m;
    });
  }, [divergencias, busca, filtroVendedor, filtrosAdm, ordenacao]);

  const toggleAdm = (nome) => {
    setFiltrosAdm(prev => {
      const next = new Set(prev);
      next.has(nome) ? next.delete(nome) : next.add(nome);
      return next;
    });
  };

  const handlePrint = useCallback(() => {
    // Expande todas as linhas antes de imprimir para mostrar produtos + formas
    setExpandidas(new Set(filtradas.map(d => d.id)));
    setTimeout(() => window.print(), 80);
  }, [filtradas]);

  const empresaSelecionada = useMemo(
    () => empresasDaRede.find(e => e.id === empresaId) || null,
    [empresasDaRede, empresaId]
  );
  const redeNome = useMemo(() => {
    if (!redeSel) return null;
    if (redeSel.tipo === 'webposto') return chavesApi.find(c => c.id === redeSel.id)?.nome || null;
    return null;
  }, [redeSel, chavesApi]);

  const toggleOrd = (campo) => {
    setOrdenacao(prev => prev.campo === campo
      ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { campo, dir: 'desc' });
  };

  return (
    <div className="space-y-4">
      <PrintStyles />

      {/* Cabeçalho de impressão (oculto em tela) */}
      <PrintHeader
        empresa={empresaSelecionada}
        redeNome={redeNome}
        dataDe={dataDe}
        dataAte={dataAte}
        totalVendas={resumo.vendas}
        totalDivergentes={resumo.comMultiCombustivel}
        totalListados={filtradas.length}
      />

      {/* Seleção */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4 space-y-3 no-print">
        {loadingMeta ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            Carregando redes...
          </div>
        ) : (
          <>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Rede
              </label>
              <SeletorRedeBPO
                chavesApi={chavesApi}
                redesAutosystem={redesAutosystem}
                value={redeSel}
                onChange={setRedeSel}
                placeholder="Selecione uma rede..."
              />
              {redeSel?.tipo === 'autosystem' && (
                <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                  A análise para redes Autosystem ainda não foi implementada nessa primeira versão.
                </p>
              )}
            </div>

            {empresasDaRede.length > 0 && (
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Empresa
                </label>
                <div className="flex flex-wrap gap-2">
                  {empresasDaRede.map(e => {
                    const ativa = empresaId === e.id;
                    return (
                      <button key={e.id} onClick={() => setEmpresaId(e.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                          ativa
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>
                        <Building2 className="h-3 w-3" />
                        {e.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-44">
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  De
                </label>
                <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)}
                  className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="w-44">
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Até
                </label>
                <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)}
                  className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <button onClick={analisar} disabled={loading || !redeSel || redeSel.tipo !== 'webposto' || !empresaId}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-700 px-3 text-xs font-semibold text-white shadow-sm transition-colors disabled:opacity-50 h-8">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Analisar
              </button>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Resumo (oculto na impressão — já está no PrintHeader) */}
      {!loading && resumo.vendas > 0 && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 no-print">
          <ResumoCard label="Vendas no período" valor={resumo.vendas} formato="numero" />
          <ResumoCard label="Com mais de 1 combustível" valor={resumo.comMultiCombustivel} formato="numero"
            accent={resumo.comMultiCombustivel > 0 ? 'red' : 'emerald'} />
        </motion.div>
      )}

      {/* Tabela */}
      {!loading && divergencias.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-red-50 text-red-600 flex items-center justify-center">
                <CreditCard className="h-3.5 w-3.5" />
              </div>
              <p className="text-sm font-semibold text-gray-900">
                Vendas com mais de 1 combustível
              </p>
              <span className="text-[10px] text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                {filtradas.length}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap no-print">
              <select value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                <option value="">Todos os vendedores</option>
                {vendedoresUnicos.map(v => (
                  <option key={v.nome} value={v.nome}>{v.nome} ({v.qtd})</option>
                ))}
              </select>
              <button ref={admBtnRef} type="button" onClick={() => setAdmDropdownOpen(o => !o)}
                className="h-8 rounded-lg border border-gray-200 bg-white pl-3 pr-2 text-xs flex items-center gap-2 hover:border-blue-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-w-[180px]">
                <span className="flex-1 text-left text-gray-700">
                  {filtrosAdm.size === 0
                    ? 'Todas as administradoras'
                    : filtrosAdm.size === 1
                      ? `${[...filtrosAdm][0]}`
                      : `${filtrosAdm.size} administradoras`}
                </span>
                {filtrosAdm.size > 0 && (
                  <span className="rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5">
                    {filtrosAdm.size}
                  </span>
                )}
                <span className={`text-gray-400 transition-transform ${admDropdownOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {admDropdownOpen && createPortal(
                <div data-adm-dropdown
                  className="fixed bg-white rounded-lg border border-gray-200 shadow-xl"
                  style={{
                    top: admDropdownPos.top,
                    left: admDropdownPos.left,
                    width: admDropdownPos.width,
                    zIndex: 9999,
                  }}>
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/60">
                    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Administradoras</p>
                    <div className="flex items-center gap-2">
                      <button type="button"
                        onClick={() => setFiltrosAdm(new Set(administradorasUnicas.map(a => a.nome)))}
                        className="text-[10px] font-medium text-blue-600 hover:text-blue-800">
                        Todas
                      </button>
                      <span className="text-gray-300">|</span>
                      <button type="button"
                        onClick={() => setFiltrosAdm(new Set())}
                        className="text-[10px] font-medium text-gray-500 hover:text-gray-700">
                        Limpar
                      </button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {administradorasUnicas.length === 0 ? (
                      <p className="px-3 py-3 text-center text-[11px] text-gray-400">Nenhuma administradora.</p>
                    ) : (
                      administradorasUnicas.map(a => {
                        const marcada = filtrosAdm.has(a.nome);
                        return (
                          <label key={a.nome}
                            className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 ${marcada ? 'bg-blue-50/40' : ''}`}>
                            <input type="checkbox" checked={marcada}
                              onChange={() => toggleAdm(a.nome)}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                            <span className="text-[12px] text-gray-700 flex-1 truncate">{a.nome}</span>
                            <span className="text-[10px] text-gray-400">{a.qtd}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>,
                document.body
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Filtrar por vendedor ou cupom..."
                  className="w-64 h-8 rounded-lg border border-gray-200 pl-8 pr-3 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <button onClick={handlePrint}
                className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <Printer className="h-3.5 w-3.5" />
                Gerar PDF
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/80 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium uppercase text-[10px] tracking-wider">Data/Hora</th>
                  <th className="text-right px-3 py-2 font-medium uppercase text-[10px] tracking-wider">Cupom</th>
                  <th className="text-left px-3 py-2 font-medium uppercase text-[10px] tracking-wider">Vendedor</th>
                  <SortHeader campo="valorVenda" label="Valor venda" ordenacao={ordenacao} onClick={toggleOrd} align="right" />
                  <SortHeader campo="qtdCombustiveis" label="Qtd combustíveis" ordenacao={ordenacao} onClick={toggleOrd} align="right" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map(d => {
                  const expandida = expandidas.has(d.id);
                  return (
                    <React.Fragment key={d.id}>
                      <tr
                        onClick={() => toggleExpand(d.id)}
                        className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <motion.div animate={{ rotate: expandida ? 90 : 0 }} transition={{ duration: 0.15 }}
                              className="text-gray-400 chevron-expand">
                              <ChevronRight className="h-3.5 w-3.5" />
                            </motion.div>
                            <span>{formatDataBR(d.data)}</span>
                            <span className="text-[10px] font-mono text-gray-400">{formatHora(d.data)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-500">
                          {d.cupom != null ? d.cupom : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{d.vendedor}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">{formatCurrency(d.valorVenda)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="inline-flex items-center justify-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[11px] font-bold tabular-nums">
                            {d.qtdCombustiveis}
                          </span>
                        </td>
                      </tr>
                      {expandida && (
                        <tr className="bg-gray-50/50 print-detalhe print-no-break">
                          <td colSpan={5} className="px-3 py-3">
                            <DetalheVenda divergencia={d} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-400">
                      Nenhuma venda encontrada para o filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Estado vazio (após análise) */}
      {!loading && resumo.vendas > 0 && divergencias.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <div className="mx-auto h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
            <CreditCard className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-emerald-800">Nenhuma venda encontrada</p>
          <p className="text-xs text-emerald-700 mt-1">
            {resumo.vendas} venda(s) no período — nenhuma com mais de 1 combustível distinto.
          </p>
        </div>
      )}
    </div>
  );
}

function ResumoCard({ label, valor, formato = 'numero', accent }) {
  const valorFmt = formato === 'moeda' ? formatCurrency(valor) : String(valor);
  const accentClass = accent === 'red'
    ? 'text-red-600'
    : accent === 'emerald'
      ? 'text-emerald-600'
      : 'text-gray-900';
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${accentClass}`}>{valorFmt}</p>
    </div>
  );
}

// ─── Detalhe expandido de uma venda divergente ──────────────
function DetalheVenda({ divergencia: d }) {
  const totalItens = d.itens.reduce((s, it) => s + it.valorTotal, 0);
  return (
    <div className="space-y-3">
      {/* Cabeçalho da venda (visível apenas no PDF) */}
      <div className="print-only-grid print-no-break"
        style={{
          gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem',
          padding: '0.4rem 0.5rem', background: '#0f172a', color: 'white',
          borderRadius: 3, marginBottom: '0.3rem',
        }}>
        <DetalheInfo label="Cupom" value={d.cupom != null ? d.cupom : '—'} mono />
        <DetalheInfo label="Data" value={formatDataBR(d.data)} />
        <DetalheInfo label="Hora" value={formatHora(d.data)} mono />
        <DetalheInfo label="Vendedor" value={d.vendedor || '—'} />
        <DetalheInfo label="Valor da venda" value={formatCurrency(d.valorVenda)} mono align="right" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print-detalhe-grid">
      {/* Produtos */}
      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden print-detalhe-card">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/60 print-detalhe-card-header">
          <div className="flex items-center gap-2">
            <Package className="h-3.5 w-3.5 text-gray-400" />
            <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
              Produtos da venda
            </p>
            <span className="text-[10px] text-gray-400">{d.itens.length}</span>
          </div>
          <p className="text-[11px] font-mono text-gray-500">
            Soma: <span className="text-gray-800 font-semibold">{formatCurrency(totalItens)}</span>
          </p>
        </div>
        {d.itens.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-gray-400 text-center">
            Nenhum item retornado pelo Quality para esta venda.
          </p>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="text-gray-400">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium uppercase text-[9px] tracking-wider">Produto</th>
                <th className="text-left px-2 py-1.5 font-medium uppercase text-[9px] tracking-wider">Hora</th>
                <th className="text-right px-2 py-1.5 font-medium uppercase text-[9px] tracking-wider">Qtd</th>
                <th className="text-right px-2 py-1.5 font-medium uppercase text-[9px] tracking-wider">Unit.</th>
                <th className="text-right px-3 py-1.5 font-medium uppercase text-[9px] tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.itens.map((it, idx) => (
                <tr key={`${it.produtoCodigo}-${idx}`} className={`border-t border-gray-50 ${it.categoria === 'combustivel' ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-3 py-1.5 text-gray-700">{it.produtoNome}</td>
                  <td className="px-2 py-1.5 text-[10px] font-mono text-gray-500 tabular-nums">
                    {it.dataHora ? formatHora(it.dataHora) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-gray-600">
                    {it.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-gray-600">
                    {formatCurrency(it.valorUnitario)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-800 font-semibold">
                    {formatCurrency(it.valorTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Formas de pagamento */}
      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden print-detalhe-card">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/60 print-detalhe-card-header">
          <div className="flex items-center gap-2">
            <Banknote className="h-3.5 w-3.5 text-gray-400" />
            <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
              Formas de pagamento
            </p>
            <span className="text-[10px] text-gray-400">{d.formas.length}</span>
          </div>
          <p className="text-[11px] font-mono text-gray-500">
            Soma: <span className="text-gray-800 font-semibold">{formatCurrency(d.somaFormas)}</span>
          </p>
        </div>
        {d.formas.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-gray-400 text-center">
            Esta venda não tem formas de pagamento registradas.
          </p>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="text-gray-400">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium uppercase text-[9px] tracking-wider print-hide">Forma</th>
                <th className="text-left px-2 py-1.5 font-medium uppercase text-[9px] tracking-wider">Administradora</th>
                <th className="text-left px-2 py-1.5 font-medium uppercase text-[9px] tracking-wider">Baixa</th>
                <th className="text-right px-3 py-1.5 font-medium uppercase text-[9px] tracking-wider">Valor</th>
              </tr>
            </thead>
            <tbody>
              {d.formas.map((f, idx) => (
                <tr key={`${f.nome}-${idx}`} className="border-t border-gray-50">
                  <td className="px-3 py-1.5 print-hide text-gray-700">
                    {f.nome || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">
                    {f.administradora || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 font-mono">
                    {f.dataBaixa ? (
                      <span className="inline-flex items-baseline gap-1">
                        <span className="text-[10px]">{formatDataBR(f.dataBaixa)}</span>
                        <span className="text-[9px] text-gray-400">{formatHora(f.dataBaixa)}</span>
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${
                    f.categoria === 'cartao' ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    {formatCurrency(f.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50/40">
              <tr>
                <td className="px-3 py-1.5 text-[10px] font-medium text-gray-500 uppercase print-hide">Total formas</td>
                <td className="px-2 py-1.5 text-[10px] font-medium text-gray-500 uppercase">
                  <span className="print-only-text">Total formas</span>
                </td>
                <td className="px-2 py-1.5"></td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums font-bold text-gray-800">
                  {formatCurrency(d.somaFormas)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      </div>
    </div>
  );
}

function DetalheInfo({ label, value, mono, align = 'left' }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{
        margin: 0, fontSize: '6.5pt', color: 'rgba(255,255,255,0.6)',
        letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
        textAlign: align,
      }}>{label}</p>
      <p style={{
        margin: '0.1rem 0 0', fontSize: '9pt', color: 'white', fontWeight: 700,
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit',
        textAlign: align, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</p>
    </div>
  );
}

function CategoriaBadge({ categoria }) {
  const map = {
    cartao:   { label: 'Cartão / PIX', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    dinheiro: { label: 'Dinheiro',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cheque:   { label: 'Cheque',       cls: 'bg-purple-50 text-purple-700 border-purple-200' },
    outros:   { label: 'Outros',       cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  };
  const cfg = map[categoria] || map.outros;
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// Impressão A4
// ═══════════════════════════════════════════════════════════
function PrintStyles() {
  return (
    <style>{`
      .print-only { display: none; }
      .print-only-text { display: none; }
      .print-only-grid { display: none; }
      @media print {
        @page {
          size: A4 portrait;
          margin: 1.5cm 1.2cm 1.7cm;
          @bottom-center {
            content: "Página " counter(page) " de " counter(pages);
            font-size: 8pt;
            color: #94a3b8;
          }
        }
        html, body, #root, main, .app-bg {
          background: white !important;
          background-image: none !important;
        }
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color: #0f172a;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif !important;
        }

        /* Visibilidade */
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        .print-only-text { display: inline !important; }
        .print-hide { display: none !important; }
        [aria-hidden="true"] { display: none !important; }
        main { padding: 0 !important; margin-left: 0 !important; }
        aside, header { display: none !important; }

        /* Tipografia */
        body, p, span, div { font-size: 9pt !important; line-height: 1.45 !important; }
        td, th { font-size: 8pt !important; line-height: 1.35 !important; }
        h1 { font-size: 15pt !important; line-height: 1.15 !important; font-weight: 700 !important; }
        h2 { font-size: 11pt !important; line-height: 1.2 !important; font-weight: 600 !important; }

        /* Containers */
        .rounded-xl, .rounded-2xl { border-radius: 4px !important; }
        .shadow-sm, .shadow, .shadow-md, .shadow-lg { box-shadow: none !important; }
        [class*="border-gray-"], [class*="border-blue-"], [class*="border-emerald-"],
        [class*="border-red-"], [class*="border-amber-"] {
          border-color: #cbd5e1 !important;
        }
        .bg-gradient-to-br, .bg-gradient-to-r, [class*="from-"] {
          background: #f8fafc !important;
          color: #0f172a !important;
        }

        /* Tabelas — visual mais limpo, bordas externas mais marcadas */
        table {
          border-collapse: collapse !important;
          width: 100% !important;
          border: 1px solid #94a3b8 !important;
        }
        th, td {
          border: 1px solid #e2e8f0 !important;
          padding: 6px 8px !important;
          vertical-align: middle !important;
        }
        thead tr {
          background: #f1f5f9 !important;
          color: #0f172a !important;
          border-bottom: 2px solid #94a3b8 !important;
        }
        thead th { font-weight: 700 !important; letter-spacing: 0.05em !important; }
        tfoot tr {
          background: #f8fafc !important;
          font-weight: 700 !important;
          border-top: 2px solid #94a3b8 !important;
        }
        tbody tr:nth-child(even) td { background: #fafbfc !important; }

        /* Detalhe expandido — mantém estrutura tabular */
        tr.print-detalhe { display: table-row !important; }
        tr.print-detalhe > td {
          background: #f8fafc !important;
          padding: 10px 12px !important;
          border-top: 2px solid #cbd5e1 !important;
        }
        .print-detalhe table {
          font-size: 7.5pt !important;
          border: 1px solid #cbd5e1 !important;
        }
        .print-detalhe th, .print-detalhe td { padding: 4px 6px !important; }
        .print-detalhe thead tr { background: #e2e8f0 !important; }

        /* Cards de produtos/formas dentro do detalhe — visual de "subcaixa" */
        .print-detalhe-card {
          border: 1px solid #cbd5e1 !important;
          background: white !important;
        }
        .print-detalhe-card-header {
          background: #f1f5f9 !important;
          padding: 5px 8px !important;
          border-bottom: 1px solid #cbd5e1 !important;
          font-weight: 700 !important;
          font-size: 8pt !important;
          letter-spacing: 0.05em !important;
          text-transform: uppercase !important;
          color: #334155 !important;
        }

        /* Força as 2 colunas (produtos + formas) lado a lado */
        .print-detalhe-grid {
          display: grid !important;
          grid-template-columns: 1.1fr 1fr !important;
          gap: 0.6rem !important;
          width: 100% !important;
        }

        /* Quebra de página */
        .print-no-break { page-break-inside: avoid; break-inside: avoid; }
        .print-page-break-before { page-break-before: always; break-before: page; }

        /* Espaçamentos compactos */
        .mb-3 { margin-bottom: 0.5rem !important; }
        .mb-4 { margin-bottom: 0.7rem !important; }
        .p-3 { padding: 0.5rem !important; }
        .p-4 { padding: 0.6rem !important; }
        .gap-2 { gap: 0.35rem !important; }
        .gap-3 { gap: 0.45rem !important; }

        /* Esconde elementos de UI */
        .chevron-expand { display: none !important; }
        button { background: transparent !important; border: none !important; box-shadow: none !important; }
        select, input { border: 1px solid #cbd5e1 !important; }

        /* Resumo (cards) — mais compactos */
        .print-resumo {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 0.4rem !important;
        }
        .print-resumo > div { padding: 6px 10px !important; }

        /* Cabeçalho preto do detalhe da venda - força grid em vez de block */
        .print-only-grid { display: grid !important; }
      }
    `}</style>
  );
}

function PrintHeader({ empresa, redeNome, dataDe, dataAte, totalVendas, totalDivergentes, totalListados }) {
  return (
    <div className="print-only print-no-break" style={{ marginBottom: '0.7rem' }}>
      {/* Barra de marca superior */}
      <div style={{ height: 4, background: 'linear-gradient(90deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)', borderRadius: 2 }} />

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: '1rem', paddingTop: '0.55rem', paddingBottom: '0.55rem',
        borderBottom: '1px solid #cbd5e1',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: '7pt', color: '#1e40af', margin: 0,
            letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700,
          }}>
            CCI Consultoria
          </p>
          <h1 style={{ fontSize: '16pt', fontWeight: 700, margin: '0.15rem 0 0.05rem', lineHeight: 1.05, color: '#0f172a' }}>
            {empresa?.nome || '—'}
          </h1>
          <p style={{ fontSize: '9pt', color: '#475569', margin: 0, fontWeight: 500 }}>
            Análise de cartões — Vendas com mais de 1 combustível
          </p>
        </div>
        <div style={{
          textAlign: 'right', fontSize: '7pt', color: '#64748b', minWidth: 130,
          borderLeft: '1px solid #e2e8f0', paddingLeft: '0.7rem',
        }}>
          <p style={{ margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
            Gerado em
          </p>
          <p style={{ margin: '0.1rem 0 0', fontWeight: 700, color: '#0f172a', fontSize: '9pt' }}>
            {new Date().toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      {/* Faixa de metadados */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem',
        paddingTop: '0.45rem', paddingBottom: '0.45rem',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <MetaCell label="CNPJ" value={empresa?.cnpj} />
        <MetaCell label="Empresa" value={empresa?.empresa_codigo != null ? `#${empresa.empresa_codigo}` : null} />
        <MetaCell label="Rede" value={redeNome} />
        <MetaCell label="Período" value={`${formatDataBR(dataDe)} — ${formatDataBR(dataAte)}`} />
      </div>

      {/* Faixa de totais */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem',
        paddingTop: '0.45rem',
      }}>
        <TotalCell label="Total de vendas no período" value={totalVendas} />
        <TotalCell label="Vendas com >1 combustível" value={totalDivergentes} accent="#b45309" />
        <TotalCell label="Listadas após filtros" value={totalListados} accent="#1e40af" />
      </div>
    </div>
  );
}

function MetaCell({ label, value }) {
  return (
    <div>
      <p style={{ fontSize: '6.5pt', color: '#94a3b8', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </p>
      <p style={{ fontSize: '9pt', color: '#0f172a', margin: '0.05rem 0 0', fontWeight: 600 }}>
        {value || '—'}
      </p>
    </div>
  );
}

function TotalCell({ label, value, accent = '#0f172a' }) {
  return (
    <div style={{
      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 3,
      padding: '0.4rem 0.6rem',
    }}>
      <p style={{ fontSize: '6.5pt', color: '#64748b', margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </p>
      <p style={{ fontSize: '13pt', color: accent, margin: '0.1rem 0 0', fontWeight: 700, lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );
}

function SortHeader({ campo, label, ordenacao, onClick, align = 'left' }) {
  const ativo = ordenacao.campo === campo;
  return (
    <th onClick={() => onClick(campo)}
      className={`px-3 py-2 font-medium uppercase text-[10px] tracking-wider cursor-pointer select-none hover:bg-gray-100/60 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${ativo ? 'text-blue-700' : 'text-gray-500'}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${ativo ? 'opacity-100' : 'opacity-30'}`} />
      </span>
    </th>
  );
}
