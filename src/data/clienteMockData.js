// Mock: empresa logada como cliente
export const clienteLogado = {
  id: 1,
  nome: 'Tech Solutions Ltda',
  cnpj: '12.345.678/0001-90',
  regime: 'Lucro Presumido',
  segmento: 'Tecnologia',
  responsavel: 'Carlos Silva',
  email: 'carlos@techsolutions.com',
  telefone: '(11) 99999-1234',
  contadorResponsavel: 'Ana Paula Santos',
};

// ---------- DRE do cliente ----------
export const clienteDreData = {
  periodo: 'Janeiro a Marco 2026',
  competencias: [
    { mes: 'Jan/2026', disponivel: true },
    { mes: 'Fev/2026', disponivel: true },
    { mes: 'Mar/2026', disponivel: true },
    { mes: 'Abr/2026', disponivel: false },
  ],
  itens: [
    { id: 1, descricao: 'RECEITA OPERACIONAL BRUTA', nivel: 0, jan: 185000, fev: 198000, mar: 210500, tipo: 'receita' },
    { id: 2, descricao: 'Venda de Software', nivel: 1, jan: 120000, fev: 128000, mar: 138000, tipo: 'receita' },
    { id: 3, descricao: 'Servicos de Consultoria', nivel: 1, jan: 45000, fev: 48000, mar: 50500, tipo: 'receita' },
    { id: 4, descricao: 'Suporte e Manutencao', nivel: 1, jan: 20000, fev: 22000, mar: 22000, tipo: 'receita' },
    { id: 5, descricao: '(-) DEDUCOES DA RECEITA', nivel: 0, jan: -22200, fev: -23760, mar: -25260, tipo: 'deducao' },
    { id: 6, descricao: 'PIS (0.65%)', nivel: 1, jan: -1202.50, fev: -1287, mar: -1368.25, tipo: 'deducao' },
    { id: 7, descricao: 'COFINS (3%)', nivel: 1, jan: -5550, fev: -5940, mar: -6315, tipo: 'deducao' },
    { id: 8, descricao: 'ISS (5%)', nivel: 1, jan: -9250, fev: -9900, mar: -10525, tipo: 'deducao' },
    { id: 9, descricao: 'IRPJ Retido', nivel: 1, jan: -6197.50, fev: -6633, mar: -7051.75, tipo: 'deducao' },
    { id: 10, descricao: 'RECEITA OPERACIONAL LIQUIDA', nivel: 0, jan: 162800, fev: 174240, mar: 185240, tipo: 'subtotal' },
    { id: 11, descricao: '(-) CUSTOS DOS SERVICOS PRESTADOS', nivel: 0, jan: -78000, fev: -82000, mar: -85000, tipo: 'despesa' },
    { id: 12, descricao: 'Salarios e Encargos - Equipe Tecnica', nivel: 1, jan: -52000, fev: -54000, mar: -56000, tipo: 'despesa' },
    { id: 13, descricao: 'Infraestrutura Cloud (AWS/Azure)', nivel: 1, jan: -18000, fev: -19500, mar: -20000, tipo: 'despesa' },
    { id: 14, descricao: 'Licencas de Software', nivel: 1, jan: -8000, fev: -8500, mar: -9000, tipo: 'despesa' },
    { id: 15, descricao: 'LUCRO BRUTO', nivel: 0, jan: 84800, fev: 92240, mar: 100240, tipo: 'subtotal' },
    { id: 16, descricao: '(-) DESPESAS OPERACIONAIS', nivel: 0, jan: -42000, fev: -43500, mar: -44800, tipo: 'despesa' },
    { id: 17, descricao: 'Salarios Administrativos', nivel: 1, jan: -22000, fev: -22000, mar: -23000, tipo: 'despesa' },
    { id: 18, descricao: 'Aluguel e Condominio', nivel: 1, jan: -8500, fev: -8500, mar: -8500, tipo: 'despesa' },
    { id: 19, descricao: 'Marketing e Vendas', nivel: 1, jan: -6500, fev: -8000, mar: -8300, tipo: 'despesa' },
    { id: 20, descricao: 'Despesas Gerais', nivel: 1, jan: -5000, fev: -5000, mar: -5000, tipo: 'despesa' },
    { id: 21, descricao: 'LUCRO OPERACIONAL (EBITDA)', nivel: 0, jan: 42800, fev: 48740, mar: 55440, tipo: 'resultado' },
    { id: 22, descricao: '(-) Depreciacao e Amortizacao', nivel: 0, jan: -3200, fev: -3200, mar: -3200, tipo: 'despesa' },
    { id: 23, descricao: 'RESULTADO ANTES DO IR/CSLL', nivel: 0, jan: 39600, fev: 45540, mar: 52240, tipo: 'subtotal' },
    { id: 24, descricao: '(-) IRPJ/CSLL', nivel: 0, jan: -9504, fev: -10929.60, mar: -12537.60, tipo: 'despesa' },
    { id: 25, descricao: 'LUCRO LIQUIDO DO EXERCICIO', nivel: 0, jan: 30096, fev: 34610.40, mar: 39702.40, tipo: 'resultado' },
  ],
};

// ---------- Fluxo de Caixa do cliente ----------
export const clienteFluxoCaixa = {
  periodo: 'Janeiro a Marco 2026',
  resumo: {
    saldoInicial: 145000,
    totalEntradas: 593500,
    totalSaidas: 448060,
    saldoFinal: 290440,
  },
  mensal: [
    { mes: 'Jan', entradas: 185000, saidas: 142200, saldo: 42800, saldoAcumulado: 187800 },
    { mes: 'Fev', entradas: 198000, saidas: 149260, saldo: 48740, saldoAcumulado: 236540 },
    { mes: 'Mar', entradas: 210500, saidas: 156600, saldo: 53900, saldoAcumulado: 290440 },
  ],
  categorias: {
    entradas: [
      { categoria: 'Vendas de Software', jan: 120000, fev: 128000, mar: 138000 },
      { categoria: 'Consultoria', jan: 45000, fev: 48000, mar: 50500 },
      { categoria: 'Suporte', jan: 20000, fev: 22000, mar: 22000 },
    ],
    saidas: [
      { categoria: 'Folha de Pagamento', jan: 74000, fev: 76000, mar: 79000 },
      { categoria: 'Impostos', jan: 22200, fev: 23760, mar: 25260 },
      { categoria: 'Infraestrutura', jan: 26500, fev: 28000, mar: 28500 },
      { categoria: 'Marketing', jan: 6500, fev: 8000, mar: 8300 },
      { categoria: 'Despesas Gerais', jan: 13000, fev: 13500, mar: 15540 },
    ],
  },
};

// ---------- Servicos BPO ----------
export const servicosBPO = [
  {
    id: 1,
    nome: 'BPO Financeiro',
    descricao: 'Gestao completa do contas a pagar e receber, conciliacao bancaria e controle de fluxo de caixa.',
    icone: 'wallet',
    status: 'ativo',
    responsavel: 'Ana Paula Santos',
    ultimaAtualizacao: '2026-03-24',
    tarefas: [
      { id: 1, titulo: 'Conciliacao bancaria - Marco', status: 'concluido', data: '2026-03-22', responsavel: 'Ana Paula' },
      { id: 2, titulo: 'Lancamento de NFs recebidas', status: 'concluido', data: '2026-03-20', responsavel: 'Ana Paula' },
      { id: 3, titulo: 'Pagamento de fornecedores', status: 'em_andamento', data: '2026-03-25', responsavel: 'Ana Paula' },
      { id: 4, titulo: 'Relatorio de inadimplencia', status: 'em_andamento', data: '2026-03-26', responsavel: 'Carlos Lima' },
      { id: 5, titulo: 'Fechamento financeiro mensal', status: 'pendente', data: '2026-03-31', responsavel: 'Ana Paula' },
    ],
    indicadores: {
      contasPagarDia: 12,
      contasReceberDia: 8,
      conciliacaoPendente: 3,
    },
  },
  {
    id: 2,
    nome: 'BPO Contabil',
    descricao: 'Escrituracao contabil, balancetes mensais, demonstracoes financeiras e obrigacoes acessorias.',
    icone: 'calculator',
    status: 'ativo',
    responsavel: 'Carlos Eduardo Lima',
    ultimaAtualizacao: '2026-03-23',
    tarefas: [
      { id: 6, titulo: 'Escrituracao contabil - Marco', status: 'em_andamento', data: '2026-03-25', responsavel: 'Carlos Lima' },
      { id: 7, titulo: 'Balancete mensal - Fevereiro', status: 'concluido', data: '2026-03-10', responsavel: 'Carlos Lima' },
      { id: 8, titulo: 'SPED Contabil', status: 'concluido', data: '2026-03-15', responsavel: 'Juliana Ferreira' },
      { id: 9, titulo: 'Conciliacao de contas patrimoniais', status: 'pendente', data: '2026-03-28', responsavel: 'Carlos Lima' },
      { id: 10, titulo: 'DRE mensal', status: 'concluido', data: '2026-03-20', responsavel: 'Carlos Lima' },
    ],
    indicadores: {
      lancamentosMes: 342,
      obrigacoesEntregues: 5,
      obrigacoesPendentes: 2,
    },
  },
  {
    id: 3,
    nome: 'BPO Fiscal',
    descricao: 'Apuracao de impostos, emissao de guias, entrega de obrigacoes acessorias e planejamento tributario.',
    icone: 'file-text',
    status: 'ativo',
    responsavel: 'Carlos Eduardo Lima',
    ultimaAtualizacao: '2026-03-22',
    tarefas: [
      { id: 11, titulo: 'Apuracao PIS/COFINS - Marco', status: 'em_andamento', data: '2026-03-25', responsavel: 'Carlos Lima' },
      { id: 12, titulo: 'Apuracao ISS - Marco', status: 'pendente', data: '2026-03-28', responsavel: 'Carlos Lima' },
      { id: 13, titulo: 'SPED Fiscal - Fevereiro', status: 'concluido', data: '2026-03-12', responsavel: 'Carlos Lima' },
      { id: 14, titulo: 'DCTF - Fevereiro', status: 'concluido', data: '2026-03-15', responsavel: 'Juliana Ferreira' },
      { id: 15, titulo: 'Emissao de guias DARF', status: 'concluido', data: '2026-03-18', responsavel: 'Carlos Lima' },
    ],
    indicadores: {
      guiasGeradas: 8,
      obrigacoesEntregues: 4,
      obrigacoesPendentes: 3,
    },
  },
  {
    id: 4,
    nome: 'BPO Departamento Pessoal',
    descricao: 'Folha de pagamento, admissoes, demissoes, ferias, beneficios e obrigacoes trabalhistas.',
    icone: 'users',
    status: 'ativo',
    responsavel: 'Roberto Mendes',
    ultimaAtualizacao: '2026-03-21',
    tarefas: [
      { id: 16, titulo: 'Processamento folha - Marco', status: 'em_andamento', data: '2026-03-28', responsavel: 'Roberto Mendes' },
      { id: 17, titulo: 'Calculo ferias - 2 colaboradores', status: 'concluido', data: '2026-03-15', responsavel: 'Roberto Mendes' },
      { id: 18, titulo: 'eSocial - eventos mensais', status: 'em_andamento', data: '2026-03-27', responsavel: 'Roberto Mendes' },
      { id: 19, titulo: 'FGTS Digital - Fevereiro', status: 'concluido', data: '2026-03-07', responsavel: 'Roberto Mendes' },
      { id: 20, titulo: 'Admissao novo colaborador', status: 'concluido', data: '2026-03-10', responsavel: 'Roberto Mendes' },
    ],
    indicadores: {
      funcionariosAtivos: 38,
      admissoesMes: 1,
      demissoesMes: 0,
    },
  },
];

// ---------- Documentos do cliente ----------
export const clienteDocumentos = [
  { id: 1, nome: 'Balancete - Fevereiro 2026', tipo: 'Contabil', data: '2026-03-10', formato: 'PDF', tamanho: '245 KB' },
  { id: 2, nome: 'DRE - Fevereiro 2026', tipo: 'Contabil', data: '2026-03-10', formato: 'PDF', tamanho: '180 KB' },
  { id: 3, nome: 'Guia DARF - PIS Marco', tipo: 'Fiscal', data: '2026-03-18', formato: 'PDF', tamanho: '95 KB' },
  { id: 4, nome: 'Guia DARF - COFINS Marco', tipo: 'Fiscal', data: '2026-03-18', formato: 'PDF', tamanho: '95 KB' },
  { id: 5, nome: 'Guia ISS - Marco', tipo: 'Fiscal', data: '2026-03-18', formato: 'PDF', tamanho: '88 KB' },
  { id: 6, nome: 'Holerites - Fevereiro 2026', tipo: 'DP', data: '2026-03-05', formato: 'ZIP', tamanho: '1.2 MB' },
  { id: 7, nome: 'Recibo Ferias - Joao Silva', tipo: 'DP', data: '2026-03-15', formato: 'PDF', tamanho: '110 KB' },
  { id: 8, nome: 'SPED Contabil - 2025', tipo: 'Contabil', data: '2026-03-15', formato: 'TXT', tamanho: '8.4 MB' },
  { id: 9, nome: 'SPED Fiscal - Fevereiro', tipo: 'Fiscal', data: '2026-03-12', formato: 'TXT', tamanho: '3.2 MB' },
  { id: 10, nome: 'Contrato Social Alterado', tipo: 'Societario', data: '2026-02-20', formato: 'PDF', tamanho: '520 KB' },
  { id: 11, nome: 'Certidao Negativa Federal', tipo: 'Certidoes', data: '2026-03-01', formato: 'PDF', tamanho: '150 KB' },
  { id: 12, nome: 'Certidao Negativa Municipal', tipo: 'Certidoes', data: '2026-03-01', formato: 'PDF', tamanho: '130 KB' },
];

// ---------- Boletos do cliente ----------
export const clienteBoletos = [
  { id: 1, descricao: 'Mensalidade Contabil - Marco/2026', valor: 4500.00, vencimento: '2026-03-10', pagamento: '2026-03-08', status: 'pago' },
  { id: 2, descricao: 'Mensalidade Contabil - Fevereiro/2026', valor: 4500.00, vencimento: '2026-02-10', pagamento: '2026-02-09', status: 'pago' },
  { id: 3, descricao: 'Mensalidade Contabil - Abril/2026', valor: 4500.00, vencimento: '2026-04-10', pagamento: null, status: 'pendente' },
  { id: 4, descricao: 'Consultoria Adicional - Abertura Filial', valor: 2200.00, vencimento: '2026-03-25', pagamento: null, status: 'pendente' },
  { id: 5, descricao: 'Mensalidade Contabil - Janeiro/2026', valor: 4500.00, vencimento: '2026-01-10', pagamento: '2026-01-10', status: 'pago' },
];

// ---------- Notificacoes ----------
export const clienteNotificacoes = [
  { id: 1, titulo: 'DRE de Fevereiro disponivel', mensagem: 'O demonstrativo de resultado de Fevereiro/2026 ja esta disponivel para consulta.', data: '2026-03-10', lida: true, tipo: 'info' },
  { id: 2, titulo: 'Guias de impostos geradas', mensagem: 'As guias de PIS, COFINS e ISS de Marco foram geradas e estao disponiveis em Documentos.', data: '2026-03-18', lida: false, tipo: 'alerta' },
  { id: 3, titulo: 'Boleto vencendo em 5 dias', mensagem: 'O boleto de consultoria adicional (R$ 2.200,00) vence em 25/03/2026.', data: '2026-03-20', lida: false, tipo: 'alerta' },
  { id: 4, titulo: 'Folha de marco em processamento', mensagem: 'A folha de pagamento de Marco/2026 esta sendo processada. Previsao de conclusao: 28/03.', data: '2026-03-21', lida: false, tipo: 'info' },
  { id: 5, titulo: 'SPED Fiscal entregue', mensagem: 'O SPED Fiscal referente a Fevereiro/2026 foi transmitido com sucesso a Receita Federal.', data: '2026-03-12', lida: true, tipo: 'sucesso' },
];
