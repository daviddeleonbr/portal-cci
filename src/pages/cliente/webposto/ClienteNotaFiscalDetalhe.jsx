// Detalhe da nota — cliente preenche tipo de destinação, produtos
// (cod barras, cod interno, qtd, valor unit), anexa NF/boletos e
// envia pra CCI.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Loader2, AlertCircle, Save, Plus, Trash2,
  Upload, File, FileText, Download, Send, CheckCircle2,
  Package, Briefcase, Building2, Calendar, Hash, ScanLine, X, Search,
  Camera, Keyboard, PackagePlus, ImagePlus, Image as ImageIcon,
} from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import Toast from '../../../components/ui/Toast';
import * as nfService from '../../../services/notaManifestacaoService';
import * as mapService from '../../../services/mapeamentoService';
import * as qualityApi from '../../../services/qualityApiService';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';
import { numeroNotaDaChave, serieDaChave, formatNumeroNota } from '../../../utils/nfe';

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
  // Memoizado: entra nas deps de `carregar` — sem isso um novo array a cada
  // render recriaria o callback e dispararia recarga em loop.
  const clientesRede = useMemo(() => session?.clientesRede || [], [session?.clientesRede]);

  // Este componente é compartilhado pelos dois portais (Webposto e Autosystem).
  // `origem` governa a fonte do catálogo de produtos (scan), os caminhos de
  // rota e os rótulos "Webposto/Autosystem".
  const origem = session?.tipoCliente === 'autosystem' ? 'autosystem' : 'webposto';
  const asRedeId = session?.asRede?.id;
  const sistemaLabel = origem === 'autosystem' ? 'Autosystem' : 'Webposto';
  const basePath = `/cliente/${origem}/financeiro/notas-fiscais`;

  const [nota, setNota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState(null);

  // Edição em memória dos produtos (commit no banco no blur ou Enter).
  const [produtosLocal, setProdutosLocal] = useState([]);
  const [modalScan, setModalScan] = useState(false);
  const [modalNovoProduto, setModalNovoProduto] = useState(false);
  const [modalUsoConsumo, setModalUsoConsumo] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const n = await nfService.obter(id);
      if (!n) throw new Error('Nota não encontrada');
      // A nota pertence a uma das empresas da rede do usuário (Webposto: 1;
      // Autosystem: a empresa ativa que sincronizou). Valida por clientesRede.
      const pertence = clientesRede.some(c => c.id === n.cliente_id) || n.cliente_id === cliente?.id;
      if (!pertence) throw new Error('Você não tem acesso a esta nota');
      setNota(n);
      setProdutosLocal(n.produtos || []);
    } catch (err) {
      setError(err.message || 'Falha ao carregar nota');
    } finally { setLoading(false); }
  }, [id, cliente?.id, clientesRede]);

  useEffect(() => { carregar(); }, [carregar]);

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
      await nfService.adicionarArquivo({ nfId: nota.id, clienteId: nota.cliente_id, tipo, file });
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
      setTimeout(() => navigate(basePath), 800);
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
        <Link to={basePath} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mb-4">
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
  // Em correção (devolvida), o cliente vê SÓ o que tem motivo de devolução:
  // itens marcados + Nota Fiscal / Boletos marcados.
  const soCorrecao = nota.status_portal === 'devolvida';
  const itemVisivel = (p) => !soCorrecao || !!p.motivo_devolucao;
  const produtosVisiveis = produtosLocal.filter(itemVisivel);
  const mostrarNF = !soCorrecao || !!nota.motivo_devol_nf;
  const mostrarBoletos = !soCorrecao || !!nota.motivo_devol_boleto;
  const statusCfg = STATUS_INFO[nota.status_portal];
  const arquivosNF = (nota.arquivos || []).filter(a => a.tipo === 'nota_fiscal');
  const arquivosBol = (nota.arquivos || []).filter(a => a.tipo === 'boleto');

  // Resolve nome da empresa pelo empresa_codigo (rede pode ter várias).
  // Cai pro nome do próprio cliente se for empresa única ou se não achar match.
  const empresaNome = (() => {
    const cod = nota.empresa_codigo;
    if (cod != null) {
      const match = clientesRede.find(c => String(c.empresa_codigo) === String(cod));
      if (match?.nome) return match.nome;
    }
    return cliente?.nome || `cód ${cod || '—'}`;
  })();

  // Pendências para envio à CCI — o botão só habilita quando lista está vazia.
  const pendencias = [];
  if (produtosLocal.length === 0)         pendencias.push('Ao menos 1 produto');
  const semDestinacao = produtosLocal.filter(p => !p.tipo_destinacao).length;
  if (semDestinacao > 0)                  pendencias.push(`Definir destinação de ${semDestinacao} produto${semDestinacao === 1 ? '' : 's'}`);
  if (arquivosNF.length === 0)            pendencias.push('Nota fiscal anexada');
  const motivoSemBoletoOk = !!(nota.motivo_sem_boleto && nota.motivo_sem_boleto.trim());
  if (arquivosBol.length === 0 && !motivoSemBoletoOk) {
    pendencias.push('Boleto anexado ou motivo da ausência');
  }
  const podeEnviar = pendencias.length === 0;

  return (
    <div className="space-y-4">
      {/* Voltar */}
      <Link to={basePath}
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

        {(() => {
          const numNF = numeroNotaDaChave(nota.chave_documento);
          const serie = serieDaChave(nota.chave_documento);
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold flex items-center gap-1"><Hash className="h-3 w-3" /> Nº NF / Série</p>
                <p className="font-mono tabular-nums font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                  {numNF != null ? formatNumeroNota(numNF) : '—'}
                  {serie != null && <span className="ml-1.5 text-[11px] font-normal text-gray-500 dark:text-gray-400">/ {serie}</span>}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold flex items-center gap-1"><Calendar className="h-3 w-3" /> Emissão</p>
                <p className="font-mono tabular-nums text-gray-800 dark:text-gray-200 mt-0.5">{fmtData(nota.data_emissao)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold flex items-center gap-1"><Building2 className="h-3 w-3" /> Empresa</p>
                <p className="text-gray-800 dark:text-gray-200 mt-0.5 truncate" title={empresaNome}>{empresaNome}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Valor NF</p>
                <p className="font-mono tabular-nums font-bold text-gray-900 dark:text-gray-100 mt-0.5">{formatCurrency(nota.valor)}</p>
              </div>
            </div>
          );
        })()}

        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/10">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Chave NF-e</p>
          <p className="font-mono text-[11px] text-gray-600 dark:text-gray-400 break-all mt-0.5">{nota.chave_documento}</p>
        </div>

        {nota.status_portal === 'devolvida' && (nota.motivo_devolucao || produtosLocal.some(p => p.motivo_devolucao)) && (
          <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 p-3 text-sm text-rose-800 dark:text-rose-300">
            <p className="font-semibold mb-1">CCI devolveu para correção</p>
            {nota.motivo_devolucao
              ? <p>{nota.motivo_devolucao}</p>
              : <p>Corrija os itens marcados abaixo (a observação está em cada produto) e reenvie.</p>}
          </div>
        )}
      </div>

      {/* Produtos (em correção, só os itens marcados aparecem) */}
      {(!soCorrecao || produtosVisiveis.length > 0) && (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{soCorrecao ? 'Itens a corrigir' : 'Produtos da nota'}</p>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">· {produtosVisiveis.length} {produtosVisiveis.length === 1 ? 'item' : 'itens'}</span>
          {!readonly && !soCorrecao && (
            <div className="ml-auto flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setModalScan(true)}
                title={`Estoque (revenda) — buscar no catálogo do ${sistemaLabel}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-blue-700">
                <ScanLine className="h-3.5 w-3.5" /> Escanear / buscar
              </button>
              <button onClick={() => setModalUsoConsumo(true)}
                title="Item de uso e consumo da empresa (não vai pro estoque)"
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-500/10 text-violet-800 dark:text-violet-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-violet-100 dark:hover:bg-violet-500/20">
                <Briefcase className="h-3.5 w-3.5" /> Uso e consumo
              </button>
              <button onClick={() => setModalNovoProduto(true)}
                title={`Produto que ainda não está cadastrado no ${sistemaLabel}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-500/20">
                <PackagePlus className="h-3.5 w-3.5" /> Novo produto
              </button>
            </div>
          )}
        </div>

        {produtosLocal.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum produto adicionado.
            {!readonly && <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              <strong>Estoque</strong> (revenda): use "Escanear / buscar" ou "Novo produto" se ainda não está no {sistemaLabel}.
              <br /><strong>Uso e consumo</strong> (interno): use o botão correspondente.
            </span>}
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-white/10">
              {produtosLocal.map((p, idx) => itemVisivel(p) && (
                <ProdutoCard key={p.id} produto={p} readonly={readonly} sistemaLabel={sistemaLabel}
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
                    {!readonly && <th className="px-2 py-2 bg-gray-50 w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                  {produtosLocal.map((p, idx) => itemVisivel(p) && (
                    <ProdutoRow key={p.id} produto={p} idx={idx} readonly={readonly}
                      onEdit={(campos) => editarProdutoLocal(idx, campos)}
                      onCommit={(campos) => commitProduto(idx, campos)}
                      onRemove={() => removerProduto(idx)} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      )}

      {/* Arquivos (em correção, só os marcados aparecem) */}
      {(mostrarNF || mostrarBoletos) && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mostrarNF && (
          <div className="space-y-2">
            <ZonaArquivos titulo="Nota Fiscal" subtitulo="PDF, XML ou imagem" tipo="nota_fiscal"
              icone={FileText} cor="blue"
              arquivos={arquivosNF} readonly={readonly}
              onUpload={(file) => uploadArquivo(file, 'nota_fiscal')}
              onRemove={removerArquivo} onBaixar={baixarArquivo} />
            {nota.motivo_devol_nf && (
              <p className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-3 py-2 text-[12px] text-rose-800 dark:text-rose-300">
                <span className="font-semibold">⚠ Corrigir: </span>{nota.motivo_devol_nf}
              </p>
            )}
          </div>
        )}
        {mostrarBoletos && (
          <div className="space-y-2">
            <ZonaArquivos titulo="Boletos" subtitulo="Pode anexar vários" tipo="boleto"
              icone={File} cor="emerald"
              arquivos={arquivosBol} readonly={readonly}
              onUpload={(file) => uploadArquivo(file, 'boleto')}
              onRemove={removerArquivo} onBaixar={baixarArquivo} />
            {nota.motivo_devol_boleto && (
              <p className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-3 py-2 text-[12px] text-rose-800 dark:text-rose-300">
                <span className="font-semibold">⚠ Corrigir: </span>{nota.motivo_devol_boleto}
              </p>
            )}
          </div>
        )}
      </div>
      )}

      {/* Motivo da ausência de boleto — alternativa ao anexo */}
      {mostrarBoletos && (
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
      )}

      {/* Botão enviar pra CCI */}
      {!readonly && (
        <div className={`sticky bottom-4 rounded-2xl shadow-lg p-4 flex items-center gap-3 border-2 transition-colors backdrop-blur-md backdrop-saturate-150 ${
          podeEnviar
            ? 'bg-white/80 dark:bg-slate-900/70 border-blue-300 dark:border-blue-500/40'
            : 'bg-amber-50/70 dark:bg-amber-500/[0.12] border-amber-300 dark:border-amber-500/40'
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
          origem={origem}
          redeId={asRedeId}
          onClose={() => setModalScan(false)}
          onAdicionar={async (dados) => {
            // Default scan = estoque. Bonificação vem do checkbox do modal.
            await adicionarProduto({ tipo_destinacao: 'estoque', ...dados });
            setModalScan(false);
          }}
          onErro={(msg) => setToast({ tipo: 'error', mensagem: msg })}
        />
      )}

      {modalUsoConsumo && (
        <ModalUsoConsumo
          onClose={() => setModalUsoConsumo(false)}
          onAdicionar={async (dados) => {
            await adicionarProduto({ ...dados, tipo_destinacao: 'uso_consumo' });
            setModalUsoConsumo(false);
            setToast({ tipo: 'success', mensagem: 'Item de uso e consumo adicionado' });
          }}
          onErro={(msg) => setToast({ tipo: 'error', mensagem: msg })}
        />
      )}

      {modalNovoProduto && (
        <ModalNovoProduto
          sistemaLabel={sistemaLabel}
          onClose={() => setModalNovoProduto(false)}
          onAdicionar={async (dados) => {
            try {
              await nfService.adicionarProdutoNovo({
                nfId: nota.id,
                clienteId: nota.cliente_id,
                ...dados,
                ordem: produtosLocal.length,
              });
              if (nota.status_portal === 'pendente') {
                await nfService.atualizar(nota.id, { status_portal: 'em_preenchimento' });
              }
              await carregar();
              setModalNovoProduto(false);
              setToast({ tipo: 'success', mensagem: `Produto novo adicionado à nota — CCI cadastrará no ${sistemaLabel}` });
            } catch (err) {
              setToast({ tipo: 'error', mensagem: err.message });
            }
          }}
        />
      )}

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Badges de classificação do produto (clicáveis pra alternar) ──
// Mostra: destinação (estoque/uso e consumo), bonificação, produto novo.
// Clique no chip de destinação alterna entre estoque e uso_consumo.
function BadgesProduto({ produto, readonly, onMudarDestinacao, onToggleBonificacao }) {
  const destEstoque = produto.tipo_destinacao !== 'uso_consumo';
  const cfgDest = destEstoque
    ? { label: 'Estoque',     bg: 'bg-blue-100 dark:bg-blue-500/20',     text: 'text-blue-800 dark:text-blue-300',     icon: Package }
    : { label: 'Uso/consumo', bg: 'bg-violet-100 dark:bg-violet-500/20', text: 'text-violet-800 dark:text-violet-300', icon: Briefcase };
  const Icone = cfgDest.icon;
  const proxima = destEstoque ? 'uso_consumo' : 'estoque';
  return (
    <div className="inline-flex items-center gap-1 flex-shrink-0">
      <button type="button" onClick={() => !readonly && onMudarDestinacao?.(proxima)}
        disabled={readonly}
        title={readonly ? cfgDest.label : `Clique para alternar (atual: ${cfgDest.label})`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider ${cfgDest.bg} ${cfgDest.text} ${readonly ? '' : 'hover:opacity-80 cursor-pointer'}`}>
        <Icone className="h-2.5 w-2.5" /> {cfgDest.label}
      </button>
      <button type="button" onClick={() => !readonly && onToggleBonificacao?.()}
        disabled={readonly}
        title={produto.bonificacao ? 'Remover marca de bonificação' : 'Marcar como bonificação (informativo para CCI lançar)'}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider ${
          produto.bonificacao
            ? 'bg-pink-100 dark:bg-pink-500/20 text-pink-800 dark:text-pink-300'
            : 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400 opacity-60 hover:opacity-100'
        } ${readonly && !produto.bonificacao ? 'hidden' : ''} ${readonly ? '' : 'cursor-pointer'}`}>
        Bonif.
      </button>
      {produto.produto_novo && (
        <span title="Produto novo — CCI cadastrará no Webposto"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
          <PackagePlus className="h-2.5 w-2.5" /> Novo
        </span>
      )}
    </div>
  );
}

// ─── Produto: linha (desktop) ────────────────────────────────
function ProdutoRow({ produto, idx, readonly, onEdit, onCommit, onRemove }) {
  return (
    <tr className={produto.produto_novo
      ? 'bg-amber-50/40 dark:bg-amber-500/[0.06] hover:bg-amber-50/70 dark:hover:bg-amber-500/[0.1]'
      : 'hover:bg-gray-50/40 dark:hover:bg-white/[0.04]'}>
      <td className="px-3 py-1.5 text-gray-400 font-mono">{idx + 1}</td>
      <td className="px-3 py-1.5">
        <input type="text" value={produto.codigo_barras || ''} disabled={readonly || produto.produto_novo}
          onChange={e => onEdit({ codigo_barras: e.target.value })}
          onBlur={e => onCommit({ codigo_barras: e.target.value })}
          className="w-full h-8 px-2 rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[11.5px] font-mono text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
      </td>
      <td className="px-3 py-1.5">
        {produto.produto_novo ? (
          <span className="inline-flex items-center justify-center w-full h-8 px-2 rounded text-[10.5px] font-semibold uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
            a cadastrar
          </span>
        ) : (
          <input type="text" value={produto.codigo_interno || ''} disabled={readonly}
            onChange={e => onEdit({ codigo_interno: e.target.value })}
            onBlur={e => onCommit({ codigo_interno: e.target.value })}
            className="w-full h-8 px-2 rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[11.5px] font-mono text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
        )}
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <input type="text" value={produto.descricao || ''} disabled={readonly}
            onChange={e => onEdit({ descricao: e.target.value })}
            onBlur={e => onCommit({ descricao: e.target.value })}
            placeholder="Descrição (opcional)"
            className="flex-1 min-w-[160px] h-8 px-2 rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-[12px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
          <BadgesProduto produto={produto} readonly={readonly}
            onMudarDestinacao={(novo) => onCommit({ tipo_destinacao: novo })}
            onToggleBonificacao={() => onCommit({ bonificacao: !produto.bonificacao })} />
        </div>
        {produto.motivo_devolucao && (
          <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1">
            <span className="font-semibold whitespace-nowrap">⚠ Corrigir:</span>
            <span>{produto.motivo_devolucao}</span>
          </p>
        )}
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
function ProdutoCard({ produto, readonly, sistemaLabel = 'Webposto', onEdit, onCommit, onRemove }) {
  return (
    <div className={`p-3 space-y-2 ${produto.produto_novo ? 'bg-amber-50/40 dark:bg-amber-500/[0.06]' : ''}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <BadgesProduto produto={produto} readonly={readonly}
          onMudarDestinacao={(novo) => onCommit({ tipo_destinacao: novo })}
          onToggleBonificacao={() => onCommit({ bonificacao: !produto.bonificacao })} />
        {produto.produto_novo && (
          <span className="text-[10px] text-amber-700 dark:text-amber-300/80">CCI cadastrará no {sistemaLabel}</span>
        )}
      </div>
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
        <input type="text" value={produto.codigo_barras || ''} disabled={readonly || produto.produto_novo}
          onChange={e => onEdit({ codigo_barras: e.target.value })}
          onBlur={e => onCommit({ codigo_barras: e.target.value })}
          placeholder="Código de barras"
          className="h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-xs font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
        {produto.produto_novo ? (
          <span className="h-10 px-3 rounded-lg flex items-center justify-center text-[10.5px] font-semibold uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
            cód a cadastrar
          </span>
        ) : (
          <input type="text" value={produto.codigo_interno || ''} disabled={readonly}
            onChange={e => onEdit({ codigo_interno: e.target.value })}
            onBlur={e => onCommit({ codigo_interno: e.target.value })}
            placeholder="Cód. interno"
            className="h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-xs font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-gray-50 dark:disabled:bg-slate-800/40 dark:disabled:text-gray-500" />
        )}
      </div>
      {produto.motivo_devolucao && (
        <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-3 py-2 text-[12px] text-rose-800 dark:text-rose-300">
          <span className="font-semibold">⚠ Corrigir: </span>{produto.motivo_devolucao}
        </div>
      )}
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

// ─── Modal de item de uso e consumo (interno, não vai pro estoque) ──
function ModalUsoConsumo({ onClose, onAdicionar }) {
  const [descricao, setDescricao] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [valorUnit, setValorUnit] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !salvando) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, salvando]);

  const podeSalvar = descricao.trim() && Number(quantidade) > 0;

  const submit = async (e) => {
    e?.preventDefault();
    if (!podeSalvar || salvando) return;
    setSalvando(true);
    try {
      await onAdicionar({
        descricao: descricao.trim(),
        quantidade: Number(quantidade) || 1,
        valor_unitario: Number(valorUnit) || 0,
      });
    } finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={salvando ? undefined : onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <div className="h-10 w-10 rounded-lg bg-violet-50 dark:bg-violet-500/15 flex items-center justify-center flex-shrink-0">
            <Briefcase className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Item de uso e consumo</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Material consumido pela empresa (não entra no estoque de revenda).
            </p>
          </div>
          <button onClick={onClose} disabled={salvando}
            className="p-2 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500 dark:text-gray-400 disabled:opacity-50" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Descrição <span className="text-rose-500">*</span>
            </span>
            <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Papel A4 — 5 resmas"
              className="w-full h-11 px-3 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40" />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Quantidade <span className="text-rose-500">*</span>
              </span>
              <input type="number" step="0.0001" min="0" value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                className="w-full h-11 px-2 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Valor unit. (R$) <span className="text-rose-500">*</span>
              </span>
              <input type="number" step="0.01" min="0" value={valorUnit}
                onChange={e => setValorUnit(e.target.value)}
                className="w-full h-11 px-2 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40" />
            </label>
          </div>

          <div className="rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/10 p-2.5 flex items-center justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">Subtotal</span>
            <span className="font-mono tabular-nums text-sm font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency((Number(quantidade) || 0) * (Number(valorUnit) || 0))}
            </span>
          </div>
        </form>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-white/10 bg-gray-50/60 dark:bg-white/[0.02] flex items-center gap-2">
          <button onClick={onClose} disabled={salvando}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50">
            Cancelar
          </button>
          <div className="flex-1" />
          <button onClick={submit} disabled={!podeSalvar || salvando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 text-white px-4 py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-3.5 w-3.5" />}
            Adicionar à nota
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Modal de cadastro de produto NOVO (não existe no Webposto) ──
// Cliente preenche descrição, qtd, valor unit e anexa 2 fotos (produto +
// código de barras). CCI usa as fotos pra cadastrar antes de lançar.
function ModalNovoProduto({ sistemaLabel = 'Webposto', onClose, onAdicionar }) {
  const [descricao, setDescricao] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [valorUnit, setValorUnit] = useState('');
  const [fotoProduto, setFotoProduto] = useState(null);
  const [fotoCodigoBarras, setFotoCodigoBarras] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !salvando) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, salvando]);

  const podeSalvar = descricao.trim() && fotoProduto && fotoCodigoBarras
    && Number(quantidade) > 0;

  const submit = async (e) => {
    e?.preventDefault();
    if (!podeSalvar || salvando) return;
    setSalvando(true);
    try {
      await onAdicionar({
        descricao: descricao.trim(),
        codigoBarras: codigoBarras.trim(),
        quantidade: Number(quantidade) || 1,
        valorUnitario: Number(valorUnit) || 0,
        fotoProduto, fotoCodigoBarras,
      });
    } finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={salvando ? undefined : onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <PackagePlus className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Adicionar produto novo à nota</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Esse produto ainda não está cadastrado no {sistemaLabel}. Envie as informações e fotos — a CCI usa para cadastrar antes de lançar a nota.
            </p>
          </div>
          <button onClick={onClose} disabled={salvando}
            className="p-2 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500 dark:text-gray-400 disabled:opacity-50" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Descrição do produto <span className="text-rose-500">*</span>
            </span>
            <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Óleo lubrificante Shell Helix 5W30 1L"
              className="w-full h-11 px-3 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-900/40" />
          </label>

          {/* 2 uploads de foto */}
          <div className="grid grid-cols-2 gap-2">
            <UploadFoto label="Foto do produto" obrigatorio file={fotoProduto} onChange={setFotoProduto} />
            <UploadFoto label="Foto do cód. barras" obrigatorio file={fotoCodigoBarras} onChange={setFotoCodigoBarras} />
          </div>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Código de barras <span className="text-gray-400">(opcional, se souber)</span>
            </span>
            <input type="text" value={codigoBarras} onChange={e => setCodigoBarras(e.target.value)}
              placeholder="789..."
              className="w-full h-11 px-3 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-900/40" />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Quantidade <span className="text-rose-500">*</span>
              </span>
              <input type="number" step="0.0001" min="0" value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                className="w-full h-11 px-2 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-900/40" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Valor unit. (R$) <span className="text-rose-500">*</span>
              </span>
              <input type="number" step="0.01" min="0" value={valorUnit}
                onChange={e => setValorUnit(e.target.value)}
                className="w-full h-11 px-2 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-900/40" />
            </label>
          </div>

          {/* Subtotal preview */}
          <div className="rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/10 p-2.5 flex items-center justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">Subtotal</span>
            <span className="font-mono tabular-nums text-sm font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency((Number(quantidade) || 0) * (Number(valorUnit) || 0))}
            </span>
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-white/10 bg-gray-50/60 dark:bg-white/[0.02] flex items-center gap-2">
          <button onClick={onClose} disabled={salvando}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50">
            Cancelar
          </button>
          <div className="flex-1" />
          <button onClick={submit} disabled={!podeSalvar || salvando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-semibold hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
            Adicionar à nota
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Upload de 1 foto com preview. `capture="environment"` abre câmera traseira
// direto no mobile; desktop cai pro picker normal.
function UploadFoto({ label, obrigatorio, file, onChange }) {
  const inputRef = useRef(null);
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return (
    <div>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">
        {label} {obrigatorio && <span className="text-rose-500">*</span>}
      </span>
      <button type="button" onClick={() => inputRef.current?.click()}
        className={`w-full aspect-square rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors ${
          file
            ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/[0.06]'
            : 'border-gray-300 dark:border-white/15 bg-gray-50/50 dark:bg-white/[0.02] hover:border-amber-400 dark:hover:border-amber-500/40 hover:bg-amber-50/40 dark:hover:bg-amber-500/[0.06]'
        }`}>
        {previewUrl ? (
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400 dark:text-gray-500 p-2">
            <ImagePlus className="h-6 w-6" />
            <span className="text-[10px] text-center">Tocar para tirar foto / escolher</span>
          </div>
        )}
      </button>
      <input ref={inputRef} type="file" className="hidden"
        accept="image/*" capture="environment"
        onChange={e => onChange(e.target.files?.[0] || null)} />
      {file && (
        <button type="button" onClick={() => onChange(null)}
          className="mt-1 text-[10px] text-rose-600 dark:text-rose-400 hover:underline">
          Remover
        </button>
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

function ModalScanProduto({ cliente, origem = 'webposto', redeId, onClose, onAdicionar, onErro }) {
  const ehAutosystem = origem === 'autosystem';
  const sistemaLabel = ehAutosystem ? 'Autosystem' : 'Webposto';
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [produto, setProduto] = useState(null);  // produto encontrado
  const [resultados, setResultados] = useState([]); // múltiplos (busca por descrição)
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [valorUnit, setValorUnit] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [bonificacao, setBonificacao] = useState(false);
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

  // Seleciona um produto do resultado (auto quando 1 match, ou clique na lista).
  // Normaliza o valor sugerido a partir dos campos de cada fonte.
  const selecionarProduto = (p) => {
    setProduto(p);
    setResultados([]);
    setNaoEncontrado(false);
    const v = ehAutosystem
      ? (p.preco_custo ?? '')
      : (p.precoCusto ?? p.custoMedio ?? p.precoVenda ?? '');
    setValorUnit(v !== '' && v != null ? String(v) : '');
  };

  const buscar = async (codigoArg) => {
    const cb = String(codigoArg ?? codigo).trim();
    if (!cb) return;
    setBuscando(true);
    setProduto(null);
    setResultados([]);
    setNaoEncontrado(false);
    try {
      if (ehAutosystem) {
        if (!redeId) throw new Error('Rede Autosystem não configurada');
        // Código só de dígitos (>= 6) → busca por código de barras; caso
        // contrário busca por descrição/código (retorna lista pra escolher).
        const ehCodBarra = /^\d{6,}$/.test(cb);
        const lista = await autosystemService.buscarProdutoAutosystem(
          redeId, ehCodBarra ? { codigoBarra: cb } : { termo: cb },
        );
        if (!lista || lista.length === 0) setNaoEncontrado(true);
        else if (lista.length === 1) selecionarProduto(lista[0]);
        else setResultados(lista);
        return;
      }
      // Webposto: catálogo Quality por código de barras.
      if (!cliente?.chave_api_id) {
        onErro?.('Integração Webposto não configurada');
        return;
      }
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave?.chave) throw new Error('Chave API não encontrada');
      const p = await qualityApi.buscarProdutoPorCodigoBarras(chave.chave, cb);
      if (!p) setNaoEncontrado(true);
      else selecionarProduto(p);
    } catch (err) {
      onErro?.('Erro ao buscar: ' + (err.message || err));
    } finally { setBuscando(false); }
  };

  const confirmar = async () => {
    if (!produto && !naoEncontrado) return;
    await onAdicionar({
      codigo_barras: produto?.codigo_barra || codigo.trim(),
      codigo_interno: produto?.codigo != null ? String(produto.codigo) : '',
      descricao: produto?.nome || '',
      quantidade: Number(quantidade) || 1,
      valor_unitario: Number(valorUnit) || 0,
      bonificacao,
    });
  };

  const limparEResearch = () => {
    setProduto(null); setResultados([]); setNaoEncontrado(false); setCodigo(''); setValorUnit(''); setQuantidade('1'); setBonificacao(false);
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
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
              {ehAutosystem ? 'Código de barras ou descrição' : 'Código de barras'}
            </label>
            <form onSubmit={e => { e.preventDefault(); buscar(); }} className="flex gap-2">
              <input ref={inputRef} type="text" value={codigo}
                onChange={e => { setCodigo(e.target.value); setProduto(null); setResultados([]); setNaoEncontrado(false); }}
                placeholder={ehAutosystem ? 'Escaneie o código ou digite a descrição...' : 'Escaneie ou digite o código...'}
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
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando no catálogo {sistemaLabel}...
            </div>
          )}

          {/* Múltiplos resultados (busca por descrição) — escolher um */}
          {resultados.length > 1 && !produto && (
            <div className="mb-3 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
              <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                {resultados.length} produtos — escolha um
              </p>
              <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-white/10">
                {resultados.map((p) => (
                  <li key={p.grid ?? `${p.codigo}-${p.codigo_barra}`}>
                    <button type="button" onClick={() => selecionarProduto(p)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 transition-colors">
                      <p className="text-[12.5px] font-medium text-gray-900 dark:text-gray-100 truncate">{p.nome || '—'}</p>
                      <p className="text-[10.5px] text-gray-400 dark:text-gray-500 font-mono">
                        Cód {p.codigo ?? '—'}
                        {p.codigo_barra && <span> · {p.codigo_barra}</span>}
                        {p.preco_custo != null && <span> · custo {formatCurrency(p.preco_custo)}</span>}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {naoEncontrado && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 mb-3">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Produto não encontrado no catálogo</p>
              <p className="text-xs text-amber-700 dark:text-amber-300/80">
                O código <span className="font-mono">{codigo}</span> não está cadastrado no {sistemaLabel}.
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
            <>
              {/* Bonificação — informação para a CCI, NÃO altera o valor */}
              <label className={`flex items-center gap-2 h-10 px-3 rounded-lg border cursor-pointer mb-2 transition-colors ${
                bonificacao
                  ? 'border-pink-300 dark:border-pink-500/40 bg-pink-50 dark:bg-pink-500/10'
                  : 'border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800/50'
              }`}>
                <input type="checkbox" checked={bonificacao}
                  onChange={e => setBonificacao(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-400" />
                <span className={`text-sm font-medium ${bonificacao ? 'text-pink-800 dark:text-pink-300' : 'text-gray-700 dark:text-gray-300'}`}>
                  Produto em bonificação
                </span>
                <span className="text-[10.5px] text-gray-500 dark:text-gray-400 ml-auto">(CCI lança como bonificação)</span>
              </label>

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
            </>
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
