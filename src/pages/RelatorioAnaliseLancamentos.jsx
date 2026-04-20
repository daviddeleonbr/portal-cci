import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertCircle, Building2, Zap,
  FlaskConical, ChevronLeft, ChevronRight, Sparkles, Printer,
} from 'lucide-react';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as flagsService from '../services/contasAnaliseService';
import { analisarLancamentos } from '../services/analiseLancamentosService';
import AnaliseLancamentosResult from '../components/AnaliseLancamentosResult';

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function rangeMes(ano, mes) {
  const mm = String(mes).padStart(2, '0');
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return {
    dataInicial: `${ano}-${mm}-01`,
    dataFinal: `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

// Indexa titulos por codigoConta → [ { id, data, descricao, valor, sinal, mesKey, situacao } ]
// Importante: mesKey e derivado da data do proprio titulo, nao do bucket em que foi buscado.
function indexarLancs(dadosPorMes, mesesValidos) {
  const chavesValidas = new Set(mesesValidos.map(m => m.key));

  const lancamentos = {};
  // Dedupe por id (caso o mesmo titulo volte em varios buckets por causa de chunks/overlap)
  const vistos = new Set();

  Object.values(dadosPorMes).forEach(dados => {
    const todos = [
      ...(dados.titulosReceber || []).map(t => ({ ...t, _sinal: 1, _tipo: 'receber' })),
      ...(dados.titulosPagar || []).map(t => ({ ...t, _sinal: -1, _tipo: 'pagar' })),
    ];
    todos.forEach(t => {
      const codigo = String(t.planoContaGerencialCodigo || '');
      if (!codigo) return;

      const dataRef = t.dataMovimento || t.dataPagamento || t.vencimento || '';
      const mesKey = dataRef ? dataRef.slice(0, 7) : '';
      if (!chavesValidas.has(mesKey)) return; // so considera lancamentos dentro do periodo selecionado

      const id = t.codigo || `${t._tipo}-${t.tituloPagarCodigo || t.tituloReceberCodigo}`;
      const dedupeKey = `${codigo}|${id}`;
      if (vistos.has(dedupeKey)) return;
      vistos.add(dedupeKey);

      const partes = [];
      const descBase = (t.descricao || '').trim();
      if (descBase) partes.push(descBase);
      const numTitulo = (t.numeroTitulo || '').trim();
      if (numTitulo) partes.push(`Nº ${numTitulo}`);
      const contraparte = (t.nomeFornecedor || t.nomeCliente || '').trim();
      if (contraparte) partes.push(contraparte);
      const descricaoComposta = partes.join(' · ') || '—';

      if (!lancamentos[codigo]) lancamentos[codigo] = [];
      lancamentos[codigo].push({
        id,
        mesKey,
        data: dataRef,
        descricao: descricaoComposta,
        valor: Math.abs(Number(t.valorPago || t.valor || 0)),
        sinal: t._sinal,
        situacao: t.situacao,
        parcela: Number(t.parcela || 0) || null,
        quantidadeParcelas: Number(t.quantidadeParcelas || 0) || null,
        numeroTitulo: (t.numeroTitulo || '').trim() || null,
        fornecedorCodigo: t.fornecedorCodigo || t.clienteCodigo || null,
      });
    });
  });
  return lancamentos;
}

export default function RelatorioAnaliseLancamentos() {
  const { clienteId } = useParams();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState(null);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [mesFinal, setMesFinal] = useState({ ano: today.getFullYear(), mes: today.getMonth() + 1 });
  const [qtdMeses, setQtdMeses] = useState(3);

  const [analiseSolicitada, setAnaliseSolicitada] = useState(false);
  const [loadingDados, setLoadingDados] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [lancsPorConta, setLancsPorConta] = useState(null);

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

  const scopeId = useMemo(() => flagsService.scopeDoCliente(cliente), [cliente]);
  const contasFlags = useMemo(() => flagsService.listarFlags(scopeId), [scopeId]);
  const qtdFlags = Object.keys(contasFlags).length;

  useEffect(() => {
    (async () => {
      try {
        const c = await clientesService.buscarCliente(clienteId);
        setCliente(c);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [clienteId]);

  // Invalida resultado ao mudar parametros
  useEffect(() => {
    setAnaliseSolicitada(false);
    setResultado(null);
    setLancsPorConta(null);
  }, [mesFinal, qtdMeses]);

  const rodarAnalise = useCallback(async () => {
    if (!cliente || qtdFlags === 0) return;
    setAnaliseSolicitada(true);
    setLoadingDados(true);
    setError(null);
    setResultado(null);
    setLancsPorConta(null);

    try {
      if (!cliente.usa_webposto || !cliente.chave_api_id) {
        throw new Error('Analise disponivel apenas para clientes Webposto (que integram com a API Quality).');
      }
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API nao encontrada para este cliente');

      // Fetch titulos para cada mes
      const promises = meses.map(async m => {
        const r = rangeMes(m.ano, m.mes);
        const filtros = { dataInicial: r.dataInicial, dataFinal: r.dataFinal, empresaCodigo: cliente.empresa_codigo };
        const [pagar, receber] = await Promise.all([
          qualityApi.buscarTitulosPagar(chave.chave, filtros),
          qualityApi.buscarTitulosReceber(chave.chave, filtros),
        ]);
        return { key: m.key, titulosPagar: pagar, titulosReceber: receber };
      });
      const results = await Promise.all(promises);
      const dadosPorMes = {};
      results.forEach(r => { dadosPorMes[r.key] = { titulosPagar: r.titulosPagar, titulosReceber: r.titulosReceber }; });

      const indexados = indexarLancs(dadosPorMes, meses);
      const res = analisarLancamentos(indexados, contasFlags, meses);
      setLancsPorConta(indexados);
      setResultado(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [cliente, meses, contasFlags, qtdFlags]);

  const navMes = (delta) => {
    setMesFinal(prev => {
      let m = prev.mes + delta;
      let y = prev.ano;
      while (m < 1) { m += 12; y--; }
      while (m > 12) { m -= 12; y++; }
      return { ano: y, mes: m };
    });
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

  const handlePrint = () => window.print();

  return (
    <div>
      {/* Print-only styles */}
      <style>{`
        @media print {
          html, body { background: white !important; -webkit-print-color-adjust: economy; print-color-adjust: economy; }
          html *, body * { background: transparent !important; background-color: transparent !important; box-shadow: none !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          aside, header { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .print-page { padding: 0 !important; }
          .print-conta { page-break-inside: avoid; break-inside: avoid; }
          .print-mes { page-break-inside: avoid; break-inside: avoid; }
          .print-hide-chevron > svg:first-of-type,
          button .print-hide-chevron svg { display: none !important; }
          button { pointer-events: none !important; }
          @page { size: A4 portrait; margin: 1.2cm; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Header (no-print) */}
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between gap-4 mb-6 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(`/admin/relatorios-cliente/${clienteId}`)}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <FlaskConical className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">Analise de Lancamentos</h2>
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
          <button onClick={handlePrint} disabled={!resultado}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Printer className="h-4 w-4" /> Gerar PDF
          </button>
        </div>
      </motion.div>

      {/* Cabecalho do relatorio (so na impressao) */}
      <div className="print-only" style={{ display: 'none', marginBottom: 16, borderBottom: '2px solid #000', paddingBottom: 10 }}>
        <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: 0 }}>Analise de Lancamentos</h1>
        <p style={{ fontSize: '10pt', margin: '4px 0' }}>
          {cliente.nome}{cliente.cnpj ? ` - CNPJ ${cliente.cnpj}` : ''}
        </p>
        <p style={{ fontSize: '10pt', margin: '4px 0', color: '#666' }}>
          Periodo: {periodoLabel} &middot; Emitido em: {new Date().toLocaleDateString('pt-BR')}
        </p>
      </div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-200/60 p-4 mb-5 shadow-sm no-print">
        <div className="flex flex-wrap items-end gap-3">
          {/* Mes referencia */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mes (referencia)</label>
            <div className="flex items-center gap-1 h-10 rounded-lg border border-gray-200 bg-white px-1">
              <button onClick={() => navMes(-1)} className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50">
                <ChevronLeft className="h-3.5 w-3.5" />
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

          {/* Analise */}
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

          {/* Botao rodar */}
          <div>
            <button onClick={rodarAnalise} disabled={loadingDados || qtdFlags === 0}
              className="flex items-center gap-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Rodar analise
            </button>
          </div>

          {/* Info */}
          <div className="ml-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 text-xs font-medium">
              <Sparkles className="h-3 w-3" />
              {qtdFlags} {qtdFlags === 1 ? 'conta marcada' : 'contas marcadas'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Estados */}
      {!analiseSolicitada ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <FlaskConical className="h-7 w-7 text-white" />
          </div>
          {qtdFlags === 0 ? (
            <>
              <p className="text-sm font-semibold text-gray-900 mb-1">Nenhuma conta marcada para analise</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Em <strong>Parametros &gt; Analise de Lancamentos</strong>, marque as contas da rede cujos lancamentos devem ser verificados.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900 mb-1">Selecione o periodo e clique em "Rodar analise"</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Serao consultados os lancamentos de <strong>{meses.map(m => m.label).join(', ')}</strong> nas {qtdFlags} contas marcadas da rede.
              </p>
            </>
          )}
        </div>
      ) : loadingDados ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center">
          <Loader2 className="h-7 w-7 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800 mb-1">Buscando lancamentos...</p>
          <p className="text-xs text-gray-400">{meses.length} mes(es) · {qtdFlags} contas</p>
        </div>
      ) : resultado ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
          <AnaliseLancamentosResult resultado={resultado} lancamentosPorConta={lancsPorConta} meses={meses} />
        </motion.div>
      ) : null}
    </div>
  );
}
