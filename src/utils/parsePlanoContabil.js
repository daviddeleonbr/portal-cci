// parsePlanoContabil
// ============================================================
// Lê uma planilha (xls/xlsx/csv) do plano de contas contábil e devolve as
// linhas normalizadas { codigo, codigo_reduzido, descricao, natureza }.
// Detecta as colunas pelos nomes do cabeçalho (com sinônimos comuns).
// ============================================================
import * as XLSX from 'xlsx';

// normaliza texto p/ casar cabeçalhos (sem acento, minúsculo, sem espaços extras)
function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

// sinônimos aceitos por campo (o primeiro match ganha)
const SINONIMOS = {
  codigo:          ['codigo', 'código', 'conta', 'classificador', 'conta contabil', 'cod'],
  codigo_reduzido: ['codigo reduzido', 'cod reduzido', 'reduzido', 'reduzida', 'cod red', 'reduz'],
  descricao:       ['descricao', 'descrição', 'nome', 'nome da conta', 'titulo', 'historico', 'descr'],
  natureza:        ['natureza', 'nat', 'd/c', 'dc', 'debito/credito'],
  classificacao:   ['classificacao', 'classificação', 'sintetica/analitica', 'analitica/sintetica',
                    'sintetica ou analitica', 's/a', 'sint/anal', 'sint', 'tipo de conta', 'tipo'],
};

function detectarColunas(header) {
  const cols = header.map(norm);
  const idx = {};
  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    // match exato primeiro, depois "contém"
    let i = cols.findIndex(c => nomes.includes(c));
    if (i < 0) i = cols.findIndex(c => nomes.some(n => c.includes(n)));
    idx[campo] = i; // -1 = não encontrada
  }
  return idx;
}

// Recebe um File (do input). Retorna { linhas, colunas, total, header }.
// Lança erro claro se faltar a coluna de código ou descrição.
export async function parsePlanoContabilFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Planilha vazia ou ilegível.');
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  // primeira linha não-vazia = cabeçalho
  const headerIdx = aoa.findIndex(row => row.some(c => String(c).trim() !== ''));
  if (headerIdx < 0) throw new Error('Planilha sem dados.');
  const header = aoa[headerIdx].map(c => String(c));
  const colunas = detectarColunas(header);

  if (colunas.codigo < 0 || colunas.descricao < 0) {
    throw new Error(
      'Não encontrei as colunas obrigatórias. A planilha precisa ter um cabeçalho ' +
      'com pelo menos "Código" e "Descrição" (e, se houver, "Código reduzido" e "Natureza").'
    );
  }

  const linhas = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    const get = (idx) => (idx >= 0 ? String(row[idx] ?? '').trim() : '');
    const codigo = get(colunas.codigo);
    const descricao = get(colunas.descricao);
    if (!codigo && !descricao) continue; // linha vazia
    linhas.push({
      codigo,
      codigo_reduzido: get(colunas.codigo_reduzido),
      descricao,
      natureza: get(colunas.natureza),
      classificacao: get(colunas.classificacao),
    });
  }
  return { linhas, colunas, header, total: linhas.length };
}

// Constrói a árvore a partir do `codigo` (hierarquia por segmentos separados
// por '.'). Cada conta vira { ...conta, nivel, filhos[] }. Contas cujo pai não
// existe entram na raiz. Preserva a ordem recebida.
export function montarArvore(contas) {
  const porCodigo = new Map();
  contas.forEach(c => porCodigo.set(String(c.codigo), { ...c, filhos: [] }));

  const paiDe = (codigo) => {
    let cod = String(codigo);
    while (cod.includes('.')) {
      cod = cod.slice(0, cod.lastIndexOf('.'));
      if (porCodigo.has(cod)) return porCodigo.get(cod);
    }
    return null;
  };

  const raiz = [];
  porCodigo.forEach((no) => {
    const pai = paiDe(no.codigo);
    if (pai) pai.filhos.push(no);
    else raiz.push(no);
  });

  // profundidade (nível) p/ indentação
  const marcar = (nos, nivel) => nos.forEach(n => { n.nivel = nivel; marcar(n.filhos, nivel + 1); });
  marcar(raiz, 0);
  return raiz;
}

// Achata a árvore em lista (respeitando a ordem/indentação) p/ render simples.
export function achatarArvore(raiz) {
  const out = [];
  const walk = (nos) => nos.forEach(n => { out.push(n); walk(n.filhos); });
  walk(raiz);
  return out;
}

// Cabeçalhos "canônicos" que aparecem no modelo (os aceitos são os SINONIMOS).
export const COLUNAS_MODELO = ['Código', 'Código reduzido', 'Descrição', 'Natureza', 'Sintética/Analítica'];

// Gera e baixa um modelo .xlsx com o cabeçalho correto e exemplos que ilustram
// a hierarquia (o código com pontos define a árvore; sintética agrupa, analítica
// é folha e recebe lançamento).
export function baixarModeloPlano() {
  const aoa = [
    COLUNAS_MODELO,
    ['1',          '',   'ATIVO',                    'Devedora', 'Sintética'],
    ['1.1',        '',   'ATIVO CIRCULANTE',         'Devedora', 'Sintética'],
    ['1.1.01',     '',   'Caixa e Equivalentes',     'Devedora', 'Sintética'],
    ['1.1.01.001', '1',  'Caixa Geral',              'Devedora', 'Analítica'],
    ['1.1.02.001', '2',  'Bancos',                   'Devedora', 'Analítica'],
    ['3',          '',   'RECEITAS',                 'Credora',  'Sintética'],
    ['3.1',        '',   'RECEITA BRUTA',            'Credora',  'Sintética'],
    ['3.1.01.001', '10', 'Receita de Vendas',        'Credora',  'Analítica'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 36 }, { wch: 12 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plano de Contas');
  XLSX.writeFile(wb, 'modelo-plano-contabil.xlsx');
}
