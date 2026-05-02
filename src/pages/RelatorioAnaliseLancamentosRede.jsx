// Analise de Lancamentos consolidada por rede.
// Itera todas as empresas Webposto da rede, busca titulos em paralelo,
// indexa por empresa e plano e renderiza tree EMPRESA > CONTA > LANCAMENTO
// com meses em colunas para visualizar periodicidade.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertCircle, Network, FlaskConical,
  ChevronLeft, ChevronRight, Sparkles, Printer,
} from 'lucide-react';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as flagsService from '../services/contasAnaliseService';
import AnaliseLancamentosTreeRede from '../components/AnaliseLancamentosTreeRede';
import { useAnonimizador } from '../services/anonimizarService';

const MESES_NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function rangeMes(ano, mes) {
  const mm = String(mes).padStart(2, '0');
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return {
    dataInicial: `${ano}-${mm}-01`,
    dataFinal: `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

// Indexa titulos de UMA empresa por codigoPlano → [ lancamentos ], filtrando apenas
// contas flagadas e meses do periodo.
function indexarLancsEmpresa(titulosPagar, titulosReceber, mesesValidos, contasFlags) {
  const chavesValidas = new Set(mesesValidos.map(m => m.key));
  const chavesContas = new Set(Object.keys(contasFlags));
  const lancamentos = {};
  const vistos = new Set();

  const todos = [
    ...(titulosReceber || []).map(t => ({ ...t, _sinal: 1, _tipo: 'receber' })),
    ...(titulosPagar || []).map(t => ({ ...t, _sinal: -1, _tipo: 'pagar' })),
  ];
  todos.forEach(t => {
    const codigo = String(t.planoContaGerencialCodigo || '');
    if (!codigo || !chavesContas.has(codigo)) return;

    const dataRef = t.dataMovimento || t.dataPagamento || t.vencimento || '';
    const mesKey = dataRef ? dataRef.slice(0, 7) : '';
    if (!chavesValidas.has(mesKey)) return;

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
      fornecedorCodigo: t.fornecedorCodigo || t.clienteCodigo || null,
      numeroTitulo: numTitulo || null,
    });
  });
  return lancamentos;
}

export default function RelatorioAnaliseLancamentosRede() {
  const { chaveApiId } = useParams();
  const navigate = useNavigate();
  const { labelEmpresa, labelRede } = useAnonimizador();

  const [rede, setRede] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [mesFinal, setMesFinal] = useState({ ano: today.getFullYear(), mes: today.getMonth() + 1 });
  const [qtdMeses, setQtdMeses] = useState(3);

  const [analiseSolicitada, setAnaliseSolicitada] = useState(false);
  const [loadingDados, setLoadingDados] = useState(false);
  const [progress, setProgress] = useState({ atual: 0, total: 0, mensagem: '' });
  const [error, setError] = useState(null);
  const [porEmpresa, setPorEmpresa] = useState(null);

  const meses = useMemo(() => {
    const arr = [];
    for (let i = qtdMeses - 1; i >= 0; i--) {
      let y = mesFinal.ano, m = mesFinal.mes - i;
      while (m < 1) { m += 12; y--; }
      arr.push({ ano: y, mes: m, key: `${y}-${String(m).padStart(2, '0')}`, label: `${MESES_NOMES[m - 1]}/${String(y).slice(2)}` });
    }
    return arr;
  }, [mesFinal, qtdMeses]);

  // Flags sao compartilhadas por chave_api_id (rede Webposto). Mesma logica do relatorio por empresa.
  const contasFlags = useMemo(() => flagsService.listarFlags(chaveApiId), [chaveApiId]);
  const qtdFlags = Object.keys(contasFlags).length;

  useEffect(() => {
    (async () => {
      try {
        const [chaves, clientes] = await Promise.all([
          mapService.listarChavesApi(),
          clientesService.listarClientes(),
        ]);
        const chave = chaves.find(c => c.id === chaveApiId);
        if (!chave) throw new Error('Rede não encontrada');
        setRede(chave);
        setEmpresas((clientes || []).filter(c => c.chave_api_id === chaveApiId
          && c.usa_webposto && c.empresa_codigo && c.status !== 'inativo'));
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [chaveApiId]);

  useEffect(() => {
    setAnaliseSolicitada(false);
    setPorEmpresa(null);
  }, [mesFinal, qtdMeses]);

  const rodarAnalise = useCallback(async () => {
    if (!rede || empresas.length === 0 || qtdFlags === 0) return;
    setAnaliseSolicitada(true);
    setLoadingDados(true);
    setError(null);
    setPorEmpresa(null);

    try {
      const totalReqs = empresas.length * meses.length;
      let concluidas = 0;
      setProgress({ atual: 0, total: totalReqs, mensagem: `Iniciando ${empresas.length} empresas x ${meses.length} meses...` });

      // Fetch paralelo: por empresa x mes, pagar + receber
      const porEmpresaRes = await Promise.all(empresas.map(async emp => {
        const perMes = await Promise.all(meses.map(async m => {
          const r = rangeMes(m.ano, m.mes);
          const filtros = { dataInicial: r.dataInicial, dataFinal: r.dataFinal, empresaCodigo: emp.empresa_codigo };
          const [pagar, receber] = await Promise.all([
            qualityApi.buscarTitulosPagar(rede.chave, filtros).catch(() => []),
            qualityApi.buscarTitulosReceber(rede.chave, filtros).catch(() => []),
          ]);
          concluidas += 1;
          setProgress({ atual: concluidas, total: totalReqs, mensagem: `${emp.nome} - ${m.label}` });
          return { pagar: pagar || [], receber: receber || [] };
        }));
        const allPagar = perMes.flatMap(p => p.pagar);
        const allReceber = perMes.flatMap(p => p.receber);
        const lancsPorConta = indexarLancsEmpresa(allPagar, allReceber, meses, contasFlags);
        return {
          empresaId: emp.id,
          empresaNome: labelEmpresa(emp),
          empresaCnpj: emp.cnpj,  // cnpj nao e exibido na tree, so o nome
          empresaCodigo: emp.empresa_codigo,
          lancsPorConta,
        };
      }));

      // Filtra empresas que nao tiveram nenhum lancamento em nenhuma conta flag
      const comDados = porEmpresaRes.filter(e => Object.keys(e.lancsPorConta).length > 0);
      setPorEmpresa(comDados);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [rede, empresas, meses, contasFlags, qtdFlags]);

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
  if (!rede) {
    return <div className="text-center py-20 text-gray-500">Rede não encontrada</div>;
  }

  const periodoLabel = meses.length === 1
    ? meses[0].label
    : `${meses[0].label} - ${meses[meses.length - 1].label}`;
  const handlePrint = () => window.print();
  const dataAgora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div>
      <style>{`
        @media print {
          html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body, main, #root, .app-bg, .min-h-screen { background: white !important; background-image: none !important; }
          [aria-hidden="true"] { display: none !important; }
          aside, header { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          table { font-size: 8pt !important; border-collapse: collapse; }
          table th, table td { padding: 2px 4px !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Header no-print */}
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between gap-4 mb-6 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/admin/relatorios-cliente')}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <FlaskConical className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">Análise de Lançamentos · Rede consolidada</h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Network className="h-3 w-3" />
              <span className="truncate">{labelRede(rede.nome, rede.id)}</span>
              <span className="inline-flex items-center gap-1 text-blue-600 ml-1">· {empresas.length} empresa{empresas.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint} disabled={!porEmpresa}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Printer className="h-4 w-4" /> Gerar PDF
          </button>
        </div>
      </motion.div>

      {/* Cabecalho so na impressao */}
      <div className="print-only" style={{ marginBottom: 12, borderBottom: '2px solid #000', paddingBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: '14pt', fontWeight: 'bold', margin: 0 }}>Análise de Lançamentos — Rede Consolidada</h1>
            <p style={{ fontSize: '10pt', margin: '3px 0' }}>{labelRede(rede.nome, rede.id)} · {empresas.length} empresas</p>
            <p style={{ fontSize: '9pt', margin: '3px 0', color: '#666' }}>Período: {periodoLabel} · {qtdFlags} contas analisadas</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '8.5pt', color: '#444', lineHeight: 1.25, flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: '9pt', fontWeight: 600, color: '#000' }}>CCI ASSESSORIA E CONSULTORIA INTELIGENTE LTDA</p>
            <p style={{ margin: '2px 0 0 0', fontFamily: 'monospace' }}>CNPJ 57.268.175/0001-00</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '7.5pt', color: '#888' }}>Impresso em {dataAgora}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-200/60 p-4 mb-5 shadow-sm no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mês (referência)</label>
            <div className="flex items-center gap-1 h-10 rounded-lg border border-gray-200 bg-white px-1">
              <button onClick={() => navMes(-1)} className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <select value={mesFinal.mes} onChange={(e) => setMesFinal(p => ({ ...p, mes: Number(e.target.value) }))}
                className="text-sm border-0 focus:outline-none bg-transparent">
                {MESES_NOMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
              </select>
              <select value={mesFinal.ano} onChange={(e) => setMesFinal(p => ({ ...p, ano: Number(e.target.value) }))}
                className="text-sm border-0 focus:outline-none bg-transparent">
                {[today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={() => navMes(1)} className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Análise</label>
            <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5 h-10">
              {[1, 3, 6].map(q => (
                <button key={q} onClick={() => setQtdMeses(q)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                    qtdMeses === q ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {q === 1 ? '1 mês' : `${q} meses`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <button onClick={rodarAnalise} disabled={loadingDados || qtdFlags === 0 || empresas.length === 0}
              className="flex items-center gap-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Rodar análise
            </button>
          </div>
          <div className="ml-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 text-xs font-medium">
              <Sparkles className="h-3 w-3" />
              {qtdFlags} {qtdFlags === 1 ? 'conta marcada' : 'contas marcadas'}
            </span>
          </div>
        </div>
      </motion.div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2 no-print">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {!analiseSolicitada ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <FlaskConical className="h-7 w-7 text-white" />
          </div>
          {qtdFlags === 0 ? (
            <>
              <p className="text-sm font-semibold text-gray-900 mb-1">Nenhuma conta marcada para análise</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Em <strong>Parâmetros &gt; Análise de Lançamentos</strong>, marque as contas da rede cujos lançamentos devem ser verificados.
              </p>
            </>
          ) : empresas.length === 0 ? (
            <>
              <p className="text-sm font-semibold text-gray-900 mb-1">Nenhuma empresa Webposto ativa na rede</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Verifique em <strong>Cadastros &gt; Clientes</strong> se ha empresas ativas com integração Webposto vinculadas a esta rede.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900 mb-1">Selecione o período e clique em "Rodar análise"</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Serao consultados os lançamentos de <strong>{meses.map(m => m.label).join(', ')}</strong> nas {qtdFlags} contas marcadas para todas as {empresas.length} empresas da rede.
              </p>
            </>
          )}
        </div>
      ) : loadingDados ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
          <Loader2 className="h-7 w-7 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800 mb-1">{progress.mensagem || 'Buscando lançamentos...'}</p>
          <p className="text-xs text-gray-400">{progress.atual} de {progress.total} requisicoes</p>
        </div>
      ) : porEmpresa ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          {porEmpresa.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-gray-500">
              Nenhuma empresa teve lançamentos nas contas marcadas dentro do período.
            </div>
          ) : (
            <AnaliseLancamentosTreeRede
              porEmpresa={porEmpresa}
              meses={meses}
              contasFlags={contasFlags}
            />
          )}
        </motion.div>
      ) : null}
    </div>
  );
}
