// Landing page comercial da CCI Consultoria.
// Design SaaS premium (escuro + acentos em violeta/cyan), Framer Motion para
// scroll progressivo e microinterações. Foco: gerar autoridade no segmento de
// postos e converter em diagnóstico/contato.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight, ArrowUpRight, Check, Fuel, ShieldCheck, Sparkles, Zap, BarChart3,
  Wallet, Briefcase, FileBarChart, Database, Bot, LineChart, TrendingUp,
  TrendingDown, AlertTriangle, Clock, Users2, Target,
  Phone, Mail, ChevronRight, Star, PieChart, Activity,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#070912] text-slate-100 antialiased overflow-x-hidden selection:bg-violet-500/30 selection:text-white">
      <BackgroundFx />
      <Navbar />
      <Hero />
      <Problems />
      <Services />
      <Differentials />
      <Results />
      <DashboardShowcase />
      <Testimonials />
      <FinalCTA />
      <Footer />
    </div>
  );
}

// ─── Efeitos de fundo (gradientes + grid sutil) ────────────────────────
function BackgroundFx() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Aurora superior */}
      <div className="absolute -top-40 left-1/2 h-[640px] w-[1200px] -translate-x-1/2 rounded-full bg-violet-600/30 blur-[140px]" />
      <div className="absolute top-[20%] -right-40 h-[500px] w-[700px] rounded-full bg-cyan-500/20 blur-[140px]" />
      <div className="absolute top-[55%] -left-40 h-[500px] w-[700px] rounded-full bg-fuchsia-500/15 blur-[140px]" />
      {/* Vinheta */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(7,9,18,0.6)_70%,_#070912_100%)]" />
    </div>
  );
}

// ─── Navbar ────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'Serviços', href: '#serviços' },
    { label: 'Diferenciais', href: '#diferenciais' },
    { label: 'Resultados', href: '#resultados' },
    { label: 'Plataforma', href: '#plataforma' },
    { label: 'Depoimentos', href: '#depoimentos' },
  ];

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'backdrop-blur-xl bg-[#070912]/70 border-b border-white/5 py-3'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5 group">
          <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white font-bold text-sm shadow-lg shadow-violet-500/30">
            <span className="relative z-10">C</span>
            <span className="absolute inset-0 rounded-xl bg-violet-500 opacity-0 group-hover:opacity-100 transition-opacity blur-md" />
          </span>
          <div className="leading-none">
            <p className="text-[15px] font-semibold tracking-tight">CCI</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Consultoria Inteligente</p>
          </div>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {links.map(l => (
            <a key={l.href} href={l.href}
              className="text-[13px] text-slate-300 hover:text-white transition-colors relative group">
              {l.label}
              <span className="absolute -bottom-1 left-0 right-0 h-px bg-violet-500 scale-x-0 group-hover:scale-x-100 origin-left transition-transform" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/portais"
            className="hidden sm:inline-flex text-[13px] text-slate-300 hover:text-white transition-colors px-3 py-2">
            Acessar portal
          </Link>
          <a href="#cta"
            className="group relative inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all hover:scale-[1.02]">
            <span className="absolute inset-0 rounded-full bg-violet-500 opacity-0 group-hover:opacity-100 blur-md transition-opacity -z-10" />
            Agendar diagnóstico
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </a>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────
function Hero() {
  const { scrollYProgress } = useScroll();
  const yMockup = useTransform(scrollYProgress, [0, 0.3], [0, -80]);

  return (
    <section id="top" className="relative pt-36 pb-24 px-6 overflow-hidden">
      <HeroVideoBackground />
      <div className="relative z-10 max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Especialistas no setor de postos de combustível
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="text-center text-[44px] sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[1.05] max-w-5xl mx-auto"
        >
          O lucro que o seu posto{' '}
          <span className="text-violet-300">
            esquece de mostrar
          </span>{' '}
          agora visível.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-7 text-center text-[17px] sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed"
        >
          Consultoria, BPO financeiro e relatórios inteligentes para postos que querem
          parar de operar no escuro. Dados reais, decisões precisas, margem que aparece no caixa.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <a href="#cta"
            className="group relative inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-3.5 text-[14px] font-semibold text-white shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50 transition-all hover:scale-[1.02]">
            <span className="absolute inset-0 rounded-full bg-violet-500 opacity-0 group-hover:opacity-100 blur-md transition-opacity -z-10" />
            Agendar diagnóstico gratuito
            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </a>
          <a href="#serviços"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-3.5 text-[14px] font-medium text-slate-200 hover:bg-white/[0.06] hover:border-white/20 transition-all">
            Ver como funciona
            <ChevronRight className="h-4 w-4" />
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[12px] text-slate-500"
        >
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Sem mensalidade no diagnóstico</span>
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Resposta em 24h úteis</span>
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Setor postos exclusivo</span>
        </motion.div>

        {/* Mockup hero */}
        <motion.div
          style={{ y: yMockup }}
          initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4 }}
          className="mt-20 relative max-w-6xl mx-auto"
        >
          <HeroDashboardMock />
        </motion.div>
      </div>
    </section>
  );
}

// Vídeo sutil em loop atrás do hero. Camadas, de baixo pra cima:
//   1) <video> object-cover ocupando toda a section
//   2) Layer preta com opacidade alta para legibilidade do texto
//   3) Vinheta inferior fundindo com o restante da página
// Coloque o arquivo em /public/videos/hero-bg.mp4 (tema: posto, gasolina,
// dashboard, gráficos abstratos). Sem o arquivo, o overlay e as auroras do
// fundo já garantem o visual — graceful degradation.
function HeroVideoBackground() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full min-w-full min-h-full object-cover opacity-[0.55]"
      >
        <source src="/videos/mixkit-reflection-of-a-screen-in-glasses.mp4" type="video/mp4" />
      </video>
      {/* Layer escura para legibilidade */}
      <div className="absolute inset-0 bg-black/35" />
      {/* Tinta do tema sobreposta para integrar com a paleta da página */}
      <div className="absolute inset-0 bg-[#070912]/20" />
      {/* Vinheta inferior — funde com o próximo bloco */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-[#070912]" />
    </div>
  );
}

function HeroDashboardMock() {
  return (
    <div className="relative">
      {/* Glow base */}
      <div className="absolute -inset-x-20 -inset-y-10 -z-10 bg-violet-500/20 blur-3xl rounded-[50%] opacity-70" />
      {/* Frame */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <div className="rounded-xl overflow-hidden bg-[#0b0f1c] border border-white/[0.06]">
          {/* Top bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-[#0a0d18]">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-3 text-[11px] text-slate-500">portal.cci-consultoria.com.br/dashboard</span>
            <span className="ml-auto text-[10px] text-slate-500">Atualizado agora</span>
          </div>
          {/* Body */}
          <div className="p-5 grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-3 space-y-3">
              <MockKPI label="Margem bruta" value="24,8%" delta="+3,2 pp" up icon={TrendingUp} />
              <MockKPI label="Lucro líquido" value="R$ 287k" delta="+18%" up icon={Wallet} accent="emerald" />
              <MockKPI label="Cancelamentos" value="0,4%" delta="-1,1 pp" up icon={AlertTriangle} accent="amber" />
            </div>
            <div className="col-span-12 md:col-span-9 space-y-4">
              <MockChart />
              <div className="grid grid-cols-3 gap-3">
                <MockMini title="Diesel S10" pct={42} accent="cyan" />
                <MockMini title="Gasolina" pct={31} accent="violet" />
                <MockMini title="Conveniência" pct={27} accent="emerald" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card flutuante */}
      <motion.div
        initial={{ opacity: 0, x: 20, y: 20 }} animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 1.1, duration: 0.6 }}
        className="hidden md:block absolute -right-8 top-1/2 -translate-y-1/2 w-64 rounded-xl border border-white/10 bg-[#0b0f1c] p-4 shadow-2xl shadow-violet-500/10 backdrop-blur-md"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Bot className="h-3.5 w-3.5 text-violet-300" />
          </div>
          <p className="text-[11px] font-semibold text-slate-200">IA — Insight de hoje</p>
        </div>
        <p className="text-[11.5px] text-slate-400 leading-relaxed">
          Margem de gasolina aditivada caiu 1,8pp vs trimestre anterior. Reajuste sugerido:
          <span className="text-emerald-300 font-mono"> +R$ 0,07/L</span>.
        </p>
        <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3 text-violet-300" /> Claude Opus</span>
          <span>Confiança 94%</span>
        </div>
      </motion.div>
    </div>
  );
}

function MockKPI({ label, value, delta, up, icon: Icon, accent = 'violet' }) {
  const accentMap = {
    violet: 'text-violet-300 bg-violet-500/15',
    emerald: 'text-emerald-300 bg-emerald-500/15',
    amber: 'text-amber-300 bg-amber-500/15',
  };
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${accentMap[accent]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10.5px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <p className="text-[20px] font-semibold tracking-tight text-white tabular-nums">{value}</p>
      <p className={`text-[10.5px] mt-0.5 inline-flex items-center gap-1 ${up ? 'text-emerald-300' : 'text-red-300'}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {delta}
      </p>
    </div>
  );
}

function MockChart() {
  const bars = [38, 52, 45, 60, 55, 72, 68, 82, 78, 88, 85, 95];
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[12px] text-slate-300 font-medium">Lucro líquido — últimos 12 meses</p>
          <p className="text-[10.5px] text-slate-500">Tendência consolidada</p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="inline-flex items-center gap-1.5 text-slate-400"><span className="h-1.5 w-3 rounded-full bg-violet-400" /> Atual</span>
          <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="h-1.5 w-3 rounded-full bg-slate-600" /> YoY</span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-32">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 flex flex-col gap-0.5 items-stretch">
            <div className="flex-1 flex items-end">
              <div
                className="w-full rounded-t bg-violet-500/70"
                style={{ height: `${h}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-12 gap-1.5 text-[9px] text-slate-600 text-center">
        {['J','F','M','A','M','J','J','A','S','O','N','D'].map((m, i) => <span key={i}>{m}</span>)}
      </div>
    </div>
  );
}

function MockMini({ title, pct, accent }) {
  const accentMap = {
    violet: { bar: 'bg-violet-500', text: 'text-violet-300' },
    cyan: { bar: 'bg-cyan-500', text: 'text-cyan-300' },
    emerald: { bar: 'bg-emerald-500', text: 'text-emerald-300' },
  };
  const a = accentMap[accent];
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10.5px] text-slate-400">{title}</span>
        <span className={`text-[11px] font-semibold tabular-nums ${a.text}`}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${a.bar} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Problemas ─────────────────────────────────────────────────────────
function Problems() {
  const itens = [
    {
      icon: AlertTriangle,
      title: 'Caixa que não fecha',
      text: 'Diferença entre caixa físico e sistema toda semana, sem ninguém saber a causa.',
    },
    {
      icon: Activity,
      title: 'Margem invisível',
      text: 'Você sabe quanto vendeu — mas não quanto sobrou. Combustível, conveniência e automotivos misturam.',
    },
    {
      icon: Clock,
      title: 'Conciliação manual',
      text: 'Equipe gastando dias batendo extrato com sistema, planilhas e notas. Sempre atrasado.',
    },
    {
      icon: TrendingDown,
      title: 'Decisões no escuro',
      text: 'Sem DRE confiável, sem fluxo de caixa real, gestor decide preço e investimento na intuição.',
    },
  ];
  return (
    <section className="px-6 py-24 relative">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.6 }}
          className="max-w-2xl mb-14"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-violet-300 mb-3">
            Quase todo posto sofre disso
          </p>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
            Vender muito não significa <span className="text-slate-400">lucrar muito.</span>
          </h2>
          <p className="mt-5 text-slate-400 text-[15px] leading-relaxed">
            A maioria dos postos opera sem visibilidade real do resultado. O dinheiro entra, o dinheiro sai —
            mas o que sobrou no fim do mês é quase sempre uma surpresa. Não precisa ser assim.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {itens.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-violet-400/30 hover:bg-white/[0.04] transition-all"
            >
              <div className="h-10 w-10 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <it.icon className="h-4.5 w-4.5 text-red-300" />
              </div>
              <h3 className="text-[15px] font-semibold text-white mb-1.5">{it.title}</h3>
              <p className="text-[13px] text-slate-400 leading-relaxed">{it.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Serviços ──────────────────────────────────────────────────────────
function Services() {
  const blocos = [
    {
      icon: Briefcase,
      tag: '01 / Consultoria',
      title: 'Estruturação e treinamento financeiro',
      desc: 'Implantamos os processos e capacitamos sua equipe para que o financeiro funcione mesmo quando você não está no posto.',
      bullets: [
        'Mapeamento completo dos processos atuais',
        'Manuais e rotinas operacionais documentadas',
        'Treinamento da equipe em sistema de gestão',
        'Implantação de KPIs operacionais e financeiros',
      ],
      accent: 'bg-violet-600',
      glow: 'shadow-violet-500/20',
    },
    {
      icon: Database,
      tag: '02 / BPO Financeiro',
      title: 'Terceirização das rotinas que travam o seu dia',
      desc: 'Cuidamos da operação financeira de ponta a ponta. Você ganha previsibilidade, nós garantimos a execução.',
      bullets: [
        'Fechamento diário de caixa por turno',
        'Conciliação bancária automatizada',
        'Contas a pagar e receber em dia',
        'Validação e classificação de OFX',
      ],
      accent: 'bg-cyan-600',
      glow: 'shadow-cyan-500/20',
    },
    {
      icon: Sparkles,
      tag: '03 / Relatórios Inteligentes',
      title: 'Dados que viram decisão — com IA explicando o porquê',
      desc: 'DRE, fluxo de caixa, análise comercial e diagnósticos com Claude Opus. Você vê o número e já entende a causa.',
      bullets: [
        'DRE gerencial mensal por máscara configurada',
        'Fluxo de caixa por grupo e tendência 6 meses',
        'Análise comercial por categoria e produto',
        'Insights estratégicos automatizados (IA)',
      ],
      accent: 'bg-emerald-600',
      glow: 'shadow-emerald-500/20',
    },
  ];

  return (
    <section id="serviços" className="px-6 py-24 relative">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}
          className="max-w-2xl mb-16"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300 mb-3">
            Como entregamos resultado
          </p>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
            Três frentes, uma só missão:{' '}
            <span className="text-violet-300">
              colocar seu posto no lucro real.
            </span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {blocos.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className={`group relative rounded-2xl border border-white/10 bg-white/[0.03] p-7 overflow-hidden transition-all hover:border-white/20 hover:shadow-2xl ${b.glow}`}
            >
              {/* Glow lateral */}
              <div className={`absolute -top-32 -right-32 h-64 w-64 rounded-full ${b.accent} opacity-10 blur-3xl group-hover:opacity-20 transition-opacity`} />

              <div className="relative">
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${b.accent} mb-5 shadow-lg`}>
                  <b.icon className="h-5 w-5 text-white" />
                </div>
                <p className="text-[10.5px] uppercase tracking-[0.18em] text-slate-500 mb-2">{b.tag}</p>
                <h3 className="text-xl font-semibold text-white tracking-tight mb-3 leading-snug">{b.title}</h3>
                <p className="text-[13.5px] text-slate-400 leading-relaxed mb-6">{b.desc}</p>

                <ul className="space-y-2.5">
                  {b.bullets.map((bl, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-[13px] text-slate-300">
                      <span className={`mt-0.5 h-4 w-4 rounded-full ${b.accent} flex items-center justify-center flex-shrink-0`}>
                        <Check className="h-2.5 w-2.5 text-white" />
                      </span>
                      <span>{bl}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Diferenciais ──────────────────────────────────────────────────────
function Differentials() {
  const itens = [
    { icon: Fuel, title: 'Setor postos exclusivo', desc: 'Atendemos só postos. Conhecemos cada centavo de margem em combustível, automotivos e conveniência.' },
    { icon: Bot, title: 'IA com contexto real', desc: 'Claude Opus integrado aos seus dados — explica margem, sugere preço, alerta combustível em queda.' },
    { icon: ShieldCheck, title: 'Dados auditáveis', desc: 'Cada número do relatório tem rastro até a venda original. Nada de planilha "mágica".' },
    { icon: Zap, title: 'Integração Webposto / Quality', desc: 'Conectamos via API direto com o seu sistema. Zero retrabalho de digitação.' },
    { icon: Users2, title: 'Equipe dedicada', desc: 'Consultor financeiro fixo + analista BPO. Você sabe com quem fala todo dia.' },
    { icon: Target, title: 'Foco em margem real', desc: 'Não vendemos relatório bonito. Vendemos clareza para mover o ponteiro do lucro.' },
  ];

  return (
    <section id="diferenciais" className="px-6 py-24 relative">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-fuchsia-300 mb-3">Por que CCI</p>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
            Construído por quem vive postos.{' '}
            <span className="text-slate-400">Não por consultoria genérica.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-2xl overflow-hidden border border-white/10 bg-white/[0.04]">
          {itens.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
              viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }}
              className="bg-[#0a0d18] p-7 hover:bg-[#0d111e] transition-colors"
            >
              <div className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <it.icon className="h-4 w-4 text-violet-300" />
              </div>
              <h3 className="text-[15px] font-semibold text-white mb-1.5">{it.title}</h3>
              <p className="text-[13px] text-slate-400 leading-relaxed">{it.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Resultados / Números ──────────────────────────────────────────────
function Results() {
  const numeros = [
    { valor: '+25%', label: 'Em margem líquida média', sub: 'em 6 meses de operação' },
    { valor: '95%', label: 'De redução em erros de caixa', sub: 'após 60 dias de BPO' },
    { valor: '7x', label: 'Mais rápido para fechar o mês', sub: 'do dia 15 para D+2' },
    { valor: '100%', label: 'Conciliação automatizada', sub: 'extrato vs sistema vs OFX' },
  ];
  return (
    <section id="resultados" className="px-6 py-24 relative">
      <div className="max-w-6xl mx-auto">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 sm:p-14 relative overflow-hidden">
          <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />

          <div className="relative">
            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="max-w-2xl mb-12"
            >
              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300 mb-3">O resultado em números</p>
              <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
                Postos que viraram a chave{' '}
                <span className="text-emerald-300">
                  e nunca mais voltaram.
                </span>
              </h2>
            </motion.div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {numeros.map((n, i) => (
                <motion.div
                  key={n.label}
                  initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="relative pl-5 border-l border-white/10"
                >
                  <p className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
                    {n.valor}
                  </p>
                  <p className="mt-2 text-[14px] font-medium text-slate-200">{n.label}</p>
                  <p className="mt-1 text-[12px] text-slate-500">{n.sub}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Showcase do dashboard ─────────────────────────────────────────────
function DashboardShowcase() {
  const features = [
    { icon: FileBarChart, title: 'DRE gerencial', desc: 'Por máscara configurada, com YoY e tendência.' },
    { icon: Wallet, title: 'Fluxo de caixa', desc: 'Por grupo, com saldo inicial real do período.' },
    { icon: BarChart3, title: 'Análise comercial', desc: 'Combustível por tipo, automotivos e conveniência.' },
    { icon: PieChart, title: 'Mix de receita', desc: 'Categoria, grupo, produto — granularidade total.' },
    { icon: LineChart, title: 'Tendência 6 meses', desc: 'Direção real, sem ruído de mês ruim isolado.' },
    { icon: Bot, title: 'Diagnóstico IA', desc: 'Claude integrado: vê, interpreta e recomenda.' },
  ];

  return (
    <section id="plataforma" className="px-6 py-24 relative">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}
          className="max-w-2xl mb-14"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-violet-300 mb-3">A plataforma</p>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
            Um portal. Toda a saúde financeira do seu posto{' '}
            <span className="text-slate-400">em tempo real.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* Mockup grande */}
          <div className="lg:col-span-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7 }}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 shadow-2xl shadow-violet-500/10"
            >
              <div className="rounded-xl overflow-hidden bg-[#0b0f1c]">
                {/* Cabeçalho fake */}
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0d18]">
                  <div>
                    <p className="text-[12px] font-semibold text-slate-100">Auto Posto Vista Verde · DRE Gerencial</p>
                    <p className="text-[10px] text-slate-500">Março/2026 · Comparado com Março/2025</p>
                  </div>
                  <span className="text-[10px] text-emerald-300 inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Atualizado
                  </span>
                </div>
                {/* Conteúdo */}
                <div className="p-5 space-y-3">
                  {[
                    { label: 'Receita bruta', val: 'R$ 4.187.230', pct: '+12,4%', up: true },
                    { label: 'CMV', val: 'R$ 3.348.290', pct: '+9,1%', up: false },
                    { label: 'Lucro bruto', val: 'R$ 838.940', pct: '+27,8%', up: true, hi: true },
                    { label: 'Despesas operacionais', val: 'R$ 412.118', pct: '+3,2%', up: false },
                    { label: 'Lucro líquido', val: 'R$ 326.842', pct: '+44,1%', up: true, hi: true },
                  ].map((row) => (
                    <div key={row.label} className={`flex items-center justify-between py-2 px-3 rounded-lg ${row.hi ? 'bg-violet-500/10 border border-violet-500/20' : 'border border-white/[0.04]'}`}>
                      <span className={`text-[12.5px] ${row.hi ? 'font-semibold text-white' : 'text-slate-300'}`}>{row.label}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-[13px] font-mono tabular-nums ${row.hi ? 'text-white' : 'text-slate-200'}`}>{row.val}</span>
                        <span className={`text-[11px] font-mono tabular-nums w-14 text-right ${row.up ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {row.up ? '↑ ' : '↓ '}{row.pct}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Lista de features ao lado */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.06 }}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.05] transition-colors"
              >
                <div className="h-8 w-8 rounded-lg bg-violet-500/15 flex items-center justify-center mb-3">
                  <f.icon className="h-4 w-4 text-violet-300" />
                </div>
                <p className="text-[13px] font-semibold text-white mb-1">{f.title}</p>
                <p className="text-[11.5px] text-slate-400 leading-snug">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Depoimentos ──────────────────────────────────────────────────────
function Testimonials() {
  const itens = [
    {
      texto: 'Em 4 meses paramos de operar no escuro. Pela primeira vez sei exatamente quanto cada combustível dá de margem por litro — e já remarcamos preço com base nisso.',
      autor: 'Ricardo M.',
      cargo: 'Proprietário · Rede com 3 postos',
    },
    {
      texto: 'O BPO da CCI assumiu a conciliação bancária que tomava 2 dias da minha financeira. Hoje fecho o caixa diário antes do almoço. Só isso já pagou a consultoria.',
      autor: 'Camila R.',
      cargo: 'Gestora financeira · Posto regional',
    },
    {
      texto: 'A análise da IA pegou um produto da conveniência que estava com margem caindo havia 3 meses sem ninguém perceber. Ajustamos o fornecedor — pequeno produto, R$ 18 mil/ano.',
      autor: 'Eduardo F.',
      cargo: 'Diretor · Grupo de 5 postos',
    },
  ];
  return (
    <section id="depoimentos" className="px-6 py-24 relative">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}
          className="max-w-2xl mb-14"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300 mb-3">Quem já usa</p>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
            Empresários de postos que decidiram <span className="text-slate-400">parar de adivinhar.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {itens.map((d, i) => (
            <motion.figure
              key={d.autor}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col"
            >
              <div className="flex items-center gap-1 mb-4 text-amber-300">
                {[...Array(5)].map((_, k) => <Star key={k} className="h-3.5 w-3.5 fill-current" />)}
              </div>
              <blockquote className="text-[14px] text-slate-200 leading-relaxed flex-1">
                "{d.texto}"
              </blockquote>
              <figcaption className="mt-5 pt-5 border-t border-white/[0.06] flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-violet-600 flex items-center justify-center text-white text-[12px] font-semibold">
                  {d.autor.charAt(0)}
                </div>
                <div className="leading-tight">
                  <p className="text-[13px] font-semibold text-white">{d.autor}</p>
                  <p className="text-[11px] text-slate-500">{d.cargo}</p>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA Final ─────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section id="cta" className="px-6 py-24 relative">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.7 }}
          className="relative rounded-3xl overflow-hidden border border-white/10 bg-violet-700/25 p-12 sm:p-16 text-center"
        >
          {/* Glow */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-80 w-[800px] rounded-full bg-violet-500/30 blur-3xl" />
            <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 h-80 w-[800px] rounded-full bg-cyan-500/20 blur-3xl" />
          </div>
          {/* Pattern de fundo */}
          <div
            className="absolute inset-0 -z-10 opacity-[0.05]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '32px 32px',
            }}
          />

          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium text-slate-100 backdrop-blur mb-6">
            <Sparkles className="h-3 w-3 text-cyan-300" />
            Diagnóstico financeiro gratuito · Setor postos
          </span>

          <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05] max-w-3xl mx-auto">
            Pronto para parar de tomar decisões <span className="text-slate-300">no escuro?</span>
          </h2>
          <p className="mt-6 text-[16px] text-slate-300 max-w-xl mx-auto leading-relaxed">
            Em 30 minutos analisamos a saúde financeira do seu posto e mostramos
            onde está o lucro escondido. Sem custo, sem compromisso.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="#"
              className="group relative inline-flex items-center gap-2 rounded-full bg-violet-600 px-7 py-4 text-[14.5px] font-semibold text-white shadow-2xl shadow-violet-500/40 hover:shadow-violet-500/60 transition-all hover:scale-[1.02]">
              <span className="absolute inset-0 rounded-full bg-violet-500 opacity-0 group-hover:opacity-100 blur-md transition-opacity -z-10" />
              Agendar diagnóstico gratuito
              <ArrowUpRight className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
            <a href="https://wa.me/5500000000000" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-4 text-[14.5px] font-medium text-white hover:bg-white/10 transition-all backdrop-blur">
              Falar no WhatsApp
              <Phone className="h-4 w-4" />
            </a>
          </div>

          <p className="mt-8 text-[12px] text-slate-400">
            Resposta em até 24h úteis · Sigilo total das informações
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="px-6 pt-16 pb-10 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white font-bold text-sm shadow-lg shadow-violet-500/30">
                C
              </span>
              <div className="leading-none">
                <p className="text-[15px] font-semibold tracking-tight">CCI</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Consultoria Inteligente</p>
              </div>
            </div>
            <p className="text-[13px] text-slate-400 leading-relaxed max-w-md">
              Consultoria, BPO financeiro e relatórios inteligentes especializados em postos
              de combustível. Tecnologia, dados e gente para colocar o seu negócio no lucro real.
            </p>
            <div className="mt-5 flex items-center gap-4 text-[12px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> contato@cci-consultoria.com.br</span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-[12px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> (00) 0000-0000</span>
            </div>
          </div>

          <FooterCol titulo="Serviços" links={[
            ['Consultoria', '#serviços'],
            ['BPO Financeiro', '#serviços'],
            ['Relatórios IA', '#serviços'],
            ['Plataforma', '#plataforma'],
          ]} />
          <FooterCol titulo="Empresa" links={[
            ['Sobre', '#'],
            ['Diferenciais', '#diferenciais'],
            ['Resultados', '#resultados'],
            ['Casos', '#depoimentos'],
          ]} />
          <FooterCol titulo="Acesso" links={[
            ['Portal Admin', '/admin'],
            ['Portal Cliente', '/cliente/login'],
            ['Suporte', '#'],
          ]} />
        </div>

        <div className="pt-8 border-t border-white/[0.05] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[11.5px] text-slate-500">
          <p>
            © {new Date().getFullYear()} CCI Assessoria e Consultoria Inteligente Ltda · CNPJ 57.268.175/0001-00
          </p>
          <div className="flex items-center gap-5">
            <a href="#" className="hover:text-slate-300 transition-colors">Privacidade</a>
            <a href="#" className="hover:text-slate-300 transition-colors">Termos</a>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sistemas operando
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ titulo, links }) {
  return (
    <div className="md:col-span-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">{titulo}</p>
      <ul className="space-y-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            {href.startsWith('/') ? (
              <Link to={href} className="text-[13px] text-slate-300 hover:text-white transition-colors">
                {label}
              </Link>
            ) : (
              <a href={href} className="text-[13px] text-slate-300 hover:text-white transition-colors">
                {label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
