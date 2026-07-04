// Cláusulas descritivas dos serviços para o CONTRATO gerado a partir de uma
// proposta. Cada serviço tem um título e uma sequência de "blocos" que o
// gerador de contrato renderiza (subtítulo, parágrafo, lista, tabela).
//
// `CLAUSULA_POR_ITEM` mapeia a chave do item da calculadora/proposta
// (ITENS_PRECO) para a cláusula correspondente aqui.

export const CLAUSULA_POR_ITEM = {
  nota_entrada: 'lancamento_notas',    // "Lançamento de notas fiscais de entrada"
  conta:        'conciliacao_bancaria', // "Conciliação bancária" na composição
};

// Os itens salvos na proposta guardam o NOME do serviço (não a chave). Este
// helper resolve o id da cláusula a partir do nome do item. Estenda quando
// adicionar novas cláusulas.
export function idClausulaPorNome(nome) {
  const n = (nome || '').toLowerCase();
  if (n.includes('nota'))     return 'lancamento_notas';
  if (n.includes('bancár') || n.includes('bancar')) return 'conciliacao_bancaria';
  return null;
}

export const CLAUSULAS_SERVICO = {
  // ── Lançamento de Notas Fiscais ─────────────────────────────
  lancamento_notas: {
    titulo: 'Do Lançamento de Notas Fiscais',
    blocos: [
      { tipo: 'subtitulo', texto: 'Apresentação' },
      { tipo: 'paragrafo', texto:
        'No BPO financeiro, a CONTRATANTE transfere à CONTRATADA a execução de rotinas administrativas e ' +
        'financeiras que, embora essenciais, não fazem parte de sua atividade-fim. Em um posto de combustíveis, ' +
        'a atividade-fim é a revenda de combustíveis e a operação da loja de conveniência; o lançamento de notas ' +
        'fiscais é uma tarefa de apoio que pode ser executada com mais eficiência e menor custo por um parceiro ' +
        'dedicado.' },

      { tipo: 'subtitulo', texto: 'Escopo do serviço' },
      { tipo: 'paragrafo', texto: 'O serviço de lançamento de notas fiscais abrange as seguintes frentes de trabalho:' },
      { tipo: 'lista', itens: [
        'Captura e organização dos documentos fiscais eletrônicos (NF-e, CT-e e notas de serviço);',
        'Conferência dos dados da nota: emitente, destinatário, valores, impostos, CFOP e natureza da operação;',
        'Classificação contábil e fiscal de cada documento conforme o plano de contas do cliente;',
        'Lançamento no sistema de gestão;',
        'Identificação e tratamento de divergências, notas em duplicidade ou documentos faltantes;',
        'Organização de comprovantes e arquivamento digital para consulta e auditoria.',
      ] },

      { tipo: 'subtitulo', texto: 'Como o trabalho é executado' },
      { tipo: 'paragrafo', texto: 'O fluxo de trabalho segue um ciclo padronizado, que se repete diariamente, de ponta a ponta:' },
      { tipo: 'lista', ordenada: true, itens: [
        'Recebimento dos documentos por canais previamente definidos — caixa de e-mail dedicada ou upload em aplicativo específico da CONTRATADA, no recebimento/compra de produtos para revenda ou consumo e na comunicação de manutenções que gerem notas fiscais de serviços;',
        'Triagem e organização: separação por cliente, por tipo (entrada, serviço, despesa) e por competência (mês de referência);',
        'Conferência: validação de cada nota quanto à autenticidade, integridade dos valores e correspondência com o pedido ou a operação que a originou;',
        'Classificação: atribuição da classificação contábil e fiscal adequada, considerando o plano de contas e as regras tributárias aplicáveis;',
        'Lançamento: registro do documento no sistema, garantindo que a escrituração reflita a operação real;',
        'Tratamento de pendências: divergências, ausências e inconsistências apontadas ao cliente para correção ou complementação;',
        'Conferência final e fechamento: ao final do período, confere-se se todos os documentos foram lançados, encerrando a competência.',
      ] },

      { tipo: 'subtitulo', texto: 'Controle e garantia de qualidade' },
      { tipo: 'paragrafo', texto:
        'A confiabilidade do serviço depende de controles que assegurem que nenhum documento seja perdido e que os ' +
        'lançamentos estejam corretos. Os principais mecanismos são:' },
      { tipo: 'lista', itens: [
        'Conciliação periódica entre os documentos recebidos e os efetivamente lançados, identificando lacunas;',
        'Checklist de fechamento por competência, garantindo que todas as notas do período foram tratadas;',
        'Segregação de funções, de modo que a conferência seja feita por pessoa distinta de quem realizou o lançamento, sempre que o volume permitir;',
        'Registro de pendências comunicadas ao cliente, com acompanhamento até a resolução.',
      ] },

      { tipo: 'subtitulo', texto: 'Benefícios para o cliente' },
      { tipo: 'tabela', colunas: ['Benefício', 'O que representa na prática'], linhas: [
        ['Redução de custos', 'Dispensa a manutenção de uma estrutura interna dedicada e os custos trabalhistas associados.'],
        ['Mais precisão', 'Equipe especializada e processos padronizados reduzem erros de classificação e lançamento.'],
        ['Conformidade fiscal', 'Lançamentos tempestivos e corretos diminuem o risco de autuações e multas.'],
        ['Foco no negócio', 'O gestor concentra energia na operação do posto, e não em rotinas administrativas.'],
        ['Informação gerencial', 'Dados organizados e atualizados sustentam decisões financeiras mais seguras.'],
      ] },

      { tipo: 'subtitulo', texto: 'Divisão de responsabilidades' },
      { tipo: 'paragrafo', texto: 'São responsabilidades da CONTRATADA (prestador BPO):' },
      { tipo: 'lista', itens: [
        'Receber, conferir, classificar e lançar os documentos dentro dos prazos acordados;',
        'Apontar divergências e pendências de forma tempestiva;',
        'Manter sigilo e segurança das informações do cliente;',
        'Entregar relatórios e prestar contas conforme combinado.',
      ] },
      { tipo: 'paragrafo', texto: 'São responsabilidades da CONTRATANTE (cliente):' },
      { tipo: 'lista', itens: [
        'Encaminhar os documentos pelos canais definidos, dentro dos prazos;',
        'Fornecer acesso aos sistemas e certificados necessários à execução do serviço;',
        'Responder às pendências e solicitações de informação;',
        'Validar as entregas e comunicar eventuais ajustes.',
      ] },

      { tipo: 'subtitulo', texto: 'Considerações finais' },
      { tipo: 'paragrafo', texto:
        'O lançamento de notas fiscais por meio de BPO transforma uma rotina trabalhosa e sujeita a erros em um ' +
        'processo padronizado, controlado e auditável. Para o posto de combustíveis, significa mais segurança ' +
        'fiscal, informação financeira confiável e tempo livre para o que realmente importa: gerir o negócio e ' +
        'atender bem o cliente.' },
    ],
  },

  // ── Conciliação Bancária ────────────────────────────────────
  conciliacao_bancaria: {
    titulo: 'Da Conciliação Bancária',
    blocos: [
      { tipo: 'subtitulo', texto: 'Apresentação' },
      { tipo: 'paragrafo', texto:
        'No BPO financeiro, a CONTRATANTE transfere à CONTRATADA a execução de rotinas administrativas e ' +
        'financeiras que, embora essenciais, não fazem parte de sua atividade-fim. A conciliação bancária é uma ' +
        'dessas rotinas: tarefa minuciosa, repetitiva e que exige atenção constante, fundamental para que a empresa ' +
        'saiba, com segurança, quanto realmente tem em caixa e em banco.' },

      { tipo: 'subtitulo', texto: 'Escopo do serviço' },
      { tipo: 'paragrafo', texto: 'O serviço de conciliação bancária abrange as seguintes frentes de trabalho:' },
      { tipo: 'lista', itens: [
        'Importação dos extratos bancários de todas as contas, em todos os bancos utilizados pela empresa;',
        'Comparação de cada lançamento do extrato com os registros internos do sistema de gestão;',
        'Identificação de itens conciliados, pendentes e divergentes;',
        'Classificação de tarifas, juros, taxas de cartão, antecipações e demais débitos automáticos;',
        'Tratamento de recebimentos de vendas (dinheiro, PIX, cartões de crédito e débito) e seu confronto com o caixa;',
        'Apontamento de divergências ao cliente, com a documentação necessária para correção;',
        'Emissão de relatório de conciliação ao final do período, com saldo conciliado.',
      ] },

      { tipo: 'subtitulo', texto: 'Como o trabalho é executado' },
      { tipo: 'paragrafo', texto:
        'O fluxo de trabalho segue um ciclo padronizado, executado diária, semanal ou mensalmente conforme acordado ' +
        'com a CONTRATANTE, de ponta a ponta:' },
      { tipo: 'lista', ordenada: true, itens: [
        'Coleta dos extratos de todas as contas, por integração bancária automática, acesso ao internet banking ou envio pelo cliente;',
        'Reunião dos registros do sistema de gestão referentes ao período, para comparação;',
        'Cruzamento de cada movimento do extrato com o lançamento interno correspondente, marcando os itens que batem;',
        'Identificação de divergências: valores sem correspondência, lançamentos em duplicidade, tarifas não registradas e diferenças de data ou valor;',
        'Classificação dos itens não identificados (tarifas, juros, taxas de cartão e demais débitos) conforme o plano de contas;',
        'Tratamento das pendências, comunicadas ao cliente para esclarecimento, ajuste ou complementação de informação;',
        'Fechamento do período e emissão do relatório de conciliação com o saldo conciliado, confirmado o batimento de todos os itens.',
      ] },
      { tipo: 'paragrafo', texto:
        'A qualidade da conciliação depende da forma como os dados chegam à CONTRATADA. Combinam-se diferentes ' +
        'fontes para reduzir o trabalho manual e o risco de erro:' },
      { tipo: 'tabela', colunas: ['Fonte', 'Descrição'], linhas: [
        ['Integração bancária', 'Conexão automática (Open Finance ou OFX) que importa os extratos diretamente do banco, sem digitação manual.'],
        ['Extrato em arquivo', 'Arquivos de extrato (OFX, CSV ou PDF) baixados do internet banking e enviados pelo cliente.'],
        ['Portais de adquirentes', 'Relatórios das operadoras de cartão (vendas, taxas, antecipações e datas de crédito) para conciliar os recebíveis.'],
        ['Sistema de gestão (ERP)', 'Lançamentos internos de contas a pagar, a receber e de vendas, que servem de base para o cruzamento.'],
      ] },

      { tipo: 'subtitulo', texto: 'Controle e garantia de qualidade' },
      { tipo: 'paragrafo', texto:
        'A confiabilidade do serviço depende de controles que assegurem que nenhum movimento fique sem explicação e ' +
        'que o saldo final seja fidedigno. Os principais mecanismos são:' },
      { tipo: 'lista', itens: [
        'Regra do saldo zero: ao final, a diferença entre o saldo do extrato e o saldo contábil deve estar totalmente explicada por itens em trânsito conhecidos;',
        'Checklist de fechamento por conta e por período, garantindo que todas as contas foram conciliadas;',
        'Registro de pendências em aberto, com acompanhamento até a resolução de cada uma;',
        'Segregação de funções, separando quem lança de quem concilia, sempre que o volume permitir;',
        'Arquivamento dos extratos e relatórios, preservando o histórico para auditoria e consulta.',
      ] },

      { tipo: 'subtitulo', texto: 'Benefícios para o cliente' },
      { tipo: 'tabela', colunas: ['Benefício', 'O que representa na prática'], linhas: [
        ['Saldo confiável', 'O gestor passa a confiar no saldo disponível, evitando decisões baseadas em valores incorretos.'],
        ['Detecção de erros', 'Cobranças indevidas, tarifas duplicadas e taxas de cartão fora do contratado são identificadas e contestadas.'],
        ['Prevenção de fraudes', 'Movimentos não autorizados ou desvios são percebidos com rapidez na conferência diária.'],
        ['Fluxo de caixa real', 'A visão precisa das entradas e saídas sustenta o planejamento financeiro do posto.'],
        ['Foco no negócio', 'A equipe do posto deixa de gastar horas conferindo extratos e se dedica à operação.'],
      ] },

      { tipo: 'subtitulo', texto: 'Divisão de responsabilidades' },
      { tipo: 'paragrafo', texto: 'São responsabilidades da CONTRATADA (prestador BPO):' },
      { tipo: 'lista', itens: [
        'Coletar os extratos, cruzar os lançamentos e identificar as divergências dentro dos prazos acordados;',
        'Classificar corretamente tarifas, juros, taxas e demais débitos;',
        'Comunicar pendências de forma tempestiva e acompanhar sua resolução;',
        'Manter sigilo e segurança das informações do cliente;',
        'Emitir o relatório de conciliação ao final de cada período.',
      ] },
      { tipo: 'paragrafo', texto: 'São responsabilidades da CONTRATANTE (cliente):' },
      { tipo: 'lista', itens: [
        'Fornecer acesso às contas bancárias e aos portais necessários, ou enviar os extratos nos prazos;',
        'Esclarecer a natureza de lançamentos quando solicitado;',
        'Responder às pendências apontadas pela CONTRATADA;',
        'Validar o relatório de conciliação entregue.',
      ] },

      { tipo: 'subtitulo', texto: 'Considerações finais' },
      { tipo: 'paragrafo', texto:
        'A conciliação bancária por meio de BPO transforma uma rotina trabalhosa e propensa a falhas em um processo ' +
        'padronizado, controlado e auditável. Para o posto de combustíveis, significa enxergar com clareza o que de ' +
        'fato entrou e saiu da conta, identificar perdas com tarifas e taxas indevidas e tomar decisões financeiras ' +
        'com base em números confiáveis.' },
    ],
  },
};
