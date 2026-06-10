import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import ClienteSidebar from './ClienteSidebar';
import ClienteHeader from './ClienteHeader';
import ModalNovidades from '../../ui/ModalNovidades';
import PrefetcherWebposto from './PrefetcherWebposto';
import BannerModoDemo from './BannerModoDemo';
import ModalPendenciasLogin from './ModalPendenciasLogin';
import { useClienteSession } from '../../../hooks/useAuth';
import { registrarPageview } from '../../../services/usoPortalService';

export default function ClienteLayout() {
  // collapsed: controla largura no desktop (≥lg). mobileOpen: drawer overlay no mobile.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Telemetria: 1 pageview a cada mudança de rota (fire-and-forget).
  // Painel admin consulta em /admin/uso-portal.
  const location = useLocation();
  const session = useClienteSession();
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
    <div className="min-h-screen relative app-bg">
      <BannerModoDemo />
      {/* Decorative background - gradient mesh */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-blue-400/15 blur-[100px]" />
        <div className="absolute top-[30%] left-[20%] w-[450px] h-[450px] rounded-full bg-blue-400/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[15%] w-[400px] h-[400px] rounded-full bg-blue-300/10 blur-[100px]" />
        <div className="absolute bottom-[20%] left-[-5%] w-[350px] h-[350px] rounded-full bg-blue-300/10 blur-[100px]" />
        <div className="absolute inset-0 app-vignette" />
      </div>

      <ModalNovidades />
      <ModalPendenciasLogin />
      <PrefetcherWebposto />

      {/* Backdrop mobile */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <ClienteSidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setCollapsed(!collapsed)}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div
        className={`relative transition-all duration-300 ${
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'
        }`}
      >
        <ClienteHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
