// Lista parcial dos códigos NBS (Nomenclatura Brasileira de Serviços) —
// formato exigido pelo Portal Nacional NFS-e (PNFS-e), regulamentado pela
// LC 116/2003. Aqui só os mais usados em postos / contabilidade / consultoria.
//
// Fonte oficial: receita.economia.gov.br/orientacao/tributaria/regimes-e-controles-especiais/nbs-nomenclatura-brasileira-de-servicos
//
// Pra adicionar mais códigos, basta seguir o padrão { codigo, descricao }.

export const NBS_CODIGOS = [
  // ─── 17 — Serviços empresariais ───────────────────────────────
  { codigo: '17.01',    descricao: 'Assessoria ou consultoria de qualquer natureza' },
  { codigo: '17.02',    descricao: 'Datilografia, digitação, estenografia, expediente, secretaria em geral' },
  { codigo: '17.03',    descricao: 'Planejamento, coordenação, programação ou organização administrativa' },
  { codigo: '17.03.01', descricao: 'Planejamento empresarial' },
  { codigo: '17.03.02', descricao: 'Coordenação de programas e projetos' },
  { codigo: '17.03.03', descricao: 'Planejamento, coordenação, programação ou organização administrativa' },
  { codigo: '17.04',    descricao: 'Recrutamento, agenciamento, seleção, colocação de mão de obra' },
  { codigo: '17.05',    descricao: 'Fornecimento de mão de obra (trabalho temporário ou não)' },
  { codigo: '17.06',    descricao: 'Propaganda e publicidade — elaboração, criação' },
  { codigo: '17.07',    descricao: 'Franquia (franchising)' },
  { codigo: '17.08',    descricao: 'Perícias, laudos, exames técnicos e análises técnicas' },
  { codigo: '17.09',    descricao: 'Planejamento, organização e administração de feiras, exposições, congressos' },
  { codigo: '17.10',    descricao: 'Organização de festas, recepções, eventos' },
  { codigo: '17.11',    descricao: 'Administração em geral, inclusive de bens e negócios de terceiros' },
  { codigo: '17.12',    descricao: 'Leilão e congêneres' },
  { codigo: '17.13',    descricao: 'Advocacia' },
  { codigo: '17.14',    descricao: 'Arbitragem de qualquer espécie' },
  { codigo: '17.15',    descricao: 'Auditoria' },
  { codigo: '17.16',    descricao: 'Análise de Organização e Métodos' },
  { codigo: '17.17',    descricao: 'Atuária e cálculos atuariais' },
  { codigo: '17.18',    descricao: 'Contabilidade, inclusive serviços técnicos e auxiliares' },
  { codigo: '17.19',    descricao: 'Consultoria e assessoria econômica ou financeira' },
  { codigo: '17.20',    descricao: 'Estatística' },
  { codigo: '17.21',    descricao: 'Cobrança em geral' },

  // ─── 1 — Informática / TI ──────────────────────────────────────
  { codigo: '1.01',     descricao: 'Análise e desenvolvimento de sistemas' },
  { codigo: '1.02',     descricao: 'Programação' },
  { codigo: '1.03',     descricao: 'Processamento, armazenamento ou hospedagem de dados, textos, imagens, vídeos' },
  { codigo: '1.04',     descricao: 'Elaboração de programas de computadores (softwares)' },
  { codigo: '1.05',     descricao: 'Licenciamento ou cessão de direito de uso de programas de computação' },
  { codigo: '1.06',     descricao: 'Assessoria e consultoria em informática' },
  { codigo: '1.07',     descricao: 'Suporte técnico em informática, inclusive instalação, configuração e manutenção' },
  { codigo: '1.08',     descricao: 'Planejamento, confecção, manutenção e atualização de páginas eletrônicas' },

  // ─── 7 — Serviços de engenharia / construção ──────────────────
  { codigo: '7.01',     descricao: 'Engenharia, agronomia, agrimensura, arquitetura, geologia, urbanismo' },
  { codigo: '7.03',     descricao: 'Elaboração de planos diretores, estudos de viabilidade, projetos' },

  // ─── 14 — Serviços relativos a bens de terceiros ──────────────
  { codigo: '14.01',    descricao: 'Lubrificação, limpeza, lustração, revisão, carga e recarga' },
  { codigo: '14.05',    descricao: 'Restauração, recondicionamento, acondicionamento, pintura' },

  // ─── 10 — Serviços de intermediação e congêneres ──────────────
  { codigo: '10.02',    descricao: 'Agenciamento, corretagem ou intermediação de títulos quaisquer' },
  { codigo: '10.05',    descricao: 'Agenciamento, corretagem ou intermediação de bens móveis ou imóveis' },
];
