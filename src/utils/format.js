export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function formatCNPJ(cnpj) {
  return cnpj;
}

export function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}
