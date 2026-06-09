import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Landing
import LandingPage from './pages/LandingPage';
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
import RelatorioDRERede from './pages/RelatorioDRERede';
import RelatorioDREAsRede from './pages/RelatorioDREAsRede';
import RelatorioFluxoCaixaRede from './pages/RelatorioFluxoCaixaRede';
import RelatorioFluxoCaixaAsRede from './pages/RelatorioFluxoCaixaAsRede';
import RelatorioAnaliseIA from './pages/RelatorioAnaliseIA';
import RelatorioAnaliseLancamentosRede from './pages/RelatorioAnaliseLancamentosRede';
import CciPlanoContas from './pages/CciPlanoContas';
import CciFornecedores from './pages/CciFornecedores';
import CciContasPagar from './pages/CciContasPagar';
import CciMotivos from './pages/CciMotivos';
import CciUsuarios from './pages/CciUsuarios';
import BpoConciliacaoBancaria from './pages/BpoConciliacaoBancaria';
import BpoConciliacaoCaixas from './pages/BpoConciliacaoCaixas';
import BpoCaixaAdministrativo from './pages/BpoCaixaAdministrativo';
import BpoAlteracoesCaixas from './pages/BpoAlteracoesCaixas';
import CciRelatoriosBi from './pages/CciRelatoriosBi';
import CciNotificacoes from './pages/CciNotificacoes';
import CciMensagensIniciais from './pages/CciMensagensIniciais';
import CciMelhorias from './pages/CciMelhorias';
import CciUsoPortal from './pages/CciUsoPortal';
import ClienteMelhorias from './pages/cliente/ClienteMelhorias';
import AdminConfiguracoes from './pages/AdminConfiguracoes';

// Cliente
import ClienteLayout from './components/layout/cliente/ClienteLayout';
import ClienteLogin from './pages/cliente/ClienteLogin';
import ClienteRedefinirSenha from './pages/cliente/ClienteRedefinirSenha';
import ClienteCriarSenha from './pages/cliente/ClienteCriarSenha';
// Cliente Webposto
import WpDashboard from './pages/cliente/webposto/ClienteDashboard';
import WpDRE from './pages/cliente/webposto/ClienteDRE';
import WpFluxoCaixa from './pages/cliente/webposto/ClienteFluxoCaixa';
import WpBPO from './pages/cliente/webposto/ClienteBPO';
import WpDocumentos from './pages/cliente/webposto/ClienteDocumentos';
import WpContasPagar from './pages/cliente/webposto/ClienteContasPagar';
import WpContasReceber from './pages/cliente/webposto/ClienteContasReceber';
import WpSuporte from './pages/cliente/webposto/ClienteSuporte';
import WpSangrias from './pages/cliente/webposto/ClienteSangrias';
import WpUsuarios from './pages/cliente/webposto/ClienteUsuarios';
import WpComercialVendas from './pages/cliente/webposto/ClienteComercialVendas';
import WpComercialOperacao from './pages/cliente/webposto/ClienteComercialOperacao';
import WpComercialProdutividade from './pages/cliente/webposto/ClienteComercialProdutividade';
import WpEstoques from './pages/cliente/webposto/ClienteEstoques';
import WpNotasFiscais from './pages/cliente/webposto/ClienteNotasFiscais';
import WpNotaFiscalDetalhe from './pages/cliente/webposto/ClienteNotaFiscalDetalhe';
import AdminNfManifestacao from './pages/AdminNfManifestacao';
import AdminNfManifestacaoDetalhe from './pages/AdminNfManifestacaoDetalhe';
import WpOutrasContas from './pages/cliente/webposto/ClienteOutrasContas';
import AdminOutrasContas from './pages/AdminOutrasContas';
import AdminSuporte from './pages/AdminSuporte';
import AdminWebpostoSync from './pages/AdminWebpostoSync';
import AdminPortalDemo from './pages/AdminPortalDemo';
import WpConfiguracoes from './pages/cliente/webposto/ClienteConfiguracoes';
import ClienteRelatoriosBi from './pages/cliente/webposto/ClienteRelatoriosBi';
// Cliente Autosystem (esqueletos — implementados página a página)
import AsDashboard from './pages/cliente/autosystem/ClienteDashboard';
import AsDRE from './pages/cliente/autosystem/ClienteDRE';
import AsFluxoCaixa from './pages/cliente/autosystem/ClienteFluxoCaixa';
import AsBPO from './pages/cliente/autosystem/ClienteBPO';
import AsDocumentos from './pages/cliente/autosystem/ClienteDocumentos';
import AsContasPagar from './pages/cliente/autosystem/ClienteContasPagar';
import AsContasReceber from './pages/cliente/autosystem/ClienteContasReceber';
import AsSuporte from './pages/cliente/autosystem/ClienteSuporte';
import AsSangrias from './pages/cliente/autosystem/ClienteSangrias';
import AsUsuarios from './pages/cliente/autosystem/ClienteUsuarios';
import AsComercialVendas from './pages/cliente/autosystem/ClienteComercialVendas';
import AsComercialOperacao from './pages/cliente/autosystem/ClienteComercialOperacao';
import AsComercialProdutividade from './pages/cliente/autosystem/ClienteComercialProdutividade';
import AsEstoques from './pages/cliente/autosystem/ClienteEstoques';
import AsConfiguracoes from './pages/cliente/autosystem/ClienteConfiguracoes';

// Auth
import { RequireAdmin, RequireCliente, RequirePermissaoCliente, RequireDashboardCliente } from './components/auth/RequireAuth';
import ErrorBoundary from './components/ui/ErrorBoundary';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing comercial pública */}
        <Route path="/" element={<LandingPage />} />
        {/* Seletor de portais (admin / cliente) */}
        <Route path="/portais" element={<LandingPortal />} />

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
          <Route path="/admin/fiscal/manifestacao" element={<AdminNfManifestacao />} />
          <Route path="/admin/fiscal/manifestacao/:id" element={<AdminNfManifestacaoDetalhe />} />
          <Route path="/admin/bpo/outras-contas" element={<AdminOutrasContas />} />
          <Route path="/admin/suporte" element={<AdminSuporte />} />
          <Route path="/admin/webposto-sync" element={<AdminWebpostoSync />} />
          <Route path="/admin/portal-demo" element={<AdminPortalDemo />} />
          <Route path="/admin/fiscal/notas-fiscais" element={<NotasFiscais />} />
          <Route path="/admin/fiscal/agendamento" element={<NotasFiscais />} />

          {/* Relatorios Cliente (analises por empresa) */}
          <Route path="/admin/relatorios-cliente" element={<RelatoriosCliente />} />
          <Route path="/admin/relatorios-cliente/:clienteId" element={<ClienteRelatoriosHub />} />
          <Route path="/admin/relatorios-cliente/:clienteId/dre" element={<RelatorioDRE />} />
          <Route path="/admin/relatorios-cliente/:clienteId/analise-lancamentos" element={<RelatorioAnaliseLancamentos />} />
          <Route path="/admin/relatorios-cliente/:clienteId/fluxo-caixa" element={<RelatorioFluxoCaixa />} />
          <Route path="/admin/relatorios-cliente/rede/:chaveApiId/dre" element={<RelatorioDRERede />} />
          <Route path="/admin/relatorios-cliente/rede-as/:asRedeId/dre" element={<RelatorioDREAsRede />} />
          <Route path="/admin/relatorios-cliente/rede-as/:asRedeId/fluxo-caixa" element={<RelatorioFluxoCaixaAsRede />} />
          <Route path="/admin/relatorios-cliente/rede/:chaveApiId/fluxo-caixa" element={<RelatorioFluxoCaixaRede />} />
          <Route path="/admin/relatorios-cliente/:clienteId/analise-ia" element={<RelatorioAnaliseIA />} />
          <Route path="/admin/relatorios-cliente/rede/:chaveApiId/analise-ia" element={<RelatorioAnaliseIA modoRede={true} />} />
          <Route path="/admin/relatorios-cliente/rede/:chaveApiId/analise-lancamentos" element={<RelatorioAnaliseLancamentosRede />} />
          <Route path="/admin/relatorios-cliente/:clienteId/evolucao" element={<RelatorioEvolucaoMensal />} />

          {/* BPO */}
          <Route path="/admin/bpo/conciliacao-bancaria" element={<BpoConciliacaoBancaria />} />
          <Route path="/admin/bpo/conciliacao-caixas" element={<BpoConciliacaoCaixas />} />
          <Route path="/admin/bpo/caixa-administrativo" element={<BpoCaixaAdministrativo />} />
          <Route path="/admin/bpo/validacao-ofx" element={<Navigate to="/admin/bpo/conciliacao-bancaria?aba=ofx" replace />} />
          <Route path="/admin/bpo/alteracoes-caixas" element={<BpoAlteracoesCaixas />} />

          {/* Relatórios de BI (Power BI) */}
          <Route path="/admin/relatorios-bi" element={<CciRelatoriosBi />} />
          <Route path="/admin/contato" element={<Navigate to="/admin/configuracoes" replace />} />
          <Route path="/admin/configuracoes" element={<AdminConfiguracoes />} />
          <Route path="/admin/notificacoes" element={<CciNotificacoes />} />
          <Route path="/admin/mensagens-iniciais" element={<CciMensagensIniciais />} />
          <Route path="/admin/melhorias" element={<CciMelhorias />} />
          <Route path="/admin/uso-portal" element={<CciUsoPortal />} />

          {/* Relatorios (kept for compatibility) */}
          <Route path="/admin/relatorios" element={<Relatorios />} />
        </Route>

        {/* Cliente Portal */}
        <Route path="/cliente/login" element={<ClienteLogin />} />
        <Route path="/cliente/criar-senha" element={<ClienteCriarSenha />} />
        <Route path="/redefinir-senha" element={<ClienteRedefinirSenha />} />
        <Route path="/cliente/redefinir-senha" element={<ClienteRedefinirSenha />} />

        {/* Cliente Webposto */}
        <Route element={<RequireCliente><ClienteLayout /></RequireCliente>}>
          <Route path="/cliente/webposto/dashboard" element={<RequireDashboardCliente><WpDashboard /></RequireDashboardCliente>} />
          <Route path="/cliente/webposto/dre" element={<RequirePermissaoCliente permissao="dre"><WpDRE /></RequirePermissaoCliente>} />
          <Route path="/cliente/webposto/fluxo-caixa" element={<RequirePermissaoCliente permissao="fluxo_caixa"><WpFluxoCaixa /></RequirePermissaoCliente>} />
          <Route path="/cliente/webposto/bpo" element={<WpBPO />} />
          <Route path="/cliente/webposto/documentos" element={<WpDocumentos />} />
          <Route path="/cliente/webposto/financeiro" element={<Navigate to="/cliente/webposto/financeiro/contas-pagar" replace />} />
          <Route path="/cliente/webposto/financeiro/contas-pagar" element={<WpContasPagar />} />
          <Route path="/cliente/webposto/financeiro/contas-receber" element={<WpContasReceber />} />
          <Route path="/cliente/webposto/financeiro/notas-fiscais" element={<RequirePermissaoCliente permissao="notas_fiscais"><WpNotasFiscais /></RequirePermissaoCliente>} />
          <Route path="/cliente/webposto/financeiro/notas-fiscais/:id" element={<RequirePermissaoCliente permissao="notas_fiscais"><WpNotaFiscalDetalhe /></RequirePermissaoCliente>} />
          <Route path="/cliente/webposto/bpo/outras-contas" element={<RequirePermissaoCliente permissao="outras_contas"><WpOutrasContas /></RequirePermissaoCliente>} />
          <Route path="/cliente/webposto/sangrias" element={<RequirePermissaoCliente permissao="sangrias"><WpSangrias /></RequirePermissaoCliente>} />
          <Route path="/cliente/webposto/suporte" element={<WpSuporte />} />
          <Route path="/cliente/webposto/melhorias" element={<ClienteMelhorias />} />
          <Route path="/cliente/webposto/usuarios" element={<WpUsuarios />} />
          <Route path="/cliente/webposto/comercial" element={<Navigate to="/cliente/webposto/comercial/vendas" replace />} />
          <Route path="/cliente/webposto/comercial/vendas" element={<RequirePermissaoCliente permissao="comercial_vendas"><ErrorBoundary><WpComercialVendas /></ErrorBoundary></RequirePermissaoCliente>} />
          <Route path="/cliente/webposto/comercial/operacao" element={<RequirePermissaoCliente permissao="comercial_operacao"><WpComercialOperacao /></RequirePermissaoCliente>} />
          <Route path="/cliente/webposto/comercial/produtividade" element={<RequirePermissaoCliente permissao="comercial_produtividade"><WpComercialProdutividade /></RequirePermissaoCliente>} />
          <Route path="/cliente/webposto/comercial/estoques" element={<RequirePermissaoCliente permissao="comercial_estoques"><WpEstoques /></RequirePermissaoCliente>} />
          <Route path="/cliente/webposto/configuracoes" element={<WpConfiguracoes />} />
          <Route path="/cliente/webposto/relatorios-bi" element={<ClienteRelatoriosBi />} />

          {/* Cliente Autosystem */}
          <Route path="/cliente/autosystem/dashboard" element={<RequireDashboardCliente><AsDashboard /></RequireDashboardCliente>} />
          <Route path="/cliente/autosystem/dre" element={<RequirePermissaoCliente permissao="dre"><AsDRE /></RequirePermissaoCliente>} />
          <Route path="/cliente/autosystem/fluxo-caixa" element={<RequirePermissaoCliente permissao="fluxo_caixa"><AsFluxoCaixa /></RequirePermissaoCliente>} />
          <Route path="/cliente/autosystem/bpo" element={<AsBPO />} />
          <Route path="/cliente/autosystem/documentos" element={<AsDocumentos />} />
          <Route path="/cliente/autosystem/financeiro" element={<Navigate to="/cliente/autosystem/financeiro/contas-pagar" replace />} />
          <Route path="/cliente/autosystem/financeiro/contas-pagar" element={<AsContasPagar />} />
          <Route path="/cliente/autosystem/financeiro/contas-receber" element={<AsContasReceber />} />
          <Route path="/cliente/autosystem/sangrias" element={<RequirePermissaoCliente permissao="sangrias"><AsSangrias /></RequirePermissaoCliente>} />
          <Route path="/cliente/autosystem/suporte" element={<AsSuporte />} />
          <Route path="/cliente/autosystem/melhorias" element={<ClienteMelhorias />} />
          <Route path="/cliente/autosystem/usuarios" element={<AsUsuarios />} />
          <Route path="/cliente/autosystem/comercial" element={<Navigate to="/cliente/autosystem/comercial/vendas" replace />} />
          <Route path="/cliente/autosystem/comercial/vendas" element={<RequirePermissaoCliente permissao="comercial_vendas"><AsComercialVendas /></RequirePermissaoCliente>} />
          <Route path="/cliente/autosystem/comercial/operacao" element={<RequirePermissaoCliente permissao="comercial_operacao"><AsComercialOperacao /></RequirePermissaoCliente>} />
          <Route path="/cliente/autosystem/comercial/produtividade" element={<RequirePermissaoCliente permissao="comercial_produtividade"><AsComercialProdutividade /></RequirePermissaoCliente>} />
          <Route path="/cliente/autosystem/comercial/estoques" element={<RequirePermissaoCliente permissao="comercial_estoques"><AsEstoques /></RequirePermissaoCliente>} />
          <Route path="/cliente/autosystem/relatorios-bi" element={<ClienteRelatoriosBi />} />
          <Route path="/cliente/autosystem/configuracoes" element={<AsConfiguracoes />} />
        </Route>

        {/* Legacy redirects: /cliente/X → /cliente/webposto/X (URL antiga) */}
        <Route path="/cliente/dashboard" element={<Navigate to="/cliente/webposto/dashboard" replace />} />
        <Route path="/cliente/dre" element={<Navigate to="/cliente/webposto/dre" replace />} />
        <Route path="/cliente/fluxo-caixa" element={<Navigate to="/cliente/webposto/fluxo-caixa" replace />} />
        <Route path="/cliente/bpo" element={<Navigate to="/cliente/webposto/bpo" replace />} />
        <Route path="/cliente/documentos" element={<Navigate to="/cliente/webposto/documentos" replace />} />
        <Route path="/cliente/financeiro/contas-pagar" element={<Navigate to="/cliente/webposto/financeiro/contas-pagar" replace />} />
        <Route path="/cliente/financeiro/contas-receber" element={<Navigate to="/cliente/webposto/financeiro/contas-receber" replace />} />
        <Route path="/cliente/sangrias" element={<Navigate to="/cliente/webposto/sangrias" replace />} />
        <Route path="/cliente/suporte" element={<Navigate to="/cliente/webposto/suporte" replace />} />
        <Route path="/cliente/usuarios" element={<Navigate to="/cliente/webposto/usuarios" replace />} />
        <Route path="/cliente/comercial/vendas" element={<Navigate to="/cliente/webposto/comercial/vendas" replace />} />
        <Route path="/cliente/comercial/operacao" element={<Navigate to="/cliente/webposto/comercial/operacao" replace />} />
        <Route path="/cliente/comercial/produtividade" element={<Navigate to="/cliente/webposto/comercial/produtividade" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
