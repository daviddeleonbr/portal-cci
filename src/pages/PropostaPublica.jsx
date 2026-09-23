// ============================================================
// Página PÚBLICA de proposta — /proposta/:token
//
// O cliente abre o link, vê os serviços da proposta e ajusta as
// quantidades (serviços unitários) para estimar o VALOR MENSAL MÉDIO.
// Read-only (sem CTA/lead). Mobile-first, marca CCI.
//
// Tamanhos de texto do CONTEÚDO em `em`: o controle A−/A+ no topo muda a
// fonte-base do conteúdo em até ±2px, e tudo escala junto.
// ============================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Calculator, Minus, Plus, Info, ShieldCheck, CalendarClock,
  CheckCircle2, X,
} from 'lucide-react';
import { obterPropostaPublica, aceitarPropostaPublica } from '../services/propostaPublicaService';
import { formatCurrency } from '../utils/format';
import Markdown from '../components/ui/Markdown';

const FONTE_BASE = 16;               // px — base do conteúdo (1em)

const PERIODO = {
  mensal: { label: 'Mensal', sufixo: '/mês' },
  anual:  { label: 'Anual',  sufixo: '/ano' },
  unico:  { label: 'Único',  sufixo: '' },
};

const CATEGORIA_LABEL = {
  bpo: 'BPO', fiscal: 'Fiscal', consultoria: 'Consultoria',
  tecnologia: 'Tecnologia', treinamento: 'Treinamento', outro: 'Outros',
};
const CATEGORIA_ORDEM = ['bpo', 'fiscal', 'consultoria', 'tecnologia', 'treinamento', 'outro'];
const rotuloCategoria = (c) => CATEGORIA_LABEL[c] || (c ? c[0].toUpperCase() + c.slice(1) : 'Outros');

function dataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : '';
}

export default function PropostaPublica() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [expiradaEm, setExpiradaEm] = useState(null);
  const [prop, setProp] = useState(null);

  // Calculadora
  const [ativos, setAtivos] = useState(() => new Set());
  const [qtds, setQtds] = useState(() => ({}));

  // Fonte-base do conteúdo (+4px sobre o padrão), aplicada a `main` e à barra.
  const estiloFonte = { fontSize: `${FONTE_BASE + 4}px` };

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true); setErro(null);
        const p = await obterPropostaPublica(token);
        if (cancel) return;
        if (!p) { setErro('nao_encontrada'); return; }
        if (p.expirada) { setExpiradaEm(p.valida_ate); setErro('expirada'); return; }
        setProp(p);
        const its = p.itens || [];
        setAtivos(new Set(its.map(i => i.id)));
        const q = {};
        its.forEach(i => { q[i.id] = Number(i.quantidade) > 0 ? Number(i.quantidade) : 1; });
        setQtds(q);
        document.title = `Proposta CCI${p.cliente_nome ? ' · ' + p.cliente_nome : ''}`;
      } catch {
        if (!cancel) setErro('falha');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [token]);

  const toggle = useCallback((id) => setAtivos(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  }), []);
  const setQtd = useCallback((id, v) => setQtds(prev => ({ ...prev, [id]: Math.max(0, Number(v) || 0) })), []);

  const itens = useMemo(() => prop?.itens || [], [prop]);
  const descPct = Number(prop?.desconto_percentual) || 0;

  // Serviços agrupados por categoria (na ordem definida; desconhecidas ao fim).
  const grupos = useMemo(() => {
    const map = new Map();
    itens.forEach(it => {
      const c = it.categoria || 'outro';
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(it);
    });
    const rank = c => { const i = CATEGORIA_ORDEM.indexOf(c); return i < 0 ? 99 : i; };
    return [...map.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([cat, its]) => ({ cat, label: rotuloCategoria(cat), itens: its }));
  }, [itens]);

  const baseItem = useCallback((it) => {
    const unit = Number(it.valor_unitario) || 0;
    const q = it.tipo_valor === 'unitario' ? (Number(qtds[it.id]) || 0) : (Number(it.quantidade) || 1);
    return unit * q;
  }, [qtds]);

  const totais = useMemo(() => {
    let mensal = 0, anual = 0, unico = 0;
    itens.forEach(it => {
      if (!ativos.has(it.id)) return;
      const b = baseItem(it);
      if (it.periodicidade === 'anual') anual += b;
      else if (it.periodicidade === 'unico') unico += b;
      else mensal += b;
    });
    const desc = v => v * (1 - descPct / 100);
    return { anual: desc(anual), unico, mensalMedio: desc(mensal + anual / 12) };
  }, [itens, ativos, baseItem, descPct]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
      </div>
    );
  }
  if (erro) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 px-6 text-center">
        <div>
          <div className={`mx-auto mb-4 h-14 w-14 rounded-2xl grid place-items-center ${erro === 'expirada' ? 'bg-amber-50' : 'bg-teal-50'}`}>
            {erro === 'expirada'
              ? <CalendarClock className="h-7 w-7 text-amber-600" />
              : <Info className="h-7 w-7 text-teal-600" />}
          </div>
          <h1 className="text-lg font-semibold text-slate-800">
            {erro === 'expirada' ? 'Proposta expirada' : 'Proposta indisponível'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xs">
            {erro === 'expirada'
              ? `Esta proposta expirou${expiradaEm ? ' em ' + dataBR(expiradaEm) : ''}. Fale com a CCI para receber uma proposta atualizada.`
              : erro === 'nao_encontrada'
              ? 'Este link não é válido ou a proposta foi removida. Fale com a CCI para receber um novo.'
              : 'Não foi possível carregar a proposta agora. Tente novamente em instantes.'}
          </p>
        </div>
      </div>
    );
  }

  const temUnico = totais.unico > 0;

  // Modelo CONSULTIVA: documento em markdown + bloco de investimento.
  if (prop.modelo === 'consultiva') {
    return <PropostaConsultiva prop={prop} estiloFonte={estiloFonte} token={token} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-40">
      <Cabecalho prop={prop} interativa />

      <main className="mx-auto max-w-2xl px-5" style={estiloFonte}>
        <div className="-mt-5 relative rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-4">
          <p className="text-[0.81em] text-slate-600 leading-relaxed">
            <strong className="text-slate-800">Marque ou desmarque</strong> os serviços tocando em cada card e ajuste as
            quantidades. O <strong className="text-slate-800">valor mensal estimado</strong> atualiza na hora.
          </p>
        </div>

        <div className="mt-5 space-y-6">
          {grupos.map((g) => (
            <section key={g.cat}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="h-4 w-1 rounded-full bg-teal-500" />
                <h2 className="text-[0.72em] font-bold uppercase tracking-wider text-teal-700">{g.label}</h2>
                <span className="text-[0.66em] text-slate-400">· {g.itens.length} serviço{g.itens.length === 1 ? '' : 's'}</span>
              </div>
              <div className="space-y-3">
                {g.itens.map((it, idx) => (
                  <ServicoCard
                    key={it.id}
                    it={it}
                    idx={idx}
                    ativo={ativos.has(it.id)}
                    qtd={qtds[it.id]}
                    onToggle={() => toggle(it.id)}
                    onQtd={(v) => setQtd(it.id, v)}
                    base={baseItem(it)}
                  />
                ))}
              </div>
            </section>
          ))}
          {itens.length === 0 && (
            <p className="text-center text-[0.85em] text-slate-400 py-10">Esta proposta ainda não tem serviços.</p>
          )}
        </div>

        <AceiteProposta token={token} prop={prop} />

        <p className="mt-6 text-[0.72em] text-slate-400 leading-relaxed flex items-start gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-300" />
          Valores estimados para sua conferência. A contratação e os valores finais são formalizados
          em proposta/contrato pela CCI.
        </p>
      </main>

      {/* ── Barra fixa com o total ── */}
      <div className="fixed bottom-0 inset-x-0 z-30" style={estiloFonte}>
        <div className="mx-auto max-w-2xl px-4 pb-4">
          <div className="rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-black/10 px-5 py-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.69em] uppercase tracking-wider text-white/60">Valor mensal estimado</p>
                <AnimatePresence mode="wait">
                  <motion.p key={Math.round(totais.mensalMedio * 100)}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="text-[1.62em] font-bold leading-none tabular-nums">
                    {formatCurrency(totais.mensalMedio)}<span className="text-[0.55em] font-medium text-white/60"> /mês</span>
                  </motion.p>
                </AnimatePresence>
                {totais.anual > 0 && <p className="mt-1 text-[0.66em] text-white/50">inclui serviços anuais rateados no mês</p>}
              </div>
              <div className="text-right text-[0.69em] text-white/70 space-y-0.5 flex-shrink-0">
                {descPct > 0 && <div className="text-emerald-300">{descPct}% de desconto aplicado</div>}
                {temUnico && <div>+ {formatCurrency(totais.unico)} <span className="text-white/50">implantação (único)</span></div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Coleta de dados do dispositivo + geolocalização (prova) ────
async function coletarDadosAceite() {
  const base = {
    ts_cliente: new Date().toISOString(),
    user_agent: navigator.userAgent,
    plataforma: navigator.userAgentData?.platform || navigator.platform || null,
    idioma: navigator.language,
    idiomas: Array.isArray(navigator.languages) ? navigator.languages : undefined,
    tela: { largura: window.screen?.width, altura: window.screen?.height, dpr: window.devicePixelRatio },
    viewport: { largura: window.innerWidth, altura: window.innerHeight },
    fuso: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } })(),
    url: window.location.href,
    referrer: document.referrer || null,
  };
  const geo = await new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ status: 'indisponivel' });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ status: 'ok', lat: pos.coords.latitude, lng: pos.coords.longitude, precisao_m: pos.coords.accuracy, obtida_em: new Date().toISOString() }),
      (err) => resolve({ status: err?.code === 1 ? 'negada' : 'erro', mensagem: err?.message || '' }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
  return { ...base, geolocalizacao: geo };
}

// ─── Aceite da proposta (botão + modal + prova) ─────────────────
function AceiteProposta({ token, prop }) {
  const jaAceita = prop.status === 'aceita' || prop.status === 'convertida' || !!prop.aceito_em;
  const [aceito, setAceito] = useState(jaAceita);
  const [aceitoEm, setAceitoEm] = useState(prop.aceito_em || null);
  const [modal, setModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  const confirmar = async () => {
    setEnviando(true); setErro(null);
    try {
      const dados = await coletarDadosAceite();
      const r = await aceitarPropostaPublica(token, dados);
      if (r?.ok || r?.status === 'aceita' || r?.ja_aceita) {
        setAceito(true); setAceitoEm(r.aceito_em || new Date().toISOString()); setModal(false);
      } else {
        setErro(r?.erro === 'expirada' ? 'Esta proposta expirou.' : r?.erro === 'rejeitada' ? 'Esta proposta foi recusada.' : 'Não foi possível registrar o aceite.');
      }
    } catch {
      setErro('Não foi possível registrar o aceite agora. Tente novamente.');
    } finally { setEnviando(false); }
  };

  if (aceito) {
    return (
      <div className="mt-5 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 p-4 flex items-start gap-3">
        <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-[1em] font-semibold text-emerald-800">Proposta aceita</p>
          <p className="text-[0.8em] text-emerald-700/80">
            {aceitoEm ? `Registrado em ${dataHoraBR(aceitoEm)}. ` : ''}A CCI dará sequência ao processo. Obrigado!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <button type="button" onClick={() => setModal(true)}
        className="w-full rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3.5 text-[1.02em] shadow-lg shadow-teal-600/20 active:scale-[0.99] transition">
        Aceitar proposta
      </button>
      <p className="mt-2 text-[0.66em] text-slate-400 text-center">
        Ao aceitar, registramos data, dispositivo e localização para comprovar o aceite.
      </p>

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50 backdrop-blur-sm" style={{ fontSize: '16px' }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4">
              <h3 className="text-[15px] font-semibold text-slate-900">Confirmar aceite</h3>
              <button onClick={() => !enviando && setModal(false)} className="text-slate-400 hover:text-slate-600" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4">
              <p className="text-[13px] text-slate-600 leading-relaxed">
                Você confirma que deseja <strong className="text-slate-800">aceitar esta proposta</strong>?
              </p>
              <div className="mt-3 rounded-xl bg-slate-50 ring-1 ring-slate-200/70 p-3 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-slate-500 leading-relaxed">
                  Para comprovar o aceite, vamos registrar a <strong>data/hora</strong>, os <strong>dados do seu dispositivo</strong> e a <strong>localização</strong> (seu navegador pode pedir permissão de localização).
                </p>
              </div>
              {erro && <p className="mt-3 text-[12px] text-rose-600">{erro}</p>}
            </div>
            <div className="px-5 pb-4 flex items-center justify-end gap-2">
              <button onClick={() => setModal(false)} disabled={enviando}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
              <button onClick={confirmar} disabled={enviando}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {enviando ? 'Registrando…' : 'Confirmar aceite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function dataHoraBR(iso) {
  try {
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return ''; }
}

// ─── Cabeçalho (compartilhado) ──────────────────────────────────
function Cabecalho({ prop, interativa }) {
  return (
    <header className="relative overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-teal-500/25 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
      <div className="relative mx-auto max-w-2xl px-5 pt-6 pb-10">
        <div className="inline-flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-2 shadow-lg shadow-black/20 ring-1 ring-black/5">
          <img src="/logo-cci-landing.png" alt="CCI" className="h-8 w-auto object-contain" />
        </div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="mt-7 text-[22px] sm:text-2xl font-bold leading-tight">
          {prop.titulo || 'Proposta de serviços'}
        </motion.h1>
        {prop.cliente_nome && (
          <p className="mt-1 text-white/80 text-sm">Preparada para <strong className="font-semibold text-white">{prop.cliente_nome}</strong></p>
        )}
        {interativa && prop.descricao && <p className="mt-3 text-[13.5px] text-white/80 leading-relaxed">{prop.descricao}</p>}
        <div className="mt-5 flex flex-wrap gap-2 text-[11.5px]">
          {interativa && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/10 px-3 py-1"><Calculator className="h-3.5 w-3.5 text-teal-300" /> Simulação interativa</span>
          )}
          {prop.valida_ate && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/10 px-3 py-1"><CalendarClock className="h-3.5 w-3.5 text-teal-300" /> Válida até {dataBR(prop.valida_ate)}</span>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Modelo CONSULTIVA (documento + investimento) ───────────────
function PropostaConsultiva({ prop, estiloFonte, token }) {
  const inv = Number(prop.investimento_valor) || 0;
  const per = prop.investimento_periodicidade || 'mensal';
  const sufixo = per === 'anual' ? '/ano' : per === 'unico' ? '' : '/mês';
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-10">
      <Cabecalho prop={prop} />
      <main className="mx-auto max-w-2xl px-5" style={estiloFonte}>
        <article className="-mt-5 relative rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-5 text-[1em]">
          {prop.descricao && (
            <p className="text-[1.02em] leading-relaxed text-slate-700 font-medium mb-1">{prop.descricao}</p>
          )}
          <Markdown>{prop.conteudo_md || ''}</Markdown>
          {!prop.conteudo_md && !prop.descricao && (
            <p className="text-slate-400 text-center py-6">Conteúdo da proposta em breve.</p>
          )}
        </article>

        {inv > 0 && (
          <div className="mt-5 rounded-2xl bg-slate-900 text-white shadow-lg ring-1 ring-black/10 p-5">
            <p className="text-[0.7em] uppercase tracking-wider text-white/60">Investimento</p>
            <p className="mt-1 text-[1.7em] font-bold leading-none tabular-nums">
              {formatCurrency(inv)}
              <span className="text-[0.5em] font-medium text-white/60"> {per === 'unico' ? 'pagamento único' : sufixo}</span>
            </p>
          </div>
        )}

        <AceiteProposta token={token} prop={prop} />

        <p className="mt-6 text-[0.72em] text-slate-400 leading-relaxed flex items-start gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-300" />
          Proposta para sua avaliação. Os valores e condições são formalizados em contrato pela CCI.
        </p>
      </main>
    </div>
  );
}

// ─── Card de serviço ────────────────────────────────────────────
function ServicoCard({ it, idx, ativo, qtd, onToggle, onQtd, base }) {
  const per = PERIODO[it.periodicidade] || PERIODO.mensal;
  const unit = Number(it.valor_unitario) || 0;
  const unidade = it.unidade || 'un';
  const ehUnitario = it.tipo_valor === 'unitario';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(idx * 0.04, 0.3) }}
      className={`rounded-2xl bg-white ring-1 transition-colors ${ativo ? 'ring-teal-300' : 'ring-slate-200/70'} shadow-sm overflow-hidden`}>
      <div className="p-4">
        {/* Cabeçalho clicável: marca/desmarca o serviço */}
        <button type="button" onClick={onToggle} aria-pressed={ativo}
          className="w-full flex items-start justify-between gap-3 text-left">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-[0.91em] font-semibold ${ativo ? 'text-slate-900' : 'text-slate-400'}`}>{it.nome}</h3>
              <span className="text-[0.63em] uppercase tracking-wide rounded-full bg-slate-100 text-slate-500 px-2 py-0.5">{per.label}</span>
            </div>
            {it.descricao && <p className={`mt-1 text-[0.78em] leading-relaxed ${ativo ? 'text-slate-500' : 'text-slate-300'}`}>{it.descricao}</p>}
            <p className={`mt-2 text-[0.75em] ${ativo ? 'text-slate-500' : 'text-slate-300'}`}>
              {ehUnitario
                ? <>{formatCurrency(unit)} <span className="text-slate-400">por {unidade}{per.sufixo}</span></>
                : <>{formatCurrency(unit)} <span className="text-slate-400">{per.sufixo}</span></>}
            </p>
          </div>
          <Switch on={ativo} />
        </button>

        {/* Controles + subtotal (só quando incluído) */}
        {ativo && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            {ehUnitario ? (
              <Stepper unidade={unidade} valor={qtd} onChange={onQtd} />
            ) : (
              <span className="text-[0.75em] text-slate-400">Valor fixo</span>
            )}
            <div className="text-right">
              <div className="text-[0.94em] font-bold text-teal-700 tabular-nums leading-none">{formatCurrency(base)}<span className="text-[0.7em] font-medium text-slate-400">{per.sufixo}</span></div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Switch on/off (marcar/desmarcar) com rótulo ────────────────
function Switch({ on }) {
  return (
    <span className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
      <span className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-teal-600' : 'bg-slate-200'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
      <span className={`text-[0.63em] font-medium ${on ? 'text-teal-700' : 'text-slate-400'}`}>{on ? 'Incluído' : 'Não incluído'}</span>
    </span>
  );
}

// ─── Stepper de quantidade ──────────────────────────────────────
function Stepper({ unidade, valor, onChange }) {
  const v = Number(valor) || 0;
  const btn = 'h-9 w-9 grid place-items-center rounded-lg bg-slate-100 text-slate-600 active:scale-95 transition disabled:opacity-40';
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => onChange(Math.max(0, v - 1))} disabled={v <= 0} aria-label="Diminuir"><Minus className="h-4 w-4" /></button>
      <div className="flex flex-col items-center">
        <input
          type="number" inputMode="numeric" min={0} value={v}
          onChange={e => onChange(e.target.value)}
          className="w-16 text-center text-[0.94em] font-semibold text-slate-800 tabular-nums rounded-lg border border-slate-200 py-1 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100" />
        <span className="text-[0.63em] text-slate-400 mt-0.5">{unidade}</span>
      </div>
      <button type="button" className={btn} onClick={() => onChange(v + 1)} aria-label="Aumentar"><Plus className="h-4 w-4" /></button>
    </div>
  );
}
