// Modal de carregamento da página Vendas — encobre os 20-25s da RPC
// pesada com uma experiência envolvente: steps que progridem por tempo
// médio (não é fake, são as etapas reais que o backend executa),
// progress bar fluida, dicas rotativas e contador de tempo visível.
//
// O componente fica ATIVO até receber a prop `aberto = false`. Os steps
// progridem automaticamente baseado em `expectedMs`; o último step
// continua animando ("Finalizando...") até a query realmente terminar —
// se demorar mais que o esperado, não trava.

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Search, BarChart3, TrendingUp, Layers, CheckCircle2, Loader2,
  Lightbulb, Sparkles,
} from 'lucide-react';

const STEPS = [
  { key: 'conectando',  icone: Database,    label: 'Conectando ao banco de dados',                expectedMs:  600 },
  { key: 'catalogo',    icone: Search,      label: 'Carregando catálogo de produtos',             expectedMs: 1200 },
  { key: 'vendas',      icone: BarChart3,   label: 'Buscando vendas do período selecionado',      expectedMs: 8000 },
  { key: 'comparativo', icone: TrendingUp,  label: 'Comparando com mês anterior e ano anterior',  expectedMs: 6000 },
  { key: 'organizando', icone: Layers,      label: 'Organizando por categoria, grupo e produto',  expectedMs: 2000 },
  { key: 'finalizando', icone: Sparkles,    label: 'Finalizando — preparando visualizações',      expectedMs: 1200 },
];

const DICAS = [
  'Você sabia? A "Projeção do mês" usa o ritmo atual de vendas pra estimar o fechamento.',
  'Dica: o cache cobre todo histórico já sincronizado — só os últimos 2 dias vêm da Quality em tempo real.',
  'Atenção: ative "Apenas dias fechados" pra excluir o dia corrente das comparações.',
  'Dica: clique em uma linha da tree pra destacá-la — ajuda a comparar valores na horizontal.',
  'A árvore exibe Empresa → Categoria → Grupo → Produto. Clique pra expandir cada nível.',
  'Você pode filtrar várias empresas ao mesmo tempo — os totais somam tudo selecionado.',
  'Acréscimos aparecem em verde, descontos em vermelho — fica visual no Realizado dia a dia.',
  'A barra dentro de cada célula compara o valor com o maior do grupo — leitura instantânea.',
  'Margem é calculada como (Faturamento − Custo) ÷ Faturamento.',
  'O comparativo "vs AA" usa o mesmo número de dias do recorte atual — leitura justa.',
];

export default function ModalCarregandoVendas({ aberto, periodo, qtdEmpresas }) {
  // Step atualmente "ativo" (girando) — os anteriores estão concluídos
  const [stepIdx, setStepIdx] = useState(0);
  const [tempoMs, setTempoMs] = useState(0);
  const [dicaIdx, setDicaIdx] = useState(0);
  const tStartRef = useRef(0);

  // Reseta tudo quando abre
  useEffect(() => {
    if (!aberto) return;
    tStartRef.current = performance.now();
    setStepIdx(0);
    setTempoMs(0);
    setDicaIdx(Math.floor(Math.random() * DICAS.length));
  }, [aberto]);

  // Avança os steps por tempo
  useEffect(() => {
    if (!aberto) return;
    let timeoutId;
    const tick = (idx) => {
      if (idx >= STEPS.length - 1) return; // último step fica girando até fechar
      timeoutId = setTimeout(() => {
        setStepIdx(idx + 1);
        tick(idx + 1);
      }, STEPS[idx].expectedMs);
    };
    tick(0);
    return () => clearTimeout(timeoutId);
  }, [aberto]);

  // Contador de tempo decorrido (atualiza a cada 100ms)
  useEffect(() => {
    if (!aberto) return;
    const id = setInterval(() => {
      setTempoMs(performance.now() - tStartRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [aberto]);

  // Roda as dicas a cada 5s
  useEffect(() => {
    if (!aberto) return;
    const id = setInterval(() => {
      setDicaIdx(i => (i + 1) % DICAS.length);
    }, 5000);
    return () => clearInterval(id);
  }, [aberto]);

  // Progress bar de tempo (assume duração total esperada)
  const totalEsperadoMs = STEPS.reduce((s, p) => s + p.expectedMs, 0);
  const pctTempo = Math.min(95, (tempoMs / totalEsperadoMs) * 100); // nunca chega a 100% até fechar
  const segDecorridos = (tempoMs / 1000).toFixed(1);

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="bg-white rounded-2xl shadow-2xl border border-gray-200/60 w-full max-w-lg overflow-hidden"
          >
            {/* Header com ícone animado + título */}
            <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-blue-50 via-white to-emerald-50/40 overflow-hidden">
              {/* Decoração: círculos suaves */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-200/20 rounded-full blur-2xl" />
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-200/30 rounded-full blur-2xl" />

              <div className="relative flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg flex-shrink-0">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-gray-900 leading-tight">Preparando suas vendas</h3>
                  <p className="text-[11.5px] text-gray-500 leading-tight">
                    {periodo ? `${periodo} · ` : ''}
                    {qtdEmpresas ? `${qtdEmpresas} empresa${qtdEmpresas === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <span className="ml-auto text-[10.5px] font-mono tabular-nums text-gray-400">
                  {segDecorridos}s
                </span>
              </div>

              {/* Progress bar geral */}
              <div className="mt-4 h-1.5 bg-white/70 rounded-full overflow-hidden ring-1 ring-gray-200/60">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${pctTempo}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Lista de steps */}
            <div className="px-6 py-4 space-y-2.5">
              {STEPS.map((step, i) => {
                const Icone = step.icone;
                const concluido = i < stepIdx;
                const ativo = i === stepIdx;
                const pendente = i > stepIdx;
                return (
                  <motion.div
                    key={step.key}
                    initial={false}
                    animate={{ opacity: pendente ? 0.4 : 1 }}
                    className="flex items-center gap-3"
                  >
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                      concluido ? 'bg-emerald-100' :
                      ativo     ? 'bg-blue-100 ring-2 ring-blue-200' :
                                  'bg-gray-100'
                    }`}>
                      {concluido ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : ativo ? (
                        <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                      ) : (
                        <Icone className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </div>
                    <p className={`text-[12.5px] leading-tight transition-colors duration-300 ${
                      concluido ? 'text-gray-500 line-through decoration-emerald-300/60' :
                      ativo     ? 'text-gray-900 font-semibold' :
                                  'text-gray-400'
                    }`}>
                      {step.label}
                    </p>
                    {ativo && (
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500"
                      />
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Dica rotativa */}
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50/60 min-h-[58px] flex items-start gap-2.5">
              <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <AnimatePresence mode="wait">
                <motion.p
                  key={dicaIdx}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.4 }}
                  className="text-[11.5px] text-gray-600 leading-relaxed"
                >
                  {DICAS[dicaIdx]}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
