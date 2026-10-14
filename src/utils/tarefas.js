// Regras e rótulos das Tarefas (espelham o banco — migration 192).

export const STATUS_TAREFA = {
  a_fazer:              { rotulo: 'A fazer',              cls: 'bg-slate-100 text-slate-700' },
  em_andamento:         { rotulo: 'Em andamento',         cls: 'bg-blue-50 text-blue-700' },
  aguardando_validacao: { rotulo: 'Aguardando validação', cls: 'bg-violet-50 text-violet-700' },
  concluida:            { rotulo: 'Concluída',            cls: 'bg-emerald-50 text-emerald-700' },
  cancelada:            { rotulo: 'Cancelada',            cls: 'bg-gray-100 text-gray-500' },
  atrasada:             { rotulo: 'Atrasada',             cls: 'bg-rose-50 text-rose-700' },
};

export const PRIORIDADES = {
  baixa:   { rotulo: 'Baixa',   cls: 'text-slate-500', peso: 1 },
  media:   { rotulo: 'Média',   cls: 'text-amber-600', peso: 2 },
  alta:    { rotulo: 'Alta',    cls: 'text-orange-600', peso: 3 },
  critica: { rotulo: 'Crítica', cls: 'text-rose-600', peso: 4 },
};

export const FREQUENCIAS = {
  diaria:      'Todos os dias',
  dias_uteis:  'Dias úteis (seg a sex)',
  dias_semana: 'Dias da semana',
  dias_mes:    'Dias do mês',
  dias_ano:    'Datas no ano',
};
// Personalizada = dias_semana | dias_mes | dias_ano (o "modo" é a própria frequência).
export const MODOS_PERSONALIZADA = [
  { k: 'dias_semana', rot: 'Dias da semana' }, { k: 'dias_mes', rot: 'Dias do mês' }, { k: 'dias_ano', rot: 'Datas no ano' },
];
export const ehPersonalizada = (f) => MODOS_PERSONALIZADA.some(m => m.k === f);

// Referência: a tarefa feita hoje pode ser "referente a" outro período (migration 196).
export const REFERENCIAS = [
  { k: 'mesmo_dia', rot: 'O próprio dia', ajuda: 'A tarefa se refere ao dia em que é feita.' },
  { k: 'dia_anterior', rot: 'Dia anterior', ajuda: 'Ex.: conciliação de caixas feita hoje é de ontem.' },
  { k: 'dia_util_anterior', rot: 'Dia útil anterior', ajuda: 'Ex.: conciliação de extratos — na segunda, refere-se à sexta.' },
  { k: 'mes_anterior', rot: 'Mês anterior', ajuda: 'Ex.: fechamento mensal feito em outubro é de setembro.' },
];
const SEM_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// "sex 02/10" (dia) ou "set/2026" (mês); null quando a tarefa não tem referência.
export function rotuloReferencia(t) {
  if (!t?.referencia_tipo || !t?.referencia_data) return null;
  const [y, m, d] = t.referencia_data.split('-').map(Number);
  if (t.referencia_tipo === 'mes') return `${MES_ABREV[m - 1]}/${y}`;
  return `${SEM_ABREV[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
export const DIAS_SEMANA = [
  { v: 1, rot: 'Seg' }, { v: 2, rot: 'Ter' }, { v: 3, rot: 'Qua' }, { v: 4, rot: 'Qui' },
  { v: 5, rot: 'Sex' }, { v: 6, rot: 'Sáb' }, { v: 7, rot: 'Dom' },
];

export const ABERTAS = ['a_fazer', 'em_andamento'];

// Atrasada = aberta (não enviada) e venceu.
export function estaAtrasada(t, agora = new Date()) {
  return ABERTAS.includes(t.status) && new Date(t.vence_em) < agora;
}
export function statusEfetivo(t) {
  return estaAtrasada(t) ? 'atrasada' : t.status;
}
export function venceHoje(t, agora = new Date()) {
  const v = new Date(t.vence_em);
  return ABERTAS.includes(t.status) && v.toDateString() === agora.toDateString() && v >= agora;
}
// Enviada (para validação) dentro do prazo?
export function noPrazo(t) {
  return !!t.enviada_em && new Date(t.enviada_em) <= new Date(t.vence_em);
}

// Por que não dá para enviar para validação (mesma regra do gatilho do banco).
export function bloqueioEnvio(t, checklist = [], evidencias = []) {
  const pend = checklist.filter(i => !i.feito).length;
  if (pend > 0) return `Conclua o checklist (${pend} pendente${pend > 1 ? 's' : ''}).`;
  if (t.exige_evidencia) {
    const anexos = evidencias.filter(e => e.tipo !== 'comentario');
    const docs = t.documentos || [];
    if (docs.length) {
      const falta = docs.filter(d => !anexos.some(e => e.documento === d));
      if (falta.length) return `Falta anexar: ${falta.join(', ')}.`;
    } else if (anexos.length === 0) {
      return 'Anexe ao menos uma foto ou documento como evidência.';
    }
  }
  return null;
}

// Execução % = enviadas no prazo ÷ (concluídas/enviadas + atrasadas).
// Pendentes ainda no prazo não contam contra.
export function indicadores(tarefas, agora = new Date()) {
  let concluidas = 0, noPrazoQtd = 0, aguardando = 0, atrasadas = 0, pendentes = 0;
  tarefas.forEach(t => {
    if (t.status === 'cancelada') return;
    if (t.status === 'concluida' || t.status === 'aguardando_validacao') {
      if (t.status === 'concluida') concluidas++; else aguardando++;
      if (noPrazo(t)) noPrazoQtd++;
    } else if (estaAtrasada(t, agora)) atrasadas++;
    else pendentes++;
  });
  const base = concluidas + aguardando + atrasadas;
  return {
    concluidas, aguardando, atrasadas, pendentes, noPrazo: noPrazoQtd,
    execucao: base > 0 ? Math.round((noPrazoQtd / base) * 100) : null,
  };
}
export const corExecucao = (p) => (p == null ? 'text-gray-400' : p >= 90 ? 'text-emerald-600' : p >= 75 ? 'text-amber-600' : 'text-rose-600');

export function descreverRecorrencia(r) {
  if (r.frequencia === 'diaria') return 'Todos os dias';
  if (r.frequencia === 'dias_uteis') return 'Dias úteis (seg–sex)';
  if (r.frequencia === 'dias_semana') {
    const dias = DIAS_SEMANA.filter(d => (r.dias_semana || []).includes(d.v)).map(d => d.rot);
    return dias.length ? `Toda ${dias.join(', ')}` : 'Personalizada (sem dias)';
  }
  if (r.frequencia === 'dias_mes') {
    const dias = [...(r.dias_mes || [])].sort((a, b) => a - b);
    return dias.length ? `Dia${dias.length > 1 ? 's' : ''} ${dias.join(', ')} de cada mês` : 'Personalizada (sem dias)';
  }
  if (r.frequencia === 'dias_ano') {
    const datas = [...(r.dias_ano || [])].sort().map(x => `${x.slice(3)}/${x.slice(0, 2)}`);
    return datas.length ? `Anual: ${datas.join(', ')}` : 'Personalizada (sem datas)';
  }
  return FREQUENCIAS[r.frequencia] || r.frequencia;
}

export const fmtDataHora = (iso) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—');
export const hojeYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const somarDiasYmd = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// A recorrência cai nesta data? (mesma regra do banco: cci_rotina_no_dia)
// Dias 29–31 (e datas no ano) acima do último dia do mês caem no último dia.
export function recorrenciaNoDia(r, data) {
  const isodow = data.getDay() === 0 ? 7 : data.getDay();
  const dia = data.getDate();
  const ultimo = new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate();
  if (r.frequencia === 'diaria') return true;
  if (r.frequencia === 'dias_uteis') return isodow <= 5;
  if (r.frequencia === 'dias_semana') return (r.dias_semana || []).includes(isodow);
  if (r.frequencia === 'dias_mes') return (r.dias_mes || []).some(md => Math.min(md, ultimo) === dia);
  if (r.frequencia === 'dias_ano') {
    return (r.dias_ano || []).some(x => {
      const [m, dd] = x.split('-').map(Number);
      return m === data.getMonth() + 1 && Math.min(dd, ultimo) === dia;
    });
  }
  return false;
}
// A rotina gera tarefa neste dia? (ativa, com responsável e já iniciada)
export function rotinaNoDia(r, data) {
  if (!r.ativa || !r.responsavel_id) return false;
  const ymd = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  if (r.data_inicio && ymd < r.data_inicio) return false;
  return recorrenciaNoDia(r, data);
}
// Próxima execução (vencimento) a partir de agora; null = não gera.
export function proximaExecucao(r, de = new Date()) {
  if (!r.ativa || !r.responsavel_id) return null;
  const [hh, mm] = String(r.horario || '18:00').split(':').map(Number);
  for (let i = 0; i < 400; i++) {
    const d = new Date(de.getFullYear(), de.getMonth(), de.getDate() + i);
    const quando = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
    if (rotinaNoDia(r, d) && quando > de) return quando;
  }
  return null;
}
export const fmtDiaMes = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
