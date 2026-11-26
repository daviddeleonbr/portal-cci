import { useEffect, useMemo, useState } from 'react';
import { Loader2, Check, Lock, Building2, ShieldCheck, Shield, ListChecks, UserRound, Eye, EyeOff, AlertTriangle, Search } from 'lucide-react';
import PainelLateral from '../ui/PainelLateral';
import EditorPermissoes from './EditorPermissoes';
import { diffPermissoes, organizarCatalogo, rotuloPermissao } from '../../utils/permissoesCatalogo';
import { NIVEIS_ADMIN } from '../../services/usuariosSistemaService';

// Painel de acessos de um usuário — o MESMO para o admin da CCI e para o
// gerente da rede (o que muda é o que cada um pode conceder, via props;
// a validação real é no banco, migration 234).
//   usuario     : registro atual (null = novo; só com comDados)
//   tipoAlvo    : 'cliente' | 'admin'
//   catalogo    : permissões exibíveis · concedivel: Set | null (null = todas)
//   empresas    : empresas da rede do usuário [{ id, nome, cnpj }]
//   soSelecionadas : quem edita é restrito → não pode dar "todas as empresas"
//   comDados    : mostra a aba Dados (nome, e-mail, senha, status)
//   nivel       : { pode: boolean } → aba Nível (admin)
//   contexto    : texto curto do vínculo (ex.: nome da rede)
//   onSave(patch) : async; lança erro p/ manter o painel aberto
export default function PainelAcessosUsuario({
  open, onClose, usuario, tipoAlvo = 'cliente', tipoCliente, catalogo, concedivel = null, perfis = [],
  empresas = [], soSelecionadas = false, comDados = false, nivel = null, contexto = '', onSave,
}) {
  const novo = !usuario?.id;
  const inicial = useMemo(() => ({
    nome: usuario?.nome || '', email: usuario?.email || '', senha: '', status: usuario?.status || 'ativo',
    permissoes: usuario?.permissoes || (novo ? ['dashboard'].filter(k => !concedivel || concedivel.has(k)) : []),
    empresas_permitidas: usuario?.empresas_permitidas?.length ? usuario.empresas_permitidas
      : (novo && soSelecionadas ? empresas.map(e => e.id) : null),
    nivel_admin: usuario?.nivel_admin ?? (tipoAlvo === 'admin' ? 1 : null),
  }), [usuario, novo, concedivel, soSelecionadas, empresas, tipoAlvo]);

  const [d, setD] = useState(inicial);
  const [aba, setAba] = useState(comDados && novo ? 'dados' : 'permissoes');
  const [confirmando, setConfirmando] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [verSenha, setVerSenha] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD(inicial); setAba(comDados && novo ? 'dados' : 'permissoes');
    setConfirmando(false); setDescartar(false); setErro(''); setVerSenha(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── diferenças ───────────────────────────────────────────────
  const dp = diffPermissoes(inicial.permissoes, d.permissoes);
  const todasEmp = !d.empresas_permitidas;
  const empAntes = inicial.empresas_permitidas ? new Set(inicial.empresas_permitidas) : null;
  const empDepois = d.empresas_permitidas ? new Set(d.empresas_permitidas) : null;
  const empRemovidas = empAntes === null
    ? (empDepois ? empresas.filter(e => !empDepois.has(e.id)) : [])
    : (empDepois ? [...empAntes].filter(id => !empDepois.has(id)).map(id => empresas.find(e => e.id === id) || { id, nome: 'Empresa' }) : []);
  const empAdicionadas = empDepois === null
    ? (empAntes ? empresas.filter(e => !empAntes.has(e.id)) : [])
    : [...empDepois].filter(id => !empAntes || !empAntes.has(id)).map(id => empresas.find(e => e.id === id) || { id, nome: 'Empresa' });
  const empMudou = (empAntes === null) !== (empDepois === null) || empRemovidas.length > 0 || empAdicionadas.length > 0;
  const dadosMudou = comDados && (d.nome !== inicial.nome || d.email !== inicial.email || !!d.senha || d.status !== inicial.status);
  const nivelMudou = !!nivel?.pode && d.nivel_admin !== inicial.nivel_admin;
  const qtdAlteracoes = dp.adicionadas.length + dp.removidas.length + (empMudou ? 1 : 0) + (dadosMudou ? 1 : 0) + (nivelMudou ? 1 : 0);
  const retira = dp.removidas.length > 0 || empRemovidas.length > 0
    || (comDados && !novo && d.status === 'inativo' && inicial.status !== 'inativo')
    || (nivelMudou && (d.nivel_admin || 1) < (inicial.nivel_admin || 1));

  // ── validação ────────────────────────────────────────────────
  const semEmpresa = tipoAlvo === 'cliente' && empDepois !== null && empDepois.size === 0;
  const faltaDados = comDados && (!d.nome.trim() || !d.email.trim() || (novo && d.senha.trim().length < 6));
  const podeSalvar = !salvando && !semEmpresa && !faltaDados && (novo || qtdAlteracoes > 0);

  const fechar = () => { if (qtdAlteracoes > 0 && !salvando) setDescartar(true); else onClose(); };

  const salvar = async () => {
    if (!podeSalvar) return;
    if (retira && !novo && !confirmando) { setConfirmando(true); setAba('resumo'); return; }
    setSalvando(true); setErro('');
    try {
      const patch = { permissoes: d.permissoes };
      if (tipoAlvo === 'cliente') patch.empresas_permitidas = d.empresas_permitidas;
      if (nivel?.pode) patch.nivel_admin = d.nivel_admin;
      if (comDados) Object.assign(patch, { nome: d.nome.trim(), email: d.email.trim(), status: d.status, ...(d.senha ? { senha: d.senha } : {}) });
      await onSave(patch);
    } catch (e) {
      setErro(e?.message || 'Não foi possível salvar.'); setConfirmando(false);
    } finally { setSalvando(false); }
  };

  const abas = [
    ...(comDados ? [{ id: 'dados', label: 'Dados', icon: UserRound }] : []),
    { id: 'permissoes', label: 'Permissões', icon: ShieldCheck, badge: d.permissoes.filter(k => catalogo.some(p => p.key === k)).length },
    ...(tipoAlvo === 'cliente' ? [{ id: 'empresas', label: 'Empresas', icon: Building2, badge: todasEmp ? 'todas' : empDepois.size, alerta: semEmpresa }] : []),
    ...(nivel?.pode ? [{ id: 'nivel', label: 'Nível', icon: Shield, badge: `N${d.nivel_admin || 1}` }] : []),
    { id: 'resumo', label: 'Resumo', icon: ListChecks, badge: qtdAlteracoes || undefined },
  ];

  const iniciais = (d.nome || usuario?.nome || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
  const cabecalho = (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${tipoAlvo === 'admin' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>{iniciais}</div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold leading-tight text-gray-900 dark:text-gray-100">{novo ? 'Novo usuário' : (usuario.nome || 'Usuário')}</p>
        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
          {tipoAlvo === 'admin' ? `Admin CCI · N${d.nivel_admin || 1}` : 'Usuário do cliente'}
          {contexto ? ` · ${contexto}` : ''}{!novo && usuario.email ? ` · ${usuario.email}` : ''}
          {!novo && usuario.status === 'inativo' ? ' · inativo' : ''}
        </p>
      </div>
    </div>
  );

  const rodape = descartar ? (
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-auto text-[12px] text-gray-600 dark:text-gray-300">Descartar {qtdAlteracoes} alteraç{qtdAlteracoes === 1 ? 'ão' : 'ões'} não salva{qtdAlteracoes === 1 ? '' : 's'}?</p>
      <button type="button" onClick={() => setDescartar(false)} className="h-8 rounded-md px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/5">Continuar editando</button>
      <button type="button" onClick={onClose} className="h-8 rounded-md bg-gray-900 px-3 text-[12px] font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900">Descartar</button>
    </div>
  ) : (
    <div className="space-y-2">
      {erro && <p className="rounded-md bg-rose-50 px-2.5 py-1.5 text-[11.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{erro}</p>}
      <div className="flex items-center gap-2">
        <p className="mr-auto flex min-w-0 items-center gap-1.5 truncate text-[11.5px] text-gray-500 dark:text-gray-400">
          {qtdAlteracoes > 0
            ? <><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{qtdAlteracoes} alteraç{qtdAlteracoes === 1 ? 'ão' : 'ões'} não salva{qtdAlteracoes === 1 ? '' : 's'}</>
            : (novo ? 'Preencha dados e permissões' : 'Nenhuma alteração')}
        </p>
        <button type="button" onClick={confirmando ? () => setConfirmando(false) : fechar}
          className="h-8 flex-shrink-0 whitespace-nowrap rounded-md px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/5">
          {confirmando ? 'Voltar' : 'Cancelar'}
        </button>
        <button type="button" onClick={salvar} disabled={!podeSalvar}
          className={`inline-flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${confirmando ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {confirmando ? 'Confirmar e salvar' : (novo ? 'Criar usuário' : 'Salvar')}
        </button>
      </div>
    </div>
  );

  const navAbas = (
    <nav className="flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-gray-100 bg-white px-4 sm:px-5 dark:border-white/10 dark:bg-slate-900">
      {abas.map(a => {
        const Icone = a.icon;
        const on = aba === a.id;
        return (
          <button key={a.id} type="button" onClick={() => setAba(a.id)}
            className={`-mb-px inline-flex flex-shrink-0 items-center gap-1.5 border-b-2 py-2 text-[12px] font-medium transition-colors ${
              on ? 'border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>
            <Icone className="hidden h-3.5 w-3.5 sm:block" />{a.label}
            {a.badge !== undefined && (
              <span className={`rounded px-1 text-[10px] tabular-nums ${a.alerta ? 'bg-rose-50 text-rose-600' : on ? 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200' : 'bg-gray-50 text-gray-400 dark:bg-white/5'}`}>{a.badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <PainelLateral open={open} onClose={fechar} cabecalho={cabecalho} abas={navAbas} rodape={rodape}>

      <div className="px-4 py-3 sm:px-5">
        {aba === 'dados' && <AbaDados d={d} setD={setD} novo={novo} verSenha={verSenha} setVerSenha={setVerSenha} />}

        {aba === 'permissoes' && (
          <>
            {tipoAlvo === 'cliente' && (
              <p className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">
                Valem em {todasEmp ? 'todas as empresas da rede' : `${empDepois.size} empresa${empDepois.size === 1 ? '' : 's'}`} liberada{todasEmp || empDepois.size !== 1 ? 's' : ''} na aba Empresas.
              </p>
            )}
            <EditorPermissoes catalogo={catalogo} tipo={tipoAlvo} tipoCliente={tipoCliente}
              value={d.permissoes} onChange={(arr) => setD(x => ({ ...x, permissoes: arr }))}
              original={novo ? null : inicial.permissoes} concedivel={concedivel} perfis={perfis} />
          </>
        )}

        {aba === 'empresas' && (
          <AbaEmpresas empresas={empresas} valor={d.empresas_permitidas} soSelecionadas={soSelecionadas}
            antesTodas={!novo && inicial.empresas_permitidas === null}
            onChange={(v) => setD(x => ({ ...x, empresas_permitidas: v }))} semEmpresa={semEmpresa} />
        )}

        {aba === 'nivel' && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Só administradores nível 3 alteram o nível. O nível define quem o usuário pode gerir; as permissões definem as telas.</p>
            {NIVEIS_ADMIN.map(n => {
              const on = (d.nivel_admin || 1) === n.v;
              return (
                <label key={n.v} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 ${on ? 'border-blue-300 bg-blue-50/60 dark:border-blue-500/40 dark:bg-blue-500/10' : 'border-gray-200 hover:border-gray-300 dark:border-white/10'}`}>
                  <input type="radio" name="nivel" checked={on} onChange={() => setD(x => ({ ...x, nivel_admin: n.v }))} className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-[12.5px] font-medium text-gray-900 dark:text-gray-100">{n.label}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{n.desc}</span>
                </label>
              );
            })}
          </div>
        )}

        {aba === 'resumo' && (
          <Resumo catalogo={catalogo} tipoAlvo={tipoAlvo} d={d} dp={dp} empresas={empresas}
            empAdicionadas={empAdicionadas} empRemovidas={empRemovidas} empMudou={empMudou}
            nivelMudou={nivelMudou} nivelAntes={inicial.nivel_admin} confirmando={confirmando}
            statusMudou={comDados && !novo && d.status !== inicial.status} novo={novo} />
        )}
      </div>
    </PainelLateral>
  );
}

const campo = 'h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-[12.5px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-gray-100 dark:focus:ring-blue-500/20';
const rotulo = 'mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300';

function AbaDados({ d, setD, novo, verSenha, setVerSenha }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className={rotulo}>Nome</label>
        <input className={campo} value={d.nome} autoFocus={novo} onChange={e => setD(x => ({ ...x, nome: e.target.value }))} />
      </div>
      <div>
        <label className={rotulo}>E-mail</label>
        <input type="email" className={campo} value={d.email} onChange={e => setD(x => ({ ...x, email: e.target.value }))} />
      </div>
      <div>
        <label className={rotulo}>{novo ? 'Senha inicial' : 'Nova senha'}</label>
        <div className="relative">
          <input type={verSenha ? 'text' : 'password'} className={`${campo} pr-8 font-mono`} value={d.senha}
            placeholder={novo ? 'Mínimo 6 caracteres' : 'Em branco = manter'} onChange={e => setD(x => ({ ...x, senha: e.target.value }))} />
          <button type="button" onClick={() => setVerSenha(v => !v)} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700">{verSenha ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
        </div>
        {d.senha && d.senha.length < 6 && <p className="mt-1 text-[10.5px] text-rose-600">Mínimo 6 caracteres.</p>}
      </div>
      <div>
        <label className={rotulo}>Situação</label>
        <div className="flex h-8 rounded-md border border-gray-200 p-0.5 text-[12px] dark:border-white/10">
          {[['ativo', 'Ativo'], ['inativo', 'Inativo']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setD(x => ({ ...x, status: v }))}
              className={`flex-1 rounded ${d.status === v ? (v === 'ativo' ? 'bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-gray-100 font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200') : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AbaEmpresas({ empresas, valor, soSelecionadas, antesTodas, onChange, semEmpresa }) {
  const [busca, setBusca] = useState('');
  const todas = !valor;
  const sel = new Set(valor || []);
  const q = busca.trim().toLowerCase();
  const lista = empresas.filter(e => !q || e.nome.toLowerCase().includes(q) || (e.cnpj || '').includes(q));
  const alternar = (id) => {
    const base = todas ? empresas.map(e => e.id) : [...sel];
    onChange(base.includes(id) ? base.filter(x => x !== id) : [...base, id]);
  };
  const opcao = (on, titulo, sub, onClick, desabilitado) => (
    <button type="button" onClick={onClick} disabled={desabilitado}
      className={`flex flex-1 items-start gap-2 rounded-md border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${on ? 'border-blue-300 bg-blue-50/60 dark:border-blue-500/40 dark:bg-blue-500/10' : 'border-gray-200 hover:border-gray-300 dark:border-white/10'}`}>
      <span className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border-[4px] ${on ? 'border-blue-600' : 'border-gray-300 dark:border-white/20'}`} />
      <span><span className="block text-[12.5px] font-medium text-gray-900 dark:text-gray-100">{titulo}</span><span className="block text-[11px] text-gray-500 dark:text-gray-400">{sub}</span></span>
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        {opcao(todas, 'Todas as empresas', soSelecionadas ? 'Só a CCI ou quem tem acesso a toda a rede' : `As ${empresas.length} da rede e as cadastradas depois`, () => onChange(null), soSelecionadas)}
        {opcao(!todas, 'Somente as selecionadas', 'Não vê dados das demais', () => onChange(todas ? empresas.map(e => e.id) : [...sel]))}
      </div>
      {soSelecionadas && antesTodas && todas && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" />Hoje este usuário vê todas as empresas da rede. Se você alterar, ele passa a ver só as que você selecionar.
        </p>
      )}
      {!todas && (
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            {empresas.length > 8 && (
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa" className={`${campo} pl-7`} />
              </div>
            )}
            <span className="ml-auto text-[11px] tabular-nums text-gray-500">{sel.size} de {empresas.length}</span>
            <button type="button" onClick={() => onChange(empresas.map(e => e.id))} className="rounded px-1.5 py-0.5 text-[10.5px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5">Todas</button>
            <button type="button" onClick={() => onChange([])} className="rounded px-1.5 py-0.5 text-[10.5px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5">Nenhuma</button>
          </div>
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-white/5 dark:border-white/10">
            {lista.map(e => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <input type="checkbox" checked={sel.has(e.id)} onChange={() => alternar(e.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 focus:ring-offset-0 dark:border-white/20 dark:bg-slate-950" />
                  <span className="flex-1 truncate text-[12.5px] text-gray-800 dark:text-gray-200">{e.nome}</span>
                  {e.cnpj && <span className="font-mono text-[10.5px] text-gray-400">{e.cnpj}</span>}
                </label>
              </li>
            ))}
            {lista.length === 0 && <li className="px-3 py-4 text-center text-[11.5px] text-gray-400">Nenhuma empresa.</li>}
          </ul>
          {semEmpresa && <p className="mt-1.5 text-[11px] text-rose-600">Selecione ao menos uma empresa.</p>}
        </div>
      )}
    </div>
  );
}

function Resumo({ catalogo, tipoAlvo, d, dp, empresas, empAdicionadas, empRemovidas, empMudou, nivelMudou, nivelAntes, confirmando, statusMudou, novo }) {
  const grupos = organizarCatalogo(catalogo, tipoAlvo)
    .map(g => ({ ...g, itens: g.itens.filter(p => d.permissoes.includes(p.key)) }))
    .filter(g => g.itens.length);
  const temAlteracao = dp.adicionadas.length || dp.removidas.length || empMudou || nivelMudou || statusMudou;
  const titulo = 'mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400';
  return (
    <div className="space-y-4">
      {confirmando && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>Esta alteração <strong>retira acessos</strong>. O usuário deixa de ver o que está marcado com − abaixo a partir do próximo login (ou em até 1 hora). Confira e confirme.</span>
        </div>
      )}

      {!novo && (
        <section>
          <p className={titulo}>Alterações</p>
          {!temAlteracao && <p className="text-[12px] text-gray-400">Nenhuma alteração.</p>}
          <ul className="space-y-0.5 text-[12px]">
            {dp.adicionadas.map(k => <li key={`+${k}`} className="text-emerald-700 dark:text-emerald-400">+ {rotuloPermissao(catalogo, k)}</li>)}
            {dp.removidas.map(k => <li key={`-${k}`} className="text-rose-700 dark:text-rose-400">− {rotuloPermissao(catalogo, k)}</li>)}
            {empAdicionadas.map(e => <li key={`+e${e.id}`} className="text-emerald-700 dark:text-emerald-400">+ Empresa {e.nome}</li>)}
            {empRemovidas.map(e => <li key={`-e${e.id}`} className="text-rose-700 dark:text-rose-400">− Empresa {e.nome}</li>)}
            {empMudou && !d.empresas_permitidas && <li className="text-emerald-700 dark:text-emerald-400">+ Todas as empresas, inclusive futuras</li>}
            {nivelMudou && <li className="text-gray-700 dark:text-gray-300">Nível N{nivelAntes || 1} → N{d.nivel_admin || 1}</li>}
            {statusMudou && <li className={d.status === 'inativo' ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>{d.status === 'inativo' ? '− Usuário desativado (não entra mais)' : '+ Usuário reativado'}</li>}
          </ul>
        </section>
      )}

      <section>
        <p className={titulo}>Acessos {novo ? 'que serão concedidos' : 'após salvar'}</p>
        {grupos.length === 0 && <p className="text-[12px] text-gray-400">Nenhuma permissão marcada.</p>}
        <dl className="space-y-1.5">
          {grupos.map(g => (
            <div key={g.modulo} className="grid grid-cols-[120px_1fr] gap-2 text-[12px]">
              <dt className="pt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{g.modulo}</dt>
              <dd className="flex flex-wrap gap-1">
                {g.itens.map(p => (
                  <span key={p.key} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 dark:bg-white/10 dark:text-gray-200">
                    {p.restrita && <Lock className="h-2.5 w-2.5 text-amber-600" />}{p.label}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {tipoAlvo === 'cliente' && (
        <section>
          <p className={titulo}>Empresas</p>
          <p className="text-[12px] text-gray-700 dark:text-gray-300">
            {!d.empresas_permitidas
              ? `Todas as ${empresas.length} empresas da rede, inclusive as cadastradas depois.`
              : empresas.filter(e => d.empresas_permitidas.includes(e.id)).map(e => e.nome).join(', ') || 'Nenhuma'}
          </p>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">As permissões acima valem em todas essas empresas.</p>
        </section>
      )}
    </div>
  );
}
