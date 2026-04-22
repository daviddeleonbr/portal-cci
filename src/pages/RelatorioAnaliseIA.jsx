import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Loader2, AlertCircle, Building2, Network, Zap, Key,
  RefreshCw, Wand2, Info, ShoppingCart, FileBarChart, Wallet, GitBranch, Lock, Printer,
} from 'lucide-react';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as mascaraDreService from '../services/mascaraDreService';
import * as mascaraFluxoService from '../services/mascaraFluxoCaixaService';
import * as vendasIA from '../services/vendasInsightsService';
import * as dreIA from '../services/dreInsightsService';
import * as fluxoIA from '../services/fluxoInsightsService';
import * as geralIA from '../services/diagnosticoGeralService';
import { carregarApiKey, salvarApiKey, limparApiKey } from '../services/iaSharedHelpers';
import { useAnonimizador } from '../services/anonimizarService';
import AnaliseIaView from '../components/ia/AnaliseIaView';
import RelatorioDissertativo from '../components/ia/RelatorioDissertativo';
import Modal from '../components/ui/Modal';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export default function RelatorioAnaliseIA({ modoRede = false } = {}) {
  const { clienteId, chaveApiId } = useParams();
  const navigate = useNavigate();
  const { labelEmpresa, labelRede, labelCnpj } = useAnonimizador();

  // Contexto (cliente OU rede virtual)
  const [loading, setLoading] = useState(true);
  const [contexto, setContexto] = useState(null); // { tipo, cliente?, rede?, empresaCodigos?, chaveApi }
  const [err, setErr] = useState(null);

  const hoje = new Date();
  const [mesRef, setMesRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 });
  const [tab, setTab] = useState('vendas');

  // Mascaras (para DRE e Fluxo)
  const [mascarasDre, setMascarasDre] = useState([]);
  const [mascaraDreId, setMascaraDreId] = useState('');
  const [mascarasFluxo, setMascarasFluxo] = useState([]);
  const [mascaraFluxoId, setMascaraFluxoId] = useState('');

  // Resultados por aba: { vendas, dre, fluxo, geral } → { insights, usage, dados, mesKey }
  const [resultados, setResultados] = useState({ vendas: null, dre: null, fluxo: null, geral: null });
  const [loadingAba, setLoadingAba] = useState(null);
  const [progress, setProgress] = useState('');

  // API key
  const [apiKey, setApiKey] = useState(() => carregarApiKey());
  const [modalKey, setModalKey] = useState(false);
  const [tempKey, setTempKey] = useState('');

  const mesKey = `${mesRef.ano}-${String(mesRef.mes).padStart(2, '0')}`;

  // ─── Load contexto + mascaras ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null);
        if (modoRede) {
          const [chaves, clientes] = await Promise.all([
            mapService.listarChavesApi(),
            clientesService.listarClientes(),
          ]);
          const chave = chaves.find(c => c.id === chaveApiId);
          if (!chave) throw new Error('Rede nao encontrada');
          const empresas = (clientes || []).filter(c => c.chave_api_id === chaveApiId
            && c.usa_webposto && c.empresa_codigo && c.status !== 'inativo');
          setContexto({
            tipo: 'rede',
            rede: chave,
            chaveApi: chave.chave,
            empresas,
            cliente: {
              nome: chave.nome,
              _empresas: empresas,
              _empresaCodigos: empresas.map(e => Number(e.empresa_codigo)),
            },
          });
        } else {
          const cli = await clientesService.buscarCliente(clienteId);
          if (!cli?.chave_api_id) throw new Error('Cliente sem chave API');
          const chaves = await mapService.listarChavesApi();
          const chave = chaves.find(c => c.id === cli.chave_api_id);
          if (!chave) throw new Error('Chave API nao encontrada');
          setContexto({ tipo: 'empresa', cliente: cli, chaveApi: chave.chave, rede: chave });
        }
        // Mascaras
        const [mds, mfs] = await Promise.all([
          mascaraDreService.listarMascaras().catch(() => []),
          mascaraFluxoService.listarMascaras().catch(() => []),
        ]);
        setMascarasDre(mds || []);
        setMascarasFluxo(mfs || []);
        if (mds?.length && !mascaraDreId) setMascaraDreId(mds[0].id);
        if (mfs?.length && !mascaraFluxoId) setMascaraFluxoId(mfs[0].id);
      } catch (e) { setErr(e.message || String(e)); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, chaveApiId, modoRede]);

  // Quando troca mes, invalida os resultados (forca o usuario a gerar de novo)
  useEffect(() => {
    setResultados({ vendas: null, dre: null, fluxo: null, geral: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesKey]);

  const navegarMes = (delta) => {
    let a = mesRef.ano, m = mesRef.mes + delta;
    while (m < 1) { m += 12; a--; }
    while (m > 12) { m -= 12; a++; }
    setMesRef({ ano: a, mes: m });
  };

  // ─── Geracao ────────────────────────────────────────────────
  const garantirApiKey = () => {
    if (apiKey) return true;
    setTempKey(''); setModalKey(true);
    return false;
  };

  const gerarVendas = useCallback(async () => {
    if (!contexto || !garantirApiKey()) return;
    setLoadingAba('vendas'); setErr(null);
    try {
      const dados = await vendasIA.prepararDadosVendas({
        cliente: contexto.cliente,
        modoRede,
        chaveApi: contexto.chaveApi,
        mesRef,
        onProgress: setProgress,
      });
      setProgress('Enviando para Claude...');
      const r = await vendasIA.gerarAnaliseVendasIA(dados, apiKey, { modoRede });
      setResultados(prev => ({ ...prev, vendas: { insights: r.insights, usage: r.usage, dados, mesKey } }));
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoadingAba(null); setProgress(''); }
  }, [contexto, apiKey, mesRef, modoRede, mesKey]);

  const gerarDRE = useCallback(async () => {
    if (!contexto || !garantirApiKey()) return;
    if (!mascaraDreId) { setErr('Selecione uma mascara DRE'); return; }
    setLoadingAba('dre'); setErr(null);
    try {
      const chaveApiIdForMap = modoRede ? chaveApiId : contexto.cliente.chave_api_id;
      const dados = await dreIA.agregarDadosDRE({
        cliente: contexto.cliente,
        modoRede,
        chaveApi: contexto.chaveApi,
        chaveApiId: chaveApiIdForMap,
        mascaraId: mascaraDreId,
        mesRef,
        onProgress: setProgress,
      });
      setProgress('Enviando para Claude...');
      const r = await dreIA.gerarAnaliseDREIA(dados, apiKey);
      setResultados(prev => ({ ...prev, dre: { insights: r.insights, usage: r.usage, dados, mesKey } }));
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoadingAba(null); setProgress(''); }
  }, [contexto, apiKey, mesRef, modoRede, mesKey, mascaraDreId, chaveApiId]);

  const gerarFluxo = useCallback(async () => {
    if (!contexto || !garantirApiKey()) return;
    if (!mascaraFluxoId) { setErr('Selecione uma mascara de Fluxo'); return; }
    setLoadingAba('fluxo'); setErr(null);
    try {
      const chaveApiIdForContas = modoRede ? chaveApiId : contexto.cliente.chave_api_id;
      const dados = await fluxoIA.agregarDadosFluxo({
        cliente: contexto.cliente,
        modoRede,
        chaveApi: contexto.chaveApi,
        chaveApiId: chaveApiIdForContas,
        mascaraFluxoId,
        mesRef,
        onProgress: setProgress,
      });
      setProgress('Enviando para Claude...');
      const r = await fluxoIA.gerarAnaliseFluxoIA(dados, apiKey);
      setResultados(prev => ({ ...prev, fluxo: { insights: r.insights, usage: r.usage, dados, mesKey } }));
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoadingAba(null); setProgress(''); }
  }, [contexto, apiKey, mesRef, modoRede, mesKey, mascaraFluxoId, chaveApiId]);

  const gerarGeral = useCallback(async () => {
    if (!contexto || !garantirApiKey()) return;
    const { vendas, dre, fluxo } = resultados;
    if (!vendas || !dre || !fluxo) { setErr('Gere primeiro as 3 analises (Vendas, DRE, Fluxo) para este mes.'); return; }
    if (vendas.mesKey !== mesKey || dre.mesKey !== mesKey || fluxo.mesKey !== mesKey) {
      setErr('As 3 analises precisam ser do mesmo mes de referencia.'); return;
    }
    setLoadingAba('geral'); setErr(null);
    try {
      const periodoLabel = `${MESES[mesRef.mes - 1]}/${mesRef.ano}`;
      const dados = geralIA.agregarDadosDiagnosticoGeral({
        cliente: contexto.cliente,
        periodoLabel,
        vendas, dre, fluxo,
      });
      setProgress('Sintetizando as 3 analises...');
      const r = await geralIA.gerarDiagnosticoGeralIA(dados, apiKey);
      setResultados(prev => ({ ...prev, geral: { insights: r.insights, usage: r.usage, dados, mesKey } }));
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoadingAba(null); setProgress(''); }
  }, [contexto, apiKey, mesRef, mesKey, resultados]);

  const salvarChave = () => {
    salvarApiKey(tempKey.trim());
    setApiKey(tempKey.trim());
    setModalKey(false);
  };
  const limparChave = () => { limparApiKey(); setApiKey(''); setModalKey(false); };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }
  if (err && !contexto) {
    return <div className="text-center py-20 text-gray-500">Erro ao carregar: {err}</div>;
  }
  if (!contexto) return <div className="text-center py-20 text-gray-500">Contexto nao encontrado</div>;

  const ABAS = [
    { id: 'vendas', label: 'Vendas', icon: ShoppingCart, color: 'amber' },
    { id: 'dre', label: 'DRE', icon: FileBarChart, color: 'blue' },
    { id: 'fluxo', label: 'Fluxo de Caixa', icon: Wallet, color: 'emerald' },
    { id: 'geral', label: 'Diagnostico Geral', icon: GitBranch, color: 'violet' },
  ];

  const podeGerarGeral = resultados.vendas?.mesKey === mesKey
    && resultados.dre?.mesKey === mesKey && resultados.fluxo?.mesKey === mesKey;

  const voltarHref = modoRede ? '/admin/relatorios-cliente' : `/admin/relatorios-cliente/${contexto.cliente?.id}`;

  return (
    <div>
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between gap-4 mb-6 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(voltarHref)}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              Analise com IA{modoRede ? ' · Rede consolidada' : ''}
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {modoRede ? <Network className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
              <span className="truncate">{modoRede ? labelRede(contexto.cliente?.nome, chaveApiId) : labelEmpresa(contexto.cliente)}</span>
              {modoRede && (
                <span className="inline-flex items-center gap-1 text-blue-600 ml-1">
                  · {contexto.empresas?.length} empresas
                </span>
              )}
              {contexto.cliente?.usa_webposto && (
                <span className="inline-flex items-center gap-1 text-amber-600 ml-1">
                  <Zap className="h-2.5 w-2.5" /> Webposto
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={() => { setTempKey(apiKey || ''); setModalKey(true); }}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <Key className="h-3.5 w-3.5" /> {apiKey ? 'Chave configurada' : 'Configurar API key'}
        </button>
      </motion.div>

      {/* Seletor de mes + mascaras (sempre visiveis) */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-4 shadow-sm no-print">
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mes de referencia</label>
            <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1">
              <button onClick={() => navegarMes(-1)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-white hover:text-gray-800">←</button>
              <span className="px-3 text-[13px] font-semibold text-gray-800 tabular-nums whitespace-nowrap">{MESES[mesRef.mes - 1]} / {mesRef.ano}</span>
              <button onClick={() => navegarMes(1)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-white hover:text-gray-800">→</button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mascara DRE</label>
            <select value={mascaraDreId} onChange={e => setMascaraDreId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 bg-white px-2.5 text-xs">
              {mascarasDre.length === 0 ? (
                <option value="">Nenhuma mascara configurada</option>
              ) : (
                mascarasDre.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)
              )}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mascara Fluxo de Caixa</label>
            <select value={mascaraFluxoId} onChange={e => setMascaraFluxoId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 bg-white px-2.5 text-xs">
              {mascarasFluxo.length === 0 ? (
                <option value="">Nenhuma mascara configurada</option>
              ) : (
                mascarasFluxo.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)
              )}
            </select>
          </div>
          <p className="text-[10.5px] text-gray-400 sm:text-right leading-tight self-center">
            Comparacoes:<br />YoY + trimestre + tendencia 6m
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden mb-4 no-print">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
          {ABAS.map(a => {
            const Icon = a.icon;
            const active = tab === a.id;
            const temResultado = !!resultados[a.id];
            const bloqueada = a.id === 'geral' && !podeGerarGeral && !resultados.geral;
            return (
              <button key={a.id} onClick={() => setTab(a.id)}
                className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icon className="h-4 w-4" />
                {a.label}
                {bloqueada && <Lock className="h-3 w-3 text-gray-400" />}
                {temResultado && !bloqueada && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Analise gerada neste mes" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {err && (
        <div className="mb-5 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2 no-print">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{err}</p>
        </div>
      )}

      {/* Conteudo da aba */}
      {(() => {
        const periodoLabel = `${MESES[mesRef.mes - 1]}/${mesRef.ano}`;
        const empresaInfo = {
          nome: modoRede
            ? labelRede(contexto.cliente?.nome, chaveApiId)
            : labelEmpresa(contexto.cliente),
          cnpj: labelCnpj(contexto.cliente?.cnpj),
        };
        const paneProps = { tab, modoRede, empresa: empresaInfo, periodoLabel };
        if (tab === 'vendas') return (
          <PaneAnalise {...paneProps}
            titulo="Analise de Vendas"
            descricao="Diagnostico comercial: mix por categoria e grupo, combustiveis por tipo, produtos em queda/alta, YoY + tendencia 6m."
            carregando={loadingAba === 'vendas'}
            progresso={progress}
            resultado={resultados.vendas}
            onGerar={gerarVendas}
          />
        );
        if (tab === 'dre') return (
          <PaneAnalise {...paneProps}
            titulo="Analise da DRE Gerencial"
            descricao="Margens bruta e liquida, linhas criticas, custos e despesas, comparativo YoY + trimestre + tendencia 6m."
            carregando={loadingAba === 'dre'}
            progresso={progress}
            resultado={resultados.dre}
            onGerar={gerarDRE}
            aviso={!mascaraDreId ? 'Selecione uma mascara DRE para continuar' : null}
          />
        );
        if (tab === 'fluxo') return (
          <PaneAnalise {...paneProps}
            titulo="Analise do Fluxo de Caixa"
            descricao="Variacao de caixa, padrao por grupo, concentracoes de risco, comparativo YoY + trimestre + tendencia 6m."
            carregando={loadingAba === 'fluxo'}
            progresso={progress}
            resultado={resultados.fluxo}
            onGerar={gerarFluxo}
            aviso={!mascaraFluxoId ? 'Selecione uma mascara de Fluxo para continuar' : null}
          />
        );
        if (tab === 'geral') return (
          <PaneAnalise {...paneProps}
            titulo="Diagnostico Geral — sintese das 3 dimensoes"
            descricao="Conecta Vendas + DRE + Caixa em uma leitura integrada: gargalos, alavancas prioritarias, contradicoes e plano de 90 dias."
            carregando={loadingAba === 'geral'}
            progresso={progress}
            resultado={resultados.geral}
            onGerar={gerarGeral}
            aviso={!podeGerarGeral && !resultados.geral
              ? `Gere antes as 3 analises (Vendas/DRE/Fluxo) para ${MESES[mesRef.mes - 1]}/${mesRef.ano}. Estado atual: ${
                  [resultados.vendas?.mesKey === mesKey && 'Vendas',
                   resultados.dre?.mesKey === mesKey && 'DRE',
                   resultados.fluxo?.mesKey === mesKey && 'Fluxo'].filter(Boolean).join(', ') || 'nenhuma'}`
              : null}
          />
        );
        return null;
      })()}

      <Modal open={modalKey} onClose={() => setModalKey(false)} title="Chave da API Anthropic" size="sm">
        <div className="space-y-3">
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Informe sua chave de API da Anthropic. Fica salva apenas no seu navegador (localStorage).
          </p>
          <input type="password" value={tempKey} onChange={e => setTempKey(e.target.value)}
            placeholder="sk-ant-..." autoFocus
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            {apiKey && (
              <button onClick={limparChave} className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 font-medium">
                Remover chave
              </button>
            )}
            <button onClick={() => setModalKey(false)} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 font-medium">
              Cancelar
            </button>
            <button onClick={salvarChave} disabled={!tempKey.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 font-medium disabled:opacity-50">
              <RefreshCw className="h-3.5 w-3.5" /> Salvar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PaneAnalise({ titulo, descricao, carregando, progresso, resultado, onGerar, modoRede, aviso, tab, empresa, periodoLabel }) {
  return (
    <div>
      <div className="bg-white rounded-2xl border border-gray-200/60 p-5 shadow-sm mb-5 no-print">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center flex-shrink-0">
            <Wand2 className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 mb-0.5">{titulo}</h3>
            <p className="text-[12px] text-gray-500">{descricao}</p>
          </div>
          {resultado && (
            <button onClick={() => window.print()}
              title="Imprimir / salvar como PDF (A4 retrato)"
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all flex-shrink-0">
              <Printer className="h-4 w-4" />
              Imprimir PDF
            </button>
          )}
          <button onClick={onGerar} disabled={carregando || !!aviso}
            title={aviso || undefined}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {resultado ? 'Gerar novamente' : 'Gerar com IA'}
          </button>
        </div>
        {aviso && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-800">{aviso}</p>
          </div>
        )}
      </div>

      {carregando && (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-12 text-center shadow-sm no-print">
          <Loader2 className="h-7 w-7 text-violet-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800">{progresso || 'Processando...'}</p>
          <p className="text-[11px] text-gray-400 mt-1">Claude Opus 4.7 · adaptive thinking</p>
        </div>
      )}

      {!carregando && !resultado && (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-12 text-center shadow-sm no-print">
          <Sparkles className="h-7 w-7 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Clique em <strong>Gerar com IA</strong> para produzir a analise.</p>
          <div className="mt-4 rounded-lg bg-gray-50 border border-gray-100 px-4 py-2.5 text-[11px] text-gray-500 inline-flex items-start gap-2 max-w-md text-left">
            <Info className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>Apenas dados agregados trafegam. Sem vendas/lançamentos individuais nem dados pessoais.</span>
          </div>
        </div>
      )}

      {!carregando && resultado && (
        <>
          <div className="no-print">
            <AnaliseIaView insights={resultado.insights} usage={resultado.usage} modoRede={modoRede} />
          </div>
          <RelatorioDissertativo
            aba={tab}
            insights={resultado.insights}
            empresa={empresa}
            periodo={periodoLabel}
            modoRede={modoRede}
          />
        </>
      )}
    </div>
  );
}
