// Seletor de período por MÊS + ANO (mês fechado). Dois dropdowns.
// O período resultante é o mês inteiro (1º ao último dia); o filtro
// "Apenas dias fechados" (na página) limita ao dia anterior quando marcado.
// Helpers de data ficam em utils/periodoMes.js (fast-refresh).
import { Calendar } from 'lucide-react';
import { MESES } from '../../utils/periodoMes';

export default function SeletorMesAno({ mes, ano, onChange, className = '' }) {
  const anoAtual = new Date().getFullYear();
  // Ano atual + 5 anteriores (cobre comparativos históricos).
  const anos = Array.from({ length: 6 }, (_, i) => anoAtual - i);
  const selCls =
    'h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

  return (
    <div className={`hidden md:flex items-center gap-2 ${className}`}>
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
        <Calendar className="h-3 w-3" /> Período
      </span>
      <select value={mes} onChange={(e) => onChange(Number(e.target.value), ano)} className={selCls} aria-label="Mês">
        {MESES.map((nome, i) => <option key={i + 1} value={i + 1}>{nome}</option>)}
      </select>
      <select value={ano} onChange={(e) => onChange(mes, Number(e.target.value))} className={selCls} aria-label="Ano">
        {anos.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  );
}
