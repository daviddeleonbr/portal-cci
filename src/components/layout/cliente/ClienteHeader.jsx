import { useEffect, useState } from 'react';
import { Moon, Sun, Building2, Tag } from 'lucide-react';
import LogoCCI from '../../ui/LogoCCI';
import { useClienteSession } from '../../../hooks/useAuth';
import NotificacoesBell from '../../ui/NotificacoesBell';
import BotaoInstalarApp from '../../cliente/BotaoInstalarApp';
import { useTheme } from '../../../hooks/useTheme';
import { useUsarApelido, toggleUsarApelido } from '../../../lib/apelidoPref';

// "Bom dia" (até 12h) / "Boa tarde" (até 18h) / "Boa noite" — horário de
// Brasília; reavalia a cada minuto, então muda sozinha com o portal aberto.
const horaBR = () => Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date()));
const saudacaoDe = (h) => (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite');
function useSaudacao() {
  const [saudacao, setSaudacao] = useState(() => saudacaoDe(horaBR()));
  useEffect(() => {
    const id = setInterval(() => setSaudacao(saudacaoDe(horaBR())), 60_000);
    return () => clearInterval(id);
  }, []);
  return saudacao;
}

export default function ClienteHeader() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const clientesRede = session?.clientesRede || [];
  const usuario = session?.usuario;
  const tipoCliente = session?.tipoCliente || 'webposto';
  const { tema, alternar } = useTheme();
  const escuro = tema === 'dark';
  const usarApelido = useUsarApelido();
  // Só mostra o toggle quando há ao menos um apelido cadastrado na rede.
  const temApelidos = clientesRede.some(c => c.apelido && String(c.apelido).trim());
  const nomeCliente = cliente?.nome || 'Cliente';
  const cnpjCliente = cliente?.cnpj || '';
  const nomeRede = tipoCliente === 'autosystem' ? (session?.asRede?.nome || 'Rede Autosystem') : (session?.chaveApi?.nome || nomeCliente);
  const primeiroNome = String(usuario?.nome || '').trim().split(/\s+/)[0] || '';
  const saudacao = useSaudacao();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-100 bg-white px-3 sm:px-6">
      {/* Celular: logo + saudação + rede (o menu abre pelo "Mais" da barra inferior) */}
      <div className="flex md:hidden items-center gap-2.5 min-w-0 flex-1">
        <LogoCCI className="h-9 w-9 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight text-gray-900 truncate">
            {saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}
          </p>
          <p className="text-xs leading-tight text-gray-500 truncate">{nomeRede}</p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
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
        {/* Toggle global: Razão social ↔ Apelido (só quando há apelidos) */}
        {temApelidos && (
          <button onClick={toggleUsarApelido}
            title={usarApelido ? 'Exibindo apelidos — clique para razão social' : 'Exibindo razão social — clique para apelidos'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-colors ${
              usarApelido ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
            }`}>
            <Tag className="h-4 w-4" />
            <span className="hidden sm:inline">{usarApelido ? 'Apelido' : 'Razão social'}</span>
          </button>
        )}

        {/* Instalar o app (só quando ainda não instalado — ver BotaoInstalarApp) */}
        <BotaoInstalarApp />

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
