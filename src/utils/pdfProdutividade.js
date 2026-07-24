// ============================================================
// Geração de PDF — Produtividade (Cliente Autosystem)
//
// Relatório profissional (A4 retrato, multipágina) do que está na
// tela, conforme a aba ativa (Rank ou Conveniência):
//   - Cabeçalho com marca CCI + destaque de REDE e EMPRESA + período
//   - Faixa de KPIs
//   - Rank: 3 rankings COMPLETOS (lado a lado, paginados juntos) +
//           tabela de funcionários com tendências (automotivos/aditivada)
//   - Conveniência: tabela de detalhamento por vendedor (com tendência)
//   - Rodapé com marca, período e paginação "Página X de Y"
//
// Cabeçalho/rodapé se repetem em todas as páginas.
// Espelha o estilo de src/utils/pdfHistoricoUsuarios.js.
// ============================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const CORES = {
  brand:        [13, 148, 136],    // teal-600 — cor de destaque do projeto
  brandEsc:     [15, 118, 110],    // teal-700
  brandBg:      [240, 253, 250],   // teal-50 (fundo do cartão rede/empresa)
  cinzaEscuro:  [33, 37, 41],
  cinzaMedio:   [108, 117, 125],
  cinzaClaro:   [222, 226, 230],
  cinzaBg:      [248, 249, 250],
  zebra:        [250, 250, 252],
  ouroBg:       [254, 249, 195],   // top 1
  ouroTx:       [133, 100, 4],
  tendTx:       [13, 148, 136],    // teal p/ colunas de tendência (igual ao app)
};

const KPI_COR = {
  blue:    { bg: [239, 246, 255], tx: [30, 64, 175] },
  violet:  { bg: [245, 243, 255], tx: [91, 33, 182] },
  amber:   { bg: [255, 251, 235], tx: [146, 64, 14] },
  emerald: { bg: [236, 253, 245], tx: [6, 95, 70] },
};

const MARGEM = { topo: 40, baixo: 18, esq: 12, dir: 12 };
const PAG_W = 210;
const PAG_H = 297;
const CONT_W = PAG_W - MARGEM.esq - MARGEM.dir;
const FIM_UTIL = PAG_H - MARGEM.baixo;

function pad(n) { return String(n).padStart(2, '0'); }
function moedaBr(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function numBr(v, casas = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function agoraPtBr() {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function truncar(doc, texto, larguraMax) {
  const original = String(texto || '');
  if (larguraMax <= 0) return '';
  if (doc.getTextWidth(original) <= larguraMax) return original;
  let s = original;
  while (s.length > 1 && doc.getTextWidth(s + '…') > larguraMax) s = s.slice(0, -1);
  return s + '…';
}

// ─── Cabeçalho profissional (repetido em cada página) ──────────
function desenharCabecalho(doc, ctx) {
  // Faixa de acento superior (brand)
  doc.setFillColor(...CORES.brand);
  doc.rect(0, 0, PAG_W, 2.4, 'F');

  // Marca CCI: logo (logo-cci-landing) se disponível; senão, texto.
  if (ctx.logo?.dataUrl && ctx.logo.w && ctx.logo.h) {
    const alturaLogo = 10;
    const largLogo = alturaLogo * (ctx.logo.w / ctx.logo.h);
    doc.addImage(ctx.logo.dataUrl, 'PNG', MARGEM.esq, 5, largLogo, alturaLogo);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...CORES.brandEsc);
    doc.text('CCI', MARGEM.esq, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text('CONSULTORIA INTELIGENTE', MARGEM.esq + 11, 12);
  }

  // Título do relatório à direita (em roxo, sobre o fundo branco)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...CORES.brandEsc);
  doc.text(ctx.titulo, PAG_W - MARGEM.dir, 9.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...CORES.cinzaMedio);
  doc.text('Relatório de Produtividade', PAG_W - MARGEM.dir, 13.5, { align: 'right' });

  // Régua roxa separando marca do conteúdo
  doc.setDrawColor(...CORES.brand);
  doc.setLineWidth(0.4);
  doc.line(MARGEM.esq, 16.5, PAG_W - MARGEM.dir, 16.5);

  // Cartão de destaque: REDE • EMPRESA
  const cardY = 19;
  const cardH = 13;
  doc.setFillColor(...CORES.brandBg);
  doc.setDrawColor(...CORES.cinzaClaro);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGEM.esq, cardY, CONT_W, cardH, 1.6, 1.6, 'FD');
  // Divisória vertical entre rede e empresa
  const meio = MARGEM.esq + CONT_W * 0.5;
  doc.setDrawColor(...CORES.cinzaClaro);
  doc.line(meio, cardY + 2, meio, cardY + cardH - 2);

  const celula = (x, larg, rotulo, valor) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text(rotulo, x + 3, cardY + 4.6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...CORES.brandEsc);
    doc.text(truncar(doc, valor || '—', larg - 6), x + 3, cardY + 10);
  };
  const larg = CONT_W * 0.5;
  celula(MARGEM.esq, larg, 'REDE', ctx.rede);
  celula(meio, larg, 'EMPRESA', ctx.empresa);

  // Linha de meta (período + gerado)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...CORES.cinzaMedio);
  doc.text(`Período: ${ctx.periodo || '—'}`, MARGEM.esq, 36.5);
  doc.text(`Gerado em ${ctx.geradoEm}`, PAG_W - MARGEM.dir, 36.5, { align: 'right' });
  doc.setDrawColor(...CORES.brand);
  doc.setLineWidth(0.4);
  doc.line(MARGEM.esq, 38, PAG_W - MARGEM.dir, 38);
}

// ─── Rodapé (repetido em cada página) ──────────────────────────
function desenharRodape(doc, ctx, pag, total) {
  const yl = FIM_UTIL + 6;
  doc.setDrawColor(...CORES.brand);
  doc.setLineWidth(0.4);
  doc.line(MARGEM.esq, yl, PAG_W - MARGEM.dir, yl);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...CORES.brandEsc);
  doc.text('CCI', MARGEM.esq, yl + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CORES.cinzaMedio);
  doc.text('Consultoria Inteligente', MARGEM.esq + 6, yl + 4.5);

  // Centro: rede • período
  const centro = [ctx.rede, ctx.periodo].filter(Boolean).join('  •  ');
  doc.setFontSize(7);
  doc.text(truncar(doc, centro, CONT_W - 80), PAG_W / 2, yl + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...CORES.cinzaEscuro);
  doc.text(`Página ${pag} de ${total}`, PAG_W - MARGEM.dir, yl + 4.5, { align: 'right' });
}

// ─── Faixa de KPIs ─────────────────────────────────────────────
function desenharKpis(doc, y, cards) {
  const n = cards.length;
  const gap = 3;
  const cardW = (CONT_W - gap * (n - 1)) / n;
  const cardH = 18;
  cards.forEach((c, i) => {
    const x = MARGEM.esq + i * (cardW + gap);
    const pal = KPI_COR[c.cor] || KPI_COR.blue;
    doc.setFillColor(...pal.bg);
    doc.roundedRect(x, y, cardW, cardH, 1.6, 1.6, 'F');
    // Acento lateral
    doc.setFillColor(pal.tx[0], pal.tx[1], pal.tx[2]);
    doc.roundedRect(x, y, 1.4, cardH, 0.7, 0.7, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(...CORES.cinzaMedio);
    doc.text(truncar(doc, String(c.label).toUpperCase(), cardW - 6), x + 3.4, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...pal.tx);
    doc.text(truncar(doc, String(c.valor), cardW - 6), x + 3.4, y + 13.5);
  });
  return y + cardH + 6;
}

// Título de seção com filete
function tituloSecao(doc, y, texto) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...CORES.brandEsc);
  doc.text(texto, MARGEM.esq, y);
  const w = doc.getTextWidth(texto);
  doc.setDrawColor(...CORES.brand);
  doc.setLineWidth(0.5);
  doc.line(MARGEM.esq, y + 1.6, MARGEM.esq + w, y + 1.6);
  return y + 4;
}

// ─── Uma coluna de ranking (fatia de linhas) ───────────────────
function desenharRankingColuna(doc, x, y, larg, titulo, itens, fmt, startIndex) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...CORES.brandEsc);
  doc.text(truncar(doc, titulo, larg), x, y);

  const body = (itens || []).map((it, i) => [
    `${startIndex + i + 1}`,
    it.nome || 'sem nome',
    fmt(it.valor),
  ]);
  if (body.length === 0) body.push(['', 'Sem dados', '']);

  autoTable(doc, {
    startY: y + 1.6,
    margin: { left: x },
    tableWidth: larg,
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica', fontSize: 7, cellPadding: { top: 1.1, right: 1.6, bottom: 1.1, left: 1.6 },
      lineWidth: 0.1, lineColor: CORES.cinzaClaro, textColor: CORES.cinzaEscuro, valign: 'middle', overflow: 'ellipsize',
    },
    columnStyles: {
      0: { cellWidth: 6.5, halign: 'center', textColor: CORES.cinzaMedio, fontStyle: 'bold' },
      1: { cellWidth: larg - 6.5 - 22 },
      2: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Top 1 (global) destacado em dourado — só na 1ª fatia, 1ª linha.
      if (startIndex === 0 && data.row.index === 0 && body[0][1] !== 'Sem dados') {
        data.cell.styles.fillColor = CORES.ouroBg;
        data.cell.styles.textColor = CORES.ouroTx;
      }
    },
  });
  return doc.lastAutoTable.finalY;
}

// ─── 3 rankings COMPLETOS lado a lado, paginados juntos ────────
function desenharRankings(doc, y, ctx, cols) {
  const gap = 4;
  const colW = (CONT_W - gap * 2) / 3;
  const rowH = 4.6;       // altura aproximada de linha (grid, fonte 7)
  const cabBloco = 8;     // título da coluna + header espaçamento
  const maxLen = Math.max(1, ...cols.map(c => (c.itens || []).length));

  let offset = 0;
  let primeira = true;
  while (offset < maxLen) {
    if (!primeira) {
      doc.addPage();
      desenharCabecalho(doc, ctx);
      y = MARGEM.topo;
    }
    if (primeira) y = tituloSecao(doc, y, 'Ranking completo dos funcionários') + 1;
    else {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...CORES.cinzaMedio);
      doc.text('Ranking completo dos funcionários (continuação)', MARGEM.esq, y); y += 4;
    }

    const disp = FIM_UTIL - (y + cabBloco);
    const take = Math.max(1, Math.floor(disp / rowH));
    let maxFinal = y;
    cols.forEach((c, ci) => {
      const x = MARGEM.esq + ci * (colW + gap);
      const slice = (c.itens || []).slice(offset, offset + take);
      const f = desenharRankingColuna(doc, x, y, colW, c.titulo, slice, c.fmt, offset);
      maxFinal = Math.max(maxFinal, f);
    });
    offset += take;
    y = maxFinal + 7;
    primeira = false;
  }
  return y;
}

// ─── Tabela de funcionários (aba Rank) — com tendências ────────
function desenharFuncionarios(doc, y, ctx, funcionarios, projetar) {
  // Se não couber nada útil na página atual, quebra.
  if (y > FIM_UTIL - 24) { doc.addPage(); desenharCabecalho(doc, ctx); y = MARGEM.topo; }
  y = tituloSecao(doc, y, 'Funcionários · Combustíveis + Automotivos');

  const body = (funcionarios || []).map((v, i) => {
    const s = v.pista;
    const ticket = s.vendasAutomotivos > 0 ? s.fatAutomotivos / s.vendasAutomotivos : 0;
    return [
      `${i + 1}`,
      v.vendedor_nome || 'sem nome',
      moedaBr(s.fatAutomotivos),
      moedaBr(projetar(s.fatAutomotivos)),
      `${numBr(s.litrosAditivada, 0)} L`,
      `${numBr(projetar(s.litrosAditivada), 0)} L`,
      s.mix != null ? `${s.mix.toFixed(1)}%` : '—',
      numBr(s.abastecimentos),
      numBr(projetar(s.abastecimentos)),
      moedaBr(ticket),
    ];
  });
  if (body.length === 0) body.push(['', 'Nenhum funcionário no período', '', '', '', '', '', '', '', '']);

  // Totais das colunas (mesmos do rodapé da tabela na tela).
  let tAuto = 0, tAditiv = 0, tComum = 0, tAbast = 0, tVendas = 0;
  (funcionarios || []).forEach(v => {
    const s = v.pista;
    tAuto += s.fatAutomotivos || 0; tAditiv += s.litrosAditivada || 0; tComum += s.litrosComum || 0;
    tAbast += s.abastecimentos || 0; tVendas += s.vendasAutomotivos || 0;
  });
  const tMix = (tAditiv + tComum) > 0 ? (tAditiv / (tAditiv + tComum)) * 100 : null;
  const tTicket = tVendas > 0 ? tAuto / tVendas : 0;
  const foot = (funcionarios || []).length > 0 ? [[
    '', `Totais · ${funcionarios.length} func.`,
    moedaBr(tAuto), moedaBr(projetar(tAuto)),
    `${numBr(tAditiv, 0)} L`, `${numBr(projetar(tAditiv), 0)} L`,
    tMix != null ? `${tMix.toFixed(1)}%` : '—',
    numBr(tAbast), numBr(projetar(tAbast)), moedaBr(tTicket),
  ]] : undefined;

  // Larguras compactadas em Litros aditiv., suas tendências e Ticket p/ caber
  // a nova coluna de tendência de abastecimentos.
  const wName = CONT_W - 6.5 - 22 - 19 - 18 - 17 - 12 - 13 - 17 - 18;
  autoTable(doc, {
    startY: y + 1,
    margin: { top: MARGEM.topo, left: MARGEM.esq, right: MARGEM.dir, bottom: MARGEM.baixo },
    tableWidth: CONT_W,
    head: [['#', 'Funcionário', 'Automot.', 'Tend.', 'Litros adit.', 'Tend.', 'Mix', 'Abast.', 'Tend.', 'Ticket']],
    body,
    foot,
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica', fontSize: 7, cellPadding: { top: 1.3, right: 1.6, bottom: 1.3, left: 1.6 },
      lineWidth: 0.1, lineColor: CORES.cinzaClaro, textColor: CORES.cinzaEscuro, valign: 'middle', overflow: 'ellipsize',
    },
    headStyles: { fillColor: CORES.brand, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.3 },
    footStyles: { fillColor: CORES.brandBg, textColor: CORES.brandEsc, fontStyle: 'bold', fontSize: 6.6, lineWidth: 0.1, lineColor: CORES.cinzaClaro },
    alternateRowStyles: { fillColor: CORES.zebra },
    columnStyles: {
      0: { cellWidth: 6.5, halign: 'center', textColor: CORES.cinzaMedio },
      1: { cellWidth: wName },
      2: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 19, halign: 'right', textColor: CORES.tendTx },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 17, halign: 'right', textColor: CORES.tendTx },
      6: { cellWidth: 12, halign: 'right' },
      7: { cellWidth: 13, halign: 'right' },
      8: { cellWidth: 17, halign: 'right', textColor: CORES.tendTx },
      9: { cellWidth: 18, halign: 'right' },
    },
    didDrawPage: () => desenharCabecalho(doc, ctx),
  });
  return doc.lastAutoTable.finalY;
}

// ─── Tabela de detalhamento (aba Conveniência) — com tendência ─
function desenharConveniencia(doc, y, ctx, vendedores, projetar) {
  y = tituloSecao(doc, y, 'Detalhamento por vendedor · Conveniência');

  const body = (vendedores || []).map((v, i) => {
    const s = v.conv;
    return [
      `${i + 1}`,
      v.vendedor_nome || 'sem nome',
      numBr(s.atendimentos || s.vendas),
      moedaBr(s.ticket),
      moedaBr(s.fat),
      moedaBr(projetar(s.fat)),
      moedaBr(s.lucro),
      `${(s.margem || 0).toFixed(1)}%`,
    ];
  });
  if (body.length === 0) body.push(['', 'Nenhum vendedor no período', '', '', '', '', '', '']);

  const wName = CONT_W - 6.5 - 16 - 22 - 26 - 22 - 24 - 16;
  autoTable(doc, {
    startY: y + 1,
    margin: { top: MARGEM.topo, left: MARGEM.esq, right: MARGEM.dir, bottom: MARGEM.baixo },
    tableWidth: CONT_W,
    head: [['#', 'Vendedor', 'Atend.', 'Ticket', 'Faturamento', 'Tend. fat.', 'Lucro', 'Margem']],
    body,
    styles: {
      font: 'helvetica', fontSize: 7, cellPadding: { top: 1.3, right: 1.8, bottom: 1.3, left: 1.8 },
      lineWidth: 0.1, lineColor: CORES.cinzaClaro, textColor: CORES.cinzaEscuro, valign: 'middle', overflow: 'ellipsize',
    },
    headStyles: { fillColor: CORES.brand, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
    alternateRowStyles: { fillColor: CORES.zebra },
    columnStyles: {
      0: { cellWidth: 6.5, halign: 'center', textColor: CORES.cinzaMedio },
      1: { cellWidth: wName },
      2: { cellWidth: 16, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 22, halign: 'right', textColor: CORES.tendTx },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 16, halign: 'right' },
    },
    didDrawPage: () => desenharCabecalho(doc, ctx),
  });
  return doc.lastAutoTable.finalY;
}

// ─── Entrypoint ────────────────────────────────────────────────
/**
 * Gera o PDF (multipágina) da Produtividade conforme a aba ativa.
 *
 * @param {object}  p
 * @param {'rank'|'conveniencia'} p.aba
 * @param {object}  p.contexto  - { rede, empresa, periodo, geradoEm }
 * @param {object}  p.kpis      - objeto kpis da página
 * @param {object}  p.rankings  - { automotivos, aditivada, atendimentos } (aba rank)
 * @param {Array}   p.funcionarios - funcsPistaAuto (aba rank)
 * @param {Array}   p.vendedoresConv - vendedoresFiltrados (aba conveniência)
 * @param {Function} p.projetar - (valor) => tendência de fechamento do mês
 * @param {object}  [p.logo]   - { dataUrl, w, h } da logo-cci-landing (opcional)
 * @returns {jsPDF}
 */
export function gerarPdfProdutividade({ aba, contexto, kpis, rankings, funcionarios, vendedoresConv, projetar, logo }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const proj = typeof projetar === 'function' ? projetar : (v) => v;
  const ctx = {
    titulo:  aba === 'conveniencia' ? 'Produtividade · Conveniência' : 'Produtividade · Rank',
    rede:    contexto?.rede || '',
    empresa: contexto?.empresa || '',
    periodo: contexto?.periodo || '',
    geradoEm: contexto?.geradoEm || agoraPtBr(),
    logo:    logo || null,
  };

  desenharCabecalho(doc, ctx);
  let y = MARGEM.topo;

  if (aba === 'conveniencia') {
    const atend = kpis?.atendimentos || 0;
    y = desenharKpis(doc, y, [
      { label: 'Faturamento conveniência', valor: moedaBr(kpis?.faturamento), cor: 'emerald' },
      { label: 'Atendimentos',             valor: numBr(atend),                cor: 'blue' },
      { label: 'Média qtd/venda',          valor: atend > 0 ? (kpis.qtdConveniencia / atend).toFixed(1) : '—', cor: 'violet' },
      { label: 'Ticket médio',             valor: moedaBr(atend > 0 ? kpis.faturamento / atend : 0), cor: 'amber' },
    ]);
    desenharConveniencia(doc, y, ctx, vendedoresConv, proj);
  } else {
    y = desenharKpis(doc, y, [
      { label: 'Fat. automotivos',    valor: moedaBr(kpis?.fatAutomotivos), cor: 'blue' },
      { label: 'Litros de aditivada', valor: `${numBr(kpis?.litrosAditivada, 0)} L`, cor: 'violet' },
      { label: 'Mix de aditivada',    valor: kpis?.mix != null ? `${kpis.mix.toFixed(1)}%` : '—', cor: 'violet' },
      { label: 'Abastecimentos',      valor: numBr(kpis?.abastecimentos), cor: 'blue' },
      { label: 'Ticket méd. auto.',   valor: moedaBr(kpis?.ticketAutomotivos), cor: 'emerald' },
    ]);
    y = desenharRankings(doc, y, ctx, [
      { titulo: 'Vendas de automotivos', itens: rankings?.automotivos, fmt: (v) => moedaBr(v) },
      { titulo: 'Venda de aditivada',    itens: rankings?.aditivada,   fmt: (v) => `${numBr(v, 0)} L` },
      { titulo: 'Atendimentos',          itens: rankings?.atendimentos, fmt: (v) => numBr(v) },
    ]);
    desenharFuncionarios(doc, y, ctx, funcionarios, proj);
  }

  // Rodapé + paginação em todas as páginas (2ª passada, total já conhecido).
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    desenharRodape(doc, ctx, i, total);
  }
  return doc;
}
