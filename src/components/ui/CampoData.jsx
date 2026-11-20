import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

// Campo de data amigável pro celular. Substitui o <input type="date"> (cujo
// calendário nativo é minúsculo no desktop e varia por aparelho).
//  - Botão com a data por extenso ("Hoje", "qua, 19/11/2026").
//  - Ao tocar: gaveta de baixo pra cima no mobile / caixa centralizada no
//    desktop, com atalhos (Ontem / Hoje / Amanhã) e calendário com células
//    de 44px (área mínima de toque).
// Valor = string 'YYYY-MM-DD' (mesmo contrato do input nativo); '' = vazio.
// Renderiza via portal → funciona dentro de modais com overflow.

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const pad = (n) => String(n).padStart(2, '0');
// Datas sempre locais (new Date('YYYY-MM-DD') seria UTC e voltaria um dia no BR)
const paraIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deIso = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const ATALHOS_PADRAO = [{ label: 'Ontem', dias: -1 }, { label: 'Hoje', dias: 0 }, { label: 'Amanhã', dias: 1 }];
const somarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function rotulo(iso) {
  const d = deIso(iso);
  if (!d) return '';
  const hoje = new Date();
  const dif = Math.round((d - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86400000);
  const data = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (dif === 0) return `Hoje · ${data}`;
  if (dif === -1) return `Ontem · ${data}`;
  if (dif === 1) return `Amanhã · ${data}`;
  return `${DIAS_CURTOS[d.getDay()]}, ${data}`;
}

export default function CampoData({
  value = '', onChange, placeholder = 'Selecionar data', min, max,
  titulo = 'Selecionar data', permitirLimpar = true, className = '', disabled = false,
  atalhos: atalhosDias = null,
}) {
  const [aberto, setAberto] = useState(false);
  const hoje = useMemo(() => new Date(), []);
  const hojeIso = paraIso(hoje);
  const selecionada = deIso(value);
  const [mes, setMes] = useState(() => {
    const base = selecionada || hoje;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  // Ao abrir, o calendário vai pro mês da data escolhida
  const abrir = () => {
    const base = deIso(value) || new Date();
    setMes(new Date(base.getFullYear(), base.getMonth(), 1));
    setAberto(true);
  };

  // Esc fecha; trava o scroll da página enquanto aberto
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [aberto]);

  const foraDoLimite = (iso) => (min && iso < min) || (max && iso > max);
  const escolher = (iso) => {
    if (foraDoLimite(iso)) return;
    onChange?.(iso);
    setAberto(false);
  };

  // 6 semanas fixas (42 células) — a altura não pula ao trocar de mês
  const celulas = useMemo(() => {
    const inicio = somarDias(mes, -mes.getDay());
    return Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
  }, [mes]);

  // `atalhos`: [{ label, dias }] relativos a hoje (ex.: dias -1 = ontem)
  const atalhos = (atalhosDias || ATALHOS_PADRAO).map(a => ({ label: a.label, iso: paraIso(somarDias(hoje, a.dias)) }));

  return (
    <>
      <button type="button" disabled={disabled} onClick={abrir}
        aria-haspopup="dialog"
        className={`w-full h-11 px-3 mt-1 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-left focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:opacity-50 ${className}`}>
        <Calendar className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
        <span className={`truncate ${value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>
          {value ? rotulo(value) : placeholder}
        </span>
      </button>

      {createPortal(
        <AnimatePresence>
          {aberto && (
            <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
              <motion.div className="absolute inset-0 bg-black/40"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setAberto(false)} />
              <motion.div role="dialog" aria-modal="true" aria-label={titulo}
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
                {/* Alça da gaveta (mobile) */}
                <div className="sm:hidden flex justify-center pt-2"><span className="h-1 w-10 rounded-full bg-gray-300" /></div>

                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</p>
                  <button type="button" onClick={() => setAberto(false)} aria-label="Fechar"
                    className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Atalhos */}
                <div className="flex gap-2 px-4 pb-3">
                  {atalhos.map(a => {
                    const on = value === a.iso;
                    return (
                      <button key={a.label} type="button" disabled={foraDoLimite(a.iso)} onClick={() => escolher(a.iso)}
                        className={`flex-1 h-10 rounded-full border text-sm font-medium transition-colors disabled:opacity-40 ${
                          on ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                        {a.label}
                      </button>
                    );
                  })}
                </div>

                {/* Navegação de mês */}
                <div className="flex items-center justify-between px-2">
                  <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
                    aria-label="Mês anterior" className="h-11 w-11 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize" aria-live="polite">
                    {MESES[mes.getMonth()]} {mes.getFullYear()}
                  </p>
                  <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
                    aria-label="Próximo mês" className="h-11 w-11 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                {/* Calendário */}
                <div className="grid grid-cols-7 px-3" role="grid">
                  {DIAS_SEMANA.map((d, i) => (
                    <div key={i} className="h-8 flex items-center justify-center text-[11px] font-semibold text-gray-500">{d}</div>
                  ))}
                  {celulas.map(d => {
                    const iso = paraIso(d);
                    const doMes = d.getMonth() === mes.getMonth();
                    const sel = iso === value;
                    const ehHoje = iso === hojeIso;
                    const bloq = foraDoLimite(iso);
                    return (
                      <button key={iso} type="button" disabled={bloq} onClick={() => escolher(iso)}
                        aria-label={`${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`}
                        aria-pressed={sel}
                        className="h-11 flex items-center justify-center disabled:opacity-30">
                        <span className={`h-10 w-10 flex items-center justify-center rounded-full text-sm tabular-nums transition-colors ${
                          sel ? 'bg-blue-700 text-white font-semibold'
                            : ehHoje ? 'ring-1 ring-inset ring-blue-700 text-blue-700 font-semibold'
                              : doMes ? 'text-gray-900 dark:text-gray-100 hover:bg-gray-100'
                                : 'text-gray-400 hover:bg-gray-50'}`}>
                          {d.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {permitirLimpar && value && (
                  <div className="px-4 pt-2">
                    <button type="button" onClick={() => { onChange?.(''); setAberto(false); }}
                      className="w-full h-10 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">
                      Limpar data
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
