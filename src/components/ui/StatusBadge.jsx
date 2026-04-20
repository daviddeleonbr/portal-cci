const variants = {
  pago: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  confirmado: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  emitida: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ativo: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'em dia': 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  pendente: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  vencido: 'bg-red-50 text-red-700 ring-red-600/20',
  cancelada: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  inativo: 'bg-gray-50 text-gray-600 ring-gray-500/20',
};

const labels = {
  pago: 'Pago',
  confirmado: 'Confirmado',
  emitida: 'Emitida',
  ativo: 'Ativo',
  'em dia': 'Em dia',
  pendente: 'Pendente',
  vencido: 'Vencido',
  cancelada: 'Cancelada',
  inativo: 'Inativo',
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${variants[status] || 'bg-gray-50 text-gray-600 ring-gray-500/20'}`}
    >
      {labels[status] || status}
    </span>
  );
}
