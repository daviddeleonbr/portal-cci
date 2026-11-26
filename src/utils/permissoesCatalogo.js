// Organização das permissões para a tela de acessos (auditoria 26/11/2026,
// docs/seguranca/AUDITORIA_PERMISSOES.md). NÃO cria chaves: só agrupa, descreve
// e liga dependências das chaves que já existem em PERMISSOES_ADMIN/CLIENTE.
//   modulo   : categoria na tela (ordem = MODULOS_*)
//   desc     : uma linha do que a permissão libera
//   acao     : ver | criar | editar | aprovar | administrar
//   restrita : dá acesso a dado sensível (senhas, usuários, configuração)
//   depende  : chaves que precisam estar marcadas (a tela marca/desmarca junto)

export const MODULOS_CLIENTE = [
  'Principal', 'Relatórios e indicadores', 'Comercial', 'Compras', 'Estoque',
  'Operacional', 'Financeiro', 'Gestão de usuários', 'Administração da rede',
];
export const MODULOS_ADMIN = [
  'Principal', 'Cadastros', 'Gestão interna', 'Gestão de usuários', 'Financeiro da CCI',
  'Relatórios e indicadores', 'Consultoria', 'Operacional (BPO)', 'Financeiro (BPO)', 'Administração e configurações',
];

const META_CLIENTE = {
  dashboard:                  { modulo: 'Principal', acao: 'ver', desc: 'Painel inicial com os indicadores da empresa.' },
  tarefas:                    { modulo: 'Principal', acao: 'editar', desc: 'Rotinas definidas pela CCI; também permite ser responsável por tarefas.' },
  pendencias:                 { modulo: 'Principal', acao: 'ver', desc: 'Pendências abertas pela CCI.' },
  dre:                        { modulo: 'Relatórios e indicadores', acao: 'ver', desc: 'Demonstração do resultado.' },
  fluxo_caixa:                { modulo: 'Relatórios e indicadores', acao: 'ver', desc: 'Entradas e saídas realizadas e projetadas.' },
  relatorios_bi:              { modulo: 'Relatórios e indicadores', acao: 'ver', desc: 'Painéis do Power BI.' },
  comercial_vendas:           { modulo: 'Comercial', acao: 'ver', desc: 'Vendas por período, produto e forma de pagamento.' },
  comercial_operacao:         { modulo: 'Comercial', acao: 'ver', desc: 'Indicadores de operação da pista e loja.' },
  comercial_produtividade:    { modulo: 'Comercial', acao: 'ver', desc: 'Produtividade dos frentistas e da conveniência.' },
  compras:                    { modulo: 'Compras', acao: 'criar', desc: 'Montar pedidos de compra (Autosystem).' },
  compras_liberar:            { modulo: 'Compras', acao: 'aprovar', desc: 'Liberar pedidos montados por outros.', depende: ['compras'] },
  comercial_estoques:         { modulo: 'Estoque', acao: 'ver', desc: 'Análise de estoques por categoria.' },
  sangrias:                   { modulo: 'Operacional', acao: 'editar', desc: 'Lançar a contagem das sangrias e confirmar.' },
  sangrias_consultar:         { modulo: 'Operacional', acao: 'ver', desc: 'Só consultar as conferências já enviadas.' },
  sangrias_tarefa_deposito:   { modulo: 'Operacional', acao: 'criar', desc: 'Criar a tarefa de depósito ao confirmar a contagem.', depende: ['sangrias'] },
  fechamento_caixa:           { modulo: 'Operacional', acao: 'ver', desc: 'Vendas, recebimentos, ajustes e aferições do dia; resumo diário.' },
  lmc:                        { modulo: 'Operacional', acao: 'ver', desc: 'Livro de movimentação de combustíveis (Webposto).' },
  lmc_editar:                 { modulo: 'Operacional', acao: 'editar', desc: 'Lançar o escritural real e o motivo no LMC gerencial.', depende: ['lmc'] },
  notas_fiscais:              { modulo: 'Operacional', acao: 'editar', desc: 'Manifestação das notas de entrada.' },
  documentos:                 { modulo: 'Operacional', acao: 'ver', desc: 'Documentos compartilhados pela CCI.' },
  bpo:                        { modulo: 'Operacional', acao: 'ver', desc: 'Serviços BPO contratados.' },
  financeiro:                 { modulo: 'Financeiro', acao: 'ver', desc: 'Contas a pagar e a receber e cards financeiros do painel.' },
  bpo_contas_pagar:           { modulo: 'Financeiro', acao: 'ver', desc: 'Agenda de pagamentos do BPO.' },
  bpo_contas_pagar_autorizar: { modulo: 'Financeiro', acao: 'aprovar', desc: 'Marcar pagamentos como autorizados no banco.', depende: ['bpo_contas_pagar'] },
  bpo_contas_receber:         { modulo: 'Financeiro', acao: 'ver', desc: 'Clientes a prazo em aberto.' },
  outras_contas:              { modulo: 'Financeiro', acao: 'editar', desc: 'Lançar, editar e excluir outras contas a pagar (Webposto).' },
  acessos:                    { modulo: 'Financeiro', acao: 'editar', desc: 'Ver e editar logins e senhas de adquirentes e plataformas.', restrita: true },
  gerenciar_usuarios:         { modulo: 'Gestão de usuários', acao: 'administrar', desc: 'Criar e editar usuários da rede (só concede o que tiver).', restrita: true },
  trocar_empresa:             { modulo: 'Administração da rede', acao: 'ver', desc: 'Alternar entre as empresas liberadas.' },
  configuracoes:              { modulo: 'Administração da rede', acao: 'administrar', desc: 'Configurações da rede.', restrita: true },
};

const META_ADMIN = {
  dashboard:            { modulo: 'Principal', acao: 'ver', desc: 'Painel inicial do portal admin.' },
  fiscal:               { modulo: 'Principal', acao: 'editar', desc: 'Notas fiscais da CCI e agendamento; também o conteúdo do painel.' },
  clientes:             { modulo: 'Cadastros', acao: 'editar', desc: 'Empresas, redes e integrações.' },
  colaboradores:        { modulo: 'Cadastros', acao: 'editar', desc: 'Equipe da CCI.' },
  fornecedores:         { modulo: 'Cadastros', acao: 'editar', desc: 'Fornecedores da CCI.' },
  plano_contas:         { modulo: 'Cadastros', acao: 'editar', desc: 'Plano de contas da CCI.' },
  motivos:              { modulo: 'Cadastros', acao: 'editar', desc: 'Motivos de movimentação.' },
  usuarios:             { modulo: 'Gestão de usuários', acao: 'administrar', desc: 'Aba Usuários em Cadastros (a gestão exige nível 2 ou 3).', restrita: true },
  contas_pagar:         { modulo: 'Financeiro da CCI', acao: 'editar', desc: 'Financeiro da CCI: contas a pagar, a receber e boletos.' },
  contas_receber:       { modulo: 'Financeiro da CCI', acao: 'ver', desc: 'Cobranças do Banco Inter.' },
  portal_demo:          { modulo: 'Gestão interna', acao: 'ver', desc: 'Ver o portal do cliente como demonstração.' },
  pendencias:           { modulo: 'Consultoria', acao: 'editar', desc: 'Abrir e acompanhar pendências com os clientes.' },
  contratos:            { modulo: 'Gestão interna', acao: 'editar', desc: 'Contratos ativos, propostas e catálogo de serviços.' },
  banco_inter:          { modulo: 'Financeiro da CCI', acao: 'aprovar', desc: 'Extrato e saldo do Banco Inter da CCI.', restrita: true, depende: ['contas_pagar'] },
  relatorios_cliente:   { modulo: 'Relatórios e indicadores', acao: 'ver', desc: 'DRE, fluxo de caixa e análise de lançamentos dos clientes.' },
  analise_ia:           { modulo: 'Relatórios e indicadores', acao: 'ver', desc: 'Análises com IA (Controller).', depende: ['relatorios_cliente'] },
  relatorios_bi:        { modulo: 'Relatórios e indicadores', acao: 'ver', desc: 'Painéis do Power BI.' },
  tarefas:              { modulo: 'Operacional (BPO)', acao: 'editar', desc: 'Rotinas e validação dos funcionários dos clientes.' },
  conciliacao_caixas:   { modulo: 'Operacional (BPO)', acao: 'editar', desc: 'Conciliação e relatório geral de caixas.' },
  lmc:                  { modulo: 'Operacional (BPO)', acao: 'ver', desc: 'LMC dos clientes Webposto.' },
  notas_fiscais:        { modulo: 'Operacional (BPO)', acao: 'aprovar', desc: 'Validar e lançar a manifestação de notas.' },
  caixa_administrativo: { modulo: 'Operacional (BPO)', acao: 'editar', desc: 'Caixa administrativo dos clientes.' },
  bpo_contas_pagar:     { modulo: 'Financeiro (BPO)', acao: 'editar', desc: 'Agenda e inclusão no banco para autorização.' },
  bpo_contas_receber:   { modulo: 'Financeiro (BPO)', acao: 'ver', desc: 'Notas a prazo, faturas, cheques e cartões dos clientes.' },
  outras_contas:        { modulo: 'Financeiro (BPO)', acao: 'editar', desc: 'Outras contas a pagar dos clientes.' },
  acessos:              { modulo: 'Financeiro (BPO)', acao: 'editar', desc: 'Logins e senhas de adquirentes e plataformas dos clientes.', restrita: true },
  parametros:           { modulo: 'Administração e configurações', acao: 'administrar', desc: 'Máscaras, mapeamentos e configurações gerais.', restrita: true },
  uso_portal:           { modulo: 'Administração e configurações', acao: 'ver', desc: 'Analytics de uso do portal.' },
  webposto_sync:        { modulo: 'Administração e configurações', acao: 'administrar', desc: 'Sincronia do cache de vendas Webposto.', restrita: true },
};

export const ROTULO_ACAO = { ver: 'Visualizar', criar: 'Criar', editar: 'Editar', aprovar: 'Aprovar', administrar: 'Administrar' };

export function metaPermissao(tipo, key) {
  return (tipo === 'cliente' ? META_CLIENTE : META_ADMIN)[key] || {};
}

// Catálogo → [{ modulo, itens: [{ ...item, desc, acao, restrita, depende }] }]
// na ordem dos módulos (o que não tiver módulo cai em "Outras").
export function organizarCatalogo(catalogo, tipo) {
  const ordem = tipo === 'cliente' ? MODULOS_CLIENTE : MODULOS_ADMIN;
  const grupos = new Map(ordem.map(m => [m, []]));
  (catalogo || []).forEach(p => {
    const meta = metaPermissao(tipo, p.key);
    const modulo = meta.modulo || 'Outras';
    if (!grupos.has(modulo)) grupos.set(modulo, []);
    grupos.get(modulo).push({ ...p, ...meta, modulo });
  });
  return [...grupos].filter(([, itens]) => itens.length).map(([modulo, itens]) => ({ modulo, itens }));
}

// Liga/desliga uma permissão respeitando dependências:
//   ligar    → liga também o que ela exige (recursivo)
//   desligar → desliga também quem depende dela e as abas dela
// `catalogo` com as abas (p.abas). Retorna novo array.
export function alternarPermissao(selecionadas, key, ligar, catalogo, tipo) {
  const sel = new Set(selecionadas || []);
  const abasDe = (k) => (catalogo.find(p => p.key === k)?.abas || []).map(a => a.key);
  if (ligar) {
    const fila = [key];
    while (fila.length) {
      const k = fila.pop();
      if (sel.has(k)) continue;
      sel.add(k);
      (metaPermissao(tipo, k).depende || []).forEach(d => fila.push(d));
    }
  } else {
    const fila = [key];
    while (fila.length) {
      const k = fila.pop();
      if (!sel.has(k) && k !== key) continue;
      sel.delete(k);
      abasDe(k).forEach(a => sel.delete(a));
      catalogo.forEach(p => { if ((metaPermissao(tipo, p.key).depende || []).includes(k) && sel.has(p.key)) fila.push(p.key); });
    }
  }
  return [...sel];
}

// Diferença entre duas listas de chaves (ignora ordem e repetição).
export function diffPermissoes(antes, depois) {
  const a = new Set(antes || []), d = new Set(depois || []);
  return {
    adicionadas: [...d].filter(k => !a.has(k)),
    removidas: [...a].filter(k => !d.has(k)),
  };
}

// Nome legível de uma chave (página ou aba) no catálogo.
export function rotuloPermissao(catalogo, key) {
  for (const p of catalogo || []) {
    if (p.key === key) return p.label;
    const aba = (p.abas || []).find(a => a.key === key);
    if (aba) return `${p.label} › ${aba.label}`;
  }
  return key;
}
