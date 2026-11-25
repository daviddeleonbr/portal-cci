import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import ClienteSidebar from './ClienteSidebar';
import ClienteHeader from './ClienteHeader';
import ClienteBottomNav from './ClienteBottomNav';
import ModalNovidades from '../../ui/ModalNovidades';
import PrefetcherWebposto from './PrefetcherWebposto';
import BannerModoDemo from './BannerModoDemo';
import ModalPendenciasLogin from './ModalPendenciasLogin';
import ModalResumoDia from './ModalResumoDia';
import { useClienteSession } from '../../../hooks/useAuth';
import { useBadgesCliente } from '../../../hooks/useBadgesCliente';
import { registrarPageview } from '../../../services/usoPortalService';
import { EmpresaAtivaProvider } from '../../../contexts/EmpresaAtivaContext';
import { useModoMenu, classesModoMenu } from '../../../lib/modoMenu';

export default function ClienteLayout() {
  // Desktop: sidebar recolhida que expande ao passar o mouse (sem estado).
  // mobileOpen: drawer overlay no mobile.
  const [mobileOpen, setMobileOpen] = useState(false);
  // Recuo do conteúdo conforme o modo do menu no desktop (Expandido empurra 260px)
  const margemMenu = classesModoMenu(useModoMenu('cliente')).margem;

  // Telemetria: 1 pageview a cada mudança de rota (fire-and-forget).
  // Painel admin consulta em /admin/uso-portal.
  const location = useLocation();
  const session = useClienteSession();
  const badges = useBadgesCliente();
  useEffect(() => {
    if (!session?.usuario?.id) return;
    registrarPageview({
      usuario: session.usuario,
      tipoCliente: session.tipoCliente,
      chaveApi: session.chaveApi,
      asRede:   session.asRede,
      cliente:  session.cliente,
      path: location.pathname,
    });
  }, [location.pathname, session?.usuario?.id, session?.cliente?.id]);

  // Fecha drawer mobile ao navegar
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <EmpresaAtivaProvider><div className="min-h-screen relative app-bg app-bg-cliente">
      <BannerModoDemo />
      {/* Fundo cinza claro liso (app-bg-cliente) — sem as manchas teal decorativas */}

      <ModalNovidades />
      <ModalPendenciasLogin />
      <ModalResumoDia />
      <PrefetcherWebposto />

      {/* Backdrop mobile */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <ClienteSidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        badges={badges}
      />
      {/* Margem = largura recolhida; a sidebar expandida (hover) sobrepõe o conteúdo */}
      <div className={`relative ${margemMenu} lg:transition-[margin] lg:duration-300`}>
        <ClienteHeader />
        {/* pb extra no mobile: espaço da barra inferior fixa (+ safe-area do iPhone) */}
        <main className="p-4 sm:p-6 lg:p-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8">
          {/* Fade simples (sem transform) — um `transform` remanescente do
              framer-motion viraria containing block e quebraria `position: sticky`
              das barras de filtro fixas das páginas. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      <ClienteBottomNav
        maisAberto={mobileOpen}
        onMaisClick={() => setMobileOpen(v => !v)}
        badges={badges}
      />
    </div></EmpresaAtivaProvider>
  );
}
