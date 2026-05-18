// ============================================================
// Geração de PDF — Histórico de Alterações em Caixas (por usuário)
//
// Layout A4 retrato. Cabeçalho com identificação CCI, rodapé com paginação.
// Estrutura hierárquica:
//   Usuário → Tipo (Inclusão / Alteração / Ajuste / Exclusão) → Eventos
//
// Cada evento renderiza:
//   - Linha de contexto (timestamp, data, doc, valor, empresa)
//   - Tabela Antes/Depois (campos relevantes) com destaque dos alterados
// ============================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const CORES = {
  cciViolet:  [89, 47, 224],     // #592FE0 (aproximado roxo CCI)
  cinzaEscuro:[33, 37, 41],
  cinzaMedio: [108, 117, 125],
  cinzaClaro: [222, 226, 230],
  cinzaBg:    [248, 249, 250],
  destaqueBg: [255, 248, 196],   // amarelo claro
  destaqueTx: [76, 56, 0],
  ok:         [21, 128, 61],
  alert:      [185, 28, 28],
};

const TIPO_INFO = {
  INCLUSAO:      { rotulo: 'Inclusão',      cor: [16, 122, 87],  bg: [220, 252, 231] },
  ALTERACAO:     { rotulo: 'Alteração',     cor: [180, 100, 21], bg: [254, 243, 199] },
  AJUSTE:        { rotulo: 'Ajuste',        cor: [29, 78, 216],  bg: [219, 234, 254] },
  EXCLUSAO:      { rotulo: 'Exclusão',      cor: [185, 28, 28],  bg: [254, 226, 226] },
  INDETERMINADO: { rotulo: 'Indeterminado', cor: [82, 82, 82],   bg: [243, 244, 246] },
};

// Margens A4 (210x297mm)
const MARGEM = { topo: 25, baixo: 22, esq: 12, dir: 12 };
const PAG_W = 210;
const PAG_H = 297;
const CONT_W = PAG_W - MARGEM.esq - MARGEM.dir;

function pad(n) { return String(n).padStart(2, '0'); }
function dataPtBr(iso) {
  if (iso == null || iso === '') return '—';
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
  return s;
}
function timestampPtBr(when) {
  if (!when) return '—';
  const s = String(when);
  const dm = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const tm = s.match(/(\d{2}):(\d{2})/);
  if (!dm) return s;
  const dataBr = `${dm[3]}/${dm[2]}/${dm[1]}`;
  return tm ? `${dataBr} ${tm[1]}:${tm[2]}` : dataBr;
}
function moedaBr(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function normalizar(v) { return v == null ? '' : String(v).trim(); }

function formatarCampo(valor, field, obj) {
  if (valor == null || String(valor).trim() === '') return '—';
  if (field.type === 'date')     return dataPtBr(valor);
  if (field.type === 'currency') return moedaBr(valor);
  if (field.type === 'conta') {
    const nome = field.nomeKey ? obj?.[field.nomeKey] : null;
    return nome ? `${valor}  ${nome}` : String(valor);
  }
  if (field.type === 'motivo') {
    const nome = field.nomeKey ? obj?.[field.nomeKey] : null;
    return nome ? String(nome) : String(valor);
  }
  return String(valor);
}

// Equivalência tolerante (mesma lógica do front)
function equivalente(a, b, type) {
  if (type === 'date')     return dataPtBr(a) === dataPtBr(b);
  if (type === 'currency') return (Number(a) || 0) === (Number(b) || 0);
  return normalizar(a) === normalizar(b);
}

// ─── Cabeçalho/rodapé fixos em cada página ─────────────────────
function desenharCabecalho(doc, ctx) {
  // Faixa colorida superior
  doc.setFillColor(...CORES.cciViolet);
  doc.rect(0, 0, PAG_W, 14, 'F');

  // Logo/marca CCI
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('CCI', MARGEM.esq, 9);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('CONSULTORIA INTELIGENTE', MARGEM.esq + 9, 9);

  // Título no canto direito
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Histórico de Alterações em Caixas', PAG_W - MARGEM.dir, 9, { align: 'right' });

  // Linha de info secundária (período, rede, gerado em)
  doc.setTextColor(...CORES.cinzaMedio);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const meta = [];
  if (ctx.periodo) meta.push(`Período: ${ctx.periodo}`);
  if (ctx.rede)    meta.push(`Rede: ${ctx.rede}`);
  if (ctx.empresa) meta.push(`Empresa: ${ctx.empresa}`);
  doc.text(meta.join('  •  '), MARGEM.esq, 19);
  doc.text(`Gerado: ${ctx.geradoEm}`, PAG_W - MARGEM.dir, 19, { align: 'right' });

  // Régua fina
  doc.setDrawColor(...CORES.cinzaClaro);
  doc.setLineWidth(0.3);
  doc.line(MARGEM.esq, 22, PAG_W - MARGEM.dir, 22);
}

function desenharRodape(doc, pagAtual, totalPaginas) {
  doc.setDrawColor(...CORES.cinzaClaro);
  doc.setLineWidth(0.3);
  doc.line(MARGEM.esq, PAG_H - MARGEM.baixo + 8, PAG_W - MARGEM.dir, PAG_H - MARGEM.baixo + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...CORES.cinzaMedio);
  doc.text('CCI • Consultoria Inteligente', MARGEM.esq, PAG_H - MARGEM.baixo + 14);
  doc.text(`Página ${pagAtual} de ${totalPaginas}`, PAG_W - MARGEM.dir, PAG_H - MARGEM.baixo + 14, { align: 'right' });
}

// Garante espaço pra próximo bloco; quebra página se necessário.
function checarEspaco(doc, y, alturaNecessaria, ctx) {
  const limite = PAG_H - MARGEM.baixo - 2;
  if (y + alturaNecessaria > limite) {
    doc.addPage();
    desenharCabecalho(doc, ctx);
    return MARGEM.topo;
  }
  return y;
}

// ─── Blocos da árvore ──────────────────────────────────────────

function bloco_Usuario(doc, y, userNode, ctx) {
  const nome  = userNode.usuarioNome || '(sem usuário)';
  const login = userNode.usuarioLogin && userNode.usuarioLogin !== nome ? userNode.usuarioLogin : '';
  const altura = login ? 12 : 9;

  y = checarEspaco(doc, y, altura + 4, ctx);

  // Faixa do usuário (fundo violeta claro)
  doc.setFillColor(243, 232, 255);
  doc.roundedRect(MARGEM.esq, y, CONT_W, altura, 1.5, 1.5, 'F');

  // Resumo por tipo (direita) — desenhamos primeiro pra calcular o limite
  // horizontal que sobra para o nome/login.
  const resumo = userNode.tipos
    .map(t => `${TIPO_INFO[t.tipo]?.rotulo || t.tipo}: ${t.count}`)
    .join('  ·  ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const resumoWidth = doc.getTextWidth(resumo);
  doc.setTextColor(...CORES.cinzaEscuro);
  doc.text(resumo, PAG_W - MARGEM.dir - 3, y + (altura / 2) + 1.2, { align: 'right' });

  // Nome em destaque
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...CORES.cciViolet);
  const xNome = MARGEM.esq + 3;
  const yNome = login ? y + 5 : y + 6;
  // Limite horizontal pra não colidir com o resumo (3mm de gap)
  const limiteX = PAG_W - MARGEM.dir - 3 - resumoWidth - 4;
  doc.text(truncarParaLargura(doc, nome, limiteX - xNome), xNome, yNome);

  // Login em segunda linha, abaixo do nome (cinza, mono, menor)
  if (login) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text(login, xNome, y + altura - 2.2);
  }

  return y + altura + 3;
}

// Trunca o texto pra caber no limite horizontal, adicionando "…" se necessário.
function truncarParaLargura(doc, texto, larguraMax) {
  if (larguraMax <= 0) return '';
  const original = String(texto || '');
  if (doc.getTextWidth(original) <= larguraMax) return original;
  let s = original;
  while (s.length > 1 && doc.getTextWidth(s + '…') > larguraMax) {
    s = s.slice(0, -1);
  }
  return s + '…';
}

function bloco_Tipo(doc, y, tipoNode, ctx) {
  y = checarEspaco(doc, y, 8, ctx);
  const info = TIPO_INFO[tipoNode.tipo] || TIPO_INFO.INDETERMINADO;

  doc.setFillColor(...info.bg);
  doc.roundedRect(MARGEM.esq + 4, y, CONT_W - 4, 6.5, 1, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...info.cor);
  doc.text(info.rotulo, MARGEM.esq + 7, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...CORES.cinzaMedio);
  const c = `${tipoNode.count} ${tipoNode.count === 1 ? 'evento' : 'eventos'}`;
  doc.text(c, PAG_W - MARGEM.dir - 7, y + 4.5, { align: 'right' });

  return y + 9;
}

function bloco_Evento(doc, y, ev, ctx) {
  const node = ev._node;
  const sourceRow = ev.depois || ev.antes || {};
  const dataLanc = sourceRow.data;
  const documento = sourceRow.documento;
  const valor = Number(sourceRow.valor) || 0;
  const empresaObj = ctx.mapaEmpresas?.get(Number(node?.empresa));
  const empresaNome = empresaObj ? (ctx.labelEmpresa?.(empresaObj) || '') : '';

  // Header do evento: timestamp · data · doc · valor · empresa
  const headerParts = [];
  headerParts.push(timestampPtBr(ev.timestamp));
  if (dataLanc) headerParts.push(dataPtBr(dataLanc));
  if (documento) headerParts.push(`Doc ${documento}`);
  if (valor !== 0) headerParts.push(moedaBr(valor));
  if (empresaNome) headerParts.push(empresaNome);

  y = checarEspaco(doc, y, 30, ctx); // mínimo para header + tabela curta

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...CORES.cinzaEscuro);
  doc.text(headerParts.join('  ·  '), MARGEM.esq + 7, y + 3);
  y += 4.5;

  // Tabela do detalhamento
  const linhas = montarLinhasDiff(ev);
  if (linhas.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text('Sem campos relevantes para exibir.', MARGEM.esq + 7, y + 3);
    return y + 8;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEM.esq + 7, right: MARGEM.dir },
    tableWidth: CONT_W - 7,
    head: [['Campo', 'Antes', 'Depois']],
    body: linhas.map(l => [l.campo, l.antes, l.depois]),
    styles: {
      font: 'helvetica', fontSize: 8, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
      lineWidth: 0.1, lineColor: CORES.cinzaClaro, textColor: CORES.cinzaEscuro, valign: 'middle',
    },
    headStyles: {
      fillColor: CORES.cinzaBg, textColor: CORES.cinzaMedio, fontStyle: 'bold', fontSize: 7,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'normal' },
      1: { cellWidth: (CONT_W - 7 - 38) / 2 },
      2: { cellWidth: (CONT_W - 7 - 38) / 2 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const linha = linhas[data.row.index];
      if (linha?.mudou) {
        data.cell.styles.fillColor = CORES.destaqueBg;
        data.cell.styles.textColor = CORES.destaqueTx;
        if (data.column.index === 0 || data.column.index === 2) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: () => {
      // Quando autoTable causa quebra de página, redesenha o header
      desenharCabecalho(doc, ctx);
    },
  });

  return doc.lastAutoTable.finalY + 3;
}

function montarLinhasDiff(ev) {
  const campos = ev._camposRelevantes || [];
  const antes = ev.antes || null;
  const depois = ev.depois || null;
  const out = [];

  for (const c of campos) {
    const a = antes?.[c.key];
    const d = depois?.[c.key];
    const vazioAmbos = (a == null || String(a).trim() === '') && (d == null || String(d).trim() === '');
    if (vazioAmbos) continue;
    if (ev.tipo === 'INCLUSAO') {
      out.push({ campo: c.label, antes: '—', depois: formatarCampo(d, c, depois), mudou: false });
    } else if (ev.tipo === 'EXCLUSAO') {
      out.push({ campo: c.label, antes: formatarCampo(a, c, antes), depois: '—', mudou: false });
    } else {
      const mudou = !equivalente(a, d, c.type);
      out.push({
        campo: c.label,
        antes: formatarCampo(a, c, antes),
        depois: formatarCampo(d, c, depois),
        mudou,
      });
    }
  }
  return out;
}

// ─── Entrypoint ────────────────────────────────────────────────

/**
 * Gera o PDF do histórico hierárquico (Usuário → Tipo → Eventos).
 *
 * @param {object} params
 * @param {Array}  params.arvore          - array vindo de arvoreFiltrada
 * @param {Array}  params.camposRelevantes - CAMPOS_RELEVANTES da página
 * @param {Map}    params.mapaEmpresas
 * @param {Function} params.labelEmpresa
 * @param {object} params.contexto        - { periodo, rede, empresa }
 * @returns {jsPDF} doc — chame doc.save('nome.pdf') no chamador
 */
export function gerarPdfHistoricoUsuarios({ arvore, camposRelevantes, mapaEmpresas, labelEmpresa, contexto }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  // Anexa CAMPOS_RELEVANTES em cada evento pra não precisar passar adiante
  for (const u of arvore) {
    for (const t of u.tipos) {
      for (const ev of t.eventos) {
        ev._camposRelevantes = camposRelevantes;
      }
    }
  }

  const ctx = {
    periodo: contexto?.periodo || '',
    rede:    contexto?.rede || '',
    empresa: contexto?.empresa || '',
    geradoEm: contexto?.geradoEm || agoraPtBr(),
    mapaEmpresas, labelEmpresa,
  };

  desenharCabecalho(doc, ctx);
  let y = MARGEM.topo;

  if (arvore.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text('Nenhum evento corresponde aos filtros.', MARGEM.esq, y + 5);
  }

  for (const userNode of arvore) {
    y = bloco_Usuario(doc, y, userNode, ctx);
    for (const tipoNode of userNode.tipos) {
      y = bloco_Tipo(doc, y, tipoNode, ctx);
      for (const ev of tipoNode.eventos) {
        y = bloco_Evento(doc, y, ev, ctx);
      }
      y += 1;
    }
    y += 3;
  }

  // Rodapé com paginação — passar segundo o total final
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    desenharRodape(doc, i, total);
  }

  return doc;
}

function agoraPtBr() {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
