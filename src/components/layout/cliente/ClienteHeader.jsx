import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Menu, LogOut, Moon, Sun, Building2, ChevronDown, Check } from 'lucide-react';
import { clienteNotificacoes } from '../../../data/clienteMockData';
import { useClienteSession } from '../../../hooks/useAuth';
import { logoutCliente, trocarEmpresaAtiva } from '../../../lib/auth';
import { useTheme } from '../../../hooks/useTheme';

export default function ClienteHeader({ onMenuClick }) {
  const [showNotifs, setShowNotifs] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [empresaMenuOpen, setEmpresaMenuOpen] = useState(false);
  const notifRef = useRef(null);
  const userRef = useRef(null);
  const empresaRef = useRef(null);
  const navigate = useNavigate();
  const session = useClienteSession();
  const cliente = session?.cliente;
  const clientesRede = session?.clientesRede || [];
  const usuario = session?.usuario;
  const podeTrocarEmpresa = !!usuario?.permissoes?.includes('trocar_empresa') && clientesRede.length > 1;
  const { tema, alternar } = useTheme();
  const escuro = tema === 'dark';
  const unread = clienteNotificacoes.filter(n => !n.lida).length;
  const nomeCliente = cliente?.nome || 'Cliente';
  const cnpjCliente = cliente?.cnpj || '';
  const regimeCliente = cliente?.regime_tributario || '';
  const initials = nomeCliente.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = () => {
    logoutCliente();
    navigate('/cliente/login', { replace: true });
  };

  const handleTrocarEmpresa = (empId) => {
    trocarEmpresaAtiva(empId);
    setEmpresaMenuOpen(false);
  };

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false);
      if (empresaRef.current && !empresaRef.current.contains(e.target)) setEmpresaMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden rounded p-2 text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        {podeTrocarEmpresa ? (
          <div ref={empresaRef} className="relative hidden sm:block">
            <button onClick={() => setEmpresaMenuOpen(!empresaMenuOpen)}
              className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 hover:border-blue-300 hover:shadow-sm transition-all">
              <Building2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate max-w-[200px]">{nomeCliente}</p>
                <p className="text-[10px] text-gray-500 truncate max-w-[200px]">{cnpjCliente}</p>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${empresaMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {empresaMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200/70 shadow-xl z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Empresas da rede</p>
                    <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{session?.chaveApi?.nome || '—'}</p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {clientesRede.map(emp => {
                      const ativa = emp.id === cliente?.id;
                      return (
                        <button key={emp.id} onClick={() => handleTrocarEmpresa(emp.id)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${ativa ? 'bg-blue-50/60' : ''}`}>
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            ativa ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm'
                                  : 'bg-gray-100 text-gray-500'
                          }`}>
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${ativa ? 'text-blue-900' : 'text-gray-800'}`}>
                              {emp.nome}
                            </p>
                            {emp.cnpj && <p className="text-[10px] text-gray-400 font-mono truncate">{emp.cnpj}</p>}
                          </div>
                          {ativa && <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-gray-900">{nomeCliente}</p>
            <p className="text-xs text-gray-500">{cnpjCliente}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button onClick={alternar}
          title={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          className="rounded p-2 text-gray-500 hover:bg-gray-100 transition-colors">
          {escuro ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative rounded p-2 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifs && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-100 shadow-xl overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-sm font-semibold text-gray-900">Notificações</p>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                  {clienteNotificacoes.map(n => (
                    <div key={n.id} className={`px-4 py-3 hover:bg-gray-50/50 transition-colors ${!n.lida ? 'bg-blue-50/30' : ''}`}>
                      <div className="flex items-start gap-2">
                        <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                          n.tipo === 'alerta' ? 'bg-amber-500' : n.tipo === 'sucesso' ? 'bg-emerald-500' : 'bg-blue-500'
                        }`} />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{n.titulo}</p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.mensagem}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{n.data}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User menu */}
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
                className="absolute right-0 top-full mt-2 w-64 bg-white rounded border border-gray-200/70 shadow-lg z-50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">{nomeCliente}</p>
                  <p className="text-xs text-gray-500 truncate">{cnpjCliente}</p>
                  {regimeCliente && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] rounded px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100">
                        {regimeCliente}
                      </span>
                    </div>
                  )}
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
