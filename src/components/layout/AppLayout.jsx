import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen relative app-bg">
      {/* Decorative background - gradient mesh */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Soft blurred color blobs */}
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-blue-400/15 blur-[100px]" />
        <div className="absolute top-[30%] left-[20%] w-[450px] h-[450px] rounded-full bg-indigo-400/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[15%] w-[400px] h-[400px] rounded-full bg-cyan-300/10 blur-[100px]" />
        <div className="absolute bottom-[20%] left-[-5%] w-[350px] h-[350px] rounded-full bg-violet-300/10 blur-[100px]" />

        {/* Soft vignette */}
        <div className="absolute inset-0 app-vignette" />
      </div>

      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div
        className={`relative transition-all duration-300 ${
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'
        }`}
      >
        <Header onMenuClick={() => setCollapsed(!collapsed)} />
        <main className="p-6 lg:p-8">
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
