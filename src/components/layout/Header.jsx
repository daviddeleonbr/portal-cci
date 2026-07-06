import { Menu, Moon, Sun, EyeOff, Eye } from 'lucide-react';
import { useAdminSession } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { useAnonimizador } from '../../services/anonimizarService';
import NotificacoesBell from '../ui/NotificacoesBell';
import { usePageHeader } from './PageHeaderContext';

export default function Header({ onMenuClick }) {
  const session = useAdminSession();
  const usuario = session?.usuario;
  const { tema, alternar } = useTheme();
  const escuro = tema === 'dark';
  const { ativo: demoAtivo, setAtivo: setDemoAtivo } = useAnonimizador();
  const { title: pageTitle, description: pageDescription } = usePageHeader();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md px-6">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <button
          onClick={onMenuClick}
          className="lg:hidden rounded p-2 text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* Título da página — elevado pelo <PageHeader> via context.
            Fonte menor pra ficar fluido no topbar. */}
        {pageTitle && (
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 leading-tight truncate">{pageTitle}</h1>
            {pageDescription && (
              <p className="text-[11px] text-gray-500 leading-tight truncate">{pageDescription}</p>
            )}
          </div>
        )}
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

        <NotificacoesBell usuarioId={usuario?.id} tema="admin" />
      </div>
    </header>
  );
}
