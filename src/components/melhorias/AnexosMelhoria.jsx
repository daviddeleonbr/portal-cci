// Bloco de anexos de uma solicitação de melhoria/falha.
// Suporta 3 formas de adicionar arquivo:
//   1. Botão "Adicionar arquivo" abrindo o file picker nativo
//   2. Arrastar e soltar arquivos sobre a área
//   3. Colar (Ctrl+V) imagens/arquivos do clipboard enquanto a área
//      está visível (útil pra prints)
// Aceita qualquer tipo até 5MB, máximo 3 por solicitação.
//
// Props:
//   melhoriaId — uuid da solicitação
//   autor      — { id, nome } do usuário logado
//   autorTipo  — 'cliente' | 'admin'
//   showToast  — função pra notificações
//   onChange   — callback chamado após upload/exclusão (atualiza pai)

import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Loader2, Trash2, Download, FileText, Image as ImageIcon, X, Upload } from 'lucide-react';
import * as melhoriasService from '../../services/melhoriasService';

// Hook compartilhado: registra paste no document. Só captura quando o
// clipboard tem arquivos (texto colado em inputs/textareas segue normal).
function usePasteFiles(onFiles, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e) => {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      // Só intercepta se o foco NÃO está em input/textarea editável
      // — assim o user pode colar texto em campos normalmente.
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const editavel = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
      if (editavel) {
        // No campo de texto, só intercepta se a imagem é o único conteúdo
        const temTexto = (e.clipboardData?.getData('text') || '').length > 0;
        if (temTexto) return;
      }
      e.preventDefault();
      onFiles(files);
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [onFiles, enabled]);
}

// Hook compartilhado: gerencia estado de drag-over.
function useDropZone(onFiles) {
  const [dragOver, setDragOver] = useState(false);
  const onDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.types?.includes('Files')) setDragOver(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) onFiles(files);
  };
  return { dragOver, dropProps: { onDragOver, onDragLeave, onDrop } };
}

export default function AnexosMelhoria({ melhoriaId, autor, autorTipo, showToast, onChange }) {
  const [anexos, setAnexos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef(null);

  const carregar = useCallback(async () => {
    if (!melhoriaId) return;
    try {
      setLoading(true);
      setAnexos(await melhoriasService.listarAnexos(melhoriaId));
    } catch (err) {
      showToast?.('error', 'Erro ao carregar anexos: ' + err.message);
    } finally { setLoading(false); }
  }, [melhoriaId, showToast]);

  useEffect(() => { carregar(); }, [carregar]);

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    const disponivel = melhoriasService.MAX_ANEXOS_POR_MELHORIA - anexos.length;
    if (disponivel <= 0) {
      showToast?.('error', `Máximo de ${melhoriasService.MAX_ANEXOS_POR_MELHORIA} anexos.`);
      return;
    }
    const lista = Array.from(files).slice(0, disponivel);

    setEnviando(true);
    try {
      for (const file of lista) {
        await melhoriasService.uploadAnexo({ melhoriaId, file, autor, autorTipo });
      }
      showToast?.('success', `${lista.length} arquivo(s) anexado(s)`);
      await carregar();
      onChange?.();
    } catch (err) {
      showToast?.('error', err.message);
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [anexos.length, melhoriaId, autor, autorTipo, showToast, carregar, onChange]);

  const cheio = anexos.length >= melhoriasService.MAX_ANEXOS_POR_MELHORIA;
  const { dragOver, dropProps } = useDropZone(handleFiles);
  usePasteFiles(handleFiles, !cheio && !!melhoriaId);

  const remover = async (anexo) => {
    if (!confirm(`Remover "${anexo.nome_original}"?`)) return;
    try {
      await melhoriasService.excluirAnexo(anexo);
      showToast?.('success', 'Anexo removido');
      await carregar();
      onChange?.();
    } catch (err) {
      showToast?.('error', err.message);
    }
  };

  const baixar = async (anexo) => {
    try {
      const url = await melhoriasService.obterUrlAnexo(anexo.storage_path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showToast?.('error', err.message);
    }
  };

  return (
    <div
      {...dropProps}
      className={`rounded-lg border p-3 transition-colors ${
        dragOver
          ? 'border-blue-400 border-dashed bg-blue-50/50 ring-2 ring-blue-100'
          : 'border-gray-200 bg-gray-50/50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
          <Paperclip className="h-3 w-3" /> Anexos
          <span className="text-gray-400 font-normal normal-case tracking-normal">
            ({anexos.length}/{melhoriasService.MAX_ANEXOS_POR_MELHORIA})
          </span>
        </h4>
        {!cheio && (
          <>
            <input ref={inputRef} type="file" multiple onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
              accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,.csv,.txt" />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={enviando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-2.5 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
              Adicionar arquivo
            </button>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-[11px] text-gray-400 py-1">Carregando…</p>
      ) : anexos.length === 0 ? (
        <p className="text-[11px] text-gray-400 py-1 flex items-center gap-1.5">
          <Upload className="h-3 w-3" />
          Arraste arquivos aqui, cole (Ctrl+V) uma imagem, ou clique em "Adicionar arquivo". Até 5MB, máximo {melhoriasService.MAX_ANEXOS_POR_MELHORIA}.
        </p>
      ) : (
        <ul className="space-y-1">
          {anexos.map(a => {
            const isImagem = (a.tipo_mime || '').startsWith('image/');
            const Icon = isImagem ? ImageIcon : FileText;
            const podeRemover = autor && a.autor_id === autor.id;
            return (
              <li key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-gray-100 hover:border-gray-200">
                <Icon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <button type="button" onClick={() => baixar(a)}
                  className="flex-1 min-w-0 text-left">
                  <p className="text-[12.5px] text-gray-800 truncate hover:text-blue-700">{a.nome_original}</p>
                  <p className="text-[10.5px] text-gray-400">
                    {melhoriasService.formatarTamanho(a.tamanho_bytes)}
                    {a.autor_nome && <> · {a.autor_nome}</>}
                  </p>
                </button>
                <button type="button" onClick={() => baixar(a)} title="Baixar"
                  className="rounded-md p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                  <Download className="h-3.5 w-3.5" />
                </button>
                {podeRemover && (
                  <button type="button" onClick={() => remover(a)} title="Remover"
                    className="rounded-md p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dragOver && (
        <p className="mt-2 text-center text-[12px] font-medium text-blue-700">
          Solte os arquivos pra anexar
        </p>
      )}
    </div>
  );
}

// Versão pré-criação: o usuário escolhe arquivos ANTES da solicitação
// existir. Mantém-os em memória; o caller (ModalNovaSolicitacao) chama
// `uploadAnexo` pra cada um depois que a melhoria for criada.
// Suporta os mesmos 3 caminhos de entrada: botão, drop, paste.
export function SeletorAnexosPreUpload({ arquivos, setArquivos, showToast }) {
  const inputRef = useRef(null);

  const adicionar = useCallback((files) => {
    if (!files) return;
    const disponivel = melhoriasService.MAX_ANEXOS_POR_MELHORIA - arquivos.length;
    if (disponivel <= 0) {
      showToast?.('error', `Máximo de ${melhoriasService.MAX_ANEXOS_POR_MELHORIA} anexos.`);
      return;
    }
    const novos = [];
    for (const file of Array.from(files).slice(0, disponivel)) {
      if (file.size > melhoriasService.MAX_ANEXO_BYTES) {
        showToast?.('error', `"${file.name}" passa de 5MB e foi ignorado.`);
        continue;
      }
      novos.push(file);
    }
    setArquivos([...arquivos, ...novos]);
    if (inputRef.current) inputRef.current.value = '';
  }, [arquivos, setArquivos, showToast]);

  const remover = (idx) => setArquivos(arquivos.filter((_, i) => i !== idx));

  const cheio = arquivos.length >= melhoriasService.MAX_ANEXOS_POR_MELHORIA;
  const { dragOver, dropProps } = useDropZone(adicionar);
  usePasteFiles(adicionar, !cheio);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
          <Paperclip className="h-3 w-3" /> Anexos
          <span className="text-gray-400 font-normal normal-case tracking-normal">
            ({arquivos.length}/{melhoriasService.MAX_ANEXOS_POR_MELHORIA})
          </span>
        </label>
      </div>

      <input ref={inputRef} type="file" multiple onChange={(e) => adicionar(e.target.files)}
        className="hidden"
        accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,.csv,.txt" />

      {!cheio && (
        <button type="button" onClick={() => inputRef.current?.click()}
          {...dropProps}
          className={`w-full rounded-lg border border-dashed px-3 py-4 text-[12px] transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-100'
              : 'border-gray-300 text-gray-500 hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-700'
          }`}>
          <Upload className="inline h-4 w-4 mr-1.5" />
          {dragOver
            ? 'Solte os arquivos pra anexar'
            : <>Clique pra escolher, <strong>arraste</strong> arquivos aqui ou <strong>cole (Ctrl+V)</strong> uma imagem — até 5MB</>}
        </button>
      )}

      {arquivos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {arquivos.map((f, idx) => {
            const isImagem = f.type?.startsWith('image/');
            const Icon = isImagem ? ImageIcon : FileText;
            return (
              <li key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                <Icon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] text-gray-800 truncate">{f.name}</p>
                  <p className="text-[10.5px] text-gray-400">{melhoriasService.formatarTamanho(f.size)}</p>
                </div>
                <button type="button" onClick={() => remover(idx)} title="Remover"
                  className="rounded-md p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
