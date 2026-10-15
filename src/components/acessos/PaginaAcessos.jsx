// Acessos de adquirentes e outras plataformas — mesma tela para a CCI (todas as
// redes) e para o cliente (a própria rede; o RLS garante). Senhas ficam
// mascaradas e aparecem no "olho"; há botão de copiar em cada campo.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Eye, EyeOff, ExternalLink, KeyRound, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
export default function PaginaAcessos({ admin = false, clientes, showToast }) {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [empresaF, setEmpresaF] = useState('');
  const [redeF, setRedeF] = useState(''); // só CCI (cliente já está numa rede)
  const [editando, setEditando] = useState(null); // objeto | 'novo' | null

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setLista(await acessosService.listarAcessos()); }
    catch (e) { showToast('error', 'Erro ao carregar acessos: ' + e.message); }
    finally { setCarregando(false); }
  }, [showToast]);
  useEffect(() => { carregar(); }, [carregar]);

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
        <div className="relative basis-full sm:min-w-[220px] sm:flex-1 sm:basis-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar plataforma, login…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500" />
        </div>
        {admin && redes.length > 1 && (
          <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
            <SelectBusca value={redeF} onChange={v => { setRedeF(v); setEmpresaF(''); }} vazio="Todas as redes"
              placeholderBusca="Buscar rede…" vazioLista="Nenhuma rede encontrada." opcoes={redes} />
          </div>
        )}
        {clientes.length > 1 && (
          <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
            <SelectBusca value={empresaF} onChange={setEmpresaF} vazio={redeF ? 'Todas as empresas da rede' : 'Todas as empresas'}
              placeholderBusca="Buscar empresa…" vazioLista="Nenhuma empresa encontrada."
              opcoes={empresasFiltro.map(c => ({ value: c.id, label: nomeCliente(c) }))} />
          </div>
        )}
        <select value={categoria} onChange={e => setCategoria(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2.5 text-sm text-gray-700 outline-none focus:border-teal-500 sm:flex-none">
          <option value="">Todas as categorias</option>
          {CATEGORIAS_ACESSO.map(c => <option key={c.k} value={c.k}>{c.rot}</option>)}
        </select>
        <button onClick={() => setEditando('novo')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" /> Novo acesso
        </button>
      </div>

      {carregando && lista.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
      ) : filtrada.length === 0 ? (
        <div className="rounded-xl border border-gray-200/70 bg-white p-10 text-center text-sm text-gray-400">
          <KeyRound className="mx-auto mb-2 h-7 w-7 text-gray-300" />
          {lista.length === 0 ? 'Nenhum acesso cadastrado — clique em “Novo acesso”.' : 'Nenhum acesso para esse filtro.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrada.map(a => {
            const rede = empresasDaRede.get(chaveRede(a)) || [];
            return (
              <div key={a.id} className="flex flex-col rounded-xl border border-gray-200/70 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-gray-900" title={a.plataforma}>{a.plataforma}</span>
                      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${CAT_CLS[a.categoria] || CAT_CLS.outro}`}>{rotCategoria(a.categoria)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-gray-500" title={a.cliente_id ? nomeCliente(a.cliente) : rede.join(', ')}>
                      {a.cliente_id ? nomeCliente(a.cliente) : `Toda a rede${rede.length ? ` · ${rede.length} empresa${rede.length > 1 ? 's' : ''}` : ''}`}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-0.5">
                    <button onClick={() => setEditando(a)} title="Editar" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-4 w-4" /></button>
                    {admin && <button onClick={() => excluir(a)} title="Excluir" className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
                {a.url && (
                  <a href={linkUrl(a.url)} target="_blank" rel="noopener noreferrer"
                    className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate text-[12px] text-teal-700 hover:underline">
                    <ExternalLink className="h-3 w-3 flex-shrink-0" /><span className="truncate">{a.url}</span>
                  </a>
                )}
                <div className="mt-3 space-y-1.5">
                  <CampoSegredo rot="Login" valor={a.login} />
                  <CampoSegredo rot="Senha" valor={a.senha} oculto />
                  {a.contrassenha && <CampoSegredo rot="Contrassenha" valor={a.contrassenha} oculto />}
                </div>
                {a.observacao && <p className="mt-2 whitespace-pre-line text-[12px] text-gray-500">{a.observacao}</p>}
                <p className="mt-auto pt-3 text-[10.5px] text-gray-400">
                  Atualizado {a.atualizado_por_nome ? `por ${a.atualizado_por_nome} ` : ''}em {fmtData(a.updated_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {editando && (
        <AcessoModal acesso={editando === 'novo' ? null : editando} clientes={ordenados} redes={redes}
          empresaInicial={empresaF || (redeF && empresasFiltro.length === 1 ? empresasFiltro[0].id : '')}
          redeInicial={redeF || redeDe(clientes.find(c => c.id === empresaF))}
          onClose={() => setEditando(null)} showToast={showToast}
          onSalvo={() => { setEditando(null); carregar(); }} />
      )}
    </div>
  );
}

// Valor com copiar e (para senhas) mostrar/ocultar.
function CampoSegredo({ rot, valor, oculto = false }) {
  const [ver, setVer] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }
    catch { /* sem permissão de área de transferência */ }
  };
  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
      <span className="w-[5.5rem] flex-shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{rot}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-gray-800">
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

const inp = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const lbl = 'mb-1 block text-xs font-medium text-gray-500';

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
      onSalvo();
    } catch (ex) { setErro(ex.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal open onClose={onClose} size="lg"
      title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-teal-500" /> {acesso ? 'Editar acesso' : 'Novo acesso'}</span>}
      footer={(
        <div className="flex items-center justify-end gap-2">
          {erro && <span className="mr-auto text-[12px] text-red-600">{erro}</span>}
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
          <button type="submit" form="form-acesso" disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </div>
      )}>
      <form id="form-acesso" onSubmit={salvar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div><label className={lbl}>Plataforma</label>
            <input value={f.plataforma} onChange={e => set({ plataforma: e.target.value })} placeholder="Ex.: Cielo, Rede, Stone, Getnet…" className={inp} autoFocus /></div>
          <div><label className={lbl}>Categoria</label>
            <select value={f.categoria} onChange={e => set({ categoria: e.target.value })} className={inp}>
              {CATEGORIAS_ACESSO.map(c => <option key={c.k} value={c.k}>{c.rot}</option>)}
            </select></div>
        </div>
        <div>
          <label className={lbl}>Vale para</label>
          <div className="mb-2 flex gap-1.5">
            {[[false, 'Uma empresa'], [true, 'Toda a rede']].map(([v, l]) => (
              <button type="button" key={l} onClick={() => setToda(v)}
                className={`rounded-md border px-2.5 py-1.5 text-[12px] font-medium ${toda === v ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
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
          <input value={f.url} onChange={e => set({ url: e.target.value })} placeholder="Ex.: www.cielo.com.br" className={inp} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label className={lbl}>Login</label>
            <input value={f.login} onChange={e => set({ login: e.target.value })} className={inp} autoComplete="off" /></div>
          <div><label className={lbl}>Senha</label>
            <div className="relative">
              <input type={verSenha ? 'text' : 'password'} value={f.senha} onChange={e => set({ senha: e.target.value })} className={`${inp} pr-9`} autoComplete="new-password" />
              <button type="button" onClick={() => setVerSenha(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700">
                {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div></div>
          <div><label className={lbl}>Contrassenha (se houver)</label>
            <input type={verSenha ? 'text' : 'password'} value={f.contrassenha} onChange={e => set({ contrassenha: e.target.value })} className={inp} autoComplete="new-password" /></div>
        </div>
        <div><label className={lbl}>Observação (opcional)</label>
          <textarea rows={2} value={f.observacao} onChange={e => set({ observacao: e.target.value })} placeholder="Ex.: estabelecimento 1234567, acesso do gerente" className={inp} /></div>
      </form>
    </Modal>
  );
}
