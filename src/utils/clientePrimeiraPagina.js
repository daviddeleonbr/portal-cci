// Calcula a primeira página que o usuário cliente tem acesso, a partir
// das suas permissões + flags de exibição da empresa/rede. Reusa a mesma
// ordem da sidebar pra manter consistência: Visão Geral → Relatórios →
// Comercial → Financeiro → BPO → Atendimento → Administração.
//
// Usado:
//   - No login (`ClienteLogin.jsx`) pra decidir o destino após autenticar
//   - Como fallback quando o usuário tenta abrir `/dashboard` sem ter
//     a permissão `dashboard`

// Ordem canônica de páginas (mesma da ClienteSidebar). Cada item:
//   - rota:     caminho relativo (sem prefixo `/cliente/{tipo}`)
//   - permissao: chave em `session.usuario.permissoes` (null = sempre disponível)
//   - requerFlag: nome da flag no `cliente` (Webposto) ou `asRede` (Autosystem)
const PAGINAS_ORDEM = [
  { rota: '/dashboard',                  permissao: 'dashboard' },
  { rota: '/dre',                        permissao: 'dre',                  requerFlag: 'exibir_dre' },
  { rota: '/fluxo-caixa',                permissao: 'fluxo_caixa',          requerFlag: 'exibir_fluxo_caixa' },
  { rota: '/relatorios-bi',              permissao: 'relatorios_bi' },
  { rota: '/comercial/vendas',           permissao: 'comercial_vendas' },
  { rota: '/comercial/operacao',         permissao: 'comercial_operacao' },
  { rota: '/comercial/produtividade',    permissao: 'comercial_produtividade' },
  { rota: '/comercial/estoques',         permissao: 'comercial_estoques' },
  { rota: '/financeiro/contas-pagar',    permissao: 'financeiro' },
  { rota: '/financeiro/contas-receber',  permissao: 'financeiro' },
  { rota: '/sangrias',                   permissao: 'sangrias' },
  { rota: '/financeiro/notas-fiscais',   permissao: 'notas_fiscais' },
  { rota: '/bpo/outras-contas',          permissao: 'outras_contas' },
  { rota: '/bpo',                        permissao: 'bpo' },
  { rota: '/suporte',                    permissao: 'suporte' },
  // Sem permissão obrigatória (sempre aparecem na sidebar)
  { rota: '/melhorias',                  permissao: null },
  // Administração da rede (só pra quem gerencia)
  { rota: '/usuarios',                   permissao: 'gerenciar_usuarios' },
  { rota: '/configuracoes',              permissao: null },
];

// Resolve qual objeto de flags usar: Webposto → `session.cliente`,
// Autosystem → `session.asRede`.
function getFlagSource(session) {
  return session?.tipoCliente === 'autosystem' ? session?.asRede : session?.cliente;
}

// Retorna o path RELATIVO (sem prefixo de tipo) da primeira página
// permitida ao usuário. Se nada estiver permitido, devolve '/dashboard'
// como fallback (a página vai mostrar "Acesso restrito" via guard).
export function primeiraRotaPermitida(session) {
  const perms = new Set(session?.usuario?.permissoes || []);
  const flags = getFlagSource(session) || {};
  for (const pagina of PAGINAS_ORDEM) {
    if (pagina.permissao && !perms.has(pagina.permissao)) continue;
    if (pagina.requerFlag && !flags?.[pagina.requerFlag])  continue;
    return pagina.rota;
  }
  return '/dashboard';
}

// Versão com o prefixo `/cliente/{tipo}` aplicado. Ex: '/cliente/webposto/sangrias'.
export function primeiraPaginaPermitida(session) {
  const tipo = session?.tipoCliente || 'webposto';
  return `/cliente/${tipo}${primeiraRotaPermitida(session)}`;
}

// Versa o usuário tem acesso à página `/dashboard`?
export function temAcessoDashboard(session) {
  const perms = new Set(session?.usuario?.permissoes || []);
  return perms.has('dashboard');
}
