// Modal de carregamento envolvente — reusado em telas que demoram
// 5-25s pra carregar (Vendas, Dashboard, Operação, Produtividade).
//
// Diferente de um spinner, exibe steps reais que progridem por tempo
// médio, contador visível, progress bar contínua e dicas rotativas.
// O último step continua animando ("Finalizando...") até a tela
// fechar, então funciona mesmo se demorar mais que o esperado.
//
// USO:
//   import ModalCarregando, { PRESETS } from '...';
//   <ModalCarregando aberto={loading} preset={PRESETS.dashboard}
//     periodo={...} qtdEmpresas={N} />
//
// Custom:
//   <ModalCarregando aberto={...} titulo="..." steps={[...]} dicas={[...]}
//     icone={IconeCustom} />

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Search, BarChart3, TrendingUp, Layers, CheckCircle2, Loader2,
  Lightbulb, Sparkles, FileText, ClipboardCheck, Users, Activity,
  PiggyBank, Receipt,
} from 'lucide-react';

// ─── Presets de configuração ───────────────────────────────

const STEPS_VENDAS = [
  { key: 'conectando',  icone: Database,    label: 'Conectando ao banco de dados',                expectedMs:  600 },
  { key: 'catalogo',    icone: Search,      label: 'Carregando catálogo de produtos',             expectedMs: 1200 },
  { key: 'vendas',      icone: BarChart3,   label: 'Buscando vendas do período selecionado',      expectedMs: 8000 },
  { key: 'comparativo', icone: TrendingUp,  label: 'Comparando com mês anterior e ano anterior',  expectedMs: 6000 },
  { key: 'organizando', icone: Layers,      label: 'Organizando por categoria, grupo e produto',  expectedMs: 2000 },
  { key: 'finalizando', icone: Sparkles,    label: 'Finalizando — preparando visualizações',      expectedMs: 1200 },
];

const STEPS_DASHBOARD = [
  { key: 'conectando',  icone: Database,    label: 'Conectando ao banco de dados',                  expectedMs:  500 },
  { key: 'catalogo',    icone: Search,      label: 'Carregando catálogos (produtos, fornecedores)', expectedMs: 1500 },
  { key: 'vendas',      icone: BarChart3,   label: 'Calculando vendas do mês',                      expectedMs: 5000 },
  { key: 'financeiro',  icone: PiggyBank,   label: 'Buscando contas a pagar e receber',             expectedMs: 8000 },
  { key: 'organizando', icone: Layers,      label: 'Organizando informações por categoria',         expectedMs: 1500 },
  { key: 'finalizando', icone: Sparkles,    label: 'Finalizando — preparando visualizações',        expectedMs: 1000 },
];

const STEPS_OPERACAO = [
  { key: 'conectando',  icone: Database,       label: 'Conectando ao banco de dados',                expectedMs:  500 },
  { key: 'caixas',      icone: ClipboardCheck, label: 'Buscando turnos e movimentações de caixa',    expectedMs: 5000 },
  { key: 'vendas',      icone: BarChart3,      label: 'Cruzando vendas e formas de pagamento',       expectedMs: 6000 },
  { key: 'afericoes',   label: 'Lendo aferições e abastecimentos por bico', icone: Activity,         expectedMs: 4000 },
  { key: 'organizando', icone: Layers,         label: 'Organizando por turno e responsável',         expectedMs: 1500 },
  { key: 'finalizando', icone: Sparkles,       label: 'Finalizando — preparando visualizações',      expectedMs: 1000 },
];

const STEPS_PRODUTIVIDADE = [
  { key: 'conectando',  icone: Database,    label: 'Conectando ao banco de dados',                  expectedMs:  500 },
  { key: 'catalogo',    icone: Search,      label: 'Carregando funcionários e classificações',      expectedMs: 1200 },
  { key: 'vendas',      icone: BarChart3,   label: 'Buscando vendas por vendedor no período',       expectedMs: 7000 },
  { key: 'abastec',     icone: Activity,    label: 'Cruzando abastecimentos e mix de produtos',     expectedMs: 5000 },
  { key: 'organizando', icone: Users,       label: 'Organizando ranking de vendedores',             expectedMs: 1500 },
  { key: 'finalizando', icone: Sparkles,    label: 'Finalizando — preparando visualizações',        expectedMs: 1000 },
];

const DICAS_GERAIS = [
  'Você pode filtrar várias empresas ao mesmo tempo — os totais somam tudo selecionado.',
  'A projeção do mês usa o ritmo atual de vendas pra estimar o fechamento.',
  'Quando hoje não é dia útil, os totais "do dia" rolam pro próximo dia útil.',
  'Acréscimos aparecem em verde, descontos em vermelho.',
  'Margem é calculada como (Faturamento − Custo) ÷ Faturamento.',
  'O cache cobre todo histórico já sincronizado — só dados recentes vêm da Quality em tempo real.',
];
const DICAS_VENDAS = [
  ...DICAS_GERAIS,
  'A árvore exibe Empresa → Categoria → Grupo → Produto. Clique pra expandir cada nível.',
  'A barra dentro de cada célula compara o valor com o maior do grupo — leitura instantânea.',
  'O comparativo "vs AA" usa o mesmo número de dias do recorte atual — leitura justa.',
  'Clique em uma linha da tree pra destacá-la — ajuda a comparar valores na horizontal.',
];
const DICAS_DASHBOARD = [
  ...DICAS_GERAIS,
  'O donut mostra a participação de cada categoria no Lucro bruto do mês.',
  'Top 3 administradoras é dos cartões que serão recebidos hoje (ou no próximo dia útil).',
  'Cheques e Títulos vencidos exigem atenção — clique em "Ver todas" pra cobrar.',
];
const DICAS_OPERACAO = [
  ...DICAS_GERAIS,
  'Cada turno tem aberto/fechado, vendas e diferença de caixa.',
  'Aferições mostram a leitura dos bicos por frentista.',
  'Discrepâncias entre vendas e formas de pagamento aparecem destacadas.',
];
const DICAS_PRODUTIVIDADE = [
  ...DICAS_GERAIS,
  'Ranking considera apenas vendedores com faturamento no período.',
  'Mix de aditivada compara as vendas vs combustível comum.',
  'Ticket médio é fat / qtd de abastecimentos.',
];

export const PRESETS = {
  vendas:        { titulo: 'Preparando suas vendas',          steps: STEPS_VENDAS,        dicas: DICAS_VENDAS,        icone: BarChart3 },
  dashboard:     { titulo: 'Montando sua Visão Geral',         steps: STEPS_DASHBOARD,     dicas: DICAS_DASHBOARD,     icone: PiggyBank },
  operacao:      { titulo: 'Carregando dados de Operação',     steps: STEPS_OPERACAO,      dicas: DICAS_OPERACAO,      icone: ClipboardCheck },
  produtividade: { titulo: 'Calculando produtividade',         steps: STEPS_PRODUTIVIDADE, dicas: DICAS_PRODUTIVIDADE, icone: Users },
};

// ─── Componente ────────────────────────────────────────────

export default function ModalCarregando({
  aberto, periodo, qtdEmpresas, preset, titulo, steps, dicas, icone,
}) {
  // Resolve config: preset → fallbacks pro preset Vendas
  const cfg = preset || PRESETS.vendas;
  const stepsResolved = steps || cfg.steps;
  const dicasResolved = dicas || cfg.dicas;
  const tituloResolved = titulo || cfg.titulo;
  const IcoTopo = icone || cfg.icone || BarChart3;

  const [stepIdx, setStepIdx] = useState(0);
  const [tempoMs, setTempoMs] = useState(0);
  const [dicaIdx, setDicaIdx] = useState(0);
  const tStartRef = useRef(0);

  useEffect(() => {
    if (!aberto) return;
    tStartRef.current = performance.now();
    setStepIdx(0);
    setTempoMs(0);
    setDicaIdx(Math.floor(Math.random() * dicasResolved.length));
  }, [aberto, dicasResolved.length]);

  useEffect(() => {
    if (!aberto) return;
    let timeoutId;
    const tick = (idx) => {
      if (idx >= stepsResolved.length - 1) return;
      timeoutId = setTimeout(() => {
        setStepIdx(idx + 1);
        tick(idx + 1);
      }, stepsResolved[idx].expectedMs);
    };
    tick(0);
    return () => clearTimeout(timeoutId);
  }, [aberto, stepsResolved]);

  useEffect(() => {
    if (!aberto) return;
    const id = setInterval(() => {
      setTempoMs(performance.now() - tStartRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const id = setInterval(() => {
      setDicaIdx(i => (i + 1) % dicasResolved.length);
    }, 5000);
    return () => clearInterval(id);
  }, [aberto, dicasResolved.length]);

  const totalEsperadoMs = stepsResolved.reduce((s, p) => s + p.expectedMs, 0);
  const pctTempo = Math.min(95, (tempoMs / totalEsperadoMs) * 100);
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
            <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-blue-50 via-white to-emerald-50/40 overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-200/20 rounded-full blur-2xl" />
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-200/30 rounded-full blur-2xl" />
              <div className="relative flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg flex-shrink-0">
                  <IcoTopo className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-gray-900 leading-tight">{tituloResolved}</h3>
                  <p className="text-[11.5px] text-gray-500 leading-tight">
                    {periodo ? `${periodo}` : ''}
                    {periodo && qtdEmpresas ? ' · ' : ''}
                    {qtdEmpresas ? `${qtdEmpresas} empresa${qtdEmpresas === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <span className="ml-auto text-[10.5px] font-mono tabular-nums text-gray-400">
                  {segDecorridos}s
                </span>
              </div>
              <div className="mt-4 h-1.5 bg-white/70 rounded-full overflow-hidden ring-1 ring-gray-200/60">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${pctTempo}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            </div>
            <div className="px-6 py-4 space-y-2.5">
              {stepsResolved.map((step, i) => {
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
                  {dicasResolved[dicaIdx]}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
