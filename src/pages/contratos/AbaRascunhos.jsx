// Aba "Rascunhos" da página Contratos.
// Lista os contratos em rascunho / enviados para assinatura (gerados a partir
// de propostas) e permite visualizar/imprimir o contrato antes da assinatura.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  FileText, Eye, Send, Trash2, Loader2, Printer, X, AlertTriangle, CheckCircle2, ShieldAlert,
} from 'lucide-react';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import { formatCurrency, formatDate } from '../../utils/format';
import * as contratosService from '../../services/contratosService';
import { montarDocumentoDeContrato } from '../../lib/contratos/gerarContrato';

// Documento em folha branca (sem papel timbrado), fonte Arial.
const FONTE_CONTRATO = 'Arial, Helvetica, sans-serif';
const MARGENS_A4 = { topo: 25, laterais: 20, base: 20 };

const STATUS_STYLE = {
  rascunho:  'bg-gray-100   text-gray-600    border-gray-200',
  enviado:   'bg-blue-50    text-blue-700    border-blue-200',
  assinado:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  ativo:     'bg-violet-50  text-violet-700  border-violet-200',
  cancelado: 'bg-rose-50    text-rose-700    border-rose-200',
};

export default function AbaRascunhos({ showToast }) {
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verId, setVerId] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const data = await contratosService.listarContratos({ status: ['rascunho', 'enviado'] });
      setContratos(data);
    } catch (err) {
      showToast('error', 'Erro ao carregar contratos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (c) => {
    try {
      // Bloqueio de emissão: só envia para assinatura se a validação passar.
      const contrato = await contratosService.buscarContrato(c.id);
      const doc = await montarDocumentoDeContrato(contrato);
      if (!doc.validacao.ok) {
        showToast('error', 'Contrato incompleto — corrija antes de enviar: ' + doc.validacao.erros.slice(0, 2).join(' · '));
        setVerId(c.id); // abre a pré-visualização com o painel de pendências
        return;
      }
      await contratosService.alterarStatus(c.id, 'enviado');
      showToast('success', 'Contrato marcado como enviado para assinatura.');
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const remover = async (c) => {
    if (!confirm(`Excluir o rascunho de contrato "${c.titulo}"?`)) return;
    try {
      await contratosService.excluirContrato(c.id);
      showToast('success', 'Rascunho removido');
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Rascunhos de contrato</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Contratos gerados a partir de propostas. Revise e imprima antes de enviar para assinatura.
        </p>
      </div>

      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : contratos.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200/60 p-10 text-center shadow-sm">
          <div className="h-12 w-12 mx-auto rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-gray-800 mb-1">Nenhum rascunho de contrato</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Abra uma proposta e clique em <span className="font-medium">"Converter em contrato"</span> para gerar um rascunho aqui.
          </p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-200/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th className="text-left  px-6 py-3 font-medium">Contrato</th>
                  <th className="text-left  px-6 py-3 font-medium">Cliente</th>
                  <th className="text-right px-6 py-3 font-medium">Valor</th>
                  <th className="text-left  px-6 py-3 font-medium">Data</th>
                  <th className="text-center px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contratos.map((c, i) => (
                  <motion.tr key={c.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                    onClick={() => setVerId(c.id)}>
                    <td className="px-6 py-3">
                      <p className="text-sm font-medium text-gray-900">{c.titulo}</p>
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-sm font-medium text-gray-900">{c.cliente_nome}</p>
                      {c.cliente_cnpj && <p className="text-xs text-gray-400 font-mono">{c.cliente_cnpj}</p>}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900 tabular-nums">
                      {formatCurrency(Number(c.valor_total || 0))}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-600">
                      {formatDate((c.created_at || '').slice(0, 10))}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[c.status]}`}>
                        {contratosService.metaStatusContrato(c.status).label}
                      </span>
                    </td>
                    <td className="px-6 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setVerId(c.id)}
                          className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Ver / imprimir">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {c.status === 'rascunho' && (
                          <button onClick={() => enviar(c)}
                            className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Enviar para assinatura">
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => remover(c)}
                          className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {verId && (
        <RelatorioContrato contratoId={verId} showToast={showToast} onFechar={() => setVerId(null)} />
      )}
    </div>
  );
}

// ─── Renderiza um bloco de cláusula ────────────────────────────
function BlocoClausula({ bloco }) {
  if (bloco.tipo === 'subtitulo') {
    return <p className="mt-3 text-[12px] font-semibold text-gray-900">{bloco.texto}</p>;
  }
  if (bloco.tipo === 'paragrafo') {
    return <p className="mt-1.5 text-[11px] leading-relaxed text-gray-700 text-justify">{bloco.texto}</p>;
  }
  if (bloco.tipo === 'lista') {
    const Tag = bloco.ordenada ? 'ol' : 'ul';
    return (
      <Tag className={`mt-1.5 space-y-0.5 pl-5 text-[11px] leading-relaxed text-gray-700 ${bloco.ordenada ? 'list-decimal' : 'list-disc'}`}>
        {bloco.itens.map((it, i) => <li key={i} className="text-justify">{it}</li>)}
      </Tag>
    );
  }
  if (bloco.tipo === 'tabela') {
    return (
      <table className="w-full mt-2 text-[10.5px] border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left text-[9px] uppercase tracking-wide text-gray-500">
            {bloco.colunas.map((col, i) => <th key={i} className="py-1 pr-2">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {bloco.linhas.map((linha, i) => (
            <tr key={i} className="border-b border-gray-100 align-top">
              {linha.map((cel, j) => (
                <td key={j} className={`py-1 pr-2 ${j === 0 ? 'font-medium text-gray-900 whitespace-nowrap' : 'text-gray-600'}`}>{cel}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}

// ─── Tabela de serviços (injetada no marcador {{tabela_servicos}}) ──
function TabelaServicos({ itens, valorTotal }) {
  return (
    <>
      <table className="w-full mt-2 text-[11px] border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left text-[9.5px] uppercase tracking-wide text-gray-500">
            <th className="py-1 pr-2">Serviço</th><th className="py-1 px-2">Forma de cobrança</th><th className="py-1 pl-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {(itens || []).map((it, i) => {
            const fixo = it.tipo_valor === 'fixo' || !it.unidade;
            return (
              <tr key={i} className="border-b border-gray-100 align-top">
                <td className="py-0.5 pr-2 font-medium text-gray-900">{it.nome}</td>
                <td className="py-0.5 px-2 text-gray-600">{fixo ? 'Valor fixo mensal' : `Por ${it.unidade}`}</td>
                <td className="py-0.5 pl-2 text-right text-gray-900 tabular-nums whitespace-nowrap">
                  {fixo ? `${formatCurrency(Number(it.valor_unitario ?? it.valor_total ?? 0))} / mês` : `${formatCurrency(Number(it.valor_unitario ?? 0))} / ${it.unidade}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-700 text-justify">
        Os serviços de <strong>valor fixo</strong> são cobrados mensalmente pelo valor indicado. Os serviços cobrados <strong>por unidade</strong> são faturados conforme o volume efetivamente realizado no período, multiplicando-se o valor unitário pela quantidade — podendo variar mês a mês. A título ilustrativo, o valor total apurado foi de {formatCurrency(Number(valorTotal || 0))}.
      </p>
    </>
  );
}

// ─── Visualização A4 imprimível do contrato ────────────────────
function RelatorioContrato({ contratoId, showToast, onFechar }) {
  const [contrato, setContrato] = useState(null);
  const [doc, setDoc] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const c = await contratosService.buscarContrato(contratoId);
        const d = await montarDocumentoDeContrato(c);
        if (!cancelado) { setContrato(c); setDoc(d); }
      } catch (e) {
        showToast?.('error', 'Erro ao abrir contrato: ' + e.message);
        onFechar();
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId]);

  const v = doc?.valores || {};
  const itens = contrato?.conteudo?.itens || [];
  const dataExtenso = new Date(contrato?.conteudo?.geradoEm || Date.now())
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  // Qualificação de uma parte no preâmbulo (omite trechos sem dado; a validação aponta o que falta).
  const qualificacao = (papel, pfx, nomeFallback) => {
    const nome = v[`${pfx}.razaoSocial`] || nomeFallback;
    const cnpj = v[`${pfx}.cnpj`];
    const end = v[`${pfx}.endereco`];
    const rep = v[`${pfx}.representante`];
    const cargo = v[`${pfx}.representanteCargo`];
    const cpf = v[`${pfx}.representanteCpf`];
    return (
      <p><strong>{papel}:</strong> {nome || '—'}
        {cnpj ? `, inscrita no CNPJ sob o nº ${cnpj}` : ''}
        {end ? `, com sede em ${end}` : ''}
        {rep ? `, neste ato representada por ${rep}${cargo ? `, ${cargo}` : ''}, portador(a) do CPF nº ${cpf || '—'}` : ''}.</p>
    );
  };

  // Renderiza um bloco de cláusula — substitui o marcador da tabela de serviços.
  const renderBloco = (b, key) =>
    b?.tipo === 'marcador' && b.nome === 'tabela_servicos'
      ? <TabelaServicos key={key} itens={itens} valorTotal={contrato.valor_total} />
      : <BlocoClausula key={key} bloco={b} />;

  // Blocos do contrato = unidades de paginação (medidas e distribuídas em A4).
  const blocos = [];
  if (contrato && doc) {
    blocos.push(
      <h1 className="text-center text-base font-bold text-gray-900 uppercase">{doc.titulo}</h1>,
    );
    blocos.push(
      <div className="mt-5 text-[11px] leading-relaxed text-gray-700 text-justify space-y-2">
        {qualificacao('CONTRATADA', 'contratada')}
        {qualificacao('CONTRATANTE', 'contratante', contrato.cliente_nome)}
        <p>As partes acima qualificadas têm entre si, justo e contratado, o presente Contrato de Prestação de Serviços de Terceirização de Processos de Negócios (BPO), que se regerá pelas cláusulas e condições seguintes.</p>
      </div>,
    );
    // Cláusulas selecionadas pelo motor (já com variáveis preenchidas).
    doc.clausulas.forEach((cl, idx) => {
      const bcs = cl.blocos || [];
      // Unidade 1: título da cláusula + 1º bloco (o título nunca fica órfão).
      blocos.push(
        <div className="mt-5 bloco-keep">
          <p className="text-[12px] font-bold text-gray-900">CLÁUSULA {idx + 1}ª — {cl.titulo.toUpperCase()}</p>
          {bcs[0] && renderBloco(bcs[0], 'p0')}
        </div>,
      );
      // Demais blocos: um subtítulo nunca fica sozinho no fim da página —
      // é agrupado com o bloco seguinte para não quebrar entre eles.
      for (let i = 1; i < bcs.length; i++) {
        const b = bcs[i];
        if (b?.tipo === 'subtitulo' && bcs[i + 1]) {
          blocos.push(<div className="bloco-keep">{renderBloco(b, `s${i}`)}{renderBloco(bcs[i + 1], `sn${i}`)}</div>);
          i++; // já consumiu o bloco seguinte
        } else {
          blocos.push(renderBloco(b, `b${i}`));
        }
      }
    });
    // Fecho + assinaturas
    blocos.push(
      <div className="mt-12 bloco-keep">
        <p className="text-[11px] text-gray-700">
          {v['foro.comarca'] ? `${v['foro.comarca']}${v['foro.uf'] ? ' - ' + v['foro.uf'] : ''}, ` : ''}{dataExtenso}.
        </p>
        <div className="mt-16 grid grid-cols-2 gap-10 text-center text-[10.5px] text-gray-700">
          <div className="border-t border-gray-500 pt-1">
            <p className="font-semibold text-gray-900">{v['contratada.razaoSocial'] || '—'}</p>
            <p>CONTRATADA{v['contratada.cnpj'] ? ` · CNPJ ${v['contratada.cnpj']}` : ''}</p>
            {v['contratada.representante'] && <p className="text-gray-500">{v['contratada.representante']}{v['contratada.representanteCargo'] ? ` · ${v['contratada.representanteCargo']}` : ''}</p>}
          </div>
          <div className="border-t border-gray-500 pt-1">
            <p className="font-semibold text-gray-900">{v['contratante.razaoSocial'] || contrato.cliente_nome}</p>
            <p>CONTRATANTE{v['contratante.cnpj'] ? ` · CNPJ ${v['contratante.cnpj']}` : ''}</p>
            {v['contratante.representante'] && <p className="text-gray-500">{v['contratante.representante']}{v['contratante.representanteCargo'] ? ` · ${v['contratante.representanteCargo']}` : ''}</p>}
          </div>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-10 text-center text-[10px] text-gray-500">
          <div className="border-t border-gray-400 pt-1">Testemunha 1 · CPF</div>
          <div className="border-t border-gray-400 pt-1">Testemunha 2 · CPF</div>
        </div>
      </div>,
    );
  }

  // Paginação é feita pelo CSS na impressão (fluxo contínuo + @page A4).
  const folhaStyle = {
    maxWidth: '210mm', boxSizing: 'border-box',
    padding: `${MARGENS_A4.topo}mm ${MARGENS_A4.laterais}mm ${MARGENS_A4.base}mm`,
    fontFamily: FONTE_CONTRATO,
  };

  return createPortal(
    <div className="relatorio-overlay fixed inset-0 z-[60] bg-gray-700/70 overflow-auto">
      <style>{`
        /* Paginação por CSS: o conteúdo flui e o navegador quebra em A4.
           Blocos .bloco-keep não partem no meio (títulos + 1º parágrafo, subtítulos, assinaturas). */
        #contrato-folha .bloco-keep { break-inside: avoid; }
        @media print {
          #root { display: none !important; }
          .relatorio-overlay { position: static !important; overflow: visible !important; background: #fff !important; }
          .relatorio-overlay .no-print { display: none !important; }
          #contrato-folha {
            box-shadow: none !important; margin: 0 !important; padding: 0 !important;
            max-width: none !important; width: auto !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          @page { size: A4 portrait; margin: ${MARGENS_A4.topo}mm ${MARGENS_A4.laterais}mm ${MARGENS_A4.base}mm; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-2.5">
        <p className="text-sm font-medium text-gray-700">Pré-visualização do contrato (rascunho)</p>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} disabled={carregando || !contrato}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
          </button>
          <button onClick={onFechar}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <X className="h-4 w-4" /> Fechar
          </button>
        </div>
      </div>

      {/* Painel de validação (bloqueia emissão) */}
      {doc && (
        <div className="no-print mx-auto max-w-[220mm] px-3 pt-4 space-y-2">
          {doc.validacao.erros.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-rose-700">
                <ShieldAlert className="h-4 w-4" /> Não pode ser emitido — {doc.validacao.erros.length} pendência(s):
              </p>
              <ul className="mt-1 ml-6 list-disc text-xs text-rose-700 space-y-0.5">
                {doc.validacao.erros.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {doc.validacao.avisos.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                <AlertTriangle className="h-4 w-4" /> Revisar com jurídico antes de emitir:
              </p>
              <ul className="mt-1 ml-6 list-disc text-xs text-amber-700 space-y-0.5">
                {doc.validacao.avisos.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
          {doc.validacao.ok && (
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Contrato válido — pronto para emissão.
            </div>
          )}
        </div>
      )}

      {carregando || !contrato || !doc ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : (
        <div className="py-6 px-3">
          <div id="contrato-folha" className="bg-white shadow-xl mx-auto" style={folhaStyle}>
            {blocos.map((b, i) => <div key={i}>{b}</div>)}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
