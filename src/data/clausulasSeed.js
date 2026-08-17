// Catálogo PADRÃO de cláusulas contratuais — semente do banco (cci_clausulas).
//
// É a fonte inicial que clausulasService.seedSeVazio() insere na tabela e que
// a tela admin pode "restaurar". Depois de semeadas, as cláusulas são editáveis
// pelo admin (banco), e ESTE arquivo deixa de ser a verdade em runtime.
//
// Cada cláusula tem:
//   chave (estável), titulo, tipo, obrigatoria, condicao, ordem, variaveis[],
//   revisar_juridico, corpo (blocos: subtitulo|paragrafo|lista|tabela).
//
// REGRA DE SEGURANÇA JURÍDICA: os textos abaixo são MODELOS. Valores comerciais
// (vigência, reajuste, multa, foro, pagamento) entram por VARIÁVEIS preenchidas
// a partir da config do admin — nunca embutidos/inventados. As cláusulas cujo
// teor depende de definição jurídica levam `revisar_juridico: true`.

import { CLAUSULAS_SERVICO } from './clausulasContrato.js';

// Reaproveita os corpos das 2 cláusulas de serviço já existentes.
const corpoLancamentoNotas   = CLAUSULAS_SERVICO.lancamento_notas.blocos;
const corpoConciliacao       = CLAUSULAS_SERVICO.conciliacao_bancaria.blocos;

export const CLAUSULAS_SEED = [
  // ═══════════════════════════════════════════════════════════
  // OBJETO — sempre presente
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_objeto',
    titulo: 'Do Objeto',
    tipo: 'objeto',
    obrigatoria: true,
    condicao: { modo: 'sempre' },
    ordem: 10,
    revisar_juridico: false,
    variaveis: ['contratante.razaoSocial', 'servicos'],
    corpo: [
      { tipo: 'paragrafo', texto:
        'O presente contrato tem por objeto a prestação, pela CONTRATADA à CONTRATANTE ' +
        '{{contratante.razaoSocial}}, dos serviços de terceirização de rotinas administrativas e ' +
        'financeiras (BPO) adiante especificados, compreendendo: {{servicos}}.' },
      { tipo: 'paragrafo', texto:
        'A finalidade é permitir que a CONTRATANTE concentre-se em sua atividade-fim, transferindo à ' +
        'CONTRATADA a execução das rotinas de apoio contratadas, nos termos e limites deste instrumento.' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // SERVIÇOS CONTRATADOS — a tabela de itens é injetada pelo renderizador
  // no marcador {{tabela_servicos}} (não é texto fixo).
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_servicos_contratados',
    titulo: 'Dos Serviços Contratados',
    tipo: 'objeto',
    obrigatoria: true,
    condicao: { modo: 'sempre' },
    ordem: 20,
    revisar_juridico: false,
    variaveis: [],
    corpo: [
      { tipo: 'paragrafo', texto:
        'Os serviços efetivamente contratados, com sua forma de cobrança, quantidade, unidade e valor, ' +
        'são os relacionados no quadro a seguir, que integra este contrato para todos os fins:' },
      { tipo: 'marcador', nome: 'tabela_servicos' },
      { tipo: 'paragrafo', texto:
        'As condições, o escopo e as limitações específicas de cada serviço constam das cláusulas próprias ' +
        'deste instrumento, quando aplicável.' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // CLÁUSULAS DE SERVIÇO — só entram quando o serviço é contratado
  // (condicao.modo='servico' casada pela chave do serviço)
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'servico_lancamento_notas',
    titulo: CLAUSULAS_SERVICO.lancamento_notas.titulo,
    tipo: 'servico',
    obrigatoria: false,
    condicao: { modo: 'servico', valor: 'servico_lancamento_notas' },
    ordem: 40,
    revisar_juridico: false,
    variaveis: [],
    corpo: corpoLancamentoNotas,
  },
  {
    chave: 'servico_conciliacao_bancaria',
    titulo: CLAUSULAS_SERVICO.conciliacao_bancaria.titulo,
    tipo: 'servico',
    obrigatoria: false,
    condicao: { modo: 'servico', valor: 'servico_conciliacao_bancaria' },
    ordem: 41,
    revisar_juridico: false,
    variaveis: [],
    corpo: corpoConciliacao,
  },

  // ═══════════════════════════════════════════════════════════
  // PREÇO E PAGAMENTO
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_preco_pagamento',
    titulo: 'Do Preço e das Condições de Pagamento',
    tipo: 'pagamento',
    obrigatoria: true,
    condicao: { modo: 'sempre' },
    ordem: 50,
    revisar_juridico: true, // consequências do atraso dependem de definição
    variaveis: ['contrato.valorTotal', 'pagamento.vencimentoDia', 'pagamento.forma', 'pagamento.encargosAtraso'],
    corpo: [
      { tipo: 'paragrafo', texto:
        'Pelos serviços contratados, a CONTRATANTE pagará à CONTRATADA o valor total mensal de ' +
        '{{contrato.valorTotal}}, conforme o quadro de serviços, sem prejuízo dos serviços adicionais ' +
        'eventualmente contratados na forma deste instrumento.' },
      { tipo: 'paragrafo', texto:
        'O pagamento será realizado até o dia {{pagamento.vencimentoDia}} de cada mês, por meio de ' +
        '{{pagamento.forma}}.' },
      { tipo: 'paragrafo', texto:
        'O atraso no pagamento acarretará {{pagamento.encargosAtraso}}, sem prejuízo das demais medidas ' +
        'previstas neste contrato e na legislação aplicável.' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // VIGÊNCIA
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_vigencia',
    titulo: 'Da Vigência',
    tipo: 'geral',
    obrigatoria: true,
    condicao: { modo: 'sempre' },
    ordem: 60,
    revisar_juridico: false,
    variaveis: ['vigencia.descricao'],
    corpo: [
      { tipo: 'paragrafo', texto: '{{vigencia.descricao}}' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // REAJUSTE
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_reajuste',
    titulo: 'Do Reajuste',
    tipo: 'geral',
    obrigatoria: true,
    condicao: { modo: 'sempre' },
    ordem: 65,
    revisar_juridico: true,
    variaveis: ['reajuste.indice', 'reajuste.periodicidade'],
    corpo: [
      { tipo: 'paragrafo', texto:
        'Os valores previstos neste contrato serão reajustados a cada {{reajuste.periodicidade}}, pela ' +
        'variação acumulada do {{reajuste.indice}} no período, ou, na sua falta ou extinção, por índice ' +
        'oficial que legalmente o substitua, podendo as partes, de comum acordo, negociar condição diversa.' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // OBRIGAÇÕES DAS PARTES (gerais)
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_obrigacoes_contratada',
    titulo: 'Das Obrigações da Contratada',
    tipo: 'geral',
    obrigatoria: true,
    condicao: { modo: 'sempre' },
    ordem: 70,
    revisar_juridico: false,
    variaveis: [],
    corpo: [
      { tipo: 'paragrafo', texto: 'São obrigações da CONTRATADA:' },
      { tipo: 'lista', itens: [
        'Executar os serviços contratados com diligência, tempestividade e conforme as boas práticas aplicáveis;',
        'Manter sigilo e segurança sobre as informações da CONTRATANTE a que tiver acesso;',
        'Comunicar tempestivamente pendências, divergências e informações necessárias à execução;',
        'Prestar contas e entregar os relatórios acordados relativos aos serviços contratados.',
      ] },
    ],
  },
  {
    chave: 'geral_obrigacoes_contratante',
    titulo: 'Das Obrigações da Contratante',
    tipo: 'geral',
    obrigatoria: true,
    condicao: { modo: 'sempre' },
    ordem: 71,
    revisar_juridico: false,
    variaveis: [],
    corpo: [
      { tipo: 'paragrafo', texto: 'São obrigações da CONTRATANTE:' },
      { tipo: 'lista', itens: [
        'Fornecer, de forma completa e tempestiva, as informações, documentos e acessos necessários à execução dos serviços;',
        'Manter seus dados cadastrais atualizados;',
        'Responder às pendências e solicitações apontadas pela CONTRATADA;',
        'Responsabilizar-se pela veracidade das informações e documentos fornecidos e pelos usuários por si autorizados;',
        'Cumprir as condições de pagamento pactuadas.',
      ] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // SUSPENSÃO
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_suspensao',
    titulo: 'Da Suspensão dos Serviços',
    tipo: 'geral',
    obrigatoria: false,
    condicao: { modo: 'sempre' },
    ordem: 75,
    revisar_juridico: true,
    variaveis: [],
    corpo: [
      { tipo: 'paragrafo', texto:
        'A CONTRATADA poderá suspender a prestação dos serviços, mediante comunicação prévia, em caso de ' +
        'inadimplemento das obrigações de pagamento ou de descumprimento contratual relevante pela ' +
        'CONTRATANTE, restabelecendo-os após a regularização. A suspensão será proporcional e limitada ao ' +
        'necessário, preservadas as obrigações legais de guarda e devolução de informações.' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // CANCELAMENTO E RESCISÃO
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_rescisao',
    titulo: 'Do Cancelamento e da Rescisão',
    tipo: 'encerramento',
    obrigatoria: true,
    condicao: { modo: 'sempre' },
    ordem: 80,
    revisar_juridico: true,
    variaveis: ['rescisao.avisoPrevio', 'rescisao.multa'],
    corpo: [
      { tipo: 'paragrafo', texto:
        'Qualquer das partes poderá denunciar este contrato, imotivadamente, mediante aviso prévio por ' +
        'escrito de {{rescisao.avisoPrevio}}.' },
      { tipo: 'paragrafo', texto:
        'O contrato poderá ser rescindido de pleno direito, independentemente de aviso, em caso de ' +
        'descumprimento de obrigação essencial não sanada no prazo concedido pela parte prejudicada.' },
      { tipo: 'paragrafo', texto: '{{rescisao.multa}}' },
      { tipo: 'paragrafo', texto:
        'O encerramento não afasta as obrigações pendentes até a data do término, especialmente o pagamento ' +
        'dos serviços já prestados e a devolução ou eliminação de informações na forma acordada.' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // RESPONSABILIDADE DAS PARTES
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_responsabilidade',
    titulo: 'Da Responsabilidade das Partes',
    tipo: 'juridica',
    obrigatoria: false,
    condicao: { modo: 'sempre' },
    ordem: 85,
    revisar_juridico: true,
    variaveis: [],
    corpo: [
      { tipo: 'paragrafo', texto:
        'Cada parte responde pelos danos a que der causa por dolo ou culpa no cumprimento deste contrato, ' +
        'nos limites da legislação aplicável.' },
      { tipo: 'paragrafo', texto:
        'A CONTRATADA executa os serviços com base nas informações e documentos fornecidos pela CONTRATANTE, ' +
        'não respondendo por consequências decorrentes de informações incorretas, incompletas ou intempestivas ' +
        'prestadas pela CONTRATANTE, nem por indisponibilidades ou falhas de serviços de terceiros ' +
        '(instituições financeiras, adquirentes, órgãos públicos e integrações externas) fora de seu controle.' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // CONFIDENCIALIDADE
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_confidencialidade',
    titulo: 'Da Confidencialidade',
    tipo: 'geral',
    obrigatoria: false,
    condicao: { modo: 'sempre' },
    ordem: 88,
    revisar_juridico: false,
    variaveis: [],
    corpo: [
      { tipo: 'paragrafo', texto:
        'As partes obrigam-se a manter em sigilo as informações comerciais, técnicas, financeiras, dados, ' +
        'credenciais e documentos a que tiverem acesso em razão deste contrato, utilizando-as exclusivamente ' +
        'para a execução do objeto, e a não as divulgar a terceiros sem autorização, salvo por exigência ' +
        'legal ou de autoridade competente.' },
      { tipo: 'paragrafo', texto:
        'A obrigação de confidencialidade subsiste durante a vigência do contrato e após o seu término, ' +
        'ressalvadas as informações que se tornem públicas sem culpa da parte receptora ou cuja divulgação ' +
        'seja legalmente exigida.' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // LGPD — condicional (só quando algum serviço trata dados pessoais)
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_lgpd',
    titulo: 'Da Proteção de Dados Pessoais (LGPD)',
    tipo: 'lgpd',
    obrigatoria: false,
    condicao: { modo: 'flag', valor: 'envolve_dados_pessoais' },
    ordem: 90,
    revisar_juridico: true,
    variaveis: ['lgpd.papel'],
    corpo: [
      { tipo: 'paragrafo', texto:
        'No tratamento de dados pessoais eventualmente necessário à execução dos serviços, as partes observarão ' +
        'a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD).' },
      { tipo: 'paragrafo', texto:
        'Para os fins deste contrato, a CONTRATANTE atua como controladora dos dados relativos à sua operação, ' +
        'e a CONTRATADA atua como {{lgpd.papel}}, tratando os dados exclusivamente conforme as finalidades e ' +
        'instruções necessárias à prestação dos serviços contratados.' },
      { tipo: 'lista', itens: [
        'O tratamento limita-se às finalidades da execução dos serviços contratados;',
        'As partes adotarão medidas técnicas e administrativas de segurança adequadas à proteção dos dados;',
        'A CONTRATADA manterá confidencialidade e somente compartilhará dados quando necessário à execução ou por exigência legal;',
        'Eventual subcontratação observará deveres de proteção equivalentes;',
        'As partes cooperarão no atendimento a solicitações de titulares e no tratamento de incidentes de segurança;',
        'Encerrado o contrato, os dados serão devolvidos ou eliminados conforme a legislação e o acordado, ressalvadas as hipóteses de guarda obrigatória.',
      ] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // FORO
  // ═══════════════════════════════════════════════════════════
  {
    chave: 'geral_foro',
    titulo: 'Do Foro',
    tipo: 'encerramento',
    obrigatoria: true,
    condicao: { modo: 'sempre' },
    ordem: 95,
    revisar_juridico: false,
    variaveis: ['foro.comarca', 'foro.uf'],
    corpo: [
      { tipo: 'paragrafo', texto:
        'Fica eleito o foro da Comarca de {{foro.comarca}}/{{foro.uf}} para dirimir as questões oriundas deste ' +
        'contrato, com renúncia a qualquer outro, por mais privilegiado que seja.' },
    ],
  },
];
