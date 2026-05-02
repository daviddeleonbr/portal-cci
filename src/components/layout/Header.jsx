import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Menu, LogOut, Moon, Sun, EyeOff, Eye } from 'lucide-react';
import { useAdminSession } from '../../hooks/useAuth';
import { logoutAdmin } from '../../lib/auth';
import { useTheme } from '../../hooks/useTheme';
import { useAnonimizador } from '../../services/anonimizarService';

export default function Header({ onMenuClick }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userRef = useRef(null);
  const navigate = useNavigate();
  const session = useAdminSession();
  const usuario = session?.usuario;

  useEffect(() => {
    const handler = (e) => {
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const nome = usuario?.nome || 'Usuário';
  const email = usuario?.email || '';
  const initials = nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const { tema, alternar } = useTheme();
  const escuro = tema === 'dark';
  const { ativo: demoAtivo, setAtivo: setDemoAtivo } = useAnonimizador();

  const handleLogout = () => {
    logoutAdmin();
    navigate('/admin', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden rounded p-2 text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setDemoAtivo(!demoAtivo)}
          title={demoAtivo ? 'Desligar modo demonstração (mostrar dados reais)' : 'Ligar modo demonstração (mascarar nome/CNPJ)'}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            demoAtivo
              ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
              : 'text-gray-500 hover:bg-gray-100 border border-transparent'
          }`}>
          {demoAtivo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="hidden sm:inline">{demoAtivo ? 'Modo demo' : 'Demo'}</span>
        </button>

        <button onClick={alternar}
          title={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          className="rounded p-2 text-gray-500 hover:bg-gray-100 transition-colors">
          {escuro ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5" />}
        </button>

        <button className="relative rounded p-2 text-gray-500 hover:bg-gray-100 transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-600" />
        </button>

        <div ref={userRef} className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-semibold shadow-sm hover:shadow-md transition-shadow"
          >
            {initials}
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full mt-2 w-56 bg-white rounded border border-gray-200/70 shadow-lg z-50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">{nome}</p>
                  <p className="text-xs text-gray-500 truncate">{email}</p>
                </div>
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <LogOut className="h-4 w-4 text-gray-400" />
                  <span>Sair</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
