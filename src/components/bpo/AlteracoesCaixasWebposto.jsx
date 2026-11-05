// Alterações em caixas — redes WEBPOSTO.
// Fonte: Quality V1/AUDITORIA (log de operações do Webposto), só origem
// RETAGUARDA (ações de usuários; o PDV/BASE_LOCAL é a operação normal).
// Cada evento tem N itens (tabela + operação + texto auditado). O texto vem
// em linhas "Campo: valor" e, nas alterações, blocos "Antes:" / "Depois:".
// Se a chave não tiver usuário vinculado na Quality → 403 → aviso.

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ChevronDown, ChevronRight, Download, History, Loader2, Pencil, Plus,
  RefreshCw, Search, Trash2, Users, FileText, Layers,
} from 'lucide-react';
import * as qualityApi from '../../services/qualityApiService';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ontem = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };
const fmtDataHora = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ''}` : (iso || '—');
};
const MAX_DIAS = 31;

// Tabelas que mexem no caixa (filtro padrão). As demais ficam disponíveis.
const ehTabelaCaixa = (t) => /^caixa|^cart[ãa]o$|^cheque|^venda prazo$|^venda forma/i.test(t || '');

const OPERACAO = {
  INCLUIR: { rotulo: 'Inclusão',  cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: Plus },
  ALTERAR: { rotulo: 'Alteração', cls: 'bg-amber-50 text-amber-700 ring-amber-200',       Icon: Pencil },
  EXCLUIR: { rotulo: 'Exclusão',  cls: 'bg-rose-50 text-rose-700 ring-rose-200',          Icon: Trash2 },
};

// "Campo: valor" por linha; "Antes:" / "Depois:" trocam o bloco.
function parsearTextoAuditado(texto) {
  const ctx = {}; const antes = {}; const depois = {};
  let alvo = ctx;
  String(texto || '').split(/\r?\n/).forEach(l => {
    const s = l.trim();
    if (!s) return;
    if (/^antes:?$/i.test(s)) { alvo = antes; return; }
    if (/^depois:?$/i.test(s)) { alvo = depois; return; }
    const i = s.indexOf(':');
    if (i <= 0) { alvo[s] = ''; return; }
    alvo[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  });
  return { ctx, antes, depois };
}

// Rótulo do caixa/turno a partir do contexto do item.
function caixaDoItem(ctx) {
  if (ctx.Caixa) return ctx.Caixa;                                     // "PDV, 001, 2º TURNO, 03/11/2026"
  if (ctx.PDV || ctx.Turno) return [ctx.PDV, ctx.Turno, ctx.Movimento].filter(Boolean).join(', ');
  return '';
}

// Detalhe expandido:
//  - inclusão: só o essencial (lançamento de caixa; cartão usa Administradora/Valor);
//  - exclusão: tudo, menos os identificadores técnicos.
const CAMPOS_INCLUSAO = ['Plano de Conta', 'Histórico', 'Valor Total', 'Dinheiro', 'Administradora', 'Valor'];
const OCULTOS_EXCLUSAO = new Set(['Referência Uuid', 'COO', 'Referência', 'Alterado']);
// Já aparecem nos grupos (funcionário) ou no título da linha (caixa).
const JA_EXIBIDOS = new Set(['Caixa', 'Funcionário', 'PDV', 'Turno', 'Movimento']);
function camposDetalhe(item) {
  const preenchidos = Object.entries(item.ctx).filter(([k, v]) => v !== '' && !JA_EXIBIDOS.has(k));
  if (item.operacao === 'INCLUIR') {
    return CAMPOS_INCLUSAO.filter(k => item.ctx[k]).map(k => [k, item.ctx[k]]);
  }
  if (item.operacao === 'EXCLUIR') return preenchidos.filter(([k]) => !OCULTOS_EXCLUSAO.has(k));
  // Alteração: o que mudou já está na tabela antes/depois — não repete.
  const mudou = new Set([...Object.keys(item.antes), ...Object.keys(item.depois)]);
  return preenchidos.filter(([k]) => !mudou.has(k) && !OCULTOS_EXCLUSAO.has(k));
}
// Campos alterados (sem os técnicos tipo "Alterado: Não → Sim").
function camposAlterados(item) {
  return [...new Set([...Object.keys(item.antes), ...Object.keys(item.depois)])]
    .filter(c => !OCULTOS_EXCLUSAO.has(c) && (item.antes[c] || '') !== (item.depois[c] || ''));
}
// Data do turno (movimento do caixa) → "2026-10-31" (p/ filtrar e ordenar).
function dataTurnoDoItem(caixa) {
  const m = String(caixa || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
// "PDV, 001, 3º TURNO, 03/11/2026" → "3º TURNO · 03/11/2026 · PDV 001"
function tituloCaixa(caixa) {
  const partes = String(caixa || '').split(',').map(x => x.trim()).filter(Boolean);
  if (partes.length >= 4 && /^PDV$/i.test(partes[0])) return `${partes[2]} · ${partes[3]} · PDV ${partes[1]}`;
  return caixa || 'Sem caixa vinculado';
}

// Campos mais informativos p/ o resumo de inclusão/exclusão.
const CAMPOS_RESUMO = ['Administradora', 'Valor', 'Valor Total', 'Dinheiro', 'Plano de Conta', 'Histórico', 'Venda', 'Conta', 'Observação'];

// onDocumento({ grupos, contexto }): entrega à página os dados (já filtrados e
// agrupados) do documento de impressão — ele precisa ficar FORA do `.no-print`.
export default function AlteracoesCaixasWebposto({ chave, empresas = [], labelEmpresa = (e) => e?.nome, redeNome = '', onDocumento }) {
  const [empresaId, setEmpresaId] = useState(() => empresas[0]?.id || '');
  const [dataDe, setDataDe] = useState(ontem());
  const [dataAte, setDataAte] = useState(ontem());
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState(null); // null = ainda não buscou
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [semUsuario, setSemUsuario] = useState(false);
  const [soCaixa, setSoCaixa] = useState(true);
  const [tabelasSel, setTabelasSel] = useState(new Set());
  const [usuarioSel, setUsuarioSel] = useState('');
  const [turnoSel, setTurnoSel] = useState(''); // data do turno (yyyy-mm-dd)
  const [abertos, setAbertos] = useState(new Set());

  const empresa = empresas.find(e => e.id === empresaId) || null;

  async function buscar() {
    setErro(''); setSemUsuario(false);
    if (!chave) { setErro('Chave da API não encontrada para esta rede.'); return; }
    if (!empresa) { setErro('Selecione a empresa.'); return; }
    if (!dataDe || !dataAte || dataDe > dataAte) { setErro('Período inválido.'); return; }
    const dias = (new Date(dataAte) - new Date(dataDe)) / 86400000 + 1;
    if (dias > MAX_DIAS) { setErro(`Selecione no máximo ${MAX_DIAS} dias.`); return; }
    setCarregando(true);
    try {
      const eventos = await qualityApi.buscarAuditoria(chave, {
        dataInicial: dataDe, dataFinal: dataAte,
        filiais: [Number(empresa.empresa_codigo)], origens: ['RETAGUARDA'],
      });
      // Achata em itens (1 linha por tabela afetada), mantendo o evento pai.
      const lista = [];
      eventos.forEach(ev => {
        // O Webposto às vezes grava o MESMO item 2x no evento (ex.: "Caixa
        // ALTERAR" nas sequências 2 e 3 com texto idêntico) — é 1 alteração só.
        const vistos = new Set();
        (ev.itens || []).forEach((it, k) => {
        const assinatura = `${it.tabela}|${it.operacao}|${it.textoAuditado}`;
        if (vistos.has(assinatura)) return;
        vistos.add(assinatura);
        const p = parsearTextoAuditado(it.textoAuditado);
        lista.push({
          id: `${ev.auditoriaCodigo}:${it.sequencia ?? k}:${k}`,
          dataHora: ev.dataHoraEvento,
          usuario: ev.usuarioNome || (ev.usuarioCodigo != null ? `Usuário ${ev.usuarioCodigo}` : '—'),
          computador: ev.computador || '',
          tabela: it.tabela || '—',
          operacao: it.operacao,
          caixa: caixaDoItem(p.ctx),
          dataTurno: dataTurnoDoItem(caixaDoItem(p.ctx)),
          ...p,
          texto: it.textoAuditado || '',
        });
        });
      });
      // Funcionário: o do próprio registro; senão o dono do caixa/turno (o
      // "Caixa Apresentado" traz o funcionário do caixa; "Caixa" não traz).
      const donoCaixa = new Map();
      lista.forEach(i => {
        if (i.caixa && i.ctx['Funcionário'] && (i.tabela === 'Caixa Apresentado' || !donoCaixa.has(i.caixa))) {
          donoCaixa.set(i.caixa, i.ctx['Funcionário']);
        }
      });
      lista.forEach(i => { i.funcionario = i.ctx['Funcionário'] || donoCaixa.get(i.caixa) || 'Sem funcionário'; });
      setItens(lista);
      setPeriodoBusca({ de: dataDe, ate: dataAte, empresa: labelEmpresa(empresa) });
      setTabelasSel(new Set());
      setUsuarioSel('');
      setTurnoSel('');
      setAbertos(new Set());
    } catch (e) {
      if (e?.code === 'AUDITORIA_SEM_USUARIO') { setSemUsuario(true); setItens(null); }
      else setErro(e?.message || 'Falha ao consultar a auditoria.');
    } finally {
      setCarregando(false);
    }
  }

  const tabelasDisponiveis = useMemo(() => {
    const m = new Map();
    (itens || []).forEach(i => { if (!soCaixa || ehTabelaCaixa(i.tabela)) m.set(i.tabela, (m.get(i.tabela) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens, soCaixa]);
  const usuarios = useMemo(() => [...new Set((itens || []).map(i => i.usuario))].sort(), [itens]);
  // Datas de turno presentes no resultado (mais recente primeiro), com contagem.
  const datasTurno = useMemo(() => {
    const m = new Map();
    (itens || []).forEach(i => { if (i.dataTurno && (!soCaixa || ehTabelaCaixa(i.tabela))) m.set(i.dataTurno, (m.get(i.dataTurno) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [itens, soCaixa]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens || []).filter(i => {
      if (soCaixa && !ehTabelaCaixa(i.tabela)) return false;
      if (tabelasSel.size && !tabelasSel.has(i.tabela)) return false;
      if (usuarioSel && i.usuario !== usuarioSel) return false;
      if (turnoSel && i.dataTurno !== turnoSel) return false;
      if (q && !`${i.tabela} ${i.usuario} ${i.funcionario} ${i.caixa} ${i.texto}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [itens, soCaixa, tabelasSel, usuarioSel, turnoSel, busca]);

  // Funcionário (A-Z, "Sem funcionário" por último) → categoria/tabela
  // (mais frequente primeiro) → operação (Inclusão → Alteração → Exclusão).
  const grupos = useMemo(() => {
    const ordem = ['INCLUIR', 'ALTERAR', 'EXCLUIR', 'OUTROS'];
    const porFunc = new Map();
    filtrados.forEach(i => {
      const op = ordem.includes(i.operacao) ? i.operacao : 'OUTROS';
      if (!porFunc.has(i.funcionario)) porFunc.set(i.funcionario, new Map());
      const porTab = porFunc.get(i.funcionario);
      if (!porTab.has(i.tabela)) porTab.set(i.tabela, new Map());
      const porOp = porTab.get(i.tabela);
      if (!porOp.has(op)) porOp.set(op, []);
      porOp.get(op).push(i);
    });
    const contarOps = (porOp) => [...porOp.values()].reduce((t, l) => t + l.length, 0);
    return [...porFunc.entries()]
      .sort((x, y) => (x[0] === 'Sem funcionário') - (y[0] === 'Sem funcionário') || x[0].localeCompare(y[0]))
      .map(([nome, porTab]) => {
        const tabelas = [...porTab.entries()]
          .map(([tabela, porOp]) => ({
            tabela,
            total: contarOps(porOp),
            operacoes: ordem.filter(op => porOp.has(op)).map(op => ({ op, lista: porOp.get(op) })),
          }))
          .sort((x, y) => y.total - x.total || x.tabela.localeCompare(y.tabela));
        return { nome, total: tabelas.reduce((t, x) => t + x.total, 0), tabelas };
      });
  }, [filtrados]);
  const [fechados, setFechados] = useState(new Set()); // grupos recolhidos
  const toggleGrupo = (k) => setFechados(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Documento de impressão: mesmos grupos da tela, com os campos já resolvidos.
  const [periodoBusca, setPeriodoBusca] = useState(null); // período/empresa da última busca
  useEffect(() => {
    if (!onDocumento) return;
    const docGrupos = grupos.map(g => ({
      ...g,
      tabelas: g.tabelas.map(t => ({
        ...t,
        operacoes: t.operacoes.map(o => ({
          ...o,
          lista: o.lista.map(i => ({
            id: i.id,
            titulo: tituloCaixa(i.caixa),
            dataHora: fmtDataHora(i.dataHora),
            usuario: i.usuario,
            alterados: i.operacao === 'ALTERAR'
              ? camposAlterados(i).map(c => ({ campo: c, antes: i.antes[c], depois: i.depois[c] }))
              : [],
            detalhe: camposDetalhe(i),
          })),
        })),
      })),
    }));
    const d = new Date();
    const fmtD = (x) => x ? x.split('-').reverse().join('/') : '';
    onDocumento({
      grupos: docGrupos,
      contexto: {
        rede: redeNome,
        empresa: periodoBusca?.empresa || '',
        periodo: [
          periodoBusca ? `Alterado ${periodoBusca.de === periodoBusca.ate ? `em ${fmtD(periodoBusca.de)}` : `de ${fmtD(periodoBusca.de)} a ${fmtD(periodoBusca.ate)}`}` : '',
          turnoSel ? `Turnos de ${fmtD(turnoSel)}` : '',
        ].filter(Boolean).join('  ·  '),
        geradoEm: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
      },
    });
  }, [grupos, periodoBusca, turnoSel, redeNome, onDocumento]);

  const kpis = useMemo(() => {
    const ops = { INCLUIR: 0, ALTERAR: 0, EXCLUIR: 0 };
    filtrados.forEach(i => { if (ops[i.operacao] != null) ops[i.operacao] += 1; });
    return {
      total: filtrados.length,
      usuarios: new Set(filtrados.map(i => i.usuario)).size,
      caixas: new Set(filtrados.map(i => i.caixa).filter(Boolean)).size,
      ops,
    };
  }, [filtrados]);

  const toggle = (id) => setAbertos(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const inp = 'h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';
  const lbl = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={lbl}>Alterado de</label>
          <input type="date" value={dataDe} max={dataAte} onChange={e => setDataDe(e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Até</label>
          <input type="date" value={dataAte} min={dataDe} onChange={e => setDataAte(e.target.value)} className={inp} />
        </div>
        <div className="min-w-[240px]">
          <label className={lbl}>Empresa</label>
          <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className={`${inp} w-full`}>
            {empresas.length === 0 && <option value="">Nenhuma empresa na rede</option>}
            {empresas.map(e => <option key={e.id} value={e.id}>{labelEmpresa(e)}</option>)}
          </select>
        </div>
        <button onClick={buscar} disabled={carregando || !empresa}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Buscar
        </button>
      </div>

      {semUsuario && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <p>Vincule um usuário a chave para utilização</p>
        </div>
      )}
      {erro && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <p>{erro}</p>
        </div>
      )}

      {carregando && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white p-8 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Buscando alterações...
        </div>
      )}

      {!carregando && itens === null && !semUsuario && !erro && (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <History className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Selecione o período e a empresa e clique em "Buscar"</p>
          <p className="mt-1 text-xs text-gray-500">Mostra o que foi incluído, alterado ou excluído na retaguarda do Webposto (cartões, fechamento de caixa, sangrias…).</p>
        </div>
      )}

      {!carregando && itens !== null && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icone={<History className="h-4 w-4 text-blue-600" />} label="Alterações" valor={kpis.total}
              sub={`${kpis.ops.INCLUIR} inclusões · ${kpis.ops.ALTERAR} alterações · ${kpis.ops.EXCLUIR} exclusões`} />
            <Kpi icone={<Users className="h-4 w-4 text-blue-600" />} label="Usuários" valor={kpis.usuarios} />
            <Kpi icone={<FileText className="h-4 w-4 text-blue-600" />} label="Caixas afetados" valor={kpis.caixas} />
            <Kpi icone={<Layers className="h-4 w-4 text-blue-600" />} label="Tabelas" valor={tabelasDisponiveis.length} />
          </div>

          <div className="space-y-3 rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar (valor, administradora, funcionário…)"
                  className={`${inp} w-full pl-8`} />
              </div>
              <select value={usuarioSel} onChange={e => setUsuarioSel(e.target.value)} className={inp}>
                <option value="">Todos os usuários</option>
                {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <select value={turnoSel} onChange={e => setTurnoSel(e.target.value)} className={inp}
                title="Data do movimento do caixa/turno que foi modificado">
                <option value="">Todas as datas de turno</option>
                {datasTurno.map(([d, n]) => <option key={d} value={d}>Turno de {d.split('-').reverse().join('/')} ({n})</option>)}
              </select>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={soCaixa} onChange={e => { setSoCaixa(e.target.checked); setTabelasSel(new Set()); }} />
                Só o que mexe no caixa
              </label>
              <button onClick={() => window.print()} disabled={filtrados.length === 0}
                title="Imprime o que está filtrado na tela (Salvar como PDF)"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-[12px] font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
                <Download className="h-3.5 w-3.5" /> Exportar PDF
              </button>
            </div>
            {tabelasDisponiveis.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tabelasDisponiveis.map(([t, n]) => {
                  const on = tabelasSel.has(t);
                  return (
                    <button key={t} onClick={() => setTabelasSel(prev => { const s = new Set(prev); if (s.has(t)) s.delete(t); else s.add(t); return s; })}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-gray-50 text-gray-600 ring-gray-200 hover:bg-gray-100'}`}>
                      {t} <span className={on ? 'text-blue-100' : 'text-gray-400'}>{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {filtrados.length === 0 ? (
            <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm">
              <p className="py-12 text-center text-sm text-gray-400">Nenhuma alteração no período com esses filtros.</p>
            </div>
          ) : grupos.map(g => {
            const recolhido = fechados.has(g.nome);
            return (
              <section key={g.nome} className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
                {/* Nível 1: funcionário */}
                <button onClick={() => toggleGrupo(g.nome)}
                  className="flex w-full items-center gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-3 text-left hover:bg-gray-100/70">
                  {recolhido ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  <Users className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-gray-900">{g.nome}</span>
                  <span className="text-xs text-gray-500">
                    {g.total} registro{g.total === 1 ? '' : 's'} · {g.tabelas.length} categoria{g.tabelas.length === 1 ? '' : 's'}
                  </span>
                </button>
                {!recolhido && g.tabelas.map(t => {
                  const kt = `${g.nome}|${t.tabela}`;
                  const tRecolhido = fechados.has(kt);
                  return (
                    <div key={kt} className="border-b border-gray-100 last:border-b-0">
                      {/* Nível 2: categoria (tabela) */}
                      <button onClick={() => toggleGrupo(kt)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 pl-9 text-left hover:bg-gray-50/70">
                        {tRecolhido ? <ChevronRight className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
                        <Layers className="h-3.5 w-3.5 text-gray-500" />
                        <span className="text-sm font-semibold text-gray-800">{t.tabela}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{t.total}</span>
                        <span className="ml-auto flex flex-wrap gap-1.5">
                          {t.operacoes.map(o => {
                            const op = OPERACAO[o.op] || { rotulo: 'Outras', cls: 'bg-gray-50 text-gray-700 ring-gray-200' };
                            return <span key={o.op} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${op.cls}`}>{op.rotulo} {o.lista.length}</span>;
                          })}
                        </span>
                      </button>
                      {!tRecolhido && t.operacoes.map(o => {
                        const op = OPERACAO[o.op] || { rotulo: 'Outras', cls: 'bg-gray-50 text-gray-700 ring-gray-200', Icon: History };
                        const OpIcon = op.Icon;
                        const ko = `${kt}|${o.op}`;
                        const oRecolhido = fechados.has(ko);
                        return (
                          <div key={ko}>
                            {/* Nível 3: inclusão / alteração / exclusão */}
                            <button onClick={() => toggleGrupo(ko)}
                              className="flex w-full items-center gap-2 px-4 py-1.5 pl-16 text-left hover:bg-gray-50/70">
                              {oRecolhido ? <ChevronRight className="h-3 w-3 text-gray-400" /> : <ChevronDown className="h-3 w-3 text-gray-400" />}
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${op.cls}`}>
                                <OpIcon className="h-3 w-3" /> {op.rotulo}
                              </span>
                              <span className="text-[11px] text-gray-500">{o.lista.length}</span>
                            </button>
                            {!oRecolhido && (
                              <ul className="divide-y divide-gray-100 border-y border-gray-100 pl-12">
                                {o.lista.map(i => (
                                  <LinhaAlteracao key={i.id} item={i} aberto={abertos.has(i.id)} onToggle={() => toggle(i.id)} />
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function Kpi({ icone, label, valor, sub }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">{icone}</span>
        {label}
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-gray-900">{Number(valor || 0).toLocaleString('pt-BR')}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

function LinhaAlteracao({ item, aberto, onToggle }) {
  // Operação, tabela e funcionário já estão nos cabeçalhos dos grupos — a
  // linha mostra só o caixa, o resumo do que mudou e quem/quando.
  const campos = camposAlterados(item);
  const detalhe = camposDetalhe(item);
  const resumo = item.operacao === 'ALTERAR'
    ? campos.slice(0, 3).map(c => `${c}: ${item.antes[c] || '—'} → ${item.depois[c] || '—'}`).join(' · ')
    : CAMPOS_RESUMO.filter(c => item.ctx[c] && (item.operacao !== 'INCLUIR' || CAMPOS_INCLUSAO.includes(c)))
      .slice(0, 4).map(c => `${c}: ${item.ctx[c]}`).join(' · ');
  return (
    <li>
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50/70">
        {aberto ? <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{tituloCaixa(item.caixa)}</p>
          {!aberto && resumo && <p className="mt-0.5 truncate text-xs text-gray-600">{resumo}</p>}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-xs tabular-nums text-gray-700">{fmtDataHora(item.dataHora)}</p>
          <p className="text-[11px] text-gray-500">por {item.usuario}</p>
        </div>
      </button>
      {aberto && (campos.length > 0 || detalhe.length > 0) && (
        <div className="space-y-3 px-11 pb-4">
          {item.operacao === 'ALTERAR' && campos.length > 0 && (
            <table className="w-full max-w-3xl text-xs">
              <thead className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <tr><th className="py-1.5 pr-3">Campo</th><th className="py-1.5 pr-3">Antes</th><th className="py-1.5">Depois</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200/70">
                {campos.map(c => (
                  <tr key={c}>
                    <td className="py-1.5 pr-3 font-medium text-gray-700">{c}</td>
                    <td className="py-1.5 pr-3 font-mono text-rose-700">{item.antes[c] || '—'}</td>
                    <td className="py-1.5 font-mono text-emerald-700">{item.depois[c] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {detalhe.length > 0 && (
            <dl className="grid max-w-4xl grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              {detalhe.map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="flex-shrink-0 text-gray-500">{k}:</dt>
                  <dd className="min-w-0 break-words text-gray-800">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </li>
  );
}
