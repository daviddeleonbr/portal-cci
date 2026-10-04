import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Header from './Header';
import { PageHeaderProvider } from './PageHeaderContext';

export default function AppLayout() {
  // Desktop: sidebar recolhida que expande ao passar o mouse (sem estado).
  // Mobile: gaveta aberta pelo botão de menu do Header.
  // A gaveta guarda a rota em que foi aberta: navegar para outra rota a fecha
  // sozinha (estado derivado, sem setState em effect).
  const location = useLocation();
  const [abertoEm, setAbertoEm] = useState(null);
  const mobileOpen = abertoEm === location.pathname;
  const setMobileOpen = (abrir) => setAbertoEm(abrir ? location.pathname : null);

  return (
    <PageHeaderProvider><div className="min-h-screen relative app-bg">
      {/* Decorative background - gradient mesh */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Soft blurred color blobs */}
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-blue-400/15 blur-[100px]" />
        <div className="absolute top-[30%] left-[20%] w-[450px] h-[450px] rounded-full bg-blue-400/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[15%] w-[400px] h-[400px] rounded-full bg-blue-300/10 blur-[100px]" />
        <div className="absolute bottom-[20%] left-[-5%] w-[350px] h-[350px] rounded-full bg-blue-300/10 blur-[100px]" />

        {/* Soft vignette */}
        <div className="absolute inset-0 app-vignette" />
      </div>

      {/* Backdrop mobile */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      {/* Margem = largura recolhida; a sidebar expandida (hover) sobrepõe o conteúdo */}
      <div className="relative lg:ml-16">
        <Header onMenuClick={() => setMobileOpen(true)} />
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
    </div></PageHeaderProvider>
  );
}
