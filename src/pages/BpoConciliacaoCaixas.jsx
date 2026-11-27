// Página /admin/bpo/conciliacao-caixas: só as abas. A antiga aba "Conciliação de
// caixas" (e o "Marcar como concluído" que liberava o dia no BPO do cliente) foi
// descontinuada — o Relatório geral substitui.
import { useEffect, useMemo, useState } from 'react';
import { Loader2, CreditCard, Banknote, FileText, History, Stethoscope, ClipboardCheck } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import AbasPagina from '../components/ui/AbasPagina';
import BpoAlteracoesCaixas from './BpoAlteracoesCaixas';
import BpoAnaliseCartoes from './BpoAnaliseCartoes';
import BpoDiagnosticarCartoes from './BpoDiagnosticarCartoes';
import ConsultaSangrias from '../components/sangrias/ConsultaSangrias';
import RelatorioGeralCaixas from '../components/bpo/RelatorioGeralCaixas';
import ResumoCaixa from '../components/conferencia/ResumoCaixa';
import { SELECAO_VAZIA } from '../utils/selecaoRede';
import { getAdminSession } from '../lib/auth';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as autosystemService from '../services/autosystemService';

const ABAS = [
  { id: 'relatorio', rotulo: 'Relatório geral', Icon: FileText },
  { id: 'alteracoes', rotulo: 'Alterações em caixas', Icon: History },
  { id: 'cartoes', rotulo: 'Análise de cartões', Icon: CreditCard },
  { id: 'diagnosticar', rotulo: 'Diagnosticar', Icon: Stethoscope },
  { id: 'sangrias', rotulo: 'Sangrias', Icon: Banknote },
  { id: 'resumo', rotulo: 'Resumo de caixa', Icon: ClipboardCheck },
];

export default function BpoConciliacaoCaixas() {
  const [abaAtiva, setAbaAtiva] = useState('relatorio');
  const [clientes, setClientes] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Cada consulta guarda a própria rede/empresa (fica ao trocar de aba)
  const [selConsulta, setSelConsulta] = useState(SELECAO_VAZIA);
  const [selRelatorio, setSelRelatorio] = useState(SELECAO_VAZIA);

  useEffect(() => {
    (async () => {
      try {
        const [lista, chs, redesAS] = await Promise.all([
          clientesService.listarClientes(),
          mapService.listarChavesApi(),
          autosystemService.listarRedes().catch(() => []),
        ]);
        const validos = (lista || []).filter(c =>
          (c.usa_webposto && c.chave_api_id && c.empresa_codigo) || (c.as_rede_id && c.empresa_codigo != null));
        setClientes(validos);
        const idsWb = new Set(validos.filter(c => c.chave_api_id).map(c => c.chave_api_id));
        setChavesApi((chs || []).filter(ch => ch.ativo !== false && idsWb.has(ch.id)));
        const idsAS = new Set(validos.filter(c => c.as_rede_id).map(c => c.as_rede_id));
        setRedesAutosystem((redesAS || []).filter(r => idsAS.has(r.id)));
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const contagensPorRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => {
      const key = c.chave_api_id || c.as_rede_id;
      if (key) m.set(key, (m.get(key) || 0) + 1);
    });
    return m;
  }, [clientes]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }

  const base = { chavesApi, redesAutosystem, contagensPorRede };
  const usuarioNome = getAdminSession()?.usuario?.nome;

  return (
    <div>
      <div className="no-print">
        <PageHeader title="Conciliação de Caixas"
          description="Relatório geral, alterações, cartões e sangrias dos caixas dos clientes" />
      </div>

      {error && <p className="no-print mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <AbasPagina abas={ABAS} ativa={abaAtiva} onTrocar={setAbaAtiva} rotulo="Conciliação de caixas" />

      {abaAtiva === 'relatorio' && (
        <RelatorioGeralCaixas empresas={clientes} admin={{ ...base, selecao: selRelatorio, onSelecao: setSelRelatorio }} usuarioNome={usuarioNome} />
      )}
      {abaAtiva === 'alteracoes' && <BpoAlteracoesCaixas hideHeader />}
      {abaAtiva === 'cartoes' && <BpoAnaliseCartoes />}
      {abaAtiva === 'diagnosticar' && <BpoDiagnosticarCartoes />}
      {abaAtiva === 'sangrias' && (
        <ConsultaSangrias empresas={clientes} admin={{ ...base, selecao: selConsulta, onSelecao: setSelConsulta }} />
      )}
      {abaAtiva === 'resumo' && <ResumoCaixa empresas={clientes} usuarioNome={usuarioNome} />}
    </div>
  );
}
