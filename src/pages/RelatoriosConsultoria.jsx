// Relatórios da consultoria (admin), um por item da sidebar: DRE, Fluxo de Caixa,
// Análise de IA e Análise de Lançamentos. No topo, a rede e a
// empresa (ou todas as empresas da rede); embaixo, o relatório já existente:
//   /admin/consultoria/:tipo/empresa/:clienteId  → relatório da empresa
//   /admin/consultoria/:tipo/rede/:chaveApiId    → consolidado da rede Webposto
//   /admin/consultoria/:tipo/rede-as/:asRedeId   → consolidado da rede Autosystem
// DRE, Fluxo e Análise de IA aceitam várias empresas (`multipla`): o consolidado da rede só com elas,
// em ?empresas=id1,id2 (todas marcadas = a rede inteira, sem o parâmetro).
// A seleção mora na URL (dá para favoritar e voltar).
import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, FileBarChart, FlaskConical, Loader2, Sparkles, Wallet } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SeletorRedeEmpresa, { AvisoSelecao } from '../components/bpo/SeletorRedeEmpresa';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as autosystemService from '../services/autosystemService';
import { TODAS_DA_REDE, empresasDaRede } from '../utils/selecaoRede';
import RelatorioDRE from './RelatorioDRE';
import RelatorioDRERede from './RelatorioDRERede';
import RelatorioDREAsRede from './RelatorioDREAsRede';
import RelatorioFluxoCaixa from './RelatorioFluxoCaixa';
import RelatorioFluxoCaixaRede from './RelatorioFluxoCaixaRede';
import RelatorioFluxoCaixaAsRede from './RelatorioFluxoCaixaAsRede';
import RelatorioAnaliseIA from './RelatorioAnaliseIA';
import RelatorioAnaliseLancamentos from './RelatorioAnaliseLancamentos';
import RelatorioAnaliseLancamentosRede from './RelatorioAnaliseLancamentosRede';

const IaRedeWebposto = () => <RelatorioAnaliseIA modoRede />;
const IaRedeAutosystem = () => <RelatorioAnaliseIA modoRede origem="autosystem" />;

// Por tipo: componente da empresa e, quando existe, o consolidado por tipo de rede
const RELATORIOS_CONSULTORIA = {
  dre: { titulo: 'DRE', descricao: 'Demonstrativo de resultado pela máscara configurada', icon: FileBarChart, multipla: true,
    empresa: RelatorioDRE, webposto: RelatorioDRERede, autosystem: RelatorioDREAsRede },
  'fluxo-caixa': { titulo: 'Fluxo de Caixa', descricao: 'Entradas, saídas e saldo por período', icon: Wallet, multipla: true,
    empresa: RelatorioFluxoCaixa, webposto: RelatorioFluxoCaixaRede, autosystem: RelatorioFluxoCaixaAsRede },
  // Autosystem não tem análise por empresa: uma empresa só vira a rede com ela (umaPelaRede)
  'analise-ia': { titulo: 'Análise de IA', descricao: 'Diagnóstico de vendas, DRE e fluxo de caixa com IA', icon: Sparkles, multipla: true, umaPelaRede: ['autosystem'],
    empresa: RelatorioAnaliseIA, webposto: IaRedeWebposto, autosystem: IaRedeAutosystem },
  'analise-lancamentos': { titulo: 'Análise de Lançamentos', descricao: 'Duplicatas, picos e quedas nas contas marcadas', icon: FlaskConical,
    empresa: RelatorioAnaliseLancamentos, webposto: RelatorioAnaliseLancamentosRede },
};

const NOME_TIPO_REDE = { webposto: 'Webposto', autosystem: 'Autosystem' };

export default function RelatoriosConsultoria() {
  const { tipo, clienteId, chaveApiId, asRedeId } = useParams();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [searchParams] = useSearchParams();
  const filtroEmpresas = searchParams.get('empresas') || '';
  const cfg = RELATORIOS_CONSULTORIA[tipo];

  const [clientes, setClientes] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  // Seleção ainda incompleta (só a rede, ou "todas" sem consolidado) — o resto vem da URL
  const [rascunho, setRascunho] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [lista, chs, redesAS] = await Promise.all([
          clientesService.listarClientes(),
          mapService.listarChavesApi(),
          autosystemService.listarRedes().catch(() => []),
        ]);
        if (!vivo) return;
        const ativos = (lista || []).filter(c => c.status === 'ativo' && (c.chave_api_id || c.as_rede_id));
        const idsWb = new Set(ativos.map(c => c.chave_api_id).filter(Boolean));
        const idsAs = new Set(ativos.map(c => c.as_rede_id).filter(Boolean));
        setClientes(ativos);
        setChavesApi((chs || []).filter(ch => ch.ativo !== false && idsWb.has(ch.id)));
        setRedesAutosystem((redesAS || []).filter(r => idsAs.has(r.id)));
      } catch (e) { if (vivo) setErro(e?.message || 'Falha ao carregar as redes.'); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, []);

  const contagensPorRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => { const k = c.chave_api_id || c.as_rede_id; m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }, [clientes]);

  // A seleção que está na URL
  const daUrl = useMemo(() => {
    const daRede = (rede) => {
      const ids = empresasDaRede(clientes, rede).map(e => e.id);
      const filtro = filtroEmpresas ? new Set(filtroEmpresas.split(',')) : null;
      return { rede, empresa: TODAS_DA_REDE, empresas: filtro ? ids.filter(i => filtro.has(i)) : ids };
    };
    if (chaveApiId) return daRede({ tipo: 'webposto', id: chaveApiId });
    if (asRedeId) return daRede({ tipo: 'autosystem', id: asRedeId });
    if (clienteId) {
      const c = clientes.find(x => x.id === clienteId);
      if (!c) return { rede: null, empresa: clienteId, empresas: [clienteId] };
      return { rede: c.chave_api_id ? { tipo: 'webposto', id: c.chave_api_id } : { tipo: 'autosystem', id: c.as_rede_id }, empresa: clienteId, empresas: [clienteId] };
    }
    return null;
  }, [chaveApiId, asRedeId, clienteId, clientes, filtroEmpresas]);
  const temRelatorio = !!(chaveApiId || asRedeId || clienteId);
  const selecao = (temRelatorio ? daUrl : rascunho) || { rede: null, empresa: '', empresas: [] };

  // Troca de relatório na sidebar: começa do zero
  useEffect(() => { setRascunho(null); }, [tipo]);

  if (!cfg) return <Navigate to="/admin/consultoria/dre" replace />;

  const base = `/admin/consultoria/${tipo}`;
  const consolidadoDe = (rede) => rede && cfg[rede.tipo];
  const caminhoRede = (rede) => `${base}/${rede.tipo === 'webposto' ? 'rede' : 'rede-as'}/${rede.id}`;
  const onSelecao = (s) => {
    // Várias empresas: 1 → a da empresa; todas → a rede; algumas → a rede só com elas
    if (cfg.multipla && s.rede && s.empresas?.length) {
      setRascunho(null);
      const daRede = empresasDaRede(clientes, s.rede);
      if (s.empresas.length === 1 && !cfg.umaPelaRede?.includes(s.rede.tipo)) navigate(`${base}/empresa/${s.empresas[0]}`);
      else if (s.empresas.length >= daRede.length) navigate(caminhoRede(s.rede));
      else navigate(`${caminhoRede(s.rede)}?empresas=${s.empresas.join(',')}`);
      return;
    }
    if (s.rede && s.empresa === TODAS_DA_REDE && consolidadoDe(s.rede)) {
      setRascunho(null);
      navigate(caminhoRede(s.rede));
    } else if (s.rede && s.empresa && s.empresa !== TODAS_DA_REDE) {
      setRascunho(null);
      navigate(`${base}/empresa/${s.empresa}`);
    } else {
      setRascunho(s);
      if (temRelatorio) navigate(base);
    }
  };
  // "Todas" escolhida num relatório sem consolidado para esse tipo de rede
  const semConsolidado = !temRelatorio && selecao.rede && selecao.empresa === TODAS_DA_REDE && !consolidadoDe(selecao.rede);
  const Icone = cfg.icon;
  // Empresa de um sistema sem relatório por empresa (ex.: IA no Autosystem) → a rede só com ela
  if (clienteId && daUrl?.rede && cfg.umaPelaRede?.includes(daUrl.rede.tipo)) {
    return <Navigate to={`${caminhoRede(daUrl.rede)}?empresas=${clienteId}`} replace />;
  }

  return (
    <div>
      <div className="no-print">
        <PageHeader title={cfg.titulo} description={cfg.descricao} />
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
          <div className="mt-5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white sm:flex">
            <Icone className="h-5 w-5" aria-hidden="true" />
          </div>
          {carregando ? (
            <div className="flex h-[62px] flex-1 items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando redes…</div>
          ) : (
            <SeletorRedeEmpresa empresas={clientes} semTodas={!cfg.webposto && !cfg.autosystem} multipla={!!cfg.multipla}
              admin={{ chavesApi, redesAutosystem, contagensPorRede, selecao, onSelecao }} />
          )}
        </div>
        {erro && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      </div>

      {temRelatorio ? (
        // key: troca de empresa/rede remonta o relatório do zero
        <Outlet key={pathname + search} />
      ) : (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm">
          {semConsolidado ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <AlertCircle className="mb-3 h-8 w-8 text-amber-500" aria-hidden="true" />
              <p className="text-sm font-semibold text-gray-900">{cfg.titulo} não tem a visão consolidada para redes {NOME_TIPO_REDE[selecao.rede.tipo]}</p>
              <p className="mt-1 text-xs text-gray-600">Escolha uma empresa da rede.</p>
            </div>
          ) : (
            <AvisoSelecao rede={selecao.rede}>
              {cfg.multipla ? 'Marque uma, algumas ou todas as empresas da rede e clique em Aplicar.'
                : cfg.webposto || cfg.autosystem ? 'Escolha uma empresa ou todas as empresas da rede.' : 'Este relatório é por empresa.'}
            </AvisoSelecao>
          )}
        </div>
      )}
    </div>
  );
}

// Filhos da rota: escolhem o componente pelo tipo do relatório
export function RelatorioDaEmpresa() {
  const { tipo } = useParams();
  const C = RELATORIOS_CONSULTORIA[tipo]?.empresa;
  return C ? <C /> : null;
}
export function RelatorioDaRede({ sistema }) {
  const { tipo } = useParams();
  const C = RELATORIOS_CONSULTORIA[tipo]?.[sistema];
  return C ? <C /> : <Navigate to={`/admin/consultoria/${tipo}`} replace />;
}

// Links antigos (/admin/relatorios-cliente/...) → páginas novas
export function RedirecionarRelatorioAntigo({ para }) {
  const p = useParams();
  const destino = {
    hub: '/admin/consultoria/dre',
    empresaHub: `/admin/consultoria/dre/empresa/${p.clienteId}`,
    empresa: `/admin/consultoria/${p.tipo}/empresa/${p.clienteId}`,
    rede: `/admin/consultoria/${p.tipo}/rede/${p.chaveApiId}`,
    redeAs: `/admin/consultoria/${p.tipo}/rede-as/${p.asRedeId}`,
  }[para];
  return <Navigate to={destino} replace />;
}
