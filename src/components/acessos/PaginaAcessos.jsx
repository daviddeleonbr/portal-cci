// Acessos de adquirentes e outras plataformas — mesma tela para a CCI (todas as
// redes) e para o cliente (a própria rede; o RLS garante). Senhas ficam
// mascaradas e aparecem no "olho"; há botão de copiar em cada campo.
// Celular (<768px): cards em vez da tabela, com copiar/mostrar grandes (44px),
// categorias em botões deslizáveis, "Novo acesso" flutuante e o formulário
// em gaveta de baixo pra cima (Modal). Desktop: como antes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff, ExternalLink, KeyRound, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Modal from '../ui/Modal';
import { SelectBusca } from '../tarefas/CamposTarefas';
import * as acessosService from '../../services/acessosService';
import { useRedesClientes, redeDe } from '../../hooks/useRedesClientes';

const { CATEGORIAS_ACESSO } = acessosService;
const nomeCliente = (c) => c?.razao_social || c?.nome || '';
const chaveRede = (x) => `${x?.chave_api_id || ''}|${x?.as_rede_id || ''}`;
const rotCategoria = (k) => CATEGORIAS_ACESSO.find(c => c.k === k)?.rot || k;
const CAT_CLS = {
  adquirente: 'bg-teal-50 text-teal-700', banco: 'bg-blue-50 text-blue-700', sistema: 'bg-violet-50 text-violet-700',
  fornecedor: 'bg-amber-50 text-amber-700', governo: 'bg-slate-100 text-slate-700', outro: 'bg-gray-100 text-gray-600',
};
const fmtData = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const linkUrl = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

// `admin`: CCI (pode excluir). `clientes`: empresas que o usuário pode escolher.
// CCI: nada é buscado antes de escolher a rede (só vêm as senhas daquela rede);
// a empresa é um filtro opcional.
export default function PaginaAcessos({ admin = false, clientes, showToast }) {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(!admin);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [empresaF, setEmpresaF] = useState('');
  const [redeF, setRedeF] = useState(''); // só CCI (cliente já está numa rede)
  const [editando, setEditando] = useState(null); // objeto | 'novo' | null

  const faltaRede = admin && !redeF;
  const pedidoRef = useRef(0); // só a busca mais recente vale (troca de rede)
  const carregar = useCallback(async () => {
    const n = ++pedidoRef.current;
    if (faltaRede) { setLista([]); setCarregando(false); return; }
    setCarregando(true);
    try {
      const r = await acessosService.listarAcessos(admin ? { rede: redeF } : {});
      if (n === pedidoRef.current) setLista(r);
    } catch (e) { if (n === pedidoRef.current) showToast('error', 'Erro ao carregar acessos: ' + e.message); }
    finally { if (n === pedidoRef.current) setCarregando(false); }
  }, [showToast, admin, redeF, faltaRede]);
  useEffect(() => { carregar(); }, [carregar]);
  // Troca de rede: tira da tela os acessos da rede anterior na hora
  const trocarRede = (v) => { setRedeF(v); setEmpresaF(''); setLista([]); };

  const ordenados = useMemo(() => [...clientes].sort((a, b) => nomeCliente(a).localeCompare(nomeCliente(b))), [clientes]);
  const redes = useRedesClientes(clientes, admin);
  const empresasFiltro = useMemo(() => ordenados.filter(c => !redeF || redeDe(c) === redeF), [ordenados, redeF]);
  // rede → empresas (para mostrar "Toda a rede" com contexto)
  const empresasDaRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => { const k = chaveRede(c); m.set(k, [...(m.get(k) || []), nomeCliente(c)]); });
    return m;
  }, [clientes]);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const emp = clientes.find(c => c.id === empresaF);
    return lista.filter(a => {
      if (categoria && a.categoria !== categoria) return false;
      if (emp && !(a.cliente_id === emp.id || (!a.cliente_id && chaveRede(a) === chaveRede(emp)))) return false;
      if (!emp && redeF && redeDe(a) !== redeF) return false;
      if (q && !`${a.plataforma} ${a.login || ''} ${nomeCliente(a.cliente)} ${a.observacao || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lista, busca, categoria, empresaF, redeF, clientes]);

  const excluir = async (a) => {
    if (!confirm(`Excluir o acesso "${a.plataforma}"?`)) return;
    try { await acessosService.excluirAcesso(a.id); showToast('success', 'Acesso excluído'); carregar(); }
    catch (e) { showToast('error', e.message); }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {admin && (
          <div className="min-w-0 basis-full sm:basis-auto sm:w-60 sm:flex-none">
            <SelectBusca value={redeF} onChange={trocarRede} vazio="Selecione a rede…"
              placeholderBusca="Buscar rede…" vazioLista="Nenhuma rede encontrada." opcoes={redes} />
          </div>
        )}
        <div className="relative basis-full sm:min-w-[220px] sm:flex-1 sm:basis-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar plataforma, login…"
            aria-label="Buscar acessos" enterKeyHint="search"
            className="w-full h-12 sm:h-auto rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-11 sm:pr-3 text-base sm:text-sm outline-none focus:border-teal-500 [&::-webkit-search-cancel-button]:hidden" />
          {busca && (
            <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca"
              className="sm:hidden absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-md text-gray-500">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {!faltaRede && clientes.length > 1 && (
          <div className="min-w-0 basis-full sm:basis-auto sm:w-64 sm:flex-none">
            <SelectBusca value={empresaF} onChange={setEmpresaF} vazio={redeF ? 'Todas as empresas da rede' : 'Todas as empresas'}
              placeholderBusca="Buscar empresa…" vazioLista="Nenhuma empresa encontrada."
              opcoes={empresasFiltro.map(c => ({ value: c.id, label: nomeCliente(c) }))} />
          </div>
        )}
        <select value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoria"
          className="hidden sm:block min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2.5 text-sm text-gray-700 outline-none focus:border-teal-500 sm:flex-none">
          <option value="">Todas as categorias</option>
          {CATEGORIAS_ACESSO.map(c => <option key={c.k} value={c.k}>{c.rot}</option>)}
        </select>
        {/* Celular: categorias em botões deslizáveis (até a borda, param alinhados) */}
        <div role="radiogroup" aria-label="Categoria"
          className="sm:hidden -mx-4 flex basis-[calc(100%+2rem)] gap-1.5 overflow-x-auto px-4 pb-0.5 snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ k: '', rot: 'Todas' }, ...CATEGORIAS_ACESSO].map(c => {
            const on = categoria === c.k;
            return (
              <button key={c.k || 'todas'} type="button" role="radio" aria-checked={on} onClick={() => setCategoria(c.k)}
                className={`snap-start flex-shrink-0 whitespace-nowrap rounded-full border px-3.5 h-10 text-sm font-medium ${
                  on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'}`}>
                {c.rot}
              </button>
            );
          })}
        </div>
        <button onClick={() => setEditando('novo')}
          className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" /> Novo acesso
        </button>
      </div>

      {faltaRede ? (
        <div className="rounded-xl border border-gray-200/70 bg-white p-10 text-center">
          <KeyRound className="mx-auto mb-2 h-7 w-7 text-gray-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-900">Selecione a rede</p>
          <p className="mt-1 text-xs text-gray-600">Os acessos aparecem depois da seleção. A empresa é um filtro opcional.</p>
        </div>
      ) : carregando && lista.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
      ) : filtrada.length === 0 ? (
        <div className="rounded-xl border border-gray-200/70 bg-white p-10 text-center text-sm text-gray-600">
          <KeyRound className="mx-auto mb-2 h-7 w-7 text-gray-400" aria-hidden="true" />
          {lista.length === 0
            ? <><span className="hidden sm:inline">Nenhum acesso cadastrado — clique em “Novo acesso”.</span><span className="sm:hidden">Nenhum acesso cadastrado. Toque em <strong>Novo acesso</strong> para incluir o primeiro.</span></>
            : 'Nenhum acesso para esse filtro.'}
        </div>
      ) : (<>
        {/* CELULAR: um card por acesso */}
        <ul className="md:hidden space-y-3">
          {filtrada.map(a => {
            const rede = empresasDaRede.get(chaveRede(a)) || [];
            const nomeRede = admin ? redes.find(r => r.value === redeDe(a))?.label : null;
            return (
              <li key={a.id} className="rounded-xl border border-gray-200/80 bg-white shadow-sm">
                <div className="px-4 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[15px] font-semibold leading-snug text-gray-900">{a.plataforma}</p>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CAT_CLS[a.categoria] || CAT_CLS.outro}`}>{rotCategoria(a.categoria)}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-gray-600">
                    {a.cliente_id ? nomeCliente(a.cliente) : `Toda a rede${nomeRede ? ` · ${nomeRede}` : ''} · ${rede.length} empresa${rede.length !== 1 ? 's' : ''}`}
                  </p>
                  {a.observacao && <p className="mt-1.5 whitespace-pre-line text-[13px] text-gray-700">{a.observacao}</p>}
                </div>
                <dl className="mt-2 divide-y divide-gray-100 border-y border-gray-100">
                  <LinhaSegredo rotulo="Login" valor={a.login} />
                  <LinhaSegredo rotulo="Senha" valor={a.senha} oculto />
                  {a.contrassenha && <LinhaSegredo rotulo="Contrassenha" valor={a.contrassenha} oculto />}
                </dl>
                <div className="flex items-center gap-1 px-2 py-1.5">
                  {a.url && (
                    <a href={linkUrl(a.url)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-teal-700 active:bg-teal-50">
                      <ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir site
                    </a>
                  )}
                  <span className="flex-1" />
                  <button onClick={() => setEditando(a)} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-gray-700 active:bg-gray-100">
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
                  </button>
                  {admin && (
                    <button onClick={() => excluir(a)} aria-label={`Excluir ${a.plataforma}`} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-600 active:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {a.updated_at && (
                  <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
                    Atualizado em {fmtData(a.updated_at)}{a.atualizado_por_nome ? ` por ${a.atualizado_por_nome}` : ''}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <p className="md:hidden mt-2 px-1 text-xs text-gray-600">{filtrada.length} acesso(s)</p>

        {/* DESKTOP: tabela */}
        <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200/70 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-4 py-2.5">Plataforma</th>
                  <th className="px-3 py-2.5">Empresa</th>
                  <th className="px-3 py-2.5">Login</th>
                  <th className="px-3 py-2.5">Senha</th>
                  <th className="px-3 py-2.5">Contrassenha</th>
                  <th className="px-3 py-2.5">Atualizado</th>
                  <th className="w-20 px-3 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrada.map(a => {
                  const rede = empresasDaRede.get(chaveRede(a)) || [];
                  const nomeRede = admin ? redes.find(r => r.value === redeDe(a))?.label : null;
                  return (
                    <tr key={a.id} className="align-top hover:bg-gray-50/70">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{a.plataforma}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CAT_CLS[a.categoria] || CAT_CLS.outro}`}>{rotCategoria(a.categoria)}</span>
                        </div>
                        {a.url && (
                          <a href={linkUrl(a.url)} target="_blank" rel="noopener noreferrer" title={a.url}
                            className="mt-0.5 inline-flex max-w-[260px] items-center gap-1 text-[11.5px] text-teal-700 hover:underline">
                            <ExternalLink className="h-3 w-3 flex-shrink-0" /><span className="truncate">{a.url.replace(/^https?:\/\//, '')}</span>
                          </a>
                        )}
                        {a.observacao && <p className="mt-0.5 max-w-[300px] whitespace-pre-line text-[11.5px] text-gray-500">{a.observacao}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-[12.5px] text-gray-700">
                        {a.cliente_id ? nomeCliente(a.cliente) : (
                          <span title={rede.join(', ')}>
                            Toda a rede{nomeRede ? ` · ${nomeRede}` : ''}
                            <span className="block text-[11px] text-gray-400">{rede.length} empresa{rede.length !== 1 ? 's' : ''}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><CampoSegredo valor={a.login} /></td>
                      <td className="px-3 py-2.5"><CampoSegredo valor={a.senha} oculto /></td>
                      <td className="px-3 py-2.5"><CampoSegredo valor={a.contrassenha} oculto /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-gray-500">
                        {fmtData(a.updated_at)}
                        {a.atualizado_por_nome && <span className="block text-gray-400">{a.atualizado_por_nome}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          <button onClick={() => setEditando(a)} title="Editar" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-4 w-4" /></button>
                          {admin && <button onClick={() => excluir(a)} title="Excluir" className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">{filtrada.length} acesso(s)</div>
        </div>
      </>)}

      {/* Celular: "Novo acesso" flutuante, acima da barra inferior do portal */}
      <div className="sm:hidden h-20" aria-hidden="true" />
      <button type="button" onClick={() => setEditando('novo')}
        className="sm:hidden fixed right-4 z-20 bottom-[calc(5rem+env(safe-area-inset-bottom))] inline-flex h-14 items-center gap-2 rounded-full bg-blue-700 pl-5 pr-6 text-base font-semibold text-white shadow-lg shadow-gray-900/20 active:bg-blue-800">
        <Plus className="h-5 w-5" aria-hidden="true" /> Novo acesso
      </button>

      {editando && (
        <AcessoModal acesso={editando === 'novo' ? null : editando} clientes={ordenados} redes={redes}
          empresaInicial={empresaF || (redeF && empresasFiltro.length === 1 ? empresasFiltro[0].id : '')}
          redeInicial={redeF || redeDe(clientes.find(c => c.id === empresaF))}
          onClose={() => setEditando(null)} showToast={showToast}
          onSalvo={(redeSalva) => { setEditando(null); if (faltaRede && redeSalva) trocarRede(redeSalva); else carregar(); }} />
      )}
    </div>
  );
}

// Linha do card (celular): rótulo + valor grande, mostrar (senhas) e copiar
// com área de toque de 44px; "Copiado" confirma o toque.
function LinhaSegredo({ rotulo, valor, oculto = false }) {
  const [ver, setVer] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }
    catch { /* sem permissão de área de transferência */ }
  };
  return (
    <div className="flex items-center gap-1 pl-4 pr-1.5 py-1.5">
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">{rotulo}</dt>
        <dd className="truncate font-mono text-[15px] text-gray-900">
          {!valor ? <span className="font-sans text-gray-400">—</span> : oculto && !ver ? '••••••••' : valor}
        </dd>
      </div>
      {valor && oculto && (
        <button type="button" onClick={() => setVer(v => !v)} aria-pressed={ver} aria-label={`${ver ? 'Ocultar' : 'Mostrar'} ${rotulo.toLowerCase()}`}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-gray-600 active:bg-gray-100">
          {ver ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      )}
      {valor && (
        <button type="button" onClick={copiar} aria-label={`Copiar ${rotulo.toLowerCase()}`}
          className={`flex h-11 flex-shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold ${copiado ? 'text-emerald-700' : 'text-gray-700 active:bg-gray-100'}`}>
          {copiado ? <><Check className="h-5 w-5" aria-hidden="true" /> Copiado</> : <><Copy className="h-5 w-5" aria-hidden="true" /> Copiar</>}
        </button>
      )}
    </div>
  );
}

// Célula da tabela: valor com copiar e (para senhas) mostrar/ocultar.
function CampoSegredo({ valor, oculto = false }) {
  const [ver, setVer] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }
    catch { /* sem permissão de área de transferência */ }
  };
  return (
    <div className="flex max-w-[240px] items-center gap-1">
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-gray-800" title={oculto ? undefined : valor || undefined}>
        {!valor ? <span className="font-sans text-gray-300">—</span> : oculto && !ver ? '••••••••' : valor}
      </span>
      {valor && oculto && (
        <button type="button" onClick={() => setVer(v => !v)} title={ver ? 'Ocultar' : 'Mostrar'} className="rounded p-1 text-gray-400 hover:text-gray-700">
          {ver ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
      {valor && (
        <button type="button" onClick={copiar} title="Copiar" className="rounded p-1 text-gray-400 hover:text-gray-700">
          {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

const inp = 'w-full h-12 sm:h-auto rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base sm:text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const lbl = 'mb-1 block text-xs font-medium text-gray-600';

// "Toda a rede": a CCI escolhe a rede; o cliente usa a própria (todas as suas
// empresas são da mesma rede).
function AcessoModal({ acesso, clientes, redes, empresaInicial, redeInicial, onClose, onSalvo, showToast }) {
  const unicaRede = new Set(clientes.map(redeDe)).size <= 1;
  const [empresa, setEmpresa] = useState(acesso?.cliente_id || empresaInicial || (clientes.length === 1 ? clientes[0].id : ''));
  const [rede, setRede] = useState(acesso && !acesso.cliente_id ? redeDe(acesso) : (redeInicial || (unicaRede ? redeDe(clientes[0]) : '')));
  const [toda, setToda] = useState(!!acesso && !acesso.cliente_id);
  const [f, setF] = useState({
    plataforma: acesso?.plataforma || '', categoria: acesso?.categoria || 'adquirente', url: acesso?.url || '',
    login: acesso?.login || '', senha: acesso?.senha || '', contrassenha: acesso?.contrassenha || '', observacao: acesso?.observacao || '',
  });
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (p) => setF(x => ({ ...x, ...p }));

  async function salvar(e) {
    e.preventDefault(); setErro(null);
    if (f.plataforma.trim().length < 2) return setErro('Informe a plataforma.');
    const emp = clientes.find(c => c.id === empresa);
    if (toda && !rede) return setErro('Escolha a rede.');
    if (!toda && !emp) return setErro('Escolha a empresa.');
    setSalvando(true);
    try {
      await acessosService.salvarAcesso({
        id: acesso?.id, ...f,
        ...(toda
          ? { cliente_id: null, chave_api_id: rede.startsWith('w:') ? rede.slice(2) : null, as_rede_id: rede.startsWith('a:') ? rede.slice(2) : null }
          : { cliente_id: emp.id }),
      });
      showToast('success', acesso ? 'Acesso atualizado' : 'Acesso cadastrado');
      onSalvo(toda ? rede : redeDe(emp));
    } catch (ex) { setErro(ex.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal open onClose={onClose} size="lg"
      title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-teal-500" /> {acesso ? 'Editar acesso' : 'Novo acesso'}</span>}
      footer={(
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          {erro && <span className="order-first sm:order-none sm:mr-auto text-[13px] sm:text-[12px] text-red-600" role="alert">{erro}</span>}
          <button type="button" onClick={onClose} className="h-11 sm:h-auto rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="submit" form="form-acesso" disabled={salvando}
            className="inline-flex h-12 sm:h-auto items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-base sm:text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </div>
      )}>
      <form id="form-acesso" onSubmit={salvar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div><label className={lbl}>Plataforma</label>
            <input value={f.plataforma} onChange={e => set({ plataforma: e.target.value })} placeholder="Ex.: Cielo, Rede, Stone, Getnet…" className={inp} autoFocus={!acesso} enterKeyHint="next" /></div>
          <div><label className={lbl}>Categoria</label>
            <select value={f.categoria} onChange={e => set({ categoria: e.target.value })} className={inp}>
              {CATEGORIAS_ACESSO.map(c => <option key={c.k} value={c.k}>{c.rot}</option>)}
            </select></div>
        </div>
        <div>
          <label className={lbl}>Vale para</label>
          <div className="mb-2 flex gap-1.5">
            {[[false, 'Uma empresa'], [true, 'Toda a rede']].map(([v, l]) => (
              <button type="button" key={l} onClick={() => setToda(v)} aria-pressed={toda === v}
                className={`flex-1 sm:flex-none h-10 sm:h-auto rounded-md border px-2.5 py-1.5 text-sm sm:text-[12px] font-medium ${toda === v ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
            ))}
          </div>
          {!toda ? (
            <SelectBusca value={empresa} onChange={setEmpresa} vazio="Selecione a empresa…" placeholderBusca="Buscar empresa…"
              vazioLista="Nenhuma empresa encontrada." opcoes={clientes.map(c => ({ value: c.id, label: nomeCliente(c) }))} />
          ) : unicaRede ? (
            <p className="text-[11px] text-gray-400">O acesso aparece para todas as empresas da rede.</p>
          ) : (
            <>
              <SelectBusca value={rede} onChange={setRede} vazio="Selecione a rede…" placeholderBusca="Buscar rede…"
                vazioLista="Nenhuma rede encontrada." opcoes={redes} />
              <p className="mt-1 text-[11px] text-gray-400">O acesso aparece para todas as empresas desta rede.</p>
            </>
          )}
        </div>
        <div><label className={lbl}>Site / link de acesso (opcional)</label>
          <input inputMode="url" autoCapitalize="none" autoCorrect="off" value={f.url} onChange={e => set({ url: e.target.value })} placeholder="Ex.: www.cielo.com.br" className={inp} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label className={lbl}>Login</label>
            <input value={f.login} onChange={e => set({ login: e.target.value })} className={inp} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
          <div><label className={lbl}>Senha</label>
            <div className="relative">
              <input type={verSenha ? 'text' : 'password'} value={f.senha} onChange={e => set({ senha: e.target.value })} className={`${inp} pr-11`} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" />
              <button type="button" onClick={() => setVerSenha(v => !v)} aria-label={verSenha ? 'Ocultar senhas' : 'Mostrar senhas'} aria-pressed={verSenha}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:text-gray-700">
                {verSenha ? <EyeOff className="h-5 w-5 sm:h-4 sm:w-4" /> : <Eye className="h-5 w-5 sm:h-4 sm:w-4" />}
              </button>
            </div></div>
          <div><label className={lbl}>Contrassenha (se houver)</label>
            <input type={verSenha ? 'text' : 'password'} value={f.contrassenha} onChange={e => set({ contrassenha: e.target.value })} className={inp} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" /></div>
        </div>
        <div><label className={lbl}>Observação (opcional)</label>
          <textarea rows={2} value={f.observacao} onChange={e => set({ observacao: e.target.value })} placeholder="Ex.: estabelecimento 1234567, acesso do gerente" className={`${inp} !h-auto`} /></div>
      </form>
    </Modal>
  );
}
