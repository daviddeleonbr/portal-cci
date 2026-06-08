// Admin · Webposto Sincronia
//
// Controla o cache de vendas Webposto NO NÍVEL DA REDE. Por rede:
//   - Toggle "sincronia automática" (cron noturno cobre todas as empresas)
//   - Grade dos últimos 24 meses com status agregado (ok = todas as
//     empresas têm vendas no mês, parcial = algumas, cinza = nenhuma)
//   - Backfill manual de meses → cria 1 job por (empresa × mês)
//   - Histórico de jobs (realtime)

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, Network, CheckCircle2, Clock,
  Play, Search, ChevronRight, ChevronDown, Building2, Info, X,
  Zap, Calendar, AlertTriangle,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import { useAdminSession } from '../hooks/useAuth';
import * as syncService from '../services/webpostoSyncService';
import * as mapService from '../services/mapeamentoService';

function fmtDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function getMesesAnteriores(n) {
  const out = [];
  const hoje = new Date();
  hoje.setDate(1);
  for (let i = 0; i < n; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    out.push({
      ano: d.getFullYear(),
      mes: d.getMonth() + 1,
      ym:  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    });
  }
  return out;
}

const MESES = getMesesAnteriores(24);

const STATUS_CELULA = {
  ok:           { bg: 'bg-emerald-500 text-white',                  label: 'Completo' },
  parcial:      { bg: 'bg-amber-500 text-white',                    label: 'Parcial' },
  // aguardando ANIMA também — jobs ficam aguardando enquanto a fila do
  // semáforo de invokes não libera, e o usuário precisa ver atividade.
  rodando:      { bg: 'bg-blue-500 text-white animate-pulse',       label: 'Rodando' },
  aguardando:   { bg: 'bg-blue-400 text-white animate-pulse',       label: 'Aguardando' },
  erro:         { bg: 'bg-rose-500 text-white',                     label: 'Erro' },
  nao_importado:{ bg: 'bg-gray-100 text-gray-400',                  label: 'Não importado' },
};

export default function AdminWebpostoSync() {
  const session = useAdminSession();
  const usuarioId = session?.usuario?.id;

  const [chavesApi, setChavesApi]       = useState([]);
  const [configRede, setConfigRede]     = useState([]);
  const [configEmp, setConfigEmp]       = useState([]);
  const [jobs, setJobs]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [busca, setBusca]               = useState('');
  const [redeExpandida, setRedeExpandida] = useState(null);
  const [coberturaPorRede, setCoberturaPorRede] = useState({}); // chave_api_id → mapa
  const [coberturaCarregando, setCoberturaCarregando] = useState(new Set()); // chave_api_id em loading
  const [mesesSelecionados, setMesesSelecionados] = useState(new Set()); // 'rede|ym'
  // Subset de empresas por rede (Map<chaveApiId, Set<empresa_codigo>>).
  // Vazio/ausente = sincronizar TODAS as empresas dessa rede.
  const [empresasSelPorRede, setEmpresasSelPorRede] = useState(new Map());
  // Modal de detalhe por empresa (duplo-clique no mês)
  const [modalDetalheMes, setModalDetalheMes] = useState(null); // { chaveApiId, redeNome, ano, mes, ym, label }
  const [detalheEmpresas, setDetalheEmpresas] = useState(null); // array do RPC
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [toast, setToast]               = useState(null);
  const [disparando, setDisparando]     = useState(false);
  const [limpandoTravados, setLimpandoTravados] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [chs, cfgRede, cfgEmp, js] = await Promise.all([
        mapService.listarChavesApi(),
        syncService.listarConfigRede(),
        syncService.listarConfigPorEmpresa(),
        syncService.listarJobs({ limit: 100 }),
      ]);
      setChavesApi(chs.filter(c => c.provedor === 'quality' || !c.provedor));
      setConfigRede(cfgRede);
      setConfigEmp(cfgEmp);
      setJobs(js);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Recarga LEVE — usada pelo Realtime e pelo polling fallback. Só
  // recarrega o que pode mudar durante a vida útil dos jobs, sem refazer
  // a query de chaves_api (que é a parte mais pesada).
  const recarregarLeve = useCallback(async () => {
    try {
      const [cfgRede, cfgEmp, js] = await Promise.all([
        syncService.listarConfigRede(),
        syncService.listarConfigPorEmpresa(),
        syncService.listarJobs({ limit: 100 }),
      ]);
      setConfigRede(cfgRede); setConfigEmp(cfgEmp); setJobs(js);
      if (redeExpandida) {
        const mapa = await syncService.coberturaPorMesRede({ chaveApiId: redeExpandida });
        setCoberturaPorRede(prev => ({ ...prev, [redeExpandida]: mapa }));
      }
    } catch { /* noop */ }
  }, [redeExpandida]);

  // Realtime
  useEffect(() => {
    const ch = syncService.escutarJobs(() => { recarregarLeve(); });
    return () => syncService.desescutar(ch);
  }, [recarregarLeve]);

  // Polling fallback (5s): Realtime do Supabase pode perder eventos quando
  // há muitas mudanças simultâneas (>10 jobs). Enquanto houver QUALQUER
  // job ativo (rodando/aguardando), repolla a cada 5s. Para automaticamente
  // quando tudo termina — não consome recursos em estado idle.
  useEffect(() => {
    const haAtivos = jobs.some(j => j.status === 'rodando' || j.status === 'aguardando');
    if (!haAtivos) return;
    const id = setInterval(() => { recarregarLeve(); }, 5000);
    return () => clearInterval(id);
  }, [jobs, recarregarLeve]);

  // Auto-cancel de jobs travados (rodando há mais de 5 min). Provavelmente
  // foram mortos pelo timeout da edge function sem chegar ao catch. Não
  // espera o usuário clicar — cancela na hora, com 5s de "graça" pra ele
  // ver o aviso. Usa Set de IDs já programados pra evitar agendar 2x.
  const cancelarAgendados = useRef(new Set());
  useEffect(() => {
    const limite = Date.now() - 5 * 60 * 1000;
    const travados = jobs.filter(j =>
      j.status === 'rodando'
      && j.iniciado_em
      && new Date(j.iniciado_em).getTime() < limite
      && !cancelarAgendados.current.has(j.id),
    );
    if (travados.length === 0) return;
    travados.forEach(j => cancelarAgendados.current.add(j.id));
    setToast({
      tipo: 'error',
      mensagem: `${travados.length} job(s) travado(s) há +5min — cancelando em 5s...`,
    });
    const t = setTimeout(async () => {
      for (const j of travados) {
        try { await syncService.cancelarJob(j.id, 'Auto-cancelado: rodando há mais de 5 min sem progresso (provável timeout da edge function)'); }
        catch { /* segue */ }
      }
      await recarregarLeve();
      setToast({ tipo: 'success', mensagem: `${travados.length} job(s) travado(s) cancelado(s)` });
    }, 5000);
    return () => clearTimeout(t);
  }, [jobs, recarregarLeve]);

  const cfgRedeMap = useMemo(() => {
    const m = new Map();
    configRede.forEach(c => m.set(c.chave_api_id, c));
    return m;
  }, [configRede]);

  const cfgEmpMap = useMemo(() => {
    const m = new Map();
    configEmp.forEach(c => m.set(`${c.chave_api_id}|${c.empresa_codigo}`, c));
    return m;
  }, [configEmp]);

  // Agrupa chavesApi (= redes) com suas empresas
  const redes = useMemo(() => {
    return chavesApi.map(ch => ({
      id: ch.id,
      nome: ch.nome,
      empresas: (ch.clientes || []).filter(cl => cl.empresa_codigo != null),
    })).sort((a, b) => (a.nome || '').localeCompare(b.nome));
  }, [chavesApi]);

  const redesFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return redes;
    return redes.filter(r =>
      (r.nome || '').toLowerCase().includes(q) ||
      r.empresas.some(e =>
        (e.nome || '').toLowerCase().includes(q) ||
        String(e.cnpj || '').includes(q),
      ),
    );
  }, [redes, busca]);

  const expandirRede = async (chaveApiId) => {
    if (redeExpandida === chaveApiId) { setRedeExpandida(null); return; }
    setRedeExpandida(chaveApiId);
    if (!coberturaPorRede[chaveApiId]) {
      setCoberturaCarregando(prev => new Set(prev).add(chaveApiId));
      try {
        const mapa = await syncService.coberturaPorMesRede({ chaveApiId });
        setCoberturaPorRede(prev => ({ ...prev, [chaveApiId]: mapa }));
      } catch (err) {
        setToast({ tipo: 'error', mensagem: 'Falha ao carregar cobertura: ' + err.message });
      } finally {
        setCoberturaCarregando(prev => {
          const n = new Set(prev); n.delete(chaveApiId); return n;
        });
      }
    }
  };

  const alternarSincronia = async (chaveApiId, ativo) => {
    try {
      await syncService.alternarAtivoRede(chaveApiId, ativo);
      await carregar();
      setToast({ tipo: 'success', mensagem: ativo ? 'Sincronia ativada' : 'Sincronia desativada' });
    } catch (err) {
      setToast({ tipo: 'error', mensagem: err.message });
    }
  };

  const toggleMes = (chaveApiId, ym) => {
    const k = `${chaveApiId}|${ym}`;
    setMesesSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  // Conta jobs travados (rodando há mais de 30 min) — provavelmente
  // foram mortos pelo timeout da edge function sem chegar ao catch.
  const jobsTravados = useMemo(() => {
    const limite = Date.now() - 30 * 60 * 1000;
    return jobs.filter(j =>
      j.status === 'rodando'
      && j.iniciado_em
      && new Date(j.iniciado_em).getTime() < limite,
    ).length;
  }, [jobs]);

  // Agrupa jobs em batches por (rede, período, tipo) com 2 níveis de
  // consolidação:
  //
  //   1) BACKFILL MENSAL agrupa por ANO-MÊS — as 2 quinzenas (01-15 e
  //      16-EOM) viram UMA linha por empresa, com os jobs reais como
  //      "sub-jobs". Outros tipos (cron_diario, manual) mantêm a janela
  //      exata como chave.
  //
  //   2) Dentro do batch, cada EMPRESA aparece 1x: se o backfill mensal
  //      gerou 2 jobs pra ela, o "job lógico" da empresa é a FUSÃO dos 2
  //      (status mais severo, vendas/itens somados). Se um re-disparo
  //      criou um job mais recente, ele substitui o anterior na mesma
  //      janela.
  const jobsAgrupados = useMemo(() => {
    // Chave do batch — backfill_mensal agrupa por mês, resto por janela.
    const chaveBatch = (j) => {
      if (j.tipo === 'backfill_mensal') {
        const ym = String(j.data_de).slice(0, 7);
        return `${j.chave_api_id}|${ym}|${j.tipo}`;
      }
      return `${j.chave_api_id}|${j.data_de}|${j.data_ate}|${j.tipo}`;
    };
    const mapa = new Map();
    jobs.forEach(j => {
      const key = chaveBatch(j);
      let cur = mapa.get(key);
      if (!cur) {
        cur = {
          key,
          chave_api_id: j.chave_api_id,
          data_de: j.data_de,
          data_ate: j.data_ate,
          tipo: j.tipo,
          criado_em: j.criado_em,
          // Mapa empresa_codigo → { _subjobs: [job, ...] }
          jobsPorEmpresa: new Map(),
        };
        mapa.set(key, cur);
      }
      // Janela do batch é a UNIÃO das janelas dos jobs (mês inteiro).
      if (String(j.data_de)  < String(cur.data_de))  cur.data_de  = j.data_de;
      if (String(j.data_ate) > String(cur.data_ate)) cur.data_ate = j.data_ate;
      if (new Date(j.criado_em) > new Date(cur.criado_em)) cur.criado_em = j.criado_em;
      // Bucket por empresa coleta TODOS os jobs (q1, q2, re-disparos).
      const empKey = String(j.empresa_codigo);
      let bucket = cur.jobsPorEmpresa.get(empKey);
      if (!bucket) {
        bucket = { empresa_codigo: j.empresa_codigo, _subjobs: [] };
        cur.jobsPorEmpresa.set(empKey, bucket);
      }
      bucket._subjobs.push(j);
    });
    // Prioridade pra escolher o status do "job lógico" da empresa
    const PRIO = { rodando: 4, aguardando: 3, erro: 2, ok: 1 };
    const fundirSubjobs = (subjobs) => {
      // Quando há re-disparo na MESMA janela (mesmo data_de/data_ate),
      // só o mais recente conta. Senão (quinzenas distintas), TODOS contam.
      const porJanela = new Map();
      subjobs.forEach(sj => {
        const k = `${sj.data_de}|${sj.data_ate}`;
        const cur = porJanela.get(k);
        if (!cur || new Date(sj.criado_em) > new Date(cur.criado_em)) {
          porJanela.set(k, sj);
        }
      });
      const candidatos = Array.from(porJanela.values());
      // Suprime jobs cuja janela engloba ESTRITAMENTE outras janelas do
      // mesmo bucket — são leftovers do esquema antigo (1 job por mês).
      // Hoje cada mês são 2 jobs (Q1/Q2); um job de 01→31 coexistindo
      // com Q1 (01→15) + Q2 (16→31) é redundante e deve ser ignorado na
      // visualização (provavelmente está zumbi por timeout e vai ser
      // limpo pelo reaper de "jobs travados").
      const englobaEstritamente = (a, b) => (
        String(a.data_de)  <= String(b.data_de) &&
        String(a.data_ate) >= String(b.data_ate) &&
        (String(a.data_de) < String(b.data_de) || String(a.data_ate) > String(b.data_ate))
      );
      const efetivos = candidatos.filter(a =>
        !candidatos.some(b => a !== b && englobaEstritamente(a, b))
      );
      let status = 'ok';
      let vendas = 0, itens = 0, canc = 0;
      let erroMsg = null;
      let maisRecente = efetivos[0];
      efetivos.forEach(j => {
        if ((PRIO[j.status] || 0) > (PRIO[status] || 0)) status = j.status;
        vendas += j.vendas_inseridas || 0;
        itens  += j.itens_inseridos  || 0;
        canc   += j.vendas_canceladas_marcadas || 0;
        if (j.erro_mensagem && !erroMsg) erroMsg = j.erro_mensagem;
        if (new Date(j.criado_em) > new Date(maisRecente.criado_em)) maisRecente = j;
      });
      return {
        ...maisRecente,        // herda id, data_de, data_ate, tipo, chave_api_id, empresa_codigo
        status,
        vendas_inseridas: vendas,
        itens_inseridos: itens,
        vendas_canceladas_marcadas: canc,
        erro_mensagem: erroMsg,
        _subjobs: efetivos.sort((a, b) => String(a.data_de).localeCompare(String(b.data_de))),
      };
    };
    // Consolida batches
    const agrupados = Array.from(mapa.values()).map(b => {
      const jobsArr = Array.from(b.jobsPorEmpresa.values())
        .map(bucket => fundirSubjobs(bucket._subjobs));
      const cont = { ok: 0, rodando: 0, aguardando: 0, erro: 0 };
      let vendas = 0, itens = 0, canc = 0;
      jobsArr.forEach(j => {
        cont[j.status] = (cont[j.status] || 0) + 1;
        vendas += j.vendas_inseridas || 0;
        itens  += j.itens_inseridos  || 0;
        canc   += j.vendas_canceladas_marcadas || 0;
      });
      const total = jobsArr.length;
      let statusAg = 'ok';
      if (cont.rodando + cont.aguardando > 0) statusAg = 'rodando';
      else if (cont.erro === total) statusAg = 'erro';
      else if (cont.erro > 0)        statusAg = 'parcial';
      return { ...b, jobs: jobsArr, total, cont, statusAg, totais: { vendas, itens, canc } };
    });
    return agrupados.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  }, [jobs]);

  // Auto-cancelamento de jobs ZUMBI do esquema antigo (1 job/mês):
  // depois da migração pra particionamento em quinzenas, jobs antigos
  // com janela englobando completamente as novas (ex: 01→31 vs 01→15 +
  // 16→31) ficam rodando eternamente por timeout da edge function.
  // Detectamos e cancelamos sem esperar o reaper de 30min.
  const autoCancelados = useRef(new Set());
  useEffect(() => {
    if (!jobs?.length) return;
    // Agrupa por (chave_api_id, empresa_codigo, ano-mes) — mesmo bucket
    // usado na visualização. Pra cada bucket, jobs ativos cuja janela
    // engloba outras viram alvo de cancelamento.
    const buckets = new Map();
    jobs.forEach(j => {
      if (j.tipo !== 'backfill_mensal') return;
      const ym = String(j.data_de).slice(0, 7);
      const k = `${j.chave_api_id}|${j.empresa_codigo}|${ym}`;
      const arr = buckets.get(k) || [];
      arr.push(j);
      buckets.set(k, arr);
    });
    const alvos = [];
    buckets.forEach(arr => {
      arr.forEach(a => {
        if (a.status !== 'rodando' && a.status !== 'aguardando') return;
        if (autoCancelados.current.has(a.id)) return;
        const englobaOutra = arr.some(b => a !== b &&
          String(a.data_de)  <= String(b.data_de) &&
          String(a.data_ate) >= String(b.data_ate) &&
          (String(a.data_de) < String(b.data_de) || String(a.data_ate) > String(b.data_ate))
        );
        if (englobaOutra) alvos.push(a);
      });
    });
    if (alvos.length === 0) return;
    alvos.forEach(j => autoCancelados.current.add(j.id));
    (async () => {
      for (const j of alvos) {
        try {
          await syncService.cancelarJob(j.id,
            'Cancelado automaticamente — janela substituída por quinzenas (esquema antigo, provavelmente zumbi de timeout)');
        } catch { /* segue cancelando os demais */ }
      }
      await carregar();
    })();
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const [batchesExpandidos, setBatchesExpandidos] = useState(() => new Set());
  const toggleBatch = (key) => setBatchesExpandidos(prev => {
    const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n;
  });
  // Buckets-empresa expandidos: chave = `${batchKey}|${empresa_codigo}`.
  // Quando um bucket está expandido, listamos as quinzenas (subjobs) como
  // sub-linhas debaixo da empresa.
  const [bucketsExpandidos, setBucketsExpandidos] = useState(() => new Set());
  const toggleBucket = (batchKey, empresaCodigo) => setBucketsExpandidos(prev => {
    const k = `${batchKey}|${empresaCodigo}`;
    const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });

  // Cancela 1 job (ou todos os subjobs ativos de um job lógico fundido).
  const cancelarUmJob = async (jobOrId) => {
    // Permite tanto string (id) quanto objeto (com possíveis _subjobs)
    const ehObjeto = typeof jobOrId === 'object' && jobOrId !== null;
    const subs = ehObjeto && Array.isArray(jobOrId._subjobs) && jobOrId._subjobs.length > 1
      ? jobOrId._subjobs.filter(s => s.status === 'rodando' || s.status === 'aguardando')
      : null;
    const ids = subs?.length ? subs.map(s => s.id) : [ehObjeto ? jobOrId.id : jobOrId];
    const msg = ids.length > 1
      ? `Cancelar os ${ids.length} jobs ativos dessa empresa? Ficarão marcados como "erro" e você poderá disparar o backfill novamente.`
      : 'Cancelar esse job? Ele ficará marcado como "erro" e você poderá disparar o backfill novamente.';
    if (!confirm(msg)) return;
    try {
      for (const id of ids) {
        await syncService.cancelarJob(id);
      }
      await carregar();
      setToast({ tipo: 'success', mensagem: `${ids.length} job(s) cancelado(s)` });
    } catch (err) { setToast({ tipo: 'error', mensagem: err.message }); }
  };

  // Re-dispara o sync de uma empresa. Quando o "job" passado é o LÓGICO
  // (fundido das 2 quinzenas), re-dispara apenas as subjanelas que estão
  // em erro — não o mês inteiro, evitando refazer quinzenas já OK.
  const redispararEmpresa = async (job) => {
    const alvos = (job._subjobs && job._subjobs.length > 1)
      ? job._subjobs.filter(s => s.status === 'erro')
      : [job];
    if (alvos.length === 0) return;
    try {
      for (const j of alvos) {
        await syncService.dispararBackfillJanela({
          chaveApiId: j.chave_api_id,
          empresaCodigo: j.empresa_codigo,
          dataDe: j.data_de,
          dataAte: j.data_ate,
          tipo: j.tipo || 'backfill_mensal',
          usuarioId,
        });
      }
      await carregar();
      setToast({ tipo: 'success', mensagem: `${alvos.length} job(s) re-disparado(s)` });
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro: ' + err.message });
    }
  };

  const limparTravados = async () => {
    if (!confirm(`Marcar como erro os ${jobsTravados} job(s) travados há mais de 30 min?`)) return;
    setLimpandoTravados(true);
    try {
      const n = await syncService.cancelarJobsTravados(30);
      await carregar();
      setToast({ tipo: 'success', mensagem: `${n} job(s) marcado(s) como erro` });
    } catch (err) {
      setToast({ tipo: 'error', mensagem: err.message });
    } finally { setLimpandoTravados(false); }
  };

  // ─── Monitoramento do cron noturno ────────────────────────
  // Carrega execuções recentes do tipo `cron_diario` separadamente — não
  // vem junto com `jobs` (limite 100) porque o histórico mensal de
  // backfill domina.
  const [execucoesCron, setExecucoesCron] = useState([]);
  const [loadingCron, setLoadingCron] = useState(false);
  const [disparandoCron, setDisparandoCron] = useState(false);

  const recarregarCron = useCallback(async () => {
    setLoadingCron(true);
    try {
      const lista = await syncService.listarExecucoesCron({ horas: 168, limit: 500 });
      setExecucoesCron(lista);
    } catch { /* noop */ }
    finally { setLoadingCron(false); }
  }, []);

  useEffect(() => { recarregarCron(); }, [recarregarCron]);

  // Exclui jobs em status 'erro'. Pode filtrar por tipo ('cron_diario'
  // pra limpar só erros do cron, ou null pra tudo).
  const [excluindoErros, setExcluindoErros] = useState(false);
  const limparErros = async (tipo = null) => {
    const escopo = tipo === 'cron_diario' ? 'do CRON' : 'do histórico';
    if (!confirm(`Excluir DEFINITIVAMENTE todos os jobs em erro ${escopo}? Não dá pra desfazer.`)) return;
    setExcluindoErros(true);
    try {
      const n = await syncService.excluirJobsErro({ tipo });
      await Promise.all([recarregarLeve(), recarregarCron()]);
      setToast({ tipo: 'success', mensagem: `${n} job(s) em erro excluído(s)` });
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro: ' + err.message });
    } finally { setExcluindoErros(false); }
  };

  // Cancela todos os jobs ATIVOS (rodando/aguardando) de uma rajada do cron.
  // Útil quando uma rajada com janela enorme (auto-extensão) está demorando.
  const cancelarRajada = async (rajada) => {
    const ativos = (rajada.jobs || []).filter(j => j.status === 'rodando' || j.status === 'aguardando');
    if (ativos.length === 0) return;
    if (!confirm(`Cancelar ${ativos.length} job(s) ativo(s) dessa rajada? Ficarão marcados como erro.`)) return;
    try {
      for (const j of ativos) {
        await syncService.cancelarJob(j.id, 'Rajada cancelada manualmente pelo admin');
      }
      await Promise.all([recarregarCron(), recarregarLeve()]);
      setToast({ tipo: 'success', mensagem: `${ativos.length} job(s) cancelado(s)` });
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro: ' + err.message });
    }
  };

  // Progresso da fila enquanto processa
  const [progressoFila, setProgressoFila] = useState(null); // { processados, total }

  const forcarCron = async () => {
    if (!confirm('Disparar a sincronia automática AGORA pra todas as redes ativas?')) return;
    setDisparandoCron(true);
    try {
      // 1) Cria jobs em 'aguardando' via batch
      const r = await syncService.dispararSincroniaAutomaticaAgora();
      const qtd = r?.jobs_criados ?? 0;
      const redes = r?.redes_ativas ?? 0;
      if (qtd === 0) {
        setToast({ tipo: 'error', mensagem: 'Nenhum job criado — verifique se há redes ativas com empresas cadastradas.' });
        return;
      }
      setToast({ tipo: 'success', mensagem: `${qtd} job(s) criado(s) em ${redes} rede(s). Disparando workers...` });
      await recarregarCron();
      await recarregarLeve();

      // 2) Dispara os workers DO NAVEGADOR (sem depender de pg_net/background
      // tasks). Cada invoke abre uma conexão TCP do browser que fica aberta
      // até o worker terminar — sem risco de morrer prematuramente.
      setProgressoFila({ processados: 0, total: qtd });
      const resultado = await syncService.processarFilaAguardando({
        tipo: 'cron_diario',
        paralelismo: 6,
        onProgresso: (proc, tot) => setProgressoFila({ processados: proc, total: tot }),
      });
      setProgressoFila(null);
      if (resultado.erro > 0) {
        setToast({ tipo: 'error', mensagem: `${resultado.ok} ok, ${resultado.erro} erro de ${resultado.total} workers.` });
      } else {
        setToast({ tipo: 'success', mensagem: `${resultado.ok}/${resultado.total} workers concluíram com sucesso.` });
      }
      await Promise.all([recarregarCron(), recarregarLeve()]);
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Falha: ' + err.message });
    } finally {
      setDisparandoCron(false);
      setProgressoFila(null);
    }
  };

  // Processa qualquer job que ficou em 'aguardando' parado (cron real
  // rodou sem disparar workers, ou disparo do navegador foi interrompido).
  const processarFilaParada = async () => {
    const ativos = jobs.filter(j => j.status === 'aguardando').length;
    if (ativos === 0) {
      setToast({ tipo: 'success', mensagem: 'Sem jobs aguardando.' });
      return;
    }
    if (!confirm(`Disparar workers pros ${ativos} job(s) que estão em "aguardando"?`)) return;
    setDisparandoCron(true);
    setProgressoFila({ processados: 0, total: ativos });
    try {
      const r = await syncService.processarFilaAguardando({
        paralelismo: 6,
        onProgresso: (proc, tot) => setProgressoFila({ processados: proc, total: tot }),
      });
      setProgressoFila(null);
      setToast({ tipo: r.erro > 0 ? 'error' : 'success',
        mensagem: `${r.ok}/${r.total} workers concluídos${r.erro > 0 ? ` · ${r.erro} erro` : ''}` });
      await Promise.all([recarregarCron(), recarregarLeve()]);
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Falha: ' + err.message });
    } finally {
      setDisparandoCron(false);
      setProgressoFila(null);
    }
  };

  // Agrupa execuções do cron em "rajadas" (jobs criados dentro de uma
  // janela de 10 min são da mesma execução do orquestrador).
  const rajadasCron = useMemo(() => {
    const sorted = [...execucoesCron].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
    const rajadas = [];
    sorted.forEach(j => {
      const ts = new Date(j.criado_em).getTime();
      const ultima = rajadas[rajadas.length - 1];
      if (!ultima || Math.abs(new Date(ultima.criado_em_ini).getTime() - ts) > 10 * 60 * 1000) {
        rajadas.push({ criado_em_ini: j.criado_em, jobs: [j] });
      } else {
        ultima.jobs.push(j);
        if (ts < new Date(ultima.criado_em_ini).getTime()) ultima.criado_em_ini = j.criado_em;
      }
    });
    const diaMs = 24 * 60 * 60 * 1000;
    // Stats por rajada
    return rajadas.map(r => {
      const cont = { ok: 0, rodando: 0, aguardando: 0, erro: 0 };
      let vendas = 0, itens = 0;
      let inicio = null, fim = null;
      let maxDiasJanela = 0;
      let minDataDe = null, maxDataAte = null;
      r.jobs.forEach(j => {
        cont[j.status] = (cont[j.status] || 0) + 1;
        vendas += j.vendas_inseridas || 0;
        itens  += j.itens_inseridos  || 0;
        if (j.iniciado_em) {
          const ts = new Date(j.iniciado_em).getTime();
          if (!inicio || ts < inicio) inicio = ts;
        }
        if (j.concluido_em) {
          const ts = new Date(j.concluido_em).getTime();
          if (!fim || ts > fim) fim = ts;
        }
        if (j.data_de && j.data_ate) {
          const dias = Math.round((new Date(j.data_ate + 'T00:00:00').getTime() - new Date(j.data_de + 'T00:00:00').getTime()) / diaMs) + 1;
          if (dias > maxDiasJanela) maxDiasJanela = dias;
          if (!minDataDe  || j.data_de  < minDataDe)  minDataDe  = j.data_de;
          if (!maxDataAte || j.data_ate > maxDataAte) maxDataAte = j.data_ate;
        }
      });
      const total = r.jobs.length;
      let statusAg = 'ok';
      if (cont.rodando + cont.aguardando > 0) statusAg = 'rodando';
      else if (cont.erro === total) statusAg = 'erro';
      else if (cont.erro > 0) statusAg = 'parcial';
      const duracaoMs = (inicio && fim) ? (fim - inicio) : null;
      const redesEnv = new Set(r.jobs.map(j => j.chave_api_id));
      return { ...r, cont, statusAg, totais: { vendas, itens }, total,
        duracaoMs, redesEnvolvidas: redesEnv.size,
        maxDiasJanela, minDataDe, maxDataAte };
    });
  }, [execucoesCron]);

  // Próxima execução prevista: 01:00 BRT do próximo dia (cron 0 4 UTC).
  const proximaCron = useMemo(() => {
    const agora = new Date();
    const proxima = new Date();
    proxima.setHours(1, 0, 0, 0); // 01:00 BRT
    if (proxima.getTime() <= agora.getTime()) proxima.setDate(proxima.getDate() + 1);
    return proxima;
  }, []);

  // Detecta redes ATIVAS que não tiveram execução de cron nas últimas 25h
  // (margem de 1h após a janela esperada). Provável sinal de cron quebrado.
  const redesAtivasSemCronRecente = useMemo(() => {
    const ativas = configRede.filter(c => c.ativo).map(c => c.chave_api_id);
    const limite = Date.now() - 25 * 60 * 60 * 1000;
    const tem = new Set();
    execucoesCron.forEach(j => {
      if (new Date(j.criado_em).getTime() >= limite) tem.add(j.chave_api_id);
    });
    return ativas.filter(id => !tem.has(id));
  }, [configRede, execucoesCron]);

  // Helpers pra manipular o conjunto de empresas selecionadas por rede
  const toggleEmpresa = (chaveApiId, empCodigo) => {
    setEmpresasSelPorRede(prev => {
      const next = new Map(prev);
      const cur = new Set(next.get(chaveApiId) || []);
      const k = Number(empCodigo);
      if (cur.has(k)) cur.delete(k); else cur.add(k);
      if (cur.size === 0) next.delete(chaveApiId);
      else next.set(chaveApiId, cur);
      return next;
    });
  };
  const empresasSelRede = (chaveApiId) => empresasSelPorRede.get(chaveApiId) || new Set();

  const dispararSelecionados = async (chaveApiId) => {
    const prefix = `${chaveApiId}|`;
    const ymsSel = [...mesesSelecionados]
      .filter(k => k.startsWith(prefix))
      .map(k => k.slice(prefix.length))
      .sort();
    if (ymsSel.length === 0) {
      setToast({ tipo: 'error', mensagem: 'Selecione ao menos 1 mês' });
      return;
    }
    setDisparando(true);
    try {
      const mesesArray = ymsSel.map(ym => {
        const [ano, mes] = ym.split('-');
        return { ano: Number(ano), mes: Number(mes) };
      });
      // Se há empresas marcadas pra essa rede, restringe; senão dispara
      // pra TODAS (comportamento legado).
      const empSel = empresasSelRede(chaveApiId);
      const empresasCodigos = empSel.size > 0 ? [...empSel] : null;
      const jobs = await syncService.dispararBackfillRede({
        chaveApiId, mesesArray, usuarioId, empresasCodigos,
      });
      setMesesSelecionados(prev => {
        const next = new Set(prev);
        [...next].forEach(k => { if (k.startsWith(prefix)) next.delete(k); });
        return next;
      });
      // Limpa seleção de empresas dessa rede após disparar
      setEmpresasSelPorRede(prev => {
        const next = new Map(prev);
        next.delete(chaveApiId);
        return next;
      });
      const rede = redes.find(r => r.id === chaveApiId);
      const empCount = empresasCodigos ? empresasCodigos.length : rede?.empresas.length || 0;
      const parcial = empresasCodigos && empresasCodigos.length < (rede?.empresas.length || 0);
      setToast({
        tipo: 'success',
        mensagem: `${jobs.length} job(s) na fila · ${empCount} empresa(s) × ${ymsSel.length} mês(es)${parcial ? ' · sincronia parcial' : ''}`,
      });
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro: ' + err.message });
    } finally { setDisparando(false); }
  };

  // Abre modal de detalhe por empresa (duplo-clique no mês)
  const abrirDetalheMes = async (rede, mes) => {
    setModalDetalheMes({
      chaveApiId: rede.id, redeNome: rede.nome,
      ano: mes.ano, mes: mes.mes, ym: mes.ym, label: mes.label,
    });
    setDetalheEmpresas(null);
    setLoadingDetalhe(true);
    try {
      const lista = await syncService.coberturaPorEmpresaMes({
        chaveApiId: rede.id, ano: mes.ano, mes: mes.mes,
      });
      setDetalheEmpresas(lista);
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao buscar detalhe: ' + err.message });
    } finally { setLoadingDetalhe(false); }
  };

  // Dispara backfill pras empresas FALTANTES de um mês específico
  const dispararFaltantesMes = async () => {
    if (!modalDetalheMes || !detalheEmpresas) return;
    const faltantes = detalheEmpresas.filter(e => !e.sincronizada).map(e => e.empresa_codigo);
    if (faltantes.length === 0) return;
    setDisparando(true);
    try {
      const jobs = await syncService.dispararBackfillRede({
        chaveApiId: modalDetalheMes.chaveApiId,
        mesesArray: [{ ano: modalDetalheMes.ano, mes: modalDetalheMes.mes }],
        usuarioId,
        empresasCodigos: faltantes,
      });
      setToast({ tipo: 'success', mensagem: `${jobs.length} job(s) na fila · ${faltantes.length} empresa(s) faltante(s)` });
      setModalDetalheMes(null);
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro: ' + err.message });
    } finally { setDisparando(false); }
  };

  return (
    <div>
      <PageHeader title="Webposto · Sincronia de vendas"
        description="Cache local das vendas Webposto pra consultas rápidas em períodos grandes.">
        <button onClick={carregar} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </PageHeader>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-900 flex items-start gap-2">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p>
          <strong>Como funciona:</strong> ative a sincronia automática da <strong>rede</strong> pra que o cron
          noturno mantenha as vendas atualizadas em todas as empresas dela. Pra carregar histórico, expanda a
          rede, marque os meses que faltam (cinza = não importado, amber = parcial) e clique em
          "Importar selecionados". Cada mês vira 1 job por empresa rodando em background.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar rede, empresa ou CNPJ..."
          className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />{error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex items-center justify-center text-gray-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />Carregando...
        </div>
      ) : redesFiltradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-500">
          {redes.length === 0 ? 'Nenhuma rede Webposto cadastrada.' : 'Nada corresponde à busca.'}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
          {redesFiltradas.map(rede => {
            const cfg = cfgRedeMap.get(rede.id) || {};
            const aberto = redeExpandida === rede.id;
            const cobertura = coberturaPorRede[rede.id] || {};
            return (
              <div key={rede.id} className="border-b border-gray-100 last:border-b-0">
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60">
                  <button onClick={() => expandirRede(rede.id)} className="text-gray-400 flex-shrink-0">
                    {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Network className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{rede.nome}</p>
                    <p className="text-[10.5px] text-gray-500 truncate">
                      {rede.empresas.length} empresa(s) Webposto
                    </p>
                  </div>
                  <div className="text-[10.5px] text-gray-500 flex-shrink-0 text-right hidden sm:block">
                    <p>Última sincronia: <span className="font-mono">{fmtDataHora(cfg.ultima_sync_em)}</span></p>
                    {cfg.status === 'erro' && (
                      <p className="text-rose-600 truncate max-w-[260px]">Erro: {cfg.erro_mensagem?.slice(0, 60)}</p>
                    )}
                    {cfg.status === 'parcial' && (
                      <p className="text-amber-600">Parcial — algumas empresas falharam</p>
                    )}
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                    <input type="checkbox" checked={!!cfg.ativo}
                      onChange={e => alternarSincronia(rede.id, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                    <span className="text-[11px] font-medium text-gray-700 whitespace-nowrap">Sincronia auto.</span>
                  </label>
                </div>
                {aberto && (
                  <div className="px-4 pb-3">
                    <div className="bg-gray-50/60 rounded-xl p-3 mt-1 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Cobertura · últimos 24 meses</p>
                        <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500" />Completo</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-amber-500" />Parcial</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-blue-500" />Rodando</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-rose-500" />Erro</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-gray-300" />Faltando</span>
                        </div>
                      </div>
                      {coberturaCarregando.has(rede.id) && !coberturaPorRede[rede.id] ? (
                        // Skeleton: enquanto a RPC não retorna, NÃO mostra
                        // meses como "Faltando" (cinza) — seria desinformação.
                        // Exibe placeholders animados na mesma grade.
                        <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-12 gap-1">
                          {MESES.map(m => (
                            <div key={m.ym}
                              className="rounded-lg px-1 py-1 bg-gray-100 animate-pulse">
                              <div className="h-3 bg-gray-200 rounded" />
                            </div>
                          ))}
                        </div>
                      ) : (
                      <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-12 gap-1">
                        {MESES.map(m => {
                          const cov = cobertura[m.ym] || {};
                          const status = cov.status || 'nao_importado';
                          const selKey = `${rede.id}|${m.ym}`;
                          const selecionado = mesesSelecionados.has(selKey);
                          const cls = STATUS_CELULA[status] || STATUS_CELULA.nao_importado;
                          // Contadores de progresso por mês — usa jobs em
                          // memória pra refletir mudanças instantaneamente.
                          // Só mostra quando há jobs ativos no mês.
                          const jobsDoMes = jobs.filter(j =>
                            j.chave_api_id === rede.id &&
                            String(j.data_de).slice(0, 7) === m.ym
                          );
                          // Empresas únicas com status final por empresa
                          // (usa prioridade rodando>aguardando>erro>ok pra
                          // refletir o mais severo entre quinzenas).
                          const PRIO = { rodando: 4, aguardando: 3, erro: 2, ok: 1 };
                          const porEmp = new Map();
                          jobsDoMes.forEach(j => {
                            const cur = porEmp.get(j.empresa_codigo);
                            if (!cur || (PRIO[j.status] || 0) > (PRIO[cur] || 0)) {
                              porEmp.set(j.empresa_codigo, j.status);
                            }
                          });
                          const cont = { ok: 0, rodando: 0, aguardando: 0, erro: 0 };
                          porEmp.forEach(s => { cont[s] = (cont[s] || 0) + 1; });
                          const totalEmp = porEmp.size;
                          const ativos = cont.rodando + cont.aguardando;
                          const titleExt = totalEmp > 0
                            ? `\n${cont.ok}/${totalEmp} ok · ${cont.rodando} rodando · ${cont.aguardando} aguard · ${cont.erro} erro`
                            : '';
                          return (
                            <button key={m.ym}
                              onClick={() => toggleMes(rede.id, m.ym)}
                              onDoubleClick={() => abrirDetalheMes(rede, m)}
                              title={`${m.label} · ${cls.label}${cov.qtd_vendas ? ` · ${cov.qtd_vendas} vendas em ${cov.empresas_com_vendas}/${cov.total_empresas} empresas` : ''}${titleExt}\nDuplo-clique pra ver detalhe por empresa`}
                              className={`relative rounded-lg px-1 py-1 text-[10px] font-medium leading-tight transition-all ${cls.bg} ${
                                selecionado ? 'ring-2 ring-offset-1 ring-blue-500 scale-[1.05]' : ''
                              }`}>
                              <div>{m.label}</div>
                              {/* Mini contador quando há jobs ativos no mês */}
                              {ativos > 0 && (
                                <div className="text-[8.5px] font-bold leading-none mt-0.5 opacity-90 tabular-nums">
                                  {cont.ok}/{totalEmp}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      )}
                      {(() => {
                        const empSel = empresasSelRede(rede.id);
                        const totalEmps = rede.empresas.length;
                        const parcial = empSel.size > 0 && empSel.size < totalEmps;
                        const qtdAlvo = empSel.size > 0 ? empSel.size : totalEmps;
                        return (
                          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                            <p className="text-[10.5px] text-gray-500">
                              {[...mesesSelecionados].filter(k => k.startsWith(`${rede.id}|`)).length} mês(es) ·{' '}
                              {empSel.size === 0
                                ? <>todas as <strong className="text-gray-700">{totalEmps}</strong> empresas</>
                                : <><strong className="text-amber-700">{empSel.size}</strong> de {totalEmps} empresas{parcial && ' · sincronia parcial'}</>}
                            </p>
                            <button onClick={() => dispararSelecionados(rede.id)}
                              disabled={disparando}
                              className={`inline-flex items-center gap-1.5 rounded-lg disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white ${
                                parcial ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                              }`}>
                              <Play className="h-3 w-3" />
                              {parcial ? `Sincronizar ${qtdAlvo} selecionada(s)` : 'Importar selecionados'}
                            </button>
                          </div>
                        );
                      })()}

                      {/* Empresas — checkbox por empresa pra sincronia parcial */}
                      <details className="text-[11px]" open={empresasSelRede(rede.id).size > 0}>
                        <summary className="cursor-pointer text-gray-500 hover:text-gray-800 font-medium select-none">
                          Ver {rede.empresas.length} empresa(s) · status individual
                          {empresasSelRede(rede.id).size > 0 && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-semibold">
                              {empresasSelRede(rede.id).size} selecionada(s)
                            </span>
                          )}
                        </summary>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <button onClick={() => setEmpresasSelPorRede(prev => {
                            const next = new Map(prev);
                            const cur = empresasSelRede(rede.id);
                            if (cur.size === rede.empresas.length) next.delete(rede.id);
                            else next.set(rede.id, new Set(rede.empresas.map(e => Number(e.empresa_codigo))));
                            return next;
                          })}
                            className="text-[10px] text-blue-700 hover:text-blue-900 font-medium">
                            {empresasSelRede(rede.id).size === rede.empresas.length ? 'Desmarcar todas' : 'Marcar todas'}
                          </button>
                          {empresasSelRede(rede.id).size > 0 && (
                            <button onClick={() => setEmpresasSelPorRede(prev => {
                              const next = new Map(prev); next.delete(rede.id); return next;
                            })}
                              className="text-[10px] text-gray-500 hover:text-gray-800 font-medium">
                              Limpar seleção (= todas)
                            </button>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                          {rede.empresas.map(emp => {
                            const cfgEmpItem = cfgEmpMap.get(`${rede.id}|${emp.empresa_codigo}`) || {};
                            const marcada = empresasSelRede(rede.id).has(Number(emp.empresa_codigo));
                            return (
                              <label key={emp.id}
                                className={`flex items-start gap-1.5 bg-white rounded-md border px-2 py-1.5 cursor-pointer transition-colors ${
                                  marcada ? 'border-amber-300 bg-amber-50/50' : 'border-gray-100 hover:bg-gray-50/60'
                                }`}>
                                <input type="checkbox" checked={marcada}
                                  onChange={() => toggleEmpresa(rede.id, emp.empresa_codigo)}
                                  className="h-3.5 w-3.5 mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                    <p className="text-[11px] font-medium text-gray-800 truncate">{emp.nome}</p>
                                  </div>
                                  <p className="text-[9.5px] text-gray-500 ml-4 truncate">
                                    cód {emp.empresa_codigo} · {fmtDataHora(cfgEmpItem.ultima_sync_em)}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </details>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Painel: Sincronia automática (cron noturno) */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-3">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gradient-to-r from-violet-50/50 to-white flex items-center gap-2 flex-wrap">
          <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center">
            <Zap className="h-4 w-4 text-violet-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-gray-800">Sincronia automática</h3>
            <p className="text-[10.5px] text-gray-500">Cron diário 01:00 BRT · janela fixa de 7 dias · gaps históricos só via backfill manual</p>
          </div>
          {(() => {
            const aguardandoCron = execucoesCron.filter(j => j.status === 'aguardando').length;
            return aguardandoCron > 0 ? (
              <button onClick={processarFilaParada} disabled={disparandoCron}
                title="Disparar workers pros jobs que ficaram parados em 'aguardando'"
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 text-[11px] font-semibold text-amber-700 disabled:opacity-50">
                {disparandoCron ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Processar {aguardandoCron} parado{aguardandoCron === 1 ? '' : 's'}
              </button>
            ) : null;
          })()}
          {(() => {
            const errosCron = execucoesCron.filter(j => j.status === 'erro').length;
            const aguardandoCron = execucoesCron.filter(j => j.status === 'aguardando').length;
            return errosCron > 0 ? (
              <button onClick={() => limparErros('cron_diario')} disabled={excluindoErros}
                title="Excluir definitivamente todos os jobs em erro do cron"
                className={`${aguardandoCron === 0 ? 'ml-auto' : ''} inline-flex items-center gap-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-50`}>
                {excluindoErros ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                Limpar {errosCron} erro{errosCron === 1 ? '' : 's'}
              </button>
            ) : null;
          })()}
          <button onClick={recarregarCron} disabled={loadingCron}
            className={`${execucoesCron.filter(j => j.status === 'erro' || j.status === 'aguardando').length > 0 ? '' : 'ml-auto'} inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100`}>
            <RefreshCw className={`h-3 w-3 ${loadingCron ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button onClick={forcarCron} disabled={disparandoCron}
            title="Disparar o orquestrador AGORA (mesma rotina do cron)"
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-3 py-1.5 text-[11px] font-semibold text-white">
            {disparandoCron ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Executar agora
          </button>
        </div>

        {/* Resumo: próxima + redes sem cron */}
        <div className="px-4 py-3 border-b border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">Próxima execução</p>
            <p className="text-[13px] font-bold text-gray-900 mt-0.5 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-violet-500" />
              {proximaCron.toLocaleDateString('pt-BR')} às {proximaCron.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div>
            <p className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">Redes com sync auto</p>
            <p className="text-[13px] font-bold text-gray-900 mt-0.5">
              {configRede.filter(c => c.ativo).length}
              <span className="text-[10px] text-gray-400 ml-1">/ {redes.length} total</span>
            </p>
          </div>
          <div>
            <p className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">Última rajada</p>
            <p className="text-[13px] font-bold text-gray-900 mt-0.5">
              {rajadasCron[0] ? fmtDataHora(rajadasCron[0].criado_em_ini) : '—'}
            </p>
          </div>
        </div>

        {/* Progresso em tempo real do disparo da fila */}
        {progressoFila && (
          <div className="px-4 py-3 border-b border-gray-100 bg-blue-50/60">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <p className="text-[11.5px] font-semibold text-blue-900 flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                Disparando workers...
              </p>
              <p className="text-[11px] font-bold text-blue-900 tabular-nums">
                {progressoFila.processados} / {progressoFila.total}
              </p>
            </div>
            <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${(progressoFila.processados / Math.max(1, progressoFila.total)) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Alerta: redes ativas sem cron recente */}
        {redesAtivasSemCronRecente.length > 0 && (
          <div className="px-4 py-2.5 border-b border-gray-100 bg-rose-50/60 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-semibold text-rose-800">
                {redesAtivasSemCronRecente.length} rede(s) ativa(s) sem execução nas últimas 25h
              </p>
              <p className="text-[10.5px] text-rose-700 mt-0.5">
                {redesAtivasSemCronRecente.map(id => {
                  const r = redes.find(r => r.id === id);
                  return r?.nome;
                }).filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <button onClick={forcarCron} disabled={disparandoCron}
              className="text-[10px] text-rose-700 hover:text-white hover:bg-rose-600 border border-rose-200 px-2 py-1 rounded font-semibold whitespace-nowrap">
              Disparar agora
            </button>
          </div>
        )}

        {/* Histórico de rajadas */}
        <div className="overflow-x-auto">
          {rajadasCron.length === 0 ? (
            <p className="px-4 py-6 text-center text-gray-400 text-xs">
              {loadingCron ? 'Carregando histórico...' : 'Nenhuma execução do cron nos últimos 7 dias.'}
            </p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50">
                <tr className="text-left text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2">Iniciada</th>
                  <th className="px-3 py-2">Janela</th>
                  <th className="px-3 py-2">Duração</th>
                  <th className="px-3 py-2 text-center">Redes</th>
                  <th className="px-3 py-2 text-center">Jobs</th>
                  <th className="px-3 py-2 text-right">Vendas inseridas</th>
                  <th className="px-3 py-2 text-right">Itens</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rajadasCron.slice(0, 14).map(r => {
                  const cor = {
                    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    rodando: 'bg-amber-50 text-amber-700 border-amber-200',
                    erro: 'bg-rose-50 text-rose-700 border-rose-200',
                    parcial: 'bg-orange-50 text-orange-700 border-orange-200',
                  }[r.statusAg] || 'bg-gray-50 text-gray-700 border-gray-200';
                  const dur = r.duracaoMs != null
                    ? r.duracaoMs >= 60000
                      ? `${Math.round(r.duracaoMs / 60000)}min`
                      : `${Math.round(r.duracaoMs / 1000)}s`
                    : '—';
                  return (
                    <tr key={r.criado_em_ini} className="hover:bg-gray-50/60">
                      <td className="px-3 py-1.5 font-mono text-[11px] text-gray-700 whitespace-nowrap">
                        {fmtDataHora(r.criado_em_ini)}
                      </td>
                      <td className="px-3 py-1.5 text-[10.5px] whitespace-nowrap"
                        title={`Maior janela individual: ${r.maxDiasJanela} dias\nCobertura agregada: ${r.minDataDe} → ${r.maxDataAte}`}>
                        <span className={`font-mono ${r.maxDiasJanela > 15 ? 'text-rose-700 font-semibold' : 'text-gray-600'}`}>
                          {r.minDataDe} → {r.maxDataAte}
                        </span>
                        {r.maxDiasJanela > 15 && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] bg-rose-50 text-rose-700 border border-rose-200 rounded px-1 font-semibold">
                            <AlertTriangle className="h-2 w-2" /> {r.maxDiasJanela}d
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 tabular-nums">{dur}</td>
                      <td className="px-3 py-1.5 text-center tabular-nums text-gray-700">{r.redesEnvolvidas}</td>
                      <td className="px-3 py-1.5 text-center text-[11px] tabular-nums">
                        <span className="text-emerald-700 font-semibold">{r.cont.ok}</span>
                        <span className="text-gray-400">/{r.total}</span>
                        {r.cont.erro > 0 && <span className="text-rose-700 ml-1">· {r.cont.erro} erro</span>}
                        {r.cont.rodando + r.cont.aguardando > 0 && (
                          <span className="text-amber-700 ml-1">· {r.cont.rodando + r.cont.aguardando} ativo</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-800">{r.totais.vendas.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-800">{r.totais.itens.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cor}`}>
                          {r.statusAg === 'rodando' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                          {r.statusAg === 'ok' && <CheckCircle2 className="h-2.5 w-2.5" />}
                          {r.statusAg === 'erro' && <AlertCircle className="h-2.5 w-2.5" />}
                          {r.statusAg}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {(r.cont.rodando + r.cont.aguardando) > 0 && (
                          <button onClick={() => cancelarRajada(r)}
                            title={`Cancelar ${r.cont.rodando + r.cont.aguardando} job(s) ativo(s)`}
                            className="inline-flex items-center gap-1 text-rose-600 hover:text-white hover:bg-rose-600 px-2 py-1 rounded text-[10px] font-semibold border border-rose-200 transition-colors whitespace-nowrap">
                            <X className="h-3 w-3" />
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Histórico de jobs */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/40 flex items-center gap-2 flex-wrap">
          <h3 className="text-[13px] font-semibold text-gray-800">Histórico de jobs · últimos 50</h3>
          <span className="text-[10.5px] text-gray-400">
            · {jobs.filter(j => j.status === 'rodando').length} rodando · {jobs.filter(j => j.status === 'aguardando').length} aguardando · {jobs.filter(j => j.status === 'erro').length} erro
          </span>
          {jobs.filter(j => j.status === 'erro').length > 0 && (
            <button onClick={() => limparErros(null)} disabled={excluindoErros}
              title="Excluir definitivamente todos os jobs em erro (de qualquer tipo)"
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-50">
              {excluindoErros ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              Limpar {jobs.filter(j => j.status === 'erro').length} erro(s)
            </button>
          )}
          {jobsTravados > 0 && (
            <button onClick={limparTravados} disabled={limpandoTravados}
              title="Marca como erro todos os jobs em 'rodando' há mais de 30 min (provavelmente travados por timeout da edge function)"
              className={`${jobs.filter(j => j.status === 'erro').length > 0 ? '' : 'ml-auto'} inline-flex items-center gap-1.5 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 text-[11px] font-semibold text-amber-700`}>
              {limpandoTravados ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              Limpar {jobsTravados} travado{jobsTravados === 1 ? '' : 's'}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          {jobsAgrupados.length === 0 ? (
            <p className="px-4 py-6 text-center text-gray-400 text-xs">Sem jobs ainda.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {jobsAgrupados.map(batch => {
                const rede = redes.find(r => r.id === batch.chave_api_id);
                const aberto = batchesExpandidos.has(batch.key);
                const corStatusAg = {
                  ok:      'bg-emerald-50 text-emerald-700',
                  rodando: 'bg-amber-50 text-amber-700',
                  erro:    'bg-rose-50 text-rose-700',
                  parcial: 'bg-orange-50 text-orange-700',
                }[batch.statusAg] || 'bg-gray-50 text-gray-700';
                const naoFinalizadas = batch.cont.rodando + batch.cont.aguardando + batch.cont.erro;
                return (
                  <div key={batch.key}>
                    <button onClick={() => toggleBatch(batch.key)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50/60 transition-colors">
                      <span className="text-gray-400 flex-shrink-0">
                        {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </span>
                      <div className="h-7 w-7 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Network className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-gray-900 truncate">{rede?.nome || '—'}</p>
                        <p className="text-[10px] text-gray-500 font-mono">
                          {batch.data_de} → {batch.data_ate} · {batch.tipo} · {fmtDataHora(batch.criado_em)}
                        </p>
                      </div>
                      {/* Contadores de status por empresa */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {batch.cont.ok > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">
                            <CheckCircle2 className="h-2.5 w-2.5" /> {batch.cont.ok}
                          </span>
                        )}
                        {batch.cont.rodando > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" /> {batch.cont.rodando}
                          </span>
                        )}
                        {batch.cont.aguardando > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                            <Clock className="h-2.5 w-2.5" /> {batch.cont.aguardando}
                          </span>
                        )}
                        {batch.cont.erro > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-semibold">
                            <AlertCircle className="h-2.5 w-2.5" /> {batch.cont.erro}
                          </span>
                        )}
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${corStatusAg} flex-shrink-0`}>
                        {batch.statusAg}
                      </span>
                      <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0 hidden sm:inline">
                        {batch.cont.ok}/{batch.total}
                      </span>
                    </button>
                    {aberto && (
                      <div className="bg-gray-50/40 border-t border-gray-100">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                              <th className="pl-10 pr-3 py-1.5">Empresa</th>
                              <th className="px-3 py-1.5">Status</th>
                              <th className="px-3 py-1.5 text-right">Vendas</th>
                              <th className="px-3 py-1.5 text-right">Itens</th>
                              <th className="px-3 py-1.5 text-right">Canc.</th>
                              <th className="px-3 py-1.5 w-32" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {batch.jobs.map(j => {
                              const emp = rede?.empresas.find(e => e.empresa_codigo === j.empresa_codigo);
                              const cor = {
                                ok: 'bg-emerald-50 text-emerald-700',
                                rodando: 'bg-amber-50 text-amber-700',
                                erro: 'bg-rose-50 text-rose-700',
                                aguardando: 'bg-blue-50 text-blue-700',
                              }[j.status] || 'bg-gray-50 text-gray-700';
                              const temSubjobs = j._subjobs && j._subjobs.length > 1;
                              const bucketKey = `${batch.key}|${j.empresa_codigo}`;
                              const subAberto = temSubjobs && bucketsExpandidos.has(bucketKey);
                              return (
                                <Fragment key={j.id}>
                                  <tr className="hover:bg-white/60">
                                    <td className="pl-10 pr-3 py-1.5">
                                      <div className="flex items-center gap-1.5">
                                        {temSubjobs ? (
                                          <button onClick={() => toggleBucket(batch.key, j.empresa_codigo)}
                                            title={subAberto ? 'Recolher quinzenas' : 'Ver detalhe por quinzena'}
                                            className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                                            {subAberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                          </button>
                                        ) : (
                                          <span className="w-3 flex-shrink-0" />
                                        )}
                                        <p className="text-[11.5px] text-gray-800 truncate max-w-[240px]" title={emp?.nome}>
                                          {emp?.nome || `cód ${j.empresa_codigo}`}
                                        </p>
                                      </div>
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${cor}`}>
                                        {j.status === 'rodando' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                        {j.status === 'ok' && <CheckCircle2 className="h-2.5 w-2.5" />}
                                        {j.status === 'aguardando' && <Clock className="h-2.5 w-2.5" />}
                                        {j.status === 'erro' && <AlertCircle className="h-2.5 w-2.5" />}
                                        {j.status}
                                      </span>
                                      {j.erro_mensagem && (
                                        <p className="text-[9.5px] text-rose-600 mt-0.5 truncate max-w-[300px]" title={j.erro_mensagem}>
                                          {j.erro_mensagem}
                                        </p>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-700">{j.vendas_inseridas?.toLocaleString('pt-BR') || 0}</td>
                                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-700">{j.itens_inseridos?.toLocaleString('pt-BR') || 0}</td>
                                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-700">{j.vendas_canceladas_marcadas?.toLocaleString('pt-BR') || 0}</td>
                                    <td className="px-2 py-1.5 text-right">
                                      {(j.status === 'rodando' || j.status === 'aguardando') && (
                                        <button onClick={() => cancelarUmJob(j)}
                                          title="Cancelar (marcar como erro)"
                                          className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50">
                                          <X className="h-3 w-3" />
                                        </button>
                                      )}
                                      {j.status === 'erro' && (
                                        <button onClick={() => redispararEmpresa(j)}
                                          title={`Re-sincronizar ${rede?.empresas.find(e => e.empresa_codigo === j.empresa_codigo)?.nome || 'essa empresa'} pra ${j.data_de}`}
                                          className="inline-flex items-center gap-1 text-blue-600 hover:text-white hover:bg-blue-600 px-2 py-1 rounded text-[10px] font-semibold border border-blue-200 transition-colors whitespace-nowrap">
                                          <RefreshCw className="h-3 w-3" />
                                          Re-sincronizar
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                  {subAberto && j._subjobs.map((sj, idx) => {
                                    const corSub = {
                                      ok: 'bg-emerald-50 text-emerald-700',
                                      rodando: 'bg-amber-50 text-amber-700',
                                      erro: 'bg-rose-50 text-rose-700',
                                      aguardando: 'bg-blue-50 text-blue-700',
                                    }[sj.status] || 'bg-gray-50 text-gray-700';
                                    // Rótulo da quinzena (Q1 = dia 1-15, Q2 = dia 16-EOM)
                                    const dia1 = Number(String(sj.data_de).slice(-2));
                                    const rotuloQ = dia1 <= 15 ? 'Q1' : 'Q2';
                                    return (
                                      <tr key={sj.id} className="bg-white/30 hover:bg-white/60 border-l-2 border-blue-100">
                                        <td className="pl-16 pr-3 py-1">
                                          <div className="flex items-center gap-1.5 text-[10.5px] text-gray-500">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold text-[9.5px]">
                                              {rotuloQ}
                                            </span>
                                            <span className="font-mono">{sj.data_de} → {sj.data_ate}</span>
                                          </div>
                                        </td>
                                        <td className="px-3 py-1">
                                          <span className={`inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${corSub}`}>
                                            {sj.status === 'rodando' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                            {sj.status === 'ok' && <CheckCircle2 className="h-2.5 w-2.5" />}
                                            {sj.status === 'aguardando' && <Clock className="h-2.5 w-2.5" />}
                                            {sj.status === 'erro' && <AlertCircle className="h-2.5 w-2.5" />}
                                            {sj.status}
                                          </span>
                                          {sj.erro_mensagem && (
                                            <p className="text-[9px] text-rose-600 mt-0.5 truncate max-w-[280px]" title={sj.erro_mensagem}>
                                              {sj.erro_mensagem}
                                            </p>
                                          )}
                                        </td>
                                        <td className="px-3 py-1 text-right font-mono tabular-nums text-[11px] text-gray-600">{sj.vendas_inseridas?.toLocaleString('pt-BR') || 0}</td>
                                        <td className="px-3 py-1 text-right font-mono tabular-nums text-[11px] text-gray-600">{sj.itens_inseridos?.toLocaleString('pt-BR') || 0}</td>
                                        <td className="px-3 py-1 text-right font-mono tabular-nums text-[11px] text-gray-600">{sj.vendas_canceladas_marcadas?.toLocaleString('pt-BR') || 0}</td>
                                        <td className="px-2 py-1 text-right">
                                          {(sj.status === 'rodando' || sj.status === 'aguardando') && (
                                            <button onClick={() => cancelarUmJob(sj.id)}
                                              title={`Cancelar ${rotuloQ}`}
                                              className="text-rose-500 hover:text-rose-700 p-0.5 rounded hover:bg-rose-50">
                                              <X className="h-2.5 w-2.5" />
                                            </button>
                                          )}
                                          {sj.status === 'erro' && (
                                            <button onClick={() => redispararEmpresa(sj)}
                                              title={`Re-sincronizar ${rotuloQ}`}
                                              className="inline-flex items-center gap-1 text-blue-600 hover:text-white hover:bg-blue-600 px-1.5 py-0.5 rounded text-[9.5px] font-semibold border border-blue-200 transition-colors whitespace-nowrap">
                                              <RefreshCw className="h-2.5 w-2.5" />
                                              Refazer
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </Fragment>
                              );
                            })}
                          </tbody>
                          {batch.total > 0 && (
                            <tfoot>
                              <tr className="border-t-2 border-gray-200 bg-white">
                                <td className="pl-10 pr-3 py-1.5 text-[10.5px] font-semibold text-gray-700">
                                  Total: {batch.cont.ok}/{batch.total} concluídos
                                  {naoFinalizadas > 0 && (
                                    <span className="text-rose-600"> · {naoFinalizadas} pendente(s)</span>
                                  )}
                                </td>
                                <td>
                                  {batch.cont.erro > 0 && (
                                    <button onClick={() => batch.jobs.filter(j => j.status === 'erro').forEach(redispararEmpresa)}
                                      className="inline-flex items-center gap-1 text-blue-600 hover:text-white hover:bg-blue-600 px-2 py-1 rounded text-[10px] font-semibold border border-blue-200 transition-colors whitespace-nowrap">
                                      <RefreshCw className="h-3 w-3" />
                                      Re-sincronizar {batch.cont.erro} erro{batch.cont.erro === 1 ? '' : 's'}
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] font-semibold text-gray-900">{batch.totais.vendas.toLocaleString('pt-BR')}</td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] font-semibold text-gray-900">{batch.totais.itens.toLocaleString('pt-BR')}</td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] font-semibold text-gray-900">{batch.totais.canc.toLocaleString('pt-BR')}</td>
                                <td />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}

      {/* Modal: detalhe de empresas pra um mês específico (duplo-clique no mês) */}
      {modalDetalheMes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setModalDetalheMes(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200/60 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/60 to-white flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Network className="h-5 w-5 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-bold text-gray-900 truncate">{modalDetalheMes.redeNome}</h3>
                <p className="text-[11.5px] text-gray-500">Detalhe do mês · {modalDetalheMes.label}</p>
              </div>
              <button onClick={() => setModalDetalheMes(null)} className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            {loadingDetalhe ? (
              <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span className="text-sm">Carregando detalhe...</span>
              </div>
            ) : detalheEmpresas ? (
              <>
                {(() => {
                  const sinc = detalheEmpresas.filter(e => e.sincronizada);
                  const pend = detalheEmpresas.filter(e => !e.sincronizada);
                  return (
                    <>
                      <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Sincronizadas</p>
                          <p className="text-[20px] font-bold text-emerald-700 mt-1">{sinc.length}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Pendentes</p>
                          <p className="text-[20px] font-bold text-amber-700 mt-1">{pend.length}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Total</p>
                          <p className="text-[20px] font-bold text-gray-700 mt-1">{detalheEmpresas.length}</p>
                        </div>
                      </div>
                      <div className="overflow-y-auto flex-1">
                        {sinc.length > 0 && (
                          <div className="px-5 py-2 bg-emerald-50/40 border-b border-emerald-100">
                            <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">✓ Sincronizadas ({sinc.length})</p>
                          </div>
                        )}
                        {sinc.map(emp => (
                          <div key={`s-${emp.empresa_codigo}`} className="px-5 py-2 border-b border-gray-100 flex items-center gap-2 hover:bg-gray-50/60">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[12.5px] font-medium text-gray-900 truncate">{emp.nome}</p>
                              <p className="text-[10.5px] text-gray-500">cód {emp.empresa_codigo} · {emp.qtd_vendas} venda(s) no mês</p>
                            </div>
                            {emp.status_job && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                                {emp.status_job}
                              </span>
                            )}
                          </div>
                        ))}
                        {pend.length > 0 && (
                          <div className="px-5 py-2 bg-amber-50/40 border-b border-amber-100 mt-1">
                            <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">⚠ Pendentes ({pend.length})</p>
                          </div>
                        )}
                        {pend.map(emp => (
                          <div key={`p-${emp.empresa_codigo}`} className="px-5 py-2 border-b border-gray-100 flex items-center gap-2 hover:bg-gray-50/60">
                            <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[12.5px] font-medium text-gray-900 truncate">{emp.nome}</p>
                              <p className="text-[10.5px] text-gray-500">
                                cód {emp.empresa_codigo} · {emp.status_job ? `último job: ${emp.status_job}` : 'nunca sincronizada'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {pend.length > 0 && (
                        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between gap-3">
                          <p className="text-[11px] text-gray-600">
                            {pend.length} empresa(s) pendente(s) — sincronizar somente as faltantes?
                          </p>
                          <button onClick={dispararFaltantesMes} disabled={disparando}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white">
                            <Play className="h-3 w-3" />
                            Sincronizar {pend.length} faltante(s)
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            ) : (
              <div className="p-8 text-center text-sm text-gray-500">Sem dados de detalhe.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
