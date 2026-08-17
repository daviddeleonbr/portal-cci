// Motor de cláusulas — núcleo puro da geração de contratos.
//
// SEM dependências de React/Supabase de propósito: é determinístico e testável
// fora do browser (ver motor.test.mjs). O pipeline é:
//
//   itens contratados + serviços  →  contexto (categorias, cláusulas de serviço, flags)
//   contexto + catálogo de cláusulas  →  cláusulas aplicáveis (obrigatórias + condicionais)
//   config + cliente + contrato  →  valores das variáveis
//   cláusulas + valores  →  blocos preenchidos ({{...}} substituídos)
//   tudo  →  validação (bloqueia emissão) + documento final
//
// PRINCÍPIO: uma cláusula de serviço SÓ entra se o serviço estiver contratado.
// Nada de valor comercial embutido: vigência/reajuste/multa/foro/pagamento vêm
// por variáveis preenchidas a partir da config do admin.

// ── Fallback nome do serviço → chave de cláusula ─────────────
// Usado quando o serviço ainda não tem `contrato_meta.clausula_chaves`
// configurado. Mantém o comportamento legado (matching por nome).
const NOME_PARA_CHAVE = [
  { termo: 'nota',   chave: 'servico_lancamento_notas' },
  { termo: 'bancár', chave: 'servico_conciliacao_bancaria' },
  { termo: 'bancar', chave: 'servico_conciliacao_bancaria' },
];

function chavesPorNome(nome) {
  const n = (nome || '').toLowerCase();
  return NOME_PARA_CHAVE.filter(m => n.includes(m.termo)).map(m => m.chave);
}

// ── Contexto: o que a contratação "ativa" no motor ──────────
// itens: [{ servico_id, nome, categoria, contrato_meta? }]
// servicosMeta: Map<servico_id, { categoria, contrato_meta }>  (opcional)
export function resolverContexto(itens = [], servicosMeta = null) {
  const categorias = new Set();
  const servicoChaves = new Set();
  const flags = new Set();

  for (const it of itens) {
    const meta =
      it.contrato_meta ||
      (servicosMeta && it.servico_id && servicosMeta.get(it.servico_id)?.contrato_meta) ||
      {};
    const categoria =
      it.categoria ||
      (servicosMeta && it.servico_id && servicosMeta.get(it.servico_id)?.categoria) ||
      null;

    if (categoria) categorias.add(String(categoria).toLowerCase());

    const chaves = Array.isArray(meta.clausula_chaves) && meta.clausula_chaves.length
      ? meta.clausula_chaves
      : chavesPorNome(it.nome);
    chaves.forEach(c => servicoChaves.add(c));

    if (meta.envolve_dados_pessoais) flags.add('envolve_dados_pessoais');
  }

  return { categorias, servicoChaves, flags };
}

// ── Aplicabilidade de uma cláusula ao contexto ──────────────
export function clausulaAplicavel(clausula, ctx) {
  if (!clausula || clausula.ativo === false) return false;
  const cond = clausula.condicao || { modo: 'sempre' };
  switch (cond.modo) {
    case 'sempre':    return true;
    case 'categoria': return ctx.categorias.has(String(cond.valor || '').toLowerCase());
    case 'servico':   return ctx.servicoChaves.has(cond.valor ?? clausula.chave);
    case 'flag':      return ctx.flags.has(cond.valor);
    default:          return false;
  }
}

// ── Seleção ordenada das cláusulas aplicáveis ───────────────
export function selecionarClausulas(clausulas = [], ctx) {
  return clausulas
    .filter(c => clausulaAplicavel(c, ctx))
    .sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100));
}

// ── Formatação ──────────────────────────────────────────────
export function formatarMoeda(n) {
  const v = Number(n || 0);
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Valores das variáveis ({{...}}) ─────────────────────────
// Retorna um mapa plano { 'contratada.cnpj': '...', ... }. Chaves ausentes
// (valor vazio) NÃO entram no mapa — é assim que detectamos variáveis não
// preenchidas na validação.
export function construirValores({ contratada = {}, contratante = {}, contrato = {}, itens = [], regras = {} }) {
  const val = {};
  const set = (k, v) => { if (v != null && String(v).trim() !== '') val[k] = String(v); };

  // CONTRATADA
  set('contratada.razaoSocial', contratada.razao_social || contratada.nome_fantasia);
  set('contratada.cnpj', contratada.cnpj);
  set('contratada.endereco', montarEndereco(contratada));
  set('contratada.representante', contratada.representante_nome);
  set('contratada.representanteCpf', contratada.representante_cpf);
  set('contratada.representanteCargo', contratada.representante_cargo);

  // CONTRATANTE
  set('contratante.razaoSocial', contratante.razao_social || contratante.nome || contratante.cliente_nome);
  set('contratante.cnpj', contratante.cnpj || contratante.cliente_cnpj);
  set('contratante.endereco', montarEndereco(contratante));
  set('contratante.representante', contratante.representante_nome);
  set('contratante.representanteCpf', contratante.representante_cpf);
  set('contratante.representanteCargo', contratante.representante_cargo);

  // CONTRATO
  set('contrato.numero', contrato.numero);
  set('contrato.data', contrato.data);
  set('contrato.valorTotal', contrato.valorTotal != null ? formatarMoeda(contrato.valorTotal) : null);

  // SERVIÇOS (lista textual)
  const nomes = itens.map(i => i.nome).filter(Boolean);
  set('servicos', nomes.join('; '));

  // REGRAS GERAIS (derivadas da config)
  const { vigencia, reajuste, rescisao, pagamento, foro, lgpd } = regras || {};

  if (vigencia?.tipo) set('vigencia.descricao', descreverVigencia(vigencia));

  if (reajuste?.indice) set('reajuste.indice', reajuste.indice);
  if (reajuste?.periodicidade_meses) set('reajuste.periodicidade', descreverPeriodicidade(reajuste.periodicidade_meses));

  if (rescisao?.aviso_previo_dias != null && rescisao.aviso_previo_dias !== '')
    set('rescisao.avisoPrevio', `${rescisao.aviso_previo_dias} dias`);
  set('rescisao.multa', rescisao?.multa_descricao);

  if (pagamento?.vencimento_dia != null && pagamento.vencimento_dia !== '')
    set('pagamento.vencimentoDia', String(pagamento.vencimento_dia));
  set('pagamento.forma', pagamento?.forma);
  set('pagamento.encargosAtraso', pagamento?.encargos_atraso);

  set('foro.comarca', foro?.comarca);
  set('foro.uf', foro?.uf);

  set('lgpd.papel', lgpd?.papel_contratada);

  return val;
}

function montarEndereco(p = {}) {
  const partes = [
    [p.endereco, p.numero].filter(Boolean).join(', '),
    p.complemento,
    p.bairro,
    [p.cidade, p.estado].filter(Boolean).join(' - '),
    p.cep,
  ].filter(x => x && String(x).trim());
  return partes.join(' · ');
}

function descreverVigencia(v) {
  if (v.tipo === 'determinado') {
    const meses = v.meses ? `${v.meses} meses` : 'prazo determinado';
    const renov = v.renovacao_automatica
      ? ', renovando-se automaticamente por iguais e sucessivos períodos, salvo manifestação em contrário de qualquer das partes'
      : '';
    return `O presente contrato vigora pelo prazo de ${meses}, a contar da data de início${renov}.`;
  }
  return 'O presente contrato vigora por prazo indeterminado, a contar da data de início.';
}

function descreverPeriodicidade(meses) {
  const m = Number(meses);
  if (m === 12) return 'período de 12 (doze) meses';
  if (m === 6) return 'período de 6 (seis) meses';
  return `período de ${m} meses`;
}

// ── Substituição de variáveis em texto ──────────────────────
const RE_VAR = /\{\{\s*([\w.]+)\s*\}\}/g;

export function substituirTexto(texto, valores, faltantesOut) {
  if (typeof texto !== 'string') return texto;
  return texto.replace(RE_VAR, (_, chave) => {
    if (Object.prototype.hasOwnProperty.call(valores, chave)) return valores[chave];
    if (faltantesOut) faltantesOut.add(chave);
    return `{{${chave}}}`; // mantém visível — a validação impede a emissão
  });
}

// Percorre os blocos de uma cláusula substituindo variáveis em todos os campos
// de texto. Retorna { blocos, faltantes:Set }.
export function preencherBlocos(blocos = [], valores = {}) {
  const faltantes = new Set();
  const sub = (t) => substituirTexto(t, valores, faltantes);

  const out = blocos.map(b => {
    switch (b.tipo) {
      case 'subtitulo':
      case 'paragrafo':
        return { ...b, texto: sub(b.texto) };
      case 'lista':
        return { ...b, itens: (b.itens || []).map(sub) };
      case 'tabela':
        return {
          ...b,
          colunas: (b.colunas || []).map(sub),
          linhas: (b.linhas || []).map(l => l.map(sub)),
        };
      default:
        return b; // 'marcador' e outros passam intactos
    }
  });

  return { blocos: out, faltantes };
}

// ── Validação pré-emissão ───────────────────────────────────
// Retorna { ok, erros:[], avisos:[] }. `erros` bloqueiam a emissão.
export function validarContrato({ contratada = {}, contratante = {}, itens = [], regras = {}, clausulasSelecionadas = [], faltantesVariaveis = new Set() }) {
  const erros = [];
  const avisos = [];

  // Partes — CONTRATADA
  if (!contratada.razao_social) erros.push('Dados da CONTRATADA: razão social não preenchida.');
  if (!contratada.cnpj) erros.push('Dados da CONTRATADA: CNPJ não preenchido.');
  if (!contratada.representante_nome) erros.push('Dados da CONTRATADA: representante legal não preenchido.');
  if (!contratada.representante_cpf) erros.push('Dados da CONTRATADA: CPF do representante não preenchido.');

  // Partes — CONTRATANTE
  const nomeContratante = contratante.razao_social || contratante.nome || contratante.cliente_nome;
  const docContratante = contratante.cnpj || contratante.cliente_cnpj || contratante.cpf;
  if (!nomeContratante) erros.push('Dados da CONTRATANTE: razão social/nome não preenchido.');
  if (!docContratante) erros.push('Dados da CONTRATANTE: CNPJ/CPF não preenchido.');
  if (!contratante.representante_nome) erros.push('Dados da CONTRATANTE: representante legal não preenchido.');
  if (!contratante.representante_cpf) erros.push('Dados da CONTRATANTE: CPF do representante não preenchido.');

  // Serviços / valores
  if (!itens.length) erros.push('Nenhum serviço selecionado.');
  const total = itens.reduce((s, i) => s + (Number(i.valor_total) || (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0)), 0);
  if (itens.length && total <= 0) erros.push('Valor total dos serviços é zero — revise os valores.');

  // Regras gerais obrigatórias (parametrizáveis; ausência bloqueia)
  if (!regras?.vigencia?.tipo) erros.push('Regra de vigência não definida (config da empresa).');
  if (!regras?.reajuste?.indice) erros.push('Índice de reajuste não definido (config da empresa).');
  if (!regras?.foro?.comarca || !regras?.foro?.uf) erros.push('Foro (comarca/UF) não definido (config da empresa).');
  if (regras?.pagamento?.vencimento_dia == null || regras?.pagamento?.vencimento_dia === '') erros.push('Dia de vencimento do pagamento não definido (config da empresa).');
  if (!regras?.pagamento?.forma) erros.push('Forma de pagamento não definida (config da empresa).');

  // Variáveis não preenchidas nas cláusulas selecionadas
  if (faltantesVariaveis && faltantesVariaveis.size) {
    erros.push('Variáveis sem valor no contrato: ' + [...faltantesVariaveis].map(v => `{{${v}}}`).join(', ') + '.');
  }

  // Cláusulas obrigatórias precisam estar presentes
  const chavesSelecionadas = new Set(clausulasSelecionadas.map(c => c.chave));
  const obrigatoriasAusentes = clausulasSelecionadas.length === 0;
  if (obrigatoriasAusentes) erros.push('Nenhuma cláusula selecionada — verifique o catálogo de cláusulas.');

  // Avisos: cláusulas que dependem de revisão jurídica
  for (const c of clausulasSelecionadas) {
    if (c.revisar_juridico) avisos.push(`Cláusula "${c.titulo}" requer revisão jurídica antes da emissão.`);
  }

  return { ok: erros.length === 0, erros, avisos, chavesSelecionadas: [...chavesSelecionadas] };
}

// ── Imutabilidade e versionamento ───────────────────────────
// Um contrato assinado/ativo não pode ser alterado silenciosamente — qualquer
// mudança gera nova versão/aditivo (Fase 2). Helpers puros usados pela UI/serviço.
export const CONTRATO_IMUTAVEL_STATUS = ['assinado', 'ativo'];

export function contratoImutavel(status) {
  return CONTRATO_IMUTAVEL_STATUS.includes(String(status || '').toLowerCase());
}

export function proximaVersao(versaoAtual) {
  return (Number(versaoAtual) || 0) + 1;
}

// ── Documento final ─────────────────────────────────────────
// Junta tudo: seleciona cláusulas, preenche variáveis, valida e devolve a
// estrutura pronta para o renderizador (RelatorioContrato).
export function montarDocumento({ catalogoClausulas = [], contratada = {}, contratante = {}, contrato = {}, itens = [], regras = {}, servicosMeta = null }) {
  const ctx = resolverContexto(itens, servicosMeta);
  const selecionadas = selecionarClausulas(catalogoClausulas, ctx);
  const valores = construirValores({ contratada, contratante, contrato, itens, regras });

  const faltantesTotais = new Set();
  const clausulas = selecionadas.map(c => {
    const { blocos, faltantes } = preencherBlocos(c.corpo || [], valores);
    faltantes.forEach(f => faltantesTotais.add(f));
    return { chave: c.chave, titulo: c.titulo, tipo: c.tipo, revisar_juridico: c.revisar_juridico, blocos };
  });

  const validacao = validarContrato({
    contratada, contratante, itens, regras,
    clausulasSelecionadas: selecionadas,
    faltantesVariaveis: faltantesTotais,
  });

  return {
    titulo: 'Contrato de Prestação de Serviços de BPO',
    clausulas,
    valores,
    contexto: { categorias: [...ctx.categorias], servicoChaves: [...ctx.servicoChaves], flags: [...ctx.flags] },
    validacao,
  };
}
