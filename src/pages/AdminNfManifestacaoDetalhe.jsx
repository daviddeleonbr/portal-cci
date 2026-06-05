// Admin CCI — detalhe da nota enviada: view-only de produtos + anexos
// para baixar + ações Lançar / Devolver.

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertCircle, Download, File, FileText,
  CheckCircle2, XCircle, Package, Briefcase, Building2,
  Calendar, Hash, Clock, PackagePlus, Image as ImageIcon,
} from 'lucide-react';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import { useAdminSession } from '../hooks/useAuth';
import * as nfService from '../services/notaManifestacaoService';
import { formatCurrency } from '../utils/format';
import { numeroNotaDaChave, serieDaChave, formatNumeroNota } from '../utils/nfe';

function fmtData(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

function fmtDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('pt-BR');
}

const STATUS_INFO = {
  pendente:         { label: 'Pendente cliente', bg: 'bg-gray-100 dark:bg-white/[0.06]',       text: 'text-gray-700 dark:text-gray-300' },
  em_preenchimento: { label: 'Em preenchimento', bg: 'bg-amber-50 dark:bg-amber-500/15',       text: 'text-amber-700 dark:text-amber-300' },
  enviada:          { label: 'Aguardando CCI',   bg: 'bg-blue-50 dark:bg-blue-500/15',         text: 'text-blue-700 dark:text-blue-300' },
  lancada:          { label: 'Lançada',          bg: 'bg-emerald-50 dark:bg-emerald-500/15',   text: 'text-emerald-700 dark:text-emerald-300' },
  devolvida:        { label: 'Devolvida',        bg: 'bg-rose-50 dark:bg-rose-500/15',         text: 'text-rose-700 dark:text-rose-300' },
};

// Situações NFe (Quality): 0=sem manif, 1=ciência confirmada.
const SITUACAO_NFE = {
  0: { label: 'Sem manifestação',        bg: 'bg-amber-50 dark:bg-amber-500/15',     text: 'text-amber-700 dark:text-amber-300',   dot: 'bg-amber-500' },
  1: { label: 'Confirmação da operação', bg: 'bg-emerald-50 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
};

export default function AdminNfManifestacaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const adminSession = useAdminSession();
  const usuario = adminSession?.usuario;

  const [nota, setNota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(null);
  const [modalDevolver, setModalDevolver] = useState(false);
  const [motivoDevolucao, setMotivoDevolucao] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const n = await nfService.obter(id);
      if (!n) throw new Error('Nota não encontrada');
      setNota(n);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  const baixar = async (arq) => {
    try {
      const url = await nfService.urlAssinada(arq.storage_path);
      if (url) window.open(url, '_blank');
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao baixar: ' + err.message });
    }
  };

  const lancar = async () => {
    if (!confirm('Marcar esta nota como LANÇADA no sistema?')) return;
    setSalvando(true);
    try {
      await nfService.marcarLancada(nota.id, { adminUsuarioId: usuario?.id });
      setToast({ tipo: 'success', mensagem: 'Nota marcada como lançada' });
      setTimeout(() => navigate('/admin/fiscal/manifestacao'), 600);
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro: ' + err.message });
    } finally { setSalvando(false); }
  };

  const confirmarDevolucao = async () => {
    if (!motivoDevolucao.trim()) {
      setToast({ tipo: 'error', mensagem: 'Informe o motivo da devolução' });
      return;
    }
    setSalvando(true);
    try {
      await nfService.devolverParaCliente(nota.id, {
        motivo: motivoDevolucao,
        adminUsuarioId: usuario?.id,
      });
      setToast({ tipo: 'success', mensagem: 'Nota devolvida ao cliente' });
      setModalDevolver(false);
      setTimeout(() => navigate('/admin/fiscal/manifestacao'), 600);
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro: ' + err.message });
    } finally { setSalvando(false); }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 p-12 flex items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        <span className="text-sm">Carregando...</span>
      </div>
    );
  }
  if (error || !nota) {
    return (
      <div>
        <Link to="/admin/fiscal/manifestacao" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mb-4">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-6 text-sm text-red-800 dark:text-red-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p>{error || 'Nota não encontrada'}</p>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_INFO[nota.status_portal];
  const arquivosNF = (nota.arquivos || []).filter(a => a.tipo === 'nota_fiscal');
  const arquivosBol = (nota.arquivos || []).filter(a => a.tipo === 'boleto');
  const totalProdutos = (nota.produtos || []).reduce((s, p) => s + Number(p.subtotal || 0), 0);
  const podeAgir = nota.status_portal === 'enviada';

  return (
    <div className="space-y-4">
      <Link to="/admin/fiscal/manifestacao"
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft className="h-4 w-4" /> Voltar para fila
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">Cliente</p>
            <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{nota.cliente?.nome || '—'}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 font-mono">{nota.cliente?.cnpj || '—'}</p>
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${statusCfg.bg} ${statusCfg.text}`}>
            {statusCfg.label}
          </span>
        </div>

        {(() => {
          const numNF = numeroNotaDaChave(nota.chave_documento);
          const serie = serieDaChave(nota.chave_documento);
          const numeroFmt = numNF != null
            ? `${formatNumeroNota(numNF)}${serie != null ? ` / ${serie}` : ''}`
            : '—';
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Field label="Fornecedor" value={nota.razao_social_fornecedor} sub={nota.cnpj_fornecedor} fullSpan />
              <Field icon={Hash} label="Nº NF / Série" value={numeroFmt} highlight />
              <Field icon={Calendar} label="Emissão" value={fmtData(nota.data_emissao)} />
              <Field icon={Building2} label="Empresa" value={nota.empresa_codigo || '—'} />
              <Field label="Valor da NF" value={formatCurrency(nota.valor)} highlight />
            </div>
          );
        })()}

        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/10 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Chave NF-e</p>
            <p className="font-mono text-[11px] text-gray-600 dark:text-gray-400 break-all mt-0.5">{nota.chave_documento}</p>
            {nota.protocolo_manifestacao && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                <span className="font-semibold text-gray-600 dark:text-gray-300">Protocolo:</span> <span className="font-mono">{nota.protocolo_manifestacao}</span>
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">Situação NFe (SEFAZ)</p>
            {(() => {
              const sit = SITUACAO_NFE[nota.situacao_manifestacao];
              if (!sit) {
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
                  {nota.situacao_manifestacao == null ? '—' : `Código ${nota.situacao_manifestacao}`}
                </span>;
              }
              return (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${sit.bg} ${sit.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${sit.dot}`} />
                  {sit.label}
                </span>
              );
            })()}
            {nota.motivo_manifestacao && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 italic">{nota.motivo_manifestacao}</p>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3" /> Enviada: <strong className="text-gray-700 dark:text-gray-200">{fmtDataHora(nota.enviada_em)}</strong></span>
          {nota.lancada_em && <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Lançada: <strong className="text-gray-700 dark:text-gray-200">{fmtDataHora(nota.lancada_em)}</strong></span>}
          {nota.devolvida_em && <span className="inline-flex items-center gap-1.5"><XCircle className="h-3 w-3 text-rose-500" /> Devolvida: <strong className="text-gray-700 dark:text-gray-200">{fmtDataHora(nota.devolvida_em)}</strong></span>}
        </div>

        {nota.motivo_devolucao && (
          <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 p-3 text-sm text-rose-800 dark:text-rose-300">
            <p className="font-semibold mb-1">Motivo da devolução:</p>
            <p>{nota.motivo_devolucao}</p>
          </div>
        )}
      </div>

      {/* Resumo de destinação dos produtos */}
      {(() => {
        const itens = nota.produtos || [];
        const estoque = itens.filter(p => (p.tipo_destinacao || 'estoque') === 'estoque');
        const uso = itens.filter(p => p.tipo_destinacao === 'uso_consumo');
        const bonif = itens.filter(p => p.bonificacao);
        const totEstoque = estoque.reduce((s, p) => s + Number(p.subtotal || 0), 0);
        const totUso = uso.reduce((s, p) => s + Number(p.subtotal || 0), 0);
        const totBonif = bonif.reduce((s, p) => s + Number(p.subtotal || 0), 0);
        return (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-2">Resumo da nota (por destinação dos produtos)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">Estoque (revenda)</span>
                </div>
                <p className="text-[11px] text-blue-700 dark:text-blue-300/80 mt-1">{estoque.length} {estoque.length === 1 ? 'item' : 'itens'}</p>
                <p className="font-mono tabular-nums font-bold text-blue-900 dark:text-blue-200 mt-0.5">{formatCurrency(totEstoque)}</p>
              </div>
              <div className="rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 p-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-sm font-semibold text-violet-800 dark:text-violet-300">Uso e consumo</span>
                </div>
                <p className="text-[11px] text-violet-700 dark:text-violet-300/80 mt-1">{uso.length} {uso.length === 1 ? 'item' : 'itens'}</p>
                <p className="font-mono tabular-nums font-bold text-violet-900 dark:text-violet-200 mt-0.5">{formatCurrency(totUso)}</p>
              </div>
              <div className={`rounded-lg p-3 border ${bonif.length > 0 ? 'bg-pink-50 dark:bg-pink-500/10 border-pink-200 dark:border-pink-500/20' : 'bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/10'}`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`h-4 w-4 ${bonif.length > 0 ? 'text-pink-600 dark:text-pink-400' : 'text-gray-400'}`} />
                  <span className={`text-sm font-semibold ${bonif.length > 0 ? 'text-pink-800 dark:text-pink-300' : 'text-gray-500 dark:text-gray-400'}`}>Bonificações</span>
                </div>
                <p className={`text-[11px] mt-1 ${bonif.length > 0 ? 'text-pink-700 dark:text-pink-300/80' : 'text-gray-500 dark:text-gray-400'}`}>
                  {bonif.length} {bonif.length === 1 ? 'item' : 'itens'} marcado{bonif.length === 1 ? '' : 's'}
                </p>
                {bonif.length > 0 && (
                  <p className="font-mono tabular-nums font-bold text-pink-900 dark:text-pink-200 mt-0.5">{formatCurrency(totBonif)}</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Produtos */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Produtos da nota</p>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">· {nota.produtos?.length || 0} {(nota.produtos?.length === 1) ? 'item' : 'itens'}</span>
        </div>
        {(nota.produtos?.length || 0) === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400">Cliente não cadastrou produtos</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-white/10">
                  <th className="px-3 py-2 bg-gray-50 dark:bg-white/[0.03] dark:bg-white/[0.03] w-10">#</th>
                  <th className="px-3 py-2 bg-gray-50 dark:bg-white/[0.03]">Código de barras</th>
                  <th className="px-3 py-2 bg-gray-50 dark:bg-white/[0.03]">Cód. interno</th>
                  <th className="px-3 py-2 bg-gray-50 dark:bg-white/[0.03]">Descrição</th>
                  <th className="px-3 py-2 bg-gray-50 dark:bg-white/[0.03] text-right w-20">Qtd</th>
                  <th className="px-3 py-2 bg-gray-50 dark:bg-white/[0.03] text-right w-28">Valor unit.</th>
                  <th className="px-3 py-2 bg-gray-50 dark:bg-white/[0.03] text-right w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {(nota.produtos || []).map((p, idx) => {
                  const fotos = (nota.arquivos || []).filter(a => a.produto_id === p.id);
                  return (
                    <tr key={p.id} className={p.produto_novo ? 'bg-amber-50/40 dark:bg-amber-500/[0.05]' : ''}>
                      <td className="px-3 py-2 text-gray-400 dark:text-gray-500 font-mono">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-[11.5px] text-gray-700 dark:text-gray-300">{p.codigo_barras || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[11.5px] text-gray-700 dark:text-gray-300">{p.codigo_interno || (p.produto_novo ? <span className="text-amber-700 dark:text-amber-400">a cadastrar</span> : '—')}</td>
                      <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{p.descricao || <span className="text-gray-400 dark:text-gray-500 italic">sem descrição</span>}</span>
                          {/* Destinação */}
                          {(p.tipo_destinacao || 'estoque') === 'estoque' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300">
                              <Package className="h-2.5 w-2.5" /> Estoque
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300">
                              <Briefcase className="h-2.5 w-2.5" /> Uso/cons.
                            </span>
                          )}
                          {p.bonificacao && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-pink-100 dark:bg-pink-500/20 text-pink-800 dark:text-pink-300">
                              Bonificação
                            </span>
                          )}
                          {p.produto_novo && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
                              <PackagePlus className="h-2.5 w-2.5" /> Novo
                            </span>
                          )}
                          {fotos.map(f => (
                            <button key={f.id} onClick={() => baixar(f)}
                              title={`Ver ${f.tipo === 'foto_produto' ? 'foto do produto' : 'foto do código de barras'}`}
                              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[9.5px] font-semibold hover:bg-amber-200 dark:hover:bg-amber-500/25">
                              <ImageIcon className="h-2.5 w-2.5" />
                              {f.tipo === 'foto_produto' ? 'Produto' : 'Cód barras'}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{p.quantidade}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(p.valor_unitario)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(p.subtotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50/80 dark:bg-white/[0.03] border-t-2 border-gray-200 dark:border-white/10">
                <tr className="font-semibold">
                  <td colSpan={6} className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Total dos produtos</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 dark:text-gray-100">{formatCurrency(totalProdutos)}</td>
                </tr>
                {Math.abs(totalProdutos - Number(nota.valor || 0)) > 0.01 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-500/10">
                      ⚠ Divergência: total dos produtos ({formatCurrency(totalProdutos)}) difere do valor da NF ({formatCurrency(nota.valor)})
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Anexos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BlocoAnexos titulo="Nota Fiscal" arquivos={arquivosNF} icone={FileText} cor="blue" onBaixar={baixar} />
        <BlocoAnexos titulo="Boletos"     arquivos={arquivosBol} icone={File}     cor="emerald" onBaixar={baixar} />
      </div>

      {/* Motivo da ausência de boleto (quando informado) */}
      {nota.motivo_sem_boleto && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-amber-800 dark:text-amber-300/80 font-semibold">
              {arquivosBol.length > 0 ? 'Observação do cliente sobre boletos' : 'Cliente informou que não há boleto'}
            </p>
            <p className="text-sm text-amber-900 dark:text-amber-200 mt-1">{nota.motivo_sem_boleto}</p>
          </div>
        </div>
      )}

      {/* Ações */}
      {podeAgir && (
        <div className="sticky bottom-4 bg-white dark:bg-slate-900 rounded-2xl border-2 border-blue-300 dark:border-blue-500/40 shadow-lg p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Validar nota</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Após validar, marque como lançada ou devolva ao cliente com motivo.</p>
          </div>
          <button onClick={() => setModalDevolver(true)} disabled={salvando}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 dark:border-rose-500/40 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 px-4 py-2.5 text-sm font-semibold hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-50">
            <XCircle className="h-4 w-4" /> Devolver
          </button>
          <button onClick={lancar} disabled={salvando}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Marcar como lançada
          </button>
        </div>
      )}

      {/* Modal devolver */}
      <Modal open={modalDevolver} onClose={() => setModalDevolver(false)} title="Devolver nota ao cliente">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Descreva o que o cliente precisa corrigir/complementar. Ele verá esta mensagem no portal.
          </p>
          <textarea value={motivoDevolucao} onChange={e => setMotivoDevolucao(e.target.value)}
            rows={5} placeholder="Ex: Valor do produto X está divergente da nota. Corrigir e reenviar."
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 p-3 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:focus:ring-rose-900/40" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalDevolver(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]">Cancelar</button>
            <button onClick={confirmarDevolucao} disabled={salvando || !motivoDevolucao.trim()}
              className="rounded-lg bg-rose-600 text-white px-4 py-2 text-sm font-semibold hover:bg-rose-700 disabled:opacity-50">
              Devolver ao cliente
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}
    </div>
  );
}

function Field({ label, value, sub, icon: Icon, highlight, fullSpan }) {
  return (
    <div className={fullSpan ? 'col-span-2' : ''}>
      <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}{label}
      </p>
      <p className={`mt-0.5 ${highlight ? 'font-mono tabular-nums font-bold text-gray-900 dark:text-gray-100' : 'text-gray-800 dark:text-gray-200'} truncate`}>{value || '—'}</p>
      {sub && <p className="text-[10.5px] text-gray-500 dark:text-gray-400 font-mono truncate">{sub}</p>}
    </div>
  );
}

function BlocoAnexos({ titulo, arquivos, icone: Icon, cor, onBaixar }) {
  const corClasses = {
    blue:    { bg: 'bg-blue-50 dark:bg-blue-500/10',       text: 'text-blue-600 dark:text-blue-400',       border: 'border-blue-200 dark:border-blue-500/20' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/20' },
  }[cor];
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
      <div className={`px-4 py-3 border-b ${corClasses.border} ${corClasses.bg}/40 flex items-center gap-2`}>
        <Icon className={`h-4 w-4 ${corClasses.text}`} />
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1">{titulo}</p>
        <span className="text-[11px] text-gray-500">{arquivos.length} {arquivos.length === 1 ? 'arquivo' : 'arquivos'}</span>
      </div>
      {arquivos.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">Cliente não anexou</div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-white/10">
          {arquivos.map(a => (
            <li key={a.id} className="px-4 py-2.5 flex items-center gap-2">
              <File className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <p className="flex-1 text-[12.5px] text-gray-800 dark:text-gray-200 truncate" title={a.nome_original}>{a.nome_original}</p>
              <button onClick={() => onBaixar(a)} title="Baixar"
                className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06] text-blue-600 dark:text-blue-400 text-[11.5px] font-medium">
                <Download className="h-3.5 w-3.5" /> Baixar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
