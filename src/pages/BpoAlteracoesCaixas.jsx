import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, RefreshCw, Building2, ChevronDown, ChevronRight,
  History, Search, Users, FileText, AlertTriangle, Download,
  Plus, Pencil, Trash2,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import * as clientesService from '../services/clientesService';
import * as autosystemService from '../services/autosystemService';
import { useAnonimizador } from '../services/anonimizarService';
import SeletorRedeBPO from '../components/ui/SeletorRedeBPO';
import { formatCurrency } from '../utils/format';
import { gerarPdfHistoricoUsuarios } from '../utils/pdfHistoricoUsuarios';

// ─── Helpers ───────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoOntem() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function primeiroDiaDoMesIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
function formatDataBR(iso) {
  if (iso == null || iso === '') return '—';
  const s = String(iso);
  // Aceita ISO ("2026-05-12...") ou já formatado
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // Fallback: se já vem em DD/MM/YYYY, retorna como veio
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
  return s;
}
function formatTimestamp(whenStr) {
  // Aceita formatos tipo "2026-02-15 14:30:25" ou "2026-02-15T14:30:25"
  if (!whenStr) return '—';
  const s = String(whenStr);
  const dateMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = s.match(/(\d{2}):(\d{2})/);
  if (!dateMatch) return s;
  const br = `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`;
  return timeMatch ? `${br} ${timeMatch[1]}:${timeMatch[2]}` : br;
}
function timestampOf(ev) {
  // _when é a string ISO do pgd_when — fonte canônica de ordenação cronológica.
  return String(ev._when || '');
}
// Chave estável do lançamento: backend já consolida via coalesce(mlid, parent)
// no alias _lancamento. Fallback local prioriza mlid (mais estável) → parent.
function lancamentoKey(ev) {
  const cand = ev._lancamento ?? ev.mlid ?? ev.parent ?? ev.movto;
  return cand != null && String(cand).trim() !== '' ? String(cand) : 'sem';
}
function lancamentoLabel(ev) {
  return ev._lancamento ?? ev.mlid ?? ev.parent ?? ev.movto;
}
function fmtNum(v) {
  if (v == null || !Number.isFinite(Number(v))) return '0';
  return Number(v).toLocaleString('pt-BR');
}
function formatValor(v) {
  if (v == null) return '—';
  const s = String(v).trim();
  return s === '' ? '—' : s;
}
function normalizar(v) {
  if (v == null) return '';
  return String(v).trim();
}

// Metadados de evento — ignorados no diff porque mudam toda linha sem
// representar uma alteração de negócio. Inclui colunas-padrão do Autosystem
// (pgd_*) e nossos aliases canônicos.
const CAMPOS_META = new Set([
  // Metadados do log
  'pgd_gfid', 'pgd_optype', 'pgd_when', 'pgd_when_ts', 'pgd_rfid', 'pgd_host',
  'pgd_username', 'pgd_module', 'estacao', 'optype', 'usuario_nome',
  // Aliases canônicos
  '_when', '_hora', '_lancamento',
  // Identificadores estruturais
  'parent', 'mlid', 'grid', 'child', 'movto', 'movto_uuid', 'empresa',
  // Campos derivados/internos do Autosystem que mudam sem semântica de negócio
  'force_usuario', 'foreground', 'info_adic', 'motivo_dict', 'parent_list',
  'centro_custo_list', 'codigo_centro_custo', 'lote', 'marcador', 'ok',
  'exporta_sap', 'importa_sap', 'motivo_forma_pgto', 'motivo_padrao',
  'pessoa_codigo', 'pessoa_id', 'pessoa_simples',
  'desconto_venda', 'seq', 'info', 'conferido', 'placa',
  // Nomes de conta/motivo vêm de JOIN — não são campos editáveis
  'conta_debitar_nome', 'conta_creditar_nome', 'motivo_movto_nome',
  // Contas contábeis: redundantes com `motivo` (mudar motivo muda as contas).
  // Mantidas em mf.* pra exibir no header do evento, mas não entram no diff.
  'conta_debitar', 'conta_creditar',
]);

// Render compacto "código · nome" pra contas contábeis
function ContaLabel({ codigo, nome, className = '' }) {
  if (!codigo) return null;
  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`}>
      <span className="font-mono">{codigo}</span>
      {nome && <span className="text-gray-500 italic">{nome}</span>}
    </span>
  );
}

// Quando o campo for conta_debitar/conta_creditar, anexa o nome correspondente
// das versões antes/depois (vem do JOIN com conta na edge function).
const SUFIXO_NOME = {
  conta_debitar:  'conta_debitar_nome',
  conta_creditar: 'conta_creditar_nome',
};
function calcularDiff(antes, depois) {
  if (!antes || !depois) return [];
  const mudancas = [];
  const keys = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  for (const k of keys) {
    if (CAMPOS_META.has(k.toLowerCase())) continue;
    if (normalizar(antes[k]) !== normalizar(depois[k])) {
      const ch = { campo: k, antes: antes[k], depois: depois[k] };
      const nomeKey = SUFIXO_NOME[k];
      if (nomeKey) {
        ch.antesNome  = antes[nomeKey];
        ch.depoisNome = depois[nomeKey];
      }
      mudancas.push(ch);
    }
  }
  return mudancas;
}

// Tipo geral (I/U/D) — pega o primeiro caractere da coluna de operação.
// pgd_optype no Autosystem usa: 'I' | 'Un' | 'Uo' | 'D'.
function detectarTipoOperacao(linha) {
  const v = linha.pgd_optype ?? linha.optype ?? linha.operacao ?? linha.tipo ?? linha.acao ?? linha.evento;
  if (v == null) return null;
  const s = String(v).toUpperCase().trim();
  if (!s) return null;
  const c = s.charAt(0);
  if (c === 'I' || c === 'U' || c === 'D') return c;
  return null;
}

// Variante de update: Un = estado depois da edição, Uo = estado antes.
function detectarVarianteUpdate(linha) {
  const v = linha.pgd_optype ?? linha.optype;
  if (v == null) return null;
  const s = String(v).toUpperCase().trim();
  if (s === 'UN') return 'Un';
  if (s === 'UO') return 'Uo';
  return null;
}

function nomeUsuario(ev) {
  // Destaque: prioriza o nome amigável (JOIN com usuario+pessoa), depois
  // o campo `usuario` (movto.usuario do lançamento) e só por último o
  // `pgd_username` (login técnico do log de auditoria).
  return ev.usuario_nome || ev.usuario || ev.pgd_username || '';
}

// Classifica um conjunto de linhas com o MESMO pgd_when em um evento lógico.
// Regras (do novo modelo da movto_flow):
//   - D + I no mesmo pgd_when → ALTERAÇÃO manual (D = antes, I = depois)
//   - Uo + Un no mesmo pgd_when → AJUSTE automático (Uo = antes, Un = depois)
//   - D sozinho → EXCLUSÃO
//   - I sozinho → INCLUSÃO
//   - Caso degenerado (só Un, só Uo, etc.) → INDETERMINADO
function classificarBucket(items) {
  const dItem  = items.find(ev => detectarTipoOperacao(ev) === 'D' && detectarVarianteUpdate(ev) == null);
  const iItem  = items.find(ev => detectarTipoOperacao(ev) === 'I');
  const uoItem = items.find(ev => detectarVarianteUpdate(ev) === 'Uo');
  const unItem = items.find(ev => detectarVarianteUpdate(ev) === 'Un');

  if (dItem && iItem) {
    return { tipo: 'ALTERACAO', antes: dItem, depois: iItem };
  }
  if (uoItem && unItem) {
    return { tipo: 'AJUSTE', antes: uoItem, depois: unItem };
  }
  if (dItem) {
    return { tipo: 'EXCLUSAO', antes: dItem, depois: null };
  }
  if (iItem) {
    return { tipo: 'INCLUSAO', antes: null, depois: iItem };
  }
  // Só Un ou só Uo isolados — não há par
  return {
    tipo: 'INDETERMINADO',
    antes: uoItem || null,
    depois: unItem || items[0],
  };
}

function rotuloTipo(t) {
  if (t === 'INCLUSAO')      return 'Inclusão';
  if (t === 'ALTERACAO')     return 'Alteração';
  if (t === 'AJUSTE')        return 'Ajuste';
  if (t === 'EXCLUSAO')      return 'Exclusão';
  if (t === 'INDETERMINADO') return 'Indeterminado';
  return t || '—';
}
const COR_TIPO = {
  INCLUSAO:      { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', icon: 'text-emerald-600', Icon: Plus },
  ALTERACAO:     { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',   icon: 'text-amber-600',   Icon: Pencil },
  AJUSTE:        { bg: 'bg-blue-50',    text: 'text-blue-700',    ring: 'ring-blue-200',    icon: 'text-blue-600',    Icon: RefreshCw },
  EXCLUSAO:      { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-200',    icon: 'text-rose-600',    Icon: Trash2 },
  INDETERMINADO: { bg: 'bg-gray-50',    text: 'text-gray-700',    ring: 'ring-gray-200',    icon: 'text-gray-500',    Icon: AlertTriangle },
};
const ORDEM_TIPOS = ['INCLUSAO', 'ALTERACAO', 'AJUSTE', 'EXCLUSAO', 'INDETERMINADO'];

// Campos do snapshot a destacar no header e no painel de inclusão.
// A ordem aqui determina a ordem de exibição.
// Campos relevantes do lançamento exibidos no diff/snapshot. Ordem espelha
// o histórico do Autosystem (Visualizar Histórico → vista simplificada).
// "Forma de Pagamento" no Autosystem mapeia pra `motivo_nome` (entidade
// motivo), não pro `conta_debitar` — esse é só o código contábil derivado.
const CAMPOS_RELEVANTES = [
  { key: 'data',              label: 'Data',                type: 'date' },
  { key: 'vencto',            label: 'Vencto',              type: 'date' },
  { key: 'motivo',            label: 'Motivo',              type: 'motivo', nomeKey: 'motivo_movto_nome' },
  { key: 'motivo_nome',       label: 'Forma de Pagamento', type: 'text' },
  { key: 'pessoa_nome',       label: 'Pessoa',              type: 'text' },
  { key: 'documento',         label: 'Documento',           type: 'text' },
  { key: 'obs',               label: 'Observação',          type: 'text' },
  { key: 'valor',             label: 'Valor',               type: 'currency' },
];

// Renderiza um valor de acordo com o tipo configurado.
function ValorFormatado({ v, field, obj }) {
  if (v == null || String(v).trim() === '') {
    return <span className="text-gray-400">—</span>;
  }
  switch (field.type) {
    case 'date':
      return <>{formatDataBR(v)}</>;
    case 'currency':
      return <>{formatCurrency(Number(v) || 0)}</>;
    case 'conta': {
      const nome = field.nomeKey ? obj?.[field.nomeKey] : null;
      return (
        <span className="inline-flex items-baseline gap-1.5 flex-wrap">
          <span className="font-mono">{String(v)}</span>
          {nome && <span className="italic text-gray-500 text-[10.5px]">{nome}</span>}
        </span>
      );
    }
    case 'motivo': {
      // Mostra apenas o nome canônico (vindo do JOIN com motivo_movto).
      // O código FK é omitido — sem valor informativo pro usuário.
      const nome = field.nomeKey ? obj?.[field.nomeKey] : null;
      return <>{nome || String(v)}</>;
    }
    default:
      return <>{String(v)}</>;
  }
}

// ─── Página ────────────────────────────────────────────────────

export default function BpoAlteracoesCaixas() {
  const { labelEmpresa } = useAnonimizador();
  const [clientes, setClientes] = useState([]);
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [redeSel, setRedeSel] = useState(null);

  const [empresasSelIds, setEmpresasSelIds] = useState(new Set());
  const [dataDe, setDataDe] = useState(isoOntem());
  const [dataAte, setDataAte] = useState(isoOntem());
  const [busca, setBusca] = useState('');

  const [schema, setSchema] = useState([]);
  const [alteracoes, setAlteracoes] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [expandidos, setExpandidos] = useState(new Set());

  // Filtro de usuário do log (pgd_username): carrega lista distinta do backend.
  const [usuariosOptions, setUsuariosOptions] = useState([]);
  const [usuariosSelSet, setUsuariosSelSet] = useState(new Set());
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);

  // Filtro de usuário ORIGINAL (coluna `usuario` do lançamento).
  const [usuariosOrigOptions, setUsuariosOrigOptions] = useState([]);
  const [usuariosOrigSelSet, setUsuariosOrigSelSet] = useState(new Set());
  const [loadingUsuariosOrig, setLoadingUsuariosOrig] = useState(false);

  // Catálogos
  useEffect(() => {
    (async () => {
      try {
        const [lista, redesAS] = await Promise.all([
          clientesService.listarClientes(),
          autosystemService.listarRedes().catch(() => []),
        ]);
        const clientesValidos = (lista || []).filter(c =>
          c.as_rede_id && c.empresa_codigo != null && c.empresa_codigo !== ''
        );
        setClientes(clientesValidos);
        const idsAS = new Set(clientesValidos.map(c => c.as_rede_id));
        setRedesAutosystem((redesAS || []).filter(r => idsAS.has(r.id)));
      } catch (e) { setErro(e.message); }
      finally { setLoadingMeta(false); }
    })();
  }, []);

  const contagensPorRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => {
      const key = c.as_rede_id;
      if (key) m.set(key, (m.get(key) || 0) + 1);
    });
    return m;
  }, [clientes]);

  const empresasDaRede = useMemo(() => {
    if (!redeSel || redeSel.tipo !== 'autosystem') return [];
    return clientes
      .filter(c => c.status !== 'inativo' && c.as_rede_id === redeSel.id)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [redeSel, clientes]);

  // Single-select: marca por padrão a empresa com o menor empresa_codigo
  useEffect(() => {
    if (empresasDaRede.length > 0) {
      const menor = [...empresasDaRede].sort((a, b) =>
        (Number(a.empresa_codigo) || 0) - (Number(b.empresa_codigo) || 0)
      )[0];
      setEmpresasSelIds(new Set([menor.id]));
    } else {
      setEmpresasSelIds(new Set());
    }
  }, [empresasDaRede]);

  const empresasSel = useMemo(
    () => empresasDaRede.filter(c => empresasSelIds.has(c.id)),
    [empresasDaRede, empresasSelIds],
  );
  const mapaEmpresas = useMemo(() => {
    const m = new Map();
    empresasDaRede.forEach(e => {
      const cod = Number(e.empresa_codigo);
      if (Number.isFinite(cod)) m.set(cod, e);
    });
    return m;
  }, [empresasDaRede]);

  // Carrega lista distinta de usuários sempre que os filtros (rede, período,
  // empresas) mudam. Roda ambos os modos em paralelo: pgd_username e usuario.
  useEffect(() => {
    if (redeSel?.tipo !== 'autosystem' || empresasSel.length === 0
        || !dataDe || !dataAte || dataDe > dataAte) {
      setUsuariosOptions([]);
      setUsuariosSelSet(new Set());
      setUsuariosOrigOptions([]);
      setUsuariosOrigSelSet(new Set());
      return;
    }
    let cancelado = false;
    setLoadingUsuarios(true);
    setLoadingUsuariosOrig(true);
    (async () => {
      try {
        const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
        const [logUsers, origUsers] = await Promise.all([
          autosystemService.buscarUsuariosMovtoFlowAutosystem(
            redeSel.id, codigos, { data_de: dataDe, data_ate: dataAte },
          ).catch(() => []),
          autosystemService.buscarUsuariosOriginaisMovtoFlowAutosystem(
            redeSel.id, codigos, { data_de: dataDe, data_ate: dataAte },
          ).catch(() => []),
        ]);
        if (!cancelado) {
          setUsuariosOptions(logUsers);
          setUsuariosOrigOptions(origUsers);
        }
      } finally {
        if (!cancelado) {
          setLoadingUsuarios(false);
          setLoadingUsuariosOrig(false);
        }
      }
    })();
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redeSel?.id, dataDe, dataAte, empresasSel]);

  async function carregar() {
    if (redeSel?.tipo !== 'autosystem') {
      setErro('Esta análise está disponível apenas para redes Autosystem.');
      return;
    }
    if (empresasSel.length === 0) { setErro('Selecione ao menos uma empresa.'); return; }
    if (!dataDe || !dataAte || dataDe > dataAte) { setErro('Período inválido.'); return; }
    setLoading(true);
    setErro(null);
    try {
      const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
      // Busca contas classificadas como sobra/falta de caixa pra excluir
      // do filtro principal — não queremos auditar mexidas em correções
      // de caixa, só em lançamentos reais.
      const contasCat = await autosystemService
        .listarContasCategorizadasRede(redeSel.id)
        .catch(() => []);
      const contasExcluidas = (contasCat || [])
        .filter(c => c.categoria === 'sobra_caixa' || c.categoria === 'falta_caixa')
        .map(c => String(c.codigo));

      const { schema, alteracoes } = await autosystemService.buscarMovtoFlowAutosystem(
        redeSel.id, codigos,
        { data_de: dataDe, data_ate: dataAte, contas_excluidas: contasExcluidas },
      );
      setSchema(schema || []);
      setAlteracoes(alteracoes || []);
    } catch (e) {
      setErro(e.message || 'Falha ao carregar alterações');
      setAlteracoes([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(key) {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function exportarPdf() {
    if (arvoreFiltrada.length === 0) return;
    const empresaSel = empresasSel[0];
    const empresaTxt = empresaSel ? (labelEmpresa(empresaSel) || `Empresa ${empresaSel.empresa_codigo}`) : '';
    const redeTxt = redeSel?.nome || '';
    const periodoTxt = dataDe === dataAte
      ? formatDataBR(dataDe)
      : `${formatDataBR(dataDe)} a ${formatDataBR(dataAte)}`;
    const doc = gerarPdfHistoricoUsuarios({
      arvore: arvoreFiltrada,
      camposRelevantes: CAMPOS_RELEVANTES,
      mapaEmpresas,
      labelEmpresa,
      contexto: {
        periodo: periodoTxt,
        rede: redeTxt,
        empresa: empresaTxt,
      },
    });
    const nomeArq = `historico-caixas-${dataDe}_a_${dataAte}.pdf`;
    doc.save(nomeArq);
  }

  // Filtra as linhas brutas pelos usuários selecionados (AND lógico entre os
  // dois filtros) ANTES de agrupar — KPIs, contagens e quebras refletem
  // automaticamente. `usuariosSelSet` filtra por pgd_username (log) e
  // `usuariosOrigSelSet` filtra pela coluna `usuario` (do lançamento).
  const alteracoesFiltradasPorUsuario = useMemo(() => {
    if (usuariosSelSet.size === 0 && usuariosOrigSelSet.size === 0) return alteracoes;
    return alteracoes.filter(a => {
      if (usuariosSelSet.size > 0) {
        const pg = a.pgd_username;
        if (pg == null || !usuariosSelSet.has(String(pg))) return false;
      }
      if (usuariosOrigSelSet.size > 0) {
        const orig = a.usuario;
        if (orig == null || !usuariosOrigSelSet.has(String(orig))) return false;
      }
      return true;
    });
  }, [alteracoes, usuariosSelSet, usuariosOrigSelSet]);

  // Árvore completa: para cada lançamento (mlid ?? parent), agrupa as linhas
  // brutas da movto_flow por pgd_when e classifica cada bucket em um EVENTO
  // LÓGICO (ALTERAÇÃO / AJUSTE / INCLUSÃO / EXCLUSÃO).
  const arvoreCompleta = useMemo(() => {
    const groups = new Map();
    alteracoesFiltradasPorUsuario.forEach(a => {
      const k = lancamentoKey(a);
      if (!groups.has(k)) {
        groups.set(k, {
          movtoKey: k,
          movto: lancamentoLabel(a),
          empresa: a.empresa,
          rows: [],
        });
      }
      groups.get(k).rows.push(a);
    });

    return Array.from(groups.values())
      .map(g => {
        // Bucket as rows por pgd_when (microssegundo)
        const buckets = new Map();
        for (const row of g.rows) {
          const t = timestampOf(row);
          if (!buckets.has(t)) buckets.set(t, []);
          buckets.get(t).push(row);
        }

        // Classifica cada bucket em um evento lógico
        const eventosLogicos = Array.from(buckets.entries())
          .map(([t, items]) => {
            const cls = classificarBucket(items);
            return {
              timestamp: t,
              ...cls,
              items,
              _changes: cls.antes && cls.depois ? calcularDiff(cls.antes, cls.depois) : [],
            };
          })
          .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

        // Snapshot atual = "depois" do último evento (ou "antes" se foi exclusão)
        const ultimo = eventosLogicos[eventosLogicos.length - 1];
        const snapshot = ultimo?.depois || ultimo?.antes || null;
        const excluido = ultimo?.tipo === 'EXCLUSAO';

        const usuarios = new Set();
        for (const row of g.rows) {
          const u = nomeUsuario(row);
          if (u) usuarios.add(u);
        }

        // Exibe do mais recente pro mais antigo
        const display = [...eventosLogicos].reverse();

        return {
          movtoKey: g.movtoKey,
          movto: g.movto,
          empresa: g.empresa,
          eventos: display,
          eventosCount: display.length,
          snapshot,
          excluido,
          usuarios: Array.from(usuarios),
          maisRecente: ultimo?.timestamp || '',
        };
      })
      .sort((a, b) => String(b.maisRecente).localeCompare(String(a.maisRecente)));
  }, [alteracoesFiltradasPorUsuario]);

  // Árvore hierárquica final pra UI: Usuário → Tipo → Lista de eventos.
  // Cada folha (evento) carrega referência pro lançamento pai pra exibir
  // contexto (data, documento, valor, contas) ao lado do diff.
  const arvoreHierarquica = useMemo(() => {
    const byUser = new Map();
    for (const node of arvoreCompleta) {
      for (const ev of node.eventos) {
        const sourceRow = ev.depois || ev.antes || {};
        // Destaque: campo `usuario` do lançamento. Secundário: `pgd_username`
        // (login técnico do log) só se for diferente.
        const usuarioDestaque = String(sourceRow.usuario ?? '').trim()
                              || String(sourceRow.usuario_nome ?? '').trim()
                              || String(sourceRow.pgd_username ?? '').trim();
        const pgdLogin = String(sourceRow.pgd_username ?? '').trim();
        const userKey = usuarioDestaque || pgdLogin || '__sem_usuario__';

        if (!byUser.has(userKey)) {
          byUser.set(userKey, {
            userKey,
            usuarioLogin: pgdLogin,
            usuarioNome: usuarioDestaque || '(sem usuário)',
            tipos: new Map(),
            total: 0,
            maisRecente: '',
          });
        }
        const userBucket = byUser.get(userKey);
        userBucket.total++;
        if (ev.timestamp > userBucket.maisRecente) userBucket.maisRecente = ev.timestamp;

        if (!userBucket.tipos.has(ev.tipo)) {
          userBucket.tipos.set(ev.tipo, []);
        }
        userBucket.tipos.get(ev.tipo).push({ ...ev, _node: node });
      }
    }

    return Array.from(byUser.values())
      .map(u => ({
        ...u,
        tipos: Array.from(u.tipos.entries())
          .map(([tipo, eventos]) => ({
            tipo,
            eventos: eventos.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))),
            count: eventos.length,
          }))
          .sort((a, b) => ORDEM_TIPOS.indexOf(a.tipo) - ORDEM_TIPOS.indexOf(b.tipo)),
      }))
      .sort((a, b) => String(b.maisRecente).localeCompare(String(a.maisRecente))
                       || a.usuarioNome.localeCompare(b.usuarioNome));
  }, [arvoreCompleta]);

  // Filtro de busca textual aplicado na árvore hierárquica.
  const arvoreFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return arvoreHierarquica;
    return arvoreHierarquica
      .map(u => {
        if (u.usuarioNome.toLowerCase().includes(q) || u.usuarioLogin.toLowerCase().includes(q)) {
          return u; // usuário casa → mantém tudo
        }
        const tiposFiltrados = u.tipos
          .map(t => {
            const eventosCasados = t.eventos.filter(ev => {
              const ctxNode = ev._node;
              const docu = String(ctxNode?.snapshot?.documento || '').toLowerCase();
              if (docu.includes(q)) return true;
              if (String(ctxNode?.movto || '').toLowerCase().includes(q)) return true;
              return (ev._changes || []).some(ch => String(ch.campo).toLowerCase().includes(q));
            });
            return eventosCasados.length > 0 ? { ...t, eventos: eventosCasados, count: eventosCasados.length } : null;
          })
          .filter(Boolean);
        return tiposFiltrados.length > 0 ? { ...u, tipos: tiposFiltrados } : null;
      })
      .filter(Boolean);
  }, [arvoreHierarquica, busca]);

  // KPIs — conta eventos LÓGICOS por tipo (não linhas brutas da movto_flow).
  const kpis = useMemo(() => {
    const usuarios = new Set();
    const lancamentos = new Set();
    const tipos = { INCLUSAO: 0, ALTERACAO: 0, AJUSTE: 0, EXCLUSAO: 0, INDETERMINADO: 0 };
    let total = 0;
    arvoreCompleta.forEach(node => {
      node.usuarios.forEach(u => usuarios.add(u));
      lancamentos.add(node.movtoKey);
      node.eventos.forEach(ev => {
        if (tipos[ev.tipo] != null) tipos[ev.tipo]++;
        total++;
      });
    });
    const tipoFreq = Object.entries(tipos)
      .reduce((acc, [k, v]) => v > acc.v ? { k, v } : acc, { k: null, v: 0 });
    return {
      total,
      usuarios: usuarios.size,
      movtos: lancamentos.size,
      tipoFreq: tipoFreq.k,
      tipos,
    };
  }, [arvoreCompleta]);

  return (
    <div>
      <PageHeader title="Alterações em caixas" description="Histórico de mudanças nos lançamentos via movto_flow" />

      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4 mb-4">
        {loadingMeta ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            Carregando redes...
          </div>
        ) : (
          <>
            <div className="mb-3">
              <SeletorRedeBPO
                chavesApi={[]}
                redesAutosystem={redesAutosystem}
                contagensPorRede={contagensPorRede}
                redeSel={redeSel}
                onChange={setRedeSel}
              />
            </div>
            {redeSel?.tipo === 'autosystem' && (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Data inicial</label>
                  <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)} max={dataAte}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Data final</label>
                  <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)} min={dataDe}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
                </div>
                <EmpresaSingleSelect
                  empresas={empresasDaRede}
                  selecionadoId={[...empresasSelIds][0] || null}
                  onSelecionar={(id) => setEmpresasSelIds(new Set([id]))}
                  labelEmpresa={labelEmpresa}
                />
                <UsuarioMultiSelect
                  label="Usuário (log)"
                  usuarios={usuariosOptions}
                  selecionados={usuariosSelSet}
                  loading={loadingUsuarios}
                  onToggle={(login) => setUsuariosSelSet(prev => {
                    const next = new Set(prev);
                    if (next.has(login)) next.delete(login); else next.add(login);
                    return next;
                  })}
                  onLimpar={() => setUsuariosSelSet(new Set())}
                />
                <UsuarioMultiSelect
                  label="Usuário original"
                  usuarios={usuariosOrigOptions}
                  selecionados={usuariosOrigSelSet}
                  loading={loadingUsuariosOrig}
                  onToggle={(login) => setUsuariosOrigSelSet(prev => {
                    const next = new Set(prev);
                    if (next.has(login)) next.delete(login); else next.add(login);
                    return next;
                  })}
                  onLimpar={() => setUsuariosOrigSelSet(new Set())}
                />
                <button onClick={carregar} disabled={loading || empresasSel.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 text-white px-4 py-2 text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Buscar
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex items-start gap-3 mb-4">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p>{erro}</p>
        </div>
      )}

      {redeSel?.tipo === 'autosystem' && !erro && !loading && alteracoes.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 mb-3">
            <History className="h-6 w-6 text-violet-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Selecione período e empresas e clique em "Buscar"</p>
          <p className="text-xs text-gray-500 mt-1">As alterações em lançamentos aparecerão aqui.</p>
        </div>
      )}

      {!loading && alteracoes.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Kpi icone={History}  cor="violet"  label="Alterações no período" valor={fmtNum(kpis.total)} />
            <Kpi icone={Users}    cor="blue"    label="Funcionários"          valor={fmtNum(kpis.usuarios)} />
            <Kpi icone={FileText} cor="amber"   label="Lançamentos afetados"  valor={fmtNum(kpis.movtos)} />
            <Kpi icone={AlertTriangle} cor="emerald" label="Mais frequente"
              valor={kpis.tipoFreq ? rotuloTipo(kpis.tipoFreq) : '—'}
              sub={kpis.tipoFreq ? `${fmtNum(kpis.tipos[kpis.tipoFreq] || 0)} ocorrências` : null} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-3 mb-4 flex items-center gap-4 flex-wrap">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Quebra por tipo:</span>
            <BadgeTipo tipo="INCLUSAO"  count={kpis.tipos.INCLUSAO} />
            <BadgeTipo tipo="ALTERACAO" count={kpis.tipos.ALTERACAO} />
            <BadgeTipo tipo="AJUSTE"    count={kpis.tipos.AJUSTE} />
            <BadgeTipo tipo="EXCLUSAO"  count={kpis.tipos.EXCLUSAO} />
            {kpis.tipos.INDETERMINADO > 0 && (
              <BadgeTipo tipo="INDETERMINADO" count={kpis.tipos.INDETERMINADO} />
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <History className="h-4 w-4 text-violet-500" />
              <h3 className="text-[13px] font-semibold text-gray-800">Histórico por usuário</h3>
              <span className="text-[11px] text-gray-400">
                · {fmtNum(arvoreFiltrada.length)} usuário{arvoreFiltrada.length === 1 ? '' : 's'} · {fmtNum(kpis.total)} evento{kpis.total === 1 ? '' : 's'}
              </span>
              <div className="flex-1" />
              <button onClick={exportarPdf}
                disabled={arvoreFiltrada.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-violet-200 text-violet-700 rounded-lg bg-white hover:bg-violet-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Download className="h-3.5 w-3.5" />
                Exportar PDF
              </button>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por funcionário, documento, campo..."
                  className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
              </div>
            </div>

            {arvoreFiltrada.length === 0 ? (
              <div className="p-8 text-center text-[12px] text-gray-400">
                Nenhum evento corresponde aos filtros.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {arvoreFiltrada.map(u => (
                  <NodeUsuario
                    key={u.userKey}
                    userNode={u}
                    expandidos={expandidos}
                    onToggle={toggleExpand}
                    mapaEmpresas={mapaEmpresas}
                    labelEmpresa={labelEmpresa}
                  />
                ))}
              </div>
            )}
          </div>

        </>
      )}

      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
          Buscando alterações...
        </div>
      )}
    </div>
  );
}

// ─── Componentes ─────────────────────────────────────────────
function Kpi({ icone: Icone, cor, label, valor, sub }) {
  const palette = {
    violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600'  },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600'    },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600'   },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  };
  const Pal = palette[cor] || palette.violet;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${Pal.bg} p-2.5 flex-shrink-0`}>
          <Icone className={`h-5 w-5 ${Pal.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className="text-lg font-semibold tracking-tight truncate text-gray-900">{valor}</p>
          {sub && <p className="text-[10.5px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function BadgeTipo({ tipo, count }) {
  const c = COR_TIPO[tipo];
  if (!c) return null;
  const Icone = c.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${c.bg} ${c.text} ring-1 ${c.ring} text-[11px] font-semibold`}>
      <Icone className={`h-3 w-3 ${c.icon}`} />
      {rotuloTipo(tipo)}
      <span className="font-mono tabular-nums opacity-80 ml-0.5">{fmtNum(count)}</span>
    </span>
  );
}

// Nó raiz da árvore: USUÁRIO. Expande para mostrar tipos de operação.
function NodeUsuario({ userNode, expandidos, onToggle, mapaEmpresas, labelEmpresa }) {
  const key = `u:${userNode.userKey}`;
  const aberto = expandidos.has(key);
  return (
    <div>
      <button type="button" onClick={() => onToggle(key)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-violet-50/40 transition-colors ${aberto ? 'bg-violet-50/40' : ''}`}>
        <div className="pt-0.5">
          {aberto
            ? <ChevronDown className="h-4 w-4 text-violet-600" />
            : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </div>
        <div className="rounded-lg bg-violet-50 p-2 flex-shrink-0">
          <Users className="h-4 w-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-semibold text-gray-900 truncate" title={userNode.usuarioNome}>
            {userNode.usuarioNome}
          </p>
          {userNode.usuarioLogin && userNode.usuarioLogin !== userNode.usuarioNome && (
            <p className="text-[11px] text-gray-500 font-mono">{userNode.usuarioLogin}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {userNode.tipos.map(t => (
            <BadgeTipo key={t.tipo} tipo={t.tipo} count={t.count} />
          ))}
        </div>
      </button>

      {aberto && (
        <div className="bg-gray-50/40 border-t border-gray-100">
          {userNode.tipos.map(tipoNode => (
            <NodeTipo
              key={tipoNode.tipo}
              userKey={userNode.userKey}
              tipoNode={tipoNode}
              expandidos={expandidos}
              onToggle={onToggle}
              mapaEmpresas={mapaEmpresas}
              labelEmpresa={labelEmpresa}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Nó intermediário: TIPO de operação dentro de um usuário.
function NodeTipo({ userKey, tipoNode, expandidos, onToggle, mapaEmpresas, labelEmpresa }) {
  const key = `u:${userKey}:t:${tipoNode.tipo}`;
  const aberto = expandidos.has(key);
  const cor = COR_TIPO[tipoNode.tipo];
  const Icone = cor?.Icon;
  return (
    <div className="border-b last:border-b-0 border-gray-100">
      <button type="button" onClick={() => onToggle(key)}
        className={`w-full flex items-center gap-3 px-6 py-2.5 text-left hover:bg-white transition-colors ${aberto ? 'bg-white' : ''}`}>
        <div>
          {aberto
            ? <ChevronDown className="h-3.5 w-3.5 text-violet-600" />
            : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
        </div>
        {cor && (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${cor.bg} ${cor.text} ring-1 ${cor.ring} text-[11px] font-semibold`}>
            {Icone && <Icone className={`h-3 w-3 ${cor.icon}`} />}
            {rotuloTipo(tipoNode.tipo)}
          </span>
        )}
        <span className="text-[11.5px] text-gray-600">
          {fmtNum(tipoNode.count)} {tipoNode.count === 1 ? 'evento' : 'eventos'}
        </span>
      </button>

      {aberto && (
        <div className="bg-white border-t border-gray-100 divide-y divide-gray-100">
          {tipoNode.eventos.map((ev, i) => (
            <EventoCard
              key={i}
              ev={ev}
              mapaEmpresas={mapaEmpresas}
              labelEmpresa={labelEmpresa}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Folha: um evento lógico individual com contexto do lançamento + diff.
function EventoCard({ ev, mapaEmpresas, labelEmpresa }) {
  const node = ev._node;
  const empresaObj = mapaEmpresas.get(Number(node?.empresa));
  const empresaNome = empresaObj ? labelEmpresa(empresaObj) : (node?.empresa != null ? `Empresa ${node.empresa}` : '');

  const sourceRow   = ev.depois || ev.antes || {};
  const dataLanc    = sourceRow.data;
  const documento   = sourceRow.documento;
  const valor       = Number(sourceRow.valor) || 0;

  return (
    <div className="px-8 py-3 hover:bg-violet-50/20 transition-colors">
      {/* Cabeçalho com contexto do lançamento + horário do evento */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-[11.5px] font-mono tabular-nums text-gray-700">
          {formatTimestamp(ev.timestamp)}
        </span>
        <span className="text-gray-300">·</span>
        {dataLanc && (
          <span className="text-[12px] font-semibold tabular-nums text-gray-800">
            {formatDataBR(dataLanc)}
          </span>
        )}
        {documento && (
          <span className="text-[11.5px] text-gray-700">
            Doc <strong className="font-mono">{documento}</strong>
          </span>
        )}
        {valor !== 0 && (
          <span className="text-[11.5px] text-gray-700">
            <strong className="font-mono tabular-nums">{formatCurrency(valor)}</strong>
          </span>
        )}
        {empresaNome && (
          <span className="text-[10.5px] text-gray-400 truncate" title={empresaNome}>
            · {empresaNome}
          </span>
        )}
      </div>
      {/* Detalhamento conforme o tipo */}
      {ev.tipo === 'INCLUSAO' ? (
        <SnapshotEstado ev={ev.depois} titulo="Lançamento criado · estado inicial" cor="emerald" />
      ) : ev.tipo === 'EXCLUSAO' ? (
        <SnapshotEstado ev={ev.antes} titulo="Lançamento excluído · estado preservado" cor="rose" />
      ) : (ev.tipo === 'ALTERACAO' || ev.tipo === 'AJUSTE') && ev.antes && ev.depois ? (
        <TabelaDiffPar antes={ev.antes} depois={ev.depois} />
      ) : (
        <SnapshotEstado ev={ev.depois || ev.antes}
          titulo="Evento indeterminado · companheiro fora do filtro"
          cor="amber" />
      )}
    </div>
  );
}

// Verifica se um campo é considerado vazio (null, undefined ou string vazia)
function vazio(v) {
  return v == null || String(v).trim() === '';
}
// Equivalência tolerante a tipos (date timestamps com partes diferentes).
function equivalente(a, b, type) {
  if (type === 'date') {
    return formatDataBR(a) === formatDataBR(b);
  }
  if (type === 'currency') {
    return (Number(a) || 0) === (Number(b) || 0);
  }
  return normalizar(a) === normalizar(b);
}

// Tabela Antes/Depois com TODOS os campos relevantes (mesmo os não alterados).
// Linhas com mudança recebem fundo amarelo, como na tela de histórico do Autosystem.
function TabelaDiffPar({ antes, depois }) {
  const linhas = CAMPOS_RELEVANTES.filter(c => !(vazio(antes?.[c.key]) && vazio(depois?.[c.key])));
  if (linhas.length === 0) {
    return <p className="text-[11.5px] text-gray-400 italic">Nenhum campo de negócio com valor.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-gray-200 bg-white">
      <div className="grid grid-cols-[180px_1fr_1fr] gap-x-3 px-3 py-1.5 bg-gray-100/70 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
        <span>Campo</span>
        <span>Antes</span>
        <span>Depois</span>
      </div>
      <div className="divide-y divide-gray-100">
        {linhas.map(c => {
          const a = antes?.[c.key];
          const d = depois?.[c.key];
          const mudou = !equivalente(a, d, c.type);
          return (
            <div key={c.key}
              className={`grid grid-cols-[180px_1fr_1fr] gap-x-3 items-baseline px-3 py-2 ${mudou ? 'bg-yellow-100/70' : ''}`}>
              <span className={`text-[12px] ${mudou ? 'text-gray-900 font-semibold' : 'text-gray-600 font-medium'}`}>
                {c.label}
              </span>
              <span className={`text-[12px] break-all ${mudou ? 'text-gray-800' : 'text-gray-700'}`}>
                <ValorFormatado v={a} field={c} obj={antes} />
              </span>
              <span className={`text-[12px] break-all ${mudou ? 'text-gray-900 font-semibold' : 'text-gray-700'}`}>
                <ValorFormatado v={d} field={c} obj={depois} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Snapshot de um único estado — usado em I (inclusão) e em Un órfão (sem prev).
function SnapshotEstado({ ev, titulo, cor = 'emerald' }) {
  const linhas = CAMPOS_RELEVANTES.filter(c => !vazio(ev[c.key]));
  const palette = cor === 'amber'
    ? { ring: 'ring-amber-200',   head: 'bg-amber-50 text-amber-700 border-amber-200', body: 'bg-amber-50/30' }
    : cor === 'rose'
    ? { ring: 'ring-rose-200',    head: 'bg-rose-50 text-rose-700 border-rose-200',    body: 'bg-rose-50/30' }
    : { ring: 'ring-emerald-200', head: 'bg-emerald-50 text-emerald-700 border-emerald-200', body: 'bg-emerald-50/20' };
  return (
    <div className={`overflow-hidden rounded-lg ring-1 ${palette.ring} ${palette.body}`}>
      <div className={`px-3 py-1.5 border-b ${palette.head} text-[10px] font-semibold uppercase tracking-wider`}>
        {titulo}
      </div>
      {linhas.length === 0 ? (
        <p className="text-[11.5px] text-gray-400 italic px-3 py-2">Sem campos preenchidos.</p>
      ) : (
        <div className="divide-y divide-gray-100/70">
          {linhas.map(c => (
            <div key={c.key}
              className="grid grid-cols-[180px_1fr] gap-x-3 items-baseline px-3 py-1.5">
              <span className="text-[12px] text-gray-600 font-medium">{c.label}</span>
              <span className="text-[12px] text-gray-800 break-all">
                <ValorFormatado v={ev[c.key]} field={c} obj={ev} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Seleção única de empresa — single-select dropdown.
function EmpresaSingleSelect({ empresas, selecionadoId, onSelecionar, labelEmpresa }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  if (empresas.length === 0) return null;
  const selecionada = empresas.find(c => c.id === selecionadoId);
  const label = selecionada ? labelEmpresa(selecionada) : 'Selecionar empresa';
  return (
    <div ref={ref} className="relative">
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
        <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Empresa</span>
      </label>
      <button type="button" onClick={() => setAberto(o => !o)}
        className={`h-9 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-xs transition-colors min-w-[200px] max-w-[280px] ${
          aberto ? 'border-violet-400 ring-2 ring-violet-100 text-gray-800 bg-white' : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300'
        }`}>
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              {empresas.map(emp => {
                const marcada = emp.id === selecionadoId;
                return (
                  <button type="button" key={emp.id}
                    onClick={() => { onSelecionar(emp.id); setAberto(false); }}
                    className={`w-full flex items-start gap-2 px-3 py-2 transition-colors text-left ${
                      marcada ? 'bg-violet-50' : 'hover:bg-gray-50'
                    }`}>
                    <input type="radio" checked={marcada} onChange={() => {}}
                      className="h-4 w-4 text-violet-600 focus:ring-violet-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12.5px] truncate ${marcada ? 'text-violet-900 font-medium' : 'text-gray-800'}`}>
                        {labelEmpresa(emp)}
                      </p>
                      <div className="flex items-baseline gap-2">
                        {emp.empresa_codigo != null && (
                          <p className="text-[10px] text-gray-500 font-mono">cód {emp.empresa_codigo}</p>
                        )}
                        {emp.cnpj && <p className="text-[10px] text-gray-400 font-mono truncate">{emp.cnpj}</p>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Multi-select de usuários. Lista vem do backend via mode='usuarios' ou
// mode='usuarios_originais'. `label` customiza o cabeçalho.
function UsuarioMultiSelect({ usuarios, selecionados, loading, onToggle, onLimpar, label: labelText = 'Usuário' }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const totalSel = selecionados.size;
  const label = loading
    ? 'Carregando...'
    : usuarios.length === 0
    ? 'Nenhum'
    : totalSel === 0
    ? `Todos (${usuarios.length})`
    : totalSel === 1
    ? (() => {
        const u = usuarios.find(x => selecionados.has(String(x.usuario)));
        return u?.usuario_nome || u?.usuario || '1 selecionado';
      })()
    : `${totalSel} usuários`;

  return (
    <div ref={ref} className="relative">
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {labelText}</span>
      </label>
      <button type="button" onClick={() => setAberto(o => !o)}
        disabled={loading || usuarios.length === 0}
        className={`h-9 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-xs transition-colors min-w-[200px] max-w-[280px] disabled:opacity-50 disabled:cursor-not-allowed ${
          aberto ? 'border-violet-400 ring-2 ring-violet-100 text-gray-800 bg-white' : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300'
        }`}>
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
            {totalSel > 0 && (
              <button type="button" onClick={onLimpar}
                className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
                <span className="text-[12.5px] font-medium text-gray-700">Limpar seleção</span>
              </button>
            )}
            <div className="max-h-72 overflow-y-auto">
              {usuarios.map(u => {
                const login = String(u.usuario || '');
                const marcado = selecionados.has(login);
                return (
                  <label key={login}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={marcado}
                      onChange={() => onToggle(login)}
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-gray-800 truncate" title={u.usuario_nome || login}>
                        {u.usuario_nome || login}
                      </p>
                      {u.usuario_nome && u.usuario_nome !== login && (
                        <p className="text-[10px] text-gray-400 font-mono truncate">{login}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
