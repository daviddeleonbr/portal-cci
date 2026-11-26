// Sangrias — regras das retiradas antes do depósito e da tarefa de depósito
// (espelham a migration 198). Usadas pelas telas Webposto e Autosystem.

export const PERMISSAO_TAREFA_DEPOSITO = 'sangrias_tarefa_deposito';
export const novaRetirada = () => ({ chave: crypto.randomUUID(), descricao: '', valor: '', arquivo: null, func: '' });

// De qual funcionário saiu a retirada: opções a partir das linhas da contagem.
// value = 'codigo|caixa'; `funcionario` é o que vai gravado na retirada (o relatório
// geral põe a retirada embaixo do funcionário e desconta do apresentado dele).
export function opcoesFuncionarioRetirada(registros = []) {
  const vistos = new Set();
  return registros.filter(r => r.funcionarioCodigo != null || r.nome).map(r => ({
    value: `${r.funcionarioCodigo ?? ''}|${r.caixaCodigo ?? ''}`,
    label: r.turno ? `${r.nome} — ${r.turno}` : (r.nome || 'Funcionário'),
    funcionario: { funcionario_codigo: r.funcionarioCodigo ?? null, caixa_codigo: r.caixaCodigo ?? null, funcionario_nome: r.nome || null, turno: r.turno || null },
  })).filter(o => (vistos.has(o.value) ? false : (vistos.add(o.value), true)));
}

// Com um funcionário só, a retirada é dele; senão vale o escolhido.
export function retiradasComFuncionario(retiradas, opcoes) {
  return retiradas.map(r => {
    const o = opcoes.find(x => x.value === r.func) || (opcoes.length === 1 ? opcoes[0] : null);
    return o ? { ...r, funcionario: o.funcionario } : r;
  });
}

// Sem dinheiro contado não há retiradas nem depósito.
export const semValorContado = (totalApresentado) => !(Number(totalApresentado) > 0);

export function resumoRetiradas(retiradas, totalApresentado) {
  if (semValorContado(totalApresentado)) return { total: 0, deposito: 0 };
  const total = retiradas.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  return { total, deposito: Number((Number(totalApresentado || 0) - total).toFixed(2)) };
}

// Mensagem do que falta nas retiradas (null = ok).
export function erroRetiradas(retiradas, totalApresentado, qtdFuncionarios = 0) {
  if (semValorContado(totalApresentado)) return null; // retiradas são ignoradas
  for (const [i, r] of retiradas.entries()) {
    if (!r.descricao.trim()) return `Retirada ${i + 1}: informe a descrição.`;
    if (!(Number(r.valor) > 0)) return `Retirada ${i + 1}: informe o valor.`;
    if (qtdFuncionarios > 1 && !r.func) return `Retirada ${i + 1}: informe de qual funcionário saiu o dinheiro.`;
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
