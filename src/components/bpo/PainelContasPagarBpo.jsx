// BPO · Contas a pagar — agenda de pagamentos de uma rede (admin e cliente).
// Títulos em aberto do ERP (a CCI lança lá) + status da autorização no banco:
//   A incluir → (CCI) Incluída no banco · aguardando autorização → (cliente) Autorizada
// Pago = some do ERP. Visões: Do dia | Agenda (calendário do mês) | Todas.
// Data de pagamento programada (CCI) ≠ vencimento: antecipar ou pagar vencida
// depois. A agenda usa `dia` = data de pagamento || vencimento efetivo.
// "Montar pagamento do dia": a CCI puxa um período de vencimentos (pra trás ou
// pra frente) e marca o que vai ser pago no dia escolhido.
// Dias de pagamento por empresa (migração 216): o "ciclo" de um dia de pagamento
// = vencidas fora do banco + o que vence até a véspera do próximo dia de pagamento.
// Ver bpoContasPagarService e migração 214.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, ListPlus,
  Clock, Landmark, Loader2, Search, Settings2, Tag, Undo2, X,
} from 'lucide-react';
import Modal from '../ui/Modal';
import BarraProgressoFetch from '../ui/BarraProgressoFetch';
import InputData from '../ui/InputData';
import { useEhCelular } from '../../hooks/useEhCelular';
import { useAtualizacaoAutomatica } from '../../hooks/useAtualizacaoAutomatica';
import * as cpService from '../../services/bpoContasPagarService';
import { formatCurrency } from '../../utils/format';
import { ehDiaUtil, isoDate } from '../../utils/diasUteis';

// ─── Helpers ─────────────────────────────────────────────────
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const dataBR = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');
const paraData = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const diaSemana = (iso) => (iso ? DIAS[paraData(iso).getDay()] : '');
const dataHoraBR = (s) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const compacto = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
};
const soma = (lista) => lista.reduce((s, t) => s + t.valor, 0);
const addDias = (iso, n) => { const d = paraData(iso); d.setDate(d.getDate() + n); return isoDate(d); };

// Dias de pagamento do cliente (0=dom … 6=sáb). Vazio = qualquer dia útil.
// Feriado/fim de semana nunca é dia de pagamento.
const ehDiaPagamento = (iso, dias) => ehDiaUtil(paraData(iso)) && (!dias?.length || dias.includes(paraData(iso).getDay()));
const proximoDiaPagamento = (iso, dias, passo = 1) => {
  let d = iso;
  for (let i = 0; i < 400; i++) { d = addDias(d, passo); if (ehDiaPagamento(d, dias)) return d; }
  return addDias(iso, passo);
};
const diaPagamentoAPartirDe = (iso, dias) => (ehDiaPagamento(iso, dias) ? iso : proximoDiaPagamento(iso, dias));
const nomesDias = (dias) => (dias?.length ? dias.map(d => DIAS_CURTOS[d]).join(', ') : 'qualquer dia útil');

const SITUACAO = {
  a_incluir: { rotulo: 'A incluir no banco', curto: 'A incluir', Icone: Circle, chip: 'bg-gray-100 text-gray-700 ring-gray-200', barra: 'bg-gray-300' },
  incluida: { rotulo: 'Aguardando autorização', curto: 'Aguardando', Icone: Clock, chip: 'bg-amber-50 text-amber-800 ring-amber-200', barra: 'bg-amber-400' },
  autorizada: { rotulo: 'Autorizada', curto: 'Autorizada', Icone: CheckCircle2, chip: 'bg-blue-50 text-blue-800 ring-blue-200', barra: 'bg-blue-600' },
};

function ChipSituacao({ s, curto = false }) {
  const c = SITUACAO[s];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${c.chip}`}>
      <c.Icone className="h-3 w-3" aria-hidden="true" /> {curto ? c.curto : c.rotulo}
    </span>
  );
}

// ─── Painel ──────────────────────────────────────────────────
// props:
//   tipo: 'webposto' | 'autosystem'
//   empresas: linhas de `clientes` da rede (id, nome, empresa_codigo, chave_api_id/as_rede_id)
//   redeId: as_rede.id (autosystem)
//   ehAdmin: CCI (inclui/desfaz e também autoriza)
//   podeAutorizar: cliente com 'bpo_contas_pagar_autorizar'
//   usuarioNome, recarga (número: muda → busca de novo no ERP)
export default function PainelContasPagarBpo({ tipo, empresas, redeId = null, ehAdmin = false, podeAutorizar = false, usuarioNome = '', recarga = 0 }) {
  const celular = useEhCelular();
  const hoje = isoDate(new Date());

  const [titulos, setTitulos] = useState([]);
  const [errosErp, setErrosErp] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [statusMap, setStatusMap] = useState(new Map());
  const [erroStatus, setErroStatus] = useState(null);

  const [aba, setAba] = useState('dia');
  const [prazo, setPrazo] = useState('todos'); // aba Todas: todos | vencidas | futuras
  const [filtroSit, setFiltroSit] = useState('todas');
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [diaSel, setDiaSel] = useState(null);
  const [selecionados, setSelecionados] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  const [erroAcao, setErroAcao] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [programar, setProgramar] = useState(null); // { acao: 'incluir'|'reprogramar', ts }
  const [diaPag, setDiaPag] = useState(null); // dia de pagamento da aba "Do dia" (definido ao carregar)
  const [montar, setMontar] = useState(false);
  const [diasMap, setDiasMap] = useState(new Map()); // clienteId → dias de pagamento
  const [configurar, setConfigurar] = useState(false);
  // Cliente: abre só nas contas marcadas p/ o dia (sem distração); o resto em "Mais informações"
  const [visaoCliente, setVisaoCliente] = useState('dia');
  const [confirmarAut, setConfirmarAut] = useState(null); // cliente: contas a confirmar antes de autorizar

  const idsEmpresas = useMemo(() => (empresas || []).map(e => e.id), [empresas]);
  const chaveIds = idsEmpresas.join(',');
  const multiEmpresa = idsEmpresas.length > 1;

  // Dias de pagamento valendo na tela: da empresa filtrada; senão, se todas
  // iguais, esses; se diferentes, a união (empresa sem config = qualquer dia).
  const { diasAtivos, diasDiferentes } = useMemo(() => {
    if (empresaFiltro) return { diasAtivos: diasMap.get(empresaFiltro) || [], diasDiferentes: false };
    const listas = idsEmpresas.map(id => diasMap.get(id) || []);
    const chaves = new Set(listas.map(l => l.join(',')));
    if (chaves.size <= 1) return { diasAtivos: listas[0] || [], diasDiferentes: false };
    if (listas.some(l => !l.length)) return { diasAtivos: [], diasDiferentes: true };
    return { diasAtivos: [...new Set(listas.flat())].sort(), diasDiferentes: true };
  }, [diasMap, empresaFiltro, idsEmpresas]);
  const diaDoDia = diaPagamentoAPartirDe(hoje, diasAtivos); // próximo dia de pagamento (útil) a partir de hoje
  const diaAtual = diaPag || diaDoDia;
  // Ciclo de um dia de pagamento p/ a empresa do título: até a véspera do próximo
  const cicloAte = useCallback((t, dia) => {
    const dias = diasMap.get(t.clienteId) || [];
    return ehDiaPagamento(dia, dias) ? addDias(proximoDiaPagamento(dia, dias), -1) : dia;
  }, [diasMap]);

  const carregarStatus = useCallback(async () => {
    try {
      setStatusMap(await cpService.listarStatus(chaveIds ? chaveIds.split(',') : []));
      setErroStatus(null);
    } catch (e) { setErroStatus(e.message); }
  }, [chaveIds]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCarregando(true);
      setSelecionados(new Set());
      const [erp, , dias] = await Promise.all([ // [títulos, status, dias de pagamento]
        cpService.buscarTitulosErp({ tipo, empresas, redeId, onProgresso: (feitos, total) => !cancelado && setProgresso({ feitos, total }) })
          .catch(e => ({ titulos: [], erros: [e.message] })),
        carregarStatus(),
        cpService.listarDiasPagamento(chaveIds ? chaveIds.split(',') : []).catch(() => new Map()),
      ]);
      if (cancelado) return;
      setDiasMap(dias || new Map());
      setDiaPag(null); // volta pro próximo dia de pagamento
      setTitulos(erp.titulos);
      setErrosErp(erp.erros);
      setCarregando(false);
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, chaveIds, redeId, recarga]);

  // Status em tempo real (o ERP só é rebuscado no "Atualizar")
  useAtualizacaoAutomatica({
    canal: `bpo-cp-${chaveIds.slice(0, 80)}`,
    tabelas: [{ table: 'bpo_contas_pagar_status' }],
    recarregar: carregarStatus,
    ativo: !!chaveIds,
  });

  // Título + situação
  const lista = useMemo(() => titulos.map(t => {
    const k = cpService.chaveStatus(t.clienteId, t.chave);
    const st = statusMap.get(k) || null;
    const mudou = !!st && (Math.abs(Number(st.valor || 0) - t.valor) > 0.009 || (st.vencimento && st.vencimento !== t.vencimento));
    const dataPag = st?.data_pagamento || null;
    const dia = dataPag || t.vencimentoEfetivo;
    const programacao = !dataPag || dataPag === t.vencimentoEfetivo ? null : (dataPag < t.vencimentoEfetivo ? 'antecipada' : 'postergada');
    return {
      ...t, k, st, situacao: st?.status || 'a_incluir', mudou, dataPag, dia, programacao,
      vencida: !!dia && dia < hoje, // atrasada na agenda (sem data de pagamento futura)
    };
  }).sort((a, b) => (a.dia || '9999').localeCompare(b.dia || '9999') || b.valor - a.valor), [titulos, statusMap, hoje]);

  // Filtros comuns (empresa, situação, busca)
  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(t => (!empresaFiltro || t.clienteId === empresaFiltro)
      && (filtroSit === 'todas' || t.situacao === filtroSit)
      && (!q || [t.fornecedor, t.documento, t.historico, t.empresaNome, t.conta].some(x => x?.toLowerCase().includes(q))));
  }, [lista, empresaFiltro, filtroSit, busca]);

  // Resumo (só filtro de empresa, para os números não sumirem ao filtrar)
  const resumo = useMemo(() => {
    const base = lista.filter(t => !empresaFiltro || t.clienteId === empresaFiltro);
    const em7 = isoDate(new Date(Date.now() + 7 * 864e5));
    const vencidas = base.filter(t => t.vencida);
    const doDia = base.filter(t => t.dia === diaDoDia);
    const prox = base.filter(t => t.dia > diaDoDia && t.dia <= em7);
    const aguard = base.filter(t => t.situacao === 'incluida');
    const aIncluir = base.filter(t => t.situacao === 'a_incluir' && !t.vencida);
    return { vencidas, doDia, prox, aguard, aIncluir, total: base };
  }, [lista, empresaFiltro, diaDoDia]);

  // Títulos da visão atual
  const visiveis = useMemo(() => {
    if (aba === 'dia') return filtrada.filter(t => t.dia === diaAtual);
    if (aba === 'agenda') {
      return filtrada.filter(t => (diaSel ? t.dia === diaSel : t.dia?.startsWith(mes)));
    }
    if (prazo === 'vencidas') return filtrada.filter(t => t.vencida);
    if (prazo === 'futuras') return filtrada.filter(t => !t.vencida);
    return filtrada;
  }, [filtrada, aba, diaAtual, diaSel, mes, prazo]);

  // Quem pode marcar o quê
  const selecionavel = useCallback((t) => ehAdmin || (podeAutorizar && t.situacao !== 'a_incluir'), [ehAdmin, podeAutorizar]);
  const podeSelecionar = ehAdmin || podeAutorizar;
  const selLista = useMemo(() => lista.filter(t => selecionados.has(t.k)), [lista, selecionados]);
  const alternar = (k) => setSelecionados(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const alternarVarios = (ts) => setSelecionados(s => {
    const alvo = ts.filter(selecionavel);
    const todos = alvo.length > 0 && alvo.every(t => s.has(t.k));
    const n = new Set(s);
    alvo.forEach(t => (todos ? n.delete(t.k) : n.add(t.k)));
    return n;
  });

  // 'incluir' e 'reprogramar' passam antes pela janela da data de pagamento
  const executar = async (acao, ts, extra = {}) => {
    if (!ts.length) return;
    if ((acao === 'incluir' || acao === 'reprogramar') && !extra.confirmado) { setErroAcao(null); setProgramar({ acao, ts }); return; }
    // Cliente: autorizar sempre passa por confirmação (evita clique sem querer)
    if (acao === 'autorizar' && !ehAdmin && !extra.confirmado) { setErroAcao(null); setDetalhe(null); setConfirmarAut(ts); return; }
    setSalvando(true); setErroAcao(null);
    try {
      if (acao === 'incluir') await cpService.marcarIncluidas(ts.map(t => ({ ...t, dataPagamento: extra.datas?.get(t.k) || null })), { usuarioNome });
      else if (acao === 'reprogramar') await cpService.reprogramarPagamento(ts, extra.data || null);
      else if (acao === 'pagarNoDia') {
        // novos: inclui no banco já com a data; os já incluídos: só muda a data
        const novos = ts.filter(t => t.situacao === 'a_incluir');
        const jaIncluidos = ts.filter(t => t.situacao !== 'a_incluir');
        if (novos.length) await cpService.marcarIncluidas(novos.map(t => ({ ...t, dataPagamento: extra.dia })), { usuarioNome });
        if (jaIncluidos.length) await cpService.reprogramarPagamento(jaIncluidos, extra.dia);
      }
      else if (acao === 'desfazer') await cpService.desfazerInclusao(ts);
      else if (acao === 'autorizar') await cpService.definirAutorizacao(ts, true, { usuarioNome });
      else if (acao === 'desautorizar') await cpService.definirAutorizacao(ts, false, { usuarioNome });
      await carregarStatus();
      setSelecionados(new Set());
      setDetalhe(null);
      setProgramar(null);
      setMontar(false);
      setConfirmarAut(null);
    } catch (e) { setErroAcao(e.message); }
    finally { setSalvando(false); }
  };

  const irPara = (novaAba, extra = {}) => {
    setAba(novaAba);
    if (extra.prazo) setPrazo(extra.prazo);
    setFiltroSit(extra.sit || 'todas');
    if (novaAba === 'agenda') { setDiaSel(null); setMes(hoje.slice(0, 7)); }
    if (novaAba === 'dia') setDiaPag(null);
  };

  if (carregando) {
    return (
      <div className="rounded-2xl border border-gray-200/60 bg-white p-8 shadow-sm">
        <BarraProgressoFetch loading feitos={progresso.feitos} total={progresso.total} label="Buscando contas a pagar no sistema do cliente…" />
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando títulos em aberto…
        </div>
      </div>
    );
  }

  const tituloDia = `${diaAtual === hoje ? 'Hoje · ' : ''}${diaSemana(diaAtual)} · ${dataBR(diaAtual)}`;
  // Contas do ciclo do dia ainda fora do banco (aviso p/ a CCI)
  const pendentesCiclo = lista.filter(t => (!empresaFiltro || t.clienteId === empresaFiltro) && t.situacao === 'a_incluir'
    && t.vencimentoEfetivo && t.vencimentoEfetivo <= cicloAte(t, diaAtual));
  const salvarDias = async (itens) => {
    setSalvando(true); setErroAcao(null);
    try {
      await cpService.salvarDiasPagamento(itens);
      setDiasMap(await cpService.listarDiasPagamento(idsEmpresas));
      setConfigurar(false);
      setDiaPag(null);
    } catch (e) { setErroAcao(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <div className="space-y-4 pb-24">
      {(errosErp.length > 0 || erroStatus) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Algumas informações não carregaram</p>
          {errosErp.map(e => <p key={e} className="mt-1 text-xs">{e}</p>)}
          {erroStatus && <p className="mt-1 text-xs">Status da autorização: {erroStatus}</p>}
        </div>
      )}

      {!ehAdmin && (
        <div className="inline-flex w-full rounded-xl bg-gray-100 p-1 sm:w-auto" role="tablist" aria-label="Visão">
          {[['dia', 'Pagamento do dia'], ['mais', 'Mais informações']].map(([k, r]) => (
            <button key={k} type="button" role="tab" aria-selected={visaoCliente === k} onClick={() => setVisaoCliente(k)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${visaoCliente === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              {r}
            </button>
          ))}
        </div>
      )}

      {!ehAdmin && visaoCliente === 'dia' && (
        <PagamentoDoDiaCliente dia={diaAtual} setDia={setDiaPag} hoje={hoje} diaDoDia={diaDoDia} lista={lista} dias={diasAtivos}
          podeAutorizar={podeAutorizar} salvando={salvando} onAcao={executar}
          listaProps={{ multiEmpresa, celular, podeSelecionar, selecionavel, selecionados, alternar, alternarVarios, onAbrir: setDetalhe, hoje }} />
      )}

      {(ehAdmin || visaoCliente === 'mais') && (<>
      {/* Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardResumo rotulo="Vencidas" lista={resumo.vencidas} Icone={AlertTriangle} tom="red"
          sub={resumo.vencidas.length ? 'sem data de pagamento futura' : 'nenhuma em atraso'} onClick={() => irPara('todas', { prazo: 'vencidas' })} />
        <CardResumo rotulo={diaDoDia === hoje ? 'Do dia' : `Do dia (${dataBR(diaDoDia).slice(0, 5)})`} lista={resumo.doDia} Icone={CalendarDays} tom="green"
          sub={`${resumo.doDia.filter(t => t.situacao === 'autorizada').length} autorizada(s)`} onClick={() => irPara('dia')} destaque />
        <CardResumo rotulo="Próximos 7 dias" lista={resumo.prox} Icone={Clock} tom="gray"
          sub="já lançadas no sistema" onClick={() => irPara('agenda')} />
        <CardResumo rotulo="Aguardando autorização" lista={resumo.aguard} Icone={Landmark} tom="amber"
          sub="incluídas no banco pela CCI" onClick={() => irPara('todas', { prazo: 'todos', sit: 'incluida' })} />
      </div>

      {/* Abas + filtros */}
      <div className="rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-full rounded-xl bg-gray-100 p-1 lg:w-auto" role="tablist">
            {[['dia', `Do dia`], ['agenda', 'Agenda'], ['todas', 'Todas']].map(([k, r]) => (
              <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition lg:flex-none ${aba === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                {r}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] lg:flex lg:items-center">
            <label className="relative block min-w-0">
              <span className="sr-only">Buscar</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Fornecedor, documento…"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 lg:w-60" />
            </label>
            <select value={filtroSit} onChange={e => setFiltroSit(e.target.value)} aria-label="Situação"
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm">
              <option value="todas">Todas as situações</option>
              <option value="a_incluir">A incluir no banco</option>
              <option value="incluida">Aguardando autorização</option>
              <option value="autorizada">Autorizadas</option>
            </select>
            {multiEmpresa && (
              <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)} aria-label="Empresa"
                className="h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm lg:max-w-56">
                <option value="">Todas as empresas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            )}
          </div>
        </div>
        {aba === 'todas' && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[['todos', 'Todas'], ['vencidas', 'Vencidas'], ['futuras', 'A vencer']].map(([k, r]) => (
              <button key={k} type="button" onClick={() => setPrazo(k)} aria-pressed={prazo === k}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${prazo === k ? 'bg-blue-700 text-white ring-blue-700' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'}`}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {aba === 'dia' && (
        <BarraDia dia={diaAtual} setDia={setDiaPag} hoje={hoje} diaDoDia={diaDoDia} titulos={visiveis}
          dias={diasAtivos} diasDiferentes={diasDiferentes} pendentesCiclo={pendentesCiclo}
          ehAdmin={ehAdmin} onMontar={() => { setErroAcao(null); setMontar(true); }}
          onConfigurar={() => { setErroAcao(null); setConfigurar(true); }} />
      )}

      {aba === 'agenda' && (
        <CalendarioMes mes={mes} setMes={(m) => { setMes(m); setDiaSel(null); }} hoje={hoje} titulos={filtrada} dias={diasAtivos}
          diaSel={diaSel} setDiaSel={setDiaSel} celular={celular} />
      )}

      {/* Lista */}
      <ListaTitulos
        titulo={aba === 'dia' ? `Pagamento do dia · ${tituloDia}` : aba === 'agenda' ? (diaSel ? `${diaSemana(diaSel)} · ${dataBR(diaSel)}` : `${MESES[Number(mes.slice(5)) - 1]} de ${mes.slice(0, 4)}`) : 'Todas as contas em aberto'}
        titulos={visiveis} agruparPorDia={aba !== 'dia' && !(aba === 'agenda' && diaSel)} multiEmpresa={multiEmpresa}
        celular={celular} podeSelecionar={podeSelecionar} selecionavel={selecionavel}
        selecionados={selecionados} alternar={alternar} alternarVarios={alternarVarios} onAbrir={setDetalhe}
        vazio={aba === 'dia' ? (ehAdmin ? 'Nenhuma conta para pagar neste dia. Use "Montar pagamento do dia" para trazer contas de outros dias.' : 'Nenhuma conta para pagar neste dia.') : 'Nenhuma conta encontrada com esses filtros.'}
        hoje={hoje} />
      </>)}

      {erroAcao && !detalhe && !programar && !montar && !configurar && !confirmarAut && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível salvar: {erroAcao}</p>}

      {/* Barra de ações da seleção */}
      {selLista.length > 0 && (
        <BarraSelecao ts={selLista} ehAdmin={ehAdmin} salvando={salvando} onAcao={executar} onLimpar={() => setSelecionados(new Set())} />
      )}

      {montar && (
        <ModalMontarDia dia={diaAtual} cicloAte={cicloAte} proximoPagamento={proximoDiaPagamento(diaAtual, diasAtivos)} titulos={lista.filter(t => !empresaFiltro || t.clienteId === empresaFiltro)} hoje={hoje}
          multiEmpresa={multiEmpresa} salvando={salvando} erro={erroAcao}
          onFechar={() => { setMontar(false); setErroAcao(null); }}
          onConfirmar={(ts) => executar('pagarNoDia', ts, { dia: diaAtual })} />
      )}

      {confirmarAut && (
        <ModalConfirmarAutorizacao ts={confirmarAut} multiEmpresa={multiEmpresa} salvando={salvando} erro={erroAcao}
          onFechar={() => { setConfirmarAut(null); setErroAcao(null); }}
          onConfirmar={() => executar('autorizar', confirmarAut, { confirmado: true })} />
      )}

      {configurar && (
        <ModalDiasPagamento empresas={empresas} diasMap={diasMap} salvando={salvando} erro={erroAcao}
          onFechar={() => { setConfigurar(false); setErroAcao(null); }} onSalvar={salvarDias} />
      )}

      <ModalProgramar key={programar ? programar.ts.map(t => t.k).join(',') : 'x'} dados={programar} hoje={hoje} salvando={salvando} erro={erroAcao}
        onFechar={() => { setProgramar(null); setErroAcao(null); }}
        onConfirmar={(extra) => executar(programar.acao, programar.ts, { ...extra, confirmado: true })} />

      <ModalTitulo t={programar ? null : detalhe} onFechar={() => { setDetalhe(null); setErroAcao(null); }} ehAdmin={ehAdmin} podeAutorizar={podeAutorizar}
        salvando={salvando} erro={erroAcao} onAcao={executar} />

      <p className="text-xs text-gray-500">
        Títulos em aberto no sistema do cliente ({tipo === 'autosystem' ? 'Autosystem' : 'Webposto'}). Vencimentos em fim de semana ou feriado contam no próximo dia útil. Na agenda vale a data de pagamento programada pela CCI (antecipada ou postergada), quando houver.
        Quando o título é pago no sistema, ele sai da lista.
      </p>
    </div>
  );
}

// ─── Cards ───────────────────────────────────────────────────
const TONS = {
  red: 'bg-red-50 text-red-700',
  green: 'bg-blue-700 text-white',
  gray: 'bg-gray-100 text-gray-700',
  amber: 'bg-amber-50 text-amber-700',
};
function CardResumo({ rotulo, lista, Icone, tom, sub, onClick, destaque }) {
  return (
    <button type="button" onClick={onClick}
      className={`group rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4 ${destaque ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-200/60'}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONS[tom]}`}><Icone className="h-4 w-4" aria-hidden="true" /></span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{rotulo}</span>
      </div>
      <p className="mt-2 text-lg font-bold tabular-nums text-gray-900 sm:text-xl">{formatCurrency(soma(lista))}</p>
      <p className="text-xs text-gray-600">{lista.length} título(s) · {sub}</p>
    </button>
  );
}

// ─── Calendário do mês (agenda) ──────────────────────────────
function CalendarioMes({ mes, setMes, hoje, titulos, dias, diaSel, setDiaSel, celular }) {
  const [ano, m] = mes.split('-').map(Number);
  const primeiro = new Date(ano, m - 1, 1);
  const diasNoMes = new Date(ano, m, 0).getDate();
  const porDia = useMemo(() => {
    const mapa = new Map();
    titulos.forEach(t => {
      if (!t.dia?.startsWith(mes)) return;
      if (!mapa.has(t.dia)) mapa.set(t.dia, []);
      mapa.get(t.dia).push(t);
    });
    return mapa;
  }, [titulos, mes]);
  const totalMes = [...porDia.values()].flat();
  const mover = (d) => { const n = new Date(ano, m - 1 + d, 1); setMes(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`); };
  const celulas = [];
  for (let i = 0; i < primeiro.getDay(); i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) celulas.push(`${mes}-${String(d).padStart(2, '0')}`);

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label="Mês anterior" className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900">{MESES[m - 1]} de {ano}</p>
          <p className="text-xs text-gray-600">{totalMes.length} título(s) · {formatCurrency(soma(totalMes))}</p>
        </div>
        <div className="flex gap-1">
          {mes !== hoje.slice(0, 7) && (
            <button type="button" onClick={() => setMes(hoje.slice(0, 7))} className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50">Hoje</button>
          )}
          <button type="button" onClick={() => mover(1)} aria-label="Próximo mês" className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {DIAS_CURTOS.map(d => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celulas.map((iso, i) => {
          if (!iso) return <div key={`v${i}`} />;
          const ts = porDia.get(iso) || [];
          const total = soma(ts);
          const sel = diaSel === iso;
          const ehHoje = iso === hoje;
          const passado = iso < hoje;
          const cont = { a_incluir: 0, incluida: 0, autorizada: 0 };
          ts.forEach(t => { cont[t.situacao] += 1; });
          const fimSemana = [0, 6].includes(paraData(iso).getDay());
          const diaPagto = dias?.length > 0 && ehDiaPagamento(iso, dias);
          return (
            <button key={iso} type="button" onClick={() => setDiaSel(sel ? null : iso)} aria-pressed={sel}
              aria-label={`${dataBR(iso)}${diaPagto ? ' (dia de pagamento)' : ''}: ${ts.length} título(s), ${formatCurrency(total)}`}
              className={`flex min-h-14 flex-col rounded-lg border p-1 text-left transition sm:min-h-20 sm:p-1.5 ${sel ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : ts.length ? 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40' : `border-transparent ${fimSemana ? 'bg-gray-50/60' : 'bg-gray-50'} hover:bg-gray-100`}`}>
              <span className="flex items-center justify-between">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${ehHoje ? 'bg-blue-700 text-white' : passado ? 'text-gray-400' : 'text-gray-800'}`}>
                  {Number(iso.slice(8))}
                </span>
                {diaPagto && <Landmark className="h-3 w-3 text-blue-700" aria-hidden="true" />}
              </span>
              {ts.length > 0 && (
                <>
                  <span className="mt-auto text-[10px] font-semibold tabular-nums text-gray-900 sm:text-xs">{celular ? ts.length : compacto(total)}</span>
                  {!celular && <span className="text-[10px] text-gray-600">{ts.length} tít.</span>}
                  <span className="mt-0.5 flex h-1 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                    {['autorizada', 'incluida', 'a_incluir'].map(s => cont[s] > 0 && (
                      <span key={s} className={SITUACAO[s].barra} style={{ width: `${(cont[s] / ts.length) * 100}%` }} />
                    ))}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-600">
        {['autorizada', 'incluida', 'a_incluir'].map(s => (
          <span key={s} className="inline-flex items-center gap-1.5"><span className={`h-2 w-3 rounded-sm ${SITUACAO[s].barra}`} aria-hidden="true" />{SITUACAO[s].rotulo}</span>
        ))}
        {dias?.length > 0 && <span className="inline-flex items-center gap-1.5"><Landmark className="h-3 w-3 text-blue-700" aria-hidden="true" />Dia de pagamento ({nomesDias(dias)})</span>}
      </div>
    </div>
  );
}

// ─── Lista ───────────────────────────────────────────────────
function ListaTitulos({ titulo, titulos, agruparPorDia, multiEmpresa, celular, podeSelecionar, selecionavel, selecionados, alternar, alternarVarios, onAbrir, vazio, hoje }) {
  const grupos = useMemo(() => {
    if (!agruparPorDia) return [{ dia: null, ts: titulos }];
    const m = new Map();
    titulos.forEach(t => {
      const d = t.dia || 'sem';
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(t);
    });
    return [...m.entries()].map(([dia, ts]) => ({ dia, ts }));
  }, [titulos, agruparPorDia]);
  const selecionaveis = titulos.filter(selecionavel);
  const todosSel = selecionaveis.length > 0 && selecionaveis.every(t => selecionados.has(t.k));

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          {podeSelecionar && selecionaveis.length > 0 && (
            <input type="checkbox" checked={todosSel} onChange={() => alternarVarios(titulos)} aria-label="Selecionar todos"
              className="h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-500" />
          )}
          <h3 className="text-sm font-bold text-gray-900">{titulo}</h3>
        </div>
        <p className="text-sm font-semibold tabular-nums text-gray-900">{titulos.length} título(s) · {formatCurrency(soma(titulos))}</p>
      </div>

      {titulos.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gray-600">{vazio}</p>
      ) : grupos.map(g => (
        <div key={g.dia || 'unico'}>
          {g.dia && (
            <div className="flex items-center justify-between gap-2 bg-gray-50 px-4 py-2 text-xs">
              <div className="flex items-center gap-2">
                {podeSelecionar && g.ts.some(selecionavel) && (
                  <input type="checkbox" checked={g.ts.filter(selecionavel).every(t => selecionados.has(t.k))} onChange={() => alternarVarios(g.ts)}
                    aria-label={`Selecionar ${dataBR(g.dia)}`} className="h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-500" />
                )}
                <span className="font-bold text-gray-900">{g.dia === 'sem' ? 'Sem vencimento' : `${dataBR(g.dia)} · ${diaSemana(g.dia)}`}</span>
                {g.dia === hoje && <span className="rounded bg-blue-700 px-1.5 py-0.5 text-[10px] font-bold text-white">HOJE</span>}
                {g.dia !== 'sem' && g.dia < hoje && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">VENCIDO</span>}
              </div>
              <span className="font-semibold tabular-nums text-gray-800">{g.ts.length} · {formatCurrency(soma(g.ts))}</span>
            </div>
          )}
          {celular ? (
            <ul className="divide-y divide-gray-100">
              {g.ts.map(t => (
                <li key={t.k} className="flex items-start gap-3 px-4 py-3">
                  {podeSelecionar && (
                    <input type="checkbox" checked={selecionados.has(t.k)} disabled={!selecionavel(t)} onChange={() => alternar(t.k)}
                      aria-label={`Selecionar ${t.fornecedor}`} className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-700 disabled:opacity-30" />
                  )}
                  <button type="button" onClick={() => onAbrir(t)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{t.fornecedor}</p>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-gray-900">{formatCurrency(t.valor)}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-600">
                      {[!g.dia || g.dia === 'sem' || t.programacao ? `Venc. ${dataBR(t.vencimento)}` : null, multiEmpresa ? t.empresaNome : null, t.documento ? `Doc. ${t.documento}` : null].filter(Boolean).join(' · ')}
                    </p>
                    {t.conta && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-700" title="Conta gerencial">
                        <Tag className="h-3 w-3 shrink-0 text-gray-500" aria-hidden="true" /><span className="truncate">{t.conta}</span>
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <ChipSituacao s={t.situacao} curto />
                      {t.vencida && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Em atraso</span>}
                      <ChipProgramacao t={t} />
                      {t.mudou && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200"><AlertTriangle className="h-3 w-3" aria-hidden="true" />Mudou no sistema</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead className="sr-only">
                <tr><th>Selecionar</th><th>Vencimento</th>{multiEmpresa && <th>Empresa</th>}<th>Fornecedor</th><th className="hidden lg:table-cell">Conta gerencial</th><th>Documento</th><th>Valor</th><th>Situação</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {g.ts.map(t => (
                  <tr key={t.k} onClick={() => onAbrir(t)} className={`cursor-pointer transition hover:bg-blue-50/40 ${selecionados.has(t.k) ? 'bg-blue-50/60' : ''}`}>
                    {podeSelecionar && (
                      <td className="w-10 px-4 py-2.5" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selecionados.has(t.k)} disabled={!selecionavel(t)} onChange={() => alternar(t.k)}
                          aria-label={`Selecionar ${t.fornecedor}`} className="h-4 w-4 rounded border-gray-300 text-blue-700 disabled:opacity-30" />
                      </td>
                    )}
                    <td className="w-28 px-3 py-2.5 tabular-nums text-gray-800">
                      {dataBR(t.vencimento)}
                      {t.programacao
                        ? <span className="block text-[10px] font-semibold text-gray-600">pagar {dataBR(t.dataPag).slice(0, 5)}</span>
                        : t.vencimento !== t.vencimentoEfetivo && <span className="block text-[10px] text-gray-500">útil {dataBR(t.vencimentoEfetivo).slice(0, 5)}</span>}
                    </td>
                    {multiEmpresa && <td className="w-44 truncate px-3 py-2.5 text-xs text-gray-700" title={t.empresaNome}>{t.empresaNome}</td>}
                    <td className="truncate px-3 py-2.5">
                      <p className="truncate font-medium text-gray-900" title={t.fornecedor}>{t.fornecedor}</p>
                      {t.historico && <p className="truncate text-[11px] text-gray-500" title={t.historico}>{t.historico}</p>}
                      {t.conta && <p className="truncate text-[11px] text-gray-600 lg:hidden" title={`Conta gerencial: ${t.conta}`}>Conta: {t.conta}</p>}
                    </td>
                    <td className="hidden w-56 px-3 py-2.5 lg:table-cell" title={t.conta ? `Conta gerencial: ${t.contaCodigo ? `${t.contaCodigo} · ` : ''}${t.conta}` : 'Sem conta gerencial'}>
                      {t.conta ? (
                        <>
                          <p className="flex items-center gap-1 text-xs text-gray-800"><Tag className="h-3 w-3 shrink-0 text-gray-500" aria-hidden="true" /><span className="truncate">{t.conta}</span></p>
                          {t.contaCodigo && <p className="truncate pl-4 font-mono text-[10px] text-gray-500">{t.contaCodigo}</p>}
                        </>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="w-32 truncate px-3 py-2.5 font-mono text-xs text-gray-700" title={t.documento}>
                      {t.documento || '—'}{t.parcela && <span className="text-gray-500"> · {t.parcela}</span>}
                    </td>
                    <td className="w-32 px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(t.valor)}</td>
                    <td className="w-52 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <ChipSituacao s={t.situacao} />
                        <ChipProgramacao t={t} curto />
                        {t.mudou && <span title="Valor ou vencimento mudou no sistema depois da inclusão no banco"><AlertTriangle className="h-4 w-4 text-red-600" aria-label="Mudou no sistema" /></span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Barra de ações ──────────────────────────────────────────
function BarraSelecao({ ts, ehAdmin, salvando, onAcao, onLimpar }) {
  const aIncluir = ts.filter(t => t.situacao === 'a_incluir' || t.mudou);
  const incluidas = ts.filter(t => t.situacao === 'incluida');
  const autorizadas = ts.filter(t => t.situacao === 'autorizada');
  const comStatus = ts.filter(t => t.situacao !== 'a_incluir');
  const btn = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:opacity-50';
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-3 lg:bottom-4 md:left-auto md:right-6 md:px-0">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button type="button" onClick={onLimpar} aria-label="Limpar seleção" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className="text-sm text-gray-800"><strong>{ts.length}</strong> selecionado(s) · <strong className="tabular-nums">{formatCurrency(soma(ts))}</strong></p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex">
          {salvando && <Loader2 className="h-5 w-5 animate-spin self-center text-gray-500" aria-hidden="true" />}
          {ehAdmin && aIncluir.length > 0 && (
            <button type="button" disabled={salvando} onClick={() => onAcao('incluir', aIncluir)} className={`${btn} bg-amber-400 text-gray-900 hover:bg-amber-500`}>
              <Landmark className="h-4 w-4" aria-hidden="true" /> Incluída no banco ({aIncluir.length})
            </button>
          )}
          {incluidas.length > 0 && (
            <button type="button" disabled={salvando} onClick={() => onAcao('autorizar', incluidas)} className={`${btn} bg-blue-700 text-white hover:bg-blue-800`}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Autorizada ({incluidas.length})
            </button>
          )}
          {ehAdmin && comStatus.length > 0 && (
            <button type="button" disabled={salvando} onClick={() => onAcao('reprogramar', comStatus)} className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>
              <CalendarClock className="h-4 w-4" aria-hidden="true" /> Data de pagamento
            </button>
          )}
          {autorizadas.length > 0 && (
            <button type="button" disabled={salvando} onClick={() => onAcao('desautorizar', autorizadas)} className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>
              <Undo2 className="h-4 w-4" aria-hidden="true" /> Voltar p/ aguardando
            </button>
          )}
          {ehAdmin && comStatus.length > 0 && (
            <button type="button" disabled={salvando} onClick={() => { if (window.confirm(`Desfazer a inclusão no banco de ${comStatus.length} título(s)? Eles voltam para "A incluir".`)) onAcao('desfazer', comStatus); }}
              className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>
              <Undo2 className="h-4 w-4" aria-hidden="true" /> Desfazer inclusão
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detalhe ─────────────────────────────────────────────────
function ModalTitulo({ t, onFechar, ehAdmin, podeAutorizar, salvando, erro, onAcao }) {
  if (!t) return null;
  const st = t.st;
  const linha = (rot, val) => val ? (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-0">
      <span className="text-gray-600">{rot}</span><span className="text-right font-medium text-gray-900">{val}</span>
    </div>
  ) : null;
  const btn = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 sm:h-10';
  return (
    <Modal open onClose={onFechar} title={t.fornecedor} size="md"
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {ehAdmin && st && (
            <button type="button" disabled={salvando} onClick={() => { if (window.confirm('Desfazer a inclusão no banco? O título volta para "A incluir".')) onAcao('desfazer', [t]); }}
              className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}><Undo2 className="h-4 w-4" aria-hidden="true" /> Desfazer inclusão</button>
          )}
          {ehAdmin && st && (
            <button type="button" disabled={salvando} onClick={() => onAcao('reprogramar', [t])}
              className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}><CalendarClock className="h-4 w-4" aria-hidden="true" /> Data de pagamento</button>
          )}
          {(ehAdmin || podeAutorizar) && t.situacao === 'autorizada' && (
            <button type="button" disabled={salvando} onClick={() => onAcao('desautorizar', [t])}
              className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}><Undo2 className="h-4 w-4" aria-hidden="true" /> Voltar p/ aguardando</button>
          )}
          {ehAdmin && (t.situacao === 'a_incluir' || t.mudou) && (
            <button type="button" disabled={salvando} onClick={() => onAcao('incluir', [t])}
              className={`${btn} bg-amber-400 text-gray-900 hover:bg-amber-500`}><Landmark className="h-4 w-4" aria-hidden="true" /> {t.mudou ? 'Atualizar inclusão' : 'Marcar incluída no banco'}</button>
          )}
          {(ehAdmin || podeAutorizar) && t.situacao === 'incluida' && (
            <button type="button" disabled={salvando} onClick={() => onAcao('autorizar', [t])}
              className={`${btn} bg-blue-700 text-white hover:bg-blue-800`}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Marcar como autorizada</button>
          )}
        </div>
      )}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-2xl font-bold tabular-nums text-gray-900">{formatCurrency(t.valor)}</p>
          <div className="flex flex-wrap gap-1.5">
            <ChipSituacao s={t.situacao} />
            {t.vencida && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Em atraso</span>}
            <ChipProgramacao t={t} />
          </div>
        </div>
        {t.mudou && (
          <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p>O título mudou no sistema depois da inclusão no banco: incluído com {formatCurrency(Number(st.valor || 0))}, vencimento {dataBR(st.vencimento)}. Confira o agendamento no banco.</p>
          </div>
        )}
        <div>
          {linha('Vencimento', `${dataBR(t.vencimento)} · ${diaSemana(t.vencimento)}`)}
          {t.vencimento !== t.vencimentoEfetivo && linha('Conta no dia', dataBR(t.vencimentoEfetivo))}
          {linha('Pagamento programado', t.dataPag && `${dataBR(t.dataPag)} · ${diaSemana(t.dataPag)}${t.programacao === 'antecipada' ? ' (antecipado)' : t.programacao === 'postergada' ? ' (vencida, paga depois)' : ''}`)}
          {linha('Empresa', t.empresaNome)}
          {linha('Documento', [t.documento, t.parcela && `parcela ${t.parcela}`].filter(Boolean).join(' · '))}
          {linha('Emissão', t.emissao && dataBR(t.emissao))}
          {linha('Conta gerencial', t.conta && [t.contaCodigo, t.conta].filter(Boolean).join(' · '))}
          {linha('Histórico', t.historico)}
        </div>
        <ol className="space-y-2 rounded-lg bg-gray-50 p-3 text-xs">
          <Passo feito rotulo="Lançada no sistema do cliente" />
          <Passo feito={!!st} rotulo={st ? `Incluída no banco${st.incluida_por_nome ? ` por ${st.incluida_por_nome}` : ''}` : 'Incluir no banco (CCI)'} quando={st && dataHoraBR(st.incluida_em)} />
          <Passo feito={st?.status === 'autorizada'} rotulo={st?.status === 'autorizada' ? `Autorizada${st.autorizada_por_nome ? ` por ${st.autorizada_por_nome}` : ''}` : 'Autorizar no banco (cliente)'} quando={st?.autorizada_em && dataHoraBR(st.autorizada_em)} />
        </ol>
        {erro && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">Não foi possível salvar: {erro}</p>}
      </div>
    </Modal>
  );
}

function Passo({ feito, rotulo, quando }) {
  return (
    <li className="flex items-start gap-2">
      {feito ? <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />}
      <span className={feito ? 'text-gray-900' : 'text-gray-500'}>{rotulo}{quando && <span className="block text-gray-500">{quando}</span>}</span>
    </li>
  );
}

// ─── Vencimento × dia de pagamento ───────────────────────────
// Compara o vencimento EFETIVO (fim de semana/feriado → próximo útil) com o
// dia de pagamento: antes = vencida (paga depois); depois = antecipada.
// Vencimento em fim de semana/feriado pago no 1º útil NÃO é vencida.
function relacaoComDia(t, dia) {
  if (!t.vencimentoEfetivo || !dia) return null;
  if (t.vencimentoEfetivo < dia) return 'vencida';
  if (t.vencimentoEfetivo > dia) return 'antecipada';
  return t.vencimento !== t.vencimentoEfetivo ? 'nao_util' : 'no_dia';
}

function ChipRelacao({ rel, t, curto = false }) {
  if (!rel || rel === 'no_dia') return null;
  const venc = dataBR(t.vencimento).slice(0, 5);
  const cfg = {
    vencida: ['bg-red-50 text-red-700 ring-red-200', AlertTriangle, curto ? 'Vencida' : `Vencida em ${venc}`],
    antecipada: ['bg-sky-50 text-sky-800 ring-sky-200', CalendarClock, curto ? 'Antecipada' : `Antecipada · vence ${venc}`],
    nao_util: ['bg-gray-100 text-gray-700 ring-gray-200', CalendarDays, curto ? 'Fim de semana/feriado' : `Venceu ${DIAS_CURTOS[paraData(t.vencimento).getDay()]} ${venc} (não útil)`],
  }[rel];
  const [cls, Ic, txt] = cfg;
  return (
    <span title={`Vencimento ${dataBR(t.vencimento)}${t.dia ? ` · pagamento ${dataBR(t.dia)}` : ''}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>
      <Ic className="h-3 w-3" aria-hidden="true" /> {txt}
    </span>
  );
}

// Na lista: relação do título com o dia em que ele vai ser pago
function ChipProgramacao({ t, curto = false }) {
  return <ChipRelacao rel={relacaoComDia(t, t.dia)} t={t} curto={curto} />;
}

// ─── Barra do "Do dia": escolher o dia + resumo + montar ─────
function BarraDia({ dia, setDia, hoje, diaDoDia, titulos, dias, diasDiferentes, pendentesCiclo, ehAdmin, onMontar, onConfigurar }) {
  const cont = { vencida: [], antecipada: [], no_dia: [] };
  titulos.forEach(t => {
    const r = relacaoComDia(t, dia);
    (r === 'vencida' ? cont.vencida : r === 'antecipada' ? cont.antecipada : cont.no_dia).push(t);
  });
  const inp = 'h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';
  const nav = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50';
  const item = (rot, ts, cls) => (
    <div className={`rounded-xl px-3 py-2 ${cls}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide">{rot}</p>
      <p className="text-sm font-bold tabular-nums">{ts.length} · {formatCurrency(soma(ts))}</p>
    </div>
  );
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-600">Dia de pagamento</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDia(proximoDiaPagamento(dia, dias, -1))} aria-label="Dia de pagamento anterior" className={nav}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
            <div className="w-40 sm:w-44"><InputData value={dia} onChange={e => e.target.value && setDia(e.target.value)} titulo="Dia de pagamento" className={inp} /></div>
            <button type="button" onClick={() => setDia(proximoDiaPagamento(dia, dias, 1))} aria-label="Próximo dia de pagamento" className={nav}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
            {dia !== diaDoDia && (
              <button type="button" onClick={() => setDia(diaDoDia)} className="h-10 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                {diaDoDia === hoje ? 'Hoje' : 'Próximo'}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-600">{diaSemana(dia)}{dia === hoje ? ' · hoje' : dia < hoje ? ' · já passou' : ''}</p>
          <p className="mt-0.5 text-xs text-gray-600">
            Dias de pagamento: <strong className="text-gray-800">{nomesDias(dias)}</strong>{diasDiferentes ? ' (varia por empresa)' : ''}
          </p>
          {!ehDiaPagamento(dia, dias) && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Não é dia de pagamento</p>
          )}
        </div>
        {ehAdmin && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onConfigurar}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:h-10">
              <Settings2 className="h-4 w-4" aria-hidden="true" /> Dias de pagamento
            </button>
            <button type="button" onClick={onMontar}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 sm:h-10">
              <ListPlus className="h-4 w-4" aria-hidden="true" /> Montar pagamento do dia
            </button>
          </div>
        )}
      </div>
      {ehAdmin && pendentesCiclo.length > 0 && dia >= hoje && (
        <button type="button" onClick={onMontar}
          className="mt-3 flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span><strong>{pendentesCiclo.length} conta(s)</strong> deste ciclo ainda fora do banco ({formatCurrency(soma(pendentesCiclo))}): vencidas e o que vence até o próximo dia de pagamento. Clique para montar.</span>
        </button>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {item('No vencimento', cont.no_dia, 'bg-gray-50 text-gray-800')}
        {item('Vencidas (pagas depois)', cont.vencida, 'bg-red-50 text-red-800')}
        {item('Antecipadas', cont.antecipada, 'bg-sky-50 text-sky-900')}
      </div>
    </div>
  );
}

// ─── Montar pagamento do dia ─────────────────────────────────
// Período de VENCIMENTO pra trás ou pra frente → marca o que será pago no dia.
// Título ainda não incluído: inclui no banco com a data. Já incluído: muda a data.
function ModalMontarDia({ dia, cicloAte, proximoPagamento, titulos, hoje, multiEmpresa, salvando, erro, onFechar, onConfirmar }) {
  // Ciclo: vencidas fora do banco + o que vence até a véspera do próximo dia de
  // pagamento (por empresa). Já vem tudo marcado.
  const doCiclo = (t) => t.situacao === 'a_incluir' && t.vencimentoEfetivo && t.vencimentoEfetivo <= cicloAte(t, dia);
  const [modo, setModo] = useState('ciclo');
  const [de, setDe] = useState(addDias(dia, -7));
  const [ate, setAte] = useState(addDias(dia, 7));
  const [soPendentes, setSoPendentes] = useState(true);
  const [sel, setSel] = useState(() => new Set(titulos.filter(doCiclo).map(t => t.k)));

  // "Já neste dia" = já incluídas no banco para esta data
  const noDia = titulos.filter(t => t.st && t.dia === dia);
  const candidatos = useMemo(() => titulos
    .filter(t => t.vencimento && !(t.st && t.dia === dia) && (modo === 'ciclo'
      ? (t.situacao === 'a_incluir' && t.vencimentoEfetivo && t.vencimentoEfetivo <= cicloAte(t, dia))
      : ((!de || t.vencimento >= de) && (!ate || t.vencimento <= ate) && (!soPendentes || t.situacao === 'a_incluir'))))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || b.valor - a.valor), [titulos, dia, de, ate, soPendentes, modo, cicloAte]);
  const escolhidos = candidatos.filter(t => sel.has(t.k));
  const todos = candidatos.length > 0 && candidatos.every(t => sel.has(t.k));
  const alternar = (k) => setSel(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const maisAntigo = titulos.reduce((m, t) => (t.vencimento && t.situacao === 'a_incluir' && (!m || t.vencimento < m) ? t.vencimento : m), null);
  const atalhos = [
    ['Vencidas até o dia', maisAntigo && maisAntigo < dia ? maisAntigo : addDias(dia, -30), addDias(dia, -1)],
    ['7 dias antes', addDias(dia, -7), addDias(dia, -1)],
    ['Só o dia', dia, dia],
    ['7 dias depois', addDias(dia, 1), addDias(dia, 7)],
    ['30 dias depois', addDias(dia, 1), addDias(dia, 30)],
  ];
  const inp = 'h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';
  const btn = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 sm:h-10';

  return (
    <Modal open onClose={onFechar} title={`Montar pagamento de ${dataBR(dia)}`} size="xl"
      footer={(
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-700"><strong>{escolhidos.length}</strong> selecionado(s) · <strong className="tabular-nums">{formatCurrency(soma(escolhidos))}</strong></p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={onFechar} className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>Cancelar</button>
            <button type="button" disabled={salvando || !escolhidos.length} onClick={() => onConfirmar(escolhidos)}
              className={`${btn} bg-blue-700 text-white hover:bg-blue-800`}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Landmark className="h-4 w-4" aria-hidden="true" />}
              Marcar como pagamento de {dataBR(dia).slice(0, 5)}
            </button>
          </div>
        </div>
      )}>
      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          Marque as contas que o banco vai pagar em <strong>{diaSemana(dia).toLowerCase()}, {dataBR(dia)}</strong>.
          As que ainda não estão no banco ficam como <em>incluídas, aguardando autorização</em>.
          {noDia.length > 0 && <span className="block text-xs text-gray-600">{noDia.length} conta(s) já estão neste dia ({formatCurrency(soma(noDia))}).</span>}
        </p>
        <div className="inline-flex w-full rounded-xl bg-gray-100 p-1 sm:w-auto" role="tablist">
          {[['ciclo', 'Ciclo do dia'], ['periodo', 'Escolher período']].map(([k, r]) => (
            <button key={k} type="button" role="tab" aria-selected={modo === k} onClick={() => setModo(k)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${modo === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              {r}
            </button>
          ))}
        </div>
        {modo === 'ciclo' ? (
          <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
            Vencidas que ainda não estão no banco + o que vence até <strong>{dataBR(addDias(proximoPagamento, -1))}</strong>, véspera do próximo dia de pagamento
            (<strong>{diaSemana(proximoPagamento).toLowerCase()}, {dataBR(proximoPagamento)}</strong>). Já vem tudo marcado; desmarque o que não for pagar.
          </p>
        ) : (<>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[10rem_10rem_1fr] sm:items-end">
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-600">Vencimento de</label>
            <InputData value={de} onChange={e => setDe(e.target.value)} titulo="Vencimento inicial" className={inp} />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-600">até</label>
            <InputData value={ate} onChange={e => setAte(e.target.value)} titulo="Vencimento final" className={inp} />
          </div>
          <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-1">
            {atalhos.map(([r, a, b]) => (
              <button key={r} type="button" onClick={() => { setDe(a); setAte(b); }}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${de === a && ate === b ? 'bg-blue-700 text-white ring-blue-700' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        </>)}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {modo === 'periodo' ? (
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-700" />
              Só as que ainda não estão no banco
            </label>
          ) : <span />}
          {candidatos.length > 0 && (
            <button type="button" onClick={() => setSel(todos ? new Set() : new Set(candidatos.map(t => t.k)))} className="text-sm font-semibold text-blue-700 hover:underline">
              {todos ? 'Desmarcar todas' : `Marcar todas (${candidatos.length})`}
            </button>
          )}
        </div>
        {modo === 'periodo' && de && ate && de > ate ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">A data inicial é maior que a final.</p>
        ) : candidatos.length === 0 ? (
          <p className="rounded-lg bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">Nenhuma conta com vencimento nesse período{soPendentes ? ' fora do banco' : ''}.</p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
            {candidatos.map(t => {
              const rel = relacaoComDia(t, dia);
              return (
                <li key={t.k}>
                  <label className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 transition hover:bg-blue-50/40 ${sel.has(t.k) ? 'bg-blue-50/60' : ''}`}>
                    <input type="checkbox" checked={sel.has(t.k)} onChange={() => alternar(t.k)} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-700" />
                    <span className="w-20 shrink-0 text-sm tabular-nums text-gray-800">
                      {dataBR(t.vencimento).slice(0, 5)}
                      <span className="block text-[10px] text-gray-500">{DIAS_CURTOS[paraData(t.vencimento).getDay()]}{t.vencimento < hoje ? ' · venceu' : ''}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">{t.fornecedor}</span>
                      <span className="block truncate text-[11px] text-gray-500">{[multiEmpresa ? t.empresaNome : null, t.conta || null, t.documento ? `Doc. ${t.documento}` : null].filter(Boolean).join(' · ') || ' '}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <ChipRelacao rel={rel} t={t} />
                        {t.situacao !== 'a_incluir' && <ChipSituacao s={t.situacao} curto />}
                        {t.st && t.dia && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">hoje no dia {dataBR(t.dia).slice(0, 5)}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(t.valor)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {erro && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">Não foi possível salvar: {erro}</p>}
      </div>
    </Modal>
  );
}

// ─── Data de pagamento (incluir no banco / reprogramar) ──────
// "No vencimento": cada título no seu vencimento (os já vencidos vão para a
// data escolhida, padrão hoje). "Em outra data": todos na mesma data
// (antecipa ou paga vencido depois).
function ModalProgramar({ dados, hoje, salvando, erro, onFechar, onConfirmar }) {
  const ts = dados?.ts || [];
  const vencidos = ts.filter(t => t.vencimentoEfetivo && t.vencimentoEfetivo < hoje);
  const unico = ts.length === 1 ? ts[0] : null;
  const inicial = unico?.dataPag || (ts.length > 0 && vencidos.length === ts.length ? hoje : '');
  const [modo, setModo] = useState(inicial ? 'data' : 'vencimento');
  const [data, setData] = useState(inicial || hoje);
  const [dataVencidos, setDataVencidos] = useState(hoje);
  if (!dados) return null;

  const incluir = dados.acao === 'incluir';
  const comVencidos = incluir && modo === 'vencimento' && vencidos.length > 0;
  const dataInvalida = (modo === 'data' && !data) || (comVencidos && !dataVencidos);
  const passado = (modo === 'data' && data && data < hoje) || (comVencidos && dataVencidos && dataVencidos < hoje);
  const antecipa = modo === 'data' && data ? ts.filter(t => t.vencimentoEfetivo && data < t.vencimentoEfetivo).length : 0;
  const posterga = modo === 'data' && data ? ts.filter(t => t.vencimentoEfetivo && data > t.vencimentoEfetivo).length : 0;

  const confirmar = () => {
    if (incluir) {
      const datas = new Map();
      ts.forEach(t => {
        if (modo === 'data') datas.set(t.k, data);
        else if (t.vencimentoEfetivo && t.vencimentoEfetivo < hoje) datas.set(t.k, dataVencidos);
      });
      onConfirmar({ datas });
    } else {
      onConfirmar({ data: modo === 'data' ? data : null });
    }
  };
  const opcao = (valor, titulo, desc) => (
    <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${modo === valor ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-200' : 'border-gray-200 hover:bg-gray-50'}`}>
      <input type="radio" name="modo-pagamento" checked={modo === valor} onChange={() => setModo(valor)} className="mt-0.5 h-4 w-4 text-blue-700" />
      <span><span className="block text-sm font-semibold text-gray-900">{titulo}</span><span className="block text-xs text-gray-600">{desc}</span></span>
    </label>
  );
  const inp = 'h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';
  const btn = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 sm:h-10';

  return (
    <Modal open onClose={onFechar} title={incluir ? 'Incluir no banco' : 'Data de pagamento'} size="sm"
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onFechar} className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>Cancelar</button>
          <button type="button" disabled={salvando || dataInvalida} onClick={confirmar}
            className={`${btn} ${incluir ? 'bg-amber-400 text-gray-900 hover:bg-amber-500' : 'bg-blue-700 text-white hover:bg-blue-800'}`}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : incluir ? <Landmark className="h-4 w-4" aria-hidden="true" /> : <CalendarClock className="h-4 w-4" aria-hidden="true" />}
            {incluir ? 'Marcar incluída no banco' : 'Salvar data'}
          </button>
        </div>
      )}>
      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          <strong>{ts.length}</strong> título(s) · <strong className="tabular-nums">{formatCurrency(soma(ts))}</strong>
          {unico && <span className="block text-xs text-gray-600">{unico.fornecedor} · vence {dataBR(unico.vencimento)}</span>}
        </p>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Quando o banco vai pagar?</p>
        {opcao('vencimento', 'No vencimento', unico ? `Em ${dataBR(unico.vencimentoEfetivo)}${vencidos.length ? ' (já vencido)' : ''}.` : 'Cada título na data do seu vencimento.')}
        {comVencidos && (
          <div className="ml-7 rounded-lg bg-red-50 p-3">
            <label className="mb-1 block text-xs font-semibold text-red-800">{vencidos.length} título(s) já vencido(s): pagar em</label>
            <InputData value={dataVencidos} onChange={e => setDataVencidos(e.target.value)} titulo="Data de pagamento dos vencidos" className={inp} />
          </div>
        )}
        {opcao('data', 'Em outra data', 'Antecipar o pagamento ou pagar um título vencido depois.')}
        {modo === 'data' && (
          <div className="ml-7 space-y-1">
            <InputData value={data} onChange={e => setData(e.target.value)} titulo="Data de pagamento" className={inp} />
            {(antecipa > 0 || posterga > 0) && (
              <p className="text-xs text-gray-600">
                {antecipa > 0 && <span className="font-semibold text-sky-800">{antecipa} antecipado(s)</span>}
                {antecipa > 0 && posterga > 0 && ' · '}
                {posterga > 0 && <span className="font-semibold text-orange-800">{posterga} depois do vencimento</span>}
              </p>
            )}
          </div>
        )}
        {passado && <p className="flex items-center gap-1.5 text-xs text-amber-800"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> A data escolhida já passou.</p>}
        {erro && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">Não foi possível salvar: {erro}</p>}
      </div>
    </Modal>
  );
}

// ─── Dias de pagamento por empresa (CCI) ─────────────────────
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // seg → dom
const MODELOS_DIAS = [['Seg, qua e sex', [1, 3, 5]], ['Seg e qui', [1, 4]], ['Ter e sex', [2, 5]], ['Todo dia útil', []]];

function ModalDiasPagamento({ empresas, diasMap, salvando, erro, onFechar, onSalvar }) {
  const [valores, setValores] = useState(() => new Map(empresas.map(e => [e.id, diasMap.get(e.id) || []])));
  const definir = (id, dias) => setValores(v => new Map(v).set(id, [...dias].sort()));
  const alternar = (id, d) => {
    const atual = valores.get(id) || [];
    definir(id, atual.includes(d) ? atual.filter(x => x !== d) : [...atual, d]);
  };
  const aplicarTodas = (dias) => setValores(new Map(empresas.map(e => [e.id, [...dias].sort()])));
  const btn = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 sm:h-10';

  return (
    <Modal open onClose={onFechar} title="Dias de pagamento" size="lg"
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onFechar} className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>Cancelar</button>
          <button type="button" disabled={salvando} onClick={() => onSalvar(empresas.map(e => ({ clienteId: e.id, dias: valores.get(e.id) || [] })))}
            className={`${btn} bg-blue-700 text-white hover:bg-blue-800`}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
          </button>
        </div>
      )}>
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          Em quais dias da semana o banco paga as contas deste cliente. Sem nenhum dia marcado, vale qualquer dia útil.
          Feriados e fins de semana nunca são dias de pagamento.
        </p>
        {empresas.length > 1 && (
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Aplicar a todas as empresas</p>
            <div className="flex flex-wrap gap-1.5">
              {MODELOS_DIAS.map(([r, d]) => (
                <button key={r} type="button" onClick={() => aplicarTodas(d)}
                  className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100">{r}</button>
              ))}
            </div>
          </div>
        )}
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {empresas.map(e => {
            const dias = valores.get(e.id) || [];
            return (
              <li key={e.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{e.nome}</p>
                  <p className="text-xs text-gray-600">{nomesDias(dias)}</p>
                </div>
                <div className="flex flex-wrap gap-1" role="group" aria-label={`Dias de pagamento de ${e.nome}`}>
                  {ORDEM_DIAS.map(d => {
                    const on = dias.includes(d);
                    return (
                      <button key={d} type="button" onClick={() => alternar(e.id, d)} aria-pressed={on}
                        className={`h-9 w-11 rounded-lg text-xs font-semibold ring-1 transition ${on ? 'bg-blue-700 text-white ring-blue-700' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'}`}>
                        {DIAS_CURTOS[d]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
        {erro && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">Não foi possível salvar: {erro}</p>}
      </div>
    </Modal>
  );
}

// ─── Cliente: só o pagamento do dia ──────────────────────────
// Contas que a CCI já marcou (incluídas no banco) para o dia. As setas pulam
// entre os dias que têm contas marcadas.
function PagamentoDoDiaCliente({ dia, setDia, hoje, diaDoDia, lista, dias, podeAutorizar, salvando, onAcao, listaProps }) {
  const marcadas = lista.filter(t => t.st && t.dia === dia);
  const diasMarcados = [...new Set(lista.filter(t => t.st && t.dia).map(t => t.dia))].sort();
  const anterior = [...diasMarcados].reverse().find(d => d < dia);
  const proximo = diasMarcados.find(d => d > dia);
  const aguardando = marcadas.filter(t => t.situacao === 'incluida');
  const autorizadas = marcadas.filter(t => t.situacao === 'autorizada');
  const cont = { vencida: 0, antecipada: 0 };
  marcadas.forEach(t => { const r = relacaoComDia(t, dia); if (r in cont) cont[r] += 1; });
  const nav = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40';

  return (
    <>
      <div className="rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => anterior && setDia(anterior)} disabled={!anterior} aria-label="Pagamento anterior" className={nav}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-0 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              Pagamento {dia === hoje ? 'de hoje' : dia < hoje ? 'de' : 'previsto para'}
            </p>
            <p className="text-base font-bold text-gray-900">{diaSemana(dia)}, {dataBR(dia)}</p>
          </div>
          <button type="button" onClick={() => proximo && setDia(proximo)} disabled={!proximo} aria-label="Próximo pagamento" className={nav}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-center text-3xl font-bold tabular-nums text-gray-900">{formatCurrency(soma(marcadas))}</p>
        <p className="mt-1 text-center text-sm text-gray-600">
          {marcadas.length} conta(s)
          {marcadas.length > 0 && <> · {autorizadas.length} autorizada(s){aguardando.length > 0 && <> · <strong className="text-amber-800">{aguardando.length} aguardando sua autorização</strong></>}</>}
        </p>
        {(cont.vencida > 0 || cont.antecipada > 0) && (
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {cont.vencida > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">{cont.vencida} vencida(s)</span>}
            {cont.antecipada > 0 && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200">{cont.antecipada} antecipada(s)</span>}
          </div>
        )}

        {podeAutorizar && aguardando.length > 0 && (
          <button type="button" disabled={salvando} onClick={() => onAcao('autorizar', aguardando)}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            Marcar todas como autorizadas ({aguardando.length} · {formatCurrency(soma(aguardando))})
          </button>
        )}

        {dia !== diaDoDia && (
          <button type="button" onClick={() => setDia(diaDoDia)} className="mt-3 w-full text-center text-sm font-semibold text-blue-700 hover:underline">
            Voltar para {diaDoDia === hoje ? 'hoje' : `o próximo dia de pagamento (${dataBR(diaDoDia).slice(0, 5)})`}
          </button>
        )}
      </div>

      {marcadas.length > 0 ? (
        <ListaTitulos titulo="Contas deste pagamento" titulos={marcadas} agruparPorDia={false}
          vazio="" {...listaProps} />
      ) : (
        <div className="rounded-2xl border border-gray-200/60 bg-white px-6 py-10 text-center shadow-sm">
          <CalendarDays className="mx-auto mb-2 h-8 w-8 text-gray-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-900">Nenhuma conta marcada para pagamento neste dia.</p>
          {proximo && (
            <button type="button" onClick={() => setDia(proximo)} className="mt-2 text-sm font-semibold text-blue-700 hover:underline">
              Ver o próximo pagamento: {diaSemana(proximo).toLowerCase()}, {dataBR(proximo)}
            </button>
          )}
          {dias?.length > 0 && <p className="mt-2 text-xs text-gray-600">Dias de pagamento: {nomesDias(dias)}</p>}
        </div>
      )}
    </>
  );
}

// ─── Cliente: confirmar autorização ──────────────────────────
function ModalConfirmarAutorizacao({ ts, multiEmpresa, salvando, erro, onFechar, onConfirmar }) {
  const btn = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 sm:h-10';
  return (
    <Modal open onClose={salvando ? () => {} : onFechar} title="Confirmar autorização" size="md"
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onFechar} disabled={salvando} className={`${btn} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>Cancelar</button>
          <button type="button" onClick={onConfirmar} disabled={salvando} className={`${btn} bg-blue-700 text-white hover:bg-blue-800`}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            Sim, já autorizei no banco
          </button>
        </div>
      )}>
      <div className="space-y-3">
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Confirme só se você <strong>já autorizou</strong> estes pagamentos no aplicativo ou site do banco. A CCI vai considerá-los liberados para pagamento.</p>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-gray-700"><strong>{ts.length}</strong> conta(s)</p>
          <p className="text-xl font-bold tabular-nums text-gray-900">{formatCurrency(soma(ts))}</p>
        </div>
        <ul className="max-h-[40vh] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
          {ts.map(t => (
            <li key={t.k} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900">{t.fornecedor}</span>
                <span className="block truncate text-[11px] text-gray-500">
                  {[`Venc. ${dataBR(t.vencimento)}`, t.dia ? `pagamento ${dataBR(t.dia).slice(0, 5)}` : null, t.conta || null, multiEmpresa ? t.empresaNome : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(t.valor)}</span>
            </li>
          ))}
        </ul>
        {erro && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">Não foi possível salvar: {erro}</p>}
      </div>
    </Modal>
  );
}
