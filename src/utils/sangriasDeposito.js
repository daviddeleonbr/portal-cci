// Sangrias — regras das retiradas antes do depósito e da tarefa de depósito
// (espelham a migration 198). Usadas pelas telas Webposto e Autosystem.

export const PERMISSAO_TAREFA_DEPOSITO = 'sangrias_tarefa_deposito';
export const novaRetirada = () => ({ chave: crypto.randomUUID(), descricao: '', valor: '', arquivo: null });

// Sem dinheiro contado não há retiradas nem depósito.
export const semValorContado = (totalApresentado) => !(Number(totalApresentado) > 0);

export function resumoRetiradas(retiradas, totalApresentado) {
  if (semValorContado(totalApresentado)) return { total: 0, deposito: 0 };
  const total = retiradas.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  return { total, deposito: Number((Number(totalApresentado || 0) - total).toFixed(2)) };
}

// Mensagem do que falta nas retiradas (null = ok).
export function erroRetiradas(retiradas, totalApresentado) {
  if (semValorContado(totalApresentado)) return null; // retiradas são ignoradas
  for (const [i, r] of retiradas.entries()) {
    if (!r.descricao.trim()) return `Retirada ${i + 1}: informe a descrição.`;
    if (!(Number(r.valor) > 0)) return `Retirada ${i + 1}: informe o valor.`;
    if (!r.arquivo) return `Retirada ${i + 1}: anexe o arquivo ou a foto.`;
  }
  if (resumoRetiradas(retiradas, totalApresentado).deposito < 0) return 'As retiradas passam do total apresentado.';
  return null;
}

// Prazo da tarefa: próximo dia útil às 12:00 (mesma regra do banco).
export function proximoDiaUtilTexto() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} às 12:00`;
}
