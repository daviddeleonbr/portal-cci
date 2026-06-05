// Detalhe da nota — cliente preenche tipo de destinação, produtos
// (cod barras, cod interno, qtd, valor unit), anexa NF/boletos e
// envia pra CCI.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Loader2, AlertCircle, Save, Plus, Trash2,
  Upload, File, FileText, Download, Send, CheckCircle2,
  Package, Briefcase, Building2, Calendar, Hash, ScanLine, X, Search,
  Camera, Keyboard,
} from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import Toast from '../../../components/ui/Toast';
import * as nfService from '../../../services/notaManifestacaoService';
import * as mapService from '../../../services/mapeamentoService';
import * as qualityApi from '../../../services/qualityApiService';
import { formatCurrency } from '../../../utils/format';

function fmtData(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

const STATUS_INFO = {
  pendente:         { label: 'Pendente',         bg: 'bg-gray-100 dark:bg-white/[0.06]',           text: 'text-gray-700 dark:text-gray-300' },
  em_preenchimento: { label: 'Em preenchimento', bg: 'bg-amber-50 dark:bg-amber-500/15',          text: 'text-amber-700 dark:text-amber-300' },
  enviada:          { label: 'Enviada à CCI',    bg: 'bg-blue-50 dark:bg-blue-500/15',            text: 'text-blue-700 dark:text-blue-300' },
  lancada:          { label: 'Lançada',          bg: 'bg-emerald-50 dark:bg-emerald-500/15',      text: 'text-emerald-700 dark:text-emerald-300' },
  devolvida:        { label: 'Devolvida',        bg: 'bg-rose-50 dark:bg-rose-500/15',            text: 'text-rose-700 dark:text-rose-300' },
};

export default function ClienteNotaFiscalDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = useClienteSession();
  const cliente = session?.cliente;

  const [nota, setNota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState(null);

  // Edição em memória dos produtos (commit no banco no blur ou Enter).
  const [produtosLocal, setProdutosLocal] = useState([]);
  const [modalScan, setModalScan] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const n = await nfService.obter(id);
      if (!n) throw new Error('Nota não encontrada');
      if (n.cliente_id !== cliente?.id) throw new Error('Você não tem acesso a esta nota');
      setNota(n);
      setProdutosLocal(n.produtos || []);
    } catch (err) {
      setError(err.message || 'Falha ao carregar nota');
    } finally { setLoading(false); }
  }, [id, cliente?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Tipo de destinação ──────────────────────────────────
  const mudarTipoDestinacao = async (tipo) => {
    if (!nota || readonly) return;
    setSalvando(true);
    try {
      const atualizada = await nfService.atualizar(nota.id, {
        tipo_destinacao: tipo,
        status_portal: nota.status_portal === 'pendente' ? 'em_preenchimento' : nota.status_portal,
      });
      setNota(prev => ({ ...prev, ...atualizada }));
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao salvar: ' + err.message });
    } finally { setSalvando(false); }
  };

  // ─── Produtos ────────────────────────────────────────────
  // Insere um produto em branco ou pré-preenchido (vindo do scan/busca).
  const adicionarProduto = async (preenchimento = {}) => {
    if (!nota || readonly) return;
    try {
      const ordem = produtosLocal.length;
      const novo = await nfService.adicionarProduto(nota.id, {
        codigo_barras: '', codigo_interno: '', descricao: '',
        quantidade: 1, valor_unitario: 0, ordem,
        ...preenchimento,
      });
      setProdutosLocal(prev => [...prev, novo]);
      if (nota.status_portal === 'pendente') {
        await nfService.atualizar(nota.id, { status_portal: 'em_preenchimento' });
        setNota(prev => ({ ...prev, status_portal: 'em_preenchimento' }));
      }
      return novo;
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao adicionar produto: ' + err.message });
    }
  };

  const editarProdutoLocal = (idx, campos) => {
    setProdutosLocal(prev => prev.map((p, i) => i === idx ? { ...p, ...campos } : p));
  };

  const commitProduto = async (idx, campos) => {
    const p = produtosLocal[idx];
    if (!p?.id) return;
    try {
      const atualizado = await nfService.atualizarProduto(p.id, campos);
      setProdutosLocal(prev => prev.map((x, i) => i === idx ? atualizado : x));
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao salvar produto: ' + err.message });
    }
  };

  const removerProduto = async (idx) => {
    const p = produtosLocal[idx];
    if (!p?.id) return;
    if (!confirm('Remover este produto?')) return;
    try {
      await nfService.excluirProduto(p.id);
      setProdutosLocal(prev => prev.filter((_, i) => i !== idx));
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao remover: ' + err.message });
    }
  };

  // ─── Arquivos ────────────────────────────────────────────
  const uploadArquivo = async (file, tipo) => {
    if (!file || !nota) return;
    try {
      await nfService.adicionarArquivo({ nfId: nota.id, clienteId: cliente.id, tipo, file });
      setToast({ tipo: 'success', mensagem: `${tipo === 'nota_fiscal' ? 'Nota' : 'Boleto'} anexado` });
      if (nota.status_portal === 'pendente') {
        await nfService.atualizar(nota.id, { status_portal: 'em_preenchimento' });
      }
      await carregar();
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao enviar: ' + err.message });
    }
  };

  const removerArquivo = async (arq) => {
    if (!confirm(`Remover "${arq.nome_original}"?`)) return;
    try {
      await nfService.excluirArquivo(arq);
      await carregar();
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao remover: ' + err.message });
    }
  };

  const baixarArquivo = async (arq) => {
    try {
      const url = await nfService.urlAssinada(arq.storage_path);
      if (url) window.open(url, '_blank');
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao gerar link: ' + err.message });
    }
  };

  // ─── Enviar pra CCI ──────────────────────────────────────
  const enviarParaCci = async () => {
    if (!nota) return;
    if (!confirm('Enviar esta nota para a CCI lançar? Após o envio, ela ficará bloqueada para edição até retorno.')) return;
    setEnviando(true);
    try {
      await nfService.enviarParaCci(nota.id);
      setToast({ tipo: 'success', mensagem: 'Nota enviada para CCI!' });
      setTimeout(() => navigate('/cliente/webposto/financeiro/notas-fiscais'), 800);
    } catch (err) {
      setToast({ tipo: 'error', mensagem: err.message });
    } finally { setEnviando(false); }
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
        <Link to="/cliente/webposto/financeiro/notas-fiscais" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mb-4">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-6 text-sm text-red-800 dark:text-red-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p>{error || 'Nota não encontrada'}</p>
        </div>
      </div>
    );
  }

  const readonly = ['enviada', 'lancada'].includes(nota.status_portal);
  const statusCfg = STATUS_INFO[nota.status_portal];
  const arquivosNF = (nota.arquivos || []).filter(a => a.tipo === 'nota_fiscal');
  const arquivosBol = (nota.arquivos || []).filter(a => a.tipo === 'boleto');
  const totalProdutos = produtosLocal.reduce((s, p) =>
    s + (Number(p.quantidade || 0) * Number(p.valor_unitario || 0)), 0);

  // Pendências para envio à CCI — o botão só habilita quando lista está vazia.
  const pendencias = [];
  if (!nota.tipo_destinacao)              pendencias.push('Tipo de destinação');
  if (produtosLocal.length === 0)         pendencias.push('Ao menos 1 produto');
  if (arquivosNF.length === 0)            pendencias.push('Nota fiscal anexada');
  const motivoSemBoletoOk = !!(nota.motivo_sem_boleto && nota.motivo_sem_boleto.trim());
  if (arquivosBol.length === 0 && !motivoSemBoletoOk) {
    pendencias.push('Boleto anexado ou motivo da ausência');
  }
  const podeEnviar = pendencias.length === 0;

  return (
    <div className="space-y-4">
      {/* Voltar */}
      <Link to="/cliente/webposto/financeiro/notas-fiscais"
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft className="h-4 w-4" /> Voltar para lista
      </Link>

      {/* Header da nota */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">Fornecedor</p>
            <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{nota.razao_social_fornecedor || '—'}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{nota.cnpj_fornecedor || '—'}</p>
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${statusCfg.bg} ${statusCfg.text}`}>
            {statusCfg.label}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold flex items-center gap-1"><Calendar className="h-3 w-3" /> Emissão</p>
            <p className="font-mono tabular-nums text-gray-800 dark:text-gray-200 mt-0.5">{fmtData(nota.data_emissao)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold flex items-center gap-1"><Hash className="h-3 w-3" /> Cód Quality</p>
            <p className="font-mono tabular-nums text-gray-800 dark:text-gray-200 mt-0.5">{nota.codigo_quality || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold flex items-center gap-1"><Building2 className="h-3 w-3" /> Empresa</p>
            <p className="font-mono tabular-nums text-gray-800 dark:text-gray-200 mt-0.5">{nota.empresa_codigo || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Valor NF</p>
            <p className="font-mono tabular-nums font-bold text-gray-900 dark:text-gray-100 mt-0.5">{formatCurrency(nota.valor)}</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/10">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Chave NF-e</p>
          <p className="font-mono text-[11px] text-gray-600 dark:text-gray-400 break-all mt-0.5">{nota.chave_documento}</p>
        </div>

        {nota.status_portal === 'devolvida' && nota.motivo_devolucao && (
          <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 p-3 text-sm text-rose-800 dark:text-rose-300">
            <p className="font-semibold mb-1">CCI devolveu para correção:</p>
            <p>{nota.motivo_devolucao}</p>
          </div>
        )}
      </div>

      {/* Tipo de destinação */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm p-4 sm:p-5">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 dark:text-gray-100 mb-1">Destinação</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Esta nota é para estoque (revenda) ou uso e consumo da empresa?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { key: 'estoque',     label: 'Estoque (revenda)',  desc: 'Produtos para revenda no posto/loja', icon: Package },
            { key: 'uso_consumo', label: 'Uso e consumo',      desc: 'Materiais consumidos pela empresa',   icon: Briefcase },
          ].map(opt => {
            const Icon = opt.icon;
            const ativo = nota.tipo_destinacao === opt.key;
            return (
              <button key={opt.key} onClick={() => mudarTipoDestinacao(opt.key)} disabled={readonly || salvando}
                className={`text-left rounded-xl border-2 p-3 transition-all ${
                  ativo
                    ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-500/10'
                    : 'border-gray-200 dark:border-white/10 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                } ${readonly ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${ativo ? 'text-blue-600' : 'text-gray-500'}`} />
                  <p className={`text-sm font-semibold ${ativo ? 'text-blue-900 dark:text-blue-200' : 'text-gray-800 dark:text-gray-200'}`}>{opt.label}</p>
                  {ativo && <CheckCircle2 className="h-4 w-4 text-blue-600 ml-auto" />}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 ml-6">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Produtos */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Produtos da nota</p>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">· {produtosLocal.length} {produtosLocal.length === 1 ? 'item' : 'itens'}</span>
          {!readonly && (
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setModalScan(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-blue-700">
                <ScanLine className="h-3.5 w-3.5" /> Escanear / buscar
              </button>
              <button onClick={() => adicionarProduto()}
                title="Adicionar linha em branco"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 dark:hover:bg-white/[0.04]">
                <Plus className="h-3.5 w-3.5" /> Manual
              </button>
            </div>
          )}
        </div>

        {produtosLocal.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum produto adicionado.
            {!readonly && <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-1">Use "Escanear / buscar" para localizar pelo código de barras, ou "Manual" para preencher do zero.</span>}
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-white/10">
              {produtosLocal.map((p, idx) => (
                <ProdutoCard key={p.id} produto={p} readonly={readonly}
                  onEdit={(campos) => editarProdutoLocal(idx, campos)}
                  onCommit={(campos) => commitProduto(idx, campos)}
                  onRemove={() => removerProduto(idx)} />
              ))}
            </div>

            {/* Desktop: tabela */}
            <div className="hidden md:block overflow-x-auto">
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
                    {!readonly && <th className="px-2 py-2 bg-gray-50 w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                  {produtosLocal.map((p, idx) => (
                    <ProdutoRow key={p.id} produto={p} idx={idx} readonly={readonly}
                      onEdit={(campos) => editarProdutoLocal(idx, campos)}
                      onCommit={(campos) => commitProduto(idx, campos)}
                      onRemove={() => removerProduto(idx)} />
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/80 dark:bg-white/[0.03] border-t-2 border-gray-200 dark:border-white/10">
                  <tr className="font-semibold">
                    <td colSpan={6} className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">Total dos produtos</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 dark:text-gray-100">{formatCurrency(totalProdutos)}</td>
                    {!readonly && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile: rodapé total */}
            <div className="md:hidden px-4 py-3 border-t-2 border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/[0.03] flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total</p>
              <p className="font-mono tabular-nums text-base font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalProdutos)}</p>
            </div>
          </>
        )}
      </div>

      {/* Arquivos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ZonaArquivos titulo="Nota Fiscal" subtitulo="PDF, XML ou imagem" tipo="nota_fiscal"
          icone={FileText} cor="blue"
          arquivos={arquivosNF} readonly={readonly}
          onUpload={(file) => uploadArquivo(file, 'nota_fiscal')}
          onRemove={removerArquivo} onBaixar={baixarArquivo} />
        <ZonaArquivos titulo="Boletos" subtitulo="Pode anexar vários" tipo="boleto"
          icone={File} cor="emerald"
          arquivos={arquivosBol} readonly={readonly}
          onUpload={(file) => uploadArquivo(file, 'boleto')}
          onRemove={removerArquivo} onBaixar={baixarArquivo} />
      </div>

      {/* Motivo da ausência de boleto — alternativa ao anexo */}
      <MotivoSemBoleto
        valor={nota.motivo_sem_boleto || ''}
        temBoletos={arquivosBol.length > 0}
        readonly={readonly}
        onSalvar={async (texto) => {
          try {
            const atualizada = await nfService.atualizar(nota.id, {
              motivo_sem_boleto: texto || null,
              status_portal: nota.status_portal === 'pendente' ? 'em_preenchimento' : nota.status_portal,
            });
            setNota(prev => ({ ...prev, ...atualizada }));
          } catch (err) {
            setToast({ tipo: 'error', mensagem: 'Erro ao salvar: ' + err.message });
          }
        }}
      />

      {/* Botão enviar pra CCI */}
      {!readonly && (
        <div className={`sticky bottom-4 rounded-2xl shadow-lg p-4 flex items-center gap-3 border-2 transition-colors ${
          podeEnviar
            ? 'bg-white dark:bg-slate-900 border-blue-300 dark:border-blue-500/40'
            : 'bg-amber-50/80 dark:bg-amber-500/[0.08] border-amber-300 dark:border-amber-500/30'
        }`}>
          <div className="flex-1 min-w-0">
            {podeEnviar ? (
              <>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pronto pra enviar à CCI</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Todas as informações obrigatórias estão preenchidas.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Faltam itens obrigatórios:</p>
                <ul className="text-[11px] text-amber-700 dark:text-amber-300/90 mt-0.5 space-y-0.5">
                  {pendencias.map(p => <li key={p}>· {p}</li>)}
                </ul>
              </>
            )}
          </div>
          <button onClick={enviarParaCci} disabled={enviando || !podeEnviar}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar à CCI
          </button>
        </div>
      )}

      {modalScan && (
        <ModalScanProduto
          cliente={cliente}
          onClose={() => setModalScan(false)}
          onAdicionar={async (dados) => {
            await adicionarProduto(dados);
            setModalScan(false);
          }}
          onErro={(msg) => setToast({ tipo: 'error', mensagem: msg })}
        />
      )}

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Produto: linha (desktop) ────────────────────────────────
function ProdutoRow({ produto, idx, readonly, onEdit, onCommit, onRemove }) {
  const subtotal = Number(produto.quantidade || 0) * Number(produto.valor_unitario || 0);
  return (
    <tr className="hover:bg-gray-50/40 dark:hover:bg-white/[0.04]">
      <td className="px-3 py-1.5 text-gray-400 font-mono">{idx + 1}</td>
      <td className="px-3 py-1.5">
        <input type="text" value={produto.codigo_barras || ''} disabled={readonly}
          onChange={e => onEdit({ codigo_barras: e.target.value })}
          onBlur={e => onCommit({ codigo_barras: e.target.value })}
          className="w-full h-8 px-2 rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[11.5px] font-mono text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
      </td>
      <td className="px-3 py-1.5">
        <input type="text" value={produto.codigo_interno || ''} disabled={readonly}
          onChange={e => onEdit({ codigo_interno: e.target.value })}
          onBlur={e => onCommit({ codigo_interno: e.target.value })}
          className="w-full h-8 px-2 rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[11.5px] font-mono text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
      </td>
      <td className="px-3 py-1.5">
        <input type="text" value={produto.descricao || ''} disabled={readonly}
          onChange={e => onEdit({ descricao: e.target.value })}
          onBlur={e => onCommit({ descricao: e.target.value })}
          placeholder="Descrição (opcional)"
          className="w-full h-8 px-2 rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[12px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
      </td>
      <td className="px-3 py-1.5">
        <input type="number" step="0.0001" min="0" value={produto.quantidade ?? ''} disabled={readonly}
          onChange={e => onEdit({ quantidade: e.target.value })}
          onBlur={e => onCommit({ quantidade: Number(e.target.value) || 0 })}
          className="w-full h-8 px-2 rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[12px] text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
      </td>
      <td className="px-3 py-1.5">
        <input type="number" step="0.01" min="0" value={produto.valor_unitario ?? ''} disabled={readonly}
          onChange={e => onEdit({ valor_unitario: e.target.value })}
          onBlur={e => onCommit({ valor_unitario: Number(e.target.value) || 0 })}
          className="w-full h-8 px-2 rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[12px] text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
      </td>
      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-900 dark:text-gray-100">
        {formatCurrency(subtotal)}
      </td>
      {!readonly && (
        <td className="px-2 py-1.5">
          <button onClick={onRemove}
            className="p-1.5 rounded hover:bg-rose-50 text-gray-400 hover:text-rose-600"
            aria-label="Remover produto">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

// ─── Produto: card (mobile) ──────────────────────────────────
function ProdutoCard({ produto, readonly, onEdit, onCommit, onRemove }) {
  const subtotal = Number(produto.quantidade || 0) * Number(produto.valor_unitario || 0);
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-start gap-2">
        <input type="text" value={produto.descricao || ''} disabled={readonly}
          onChange={e => onEdit({ descricao: e.target.value })}
          onBlur={e => onCommit({ descricao: e.target.value })}
          placeholder="Descrição"
          className="flex-1 h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
        {!readonly && (
          <button onClick={onRemove}
            className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600 flex-shrink-0"
            aria-label="Remover produto">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="text" value={produto.codigo_barras || ''} disabled={readonly}
          onChange={e => onEdit({ codigo_barras: e.target.value })}
          onBlur={e => onCommit({ codigo_barras: e.target.value })}
          placeholder="Código de barras"
          className="h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-xs font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
        <input type="text" value={produto.codigo_interno || ''} disabled={readonly}
          onChange={e => onEdit({ codigo_interno: e.target.value })}
          onBlur={e => onCommit({ codigo_interno: e.target.value })}
          placeholder="Cód. interno"
          className="h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-xs font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
      </div>
      <div className="grid grid-cols-3 gap-2 items-end">
        <label className="block">
          <span className="text-[10px] text-gray-500">Qtd</span>
          <input type="number" step="0.0001" min="0" value={produto.quantidade ?? ''} disabled={readonly}
            onChange={e => onEdit({ quantidade: e.target.value })}
            onBlur={e => onCommit({ quantidade: Number(e.target.value) || 0 })}
            className="w-full h-10 px-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
        </label>
        <label className="block">
          <span className="text-[10px] text-gray-500">Valor unit.</span>
          <input type="number" step="0.01" min="0" value={produto.valor_unitario ?? ''} disabled={readonly}
            onChange={e => onEdit({ valor_unitario: e.target.value })}
            onBlur={e => onCommit({ valor_unitario: Number(e.target.value) || 0 })}
            className="w-full h-10 px-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
        </label>
        <div>
          <span className="text-[10px] text-gray-500 block">Subtotal</span>
          <p className="h-10 px-2 flex items-center justify-end font-mono tabular-nums text-sm font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(subtotal)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Zona de upload de arquivos ──────────────────────────────
function ZonaArquivos({ titulo, subtitulo, tipo, icone: Icon, cor, arquivos, readonly, onUpload, onRemove, onBaixar }) {
  const inputRef = useRef(null);
  const corClasses = {
    blue:    { bg: 'bg-blue-50 dark:bg-blue-500/10',       text: 'text-blue-600 dark:text-blue-400',       border: 'border-blue-200 dark:border-blue-500/20' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/20' },
  }[cor];

  const handleFiles = (files) => {
    Array.from(files || []).forEach(f => onUpload(f));
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
      <div className={`px-4 py-3 border-b ${corClasses.border} ${corClasses.bg}/40 flex items-center gap-2`}>
        <Icon className={`h-4 w-4 ${corClasses.text}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</p>
          <p className="text-[10.5px] text-gray-500 dark:text-gray-400">{subtitulo} · {arquivos.length} {arquivos.length === 1 ? 'arquivo' : 'arquivos'}</p>
        </div>
        {!readonly && (
          <>
            <button onClick={() => inputRef.current?.click()}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${corClasses.bg} ${corClasses.text} hover:opacity-80`}>
              <Upload className="h-3.5 w-3.5" /> Anexar
            </button>
            <input type="file" ref={inputRef} className="hidden"
              multiple accept="application/pdf,image/*,application/xml,text/xml"
              onChange={e => handleFiles(e.target.files)} />
          </>
        )}
      </div>

      {arquivos.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">Nenhum arquivo anexado</div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-white/10">
          {arquivos.map(a => (
            <li key={a.id} className="px-4 py-2.5 flex items-center gap-2">
              <File className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-gray-800 dark:text-gray-200 truncate" title={a.nome_original}>{a.nome_original}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatTamanho(a.tamanho_bytes)}</p>
              </div>
              <button onClick={() => onBaixar(a)} title="Baixar"
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-white/[0.05] text-gray-500 dark:text-gray-400">
                <Download className="h-3.5 w-3.5" />
              </button>
              {!readonly && (
                <button onClick={() => onRemove(a)} title="Remover"
                  className="p-2 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 text-gray-400 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Modal de scan / busca por código de barras ───────────────
// Usa o cache de PRODUTO da Quality. Compatível com leitor USB (que digita
// rápido e dispara Enter no final) ou digitação manual.
// ─── Bloco "Sem boleto?" — alternativa ao anexo ───────────────
// Quando a nota não tem boleto (paga em dinheiro, sem cobrança formal,
// fornecedor não emitiu boleto etc) o cliente pode justificar no lugar
// de anexar. Service exige boleto OU motivo.
const SUGESTOES_SEM_BOLETO = [
  'Nota fiscal paga em dinheiro',
  'Nota fiscal veio sem boleto',
  'Pagamento via PIX direto ao fornecedor',
  'Compra à vista',
];

function MotivoSemBoleto({ valor, temBoletos, readonly, onSalvar }) {
  const [aberto, setAberto] = useState(!!valor && !temBoletos);
  const [texto, setTexto] = useState(valor || '');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setTexto(valor || ''); }, [valor]);

  const salvar = async (novoTexto) => {
    if (readonly) return;
    setSalvando(true);
    try { await onSalvar(novoTexto); }
    finally { setSalvando(false); }
  };

  const escolherSugestao = (s) => {
    setTexto(s);
    salvar(s);
  };

  // Se já tem boletos anexados E não há motivo preenchido, esconde o bloco
  // (a regra está satisfeita; mantém UI limpa).
  if (temBoletos && !valor && !aberto) return null;

  const corBg = valor && !temBoletos
    ? 'border-amber-300 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/[0.06]'
    : 'border-gray-200/60 dark:border-white/10 bg-white dark:bg-slate-900';

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${corBg}`}>
      <div className="px-4 sm:px-5 py-3 flex items-center gap-2">
        <AlertCircle className={`h-4 w-4 flex-shrink-0 ${valor && !temBoletos ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {temBoletos ? 'Observação sobre boletos (opcional)' : 'Não há boleto pra anexar?'}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {temBoletos
              ? 'Caso queira complementar com alguma informação para a CCI.'
              : 'Justifique a ausência. Pode usar uma das sugestões abaixo ou descrever.'}
          </p>
        </div>
        {!readonly && !aberto && !valor && (
          <button onClick={() => setAberto(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:hover:bg-white/[0.04]">
            Informar motivo
          </button>
        )}
      </div>

      {(aberto || valor) && (
        <div className="px-4 sm:px-5 pb-4 space-y-2">
          {!readonly && !temBoletos && (
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES_SEM_BOLETO.map(s => (
                <button key={s} onClick={() => escolherSugestao(s)} disabled={salvando}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-500/30 bg-white dark:bg-amber-500/[0.08] text-amber-800 dark:text-amber-300 px-2.5 py-1 text-[11px] font-medium hover:bg-amber-50 dark:hover:bg-amber-500/[0.15]">
                  {s}
                </button>
              ))}
            </div>
          )}
          <textarea value={texto} onChange={e => setTexto(e.target.value)}
            onBlur={e => salvar(e.target.value.trim())}
            disabled={readonly} rows={2}
            placeholder='Ex: "Nota fiscal paga em dinheiro"'
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 p-3 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-900/40 disabled:opacity-60" />
          {salvando && <p className="text-[10px] text-gray-400 dark:text-gray-500">Salvando...</p>}
        </div>
      )}
    </div>
  );
}

// BarcodeDetector é nativa no Chrome Android/Edge. iOS Safari não tem suporte
// — nele o botão de câmera não aparece e o usuário usa o input manual.
const CAMERA_DISPONIVEL = typeof window !== 'undefined'
  && 'BarcodeDetector' in window
  && typeof navigator !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia;

// Formatos suportados em PDV (EAN13/EAN8 cobre quase tudo; UPC pra
// importados; code128/code39 pra etiquetas internas).
const FORMATOS_BARRA = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'itf',
];

// Câmera traseira em loop, detecta o código e dispara onDetectado.
function CameraScanner({ onDetectado, onErro }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const detectadoRef = useRef(false); // evita disparar onDetectado duas vezes

  useEffect(() => {
    let cancelado = false;

    const start = async () => {
      try {
        // Instancia detector com formatos suportados pela engine
        const Det = window.BarcodeDetector;
        const suportados = await Det.getSupportedFormats?.() || FORMATOS_BARRA;
        const formats = FORMATOS_BARRA.filter(f => suportados.includes(f));
        detectorRef.current = new Det({ formats: formats.length ? formats : FORMATOS_BARRA });

        // Câmera traseira preferida
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Loop de detecção
        const tick = async () => {
          if (cancelado || detectadoRef.current || !videoRef.current) return;
          try {
            const barcodes = await detectorRef.current.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              const raw = String(barcodes[0].rawValue || '').trim();
              if (raw) {
                detectadoRef.current = true;
                // Feedback haptico (mobile)
                try { navigator.vibrate?.(50); } catch { /* ignore */ }
                onDetectado?.(raw);
                return;
              }
            }
          } catch { /* alguns frames falham — segue tentando */ }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        onErro?.(
          err?.name === 'NotAllowedError'
            ? 'Permissão de câmera negada. Habilite nas configurações do navegador.'
            : 'Não foi possível acessar a câmera: ' + (err?.message || err)
        );
      }
    };
    start();

    return () => {
      cancelado = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [onDetectado, onErro]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] sm:aspect-video">
      <video ref={videoRef} playsInline muted
        className="absolute inset-0 w-full h-full object-cover" />
      {/* Overlay com viewfinder */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[80%] h-[35%] border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-0.5 bg-blue-400/80 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalScanProduto({ cliente, onClose, onAdicionar, onErro }) {
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [produto, setProduto] = useState(null);  // produto encontrado
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [valorUnit, setValorUnit] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [modoCamera, setModoCamera] = useState(false);
  const inputRef = useRef(null);
  const cameraButtonRef = useRef(null);

  // Detecta dispositivo touch (mobile/tablet). Em touch + câmera disponível,
  // o foco vai pro botão "Escanear" — evita teclado virtual saltando ao abrir.
  // No desktop ou sem câmera, mantém foco no input (UX de leitor USB).
  useEffect(() => {
    if (modoCamera) return;
    const isTouch = typeof window !== 'undefined'
      && (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
    const alvo = (isTouch && CAMERA_DISPONIVEL) ? cameraButtonRef.current : inputRef.current;
    setTimeout(() => alvo?.focus(), 50);
  }, [modoCamera]);

  // Fecha ao ESC.
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const buscar = async (codigoArg) => {
    const cb = String(codigoArg ?? codigo).trim();
    if (!cb) return;
    if (!cliente?.chave_api_id) {
      onErro?.('Integração Webposto não configurada');
      return;
    }
    setBuscando(true);
    setProduto(null);
    setNaoEncontrado(false);
    try {
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave?.chave) throw new Error('Chave API não encontrada');
      const p = await qualityApi.buscarProdutoPorCodigoBarras(chave.chave, cb);
      if (!p) {
        setNaoEncontrado(true);
      } else {
        setProduto(p);
        // Pré-popula valor sugerido (se a API retornar)
        const v = p.precoCusto ?? p.custoMedio ?? p.precoVenda ?? '';
        setValorUnit(v !== '' && v != null ? String(v) : '');
      }
    } catch (err) {
      onErro?.('Erro ao buscar: ' + (err.message || err));
    } finally { setBuscando(false); }
  };

  const confirmar = async () => {
    if (!produto && !naoEncontrado) return;
    await onAdicionar({
      codigo_barras: codigo.trim(),
      codigo_interno: produto?.codigo != null ? String(produto.codigo) : '',
      descricao: produto?.nome || '',
      quantidade: Number(quantidade) || 1,
      valor_unitario: Number(valorUnit) || 0,
    });
  };

  const limparEResearch = () => {
    setProduto(null); setNaoEncontrado(false); setCodigo(''); setValorUnit(''); setQuantidade('1');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <ScanLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Adicionar produto</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Escaneie o código de barras com leitor ou digite manualmente.</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500 dark:text-gray-400" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modo câmera (mobile com BarcodeDetector) */}
        {modoCamera ? (
          <div className="px-5 pt-4">
            <CameraScanner
              onDetectado={(cb) => {
                setCodigo(cb);
                setModoCamera(false);
                buscar(cb);
              }}
              onErro={(msg) => { onErro?.(msg); setModoCamera(false); }}
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Aponte o código de barras para a câmera</p>
              <button onClick={() => setModoCamera(false)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                <Keyboard className="h-3.5 w-3.5" /> Digitar
              </button>
            </div>
          </div>
        ) : (
          /* Modo input manual / leitor USB */
          <div className="px-5 pt-4">
            {CAMERA_DISPONIVEL && (
              <button ref={cameraButtonRef} onClick={() => setModoCamera(true)}
                className="w-full mb-3 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-3.5 text-sm font-bold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all ring-1 ring-blue-400/40 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-400">
                <Camera className="h-5 w-5" />
                Escanear com a câmera
              </button>
            )}
            {CAMERA_DISPONIVEL && (
              <div className="flex items-center gap-2 my-3">
                <div className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
                <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">ou digite</span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
              </div>
            )}
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Código de barras</label>
            <form onSubmit={e => { e.preventDefault(); buscar(); }} className="flex gap-2">
              <input ref={inputRef} type="text" value={codigo}
                onChange={e => { setCodigo(e.target.value); setProduto(null); setNaoEncontrado(false); }}
                placeholder="Escaneie ou digite o código..."
                className="flex-1 h-11 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-base font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
              <button type="submit" disabled={!codigo.trim() || buscando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 h-11 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </button>
            </form>
          </div>
        )}

        {/* Resultado */}
        <div className="px-5 pb-4 pt-3 min-h-[180px]">
          {!produto && !naoEncontrado && !buscando && (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-8">
              Aguardando código...
            </p>
          )}

          {buscando && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-8">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando no catálogo Webposto...
            </div>
          )}

          {naoEncontrado && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 mb-3">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Produto não encontrado no catálogo</p>
              <p className="text-xs text-amber-700 dark:text-amber-300/80">
                O código <span className="font-mono">{codigo}</span> não está cadastrado no Webposto.
                Você pode adicionar mesmo assim (preencha descrição na tabela) ou tentar outro código.
              </p>
            </div>
          )}

          {produto && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-3 mb-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 truncate">{produto.nome || '—'}</p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300/80 font-mono">
                    Cód {produto.codigo ?? '—'}
                    {produto.grupoNome && <span> · {produto.grupoNome}</span>}
                    {produto.unidadeMedida && <span> · {produto.unidadeMedida}</span>}
                  </p>
                </div>
              </div>
            </div>
          )}

          {(produto || naoEncontrado) && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">Quantidade</span>
                <input type="number" step="0.0001" min="0" value={quantidade}
                  onChange={e => setQuantidade(e.target.value)}
                  className="w-full h-10 px-2 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">Valor unit. (R$)</span>
                <input type="number" step="0.01" min="0" value={valorUnit}
                  onChange={e => setValorUnit(e.target.value)}
                  className="w-full h-10 px-2 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-white/10 bg-gray-50/60 dark:bg-white/[0.02] flex items-center gap-2">
          {(produto || naoEncontrado) && (
            <button onClick={limparEResearch}
              className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
              Limpar e escanear outro
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]">
            Cancelar
          </button>
          <button onClick={confirmar} disabled={!produto && !naoEncontrado}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            <Plus className="h-3.5 w-3.5" /> Adicionar à nota
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function formatTamanho(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
