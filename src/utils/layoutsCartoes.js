// Layouts de arquivos de vendas de cartão para o Diagnóstico (BPO › Conciliação
// de caixas › Diagnosticar). A Equals traz várias adquirentes num arquivo (com a
// coluna "Adquirente"); os relatórios das adquirentes (Cielo, Rede, Getnet,
// Sipag…) trazem só a própria — a adquirente do arquivo é fixa.
// Os apelidos de coluna servem para o mapeamento automático (sempre ajustável
// na tela); são comparados sem acento e por "contém".

import * as XLSX from 'xlsx';

const semAcento = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Apelidos comuns a todos os layouts (os específicos vêm antes).
const BASE = {
  adquirente: ['adquirente', 'credenciadora'],
  bandeira: ['bandeira', 'produto', 'cartao'],
  modalidade: ['modalidade', 'forma de pagamento', 'tipo de venda', 'tipo transacao', 'tipo', 'debito', 'credito'],
  autorizacao: ['codigo de autorizacao', 'cod autorizacao', 'cod. autorizacao', 'n autorizacao', 'no autorizacao', 'numero autorizacao', 'autorizacao', 'autorizac'],
  valor: ['valor bruto', 'valor da venda', 'valor original', 'valor venda', 'vl bruto', 'bruto', 'valor'],
  // Valor total da venda parcelada (quando o arquivo traz uma linha por parcela).
  total: ['total plano de venda', 'valor total da venda', 'valor total venda', 'total da venda'],
  parcelas: ['total de parcela', 'qtd parcela', 'qtde parcela', 'quantidade de parcela', 'total parcela', 'numero de parcela', 'parcelas', 'plano'],
  hora: ['hora da venda', 'hora venda', 'horario', 'hr venda', 'hora'],
};
const com = (extra) => Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, [...(extra[k] || []), ...v]]));

export const LAYOUTS = [
  { k: 'equals', rot: 'Equals (várias adquirentes)', multi: true, nomes: ['equals'],
    aliases: com({ adquirente: ['adquirente'] }) },
  { k: 'cielo', rot: 'Cielo', multi: false, adquirente: 'Cielo', nomes: ['cielo'],
    aliases: com({ autorizacao: ['codigo de autorizacao'], valor: ['valor bruto'], modalidade: ['forma de pagamento', 'produto'], bandeira: ['bandeira'], parcelas: ['quantidade de parcelas'] }) },
  { k: 'rede', rot: 'Rede', multi: false, adquirente: 'Rede', nomes: ['rede', 'userede'],
    aliases: com({ autorizacao: ['n autorizacao', 'numero da autorizacao', 'autorizacao'], valor: ['valor da venda original', 'valor bruto', 'valor da venda'], modalidade: ['modalidade', 'tipo'], parcelas: ['numero de parcelas', 'n parcelas'] }) },
  { k: 'getnet', rot: 'Getnet', multi: false, adquirente: 'Getnet', nomes: ['getnet'],
    aliases: com({ autorizacao: ['autorizacao', 'cod. autorizacao'], valor: ['valor bruto', 'valor da venda'], modalidade: ['tipo de lancamento', 'modalidade', 'produto'], parcelas: ['plano', 'parcelas'] }) },
  // Sipag: "Relatório de vendas" com 2 linhas de título; parcelado = uma linha por
  // parcela ("Valor parcela bruto") + "Total plano de venda" com o total da venda.
  { k: 'sipag', rot: 'Sipag', multi: false, adquirente: 'Sipag', nomes: ['sipag', 'sicoob'],
    aliases: com({ autorizacao: ['numero da autorizacao'], valor: ['valor parcela bruto', 'valor bruto'], total: ['total plano de venda'],
      modalidade: ['forma de pagamento'], bandeira: ['bandeira'], parcelas: ['total de parcela'], hora: ['data da transacao'] }) },
  { k: 'outro', rot: 'Outra adquirente', multi: false, adquirente: '', nomes: [],
    aliases: com({}) },
];
export const layoutPorChave = (k) => LAYOUTS.find(l => l.k === k) || LAYOUTS[LAYOUTS.length - 1];

// Palavras que indicam a linha de CABEÇALHO (relatórios trazem título/filtros no topo).
const PALAVRAS_CAB = ['autoriz', 'valor', 'bandeira', 'data', 'nsu', 'parcela', 'modalidade', 'produto', 'hora', 'adquirente', 'tipo'];

// Escolhe a linha de cabeçalho entre as primeiras 40 (a que mais tem palavras-chave).
function montarTabela(linhas) {
  const limpas = linhas.filter(l => l.some(v => String(v ?? '').trim().length > 0));
  if (!limpas.length) return { headers: [], rows: [] };
  let melhor = 0, pontos = -1;
  limpas.slice(0, 40).forEach((l, i) => {
    const p = l.filter(c => { const t = semAcento(c); return t && PALAVRAS_CAB.some(w => t.includes(w)); }).length;
    if (p > pontos) { pontos = p; melhor = i; }
  });
  if (pontos < 2) melhor = 0;
  const headers = limpas[melhor].map(h => String(h ?? '').trim());
  const rows = limpas.slice(melhor + 1).map(l => headers.map((_, idx) => String(l[idx] ?? '').trim()));
  return { headers, rows };
}

function detectarDelimitador(primeiraLinha) {
  const cands = [';', ',', '\t', '|'];
  let melhor = ';', max = -1;
  cands.forEach(d => { const n = primeiraLinha.split(d).length; if (n > max) { max = n; melhor = d; } });
  return melhor;
}

// CSV robusto a `;`/`,`/tab, aspas e BOM → linhas (array de arrays).
function linhasCSV(texto) {
  let t = String(texto || ''); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Separador pela linha mais "cheia" das primeiras (o título do relatório não conta).
  const amostra = t.split('\n').filter(l => l.trim()).slice(0, 40)
    .sort((a, b) => b.length - a.length)[0] || '';
  const delim = detectarDelimitador(amostra);
  const linhas = [];
  let campo = '', linha = [], dentroAspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dentroAspas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else dentroAspas = false; }
      else campo += c;
    } else if (c === '"') dentroAspas = true;
    else if (c === delim) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo.length > 0 || linha.length > 0) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

// Lê CSV ou Excel (.xlsx/.xls) → { headers, rows } com a linha de cabeçalho detectada.
export async function lerArquivoVendas(file) {
  const buf = await file.arrayBuffer();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
    const wb = XLSX.read(buf, { type: 'array' });
    // Primeira aba com conteúdo útil (mais linhas).
    let melhor = null;
    wb.SheetNames.forEach(n => {
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, rawNumbers: true, defval: '' });
      if (!melhor || linhas.length > melhor.length) melhor = linhas;
    });
    return montarTabela((melhor || []).map(l => l.map(v => (v == null ? '' : String(v)))));
  }
  let texto = new TextDecoder('utf-8').decode(buf);
  if (texto.includes('�')) {
    try { texto = new TextDecoder('windows-1252').decode(buf); } catch { /* mantém utf-8 */ }
  }
  return montarTabela(linhasCSV(texto));
}

// Layout provável pelo nome do arquivo e pelas colunas.
export function detectarLayout(nomeArquivo, headers) {
  const n = semAcento(nomeArquivo);
  const porNome = LAYOUTS.find(l => l.nomes.some(x => n.includes(x)));
  if (porNome) return porNome.k;
  return headers.some(h => semAcento(h).includes('adquirente')) ? 'equals' : 'outro';
}

// Mapeamento automático das colunas pelo layout.
export function adivinharColunas(layoutK, headers) {
  const lay = layoutPorChave(layoutK);
  const achar = (chaves) => {
    for (const chave of chaves) {
      const idx = headers.findIndex(h => semAcento(h).includes(semAcento(chave)));
      if (idx >= 0) return String(idx);
    }
    return '';
  };
  const cols = Object.fromEntries(Object.entries(lay.aliases).map(([campo, chaves]) => [campo, achar(chaves)]));
  if (!lay.multi) cols.adquirente = '';
  return cols;
}

// Adquirente fixa sugerida para o layout, entre as configuradas na rede.
export function sugerirAdquirente(layoutK, adquirentesRede) {
  const lay = layoutPorChave(layoutK);
  if (lay.multi || !lay.adquirente) return '';
  const alvo = semAcento(lay.adquirente);
  return adquirentesRede.find(a => semAcento(a).includes(alvo)) || lay.adquirente;
}

// ─── Modelos salvos (bpo_layout_arquivo_cartao) ──────────────────
// O mapeamento é guardado pelo NOME da coluna (não pela posição), para valer em
// qualquer arquivo com o mesmo cabeçalho.
const normCol = (h) => semAcento(h).replace(/\s+/g, ' ').trim();

// Pontuação do modelo para este cabeçalho: todas as colunas mapeadas precisam
// existir; desempata pela semelhança do cabeçalho inteiro.
export function pontuarModelo(modelo, headers) {
  const hs = new Set(headers.map(normCol));
  const mapeadas = CAMPOS_ARQUIVO.map(c => modelo.mapeamento?.[c]).filter(Boolean).map(normCol);
  if (!mapeadas.length || !mapeadas.every(c => hs.has(c))) return 0;
  const orig = (modelo.colunas || []).map(normCol);
  const comuns = orig.filter(c => hs.has(c)).length;
  return 1 + comuns / Math.max(orig.length, hs.size, 1);
}

export function melhorModelo(modelos, headers) {
  let melhor = null, pts = 0;
  (modelos || []).forEach(m => { const p = pontuarModelo(m, headers); if (p > pts) { pts = p; melhor = m; } });
  return melhor;
}

// Modelo → índices de coluna deste arquivo.
export function colsDoModelo(modelo, headers) {
  const idx = (nome) => { const i = headers.findIndex(h => normCol(h) === normCol(nome)); return i >= 0 ? String(i) : ''; };
  const cols = {};
  CAMPOS_ARQUIVO.forEach(c => { cols[c] = modelo.mapeamento?.[c] ? idx(modelo.mapeamento[c]) : ''; });
  return cols;
}

// Índices → nomes de coluna (para salvar o modelo).
export function mapeamentoPorNome(cols, headers) {
  const m = {};
  CAMPOS_ARQUIVO.forEach(c => { if (cols[c] !== '' && cols[c] != null) m[c] = headers[Number(cols[c])]; });
  return m;
}

export const CAMPOS_ARQUIVO = ['adquirente', 'bandeira', 'modalidade', 'autorizacao', 'valor', 'total', 'parcelas', 'hora'];

// Valores FIXOS quando o arquivo não tem a coluna (ex.: cartão frota é sempre
// crédito e o arquivo da Good Card não traz débito/crédito). Guardados no
// modelo em mapeamento.fixos.
export const CAMPOS_FIXOS = ['bandeira', 'modalidade'];
export const fixosDoModelo = (modelo) => ({ bandeira: '', modalidade: '', ...(modelo?.mapeamento?.fixos || {}) });
