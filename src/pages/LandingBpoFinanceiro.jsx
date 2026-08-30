// Landing page de VENDAS — BPO Financeiro para postos de combustível.
//
// Território emocional (campanha): DEPENDÊNCIA → CONTROLE → LIBERDADE.
// Não é mais uma página institucional: é um funil de conversão. Reusa o design
// system da landing principal (fundo #070912, teal como cor de marca — as classes
// `blue-*` estão remapeadas para teal em index.css —, dourado/âmbar, Sora em
// .font-display) e a infra de contato (cciContatoService: WhatsApp/e-mail).
//
// Captação: WhatsApp/e-mail (sem backend novo). Provas: placeholders honestos,
// prontos pra receber cases reais. Analytics: só pontos de evento em
// window.dataLayer (page_view, cta_click, whatsapp_click, scroll_50/90) — plugar
// GA4/Pixel depois é só consumir o dataLayer.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowUpRight, ArrowLeft, ArrowLeftRight, Check, Fuel, ShieldCheck,
  Sparkles, Wallet, Database, Bot, AlertTriangle, Clock, Users2, Phone, Mail,
  ChevronRight, ChevronDown, MessageCircle, X, Loader2, Plane, Moon, KeyRound,
  ListChecks, Repeat, Eye, Lock, FileText, UserX, CreditCard, Banknote, Landmark,
  Gauge, Layers, HelpCircle,
} from 'lucide-react';
import * as cciContatoService from '../services/cciContatoService';
import { initPixel, pixelPageView, pixelTrack, pixelTrackCustom } from '../lib/metaPixel';

// ─── Analytics (dataLayer + Meta Pixel) ──────────────────────────────────
// Empurra todo evento pro dataLayer (GA4/GTM plugam depois) e mapeia os de
// conversão pro Meta Pixel: contato (WhatsApp/e-mail) = Lead; abrir CTA = custom.
function track(event, props = {}) {
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, pagina: 'bpo-financeiro', ...props });
  } catch { /* noop */ }
  try {
    if (event === 'whatsapp_click' || event === 'email_click') pixelTrack('Lead', props);
    else if (event === 'cta_click') pixelTrackCustom('CTAClick', props);
  } catch { /* noop */ }
}

// Mensagem padrão que vai pré-preenchida no WhatsApp/e-mail desta LP.
const MSG_CONTATO = 'Olá! Vim da página de BPO Financeiro e quero organizar o financeiro do meu posto sem depender de uma única pessoa.';

// Custom event pra abrir o modal de contato de qualquer CTA (sem prop drilling).
const EV_ABRIR = 'cci:bpo-abrir-contato';
function abrirContato(origem) {
  track('cta_click', { origem });
  window.dispatchEvent(new CustomEvent(EV_ABRIR, { detail: { origem } }));
}

export default function LandingBpoFinanceiro() {
  // SEO por rota (SPA não tem head por página): seta title + metas na montagem.
  useEffect(() => {
    const titleAntigo = document.title;
    document.title = 'BPO Financeiro para Postos de Combustível | CCI';
    const metas = [
      ['name', 'description', 'A CCI assume a rotina financeira do seu posto — fechamento de caixa, conciliação, contas e fluxo de caixa — com processo e conferência. Seu posto funciona mesmo quando você não está lá.'],
      ['property', 'og:title', 'BPO Financeiro para Postos de Combustível | CCI'],
      ['property', 'og:description', 'Pare de depender de uma única pessoa para controlar o financeiro do seu posto. Processo, conferência e visibilidade — para você ter controle sem executar tudo.'],
      ['property', 'og:type', 'website'],
    ];
    const criados = metas.map(([attr, key, val]) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      const jaExistia = !!el;
      const valAntigo = el?.getAttribute('content');
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute('content', val);
      return { el, jaExistia, valAntigo };
    });
    // Meta Pixel: carrega só aqui (página pública de campanha) e registra a visita.
    initPixel();
    pixelPageView();
    track('page_view');
    return () => {
      document.title = titleAntigo;
      criados.forEach(({ el, jaExistia, valAntigo }) => {
        if (jaExistia) el.setAttribute('content', valAntigo ?? '');
        else el.remove();
      });
    };
  }, []);

  // Profundidade de scroll (dispara 1x cada).
  useEffect(() => {
    const marcos = { 50: false, 90: false };
    const onScroll = () => {
      const h = document.documentElement;
      const pct = (h.scrollTop + window.innerHeight) / h.scrollHeight * 100;
      if (!marcos[50] && pct >= 50) { marcos[50] = true; track('scroll_50'); }
      if (!marcos[90] && pct >= 90) { marcos[90] = true; track('scroll_90'); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#070912] text-slate-100 antialiased overflow-x-hidden selection:bg-emerald-500/30 selection:text-white pb-20 md:pb-0">
      <BackgroundFx />
      <Navbar />
      <Hero />
      <Reconhecimento />
      <ProblemaNaoPessoa />
      <CustoDependencia />
      <Transformacao />
      <ServicosBpo />
      <EspecializacaoPostos />
      <IntegracaoSistemas />
      <Implantacao />
      <Liberdade />
      <Prova />
      <Objecoes />
      <Faq />
      <CtaFinal />
      <Footer />
      <BarraFlutuanteMobile />
      <ModalContato />
    </div>
  );
}

// ─── Fundo (auroras + vinheta) — mesmo vocabulário da landing ────────────
function BackgroundFx() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 left-1/2 h-[640px] w-[1200px] -translate-x-1/2 rounded-full bg-emerald-600/20 blur-[140px]" />
      <div className="absolute top-[30%] -right-40 h-[500px] w-[700px] rounded-full bg-blue-500/15 blur-[140px]" />
      <div className="absolute top-[65%] -left-40 h-[500px] w-[700px] rounded-full bg-amber-500/10 blur-[150px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(7,9,18,0.55)_70%,_#070912_100%)]" />
    </div>
  );
}

// ─── Navbar ──────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'O problema', href: '#problema' },
    { label: 'A solução', href: '#solucao' },
    { label: 'Especialização', href: '#postos' },
    { label: 'Dúvidas', href: '#faq' },
  ];

  return (
    <header className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
      scrolled ? 'backdrop-blur-xl bg-[#070912]/75 border-b border-white/5 py-3' : 'bg-transparent py-5'
    }`}>
      <div className="max-w-7xl mx-auto px-5 sm:px-6 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-3">
          <img src="/logo-cci-landing.png" alt="CCI" className="h-9 w-auto object-contain" draggable={false} />
          <span className="hidden sm:block h-7 w-px bg-slate-600 self-center" />
          <div className="hidden sm:block leading-tight text-slate-400 text-[10px] uppercase tracking-widest self-center">
            <p>BPO Financeiro</p>
            <p>para Postos</p>
          </div>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {links.map(l => (
            <a key={l.href} href={l.href} className="text-[13px] text-slate-300 hover:text-white transition-colors relative group">
              {l.label}
              <span className="absolute -bottom-1 left-0 right-0 h-px bg-emerald-500 scale-x-0 group-hover:scale-x-100 origin-left transition-transform" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/" className="hidden sm:inline-flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white transition-colors px-3 py-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Site
          </Link>
          <button type="button" onClick={() => abrirContato('navbar')}
            className="group inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:scale-[1.02]">
            Falar com a CCI
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────
function Hero() {
  const { scrollYProgress } = useScroll();
  const yCard = useTransform(scrollYProgress, [0, 0.3], [0, -60]);

  return (
    <section id="top" className="relative pt-32 sm:pt-36 pb-20 px-5 sm:px-6 overflow-hidden">
      <VideoBg />
      <div className="relative z-10 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            BPO financeiro exclusivo para postos de combustível
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05 }}
          className="font-display text-center text-[34px] xs:text-[38px] sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[1.06] max-w-5xl mx-auto"
        >
          Se só uma pessoa entende o financeiro do seu posto,{' '}
          <span className="text-emerald-300">você não tem controle.</span>{' '}
          <span className="text-slate-400">Tem dependência.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-7 text-center text-[16px] sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed"
        >
          A CCI assume a rotina financeira do seu posto — fechamento de caixa, conciliação,
          contas e fluxo de caixa — com processo, conferência e visibilidade. Para o posto
          funcionar mesmo quando você não está lá.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <button type="button" onClick={() => abrirContato('hero')}
            className="group relative inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-emerald-600 px-7 py-4 text-[15px] font-semibold text-white shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:scale-[1.02]">
            <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-0 group-hover:opacity-100 blur-md transition-opacity -z-10" />
            Quero o controle de volta
            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <a href="#problema" onClick={() => track('cta_click', { origem: 'hero_secundario' })}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-7 py-4 text-[15px] font-medium text-slate-200 hover:bg-white/[0.06] hover:border-white/20 transition-all">
            Ver como funciona
            <ChevronRight className="h-4 w-4" />
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
          className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-slate-500"
        >
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Você não troca de sistema</span>
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Setor postos exclusivo</span>
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Sigilo total dos números</span>
        </motion.div>

        {/* Visual-metáfora da dependência */}
        <motion.div style={{ y: yCard }} initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4 }} className="mt-16 max-w-3xl mx-auto">
          <HeroDependenciaCard />
        </motion.div>
      </div>
    </section>
  );
}

function VideoBg() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <video autoPlay loop muted playsInline preload="auto"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full min-w-full min-h-full object-cover opacity-[0.35]">
        <source src="/videos/mixkit-reflection-of-a-screen-in-glasses.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-0 bg-[#070912]/30" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-[#070912]" />
    </div>
  );
}

function HeroDependenciaCard() {
  return (
    <div className="relative">
      <div className="absolute -inset-x-16 -inset-y-8 -z-10 bg-emerald-500/10 blur-3xl rounded-[50%]" />
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <div className="rounded-xl overflow-hidden bg-[#0b0f1c] border border-white/[0.06]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-[#0a0d18]">
            <FileText className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] text-slate-500">fechamento-caixa-JULHO-final-v3-USAR-ESSE.xlsx</span>
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-300/80">
              <Lock className="h-3 w-3" /> 1 pessoa
            </span>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-[13px] text-slate-400 mb-4">Quem consegue abrir, entender e fechar isto hoje?</p>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-400/25 px-3 py-1.5">
                <span className="h-6 w-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[11px] font-semibold">1</span>
                <span className="text-[12.5px] text-emerald-200">A pessoa do financeiro</span>
              </div>
              {['Você', 'Sócio', 'Gerente', 'Substituto'].map(n => (
                <div key={n} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] border border-white/10 px-3 py-1.5 text-slate-500">
                  <UserX className="h-3.5 w-3.5 text-red-400/70" />
                  <span className="text-[12.5px]">{n}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2 text-[12px] text-amber-200/90 bg-amber-500/[0.06] border border-amber-400/15 rounded-lg px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-300" />
              Se ela sair de férias, adoecer ou pedir demissão, seu financeiro para junto.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Seção wrapper util ──────────────────────────────────────────────────
function SectionHead({ tag, children, sub, center, tagColor = 'text-emerald-300' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.6 }}
      className={`${center ? 'text-center mx-auto' : ''} max-w-3xl mb-12 sm:mb-14`}
    >
      {tag && <p className={`text-[11px] uppercase tracking-[0.2em] ${tagColor} mb-3`}>{tag}</p>}
      <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">{children}</h2>
      {sub && <p className="mt-5 text-slate-400 text-[15px] leading-relaxed">{sub}</p>}
    </motion.div>
  );
}

// ─── 2. Reconhecimento (perguntas-espelho) ───────────────────────────────
function Reconhecimento() {
  const perguntas = [
    { icon: Phone, t: 'Você liga pra alguém pra saber como fechou o caixa de ontem?' },
    { icon: UserX, t: 'Se essa pessoa faltar amanhã, alguém continua o trabalho do jeito certo?' },
    { icon: FileText, t: 'Você ainda recebe planilha pra descobrir o que aconteceu no seu próprio posto?' },
    { icon: Moon, t: 'Já passou da meia-noite conferindo número que deveria chegar pronto?' },
    { icon: AlertTriangle, t: 'Já apareceu diferença no caixa que ninguém soube explicar?' },
    { icon: Eye, t: 'Você confere tudo pessoalmente porque não confia que sairia certo sem você?' },
  ];
  return (
    <section id="problema" className="px-5 sm:px-6 py-20 sm:py-24 relative scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <SectionHead tag="Provavelmente isto é você"
          sub="Se você respondeu “sim” pra uma dessas, o problema não é falta de trabalho. É falta de processo.">
          Vender combustível o dia inteiro <span className="text-slate-400">não é o mesmo que</span> ter o controle do dinheiro.
        </SectionHead>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {perguntas.map((p, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }} transition={{ duration: 0.45, delay: (i % 3) * 0.08 }}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-emerald-400/30 hover:bg-white/[0.04] transition-all">
              <div className="h-10 w-10 rounded-xl bg-red-500/12 border border-red-500/20 flex items-center justify-center mb-4">
                <p.icon className="h-4.5 w-4.5 text-red-300" />
              </div>
              <p className="text-[14.5px] text-slate-200 leading-snug font-medium">{p.t}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 3. O problema não é a pessoa ────────────────────────────────────────
function ProblemaNaoPessoa() {
  const cadeiaRuim = [
    { icon: Users2, t: 'Uma pessoa' },
    { icon: KeyRound, t: 'O conhecimento na cabeça dela' },
    { icon: FileText, t: 'Planilhas que só ela entende' },
    { icon: Repeat, t: 'Rotina que depende dela' },
    { icon: Lock, t: 'Dependência' },
  ];
  const cadeiaBoa = [
    { icon: ListChecks, t: 'Processo documentado' },
    { icon: Layers, t: 'Padronização' },
    { icon: ShieldCheck, t: 'Conferência' },
    { icon: Gauge, t: 'Controle' },
    { icon: Eye, t: 'Visibilidade' },
  ];
  return (
    <section className="px-5 sm:px-6 py-20 sm:py-24 relative">
      <div className="max-w-5xl mx-auto">
        <SectionHead center tag="Vamos ser justos"
          sub="Não é sobre confiança e nem sobre competência. O risco é o financeiro morar dentro da cabeça de uma pessoa — em vez de viver num processo que qualquer um consegue seguir e auditar.">
          O problema <span className="text-emerald-300">não é a pessoa.</span> É o processo depender dela.
        </SectionHead>

        <div className="grid md:grid-cols-2 gap-5">
          <CadeiaCard titulo="Como está hoje" tom="ruim" itens={cadeiaRuim} />
          <CadeiaCard titulo="Como deveria ser" tom="bom" itens={cadeiaBoa} />
        </div>
      </div>
    </section>
  );
}

function CadeiaCard({ titulo, tom, itens }) {
  const bom = tom === 'bom';
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5 }}
      className={`rounded-2xl border p-6 sm:p-7 ${bom ? 'border-emerald-400/25 bg-emerald-500/[0.04]' : 'border-red-400/20 bg-red-500/[0.03]'}`}
    >
      <p className={`text-[11px] uppercase tracking-[0.18em] mb-5 ${bom ? 'text-emerald-300' : 'text-red-300'}`}>{titulo}</p>
      <ul className="space-y-2.5">
        {itens.map((it, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${bom ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/12 text-red-300'}`}>
              <it.icon className="h-4 w-4" />
            </span>
            <span className="text-[14px] text-slate-200">{it.t}</span>
            {i < itens.length - 1 && <ChevronRight className={`h-3.5 w-3.5 ml-auto ${bom ? 'text-emerald-500/40' : 'text-red-500/40'}`} />}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

// ─── 4. O custo da dependência ───────────────────────────────────────────
function CustoDependencia() {
  const custos = [
    { icon: Moon, t: 'Suas noites', d: 'Você termina o dia conferindo número em vez de descansar. O “segundo turno” é seu, todo dia.' },
    { icon: Plane, t: 'Suas férias', d: 'Não dá pra sumir uma semana. O negócio depende da sua presença física pra não travar.' },
    { icon: UserX, t: 'Um risco de saída', d: 'Se a pessoa-chave sai, vai embora com o conhecimento. E ninguém sabe como as coisas eram feitas.' },
    { icon: AlertTriangle, t: 'Erros invisíveis', d: 'Diferença de caixa, taxa de cartão errada, boleto pago duas vezes — descobre tarde ou nunca.' },
    { icon: Repeat, t: 'Retrabalho', d: 'A mesma informação digitada em três lugares. Sempre atrasado, sempre “quase” pronto.' },
    { icon: Eye, t: 'Decisão no escuro', d: 'Sem fluxo de caixa e DRE confiáveis, preço e investimento viram aposta, não conta.' },
  ];
  return (
    <section className="px-5 sm:px-6 py-20 sm:py-24 relative">
      <div className="max-w-6xl mx-auto">
        <SectionHead tag="O que isso custa" tagColor="text-amber-300"
          sub="Depender de uma pessoa parece barato — até você somar o que você paga em tempo, risco e noites perdidas.">
          A dependência tem um preço. <span className="text-slate-400">Você só não vê ele na fatura.</span>
        </SectionHead>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {custos.map((c, i) => (
            <motion.div key={c.t}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }} transition={{ duration: 0.45, delay: (i % 3) * 0.08 }}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="h-10 w-10 rounded-xl bg-amber-500/12 border border-amber-500/20 flex items-center justify-center mb-4">
                <c.icon className="h-4.5 w-4.5 text-amber-300" />
              </div>
              <h3 className="text-[15px] font-semibold text-white mb-1.5">{c.t}</h3>
              <p className="text-[13px] text-slate-400 leading-relaxed">{c.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 5. Transformação ANTES → DEPOIS ─────────────────────────────────────
function Transformacao() {
  const antes = ['Planilhas que só uma pessoa entende', 'Fechamento manual, tarde da noite', 'Retrabalho e digitação em duplicidade', 'Dúvida sobre o que é lucro de verdade', 'Diferenças sem explicação', 'Negócio que trava sem você'];
  const depois = ['Processo padronizado e documentado', 'Rotina financeira que roda sozinha', 'Informação conferida chegando pronta', 'DRE e fluxo de caixa confiáveis', 'Inconsistências identificadas na hora', 'Posto que funciona mesmo sem você'];
  return (
    <section id="solucao" className="px-5 sm:px-6 py-20 sm:py-24 relative scroll-mt-20">
      <div className="max-w-5xl mx-auto">
        <SectionHead center tag="A virada"
          sub="A CCI não “dá uma olhada” no seu financeiro. Ela assume a rotina e devolve pra você o que importa: controle e clareza.">
          De <span className="text-red-300/90">dependência</span> para <span className="text-emerald-300">controle.</span>
        </SectionHead>
        <div className="grid md:grid-cols-2 gap-5 items-stretch">
          <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.03] p-6 sm:p-8">
            <p className="text-[11px] uppercase tracking-[0.18em] text-red-300 mb-5">Antes</p>
            <ul className="space-y-3">
              {antes.map((t, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px] text-slate-300">
                  <X className="h-4 w-4 text-red-400/70 mt-0.5 flex-shrink-0" /> <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.05] p-6 sm:p-8 overflow-hidden">
            <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl" />
            <p className="relative text-[11px] uppercase tracking-[0.18em] text-emerald-300 mb-5">Depois, com a CCI</p>
            <ul className="relative space-y-3">
              {depois.map((t, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px] text-slate-100">
                  <span className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </span> <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 6. O que a CCI assume (BPO) ─────────────────────────────────────────
function ServicosBpo() {
  const servicos = [
    { icon: Banknote, t: 'Fechamento de caixa', d: 'Por turno, batendo dinheiro, cartão e PIX.' },
    { icon: Landmark, t: 'Conciliação bancária', d: 'Extrato x sistema, todo dia, sem acúmulo.' },
    { icon: CreditCard, t: 'Conciliação de cartões', d: 'Bandeiras, taxas e prazos conferidos ao centavo.' },
    { icon: Wallet, t: 'Contas a pagar', d: 'Vencimentos organizados, nada pago em duplicidade.' },
    { icon: ArrowLeftRight, t: 'Contas a receber', d: 'Recebimentos acompanhados e batidos.' },
    { icon: FileText, t: 'Documentos e notas', d: 'Organização, classificação e lançamento.' },
    { icon: Gauge, t: 'Fluxo de caixa', d: 'Entradas e saídas reais, com saldo confiável.' },
    { icon: Layers, t: 'Informação para DRE', d: 'Dados organizados para o resultado gerencial.' },
    { icon: ListChecks, t: 'Indicadores e inconsistências', d: 'Acompanhamento e alerta do que sai do padrão.' },
  ];
  return (
    <section className="px-5 sm:px-6 py-20 sm:py-24 relative">
      <div className="max-w-6xl mx-auto">
        <SectionHead tag="O que exatamente a gente faz"
          sub="A operação financeira do seu posto, de ponta a ponta — conforme o escopo contratado. Você define até onde vai; a CCI executa.">
          A CCI assume as rotinas que <span className="text-emerald-300">travam o seu dia.</span>
        </SectionHead>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-2xl overflow-hidden border border-white/10 bg-white/[0.04]">
          {servicos.map((s, i) => (
            <motion.div key={s.t}
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
              viewport={{ once: true }} transition={{ duration: 0.4, delay: (i % 3) * 0.05 }}
              className="bg-[#0a0d18] p-6 sm:p-7 hover:bg-[#0d111e] transition-colors">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center mb-4">
                <s.icon className="h-4.5 w-4.5 text-emerald-300" />
              </div>
              <h3 className="text-[15px] font-semibold text-white mb-1.5">{s.t}</h3>
              <p className="text-[13px] text-slate-400 leading-relaxed">{s.d}</p>
            </motion.div>
          ))}
        </div>
        <p className="mt-5 text-center text-[12.5px] text-slate-500">
          O escopo é modular — do fechamento de caixa ao acompanhamento completo. Ajustamos ao tamanho e à realidade da sua operação.
        </p>
      </div>
    </section>
  );
}

// ─── 7. Especialização em postos ─────────────────────────────────────────
function EspecializacaoPostos() {
  const itens = [
    'Alto volume de transações todo dia',
    'Dinheiro, cartão e PIX no mesmo caixa',
    'Sangrias e fechamento por turno',
    'Taxas e prazos de cada bandeira de cartão',
    'Conciliação de combustível, conveniência e automotivos',
    'Margem apertada onde cada centavo conta',
  ];
  return (
    <section id="postos" className="px-5 sm:px-6 py-20 sm:py-24 relative scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-emerald-500/12 blur-3xl" />
          <div className="grid lg:grid-cols-2 gap-10 items-center relative">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300 mb-3">Não é BPO genérico</p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
                A gente não terceiriza conta.{' '}
                <span className="text-slate-400">A gente entende posto.</span>
              </h2>
              <p className="mt-5 text-slate-400 text-[15px] leading-relaxed">
                Um escritório de contabilidade comum não sabe a rotina de um posto. Nós atendemos
                só esse setor — conhecemos a dinâmica de caixa, cartões e combustível de quem vive
                isso todo dia.
              </p>
              <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-400/25 px-4 py-2 text-[13px] text-emerald-200">
                <Fuel className="h-4 w-4" /> Especialistas exclusivos no setor de postos
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-3">
              {itens.map((t, i) => (
                <motion.li key={i}
                  initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.06 }}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5">
                  <ShieldCheck className="h-4.5 w-4.5 text-emerald-300 flex-shrink-0" />
                  <span className="text-[14px] text-slate-200">{t}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 7.1. Integração com o sistema do cliente ────────────────────────────
function IntegracaoSistemas() {
  const sistemas = [
    { logo: '/webposto-logo.png', nome: 'Webposto', d: 'Integração direta com o seu Webposto.' },
    { logo: '/logo-autosystem.png', nome: 'Autosystem', d: 'Conexão com a sua base Autosystem.' },
  ];
  return (
    <section className="px-5 sm:px-6 py-20 sm:py-24 relative">
      <div className="max-w-5xl mx-auto">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative text-center max-w-2xl mx-auto">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300 mb-3">Integração</p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
              Trabalhamos com o sistema que <span className="text-emerald-300">você já usa.</span>
            </h2>
            <p className="mt-5 text-slate-400 text-[15px] leading-relaxed">
              A CCI se integra ao seu ERP — <span className="text-slate-200 font-medium">Webposto</span> ou{' '}
              <span className="text-slate-200 font-medium">Autosystem</span>. Você não troca de sistema, não
              muda a sua operação e não perde histórico. A gente entra na rotina que já existe.
            </p>
          </div>

          <div className="relative mt-9 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {sistemas.map((s, i) => (
              <motion.div key={s.nome}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.1 }}
                className="flex flex-col items-center text-center rounded-2xl border border-white/10 bg-[#0a0d18] px-6 py-7 hover:border-emerald-400/30 transition-colors">
                <div className="flex h-14 items-center justify-center mb-4">
                  <img src={s.logo} alt={s.nome} className="h-11 w-auto max-w-[190px] object-contain" draggable={false} />
                </div>
                <p className="text-[12.5px] text-slate-400 leading-snug">{s.d}</p>
              </motion.div>
            ))}
          </div>

          <p className="relative mt-7 text-center text-[12.5px] text-slate-500 inline-flex items-center justify-center gap-1.5 w-full">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            Conexão segura, com sigilo total dos seus dados.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── 8. Implantação ──────────────────────────────────────────────────────
function Implantacao() {
  const passos = [
    { n: '01', icon: Eye, t: 'Diagnóstico', d: 'Olhamos sua operação atual, entendemos a rotina e onde está a dependência.' },
    { n: '02', icon: ListChecks, t: 'Desenho do processo', d: 'Definimos o que a CCI assume e como cada rotina passa a ser feita e conferida.' },
    { n: '03', icon: Repeat, t: 'Transição', d: 'Assumimos gradualmente, sem parar sua operação e sem trocar o seu sistema.' },
    { n: '04', icon: Gauge, t: 'Operação e acompanhamento', d: 'A rotina roda com conferência, e você recebe a informação organizada pra decidir.' },
  ];
  return (
    <section className="px-5 sm:px-6 py-20 sm:py-24 relative">
      <div className="max-w-6xl mx-auto">
        <SectionHead center tag="Como começa"
          sub="Sem virar o seu posto de cabeça pra baixo. Você continua com o seu sistema; a CCI entra na rotina.">
          Simples de começar. <span className="text-slate-400">Sem trocar o que já funciona.</span>
        </SectionHead>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {passos.map((p, i) => (
            <motion.div key={p.n}
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }} transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <span className="font-display text-4xl font-semibold text-emerald-500/25">{p.n}</span>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center my-4">
                <p.icon className="h-4.5 w-4.5 text-emerald-300" />
              </div>
              <h3 className="text-[15px] font-semibold text-white mb-1.5">{p.t}</h3>
              <p className="text-[13px] text-slate-400 leading-relaxed">{p.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 9. Liberdade do proprietário ────────────────────────────────────────
function Liberdade() {
  return (
    <section className="px-5 sm:px-6 py-20 sm:py-24 relative">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.7 }}
          className="relative rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br from-emerald-900/25 via-[#0b0f1c] to-[#0a0c1a] p-9 sm:p-14">
          <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="relative max-w-2xl">
            <Plane className="h-8 w-8 text-emerald-300 mb-5" />
            <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.08]">
              Tire uma semana de férias. <span className="text-emerald-300">Veja o posto continuar.</span>
            </h2>
            <p className="mt-6 text-[16px] text-slate-300 leading-relaxed">
              Negócio que só roda com você presente não é patrimônio — é emprego. Com o financeiro
              estruturado pela CCI, o caixa fecha, a conciliação acontece e a informação chega pronta,
              mesmo com você longe. Você deixa de ser o funcionário mais importante do seu próprio posto.
            </p>
            <button type="button" onClick={() => abrirContato('liberdade')}
              className="mt-8 group inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 text-[14.5px] font-semibold text-white shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:scale-[1.02]">
              Quero poder sair sem o posto parar
              <ArrowUpRight className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── 10. Prova / autoridade (placeholders honestos e substituíveis) ──────
function Prova() {
  const pilares = [
    { icon: Fuel, t: 'Foco exclusivo em postos', d: 'Toda a nossa operação é dedicada ao setor de combustíveis.' },
    { icon: ShieldCheck, t: 'Rotina com conferência', d: 'Cada rotina é conferida — nada de número “mágico” sem rastro.' },
    { icon: Lock, t: 'Sigilo total', d: 'Seus números são tratados com confidencialidade em todo o processo.' },
    { icon: Bot, t: 'Tecnologia e portal próprios', d: 'Você acompanha a saúde financeira do posto pelo portal da CCI.' },
  ];
  return (
    <section className="px-5 sm:px-6 py-20 sm:py-24 relative">
      <div className="max-w-6xl mx-auto">
        <SectionHead tag="Por que confiar na CCI"
          sub="Autoridade não se declara, se demonstra. Estes são os pilares do nosso trabalho — e aqui é onde entram os cases reais de clientes assim que você quiser divulgá-los.">
          Especialização de verdade, <span className="text-slate-400">não promessa de agência.</span>
        </SectionHead>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pilares.map((p, i) => (
            <motion.div key={p.t}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.08 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <p.icon className="h-4.5 w-4.5 text-emerald-300" />
              </div>
              <h3 className="text-[14.5px] font-semibold text-white mb-1.5">{p.t}</h3>
              <p className="text-[12.5px] text-slate-400 leading-relaxed">{p.d}</p>
            </motion.div>
          ))}
        </div>
        {/* Slot de depoimentos — vazio de propósito até haver cases reais. */}
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-5 text-center">
          <p className="text-[12.5px] text-slate-500">
            Espaço reservado para depoimentos e resultados reais de clientes — prontos para publicar quando você aprovar.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── 11. Objeções ────────────────────────────────────────────────────────
function Objecoes() {
  const objs = [
    { q: '“Vou perder o controle do meu financeiro.”', a: 'O contrário. Hoje o controle está com uma pessoa. Com a CCI, ele vira processo e você passa a enxergar tudo — com mais controle, não menos.' },
    { q: '“Minha funcionária já faz isso.”', a: 'Ótimo — ela ganha um processo e deixa de ser o único ponto de falha. A CCI não substitui pessoas necessariamente; ela tira o financeiro de dentro da cabeça de uma só.' },
    { q: '“Vai dar muito trabalho pra trocar.”', a: 'A transição é gradual e sem parar sua operação. Você não troca de sistema — a CCI entra na rotina que já existe.' },
    { q: '“Vocês vão entender a realidade do meu posto?”', a: 'Atendemos exclusivamente postos. Caixa, cartões, PIX, sangria, turnos e combustível são o nosso dia a dia.' },
    { q: '“Vou precisar mudar meu sistema?”', a: 'Não. Trabalhamos com o que você já usa e nos integramos à sua operação.' },
    { q: '“Como eu vou acompanhar?”', a: 'Pelo portal da CCI e pelos relatórios organizados. Você vê a informação pronta, sem caçar em cinco lugares.' },
  ];
  return (
    <section className="px-5 sm:px-6 py-20 sm:py-24 relative">
      <div className="max-w-5xl mx-auto">
        <SectionHead center tag="O que costuma travar a decisão">
          As dúvidas honestas — <span className="text-slate-400">respondidas sem enrolação.</span>
        </SectionHead>
        <div className="grid md:grid-cols-2 gap-4">
          {objs.map((o, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }} transition={{ duration: 0.45, delay: (i % 2) * 0.08 }}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <p className="text-[14.5px] font-semibold text-white mb-2">{o.q}</p>
              <p className="text-[13.5px] text-slate-400 leading-relaxed">{o.a}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 12. FAQ (accordion) ─────────────────────────────────────────────────
function Faq() {
  const faqs = [
    { q: 'Quanto tempo leva para começar?', a: 'Após o diagnóstico inicial, desenhamos o processo e iniciamos a transição de forma gradual. O ritmo é ajustado à sua operação para não interromper o dia a dia.' },
    { q: 'Preciso trocar meu sistema de gestão?', a: 'Não. A CCI trabalha com o sistema que você já utiliza e se integra à sua rotina atual.' },
    { q: 'Quem fica responsável pelo meu financeiro?', a: 'Você conta com uma equipe da CCI dedicada à sua operação, seguindo um processo documentado — não uma única pessoa insubstituível.' },
    { q: 'Meus números ficam seguros?', a: 'Sim. Trabalhamos com sigilo total das informações em todas as etapas do processo.' },
    { q: 'O serviço serve para rede com vários postos?', a: 'Sim. Atendemos desde um posto até redes, com visão por unidade e consolidada da rede.' },
    { q: 'O que exatamente está incluído?', a: 'O escopo é modular — do fechamento de caixa ao acompanhamento completo do financeiro. Definimos juntos o que a CCI assume, conforme a sua necessidade.' },
  ];
  const [aberto, setAberto] = useState(0);
  return (
    <section id="faq" className="px-5 sm:px-6 py-20 sm:py-24 relative scroll-mt-20">
      <div className="max-w-3xl mx-auto">
        <SectionHead center tag="Perguntas frequentes">
          Ainda com dúvida? <span className="text-slate-400">Comece por aqui.</span>
        </SectionHead>
        <div className="space-y-3">
          {faqs.map((f, i) => {
            const open = aberto === i;
            return (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <button type="button" onClick={() => setAberto(open ? -1 : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4 text-left hover:bg-white/[0.02] transition-colors">
                  <span className="text-[14.5px] font-medium text-white">{f.q}</span>
                  <ChevronDown className={`h-4.5 w-4.5 text-emerald-300 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}>
                      <p className="px-5 sm:px-6 pb-5 text-[13.5px] text-slate-400 leading-relaxed">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── 13. CTA final ───────────────────────────────────────────────────────
function CtaFinal() {
  return (
    <section className="px-5 sm:px-6 py-20 sm:py-24 relative">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.7 }}
          className="relative rounded-3xl overflow-hidden border border-white/10 bg-emerald-700/20 p-10 sm:p-16 text-center">
          <div className="absolute inset-0 -z-10">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-80 w-[800px] rounded-full bg-emerald-500/25 blur-3xl" />
            <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 h-80 w-[800px] rounded-full bg-emerald-500/15 blur-3xl" />
          </div>
          <div className="absolute inset-0 -z-10 opacity-[0.05]"
            style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium text-slate-100 backdrop-blur mb-6">
            <Sparkles className="h-3 w-3 text-emerald-300" /> Conversa inicial sem compromisso · Setor postos
          </span>
          <h2 className="font-display text-3xl sm:text-6xl font-semibold tracking-tight leading-[1.06] max-w-3xl mx-auto">
            Você não comprou um posto pra virar <span className="text-slate-300">o funcionário dele.</span>
          </h2>
          <p className="mt-6 text-[16px] text-slate-300 max-w-xl mx-auto leading-relaxed">
            Fale com a CCI e veja como tirar o financeiro das suas costas — com processo,
            conferência e controle de verdade.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button type="button" onClick={() => abrirContato('cta_final')}
              className="group relative inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-emerald-600 px-8 py-4 text-[15px] font-semibold text-white shadow-2xl shadow-emerald-500/40 hover:shadow-emerald-500/60 transition-all hover:scale-[1.02]">
              <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-0 group-hover:opacity-100 blur-md transition-opacity -z-10" />
              Quero tirar o financeiro das minhas costas
              <ArrowUpRight className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
          <p className="mt-7 text-[12px] text-slate-400">Sigilo total · Sem compromisso · Especialistas em postos</p>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="px-5 sm:px-6 pt-14 pb-10 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-10">
          <div className="md:col-span-6">
            <img src="/logo-cci-landing.png" alt="CCI" className="h-9 w-auto object-contain mb-4" draggable={false} />
            <p className="text-[13px] text-slate-400 leading-relaxed max-w-md">
              BPO financeiro especializado em postos de combustível. Assumimos a rotina financeira
              do seu posto — com processo, conferência e visibilidade — para o negócio funcionar
              mesmo quando você não está lá.
            </p>
            <div className="mt-5 space-y-2 text-[12px] text-slate-500">
              <p className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> contato@cci.app.br</p>
              <p className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> (27) 99925-0088</p>
            </div>
          </div>
          <div className="md:col-span-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">Navegar</p>
            <ul className="space-y-2.5 text-[13px]">
              <li><a href="#problema" className="text-slate-300 hover:text-white transition-colors">O problema</a></li>
              <li><a href="#solucao" className="text-slate-300 hover:text-white transition-colors">A solução</a></li>
              <li><a href="#postos" className="text-slate-300 hover:text-white transition-colors">Especialização</a></li>
              <li><a href="#faq" className="text-slate-300 hover:text-white transition-colors">Dúvidas</a></li>
            </ul>
          </div>
          <div className="md:col-span-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">CCI</p>
            <ul className="space-y-2.5 text-[13px]">
              <li><Link to="/" className="text-slate-300 hover:text-white transition-colors">Site institucional</Link></li>
              <li><Link to="/portais" className="text-slate-300 hover:text-white transition-colors">Acessar portal</Link></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-white/[0.05] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11.5px] text-slate-500">
          <p>© {new Date().getFullYear()} CCI Assessoria e Consultoria Inteligente Ltda · CNPJ 57.268.175/0001-00</p>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Atendimento ativo
          </span>
        </div>
      </div>
    </footer>
  );
}

// ─── Barra flutuante mobile ──────────────────────────────────────────────
function BarraFlutuanteMobile() {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 p-3 bg-gradient-to-t from-[#070912] via-[#070912]/95 to-transparent">
      <button type="button" onClick={() => abrirContato('barra_mobile')}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 text-[15px] font-semibold text-white shadow-xl shadow-emerald-500/40">
        <MessageCircle className="h-4.5 w-4.5" />
        Falar com a CCI
      </button>
    </div>
  );
}

// ─── Modal de contato (WhatsApp / e-mail) — reusa cciContatoService ──────
function ModalContato() {
  const [open, setOpen] = useState(false);
  const [contato, setContato] = useState(null);
  const origemRef = useRef('');
  // Loading é derivado: modal aberto e contato ainda não resolvido (null).
  // Ao terminar, contato vira objeto (ou {} no erro), então !contato = false.
  const loading = open && !contato;

  useEffect(() => {
    const handler = (e) => { origemRef.current = e?.detail?.origem || ''; setOpen(true); };
    window.addEventListener(EV_ABRIR, handler);
    return () => window.removeEventListener(EV_ABRIR, handler);
  }, []);

  useEffect(() => {
    if (!open || contato) return;
    let cancelado = false;
    cciContatoService.obterContato()
      .then(c => { if (!cancelado) setContato(c || {}); })
      .catch(() => { if (!cancelado) setContato({}); });
    return () => { cancelado = true; };
  }, [open, contato]);

  const close = () => setOpen(false);
  const email = contato?.email_contato;
  const whatsapp = contato?.whatsapp_numero;
  const msgWa = contato?.whatsapp_mensagem || MSG_CONTATO;
  const linkEmail = cciContatoService.urlMailto(
    email, 'BPO Financeiro — quero organizar o financeiro do meu posto',
    `${MSG_CONTATO}\n\nNome:\nPosto / rede:\nCidade:\nTelefone:\nMelhor horário para contato:`
  );
  const linkWa = cciContatoService.urlWhatsApp(whatsapp, msgWa);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.22 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f1a17] via-[#0c0e1f] to-[#0a0c1a] backdrop-blur shadow-2xl overflow-hidden">
            <div className="relative px-6 pt-6 pb-4">
              <button onClick={close} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200 mb-3">
                <Sparkles className="h-3 w-3" /> Fale com a CCI
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-white leading-tight">Como você prefere falar com a gente?</h3>
              <p className="text-[13.5px] text-slate-400 mt-2 leading-relaxed">
                Conte rapidamente sobre o seu posto e mostramos como a CCI assume o financeiro
                pra você ter controle sem executar tudo.
              </p>
            </div>

            {loading ? (
              <div className="px-6 pb-7 flex items-center justify-center gap-2 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-sm">Carregando opções...</span>
              </div>
            ) : (
              <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {linkWa ? (
                  <a href={linkWa} target="_blank" rel="noreferrer"
                    onClick={() => { track('whatsapp_click', { origem: origemRef.current }); close(); }}
                    className="group flex flex-col items-start p-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/15 hover:border-emerald-400/50 transition-all">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-400/30 mb-3">
                      <MessageCircle className="h-5 w-5 text-emerald-300" />
                    </div>
                    <p className="text-[14px] font-semibold text-white mb-1">WhatsApp</p>
                    <p className="text-[12px] text-emerald-200/80 leading-snug">Resposta rápida em horário comercial</p>
                    <p className="text-[10.5px] text-emerald-300/70 font-mono mt-2">{cciContatoService.formatarTelefoneBr(whatsapp)}</p>
                  </a>
                ) : <OpcaoIndisponivel label="WhatsApp não configurado" />}

                {linkEmail ? (
                  <a href={linkEmail} onClick={() => { track('email_click', { origem: origemRef.current }); close(); }}
                    className="group flex flex-col items-start p-4 rounded-2xl border border-blue-400/30 bg-blue-500/10 hover:bg-blue-500/15 hover:border-blue-400/50 transition-all">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-400/30 mb-3">
                      <Mail className="h-5 w-5 text-blue-300" />
                    </div>
                    <p className="text-[14px] font-semibold text-white mb-1">E-mail</p>
                    <p className="text-[12px] text-blue-200/80 leading-snug">Detalhe sua necessidade com calma</p>
                    <p className="text-[10.5px] text-blue-300/70 font-mono mt-2 truncate w-full">{email}</p>
                  </a>
                ) : <OpcaoIndisponivel label="E-mail não configurado" />}
              </div>
            )}

            <div className="px-6 pb-6 pt-2 border-t border-white/5">
              <p className="text-[11.5px] text-slate-500 text-center">Sigilo total · Sem compromisso · Setor postos</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function OpcaoIndisponivel({ label }) {
  return (
    <div className="flex flex-col items-start p-4 rounded-2xl border border-white/10 bg-white/[0.02] opacity-60">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 mb-3">
        <AlertTriangle className="h-5 w-5 text-slate-500" />
      </div>
      <p className="text-[13px] font-medium text-slate-400">{label}</p>
    </div>
  );
}
