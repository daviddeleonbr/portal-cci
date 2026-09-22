// ============================================================
// Página PÚBLICA de proposta — /proposta/:token
//
// O cliente abre o link, vê os serviços da proposta e ajusta as
// quantidades (serviços unitários) para estimar o VALOR MENSAL MÉDIO.
// Read-only (sem CTA/lead). Mobile-first, marca CCI.
// ============================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Calculator, Check, Minus, Plus, Info, ShieldCheck, CalendarClock, Sparkles,
} from 'lucide-react';
import { obterPropostaPublica } from '../services/propostaPublicaService';
import { formatCurrency } from '../utils/format';

const PERIODO = {
  mensal: { label: 'Mensal', sufixo: '/mês' },
  anual:  { label: 'Anual',  sufixo: '/ano' },
  unico:  { label: 'Único',  sufixo: '' },
};

function dataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : '';
}

export default function PropostaPublica() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [prop, setProp] = useState(null);

  // Estado da calculadora
  const [ativos, setAtivos] = useState(() => new Set());   // ids incluídos
  const [qtds, setQtds] = useState(() => ({}));             // id → quantidade

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true); setErro(null);
        const p = await obterPropostaPublica(token);
        if (cancel) return;
        if (!p) { setErro('nao_encontrada'); return; }
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

  // Base (valor no período do serviço) de um item, considerando quantidade.
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
    return {
      mensal: desc(mensal),
      anual: desc(anual),
      unico, // implantação não recebe % desconto recorrente
      mensalMedio: desc(mensal + anual / 12),
    };
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
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-teal-50 grid place-items-center">
            <Info className="h-7 w-7 text-teal-600" />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Proposta indisponível</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xs">
            {erro === 'nao_encontrada'
              ? 'Este link não é válido ou a proposta foi removida. Fale com a CCI para receber um novo.'
              : 'Não foi possível carregar a proposta agora. Tente novamente em instantes.'}
          </p>
        </div>
      </div>
    );
  }

  const temAnual = totais.anual > 0;
  const temUnico = totais.unico > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-40">
      {/* ── Cabeçalho ── */}
      <header className="relative overflow-hidden bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 text-white">
        <div className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 10%, #fff 0, transparent 40%)' }} />
        <div className="relative mx-auto max-w-2xl px-5 pt-8 pb-10">
          <div className="flex items-center gap-2 text-white/90">
            <img src="/logo-cci-landing.png" alt="CCI" className="h-8 w-auto object-contain drop-shadow" />
            <span className="text-sm font-semibold tracking-wide">Consultoria Inteligente</span>
          </div>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            className="mt-6 text-[22px] sm:text-2xl font-bold leading-tight">
            {prop.titulo || 'Proposta de serviços'}
          </motion.h1>
          {prop.cliente_nome && (
            <p className="mt-1 text-white/85 text-sm">Preparada para <strong className="font-semibold">{prop.cliente_nome}</strong></p>
          )}
          {prop.descricao && <p className="mt-3 text-[13.5px] text-white/85 leading-relaxed">{prop.descricao}</p>}
          <div className="mt-5 flex flex-wrap gap-2 text-[11.5px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1"><Calculator className="h-3.5 w-3.5" /> Simulação interativa</span>
            {prop.valida_ate && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1"><CalendarClock className="h-3.5 w-3.5" /> Válida até {dataBR(prop.valida_ate)}</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5">
        <div className="-mt-5 relative rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-slate-600 leading-relaxed">
            Ajuste as quantidades dos serviços conforme a realidade do seu posto e veja o
            <strong className="text-slate-800"> valor mensal estimado</strong> atualizar na hora.
          </p>
        </div>

        {/* ── Lista de serviços ── */}
        <div className="mt-4 space-y-3">
          {itens.map((it, idx) => (
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
          {itens.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-10">Esta proposta ainda não tem serviços.</p>
          )}
        </div>

        <p className="mt-6 text-[11.5px] text-slate-400 leading-relaxed flex items-start gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-300" />
          Valores estimados para sua conferência. A contratação e os valores finais são formalizados
          em proposta/contrato pela CCI.
        </p>
      </main>

      {/* ── Barra fixa com o total ── */}
      <div className="fixed bottom-0 inset-x-0 z-30">
        <div className="mx-auto max-w-2xl px-4 pb-4">
          <div className="rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-black/10 px-5 py-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-white/60">Valor mensal estimado</p>
                <AnimatePresence mode="wait">
                  <motion.p key={Math.round(totais.mensalMedio * 100)}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="text-[26px] font-bold leading-none tabular-nums">
                    {formatCurrency(totais.mensalMedio)}<span className="text-sm font-medium text-white/60"> /mês</span>
                  </motion.p>
                </AnimatePresence>
                {temAnual && <p className="mt-1 text-[10.5px] text-white/50">inclui serviços anuais rateados no mês</p>}
              </div>
              <div className="text-right text-[11px] text-white/70 space-y-0.5 flex-shrink-0">
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
      className={`rounded-2xl bg-white ring-1 transition-colors ${ativo ? 'ring-teal-200' : 'ring-slate-200/70'} shadow-sm overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Toggle incluir */}
          <button type="button" onClick={onToggle} aria-pressed={ativo}
            className={`mt-0.5 h-6 w-6 rounded-lg grid place-items-center flex-shrink-0 transition-colors ${
              ativo ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-300 ring-1 ring-slate-200'
            }`}>
            {ativo ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-[14.5px] font-semibold ${ativo ? 'text-slate-900' : 'text-slate-400'}`}>{it.nome}</h3>
              <span className="text-[10px] uppercase tracking-wide rounded-full bg-slate-100 text-slate-500 px-2 py-0.5">{per.label}</span>
            </div>
            {it.descricao && <p className={`mt-1 text-[12.5px] leading-relaxed ${ativo ? 'text-slate-500' : 'text-slate-300'}`}>{it.descricao}</p>}

            {/* Preço unitário / fixo */}
            <p className={`mt-2 text-[12px] ${ativo ? 'text-slate-500' : 'text-slate-300'}`}>
              {ehUnitario
                ? <>{formatCurrency(unit)} <span className="text-slate-400">por {unidade}{per.sufixo}</span></>
                : <>{formatCurrency(unit)} <span className="text-slate-400">{per.sufixo}</span></>}
            </p>
          </div>
        </div>

        {/* Controles + subtotal */}
        {ativo && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            {ehUnitario ? (
              <Stepper unidade={unidade} valor={qtd} onChange={onQtd} />
            ) : (
              <span className="text-[12px] text-slate-400">Valor fixo</span>
            )}
            <div className="text-right">
              <div className="text-[15px] font-bold text-teal-700 tabular-nums leading-none">{formatCurrency(base)}<span className="text-[11px] font-medium text-slate-400">{per.sufixo}</span></div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
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
          className="w-16 text-center text-[15px] font-semibold text-slate-800 tabular-nums rounded-lg border border-slate-200 py-1 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100" />
        <span className="text-[10px] text-slate-400 mt-0.5">{unidade}</span>
      </div>
      <button type="button" className={btn} onClick={() => onChange(v + 1)} aria-label="Aumentar"><Plus className="h-4 w-4" /></button>
    </div>
  );
}
