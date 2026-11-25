// Alterações em caixas — redes AUTOSYSTEM (log movto_flow). Regras puras, usadas
// pela aba "Alterações em caixas" e pelo Relatório geral.

export function formatDataBR(iso) {
  if (iso == null || iso === '') return '—';
  const s = String(iso);
  // Aceita ISO ("2026-05-12...") ou já formatado
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // Fallback: se já vem em DD/MM/YYYY, retorna como veio
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
  return s;
}
export function formatTimestamp(whenStr) {
  // Aceita formatos tipo "2026-02-15 14:30:25" ou "2026-02-15T14:30:25"
  if (!whenStr) return '—';
  const s = String(whenStr);
  const dateMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = s.match(/(\d{2}):(\d{2})/);
  if (!dateMatch) return s;
  const br = `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`;
  return timeMatch ? `${br} ${timeMatch[1]}:${timeMatch[2]}` : br;
}
export function timestampOf(ev) {
  // _when é a string ISO do pgd_when — fonte canônica de ordenação cronológica.
  return String(ev._when || '');
}
// Chave estável do lançamento: backend já consolida via coalesce(mlid, parent)
// no alias _lancamento. Fallback local prioriza mlid (mais estável) → parent.
export function lancamentoKey(ev) {
  const cand = ev._lancamento ?? ev.mlid ?? ev.parent ?? ev.movto;
  return cand != null && String(cand).trim() !== '' ? String(cand) : 'sem';
}
export function lancamentoLabel(ev) {
  return ev._lancamento ?? ev.mlid ?? ev.parent ?? ev.movto;
}
export function normalizar(v) {
  if (v == null) return '';
  return String(v).trim();
}

// Metadados de evento — ignorados no diff porque mudam toda linha sem
// representar uma alteração de negócio. Inclui colunas-padrão do Autosystem
// (pgd_*) e nossos aliases canônicos.
export const CAMPOS_META = new Set([
  // Metadados do log
  'pgd_gfid', 'pgd_optype', 'pgd_when', 'pgd_when_ts', 'pgd_rfid', 'pgd_host',
  'pgd_username', 'pgd_module', 'estacao', 'optype', 'usuario_nome',
  'usuario_original_nome', 'responsavel_nome',
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

// Quando o campo for conta_debitar/conta_creditar, anexa o nome correspondente
// das versões antes/depois (vem do JOIN com conta na edge function).
export const SUFIXO_NOME = {
  conta_debitar:  'conta_debitar_nome',
  conta_creditar: 'conta_creditar_nome',
};
export function calcularDiff(antes, depois) {
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
export function detectarTipoOperacao(linha) {
  const v = linha.pgd_optype ?? linha.optype ?? linha.operacao ?? linha.tipo ?? linha.acao ?? linha.evento;
  if (v == null) return null;
  const s = String(v).toUpperCase().trim();
  if (!s) return null;
  const c = s.charAt(0);
  if (c === 'I' || c === 'U' || c === 'D') return c;
  return null;
}

// Variante de update: Un = estado depois da edição, Uo = estado antes.
export function detectarVarianteUpdate(linha) {
  const v = linha.pgd_optype ?? linha.optype;
  if (v == null) return null;
  const s = String(v).toUpperCase().trim();
  if (s === 'UN') return 'Un';
  if (s === 'UO') return 'Uo';
  return null;
}

export function nomeUsuario(ev) {
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
export function classificarBucket(items) {
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

export function rotuloTipo(t) {
  if (t === 'INCLUSAO')      return 'Inclusão';
  if (t === 'ALTERACAO')     return 'Alteração';
  if (t === 'AJUSTE')        return 'Ajuste';
  if (t === 'EXCLUSAO')      return 'Exclusão';
  if (t === 'INDETERMINADO') return 'Indeterminado';
  return t || '—';
}
export const ORDEM_TIPOS = ['INCLUSAO', 'ALTERACAO', 'AJUSTE', 'EXCLUSAO', 'INDETERMINADO'];

// Campos do snapshot a destacar no header e no painel de inclusão.
// A ordem aqui determina a ordem de exibição.
// Campos relevantes do lançamento exibidos no diff/snapshot. Ordem espelha
// o histórico do Autosystem (Visualizar Histórico → vista simplificada).
// "Forma de Pagamento" no Autosystem mapeia pra `motivo_nome` (entidade
// motivo), não pro `conta_debitar` — esse é só o código contábil derivado.
export const CAMPOS_RELEVANTES = [
  { key: 'data',              label: 'Data',                type: 'date' },
  { key: 'vencto',            label: 'Vencto',              type: 'date' },
  { key: 'motivo',            label: 'Motivo',              type: 'motivo', nomeKey: 'motivo_movto_nome' },
  { key: 'motivo_nome',       label: 'Forma de Pagamento', type: 'text' },
  { key: 'pessoa_nome',       label: 'Pessoa',              type: 'text' },
  { key: 'documento',         label: 'Documento',           type: 'text' },
  { key: 'obs',               label: 'Observação',          type: 'text' },
  { key: 'valor',             label: 'Valor',               type: 'currency' },
];

export function vazio(v) {
  return v == null || String(v).trim() === '';
}
// Equivalência tolerante a tipos (date timestamps com partes diferentes).
export function equivalente(a, b, type) {
  if (type === 'date') {
    return formatDataBR(a) === formatDataBR(b);
  }
  if (type === 'currency') {
    return (Number(a) || 0) === (Number(b) || 0);
  }
  return normalizar(a) === normalizar(b);
}

// Algum dos 8 campos de CAMPOS_RELEVANTES mudou de fato entre antes/depois?
// Usado pra esconder ajustes "técnicos" do AS (Uo+Un que só carimba colunas
// internas como pessoa_id, conferido, info_adic — tudo em CAMPOS_META).
export function mudouAlgoRelevante(antes, depois) {
  if (!antes || !depois) return true;
  return CAMPOS_RELEVANTES.some(c => !equivalente(antes[c.key], depois[c.key], c.type));
}

// Para cada lançamento (mlid ?? parent), agrupa as linhas brutas da movto_flow por
// pgd_when e classifica cada grupo em um EVENTO LÓGICO (alteração / ajuste /
// inclusão / exclusão). Ajustes técnicos, sem campo de negócio mudado, saem.
export function montarLancamentosAlterados(linhas) {
  const groups = new Map();
  linhas.forEach(a => {
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

      // Classifica cada bucket em um evento lógico.
      // Filtra AJUSTE/ALTERACAO que não mexeram em nenhum dos 8 campos de
      // negócio (CAMPOS_RELEVANTES). São carimbos automáticos do Autosystem
      // (Uo+Un em colunas técnicas tipo pessoa_id/info_adic/conferido) que
      // poluem o log sem representar uma alteração de fato.
      // INCLUSAO/EXCLUSAO/INDETERMINADO continuam visíveis.
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
        .filter(ev => {
          if (ev.tipo === 'AJUSTE' || ev.tipo === 'ALTERACAO') {
            return mudouAlgoRelevante(ev.antes, ev.depois);
          }
          return true;
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
    .filter(g => g.eventos.length > 0)
    .sort((a, b) => String(b.maisRecente).localeCompare(String(a.maisRecente)));
}
