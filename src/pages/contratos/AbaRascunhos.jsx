// Aba "Rascunhos" da página Contratos.
// Lista os contratos em rascunho / enviados para assinatura (gerados a partir
// de propostas) e permite visualizar/imprimir o contrato antes da assinatura.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  FileText, Eye, Send, Trash2, Loader2, Printer, X, AlertTriangle, CheckCircle2, ShieldAlert,
  Pencil, Plus, Building2,
} from 'lucide-react';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import { formatCurrency, formatDate } from '../../utils/format';
import * as contratosService from '../../services/contratosService';
import * as servicosService from '../../services/servicosOferecidosService';
import * as clientesService from '../../services/clientesService';
import { buscarCep } from '../../services/viacepService';
import { montarDocumentoDeContrato } from '../../lib/contratos/gerarContrato';
import { TIPOS_CONTRATO } from '../../lib/contratos/motor';
import DescricaoEstruturada from '../../components/contratos/DescricaoEstruturada';

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
        <RelatorioContrato contratoId={verId} showToast={showToast} onFechar={() => { setVerId(null); carregar(); }} />
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

const SUFIXO_PERIODO = { mensal: ' / mês', anual: ' / ano', unico: '' };

// ─── Serviços contratados (injetados no marcador {{tabela_servicos}}) ──
// Só o DETALHAMENTO de cada serviço (descrição do serviço cadastrado,
// estruturada) — sem quadro de valores (o preço fica na cláusula de pagamento).
// Com mais de um serviço, o nome de cada um abre o seu bloco.
function ServicosContratados({ itens }) {
  const lista = itens || [];
  const varios = lista.length > 1;
  return (
    <div className="mt-2 text-[11px] text-gray-700">
      {lista.map((it, i) => (
        <div key={i} className={i ? 'mt-3' : ''}>
          {(varios || !it.descricao) && <p className="font-semibold text-gray-900">{it.nome}</p>}
          {it.descricao && (
            <DescricaoEstruturada texto={it.descricao} className={varios ? 'mt-1' : ''} corTitulo="#0f766e" corForte="#111827" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Visualização A4 imprimível do contrato ────────────────────
function RelatorioContrato({ contratoId, showToast, onFechar }) {
  const [contrato, setContrato] = useState(null);
  const [doc, setDoc] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [editandoServicos, setEditandoServicos] = useState(false);
  const [editandoContratante, setEditandoContratante] = useState(false);

  // Após editar os serviços: remonta o documento (cláusulas de serviço seguem os itens).
  const aplicarContrato = async (c) => {
    setContrato(c);
    setDoc(await montarDocumentoDeContrato(c));
  };

  // Tipo do contrato (BPO | Consultoria): título, preâmbulo e objeto.
  const trocarTipo = async (tipo) => {
    try { await aplicarContrato(await contratosService.atualizarTipoContrato(contrato.id, tipo)); }
    catch (e) { showToast?.('error', 'Erro ao alterar o tipo: ' + e.message); }
  };

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
      ? <ServicosContratados key={key} itens={itens} />
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
        <p>As partes acima qualificadas têm entre si, justo e contratado, o presente {doc.preambulo}, que se regerá pelas cláusulas e condições seguintes.</p>
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
          {contrato?.status === 'rascunho' && doc && (
            <label className="flex items-center gap-1.5 text-sm text-gray-600" title="Define o título, o preâmbulo e o objeto do contrato">
              Tipo
              <select value={doc.tipo} onChange={e => trocarTipo(e.target.value)} disabled={carregando}
                className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm font-medium text-gray-800">
                {Object.entries(TIPOS_CONTRATO).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
            </label>
          )}
          {contrato?.status === 'rascunho' && (
            <button onClick={() => setEditandoContratante(true)} disabled={carregando}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              <Building2 className="h-4 w-4" /> Dados da contratante
            </button>
          )}
          {contrato?.status === 'rascunho' && (
            <button onClick={() => setEditandoServicos(true)} disabled={carregando}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              <Pencil className="h-4 w-4" /> Editar serviços
            </button>
          )}
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
              {contrato?.status === 'rascunho' && doc.validacao.erros.some(e => e.includes('CONTRATANTE')) && (
                <button onClick={() => setEditandoContratante(true)}
                  className="mt-2 ml-6 inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700">
                  <Building2 className="h-3.5 w-3.5" /> Preencher dados da contratante
                </button>
              )}
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

      {editandoContratante && contrato && (
        <EditorContratante contrato={contrato} showToast={showToast}
          onFechar={() => setEditandoContratante(false)}
          onSalvo={async (c) => { setEditandoContratante(false); await aplicarContrato(c); }} />
      )}

      {editandoServicos && contrato && (
        <EditorServicos contrato={contrato} showToast={showToast}
          onFechar={() => setEditandoServicos(false)}
          onSalvo={async (c) => { setEditandoServicos(false); await aplicarContrato(c); }} />
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

// ─── Editor dos serviços do contrato (rascunho) ────────────────
// Cada linha = um serviço do CATÁLOGO (Serviços Oferecidos): nome, detalhamento
// (descrição), forma de cobrança e periodicidade vêm do cadastro; o valor (e a
// quantidade, se cobrado por unidade) é editável.
function itemDoServico(s, valor) {
  return {
    servico_id: s.id, nome: s.nome, descricao: s.descricao || null, categoria: s.categoria || null,
    periodicidade: s.periodicidade || 'mensal', tipo_valor: s.tipo_valor || 'fixo',
    unidade: s.unidade || null, quantidade: 1,
    valor_unitario: valor ?? Number(s.valor || 0),
  };
}

function EditorServicos({ contrato, showToast, onFechar, onSalvo }) {
  const [catalogo, setCatalogo] = useState(null);
  const [linhas, setLinhas] = useState(() => (contrato.conteudo?.itens || []).map(it => ({ ...it })));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    servicosService.listarServicos({ apenasAtivos: true })
      .then(setCatalogo)
      .catch(e => { showToast?.('error', 'Erro ao carregar o catálogo: ' + e.message); setCatalogo([]); });
  }, [showToast]);

  // Serviço do catálogo de uma linha (por id; itens antigos casam pelo nome).
  const servicoDa = (l) => (catalogo || []).find(s => (l.servico_id && s.id === l.servico_id)
    || s.nome?.trim().toLowerCase() === String(l.nome || '').trim().toLowerCase());

  // Troca o serviço mantendo o valor já negociado da linha.
  const trocarServico = (i, id) => {
    const s = (catalogo || []).find(x => x.id === id);
    if (!s) return;
    setLinhas(ls => ls.map((l, k) => (k === i ? itemDoServico(s, Number(l.valor_unitario) || undefined) : l)));
  };
  const setCampo = (i, campo, v) => setLinhas(ls => ls.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));
  const remover = (i) => setLinhas(ls => ls.filter((_, k) => k !== i));
  const adicionar = () => {
    const s = (catalogo || []).find(x => !linhas.some(l => servicoDa(l)?.id === x.id)) || (catalogo || [])[0];
    if (s) setLinhas(ls => [...ls, itemDoServico(s)]);
  };

  const semCatalogo = linhas.filter(l => !servicoDa(l)).length;
  const total = linhas.reduce((t, l) => t + (Number(l.valor_unitario) || 0) * ((l.tipo_valor || 'fixo') === 'fixo' ? 1 : (Number(l.quantidade) || 1)), 0);

  const salvar = async () => {
    setSalvando(true);
    try {
      // Detalhamento sempre o do cadastro (atualiza descrições antigas).
      const itens = linhas.map(l => {
        const s = servicoDa(l);
        return s ? { ...l, servico_id: s.id, nome: s.nome, descricao: s.descricao || null } : l;
      });
      const c = await contratosService.atualizarServicosContrato(contrato.id, itens);
      showToast?.('success', 'Serviços do contrato atualizados');
      onSalvo(c);
    } catch (e) { showToast?.('error', 'Erro ao salvar: ' + e.message); }
    finally { setSalvando(false); }
  };

  return (
    <div className="no-print fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onClick={onFechar}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Serviços do contrato</h3>
            <p className="text-xs text-gray-500">Escolha os serviços do catálogo e ajuste os valores. O detalhamento é o do serviço cadastrado.</p>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {catalogo === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
          ) : (
            <>
              {semCatalogo > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  {semCatalogo} serviço(s) não estão no catálogo (ex.: vindos de proposta consultiva). Escolha o serviço cadastrado correspondente.
                </div>
              )}
              {linhas.map((l, i) => {
                const s = servicoDa(l);
                const porUnidade = (l.tipo_valor || 'fixo') !== 'fixo';
                return (
                  <div key={i} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Serviço</label>
                        <select value={s?.id || ''} onChange={e => trocarServico(i, e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900">
                          {!s && <option value="">{l.nome} (fora do catálogo — escolha um serviço)</option>}
                          {(catalogo || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </div>
                      {porUnidade && (
                        <div className="w-24">
                          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Qtd</label>
                          <input type="number" min="1" value={l.quantidade ?? 1} onChange={e => setCampo(i, 'quantidade', e.target.value)}
                            className="w-full h-9 rounded-lg border border-gray-200 px-2 text-sm tabular-nums" />
                        </div>
                      )}
                      <div className="w-36">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                          Valor {porUnidade ? `/ ${l.unidade || 'un.'}` : (SUFIXO_PERIODO[l.periodicidade] ?? '/ mês')}
                        </label>
                        <input type="number" step="0.01" min="0" value={l.valor_unitario ?? ''} onChange={e => setCampo(i, 'valor_unitario', e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 px-2 text-sm tabular-nums" />
                      </div>
                      <button onClick={() => remover(i)} title="Remover serviço"
                        className="mt-5 rounded-lg p-2 text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-gray-50 px-3 py-2 text-[11.5px] text-gray-600">
                      {(s?.descricao || l.descricao)
                        ? <DescricaoEstruturada texto={s?.descricao || l.descricao} corForte="#111827" />
                        : <span className="italic text-gray-400">Sem detalhamento cadastrado.</span>}
                    </div>
                  </div>
                );
              })}
              <button onClick={adicionar} disabled={!catalogo?.length}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                <Plus className="h-4 w-4" /> Adicionar serviço
              </button>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
          <p className="text-sm text-gray-600">Total: <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(total)}</span></p>
          <div className="flex gap-2">
            <button onClick={onFechar} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button onClick={salvar} disabled={salvando || !catalogo || linhas.length === 0}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar serviços
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Editor dos dados da CONTRATANTE (rascunho) ────────────────
// Empresa (razão social, CNPJ, endereço) e representante legal. Grava no
// próprio contrato; com cliente vinculado, pode atualizar o cadastro também.
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const mascCnpjCpf = (v) => {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};
const mascCpf = (v) => soDigitos(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const mascCep = (v) => soDigitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

// Fora do componente: se fosse definido dentro, os inputs perderiam o foco a cada tecla.
function Campo({ rot, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{rot}</label>
      {children}
    </div>
  );
}

function EditorContratante({ contrato, showToast, onFechar, onSalvo }) {
  const [form, setForm] = useState(null);
  const [vinculado, setVinculado] = useState(false);
  const [atualizarCliente, setAtualizarCliente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Pré-preenche: dados já salvos no contrato > cadastro do cliente > proposta.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      let cli = null;
      if (contrato.cliente_id) {
        try { cli = await clientesService.buscarCliente(contrato.cliente_id); } catch { /* sem cadastro */ }
      }
      const salvo = contrato.conteudo?.contratante || {};
      const base = {};
      contratosService.CAMPOS_CONTRATANTE.forEach(k => { base[k] = salvo[k] ?? cli?.[k] ?? ''; });
      if (!base.razao_social) base.razao_social = cli?.razao_social || cli?.nome || contrato.cliente_nome || '';
      if (!base.cnpj) base.cnpj = cli?.cnpj || contrato.cliente_cnpj || '';
      if (!cancelado) { setForm(base); setVinculado(!!cli); }
    })();
    return () => { cancelado = true; };
  }, [contrato]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onCep = async (v) => {
    set('cep', mascCep(v));
    if (soDigitos(v).length !== 8) return;
    setBuscandoCep(true);
    try {
      const e = await buscarCep(v);
      if (e) setForm(f => ({ ...f, endereco: e.endereco || f.endereco, bairro: e.bairro || f.bairro, cidade: e.cidade || f.cidade, estado: e.estado || f.estado }));
    } catch { /* CEP não encontrado: preenche à mão */ }
    finally { setBuscandoCep(false); }
  };

  const faltando = form ? [
    !form.razao_social?.trim() && 'razão social',
    ![11, 14].includes(soDigitos(form.cnpj).length) && 'CNPJ/CPF',
    !form.representante_nome?.trim() && 'nome do representante',
    soDigitos(form.representante_cpf).length !== 11 && 'CPF do representante',
  ].filter(Boolean) : [];

  const salvar = async () => {
    setSalvando(true);
    try {
      const c = await contratosService.atualizarContratante(contrato.id, form, { atualizarCliente: vinculado && atualizarCliente });
      showToast?.('success', 'Dados da contratante salvos');
      onSalvo(c);
    } catch (e) { showToast?.('error', e.message); }
    finally { setSalvando(false); }
  };

  const input = 'w-full h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

  return (
    <div className="no-print fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onClick={onFechar}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Dados da contratante</h3>
            <p className="text-xs text-gray-500">Empresa e representante legal que assinam o contrato.</p>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!form ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
          ) : (
            <div className="space-y-5">
              <section>
                <p className="text-xs font-semibold text-gray-800 mb-2">Empresa</p>
                <div className="grid grid-cols-6 gap-3">
                  <Campo rot="Razão social" className="col-span-6 sm:col-span-4">
                    <input className={input} value={form.razao_social || ''} onChange={e => set('razao_social', e.target.value)} />
                  </Campo>
                  <Campo rot="CNPJ/CPF" className="col-span-6 sm:col-span-2">
                    <input className={`${input} tabular-nums`} value={mascCnpjCpf(form.cnpj)} onChange={e => set('cnpj', mascCnpjCpf(e.target.value))} />
                  </Campo>
                  <Campo rot={buscandoCep ? 'CEP (buscando…)' : 'CEP'} className="col-span-3 sm:col-span-2">
                    <input className={`${input} tabular-nums`} value={form.cep || ''} onChange={e => onCep(e.target.value)} placeholder="00000-000" />
                  </Campo>
                  <Campo rot="Endereço" className="col-span-6 sm:col-span-3">
                    <input className={input} value={form.endereco || ''} onChange={e => set('endereco', e.target.value)} />
                  </Campo>
                  <Campo rot="Número" className="col-span-3 sm:col-span-1">
                    <input className={input} value={form.numero || ''} onChange={e => set('numero', e.target.value)} />
                  </Campo>
                  <Campo rot="Complemento" className="col-span-6 sm:col-span-2">
                    <input className={input} value={form.complemento || ''} onChange={e => set('complemento', e.target.value)} />
                  </Campo>
                  <Campo rot="Bairro" className="col-span-6 sm:col-span-2">
                    <input className={input} value={form.bairro || ''} onChange={e => set('bairro', e.target.value)} />
                  </Campo>
                  <Campo rot="Cidade" className="col-span-4 sm:col-span-1">
                    <input className={input} value={form.cidade || ''} onChange={e => set('cidade', e.target.value)} />
                  </Campo>
                  <Campo rot="UF" className="col-span-2 sm:col-span-1">
                    <input className={`${input} uppercase`} maxLength={2} value={form.estado || ''} onChange={e => set('estado', e.target.value.toUpperCase())} />
                  </Campo>
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-800 mb-2">Representante legal</p>
                <div className="grid grid-cols-6 gap-3">
                  <Campo rot="Nome completo" className="col-span-6 sm:col-span-4">
                    <input className={input} value={form.representante_nome || ''} onChange={e => set('representante_nome', e.target.value)} />
                  </Campo>
                  <Campo rot="CPF" className="col-span-6 sm:col-span-2">
                    <input className={`${input} tabular-nums`} value={mascCpf(form.representante_cpf)} onChange={e => set('representante_cpf', mascCpf(e.target.value))} placeholder="000.000.000-00" />
                  </Campo>
                  <Campo rot="Cargo" className="col-span-6 sm:col-span-3">
                    <input className={input} value={form.representante_cargo || ''} onChange={e => set('representante_cargo', e.target.value)} placeholder="Ex.: Sócio-administrador" />
                  </Campo>
                  <Campo rot="E-mail" className="col-span-6 sm:col-span-3">
                    <input type="email" className={input} value={form.representante_email || ''} onChange={e => set('representante_email', e.target.value)} />
                  </Campo>
                </div>
              </section>

              {vinculado && (
                <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={atualizarCliente} onChange={e => setAtualizarCliente(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                  <span className="text-xs text-gray-700">
                    <span className="font-medium">Atualizar também o cadastro do cliente</span>
                    <span className="block text-[11px] text-gray-500">Os próximos contratos e boletos desse cliente já usam estes dados.</span>
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
          <p className="text-[11px] text-amber-700">{faltando.length > 0 ? `Para emitir faltam: ${faltando.join(', ')}.` : ''}</p>
          <div className="flex gap-2">
            <button onClick={onFechar} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button onClick={salvar} disabled={salvando || !form}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
