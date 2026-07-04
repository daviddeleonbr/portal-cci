// Aba "Rascunhos" da página Contratos.
// Lista os contratos em rascunho / enviados para assinatura (gerados a partir
// de propostas) e permite visualizar/imprimir o contrato antes da assinatura.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  FileText, Eye, Send, Trash2, Loader2, Printer, X,
} from 'lucide-react';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import { formatCurrency, formatDate } from '../../utils/format';
import * as contratosService from '../../services/contratosService';
import { CLAUSULAS_SERVICO } from '../../data/clausulasContrato';

// Papel timbrado (mesmo da proposta). Coloque em public/papel-timbrado.png.
const PAPEL_TIMBRADO_URL = '/papel-timbrado.png';
const MARGENS_A4 = { topo: 40, laterais: 20, base: 45 };

// Dados da CONTRATADA (CCI) — ajuste conforme necessário.
const CONTRATADA = {
  nome: 'CCI · Consultoria Inteligente',
  cnpj: '57.268.175/0001-00',
  endereco: 'Rua Humaitá, Divino Espírito Santo · Vila Velha - ES · 29.107-250',
  local: 'Vila Velha - ES',
};

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

// ─── Visualização A4 imprimível do contrato ────────────────────
function RelatorioContrato({ contratoId, showToast, onFechar }) {
  const [contrato, setContrato] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [paginas, setPaginas] = useState(null);
  const medRefs = useRef([]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const c = await contratosService.buscarContrato(contratoId);
        if (!cancelado) setContrato(c);
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

  const dataExtenso = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  // Blocos do contrato = unidades de paginação (medidas e distribuídas em A4).
  const blocos = [];
  if (contrato) {
    const itens = contrato.conteudo?.itens || [];
    const clausulas = (contrato.conteudo?.clausulaIds || []).map(id => CLAUSULAS_SERVICO[id]).filter(Boolean);

    blocos.push(
      <h1 className="text-center text-base font-bold text-gray-900 uppercase">Contrato de Prestação de Serviços de BPO</h1>,
    );
    blocos.push(
      <div className="mt-5 text-[11px] leading-relaxed text-gray-700 text-justify space-y-2">
        <p><strong>CONTRATADA:</strong> {CONTRATADA.nome}, inscrita no CNPJ sob o nº {CONTRATADA.cnpj}, com sede em {CONTRATADA.endereco}.</p>
        <p><strong>CONTRATANTE:</strong> {contrato.cliente_nome}{contrato.cliente_cnpj ? `, inscrita no CNPJ sob o nº ${contrato.cliente_cnpj}` : ''}.</p>
        <p>As partes acima qualificadas têm entre si, justo e contratado, o presente Contrato de Prestação de Serviços de Terceirização de Processos de Negócios (BPO), que se regerá pelas cláusulas seguintes.</p>
      </div>,
    );
    blocos.push(
      <div className="mt-5">
        <p className="text-[12px] font-bold text-gray-900">CLÁUSULA 1ª — DO OBJETO E DO PREÇO</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-gray-700 text-justify">
          O objeto deste contrato é a prestação, pela CONTRATADA, dos serviços de BPO de apoio administrativo-financeiro abaixo relacionados, com a seguinte forma de cobrança:
        </p>
      </div>,
    );
    blocos.push(
      <table className="w-full mt-2 text-[11px] border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left text-[9.5px] uppercase tracking-wide text-gray-500">
            <th className="py-1 pr-2">Serviço</th><th className="py-1 px-2">Forma de cobrança</th><th className="py-1 pl-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => {
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
      </table>,
    );
    blocos.push(
      <p className="mt-2 text-[11px] leading-relaxed text-gray-700 text-justify">
        Os serviços de <strong>valor fixo</strong> são cobrados mensalmente pelo valor indicado. Os serviços cobrados <strong>por unidade</strong> são faturados conforme o volume efetivamente realizado no período, multiplicando-se o valor unitário pela quantidade — podendo, portanto, variar mês a mês. A título ilustrativo, o valor total apurado no último mês de operação foi de {formatCurrency(Number(contrato.valor_total || 0))}.
      </p>,
    );
    clausulas.forEach((cl, idx) => {
      const [primeiro, ...resto] = cl.blocos;
      blocos.push(
        <div className="mt-5">
          <p className="text-[12px] font-bold text-gray-900">CLÁUSULA {idx + 2}ª — {cl.titulo.toUpperCase()}</p>
          {primeiro && <BlocoClausula bloco={primeiro} />}
        </div>,
      );
      resto.forEach((b) => blocos.push(<BlocoClausula bloco={b} />));
    });
    blocos.push(
      <p className="mt-5 text-[10px] text-gray-400">As condições gerais (vigência, reajuste, rescisão e foro) serão incluídas conforme definição.</p>,
    );
    blocos.push(
      <div className="mt-12">
        <p className="text-[11px] text-gray-700">{CONTRATADA.local}, {dataExtenso}.</p>
        <div className="mt-16 grid grid-cols-2 gap-10 text-center text-[10.5px] text-gray-700">
          <div className="border-t border-gray-500 pt-1"><p className="font-semibold text-gray-900">{CONTRATADA.nome}</p><p>CONTRATADA · CNPJ {CONTRATADA.cnpj}</p></div>
          <div className="border-t border-gray-500 pt-1"><p className="font-semibold text-gray-900">{contrato.cliente_nome}</p><p>CONTRATANTE{contrato.cliente_cnpj ? ` · CNPJ ${contrato.cliente_cnpj}` : ''}</p></div>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-10 text-center text-[10px] text-gray-500">
          <div className="border-t border-gray-400 pt-1">Testemunha 1 · CPF</div>
          <div className="border-t border-gray-400 pt-1">Testemunha 2 · CPF</div>
        </div>
      </div>,
    );
  }

  // Mede a altura de cada bloco e distribui em páginas A4.
  useLayoutEffect(() => {
    if (!contrato || blocos.length === 0) return;
    const mmToPx = 96 / 25.4;
    const maxPx = (297 - MARGENS_A4.topo - MARGENS_A4.base) * mmToPx;
    const pages = [[]];
    let acc = 0;
    for (let i = 0; i < blocos.length; i++) {
      const h = medRefs.current[i]?.offsetHeight || 0;
      const cur = pages[pages.length - 1];
      if (cur.length > 0 && acc + h > maxPx) { pages.push([]); acc = 0; }
      pages[pages.length - 1].push(i);
      acc += h;
    }
    setPaginas(pages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contrato]);

  const larguraConteudo = 210 - 2 * MARGENS_A4.laterais;
  const bg = PAPEL_TIMBRADO_URL
    ? { backgroundImage: `url(${PAPEL_TIMBRADO_URL})`, backgroundSize: '210mm 297mm', backgroundRepeat: 'no-repeat' }
    : {};
  const folhaStyle = {
    width: '210mm', minHeight: '297mm', boxSizing: 'border-box',
    padding: `${MARGENS_A4.topo}mm ${MARGENS_A4.laterais}mm ${MARGENS_A4.base}mm`,
    ...bg,
  };
  const pgs = paginas || (blocos.length ? [blocos.map((_, i) => i)] : []);

  return createPortal(
    <div className="relatorio-overlay fixed inset-0 z-[60] bg-gray-700/70 overflow-auto">
      <style>{`
        @media print {
          #root { display: none !important; }
          .relatorio-overlay { position: static !important; overflow: visible !important; background: #fff !important; }
          .relatorio-overlay .no-print { display: none !important; }
          #contrato-doc { padding: 0 !important; }
          #contrato-doc .folha { box-shadow: none !important; margin: 0 !important; break-after: page; }
          #contrato-doc .folha:last-child { break-after: auto; }
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; }
        }
        #contrato-doc .folha { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-2.5">
        <p className="text-sm font-medium text-gray-700">Pré-visualização do contrato (rascunho){pgs.length ? ` · ${pgs.length} página(s)` : ''}</p>
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

      {/* Medição invisível para paginar */}
      {contrato && (
        <div aria-hidden style={{ position: 'fixed', left: '-9999px', top: 0, width: `${larguraConteudo}mm`, visibility: 'hidden' }}>
          {blocos.map((b, i) => <div key={i} ref={(el) => { medRefs.current[i] = el; }}>{b}</div>)}
        </div>
      )}

      {carregando || !contrato ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : (
        <div id="contrato-doc" className="py-6 px-3">
          {pgs.map((idxs, p) => (
            <div key={p} className="folha bg-white shadow-xl mx-auto mb-6" style={folhaStyle}>
              {idxs.map((i) => <div key={i}>{blocos[i]}</div>)}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
