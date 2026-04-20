export const currentUser = {
  name: 'David Oliveira',
  email: 'david@cciconsultoria.com.br',
  role: 'Administrador',
  avatar: null,
};

export const kpis = {
  receitaTotal: 487650.00,
  despesaTotal: 312480.00,
  lucroLiquido: 175170.00,
  margemLucro: 35.9,
  clientesAtivos: 47,
  notasEmitidas: 156,
  boletosEmAberto: 23,
  ticketMedio: 10376.60,
};

export const receitaMensalData = [
  { mes: 'Jan', receita: 38200, despesa: 24500, lucro: 13700 },
  { mes: 'Fev', receita: 42100, despesa: 27800, lucro: 14300 },
  { mes: 'Mar', receita: 39800, despesa: 25200, lucro: 14600 },
  { mes: 'Abr', receita: 45600, despesa: 29100, lucro: 16500 },
  { mes: 'Mai', receita: 41200, despesa: 26800, lucro: 14400 },
  { mes: 'Jun', receita: 48900, despesa: 30200, lucro: 18700 },
  { mes: 'Jul', receita: 44300, despesa: 28600, lucro: 15700 },
  { mes: 'Ago', receita: 47200, despesa: 31400, lucro: 15800 },
  { mes: 'Set', receita: 43800, despesa: 27900, lucro: 15900 },
  { mes: 'Out', receita: 46500, despesa: 29800, lucro: 16700 },
  { mes: 'Nov', receita: 49100, despesa: 31200, lucro: 17900 },
  { mes: 'Dez', receita: 50950, despesa: 29900, lucro: 21050 },
];

export const despesasPorCategoria = [
  { categoria: 'Pessoal', valor: 125000, cor: '#3b82f6' },
  { categoria: 'Aluguel', valor: 48000, cor: '#8b5cf6' },
  { categoria: 'Impostos', valor: 62400, cor: '#ef4444' },
  { categoria: 'Marketing', valor: 28000, cor: '#f59e0b' },
  { categoria: 'Tecnologia', valor: 32000, cor: '#22c55e' },
  { categoria: 'Outros', valor: 17080, cor: '#64748b' },
];

export const lancamentos = [
  { id: 1, descricao: 'Mensalidade - Tech Solutions Ltda', tipo: 'receita', categoria: 'Serviços Contábeis', valor: 4500.00, data: '2026-03-20', status: 'confirmado', cliente: 'Tech Solutions Ltda' },
  { id: 2, descricao: 'Folha de Pagamento - Março', tipo: 'despesa', categoria: 'Pessoal', valor: 18500.00, data: '2026-03-05', status: 'confirmado', cliente: null },
  { id: 3, descricao: 'Consultoria Fiscal - Inovação SA', tipo: 'receita', categoria: 'Consultoria', valor: 8200.00, data: '2026-03-18', status: 'pendente', cliente: 'Inovação SA' },
  { id: 4, descricao: 'Aluguel do Escritório', tipo: 'despesa', categoria: 'Aluguel', valor: 4000.00, data: '2026-03-01', status: 'confirmado', cliente: null },
  { id: 5, descricao: 'Mensalidade - Comércio Global', tipo: 'receita', categoria: 'Serviços Contábeis', valor: 3200.00, data: '2026-03-15', status: 'confirmado', cliente: 'Comércio Global' },
  { id: 6, descricao: 'Software Contábil - Licença', tipo: 'despesa', categoria: 'Tecnologia', valor: 2800.00, data: '2026-03-10', status: 'confirmado', cliente: null },
  { id: 7, descricao: 'Honorários - Construções Lima', tipo: 'receita', categoria: 'Serviços Contábeis', valor: 5600.00, data: '2026-03-22', status: 'pendente', cliente: 'Construções Lima' },
  { id: 8, descricao: 'Energia Elétrica', tipo: 'despesa', categoria: 'Utilidades', valor: 890.00, data: '2026-03-08', status: 'confirmado', cliente: null },
  { id: 9, descricao: 'Abertura de Empresa - StartUp X', tipo: 'receita', categoria: 'Consultoria', valor: 12000.00, data: '2026-03-12', status: 'confirmado', cliente: 'StartUp X' },
  { id: 10, descricao: 'Google Workspace', tipo: 'despesa', categoria: 'Tecnologia', valor: 450.00, data: '2026-03-01', status: 'confirmado', cliente: null },
  { id: 11, descricao: 'Mensalidade - Farmácia Saúde', tipo: 'receita', categoria: 'Serviços Contábeis', valor: 2800.00, data: '2026-03-14', status: 'confirmado', cliente: 'Farmácia Saúde' },
  { id: 12, descricao: 'Material de Escritório', tipo: 'despesa', categoria: 'Outros', valor: 320.00, data: '2026-03-07', status: 'confirmado', cliente: null },
  { id: 13, descricao: 'IRRF sobre Serviços', tipo: 'despesa', categoria: 'Impostos', valor: 5200.00, data: '2026-03-20', status: 'pendente', cliente: null },
  { id: 14, descricao: 'Consultoria Trabalhista - Indústria Norte', tipo: 'receita', categoria: 'Consultoria', valor: 6500.00, data: '2026-03-19', status: 'confirmado', cliente: 'Indústria Norte' },
  { id: 15, descricao: 'Internet e Telefonia', tipo: 'despesa', categoria: 'Utilidades', valor: 380.00, data: '2026-03-05', status: 'confirmado', cliente: null },
];

export const clientes = [
  { id: 1, nome: 'Tech Solutions Ltda', cnpj: '12.345.678/0001-90', regime: 'Lucro Presumido', segmento: 'Tecnologia', status: 'ativo', mensalidade: 4500.00, contato: 'Carlos Silva', email: 'carlos@techsolutions.com', telefone: '(11) 99999-1234' },
  { id: 2, nome: 'Inovação SA', cnpj: '23.456.789/0001-01', regime: 'Lucro Real', segmento: 'Serviços', status: 'ativo', mensalidade: 8200.00, contato: 'Ana Souza', email: 'ana@inovacao.com', telefone: '(11) 98888-5678' },
  { id: 3, nome: 'Comércio Global', cnpj: '34.567.890/0001-12', regime: 'Simples Nacional', segmento: 'Comércio', status: 'ativo', mensalidade: 3200.00, contato: 'Roberto Santos', email: 'roberto@comercioglobal.com', telefone: '(21) 97777-9012' },
  { id: 4, nome: 'Construções Lima', cnpj: '45.678.901/0001-23', regime: 'Lucro Presumido', segmento: 'Construção', status: 'ativo', mensalidade: 5600.00, contato: 'Paulo Lima', email: 'paulo@construcoeslima.com', telefone: '(11) 96666-3456' },
  { id: 5, nome: 'StartUp X', cnpj: '56.789.012/0001-34', regime: 'Simples Nacional', segmento: 'Tecnologia', status: 'ativo', mensalidade: 2500.00, contato: 'Juliana Tech', email: 'juliana@startupx.com', telefone: '(11) 95555-7890' },
  { id: 6, nome: 'Farmácia Saúde', cnpj: '67.890.123/0001-45', regime: 'Simples Nacional', segmento: 'Saúde', status: 'ativo', mensalidade: 2800.00, contato: 'Marcos Vieira', email: 'marcos@farmaciasaude.com', telefone: '(21) 94444-1234' },
  { id: 7, nome: 'Indústria Norte', cnpj: '78.901.234/0001-56', regime: 'Lucro Real', segmento: 'Indústria', status: 'ativo', mensalidade: 12000.00, contato: 'Fernanda Costa', email: 'fernanda@industrianorte.com', telefone: '(11) 93333-5678' },
  { id: 8, nome: 'Restaurante Sabor', cnpj: '89.012.345/0001-67', regime: 'Simples Nacional', segmento: 'Alimentação', status: 'inativo', mensalidade: 1800.00, contato: 'Lucia Chef', email: 'lucia@restaurantesabor.com', telefone: '(21) 92222-9012' },
  { id: 9, nome: 'Logística Express', cnpj: '90.123.456/0001-78', regime: 'Lucro Presumido', segmento: 'Logística', status: 'ativo', mensalidade: 6800.00, contato: 'André Transport', email: 'andre@logisticaexpress.com', telefone: '(11) 91111-3456' },
  { id: 10, nome: 'Educação Plus', cnpj: '01.234.567/0001-89', regime: 'Simples Nacional', segmento: 'Educação', status: 'ativo', mensalidade: 3500.00, contato: 'Maria Educar', email: 'maria@educacaoplus.com', telefone: '(21) 90000-7890' },
];

export const notasFiscais = [
  { id: 1, numero: 'NFS-001234', cliente: 'Tech Solutions Ltda', valor: 4500.00, dataEmissao: '2026-03-20', status: 'emitida', tipo: 'NFS-e', descricao: 'Serviços contábeis - Março/2026' },
  { id: 2, numero: 'NFS-001235', cliente: 'Inovação SA', valor: 8200.00, dataEmissao: '2026-03-18', status: 'emitida', tipo: 'NFS-e', descricao: 'Consultoria fiscal' },
  { id: 3, numero: 'NFS-001236', cliente: 'Construções Lima', valor: 5600.00, dataEmissao: '2026-03-22', status: 'pendente', tipo: 'NFS-e', descricao: 'Serviços contábeis - Março/2026' },
  { id: 4, numero: 'NFS-001237', cliente: 'StartUp X', valor: 12000.00, dataEmissao: '2026-03-12', status: 'emitida', tipo: 'NFS-e', descricao: 'Abertura de empresa' },
  { id: 5, numero: 'NFS-001238', cliente: 'Comércio Global', valor: 3200.00, dataEmissao: '2026-03-15', status: 'emitida', tipo: 'NFS-e', descricao: 'Serviços contábeis - Março/2026' },
  { id: 6, numero: 'NFS-001239', cliente: 'Farmácia Saúde', valor: 2800.00, dataEmissao: '2026-03-14', status: 'cancelada', tipo: 'NFS-e', descricao: 'Serviços contábeis - Março/2026' },
  { id: 7, numero: 'NFS-001240', cliente: 'Indústria Norte', valor: 6500.00, dataEmissao: '2026-03-19', status: 'emitida', tipo: 'NFS-e', descricao: 'Consultoria trabalhista' },
  { id: 8, numero: 'NFS-001241', cliente: 'Logística Express', valor: 6800.00, dataEmissao: '2026-03-21', status: 'pendente', tipo: 'NFS-e', descricao: 'Serviços contábeis - Março/2026' },
  { id: 9, numero: 'NFS-001242', cliente: 'Educação Plus', valor: 3500.00, dataEmissao: '2026-03-16', status: 'emitida', tipo: 'NFS-e', descricao: 'Serviços contábeis - Março/2026' },
  { id: 10, numero: 'NFS-001243', cliente: 'Tech Solutions Ltda', valor: 2200.00, dataEmissao: '2026-03-23', status: 'pendente', tipo: 'NFS-e', descricao: 'Consultoria adicional' },
];

export const boletos = [
  { id: 1, numero: 'BOL-2026-0001', cliente: 'Tech Solutions Ltda', valor: 4500.00, dataEmissao: '2026-03-01', dataVencimento: '2026-03-10', dataPagamento: '2026-03-08', status: 'pago' },
  { id: 2, numero: 'BOL-2026-0002', cliente: 'Inovação SA', valor: 8200.00, dataEmissao: '2026-03-01', dataVencimento: '2026-03-10', dataPagamento: '2026-03-10', status: 'pago' },
  { id: 3, numero: 'BOL-2026-0003', cliente: 'Comércio Global', valor: 3200.00, dataEmissao: '2026-03-01', dataVencimento: '2026-03-10', dataPagamento: null, status: 'vencido' },
  { id: 4, numero: 'BOL-2026-0004', cliente: 'Construções Lima', valor: 5600.00, dataEmissao: '2026-03-05', dataVencimento: '2026-03-15', dataPagamento: '2026-03-14', status: 'pago' },
  { id: 5, numero: 'BOL-2026-0005', cliente: 'StartUp X', valor: 2500.00, dataEmissao: '2026-03-05', dataVencimento: '2026-03-15', dataPagamento: null, status: 'pendente' },
  { id: 6, numero: 'BOL-2026-0006', cliente: 'Farmácia Saúde', valor: 2800.00, dataEmissao: '2026-03-05', dataVencimento: '2026-03-15', dataPagamento: null, status: 'pendente' },
  { id: 7, numero: 'BOL-2026-0007', cliente: 'Indústria Norte', valor: 12000.00, dataEmissao: '2026-03-10', dataVencimento: '2026-03-20', dataPagamento: '2026-03-19', status: 'pago' },
  { id: 8, numero: 'BOL-2026-0008', cliente: 'Logística Express', valor: 6800.00, dataEmissao: '2026-03-10', dataVencimento: '2026-03-20', dataPagamento: null, status: 'pendente' },
  { id: 9, numero: 'BOL-2026-0009', cliente: 'Educação Plus', valor: 3500.00, dataEmissao: '2026-03-15', dataVencimento: '2026-03-25', dataPagamento: null, status: 'pendente' },
  { id: 10, numero: 'BOL-2026-0010', cliente: 'Restaurante Sabor', valor: 1800.00, dataEmissao: '2026-02-01', dataVencimento: '2026-02-10', dataPagamento: null, status: 'vencido' },
];

export const dreData = {
  periodo: 'Janeiro a Março 2026',
  itens: [
    { id: 1, descricao: 'RECEITA OPERACIONAL BRUTA', nivel: 0, valor: 487650.00, tipo: 'receita' },
    { id: 2, descricao: 'Serviços Contábeis', nivel: 1, valor: 324500.00, tipo: 'receita' },
    { id: 3, descricao: 'Consultoria', nivel: 1, valor: 126750.00, tipo: 'receita' },
    { id: 4, descricao: 'Outros Serviços', nivel: 1, valor: 36400.00, tipo: 'receita' },
    { id: 5, descricao: '(-) DEDUÇÕES DA RECEITA', nivel: 0, valor: -48765.00, tipo: 'deducao' },
    { id: 6, descricao: 'ISS', nivel: 1, valor: -24382.50, tipo: 'deducao' },
    { id: 7, descricao: 'PIS/COFINS', nivel: 1, valor: -24382.50, tipo: 'deducao' },
    { id: 8, descricao: 'RECEITA OPERACIONAL LÍQUIDA', nivel: 0, valor: 438885.00, tipo: 'subtotal' },
    { id: 9, descricao: '(-) CUSTOS DOS SERVIÇOS', nivel: 0, valor: -175170.00, tipo: 'despesa' },
    { id: 10, descricao: 'Pessoal Direto', nivel: 1, valor: -125000.00, tipo: 'despesa' },
    { id: 11, descricao: 'Software e Ferramentas', nivel: 1, valor: -32000.00, tipo: 'despesa' },
    { id: 12, descricao: 'Materiais', nivel: 1, valor: -18170.00, tipo: 'despesa' },
    { id: 13, descricao: 'LUCRO BRUTO', nivel: 0, valor: 263715.00, tipo: 'subtotal' },
    { id: 14, descricao: '(-) DESPESAS OPERACIONAIS', nivel: 0, valor: -88545.00, tipo: 'despesa' },
    { id: 15, descricao: 'Aluguel', nivel: 1, valor: -48000.00, tipo: 'despesa' },
    { id: 16, descricao: 'Marketing', nivel: 1, valor: -28000.00, tipo: 'despesa' },
    { id: 17, descricao: 'Utilidades', nivel: 1, valor: -12545.00, tipo: 'despesa' },
    { id: 18, descricao: 'LUCRO OPERACIONAL (EBITDA)', nivel: 0, valor: 175170.00, tipo: 'resultado' },
  ],
};

export const fluxoCaixaData = [
  { mes: 'Jan', entradas: 42100, saidas: 28400, saldo: 13700 },
  { mes: 'Fev', entradas: 45200, saidas: 30100, saldo: 15100 },
  { mes: 'Mar', entradas: 43800, saidas: 27600, saldo: 16200 },
  { mes: 'Abr', entradas: 48500, saidas: 31200, saldo: 17300 },
  { mes: 'Mai', entradas: 44200, saidas: 29800, saldo: 14400 },
  { mes: 'Jun', entradas: 51200, saidas: 32100, saldo: 19100 },
];

export const categoriasFinanceiras = [
  { id: 1, nome: 'Serviços Contábeis', tipo: 'receita', ativo: true },
  { id: 2, nome: 'Consultoria', tipo: 'receita', ativo: true },
  { id: 3, nome: 'Outros Serviços', tipo: 'receita', ativo: true },
  { id: 4, nome: 'Pessoal', tipo: 'despesa', ativo: true },
  { id: 5, nome: 'Aluguel', tipo: 'despesa', ativo: true },
  { id: 6, nome: 'Impostos', tipo: 'despesa', ativo: true },
  { id: 7, nome: 'Marketing', tipo: 'despesa', ativo: true },
  { id: 8, nome: 'Tecnologia', tipo: 'despesa', ativo: true },
  { id: 9, nome: 'Utilidades', tipo: 'despesa', ativo: true },
  { id: 10, nome: 'Outros', tipo: 'despesa', ativo: true },
];

export const colaboradores = [
  { id: 1, nome: 'David Oliveira', cargo: 'Diretor Geral', departamento: 'Diretoria', email: 'david@cciconsultoria.com.br', telefone: '(11) 99999-0001', status: 'ativo', permissoes: ['admin', 'financeiro', 'clientes', 'relatorios', 'parametrizacoes', 'colaboradores'] },
  { id: 2, nome: 'Ana Paula Santos', cargo: 'Contadora Sênior', departamento: 'Contabilidade', email: 'ana.paula@cciconsultoria.com.br', telefone: '(11) 99999-0002', status: 'ativo', permissoes: ['financeiro', 'clientes', 'relatorios'] },
  { id: 3, nome: 'Carlos Eduardo Lima', cargo: 'Analista Fiscal', departamento: 'Fiscal', email: 'carlos.lima@cciconsultoria.com.br', telefone: '(11) 99999-0003', status: 'ativo', permissoes: ['financeiro', 'relatorios'] },
  { id: 4, nome: 'Juliana Ferreira', cargo: 'Assistente Contábil', departamento: 'Contabilidade', email: 'juliana@cciconsultoria.com.br', telefone: '(11) 99999-0004', status: 'ativo', permissoes: ['clientes', 'relatorios'] },
  { id: 5, nome: 'Roberto Mendes', cargo: 'Analista de DP', departamento: 'Departamento Pessoal', email: 'roberto@cciconsultoria.com.br', telefone: '(11) 99999-0005', status: 'ativo', permissoes: ['clientes', 'colaboradores'] },
  { id: 6, nome: 'Mariana Costa', cargo: 'Estagiária', departamento: 'Contabilidade', email: 'mariana@cciconsultoria.com.br', telefone: '(11) 99999-0006', status: 'ativo', permissoes: ['relatorios'] },
  { id: 7, nome: 'Fernando Alves', cargo: 'Gerente Financeiro', departamento: 'Financeiro', email: 'fernando@cciconsultoria.com.br', telefone: '(11) 99999-0007', status: 'inativo', permissoes: ['financeiro', 'relatorios'] },
];

export const dreRegras = [
  { id: 1, nome: 'Receita Operacional Bruta', ordem: 1, tipo: 'grupo', categorias: ['Serviços Contábeis', 'Consultoria', 'Outros Serviços'] },
  { id: 2, nome: 'Deduções da Receita', ordem: 2, tipo: 'grupo', categorias: ['ISS', 'PIS/COFINS'] },
  { id: 3, nome: 'Receita Operacional Líquida', ordem: 3, tipo: 'subtotal', formula: 'ROB - Deduções' },
  { id: 4, nome: 'Custos dos Serviços', ordem: 4, tipo: 'grupo', categorias: ['Pessoal', 'Tecnologia'] },
  { id: 5, nome: 'Lucro Bruto', ordem: 5, tipo: 'subtotal', formula: 'ROL - Custos' },
  { id: 6, nome: 'Despesas Operacionais', ordem: 6, tipo: 'grupo', categorias: ['Aluguel', 'Marketing', 'Utilidades'] },
  { id: 7, nome: 'Lucro Operacional', ordem: 7, tipo: 'resultado', formula: 'LB - Despesas Operacionais' },
];

export const resumoClientes = [
  { nome: 'Indústria Norte', receita: 12000, status: 'em dia' },
  { nome: 'Inovação SA', receita: 8200, status: 'em dia' },
  { nome: 'Logística Express', receita: 6800, status: 'pendente' },
  { nome: 'Construções Lima', receita: 5600, status: 'em dia' },
  { nome: 'Tech Solutions Ltda', receita: 4500, status: 'em dia' },
];
