import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import { navegacaoDaSessao, hrefAtivoDoMenu, itensBarraMobile } from './clienteNavegacao';

// Barra inferior do portal do cliente — só no celular (<lg).
// No máximo 5 ícones: até 4 atalhos do que o usuário pode acessar + "Mais",
// sempre no fim (regra em itensBarraMobile). "Mais" abre a gaveta com o resto
// do menu, o perfil e o sair.
export default function ClienteBottomNav({ onMaisClick, maisAberto = false, badges = {} }) {
  const { pathname } = useLocation();
  const session = useClienteSession();
  const navigation = useMemo(() => navegacaoDaSessao(session), [session]);
  const atalhos = useMemo(() => itensBarraMobile(navigation), [navigation]);
  const hrefAtivo = hrefAtivoDoMenu(navigation, pathname);

  const ativo = (href) => href === hrefAtivo;
  const algumAtalhoAtivo = atalhos.some(a => ativo(a.href));
  const maisAtivo = maisAberto || !algumAtalhoAtivo;

  // Barra VERDE da marca (#10766e) nos dois temas — a mesma cor do manifest
  // (theme_color), que o Android usa na barra de navegação do sistema logo
  // abaixo: as duas ficam contínuas no claro e no escuro. Cores em valores
  // fixos ([#…]) de propósito: as classes nomeadas (bg-white, text-blue-700…)
  // são trocadas pelo tema escuro no index.css.
  // Contraste (WCAG AA, texto pequeno ≥ 4.5:1):
  //  - texto branco sobre #10766e → 5.5:1 (inativo a 90% → ~4.7:1)
  //  - ativo: ícone #10766e na pílula branca → 5.5:1; rótulo branco em negrito
  const base = 'flex flex-1 min-w-0 flex-col items-center justify-center gap-1 py-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffffff] rounded-lg';
  const cor = (on) => (on ? 'text-[#ffffff] font-semibold' : 'text-[#ffffff]/90 font-medium active:text-[#ffffff]');
  const pilula = (on) => `flex h-7 w-12 items-center justify-center rounded-full transition-colors ${on ? 'bg-[#ffffff] text-[#10766e]' : ''}`;

  return (
    <nav
      aria-label="Navegação principal"
      className="lg:hidden fixed inset-x-0 bottom-0 z-[45] bg-[#10766e] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-stretch h-16">
        {atalhos.map(item => {
          const Icon = item.icon;
          const on = !maisAberto && ativo(item.href);
          const badge = item.badgeKey ? badges[item.badgeKey] || 0 : 0;
          return (
            <NavLink key={item.href} to={item.href} aria-label={badge > 0 ? `${item.name}, ${badge} em aberto` : item.name} className={`${base} ${cor(on)}`}>
              <span className={`relative ${pilula(on)}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {badge > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#be123c] px-1 text-[10px] font-bold text-[#ffffff] tabular-nums" aria-hidden="true">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full px-0.5 tracking-tight">{item.curto || item.name}</span>
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
