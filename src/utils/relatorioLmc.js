// Relatórios do LMC (Livro de Movimentação de Combustíveis): PDF, Excel e
// (No PDF, só hífen comum: a fonte padrão do jsPDF não tem o sinal "−".)
// texto para WhatsApp. Recebem as linhas JÁ normalizadas pelo PainelLmc
// (um combustível por dia, com perdaSobra/pct/situacao calculados) e o nome
// de cada combustível.
//
//   contexto = { tipo: 'oficial' | 'real', empresa, de, ate, linhas, nomeDe(linha) → nome do combustível }
// tipo 'real' = LMC gerencial (escritural real lançado manualmente): título
// diferente, aviso de que não é o do Webposto, só dias lançados e coluna de motivo.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export const TOLERANCIA_PCT = 0.6; // % do estoque disponível (ANP, Portaria DNC 26/1992)

const ehAlerta = (l) => l.situacao === 'falta_alta' || l.situacao === 'sobra_alta';
const n0 = (v) => (v == null ? '' : Math.round(v).toLocaleString('pt-BR'));
const ls = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString('pt-BR')} L`);
const pct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const dataBr = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const nomeArquivo = (s) => String(s || 'empresa').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 40);

// Diferença de cada tanque no dia: "T1326 −40 L · T1327 +12 L"
function tanquesTexto(l) {
  return (l.tanques || []).map(t => {
    const fe = num(t.fechamento), es = num(t.escritural);
    return fe != null && es != null ? `T${t.tanqueCodigo} ${ls(fe - es)}` : null;
  }).filter(Boolean).join(' · ');
}

export function resumoPorCombustivel({ linhas, nomeDe }) {
  const m = new Map();
  linhas.forEach(l => {
    const k = l.chaveProduto;
    const r = m.get(k) || { nome: nomeDe(l), entrada: 0, saida: 0, perdaSobra: 0, dias: 0, alertas: 0, ultimo: null };
    r.entrada += l.entrada; r.saida += l.saida; r.dias += 1;
    if (l.perdaSobra != null) r.perdaSobra += l.perdaSobra;
    if (ehAlerta(l)) r.alertas += 1;
    if (!r.ultimo || l.data > r.ultimo.data) r.ultimo = l;
    m.set(k, r);
  });
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

export function diasEmAlerta(linhas) {
  return linhas.filter(ehAlerta).sort((a, b) => b.data.localeCompare(a.data));
}

// ─── PDF ────────────────────────────────────────────────────────
// A4 paisagem: cabeçalho, resumo por combustível e os dias acima de 0,6%.
export function gerarPdfLmc({ tipo = 'oficial', empresa, de, ate, linhas, nomeDe }) {
  const real = tipo === 'real';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const verde = [16, 118, 110];
  const alertas = diasEmAlerta(linhas);

  doc.setFillColor(...verde); doc.rect(0, 0, W, 4, 'F');
  doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(real ? 'LMC gerencial — Sobras e faltas de combustíveis' : 'LMC — Sobras e faltas de combustíveis', 12, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(75, 85, 99);
  doc.text(`${empresa || ''}  ·  Período: ${dataBr(de)} a ${dataBr(ate)}`, 12, 21);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · Portal CCI`, W - 12, 21, { align: 'right' });

  if (real) {
    doc.setFontSize(8.5); doc.setTextColor(91, 33, 182);
    doc.text('Escritural real lançado manualmente; medição do Webposto. Só dias lançados são calculados. Não substitui o LMC do Webposto.', 12, 25.5);
  }
  // Destaque
  doc.setFontSize(10.5);
  doc.setTextColor(...(alertas.length ? [153, 27, 27] : [16, 118, 110]));
  doc.text(alertas.length
    ? `${alertas.length} dia(s) com perda ou sobra acima de ${TOLERANCIA_PCT.toLocaleString('pt-BR')}% do estoque disponível — limite em que a ANP pede justificativa.`
    : `Nenhum dia com perda ou sobra acima de ${TOLERANCIA_PCT.toLocaleString('pt-BR')}% do estoque disponível no período.`, 12, real ? 32 : 29);

  // Resumo por combustível
  const resumo = resumoPorCombustivel({ linhas, nomeDe });
  autoTable(doc, {
    startY: real ? 36 : 33,
    head: [['Combustível', 'Entradas (L)', 'Vendas (L)', 'Perda/sobra', '% das vendas', `Dias > ${TOLERANCIA_PCT.toLocaleString('pt-BR')}%`, 'Estoque no último dia']],
    body: resumo.map(r => [
      r.nome, n0(r.entrada), n0(r.saida), ls(r.perdaSobra), r.saida > 0 ? pct(r.perdaSobra / r.saida) : '—',
      String(r.alertas), `${n0(r.ultimo?.fechamento ?? r.ultimo?.escritural)} L (${dataBr(r.ultimo?.data)})`,
    ]),
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    headStyles: { fillColor: verde, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'center' }, 6: { halign: 'right' } },
    didParseCell: (d) => { if (d.section === 'head') d.cell.styles.halign = [1, 2, 3, 4, 6].includes(d.column.index) ? 'right' : d.column.index === 5 ? 'center' : 'left'; },
    margin: { left: 12, right: 12 },
  });

  // Dias acima da tolerância
  let y = doc.lastAutoTable.finalY + 8;
  doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`Dias acima de ${TOLERANCIA_PCT.toLocaleString('pt-BR')}% do estoque disponível`, 12, y);
  doc.setFont('helvetica', 'normal');
  if (alertas.length === 0) {
    doc.setFontSize(9.5); doc.setTextColor(75, 85, 99);
    doc.text('Nenhum.', 12, y + 6);
  } else {
    autoTable(doc, {
      startY: y + 3,
      head: [['Data', 'Combustível', 'Disponível', 'Saída', real ? 'Escritural real' : 'Escritural', 'Medido', 'Perda/sobra', '%', real ? 'Tanques · motivo' : 'Tanques (medido - escritural)']],
      body: alertas.map(l => [
        dataBr(l.data), nomeDe(l), n0(l.disponivel), n0(l.saida), n0(l.escritural), n0(l.fechamento),
        ls(l.perdaSobra), pct(l.pct),
        real ? [tanquesTexto(l), l.motivo ? `Motivo: ${l.motivo}` : ''].filter(Boolean).join('\n') || '—'
          : (tanquesTexto(l) || '—'),
      ]),
      styles: { fontSize: 8, cellPadding: 1.4 },
      headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' }, 7: { halign: 'right' }, 8: { cellWidth: 70 } },
      didParseCell: (d) => {
        if (d.section === 'head') d.cell.styles.halign = d.column.index >= 2 && d.column.index <= 7 ? 'right' : 'left';
        if (d.section === 'body' && (d.column.index === 6 || d.column.index === 7)) {
          const l = alertas[d.row.index];
          d.cell.styles.textColor = l.perdaSobra < 0 ? [185, 28, 28] : [29, 78, 216];
        }
      },
      margin: { left: 12, right: 12 },
    });
    y = doc.lastAutoTable.finalY;
  }

  // Rodapé: legenda + páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5); doc.setTextColor(107, 114, 128);
    doc.text(real ? 'LMC gerencial: perda/sobra = medido (Webposto) - escritural real lançado. Dias sem lançamento não entram. Negativo = falta; positivo = sobra.' : 'Perda/sobra = medido - escritural (disponível - saída). Negativo = falta; positivo = sobra. Fonte: LMC do Webposto.', 12, H - 7);
    doc.text(`Página ${i} de ${total}`, W - 12, H - 7, { align: 'right' });
  }
  return doc;
}

export function nomeArquivoLmc({ tipo, empresa, de, ate }, ext) {
  return `LMC${tipo === 'real' ? '_gerencial' : ''}_${nomeArquivo(empresa)}_${de}_a_${ate}.${ext}`;
}

// ─── Excel ──────────────────────────────────────────────────────
export function exportarExcelLmc({ tipo = 'oficial', empresa, de, ate, linhas, nomeDe }) {
  const real = tipo === 'real';
  const wb = XLSX.utils.book_new();
  const fmtCols = (ws, larguras) => { ws['!cols'] = larguras.map(wch => ({ wch })); return ws; };
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

  const linhaDia = (l) => ({
    'Data': dataBr(l.data), 'Combustível': nomeDe(l),
    'Abertura (L)': r2(l.abertura), 'Entrada (L)': r2(l.entrada), 'Disponível (L)': r2(l.disponivel),
    'Saída (L)': r2(l.saida), 'Escritural (L)': r2(l.escritural), 'Medido (L)': r2(l.fechamento),
    'Perda/sobra (L)': r2(l.perdaSobra), '% do disponível': l.pct == null ? null : Math.round(l.pct * 10000) / 100,
    'Acima de 0,6%': ehAlerta(l) ? 'Sim' : 'Não',
    ...(real ? { 'Lançado': l.lancado ? 'Sim' : 'Não', 'Motivo': l.motivo || '' } : {}),
  });

  const alertas = diasEmAlerta(linhas);
  XLSX.utils.book_append_sheet(wb, fmtCols(XLSX.utils.json_to_sheet(
    alertas.length ? alertas.map(l => ({ ...linhaDia(l), 'Tanques (medido − escritural)': tanquesTexto(l) }))
      : [{ 'Data': 'Nenhum dia acima de 0,6% no período' }],
  ), [11, 24, 13, 12, 14, 12, 14, 12, 15, 15, 13, 40]), 'Acima de 0,6%');

  XLSX.utils.book_append_sheet(wb, fmtCols(XLSX.utils.json_to_sheet(resumoPorCombustivel({ linhas, nomeDe }).map(r => ({
    'Combustível': r.nome, 'Entradas (L)': r2(r.entrada), 'Vendas (L)': r2(r.saida), 'Perda/sobra (L)': r2(r.perdaSobra),
    '% das vendas': r.saida > 0 ? Math.round((r.perdaSobra / r.saida) * 10000) / 100 : null,
    'Dias acima de 0,6%': r.alertas, 'Dias no período': r.dias,
    'Estoque no último dia (L)': r2(r.ultimo?.fechamento ?? r.ultimo?.escritural), 'Último dia': dataBr(r.ultimo?.data),
  }))), [24, 13, 12, 15, 13, 18, 15, 22, 12]), 'Resumo');

  const todas = [...linhas].sort((a, b) => a.data.localeCompare(b.data) || nomeDe(a).localeCompare(nomeDe(b)));
  XLSX.utils.book_append_sheet(wb, fmtCols(XLSX.utils.json_to_sheet(todas.map(linhaDia)),
    [11, 24, 13, 12, 14, 12, 14, 12, 15, 15, 13]), 'Livro diário');

  const tanques = todas.flatMap(l => (l.tanques || []).map(t => {
    const fe = num(t.fechamento), es = num(t.escritural);
    return {
      'Data': dataBr(l.data), 'Combustível': nomeDe(l), 'Tanque': t.tanqueCodigo,
      'Abertura (L)': r2(num(t.abertura)), 'Escritural (L)': r2(es), 'Medido (L)': r2(fe),
      'Diferença (L)': fe != null && es != null ? r2(fe - es) : null,
    };
  }));
  if (tanques.length) XLSX.utils.book_append_sheet(wb, fmtCols(XLSX.utils.json_to_sheet(tanques), [11, 24, 9, 13, 14, 12, 13]), 'Tanques');

  XLSX.writeFile(wb, nomeArquivoLmc({ tipo, empresa, de, ate }, 'xlsx'));
}

// ─── Texto para WhatsApp (*negrito* do WhatsApp) ────────────────
const MAX_DIAS_TEXTO = 25;
export function textoWhatsappLmc({ tipo = 'oficial', empresa, de, ate, linhas, nomeDe }) {
  const real = tipo === 'real';
  const alertas = diasEmAlerta(linhas);
  const resumo = resumoPorCombustivel({ linhas, nomeDe });
  const l = [];
  l.push(real ? `*LMC gerencial — ${empresa || ''}*` : `*LMC — ${empresa || ''}*`);
  if (real) l.push('_Escritural real lançado manualmente; só dias lançados. Não é o LMC do Webposto._');
  l.push(`Período: ${dataBr(de)} a ${dataBr(ate)}`);
  l.push('');
  l.push(alertas.length
    ? `⚠️ *${alertas.length} dia(s)* com perda ou sobra acima de 0,6% do estoque disponível (limite em que a ANP pede justificativa):`
    : '✅ Nenhum dia com perda ou sobra acima de 0,6% do estoque disponível.');
  alertas.slice(0, MAX_DIAS_TEXTO).forEach(a => {
    l.push(`• ${dataBr(a.data)} · ${nomeDe(a)}: *${ls(a.perdaSobra)}* (${pct(a.pct)})${a.perdaSobra < 0 ? ' falta' : ' sobra'}${real && a.motivo ? ` — motivo: ${a.motivo}` : ''}`);
  });
  if (alertas.length > MAX_DIAS_TEXTO) l.push(`…e mais ${alertas.length - MAX_DIAS_TEXTO} dia(s) — veja o relatório completo.`);
  l.push('');
  l.push('*Resumo do período*');
  resumo.forEach(r => {
    l.push(`• ${r.nome}: vendas ${n0(r.saida)} L · perda/sobra *${ls(r.perdaSobra)}*${r.saida > 0 ? ` (${pct(r.perdaSobra / r.saida)} das vendas)` : ''}`);
  });
  l.push('');
  l.push('_Perda/sobra = medido − escritural. Negativo = falta. Fonte: LMC do Webposto · Portal CCI._');
  return l.join('\n');
}
