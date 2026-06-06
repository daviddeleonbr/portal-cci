import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileSearch, Upload, Loader2, AlertCircle, RefreshCw, FileText, Link2,
  Trash2, AlertTriangle, Search, ChevronRight,
} from 'lucide-react';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as autosystemService from '../services/autosystemService';
import * as contasBancariasService from '../services/clienteContasBancariasService';
import * as ofxCorrelacaoService from '../services/ofxCorrelacaoService';
import { formatCurrency } from '../utils/format';
import SeletorRedeBPO from '../components/ui/SeletorRedeBPO';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import { useAdminSession } from '../hooks/useAuth';

// Paleta visual para destacar cada correlação em ambas as colunas.
// O índice é derivado do id (hash simples) pra ser estável entre renders.
const PALETA_CORREL = [
  { ring: 'ring-violet-300',  bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-500'  },
  { ring: 'ring-amber-300',   bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  { ring: 'ring-emerald-300', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { ring: 'ring-sky-300',     bg: 'bg-sky-50',     text: 'text-sky-700',     dot: 'bg-sky-500'     },
  { ring: 'ring-rose-300',    bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500'    },
  { ring: 'ring-indigo-300',  bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-500'  },
];
function corDaCorrelacao(id) {
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETA_CORREL[h % PALETA_CORREL.length];
}

function formatDataBR(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

// OFX usa formato "YYYYMMDDHHMMSS[tz]" em DTPOSTED. Extrai apenas a data.
function parseDtOfx(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Lê um campo SGML "<TAG>valor" (tolera newline ou outro tag logo depois).
function extractTag(block, tag) {
  const re = new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

function parseOfx(text) {
  const bankId = extractTag(text, 'BANKID');
  const branchId = extractTag(text, 'BRANCHID');
  const acctId = extractTag(text, 'ACCTID');
  const acctType = extractTag(text, 'ACCTTYPE');
  const org = extractTag(text, 'ORG');
  const dtStart = parseDtOfx(extractTag(text, 'DTSTART'));
  const dtEnd = parseDtOfx(extractTag(text, 'DTEND'));
  const ledgerBal = extractTag(text, 'BALAMT');

  const transacoes = [];
  const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const block = m[1];
    const trntype = (extractTag(block, 'TRNTYPE') || '').toUpperCase();
    const valorNum = Number(extractTag(block, 'TRNAMT'));
    transacoes.push({
      tipo: trntype === 'DEBIT' ? 'debito' : 'credito',
      trntype,
      data: parseDtOfx(extractTag(block, 'DTPOSTED')),
      valor: isFinite(valorNum) ? Math.abs(valorNum) : 0,
      valorRaw: valorNum,
      fitid: extractTag(block, 'FITID'),
      checknum: extractTag(block, 'CHECKNUM'),
      refnum: extractTag(block, 'REFNUM'),
      memo: extractTag(block, 'MEMO') || '',
      name: extractTag(block, 'NAME') || '',
    });
  }

  return { bankId, branchId, acctId, acctType, org, dtStart, dtEnd, ledgerBal, transacoes };
}

function formatBanco(bankId, org) {
  const BANCOS = {
    '756': 'Sicoob',
    '001': 'Banco do Brasil',
    '033': 'Santander',
    '104': 'Caixa',
    '237': 'Bradesco',
    '341': 'Itau',
    '260': 'Nubank',
    '077': 'Inter',
  };
  if (BANCOS[bankId]) return `${BANCOS[bankId]} (${bankId})`;
  if (org) return `${org}${bankId ? ` (${bankId})` : ''}`;
  return bankId || '—';
}

export default function BpoValidacaoOfx() { return <BpoValidacaoOfxView />; }

export function BpoValidacaoOfxView() {
  const session = useAdminSession();
  const usuarioId = session?.usuario?.id || null;

  const [clientes, setClientes] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [redeSel, setRedeSel] = useState(null);
  const redeId = redeSel?.tipo === 'webposto' ? redeSel.id : '';
  const [clienteId, setClienteId] = useState('');
  const [contasClassificadas, setContasClassificadas] = useState([]);
  const [contasQuality, setContasQuality] = useState([]);
  const [contaCodigo, setContaCodigo] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [ofx, setOfx] = useState(null);
  const [movsSistema, setMovsSistema] = useState([]);
  const [correlacoes, setCorrelacoes] = useState([]);
  const [selOfx, setSelOfx] = useState(() => new Set()); // Set<fitid>
  const [selSistema, setSelSistema] = useState(() => new Set()); // Set<movimento_codigo>
  const [buscaSistema, setBuscaSistema] = useState('');
  const [buscaOfx, setBuscaOfx] = useState('');
  // Tree colapsada por default: o set armazena apenas dias EXPANDIDOS;
  // vazio = todos recolhidos.
  const [diasAbertosSistema, setDiasAbertosSistema] = useState(() => new Set());
  const [diasAbertosOfx, setDiasAbertosOfx] = useState(() => new Set());
  const [loadingInicial, setLoadingInicial] = useState(true);
  const [loadingContas, setLoadingContas] = useState(false);
  const [loadingDados, setLoadingDados] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const [confirmExcluir, setConfirmExcluir] = useState({ open: false, correlacao: null });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  };

  useEffect(() => {
    (async () => {
      try {
        const [lista, chs, redesAS] = await Promise.all([
          clientesService.listarClientes(),
          mapService.listarChavesApi(),
          autosystemService.listarRedes().catch(() => []),
        ]);
        const clientesValidos = (lista || []).filter(c =>
          (c.usa_webposto && c.chave_api_id && c.empresa_codigo) ||
          (c.as_rede_id && c.empresa_codigo != null)
        );
        setClientes(clientesValidos);
        const idsWb = new Set(clientesValidos.filter(c => c.chave_api_id).map(c => c.chave_api_id));
        setChavesApi((chs || []).filter(ch => ch.ativo !== false && idsWb.has(ch.id)));
        const idsAS = new Set(clientesValidos.filter(c => c.as_rede_id).map(c => c.as_rede_id));
        setRedesAutosystem((redesAS || []).filter(r => idsAS.has(r.id)));
      } catch (err) { setErro(err.message); }
      finally { setLoadingInicial(false); }
    })();
  }, []);

  const contagensPorRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => {
      const key = c.chave_api_id || c.as_rede_id;
      if (!key) return;
      m.set(key, (m.get(key) || 0) + 1);
    });
    return m;
  }, [clientes]);

  const empresasDaRede = useMemo(() => {
    if (!redeSel) return [];
    return clientes
      .filter(c => {
        if (c.status === 'inativo') return false;
        if (redeSel.tipo === 'webposto') return c.chave_api_id === redeSel.id;
        if (redeSel.tipo === 'autosystem') return c.as_rede_id === redeSel.id;
        return false;
      })
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [redeSel, clientes]);

  const cliente = useMemo(() => clientes.find(c => c.id === clienteId) || null, [clientes, clienteId]);

  // Quando selecionar rede, carrega contas classificadas + contas Quality para popular o dropdown
  useEffect(() => {
    if (!redeId) { setContasClassificadas([]); setContasQuality([]); return; }
    (async () => {
      setLoadingContas(true);
      try {
        const chave = chavesApi.find(ch => ch.id === redeId);
        if (!chave) return;
        const [classif, cts] = await Promise.all([
          contasBancariasService.listarPorRede(redeId).catch(() => []),
          qualityApi.buscarContas(chave.chave).catch(() => []),
        ]);
        setContasClassificadas(classif || []);
        setContasQuality(cts || []);
      } finally { setLoadingContas(false); }
    })();
  }, [redeId, chavesApi]);

  useEffect(() => {
    setClienteId('');
    setContaCodigo('');
  }, [redeId]);

  useEffect(() => {
    setContaCodigo('');
    setMovsSistema([]);
    setCorrelacoes([]);
    setSelOfx(new Set());
    setSelSistema(new Set());
  }, [clienteId]);

  // Contas bancarias elegiveis da empresa selecionada (classif=bancaria ou aplicacao, ativas)
  const contasElegiveis = useMemo(() => {
    if (!cliente?.empresa_codigo) return [];
    const mapaClassif = new Map();
    contasClassificadas.forEach(c => mapaClassif.set(Number(c.conta_codigo), c));
    const resultado = [];
    const vistos = new Set();
    contasQuality.forEach(c => {
      if (Number(c.empresaCodigo) !== Number(cliente.empresa_codigo)) return;
      const codigo = Number(c.contaCodigo ?? c.codigo);
      if (!Number.isFinite(codigo) || vistos.has(codigo)) return;
      const classif = mapaClassif.get(codigo);
      // se tem classificacao, exige que seja bancaria/aplicacao ativa; sem classif = default bancaria (passa)
      if (classif) {
        if (classif.ativo === false) return;
        if (!contasBancariasService.TIPOS_PARA_CONCILIACAO.includes(classif.tipo)) return;
      }
      vistos.add(codigo);
      resultado.push({
        codigo,
        descricao: c.descricao || c.nome || c.contaDescricao || `Conta #${codigo}`,
        tipo: classif?.tipo || 'bancaria',
      });
    });
    return resultado.sort((a, b) => (a.descricao || '').localeCompare(b.descricao || ''));
  }, [cliente, contasClassificadas, contasQuality]);

  const handleFile = async (file) => {
    setErro(null);
    setArquivo(file);
    setOfx(null);
    setMovsSistema([]);
    setCorrelacoes([]);
    setSelOfx(new Set());
    setSelSistema(new Set());
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseOfx(text);
      if (parsed.transacoes.length === 0) {
        setErro('Arquivo OFX invalido ou sem transações (STMTTRN).');
        return;
      }
      setOfx(parsed);
    } catch (err) {
      setErro('Erro ao ler arquivo: ' + err.message);
    }
  };

  const carregar = useCallback(async () => {
    if (!cliente || !contaCodigo || !ofx) return;
    setLoadingDados(true);
    setErro(null);
    try {
      const chave = chavesApi.find(ch => ch.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API não encontrada para a rede');
      const filtros = {
        dataInicial: ofx.dtStart,
        dataFinal: ofx.dtEnd,
        empresaCodigo: cliente.empresa_codigo,
      };
      const [movs, correlacoesSalvas] = await Promise.all([
        qualityApi.buscarMovimentoConta(chave.chave, filtros),
        ofxCorrelacaoService.listarCorrelacoes(cliente.id, contaCodigo).catch(() => []),
      ]);
      const cod = Number(contaCodigo);
      const doSistema = (movs || [])
        .filter(m => Number(m.contaCodigo) === cod)
        .map(m => {
          const isCredito = m.tipo === 'Crédito' || m.tipo === 'Credito' || m.tipo === 'C';
          return {
            id: Number(m.codigo ?? m.movimentoContaCodigo),
            data: m.dataMovimento,
            tipo: isCredito ? 'credito' : 'debito',
            valor: Math.abs(Number(m.valor || 0)),
            descricao: (m.descricao || '').trim() || '—',
            documento: m.documento || m.numeroDocumento || '',
          };
        });
      setMovsSistema(doSistema);
      setCorrelacoes(correlacoesSalvas);
      setSelOfx(new Set());
      setSelSistema(new Set());
    } catch (err) {
      setErro('Erro ao buscar movimentos do sistema: ' + err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [cliente, contaCodigo, ofx, chavesApi]);

  // ─── Índices para lookup rápido por correlação ──────────────
  // Mapas: identificador → correlacao (objeto). Quando o item já está numa
  // correlação salva, aparece com badge da cor da correlação em ambos os lados.
  const correlPorOfx = useMemo(() => {
    const m = new Map();
    (correlacoes || []).forEach(c => {
      (c.itens || []).forEach(it => {
        if (it.lado === 'ofx' && it.fitid) m.set(String(it.fitid), c);
      });
    });
    return m;
  }, [correlacoes]);
  const correlPorSistema = useMemo(() => {
    const m = new Map();
    (correlacoes || []).forEach(c => {
      (c.itens || []).forEach(it => {
        if (it.lado === 'sistema' && it.movimento_codigo != null) {
          m.set(Number(it.movimento_codigo), c);
        }
      });
    });
    return m;
  }, [correlacoes]);

  // ─── Drift detection: para cada item de correlação do lado sistema,
  // compara snapshot com o valor atual da Quality. Retorna mapa
  // movimento_codigo → { snapshot, atual, diff: array de campos alterados }
  const driftPorSistema = useMemo(() => {
    const m = new Map();
    const atualPorCodigo = new Map(movsSistema.map(mv => [Number(mv.id), mv]));
    (correlacoes || []).forEach(c => {
      (c.itens || []).forEach(it => {
        if (it.lado !== 'sistema' || it.movimento_codigo == null) return;
        const atual = atualPorCodigo.get(Number(it.movimento_codigo));
        if (!atual) {
          m.set(Number(it.movimento_codigo), { ausente: true, snapshot: it });
          return;
        }
        const diffCampos = [];
        if (Math.abs(Number(it.valor) - Number(atual.valor)) > 0.01) diffCampos.push('valor');
        if (it.data && atual.data && String(it.data).slice(0, 10) !== String(atual.data).slice(0, 10)) diffCampos.push('data');
        if ((it.descricao || '') !== (atual.descricao || '')) diffCampos.push('descricao');
        if (diffCampos.length > 0) m.set(Number(it.movimento_codigo), { snapshot: it, atual, diffCampos });
      });
    });
    return m;
  }, [correlacoes, movsSistema]);

  // ─── Totais selecionados em cada coluna ─────────────────────
  const totaisSelecionados = useMemo(() => {
    const somar = (lista) => lista.reduce((acc, t) => {
      const v = Number(t.valor || 0);
      if (t.tipo === 'credito') acc.creditos += v;
      else acc.debitos += v;
      return acc;
    }, { creditos: 0, debitos: 0 });
    const ofxSel = (ofx?.transacoes || []).filter(t => selOfx.has(String(t.fitid)));
    const sisSel = movsSistema.filter(m => selSistema.has(Number(m.id)));
    return {
      ofx: { ...somar(ofxSel), qtd: ofxSel.length, itens: ofxSel },
      sistema: { ...somar(sisSel), qtd: sisSel.length, itens: sisSel },
    };
  }, [ofx, movsSistema, selOfx, selSistema]);

  // ─── Validação para habilitar Vincular ──────────────────────
  // Regras: ambos lados precisam ter ao menos 1 item; tipos batem (só crédito
  // ou só débito de cada lado); soma absoluta bate dentro de R$ 0,01.
  const validacaoVincular = useMemo(() => {
    const { ofx: o, sistema: s } = totaisSelecionados;
    if (o.qtd === 0 || s.qtd === 0) return { ok: false, motivo: 'Selecione ao menos 1 item de cada lado' };
    const tiposOfx = new Set(o.itens.map(i => i.tipo));
    const tiposSis = new Set(s.itens.map(i => i.tipo));
    if (tiposOfx.size > 1) return { ok: false, motivo: 'Mistura crédito e débito no OFX selecionado' };
    if (tiposSis.size > 1) return { ok: false, motivo: 'Mistura crédito e débito no sistema selecionado' };
    const tipoOfx = [...tiposOfx][0];
    const tipoSis = [...tiposSis][0];
    if (tipoOfx !== tipoSis) return { ok: false, motivo: 'Tipos diferentes (OFX é ' + tipoOfx + ', sistema é ' + tipoSis + ')' };
    const totalOfx = tipoOfx === 'credito' ? o.creditos : o.debitos;
    const totalSis = tipoSis === 'credito' ? s.creditos : s.debitos;
    const diff = Math.abs(totalOfx - totalSis);
    if (diff > 0.01) return { ok: false, motivo: 'Soma não bate: Δ ' + formatCurrency(totalOfx - totalSis) };
    return { ok: true, tipo: tipoOfx, total: totalOfx };
  }, [totaisSelecionados]);

  const vincular = useCallback(async () => {
    if (!validacaoVincular.ok || !cliente || !chavesApi || !contaCodigo) return;
    setSalvando(true);
    try {
      const itensOfx = totaisSelecionados.ofx.itens.map(t => ({
        fitid:     t.fitid,
        valor:     t.valor,
        data:      t.data,
        tipo:      t.tipo,
        descricao: t.memo || t.name || '',
      }));
      const itensSistema = totaisSelecionados.sistema.itens.map(t => ({
        movimento_codigo: t.id,
        valor:            t.valor,
        data:             t.data,
        tipo:             t.tipo,
        descricao:        t.descricao,
        documento:        t.documento,
      }));
      await ofxCorrelacaoService.criarCorrelacao({
        chaveApiId:  cliente.chave_api_id,
        clienteId:   cliente.id,
        contaCodigo: Number(contaCodigo),
        tipo:        validacaoVincular.tipo,
        valorTotal:  validacaoVincular.total,
        criadoPor:   usuarioId,
        itensOfx,
        itensSistema,
      });
      // Recarrega as correlações
      const lista = await ofxCorrelacaoService.listarCorrelacoes(cliente.id, Number(contaCodigo));
      setCorrelacoes(lista);
      setSelOfx(new Set());
      setSelSistema(new Set());
      showToast('success', 'Correlação salva');
    } catch (err) {
      showToast('error', err.message || 'Falha ao salvar');
    } finally {
      setSalvando(false);
    }
  }, [validacaoVincular, totaisSelecionados, cliente, chavesApi, contaCodigo, usuarioId]);

  const excluirCorrelacao = useCallback(async (id) => {
    try {
      await ofxCorrelacaoService.excluirCorrelacao(id);
      setCorrelacoes(prev => prev.filter(c => c.id !== id));
      setConfirmExcluir({ open: false, correlacao: null });
      showToast('success', 'Correlação excluída');
    } catch (err) {
      showToast('error', err.message || 'Falha ao excluir');
    }
  }, []);

  const toggleOfx = (fitid) => setSelOfx(prev => {
    const n = new Set(prev);
    const k = String(fitid);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const toggleSistema = (id) => setSelSistema(prev => {
    const n = new Set(prev);
    const k = Number(id);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  // ─── Filtros de busca (histórico + documento) ────────────
  const movsSistemaFiltrados = useMemo(() => {
    const q = buscaSistema.trim().toLowerCase();
    if (!q) return movsSistema;
    return movsSistema.filter(m =>
      String(m.descricao || '').toLowerCase().includes(q) ||
      String(m.documento || '').toLowerCase().includes(q),
    );
  }, [movsSistema, buscaSistema]);

  const ofxTransacoesFiltradas = useMemo(() => {
    const q = buscaOfx.trim().toLowerCase();
    const lista = ofx?.transacoes || [];
    if (!q) return lista;
    return lista.filter(t =>
      String(t.memo || '').toLowerCase().includes(q) ||
      String(t.name || '').toLowerCase().includes(q) ||
      String(t.fitid || '').toLowerCase().includes(q),
    );
  }, [ofx, buscaOfx]);

  // Agrupa lançamentos por dia em ordem CRESCENTE (mais antigo no topo) —
  // facilita conciliação porque ambos os lados seguem a mesma linha do tempo.
  const sistemaPorDia = useMemo(() => {
    const mapa = new Map(); // diaISO → { dia, label, itens }
    movsSistemaFiltrados.forEach(m => {
      const dia = String(m.data || '').slice(0, 10) || 'sem-data';
      if (!mapa.has(dia)) mapa.set(dia, { dia, label: formatDataBR(dia), itens: [] });
      mapa.get(dia).itens.push(m);
    });
    return Array.from(mapa.values()).sort((a, b) => a.dia.localeCompare(b.dia));
  }, [movsSistemaFiltrados]);

  const ofxPorDia = useMemo(() => {
    const mapa = new Map();
    ofxTransacoesFiltradas.forEach(t => {
      const dia = String(t.data || '').slice(0, 10) || 'sem-data';
      if (!mapa.has(dia)) mapa.set(dia, { dia, label: formatDataBR(dia), itens: [] });
      mapa.get(dia).itens.push(t);
    });
    return Array.from(mapa.values()).sort((a, b) => a.dia.localeCompare(b.dia));
  }, [ofxTransacoesFiltradas]);

  // Toggles: clica → adiciona ao set se não estiver; remove se estiver.
  const toggleDiaSistema = (dia) => setDiasAbertosSistema(prev => {
    const n = new Set(prev);
    if (n.has(dia)) n.delete(dia); else n.add(dia);
    return n;
  });
  const abrirTodosSistema  = () => setDiasAbertosSistema(new Set(sistemaPorDia.map(g => g.dia)));
  const fecharTodosSistema = () => setDiasAbertosSistema(new Set());

  const toggleDiaOfx = (dia) => setDiasAbertosOfx(prev => {
    const n = new Set(prev);
    if (n.has(dia)) n.delete(dia); else n.add(dia);
    return n;
  });
  const abrirTodosOfx  = () => setDiasAbertosOfx(new Set(ofxPorDia.map(g => g.dia)));
  const fecharTodosOfx = () => setDiasAbertosOfx(new Set());

  // Seleção em massa baseada na lista FILTRADA — mantém os já selecionados
  // que estiverem fora do filtro.
  const selecionarTodosSistemaFiltrados = () => setSelSistema(prev => {
    const next = new Set(prev);
    movsSistemaFiltrados.forEach(m => next.add(Number(m.id)));
    return next;
  });
  const limparSistemaFiltrados = () => setSelSistema(prev => {
    const next = new Set(prev);
    movsSistemaFiltrados.forEach(m => next.delete(Number(m.id)));
    return next;
  });
  const selecionarTodosOfxFiltrados = () => setSelOfx(prev => {
    const next = new Set(prev);
    ofxTransacoesFiltradas.forEach(t => { if (t.fitid) next.add(String(t.fitid)); });
    return next;
  });
  const limparOfxFiltrados = () => setSelOfx(prev => {
    const next = new Set(prev);
    ofxTransacoesFiltradas.forEach(t => { if (t.fitid) next.delete(String(t.fitid)); });
    return next;
  });
  // Estado da seleção de massa (none/some/all) para alternar o checkbox master.
  const stateMassaSistema = (() => {
    if (movsSistemaFiltrados.length === 0) return 'none';
    const marcados = movsSistemaFiltrados.filter(m => selSistema.has(Number(m.id))).length;
    if (marcados === 0) return 'none';
    if (marcados === movsSistemaFiltrados.length) return 'all';
    return 'some';
  })();
  const stateMassaOfx = (() => {
    const elegiveis = ofxTransacoesFiltradas.filter(t => t.fitid);
    if (elegiveis.length === 0) return 'none';
    const marcados = elegiveis.filter(t => selOfx.has(String(t.fitid))).length;
    if (marcados === 0) return 'none';
    if (marcados === elegiveis.length) return 'all';
    return 'some';
  })();

  if (loadingInicial) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div>
      {/* Seletor rede + empresa + conta + upload */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">1. Rede</label>
            <SeletorRedeBPO
              chavesApi={chavesApi}
              redesAutosystem={redesAutosystem}
              contagensPorRede={contagensPorRede}
              value={redeSel}
              onChange={setRedeSel}
              placeholder="Selecione..."
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">2. Empresa</label>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={!redeSel}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400">
              <option value="">{redeSel ? 'Selecione...' : 'Escolha a rede primeiro'}</option>
              {empresasDaRede.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              3. Conta bancária {loadingContas && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
            </label>
            <select value={contaCodigo} onChange={(e) => setContaCodigo(e.target.value)} disabled={!cliente || loadingContas}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400">
              <option value="">{cliente ? (contasElegiveis.length === 0 ? 'Nenhuma conta bancária' : 'Selecione...') : 'Escolha a empresa primeiro'}</option>
              {contasElegiveis.map(c => (
                <option key={c.codigo} value={c.codigo}>{c.descricao} · {c.tipo}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="inline-flex items-center gap-2 h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <Upload className="h-4 w-4" /> {arquivo ? 'Trocar arquivo OFX' : 'Selecionar arquivo OFX'}
            </span>
            <input type="file" accept=".ofx,.txt" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] || null)} />
          </label>
          {arquivo && (
            <p className="text-xs text-gray-500">
              <FileText className="inline h-3.5 w-3.5 mr-1 text-gray-400" />
              {arquivo.name} · {(arquivo.size / 1024).toFixed(1)} KB
            </p>
          )}
          <button onClick={carregar} disabled={!ofx || !contaCodigo || loadingDados}
            className="ml-auto flex items-center gap-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Carregar dados
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{erro}</p>
        </div>
      )}

      {/* Card de resumo do OFX */}
      {ofx && (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Arquivo OFX</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-5 text-sm">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Banco</p>
              <p className="font-medium text-gray-900">{formatBanco(ofx.bankId, ofx.org)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Agência</p>
              <p className="font-mono text-gray-900">{ofx.branchId || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Conta</p>
              <p className="font-mono text-gray-900">{ofx.acctId || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Período</p>
              <p className="font-mono text-gray-900 text-[12px]">{formatDataBR(ofx.dtStart)} a {formatDataBR(ofx.dtEnd)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Transações</p>
              <p className="font-semibold text-gray-900">{ofx.transacoes.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar de vínculo: sticky quando há seleção em qualquer lado.
          Verde quando os totais batem e tipos coincidem (pronto pra vincular);
          amber quando há divergência. */}
      {movsSistema.length > 0 && (selOfx.size > 0 || selSistema.size > 0) && (
        <div className={`sticky top-20 z-20 rounded-xl border shadow-lg mb-3 p-3 flex items-center gap-4 flex-wrap transition-colors ${
          validacaoVincular.ok
            ? 'bg-emerald-100 border-emerald-400'
            : 'bg-amber-100 border-amber-400'
        }`}>
          <div className="flex items-center gap-2 text-[12px]">
            {validacaoVincular.ok
              ? <Link2 className="h-4 w-4 text-emerald-600" />
              : <AlertCircle className="h-4 w-4 text-amber-600" />}
            <span className={`font-semibold ${validacaoVincular.ok ? 'text-emerald-900' : 'text-amber-900'}`}>
              {validacaoVincular.ok ? 'Pronto para vincular' : 'Selecionado:'}
            </span>
          </div>
          <div className="text-[12px]">
            <span className="text-gray-600">Sistema</span>{' '}
            <span className="font-semibold text-gray-900">{totaisSelecionados.sistema.qtd}</span>
            {totaisSelecionados.sistema.creditos > 0 && <span className="text-emerald-700 ml-1 font-mono tabular-nums">+{formatCurrency(totaisSelecionados.sistema.creditos)}</span>}
            {totaisSelecionados.sistema.debitos > 0 && <span className="text-red-700 ml-1 font-mono tabular-nums">-{formatCurrency(totaisSelecionados.sistema.debitos)}</span>}
          </div>
          <div className="text-gray-300">↔</div>
          <div className="text-[12px]">
            <span className="text-gray-600">OFX</span>{' '}
            <span className="font-semibold text-gray-900">{totaisSelecionados.ofx.qtd}</span>
            {totaisSelecionados.ofx.creditos > 0 && <span className="text-emerald-700 ml-1 font-mono tabular-nums">+{formatCurrency(totaisSelecionados.ofx.creditos)}</span>}
            {totaisSelecionados.ofx.debitos > 0 && <span className="text-red-700 ml-1 font-mono tabular-nums">-{formatCurrency(totaisSelecionados.ofx.debitos)}</span>}
          </div>
          <div className="flex-1" />
          {!validacaoVincular.ok && (
            <span className="text-[11.5px] text-amber-800 flex items-center gap-1">
              {validacaoVincular.motivo}
            </span>
          )}
          <button onClick={() => { setSelOfx(new Set()); setSelSistema(new Set()); }}
            className="text-[11.5px] text-gray-500 hover:text-gray-800 px-2 py-1">
            Limpar
          </button>
          <button onClick={vincular} disabled={!validacaoVincular.ok || salvando}
            className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Vincular
          </button>
        </div>
      )}

      {/* Layout 2 colunas: Sistema (esq) | OFX (dir) */}
      {movsSistema.length > 0 && ofx && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          {/* ─── Coluna Sistema (esquerda) — tree por dia + busca ─── */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-blue-50/40 flex items-center gap-2 flex-wrap">
              <h3 className="text-[13px] font-semibold text-gray-800">Sistema</h3>
              <span className="text-[11px] text-gray-400">
                · {movsSistemaFiltrados.length}{buscaSistema && movsSistema.length !== movsSistemaFiltrados.length ? `/${movsSistema.length}` : ''} movimento(s) · {selSistema.size} selec.
              </span>
              {sistemaPorDia.length > 1 && (
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={abrirTodosSistema}
                    className="text-[10.5px] text-blue-600 hover:text-blue-800 font-medium">Expandir</button>
                  <span className="text-[10.5px] text-gray-300">|</span>
                  <button onClick={fecharTodosSistema}
                    className="text-[10.5px] text-blue-600 hover:text-blue-800 font-medium">Recolher</button>
                </div>
              )}
            </div>
            <div className="px-3 py-2 border-b border-gray-100 bg-white space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                <input value={buscaSistema} onChange={e => setBuscaSistema(e.target.value)}
                  placeholder="Buscar por histórico ou documento..."
                  className="w-full h-8 pl-7 pr-2 text-xs rounded border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
              </div>
              {movsSistemaFiltrados.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                    <input type="checkbox"
                      checked={stateMassaSistema === 'all'}
                      ref={el => { if (el) el.indeterminate = stateMassaSistema === 'some'; }}
                      onChange={() => stateMassaSistema === 'all' ? limparSistemaFiltrados() : selecionarTodosSistemaFiltrados()}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                    <span className="text-[11px] font-medium text-gray-700">
                      {stateMassaSistema === 'all' ? 'Desmarcar todos' : 'Selecionar todos'}
                      {buscaSistema && <span className="text-gray-400"> ({movsSistemaFiltrados.length})</span>}
                    </span>
                  </label>
                </div>
              )}
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {sistemaPorDia.length === 0 ? (
                <p className="px-4 py-10 text-center text-[12px] text-gray-400">
                  {buscaSistema ? 'Nenhum movimento corresponde à busca' : 'Nenhum movimento no período'}
                </p>
              ) : sistemaPorDia.map(grupo => {
                const aberto = diasAbertosSistema.has(grupo.dia);
                let credito = 0, debito = 0;
                grupo.itens.forEach(m => {
                  if (m.tipo === 'credito') credito += Number(m.valor || 0);
                  else                       debito  += Number(m.valor || 0);
                });
                return (
                  <div key={grupo.dia} className="border-b border-gray-100 last:border-b-0">
                    <button onClick={() => toggleDiaSistema(grupo.dia)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50/60 hover:bg-gray-100/60 transition-colors text-left">
                      <motion.div animate={{ rotate: aberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                      </motion.div>
                      <span className="font-mono text-[12px] text-gray-700 tabular-nums">{grupo.label}</span>
                      <span className="text-[10.5px] text-gray-400">· {grupo.itens.length} item{grupo.itens.length === 1 ? '' : 'ns'}</span>
                      <span className="ml-auto flex items-center gap-2 text-[10.5px] font-mono tabular-nums">
                        {credito > 0 && <span className="text-emerald-700">+{formatCurrency(credito)}</span>}
                        {debito  > 0 && <span className="text-red-700">-{formatCurrency(debito)}</span>}
                      </span>
                    </button>
                    {aberto && (
                      <div className="divide-y divide-gray-100">
                        {grupo.itens.map(m => {
                          const correl = correlPorSistema.get(Number(m.id));
                          const cor = correl ? corDaCorrelacao(correl.id) : null;
                          const drift = driftPorSistema.get(Number(m.id));
                          const checked = selSistema.has(Number(m.id));
                          return (
                            <label key={m.id}
                              className={`flex items-start gap-2 px-4 py-2 cursor-pointer transition-colors ${
                                checked ? 'bg-blue-50/60' : 'hover:bg-gray-50/60'
                              } ${correl ? `ring-1 ${cor.ring} ring-inset` : ''}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleSistema(m.id)}
                                className="mt-1 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  {correl && (
                                    <span className={`inline-flex items-center gap-1 text-[9.5px] font-medium rounded-full px-1.5 py-0.5 ${cor.bg} ${cor.text}`}>
                                      <span className={`h-1.5 w-1.5 rounded-full ${cor.dot}`} />
                                      {correl.label || 'vínculo'}
                                    </span>
                                  )}
                                  {drift && (
                                    <span className="inline-flex items-center gap-1 text-[9.5px] font-medium rounded-full px-1.5 py-0.5 bg-amber-50 text-amber-700"
                                      title={drift.ausente ? `Movimento removido. Snapshot: R$ ${drift.snapshot.valor} em ${formatDataBR(drift.snapshot.data)}` : `Alteração em: ${drift.diffCampos.join(', ')}. Snapshot: R$ ${drift.snapshot.valor} em ${formatDataBR(drift.snapshot.data)}`}>
                                      <AlertTriangle className="h-2.5 w-2.5" /> {drift.ausente ? 'removido' : 'alterado'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[12px] text-gray-800 truncate">{m.descricao}</p>
                                {m.documento && <p className="text-[10px] text-gray-400 font-mono">doc {m.documento}</p>}
                              </div>
                              <span className={`text-right font-mono text-[12px] tabular-nums whitespace-nowrap font-semibold ${m.tipo === 'credito' ? 'text-emerald-700' : 'text-red-700'}`}>
                                {m.tipo === 'credito' ? '+' : '-'}{formatCurrency(m.valor)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Coluna OFX (direita) — tree por dia + busca ─── */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-blue-50/40 flex items-center gap-2 flex-wrap">
              <h3 className="text-[13px] font-semibold text-gray-800">OFX</h3>
              <span className="text-[11px] text-gray-400">
                · {ofxTransacoesFiltradas.length}{buscaOfx && ofx.transacoes.length !== ofxTransacoesFiltradas.length ? `/${ofx.transacoes.length}` : ''} transação(ões) · {selOfx.size} selec.
              </span>
              {ofxPorDia.length > 1 && (
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={abrirTodosOfx}
                    className="text-[10.5px] text-blue-600 hover:text-blue-800 font-medium">Expandir</button>
                  <span className="text-[10.5px] text-gray-300">|</span>
                  <button onClick={fecharTodosOfx}
                    className="text-[10.5px] text-blue-600 hover:text-blue-800 font-medium">Recolher</button>
                </div>
              )}
            </div>
            <div className="px-3 py-2 border-b border-gray-100 bg-white space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                <input value={buscaOfx} onChange={e => setBuscaOfx(e.target.value)}
                  placeholder="Buscar no histórico OFX (memo, nome ou ID)..."
                  className="w-full h-8 pl-7 pr-2 text-xs rounded border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
              </div>
              {ofxTransacoesFiltradas.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                    <input type="checkbox"
                      checked={stateMassaOfx === 'all'}
                      ref={el => { if (el) el.indeterminate = stateMassaOfx === 'some'; }}
                      onChange={() => stateMassaOfx === 'all' ? limparOfxFiltrados() : selecionarTodosOfxFiltrados()}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                    <span className="text-[11px] font-medium text-gray-700">
                      {stateMassaOfx === 'all' ? 'Desmarcar todos' : 'Selecionar todos'}
                      {buscaOfx && <span className="text-gray-400"> ({ofxTransacoesFiltradas.filter(t => t.fitid).length})</span>}
                    </span>
                  </label>
                </div>
              )}
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {ofxPorDia.length === 0 ? (
                <p className="px-4 py-10 text-center text-[12px] text-gray-400">
                  {buscaOfx ? 'Nenhuma transação corresponde à busca' : 'Nenhuma transação no arquivo'}
                </p>
              ) : ofxPorDia.map(grupo => {
                const aberto = diasAbertosOfx.has(grupo.dia);
                let credito = 0, debito = 0;
                grupo.itens.forEach(t => {
                  if (t.tipo === 'credito') credito += Number(t.valor || 0);
                  else                       debito  += Number(t.valor || 0);
                });
                return (
                  <div key={grupo.dia} className="border-b border-gray-100 last:border-b-0">
                    <button onClick={() => toggleDiaOfx(grupo.dia)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50/60 hover:bg-gray-100/60 transition-colors text-left">
                      <motion.div animate={{ rotate: aberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                      </motion.div>
                      <span className="font-mono text-[12px] text-gray-700 tabular-nums">{grupo.label}</span>
                      <span className="text-[10.5px] text-gray-400">· {grupo.itens.length} item{grupo.itens.length === 1 ? '' : 'ns'}</span>
                      <span className="ml-auto flex items-center gap-2 text-[10.5px] font-mono tabular-nums">
                        {credito > 0 && <span className="text-emerald-700">+{formatCurrency(credito)}</span>}
                        {debito  > 0 && <span className="text-red-700">-{formatCurrency(debito)}</span>}
                      </span>
                    </button>
                    {aberto && (
                      <div className="divide-y divide-gray-100">
                        {grupo.itens.map((t, i) => {
                          const correl = t.fitid ? correlPorOfx.get(String(t.fitid)) : null;
                          const cor = correl ? corDaCorrelacao(correl.id) : null;
                          const checked = selOfx.has(String(t.fitid));
                          return (
                            <label key={t.fitid || `${grupo.dia}-${i}`}
                              className={`flex items-start gap-2 px-4 py-2 cursor-pointer transition-colors ${
                                checked ? 'bg-blue-50/60' : 'hover:bg-gray-50/60'
                              } ${correl ? `ring-1 ${cor.ring} ring-inset` : ''}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleOfx(t.fitid)}
                                disabled={!t.fitid}
                                className="mt-1 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400 disabled:opacity-30" />
                              <div className="flex-1 min-w-0">
                                {correl && (
                                  <div className="mb-0.5">
                                    <span className={`inline-flex items-center gap-1 text-[9.5px] font-medium rounded-full px-1.5 py-0.5 ${cor.bg} ${cor.text}`}>
                                      <span className={`h-1.5 w-1.5 rounded-full ${cor.dot}`} />
                                      {correl.label || 'vínculo'}
                                    </span>
                                  </div>
                                )}
                                <p className="text-[12px] text-gray-800 truncate">{t.memo || '—'}</p>
                                {t.name && <p className="text-[10px] text-gray-400 truncate">{t.name}</p>}
                              </div>
                              <span className={`text-right font-mono text-[12px] tabular-nums whitespace-nowrap font-semibold ${t.tipo === 'credito' ? 'text-emerald-700' : 'text-red-700'}`}>
                                {t.tipo === 'credito' ? '+' : '-'}{formatCurrency(t.valor)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Correlações salvas */}
      {correlacoes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Vínculos salvos</h3>
            <span className="text-[11px] text-gray-400">· {correlacoes.length} correlação(ões)</span>
          </div>
          <div className="divide-y divide-gray-100">
            {correlacoes.map(c => {
              const cor = corDaCorrelacao(c.id);
              const itensOfx = (c.itens || []).filter(i => i.lado === 'ofx');
              const itensSis = (c.itens || []).filter(i => i.lado === 'sistema');
              const temDrift = itensSis.some(i => driftPorSistema.has(Number(i.movimento_codigo)));
              return (
                <div key={c.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/40 transition-colors">
                  <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${cor.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-gray-900">{c.label || `Correlação ${String(c.id).slice(0, 8)}`}</span>
                      <span className={`inline-flex items-center text-[10px] font-medium rounded-full px-1.5 py-0.5 ${cor.bg} ${cor.text}`}>
                        {c.tipo === 'credito' ? '+' : '-'}{formatCurrency(c.valor_total)}
                      </span>
                      {temDrift && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-amber-50 text-amber-700">
                          <AlertTriangle className="h-2.5 w-2.5" /> alteração detectada no sistema
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {itensSis.length} sistema ↔ {itensOfx.length} OFX
                      {' · criado em '}{c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR') : '—'}
                    </p>
                  </div>
                  <button onClick={() => setConfirmExcluir({ open: true, correlacao: c })}
                    title="Excluir vínculo"
                    className="rounded p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!ofx && !erro && (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <FileSearch className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Envie um arquivo OFX para começar</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Selecione a rede, a empresa e a conta bancária; em seguida envie o OFX do banco.
            Você poderá vincular transações do OFX aos lançamentos do sistema, agrupando o quanto quiser de cada lado.
          </p>
        </div>
      )}

      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <Modal open={confirmExcluir.open} onClose={() => setConfirmExcluir({ open: false, correlacao: null })}
        title="Excluir vínculo" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Excluir o vínculo <strong>{confirmExcluir.correlacao?.label || String(confirmExcluir.correlacao?.id || '').slice(0, 8)}</strong>?
            Os lançamentos do OFX e do sistema voltam a ficar disponíveis para novo vínculo.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmExcluir({ open: false, correlacao: null })}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">
              Cancelar
            </button>
            <button onClick={() => excluirCorrelacao(confirmExcluir.correlacao.id)}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">
              Excluir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
