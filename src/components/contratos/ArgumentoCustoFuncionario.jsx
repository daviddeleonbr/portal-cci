// Argumento de venda da proposta pública: quanto custa, por mês, UM funcionário
// do posto (salário + encargos + benefícios + provisões) x o valor da proposta.
// O salário começa no mínimo (parâmetro geral) e o cliente pode trocar pelo que paga.
// Tamanhos em `em` (escala com a fonte-base da página pública).

import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { calcularCustoFuncionario } from '../../utils/custoFuncionario';

const CORES = ['bg-teal-500', 'bg-amber-400', 'bg-sky-500', 'bg-violet-500'];
const fmtNum = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lerValor = (s) => {
  const t = String(s ?? '').trim();
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/\.(?=\d{3}(\D|$))/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export default function ArgumentoCustoFuncionario({ params, valorMensalProposta }) {
  const minimo = Number(params?.salario_minimo) || 0;
  const [texto, setTexto] = useState(() => fmtNum(minimo));
  const salario = lerValor(texto);
  const c = useMemo(() => calcularCustoFuncionario(salario, params), [salario, params]);

  const vezes = salario > 0 ? c.total / salario : 0;
  const proposta = Number(valorMensalProposta) || 0;
  const pct = c.total > 0 ? (proposta / c.total) * 100 : 0;

  return (
    <section className="mt-6 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-50 text-teal-600"><Users className="h-4 w-4" /></span>
          <h2 className="text-[1.02em] font-bold text-slate-900 leading-tight">Quanto custa um funcionário no seu posto?</h2>
        </div>
        <p className="mt-2 text-[0.8em] text-slate-500 leading-relaxed">
          O salário é só uma parte. Somando encargos, benefícios e provisões de 13º e férias, cada empregado custa
          bem mais por mês. Informe o salário que você paga:
        </p>

        <label className="mt-3 block">
          <span className="text-[0.7em] font-semibold uppercase tracking-wider text-slate-500">Salário do funcionário</span>
          {/* bg-slate-50 (não /60): o tema escuro do portal converte essa classe
              para fundo escuro; a variante translúcida ficava clara com texto claro. */}
          <div className="mt-1 flex items-center rounded-xl ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-teal-400 bg-slate-50 px-3">
            <span className="text-[0.9em] text-slate-400">R$</span>
            <input inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)}
              onBlur={() => setTexto(fmtNum(salario))}
              className="w-full bg-transparent px-2 py-2.5 text-[1.05em] font-semibold text-slate-900 tabular-nums outline-none" />
          </div>
          {minimo > 0 && Math.abs(salario - minimo) > 0.005 && (
            <button type="button" onClick={() => setTexto(fmtNum(minimo))}
              className="mt-1 text-[0.7em] font-medium text-teal-700 hover:underline">
              Voltar ao salário mínimo ({formatCurrency(minimo)})
            </button>
          )}
        </label>

        {/* Total */}
        <div className="mt-4 rounded-xl bg-slate-900 text-white px-4 py-3.5">
          <p className="text-[0.66em] uppercase tracking-wider text-white/60">Custo mensal de 1 funcionário</p>
          <p className="text-[1.6em] font-bold leading-tight tabular-nums">{formatCurrency(c.total)}<span className="text-[0.5em] font-medium text-white/60"> /mês</span></p>
          {vezes > 0 && <p className="text-[0.72em] text-white/70">≈ {vezes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× o salário</p>}
        </div>

        {/* Composição */}
        <div className="mt-4">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {c.grupos.map((g, i) => (
              <div key={g.rotulo} className={CORES[i]} style={{ width: `${c.total > 0 ? (g.valor / c.total) * 100 : 0}%` }} />
            ))}
          </div>
          <ul className="mt-3 space-y-2">
            {c.grupos.map((g, i) => (
              <li key={g.rotulo} className="flex items-start gap-2.5">
                <span className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-sm ${CORES[i]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.85em] font-medium text-slate-800">{g.rotulo}</span>
                    <span className="text-[0.85em] font-semibold text-slate-900 tabular-nums">{formatCurrency(g.valor)}</span>
                  </div>
                  <p className="text-[0.7em] text-slate-500 leading-snug">{g.detalhe}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Comparação com a proposta */}
      {proposta > 0 && c.total > 0 && (
        <div className="border-t border-teal-100 bg-teal-50/70 px-4 sm:px-5 py-3.5">
          <p className="text-[0.85em] text-slate-700 leading-relaxed">
            {pct <= 100 ? (
              <>Esta proposta custa <strong className="text-teal-800">{formatCurrency(proposta)}/mês</strong> —
                {' '}<strong className="text-teal-800">{pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</strong> do custo de um único funcionário,
                {' '}com uma equipe especializada cuidando do seu posto.</>
            ) : (
              <>Esta proposta custa <strong className="text-teal-800">{formatCurrency(proposta)}/mês</strong> — o equivalente a
                {' '}<strong className="text-teal-800">{(proposta / c.total).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} funcionário(s)</strong>,
                {' '}com uma equipe especializada e sem encargos trabalhistas para você.</>
            )}
          </p>
        </div>
      )}
      <p className="px-4 sm:px-5 pb-3 pt-2 text-[0.62em] text-slate-400 leading-relaxed">
        Estimativa com periculosidade de {fmtPct(params?.pct_periculosidade)}, assiduidade de {fmtPct(params?.pct_assiduidade)},
        INSS patronal {fmtPct(params?.pct_inss_empresa)}, FGTS {fmtPct(params?.pct_fgts)}, RAT {fmtPct(params?.pct_rat)},
        terceiros {fmtPct(params?.pct_terceiros)}, vale-transporte e alimentação, e provisões de 13º salário e férias.
      </p>
    </section>
  );
}

function fmtPct(v) {
  return `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
