// Cálculos do faturamento a partir das NFS-e (notas_fiscais_asaas).
// Faturamento = notas AUTORIZADAS, pelo mês da emissão. Canceladas e com erro ficam
// de fora (o Asaas guarda as tentativas que falharam e as notas reemitidas).

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
export const AUTORIZADA = 'AUTHORIZED';
const PENDENTES = new Set(['PENDING', 'SCHEDULED', 'SYNCHRONIZED', 'PROCESSING']);

export const mesDe = (data) => String(data || '').slice(0, 7); // YYYY-MM
export function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export const rotuloMes = (mes, comAno = true) => {
  const [a, m] = mes.split('-');
  return comAno ? `${MESES[Number(m) - 1]}/${a.slice(2)}` : MESES[Number(m) - 1];
};
export const nomeMes = (mes) => {
  const [a, m] = mes.split('-');
  const n = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][Number(m) - 1];
  return `${n} de ${a}`;
};
const impostos = (n) => r2(['valor_iss', 'valor_pis', 'valor_cofins', 'valor_inss', 'valor_ir', 'valor_csll'].reduce((s, k) => s + (Number(n[k]) || 0), 0));
const chaveCliente = (n) => String(n.cliente_cnpj || '').replace(/\D/g, '') || String(n.cliente_nome || '').trim().toUpperCase();

function resumoDoMes(notas) {
  const aut = notas.filter(n => n.status === AUTORIZADA);
  const clientes = new Map();
  aut.forEach(n => {
    const k = chaveCliente(n);
    const c = clientes.get(k) || { nome: n.cliente_nome || 'Cliente', cnpj: n.cliente_cnpj || '', valor: 0, notas: 0 };
    c.valor = r2(c.valor + Number(n.valor || 0)); c.notas += 1;
    clientes.set(k, c);
  });
  const valor = r2(aut.reduce((s, n) => s + Number(n.valor || 0), 0));
  return {
    valor, notas: aut.length, clientes: clientes.size,
    ticket: clientes.size ? r2(valor / clientes.size) : 0,
    impostos: r2(aut.reduce((s, n) => s + impostos(n), 0)),
    canceladas: notas.filter(n => n.status === 'CANCELED').length,
    comErro: notas.filter(n => n.status === 'ERROR' || n.status === 'CANCELLATION_DENIED').length,
    pendentes: notas.filter(n => PENDENTES.has(n.status)).length,
    porCliente: [...clientes.values()].sort((a, b) => b.valor - a.valor),
  };
}

// mes: YYYY-MM escolhido. → { mes, atual, anterior, variacao, serie, ano, anoAnterior, ultimaEmissao }
export function montarFaturamento(notas = [], mes) {
  const porMes = new Map();
  notas.forEach(n => { const k = mesDe(n.data_emissao); if (k) porMes.set(k, [...(porMes.get(k) || []), n]); });
  const doMes = (k) => resumoDoMes(porMes.get(k) || []);
  const atual = doMes(mes), anterior = doMes(somarMeses(mes, -1));
  const variacao = anterior.valor > 0 ? (atual.valor - anterior.valor) / anterior.valor : null;
  // Últimos 12 meses até o escolhido
  const serie = Array.from({ length: 12 }, (_, i) => {
    const k = somarMeses(mes, i - 11);
    const r = doMes(k);
    return { mes: k, rotulo: rotuloMes(k), valor: r.valor, notas: r.notas, clientes: r.clientes };
  });
  // Acumulado do ano até o mês escolhido × mesmo período do ano anterior
  const acumulado = (ano, ateMes) => r2(notas.filter(n => n.status === AUTORIZADA && mesDe(n.data_emissao).startsWith(`${ano}-`) && mesDe(n.data_emissao) <= `${ano}-${ateMes}`)
    .reduce((s, n) => s + Number(n.valor || 0), 0));
  const [a, m] = mes.split('-');
  const ano = acumulado(a, m), anoAnterior = acumulado(String(Number(a) - 1), m);
  const ultimaEmissao = notas.filter(n => n.status === AUTORIZADA).map(n => n.data_emissao).sort().pop() || null;
  return { mes, atual, anterior, variacao, serie, ano, anoAnterior, variacaoAno: anoAnterior > 0 ? (ano - anoAnterior) / anoAnterior : null, ultimaEmissao };
}
