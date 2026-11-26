import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Check, Trash2, Wand2 } from 'lucide-react';
import PainelLateral from '../ui/PainelLateral';
import EditorPermissoes from './EditorPermissoes';
import * as perfisService from '../../services/perfisPermissaoService';
import { PERMISSOES_ADMIN, PERMISSOES_CLIENTE } from '../../services/usuariosSistemaService';

// Modelos de permissão (migration 235), editados pela CCI (N2/N3). Um modelo
// só pré-marca a tela do usuário; não concede nada sozinho.
export default function ModelosPermissao({ open, onClose, onAlterado }) {
  const [tipo, setTipo] = useState('cliente');
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [sel, setSel] = useState(null);       // id | 'novo'
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);       // { tipo:'ok'|'erro', texto }
  const [excluindo, setExcluindo] = useState(false);

  const catalogo = tipo === 'cliente' ? PERMISSOES_CLIENTE : PERMISSOES_ADMIN;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setLista(await perfisService.listarPerfis(null, { incluirInativos: true })); }
    catch (e) { setMsg({ tipo: 'erro', texto: e.message }); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { if (open) { carregar(); setSel(null); setForm(null); setMsg(null); } }, [open, carregar]);

  const doTipo = useMemo(() => lista.filter(p => p.tipo === tipo), [lista, tipo]);
  const abrir = (p) => { setSel(p.id); setForm({ ...p }); setMsg(null); setExcluindo(false); };
  const novo = () => { setSel('novo'); setForm({ tipo, nome: '', descricao: '', permissoes: [], ordem: (doTipo.at(-1)?.ordem || 0) + 10, ativo: true }); setMsg(null); setExcluindo(false); };

  const salvar = async () => {
    if (!form?.nome?.trim()) { setMsg({ tipo: 'erro', texto: 'Dê um nome ao modelo.' }); return; }
    setSalvando(true); setMsg(null);
    try {
      const salvo = sel === 'novo' ? await perfisService.criarPerfil(form) : await perfisService.atualizarPerfil(sel, form);
      await carregar(); setSel(salvo.id); setForm({ ...salvo });
      setMsg({ tipo: 'ok', texto: 'Modelo salvo.' }); onAlterado?.();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: /unique|duplicate/i.test(e.message) ? 'Já existe um modelo com esse nome.' : e.message });
    } finally { setSalvando(false); }
  };
  const excluir = async () => {
    setSalvando(true);
    try { await perfisService.excluirPerfil(sel); await carregar(); setSel(null); setForm(null); setMsg({ tipo: 'ok', texto: 'Modelo excluído.' }); onAlterado?.(); }
    catch (e) { setMsg({ tipo: 'erro', texto: e.message }); }
    finally { setSalvando(false); setExcluindo(false); }
  };

  const campo = 'h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-[12.5px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-gray-100';

  return (
    <PainelLateral open={open} onClose={onClose} largura="max-w-3xl"
      cabecalho={(
        <div>
          <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Modelos de permissão</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Atalhos que pré-marcam as permissões de um usuário. Não concedem nada sozinhos.</p>
        </div>
      )}
      rodape={form && (
        <div className="flex items-center gap-2">
          {msg && <p className={`mr-auto text-[11.5px] ${msg.tipo === 'erro' ? 'text-rose-600' : 'text-emerald-600'}`}>{msg.texto}</p>}
          {!msg && <span className="mr-auto" />}
          {sel !== 'novo' && (excluindo ? (
            <>
              <span className="text-[11.5px] text-gray-600 dark:text-gray-300">Excluir “{form.nome}”?</span>
              <button type="button" onClick={() => setExcluindo(false)} className="h-8 rounded-md px-3 text-[12px] text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/5">Não</button>
              <button type="button" onClick={excluir} disabled={salvando} className="h-8 rounded-md bg-rose-600 px-3 text-[12px] font-medium text-white hover:bg-rose-700">Excluir</button>
            </>
          ) : (
            <button type="button" onClick={() => setExcluindo(true)} className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[12px] text-gray-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          ))}
          {!excluindo && (
            <button type="button" onClick={salvar} disabled={salvando}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar modelo
            </button>
          )}
        </div>
      )}>
      <div className="grid min-h-full grid-cols-1 sm:grid-cols-[220px_1fr]">
        {/* Lista */}
        <aside className="border-b border-gray-100 p-3 sm:border-b-0 sm:border-r dark:border-white/10">
          <div className="mb-2 flex rounded-md bg-gray-100 p-0.5 text-[12px] dark:bg-white/5">
            {[['cliente', 'Cliente'], ['admin', 'Admin CCI']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => { setTipo(v); setSel(null); setForm(null); }}
                className={`flex-1 rounded py-1 ${tipo === v ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-slate-800 dark:text-gray-100' : 'text-gray-500'}`}>{l}</button>
            ))}
          </div>
          {carregando && <p className="flex items-center gap-1.5 px-1 py-2 text-[11.5px] text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> Carregando…</p>}
          <ul className="space-y-0.5">
            {doTipo.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => abrir(p)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] ${sel === p.id ? 'bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5'}`}>
                  <Wand2 className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                  <span className={`flex-1 truncate ${p.ativo ? '' : 'line-through opacity-60'}`}>{p.nome}</span>
                  <span className="text-[10.5px] tabular-nums text-gray-400">{(p.permissoes || []).length}</span>
                </button>
              </li>
            ))}
            {!carregando && doTipo.length === 0 && <li className="px-2 py-2 text-[11.5px] text-gray-400">Nenhum modelo.</li>}
          </ul>
          <button type="button" onClick={novo}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 py-1.5 text-[12px] text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-white/15 dark:text-gray-300">
            <Plus className="h-3.5 w-3.5" /> Novo modelo
          </button>
        </aside>

        {/* Edição */}
        <div className="px-4 py-3 sm:px-5">
          {!form ? (
            <p className="py-10 text-center text-[12px] text-gray-400">Escolha um modelo à esquerda ou crie um novo.</p>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">Nome</label>
                  <input className={campo} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex.: Gerente" />
                </div>
                <label className="flex items-end gap-1.5 pb-1.5 text-[12px] text-gray-600 dark:text-gray-300">
                  <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600" />
                  Disponível
                </label>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">Descrição</label>
                  <input className={campo} value={form.descricao || ''} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Para quem serve este modelo" />
                </div>
              </div>
              <EditorPermissoes catalogo={catalogo} tipo={tipo} value={form.permissoes || []}
                onChange={(arr) => setForm(f => ({ ...f, permissoes: arr }))} />
            </>
          )}
        </div>
      </div>
    </PainelLateral>
  );
}
