import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import { buildNavigation, filtrarNavegacao } from './clienteNavegacao';

// Barra inferior do portal do cliente — só no celular (<lg).
// Atalhos = itens marcados com `barraMobile` no menu (Tarefas, Sangrias,
// Notas, Outras contas), respeitando as mesmas permissões/flags da sidebar.
// "Mais" abre o drawer lateral, que no mobile esconde esses atalhos e
// mostra só o resto.
export default function ClienteBottomNav({ onMaisClick, maisAberto = false }) {
  const location = useLocation();
  const session = useClienteSession();
  const tipoCliente = session?.tipoCliente || 'webposto';
  const prefix = `/cliente/${tipoCliente}`;
  const flagSource = tipoCliente === 'autosystem' ? session?.asRede : session?.cliente;

  const atalhos = useMemo(() => {
    const nav = filtrarNavegacao(buildNavigation(prefix, tipoCliente), session?.usuario?.permissoes, flagSource);
    return nav.flatMap(s => s.items).filter(it => it.barraMobile && it.href);
  }, [prefix, tipoCliente, session?.usuario?.permissoes, flagSource]);

  const ativo = (href) => location.pathname === href || location.pathname.startsWith(href + '/');
  const algumAtalhoAtivo = atalhos.some(a => ativo(a.href));
  const maisAtivo = maisAberto || !algumAtalhoAtivo;

  // Contraste (WCAG AA, texto pequeno ≥ 4.5:1). `blue-*` = verde da marca (index.css):
  //  - ativo: blue-700 (#0d6159) sobre pílula blue-100 (#dcecea) → ~6.2:1
  //  - inativo: gray-600 (#4b5563) sobre branco → 7.6:1
  //  - dark: index.css troca p/ #8cbfb9 (ativo) e #94a3b8 (inativo) sobre #1e293b
  // O ativo também muda o peso da fonte e ganha a pílula — não depende só da cor.
  const base = 'flex flex-1 min-w-0 flex-col items-center justify-center gap-1 py-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700 rounded-lg';
  const cor = (on) => (on ? 'text-blue-700 font-semibold' : 'text-gray-600 font-medium active:text-gray-900');
  const pilula = (on) => `flex h-7 w-12 items-center justify-center rounded-full transition-colors ${on ? 'bg-blue-100' : ''}`;

  return (
    <nav
      aria-label="Navegação principal"
      className="lg:hidden fixed inset-x-0 bottom-0 z-[45] border-t border-gray-200 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-stretch h-16">
        {atalhos.map(item => {
          const Icon = item.icon;
          const on = !maisAberto && ativo(item.href);
          return (
            <NavLink key={item.href} to={item.href} className={`${base} ${cor(on)}`}>
              <span className={pilula(on)}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="truncate max-w-full px-1">{item.barraMobile}</span>
            </NavLink>
          );
        })}
        <button type="button" onClick={onMaisClick} aria-expanded={maisAberto}
          aria-label={maisAberto ? 'Fechar menu' : 'Mais opções do menu'}
          className={`${base} ${cor(maisAtivo)}`}>
          <span className={pilula(maisAtivo)}>
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
}
