import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Landing
import LandingPortal from './pages/LandingPortal';

// Admin
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Financeiro from './pages/Financeiro';
import NotasFiscais from './pages/NotasFiscais';
import Boletos from './pages/Boletos';
import Clientes from './pages/Clientes';
import Relatorios from './pages/Relatorios';
import Parametros from './pages/Parametros';
import Parametrizacoes from './pages/Parametrizacoes';
import Mapeamento from './pages/Mapeamento';
import ContasAnalise from './pages/ContasAnalise';
import ParametrizacoesFluxo from './pages/ParametrizacoesFluxo';
import Colaboradores from './pages/Colaboradores';
import RelatoriosCliente, { ClienteRelatoriosHub } from './pages/RelatoriosCliente';
import RelatorioDRE from './pages/RelatorioDRE';
import RelatorioAnaliseLancamentos from './pages/RelatorioAnaliseLancamentos';
import RelatorioFluxoCaixa from './pages/RelatorioFluxoCaixa';
import RelatorioEvolucaoMensal from './pages/RelatorioEvolucaoMensal';
import CciPlanoContas from './pages/CciPlanoContas';
import CciFornecedores from './pages/CciFornecedores';
import CciContasPagar from './pages/CciContasPagar';
import CciMotivos from './pages/CciMotivos';
import CciUsuarios from './pages/CciUsuarios';
import BpoConciliacaoBancaria from './pages/BpoConciliacaoBancaria';
import BpoConciliacaoCaixas from './pages/BpoConciliacaoCaixas';
import BpoCaixaAdministrativo from './pages/BpoCaixaAdministrativo';

// Cliente
import ClienteLayout from './components/layout/cliente/ClienteLayout';
import ClienteLogin from './pages/cliente/ClienteLogin';
import ClienteDashboard from './pages/cliente/ClienteDashboard';
import ClienteDRE from './pages/cliente/ClienteDRE';
import ClienteFluxoCaixa from './pages/cliente/ClienteFluxoCaixa';
import ClienteBPO from './pages/cliente/ClienteBPO';
import ClienteDocumentos from './pages/cliente/ClienteDocumentos';
import ClienteContasPagar from './pages/cliente/ClienteContasPagar';
import ClienteContasReceber from './pages/cliente/ClienteContasReceber';
import ClienteAgendaFinanceira from './pages/cliente/ClienteAgendaFinanceira';
import ClienteSuporte from './pages/cliente/ClienteSuporte';
import ClienteSangrias from './pages/cliente/ClienteSangrias';
import ClienteUsuarios from './pages/cliente/ClienteUsuarios';
import ClienteTarefas from './pages/cliente/ClienteTarefas';

// Auth
import { RequireAdmin, RequireCliente } from './components/auth/RequireAuth';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing - escolha do portal */}
        <Route path="/" element={<LandingPortal />} />

        {/* Admin Portal */}
        <Route path="/admin" element={<Login />} />
        <Route element={<RequireAdmin><AppLayout /></RequireAdmin>}>
          <Route path="/admin/dashboard" element={<Dashboard />} />

          {/* Cadastros */}
          <Route path="/admin/clientes" element={<Clientes />} />
          <Route path="/admin/colaboradores" element={<Colaboradores />} />

          {/* Parametros (tabs: Mascaras DRE | Mapeamento) */}
          <Route path="/admin/parametros" element={<Parametros />}>
            <Route index element={<Navigate to="mascaras" replace />} />
            <Route path="mascaras" element={<Parametrizacoes />} />
            <Route path="fluxo-caixa" element={<ParametrizacoesFluxo />} />
            <Route path="mapeamento" element={<Mapeamento />} />
            <Route path="analise-lancamentos" element={<ContasAnalise />} />
          </Route>
          {/* Legacy redirects */}
          <Route path="/admin/parametrizacoes" element={<Navigate to="/admin/parametros/mascaras" replace />} />
          <Route path="/admin/parametrizacoes/mascaras" element={<Navigate to="/admin/parametros/mascaras" replace />} />
          <Route path="/admin/parametrizacoes/mapeamento" element={<Navigate to="/admin/parametros/mapeamento" replace />} />

          {/* Cadastros CCI */}
          <Route path="/admin/cadastros/plano-contas" element={<CciPlanoContas />} />
          <Route path="/admin/cadastros/fornecedores" element={<CciFornecedores />} />
          <Route path="/admin/cadastros/motivos" element={<CciMotivos />} />
          <Route path="/admin/cadastros/usuarios" element={<CciUsuarios />} />

          {/* Financeiro CCI */}
          <Route path="/admin/financeiro" element={<CciContasPagar />} />
          <Route path="/admin/financeiro/contas-pagar" element={<CciContasPagar />} />
          <Route path="/admin/financeiro/contas-receber" element={<Boletos />} />
          <Route path="/admin/boletos" element={<Boletos />} />

          {/* Fiscal */}
          <Route path="/admin/notas-fiscais" element={<NotasFiscais />} />
          <Route path="/admin/fiscal/notas-fiscais" element={<NotasFiscais />} />
          <Route path="/admin/fiscal/agendamento" element={<NotasFiscais />} />

          {/* Relatorios Cliente (analises por empresa) */}
          <Route path="/admin/relatorios-cliente" element={<RelatoriosCliente />} />
          <Route path="/admin/relatorios-cliente/:clienteId" element={<ClienteRelatoriosHub />} />
          <Route path="/admin/relatorios-cliente/:clienteId/dre" element={<RelatorioDRE />} />
          <Route path="/admin/relatorios-cliente/:clienteId/analise-lancamentos" element={<RelatorioAnaliseLancamentos />} />
          <Route path="/admin/relatorios-cliente/:clienteId/fluxo-caixa" element={<RelatorioFluxoCaixa />} />
          <Route path="/admin/relatorios-cliente/:clienteId/evolucao" element={<RelatorioEvolucaoMensal />} />

          {/* BPO */}
          <Route path="/admin/bpo/conciliacao-bancaria" element={<BpoConciliacaoBancaria />} />
          <Route path="/admin/bpo/conciliacao-caixas" element={<BpoConciliacaoCaixas />} />
          <Route path="/admin/bpo/caixa-administrativo" element={<BpoCaixaAdministrativo />} />

          {/* Relatorios (kept for compatibility) */}
          <Route path="/admin/relatorios" element={<Relatorios />} />
        </Route>

        {/* Cliente Portal */}
        <Route path="/cliente/login" element={<ClienteLogin />} />
        <Route element={<RequireCliente><ClienteLayout /></RequireCliente>}>
          <Route path="/cliente/dashboard" element={<ClienteDashboard />} />
          <Route path="/cliente/dre" element={<ClienteDRE />} />
          <Route path="/cliente/fluxo-caixa" element={<ClienteFluxoCaixa />} />
          <Route path="/cliente/bpo" element={<ClienteBPO />} />
          <Route path="/cliente/documentos" element={<ClienteDocumentos />} />
          <Route path="/cliente/financeiro" element={<Navigate to="/cliente/financeiro/contas-pagar" replace />} />
          <Route path="/cliente/financeiro/contas-pagar" element={<ClienteContasPagar />} />
          <Route path="/cliente/financeiro/contas-receber" element={<ClienteContasReceber />} />
          <Route path="/cliente/financeiro/agenda" element={<ClienteAgendaFinanceira />} />
          <Route path="/cliente/sangrias" element={<ClienteSangrias />} />
          <Route path="/cliente/suporte" element={<ClienteSuporte />} />
          <Route path="/cliente/usuarios" element={<ClienteUsuarios />} />
          <Route path="/cliente/tarefas" element={<ClienteTarefas />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
