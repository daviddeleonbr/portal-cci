// Testes do motor de cláusulas — Node puro (sem framework).
// Rodar:  node src/lib/contratos/motor.test.mjs
//
// Cobre os cenários A–J do requisito, com destaque para:
//   "o sistema NÃO adiciona cláusulas de serviços que não foram contratados".

import {
  montarDocumento, resolverContexto, selecionarClausulas,
  validarContrato, contratoImutavel, proximaVersao, formatarMoeda,
} from './motor.js';
import { CLAUSULAS_SEED } from '../../data/clausulasSeed.js';

// ── mini-assert ─────────────────────────────────────────────
let ok = 0, fail = 0;
const falhas = [];
function assert(cond, msg) {
  if (cond) { ok++; } else { fail++; falhas.push(msg); console.error('  ✗ ' + msg); }
}
function grupo(nome) { console.log('\n' + nome); }

// ── fixtures ────────────────────────────────────────────────
const catalogo = CLAUSULAS_SEED;

const CONTRATADA = {
  razao_social: 'CCI Consultoria Inteligente LTDA', cnpj: '57.268.175/0001-00',
  endereco: 'Rua Humaitá', numero: '100', bairro: 'Divino Espírito Santo',
  cidade: 'Vila Velha', estado: 'ES', cep: '29.107-250',
  representante_nome: 'Fulano de Tal', representante_cpf: '123.456.789-00', representante_cargo: 'Sócio-administrador',
};
const CONTRATANTE = {
  razao_social: 'Posto Trivela LTDA', cnpj: '11.222.333/0001-44',
  cidade: 'Vila Velha', estado: 'ES',
  representante_nome: 'Ciclano de Souza', representante_cpf: '987.654.321-00', representante_cargo: 'Sócio',
};
const REGRAS = {
  vigencia:  { tipo: 'determinado', meses: 12, renovacao_automatica: true },
  reajuste:  { indice: 'IPCA', periodicidade_meses: 12 },
  rescisao:  { aviso_previo_dias: 30, multa_descricao: 'Na rescisão antecipada e imotivada, a parte que der causa pagará multa equivalente a uma mensalidade.' },
  pagamento: { vencimento_dia: 10, forma: 'boleto bancário', encargos_atraso: 'multa de 2% e juros de 1% ao mês' },
  foro:      { comarca: 'Vila Velha', uf: 'ES' },
  lgpd:      { papel_contratada: 'operador' },
};

const itemNotas       = { servico_id: 's1', nome: 'Lançamento de notas fiscais', categoria: 'bpo', quantidade: 100, valor_unitario: 2.5, valor_total: 250 };
const itemConciliacao = { servico_id: 's2', nome: 'Conciliação bancária', categoria: 'bpo', quantidade: 3, valor_unitario: 160, valor_total: 480 };

const gerar = (itens, over = {}) => montarDocumento({
  catalogoClausulas: catalogo,
  contratada: over.contratada ?? CONTRATADA,
  contratante: over.contratante ?? CONTRATANTE,
  contrato: { numero: 'CT-0001', data: '16/08/2026', valorTotal: itens.reduce((s, i) => s + i.valor_total, 0) },
  itens,
  regras: over.regras ?? REGRAS,
});
const chaves = (doc) => doc.clausulas.map(c => c.chave);
const textoDe = (doc, chave) => JSON.stringify(doc.clausulas.find(c => c.chave === chave)?.blocos || []);
const semPlaceholder = (doc) => !JSON.stringify(doc.clausulas).includes('{{');

// ── Cenário A: um único serviço ─────────────────────────────
grupo('Cenário A — cliente contrata apenas UM serviço (notas)');
{
  const doc = gerar([itemNotas]);
  assert(chaves(doc).includes('servico_lancamento_notas'), 'A: cláusula do serviço contratado presente');
  assert(!chaves(doc).includes('servico_conciliacao_bancaria'), 'A: NÃO inclui cláusula de serviço não contratado (conciliação)');
  assert(chaves(doc).includes('geral_objeto') && chaves(doc).includes('geral_foro'), 'A: cláusulas obrigatórias presentes');
  assert(doc.validacao.ok, 'A: validação passa com dados completos (' + doc.validacao.erros.join(' | ') + ')');
  assert(semPlaceholder(doc), 'A: nenhum placeholder {{...}} restante');
}

// ── Cenário B: múltiplos serviços ───────────────────────────
grupo('Cenário B — cliente contrata múltiplos serviços');
{
  const doc = gerar([itemNotas, itemConciliacao]);
  assert(chaves(doc).includes('servico_lancamento_notas'), 'B: cláusula de notas presente');
  assert(chaves(doc).includes('servico_conciliacao_bancaria'), 'B: cláusula de conciliação presente');
  assert(doc.validacao.ok, 'B: validação passa');
}

// ── Cenário C: dois clientes, serviços diferentes ───────────
grupo('Cenário C — dois clientes com serviços diferentes');
{
  const docA = gerar([itemNotas]);
  const docB = gerar([itemConciliacao]);
  assert(chaves(docA).includes('servico_lancamento_notas') && !chaves(docA).includes('servico_conciliacao_bancaria'), 'C: cliente A só tem cláusula de notas');
  assert(chaves(docB).includes('servico_conciliacao_bancaria') && !chaves(docB).includes('servico_lancamento_notas'), 'C: cliente B só tem cláusula de conciliação');
}

// ── Cenário D: alteração de preço ───────────────────────────
grupo('Cenário D — alteração de preço reflete no contrato');
{
  const barato = montarDocumento({ catalogoClausulas: catalogo, contratada: CONTRATADA, contratante: CONTRATANTE, itens: [itemNotas], regras: REGRAS, contrato: { valorTotal: 250 } });
  const caro   = montarDocumento({ catalogoClausulas: catalogo, contratada: CONTRATADA, contratante: CONTRATANTE, itens: [itemNotas], regras: REGRAS, contrato: { valorTotal: 999 } });
  assert(textoDe(barato, 'geral_preco_pagamento').includes(formatarMoeda(250)), 'D: preço antigo aparece na cláusula de pagamento');
  assert(textoDe(caro, 'geral_preco_pagamento').includes(formatarMoeda(999)), 'D: preço novo aparece na cláusula de pagamento');
}

// ── Cenário E: inclusão de serviço posteriormente ───────────
grupo('Cenário E — inclusão de serviço depois');
{
  const antes = gerar([itemNotas]);
  const depois = gerar([itemNotas, itemConciliacao]);
  assert(!chaves(antes).includes('servico_conciliacao_bancaria'), 'E: antes não tem a cláusula do serviço novo');
  assert(chaves(depois).includes('servico_conciliacao_bancaria'), 'E: depois passa a ter a cláusula do serviço novo');
}

// ── Cenário F: cancelamento/rescisão ────────────────────────
grupo('Cenário F — cláusula de rescisão preenchida');
{
  const doc = gerar([itemNotas]);
  const t = textoDe(doc, 'geral_rescisao');
  assert(t.includes('30 dias'), 'F: aviso prévio preenchido');
  assert(t.includes('multa'), 'F: texto de multa preenchido');
  assert(!t.includes('{{'), 'F: sem placeholder na rescisão');
}

// ── Cenário G: tratamento de dados pessoais (LGPD) ──────────
grupo('Cenário G — serviço que trata dados pessoais dispara LGPD');
{
  const semDados = gerar([itemNotas]);
  assert(!chaves(semDados).includes('geral_lgpd'), 'G: sem flag → sem cláusula LGPD');

  const itemComDados = { ...itemNotas, contrato_meta: { envolve_dados_pessoais: true } };
  const comDados = gerar([itemComDados]);
  assert(chaves(comDados).includes('geral_lgpd'), 'G: com flag → cláusula LGPD presente');
  assert(comDados.clausulas.find(c => c.chave === 'geral_lgpd')?.revisar_juridico, 'G: LGPD marcada para revisão jurídica');
  assert(comDados.validacao.avisos.some(a => a.includes('LGPD') || a.includes('Proteção')), 'G: aviso de revisão jurídica emitido');
}

// ── Cenário H: falta informação obrigatória ─────────────────
grupo('Cenário H — informação obrigatória ausente bloqueia');
{
  const semRep = { ...CONTRATADA, representante_nome: '', representante_cpf: '' };
  const doc = gerar([itemNotas], { contratada: semRep });
  assert(!doc.validacao.ok, 'H: validação FALHA sem representante da contratada');
  assert(doc.validacao.erros.some(e => e.includes('representante')), 'H: erro aponta o representante');

  const semRegras = gerar([itemNotas], { regras: {} });
  assert(!semRegras.validacao.ok, 'H: validação FALHA sem regras gerais');
  assert(semRegras.validacao.erros.some(e => e.toLowerCase().includes('vigência')), 'H: erro aponta a vigência');
  assert(semRegras.validacao.erros.some(e => e.toLowerCase().includes('foro')), 'H: erro aponta o foro');
}

// ── Cenário I: contrato assinado é imutável ─────────────────
grupo('Cenário I — contrato assinado não pode ser alterado');
{
  assert(contratoImutavel('assinado') === true, 'I: assinado é imutável');
  assert(contratoImutavel('ativo') === true, 'I: ativo é imutável');
  assert(contratoImutavel('rascunho') === false, 'I: rascunho é editável');
}

// ── Cenário J: nova versão/aditivo ──────────────────────────
grupo('Cenário J — geração de nova versão');
{
  assert(proximaVersao(1) === 2, 'J: v1 → v2');
  assert(proximaVersao(undefined) === 1, 'J: sem versão → v1');
}

// ── resultado ───────────────────────────────────────────────
console.log('\n──────────────────────────────');
console.log(`Total: ${ok + fail} · ✓ ${ok} · ✗ ${fail}`);
if (fail) { console.error('FALHAS:\n - ' + falhas.join('\n - ')); process.exit(1); }
console.log('Todos os cenários passaram.');
