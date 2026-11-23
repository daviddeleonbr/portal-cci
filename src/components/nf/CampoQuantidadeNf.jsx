// Campo de quantidade do item da NF: em unidades OU em embalagem com conversão
// (2 caixas × 24 un = 48 unidades). Estado/colunas em utils/nfQuantidade.js.
// Tipo de embalagem em botões numa linha só, rolando na horizontal até a borda
// da janela — use dentro de um container com padding px-4 sm:px-5 (sem
// <select> — no celular a lista nativa abre solta e desalinhada).
import { Minus, Plus } from 'lucide-react';
import { TIPOS_EMBALAGEM, fmtQtd, nomeEmbalagem, totalUnidades } from '../../utils/nfQuantidade';

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Só dígitos: os campos abrem o teclado NUMÉRICO do celular (inputMode=numeric +
// pattern p/ o iOS) — sem vírgula/sinais; colar "2 cx" vira "2".
const soDigitos = (v) => String(v ?? '').replace(/\D+/g, '');

// Número com − e + colados (um bloco só): digita no teclado numérico ou ajusta
// de 1 em 1. Mínimo 1 (vazio + "+" vira 1).
function CampoNumero({ id, valor, onChange, disabled, placeholder, rotulo }) {
  const atual = Math.round(num(valor));
  const passo = (d) => onChange(String(Math.max(1, atual + d)));
  const btn = 'flex w-10 shrink-0 items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06] active:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className="flex h-11 overflow-hidden rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900/40">
      <button type="button" onClick={() => passo(-1)} disabled={disabled || atual <= 1} className={`${btn} border-r border-gray-200 dark:border-white/10`} aria-label={`Diminuir ${rotulo}`}>
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <input id={id} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="done" value={valor}
        onChange={e => onChange(soDigitos(e.target.value))} disabled={disabled} placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent px-1 text-center text-base sm:text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100 placeholder:font-normal placeholder:text-gray-400 focus:outline-none disabled:text-gray-500" />
      <button type="button" onClick={() => passo(1)} disabled={disabled} className={`${btn} border-l border-gray-200 dark:border-white/10`} aria-label={`Aumentar ${rotulo}`}>
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function CampoQuantidadeNf({ valor, onChange, disabled = false, idBase = 'qtd' }) {
  const set = (campo, v) => onChange({ ...valor, [campo]: v });
  const total = totalUnidades(valor);
  const rot = 'block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1';
  const emb = valor.modo === 'embalagem';
  const nomeSing = nomeEmbalagem(valor.embalagem_tipo, 1);
  const faltaUnidades = emb && !(num(valor.unidades_por_embalagem) > 0);

  return (
    <div className="space-y-2">
      <div className="inline-flex w-full rounded-lg bg-gray-100 dark:bg-white/[0.05] p-1" role="radiogroup" aria-label="Como veio a quantidade">
        {[['unidade', 'Em unidades'], ['embalagem', 'Em caixa/fardo']].map(([m, r]) => (
          <button key={m} type="button" role="radio" aria-checked={valor.modo === m} disabled={disabled}
            onClick={() => set('modo', m)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${valor.modo === m ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}>
            {r}
          </button>
        ))}
      </div>

      {!emb ? (
        <div>
          <label htmlFor={`${idBase}-un`} className={rot}>Quantidade (unidades)</label>
          <CampoNumero id={`${idBase}-un`} valor={valor.quantidade} onChange={v => set('quantidade', v)} disabled={disabled} rotulo="quantidade" />
        </div>
      ) : (
        <>
          <div>
            <p id={`${idBase}-et`} className={`${rot} !mb-2`}>Embalagem</p>
            {/* uma linha só, rola na horizontal (scrollbar escondida; borda esmaece à direita) */}
            {/* Rola até a BORDA da janela (sangra o padding px-4 sm:px-5 das janelas
                da NF) e recua o mesmo tanto por dentro: a 1ª pílula fica alinhada à
                margem dos campos e as pílulas só somem na borda do dispositivo. */}
            <div className="relative -mx-4 sm:-mx-5">
              <div role="radiogroup" aria-labelledby={`${idBase}-et`}
                className="flex gap-1.5 overflow-x-auto overscroll-x-contain snap-x scroll-px-4 sm:scroll-px-5 px-4 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {TIPOS_EMBALAGEM.map(([v, r]) => {
                  const on = valor.embalagem_tipo === v;
                  return (
                    <button key={v} type="button" role="radio" aria-checked={on} disabled={disabled}
                      onClick={() => set('embalagem_tipo', v)}
                      className={`h-9 shrink-0 snap-start whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1 ring-inset transition ${on
                        ? 'bg-blue-600 text-white ring-blue-600'
                        : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 ring-gray-200 dark:ring-white/10 hover:bg-gray-50 dark:hover:bg-white/[0.06]'}`}>
                      {v === 'outro' ? 'Outra' : r}
                    </button>
                  );
                })}
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-white dark:from-slate-900" aria-hidden="true" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label htmlFor={`${idBase}-eq`} className={rot}>Quantas {nomeEmbalagem(valor.embalagem_tipo, 2)}</label>
              <CampoNumero id={`${idBase}-eq`} valor={valor.embalagem_qtd} onChange={v => set('embalagem_qtd', v)} disabled={disabled}
                rotulo={`quantidade de ${nomeEmbalagem(valor.embalagem_tipo, 2)}`} />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${idBase}-upe`} className={rot}>Unidades por {nomeSing}</label>
              <CampoNumero id={`${idBase}-upe`} valor={valor.unidades_por_embalagem} onChange={v => set('unidades_por_embalagem', v)} disabled={disabled}
                placeholder="Ex.: 24" rotulo={`unidades por ${nomeSing}`} />
            </div>
          </div>
        </>
      )}

      <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${faltaUnidades ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-blue-50 dark:bg-blue-500/10'}`} aria-live="polite">
        {faltaUnidades ? (
          <span className="text-amber-900 dark:text-amber-200">Informe quantas unidades vêm em cada {nomeSing}.</span>
        ) : (
          <>
            <span className="text-blue-900 dark:text-blue-200">
              {emb ? <>{fmtQtd(valor.embalagem_qtd)} {nomeEmbalagem(valor.embalagem_tipo, valor.embalagem_qtd)} × {fmtQtd(valor.unidades_por_embalagem)} un</> : 'Total'}
            </span>
            <strong className="whitespace-nowrap tabular-nums text-blue-900 dark:text-blue-100">= {fmtQtd(total)} {total === 1 ? 'unidade' : 'unidades'}</strong>
          </>
        )}
      </div>
    </div>
  );
}
