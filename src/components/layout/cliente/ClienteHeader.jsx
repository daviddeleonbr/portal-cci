import { Menu, Moon, Sun, Building2 } from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import NotificacoesBell from '../../ui/NotificacoesBell';
import { useTheme } from '../../../hooks/useTheme';

export default function ClienteHeader({ onMenuClick }) {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const clientesRede = session?.clientesRede || [];
  const usuario = session?.usuario;
  const tipoCliente = session?.tipoCliente || 'webposto';
  const { tema, alternar } = useTheme();
  const escuro = tema === 'dark';
  const nomeCliente = cliente?.nome || 'Cliente';
  const cnpjCliente = cliente?.cnpj || '';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md px-3 sm:px-6">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
        <button
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="lg:hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <Menu className="h-5 w-5" />
        </button>
        {tipoCliente === 'autosystem' ? (
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white flex-shrink-0">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate max-w-[160px] sm:max-w-none">{session?.asRede?.nome || 'Rede Autosystem'}</p>
              <p className="hidden sm:block text-[10px] text-gray-500">{clientesRede.length} empresa{clientesRede.length === 1 ? '' : 's'} na rede</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white flex-shrink-0">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate max-w-[160px] sm:max-w-none">
                {session?.chaveApi?.nome || nomeCliente}
              </p>
              <p className="hidden sm:block text-[10px] text-gray-500">
                {clientesRede.length > 0
                  ? `${clientesRede.length} empresa${clientesRede.length === 1 ? '' : 's'} na rede`
                  : cnpjCliente}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {/* Theme toggle */}
        <button onClick={alternar}
          title={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          className="rounded p-2 text-gray-500 hover:bg-gray-100 transition-colors">
          {escuro ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5" />}
        </button>

        <NotificacoesBell usuarioId={usuario?.id} tema="cliente" />
      </div>
    </header>
  );
}
