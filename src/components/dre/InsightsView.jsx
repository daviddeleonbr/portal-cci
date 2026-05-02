import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, TrendingUp, TrendingDown, AlertTriangle, Lightbulb,
  Target, HelpCircle, Loader2, CheckCircle2, XCircle, Key,
  Activity, DollarSign, Percent
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import * as insightsService from '../../services/insightsService';
import Modal from '../ui/Modal';

export default function InsightsView({ dreTree, mascara, periodoLabel, cliente }) {
  const kpis = useMemo(() => insightsService.calcularKPIs(dreTree), [dreTree]);

  const [insights, setInsights] = useState(null);
  const [insightsSource, setInsightsSource] = useState(null); // 'ia' | 'local'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [modalKey, setModalKey] = useState(false);
  const [apiKey, setApiKey] = useState(insightsService.carregarApiKey());

  const gerarInsights = async () => {
    let key = apiKey;
    if (!key) { setModalKey(true); return; }
    try {
      setLoading(true);
      setError(null);
      setErrorCode(null);
      const dreData = insightsService.dreParaPrompt(dreTree, mascara, periodoLabel, cliente, kpis);
      const result = await insightsService.gerarInsightsIA(dreData, key);
      setInsights(result);
      setInsightsSource('ia');
    } catch (err) {
      setError(err.message);
      setErrorCode(err.code || 'GENERIC');
    } finally {
      setLoading(false);
    }
  };

  const gerarLocal = () => {
    const result = insightsService.gerarInsightsLocal(dreTree, kpis);
    setInsights(result);
    setInsightsSource('local');
    setError(null);
    setErrorCode(null);
  };

  const salvarApiKey = (k) => {
    insightsService.salvarApiKey(k);
    setApiKey(k);
    setModalKey(false);
    if (k) setTimeout(() => gerarInsights(), 100);
  };

  return (
    <div className="space-y-5">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Receita Bruta"
          value={formatCurrency(kpis.receitaBruta)}
          icon={DollarSign}
          color="blue"
        />
        <KpiCard
          label="Lucro Bruto"
          value={formatCurrency(kpis.lucroBruto)}
          subValue={`${kpis.margemBruta.toFixed(1)}% margem`}
          icon={TrendingUp}
          color={kpis.lucroBruto >= 0 ? 'emerald' : 'red'}
        />
        <KpiCard
          label="Despesas Op."
          value={formatCurrency(kpis.despesasOperacionais)}
          subValue={kpis.receitaBruta > 0 ? `${(kpis.despesasOperacionais / kpis.receitaBruta * 100).toFixed(1)}% da receita` : ''}
          icon={Activity}
          color="orange"
        />
        <KpiCard
          label="Lucro Liquido"
          value={formatCurrency(kpis.lucroLiquido)}
          subValue={`${kpis.margemLiquida.toFixed(1)}% margem`}
          icon={Percent}
          color={kpis.lucroLiquido >= 0 ? 'emerald' : 'red'}
        />
      </div>

      {/* IA Section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Análise estrategica</h3>
              <p className="text-[11px] text-gray-400">Especializada no setor de postos de combustíveis</p>
            </div>
            {insightsSource === 'ia' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 text-[10px] font-medium">
                <Sparkles className="h-2.5 w-2.5" /> IA
              </span>
            )}
            {insightsSource === 'local' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-medium">
                Análise basica
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {apiKey && (
              <button onClick={() => setModalKey(true)}
                className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <Key className="h-3 w-3" /> Trocar chave
              </button>
            )}
            <button onClick={gerarLocal}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <Activity className="h-4 w-4" /> Análise basica
            </button>
            <button onClick={gerarInsights} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 px-4 py-2 text-sm font-medium text-white hover:from-violet-700 hover:to-purple-800 transition-all shadow-sm disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {insights && insightsSource === 'ia' ? 'Nova análise IA' : 'Análise com IA'}
            </button>
          </div>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-900 mb-1">
                  {errorCode === 'NO_CREDITS' ? 'Sem creditos na API Anthropic'
                    : errorCode === 'INVALID_KEY' ? 'Chave de API invalida'
                    : errorCode === 'RATE_LIMIT' ? 'Limite de requisicoes atingido'
                    : 'Erro ao gerar análise com IA'}
                </p>
                <p className="text-xs text-red-700 leading-relaxed mb-2">{error}</p>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={gerarLocal}
                    className="rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    Usar análise basica (sem IA)
                  </button>
                  {errorCode === 'NO_CREDITS' && (
                    <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer"
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 transition-colors">
                      Adicionar creditos
                    </a>
                  )}
                  {errorCode === 'INVALID_KEY' && (
                    <button onClick={() => setModalKey(true)}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 transition-colors">
                      Trocar chave
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!insights && !loading && !error && (
            <div className="text-center py-12">
              <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mb-3">
                <Sparkles className="h-7 w-7 text-violet-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800 mb-1">Gere uma análise inteligente</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
                Receba diagnósticos, oportunidades e recomendacoes baseadas nos números da sua DRE,
                considerando especificidades do setor de combustíveis.
              </p>
              <p className="text-[11px] text-gray-400">
                <strong>Análise basica</strong>: regras de negocio sem IA (gratis, instantaneo) <br/>
                <strong>Análise com IA</strong>: usa Claude (requer chave Anthropic com creditos)
              </p>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <Loader2 className="h-7 w-7 text-violet-500 animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-800 mb-1">Analisando seus números...</p>
              <p className="text-xs text-gray-400">Isso pode levar 10-20 segundos</p>
            </div>
          )}

          {insights && !loading && <InsightsContent insights={insights} kpis={kpis} />}
        </div>
      </motion.div>

      {/* Modal API key */}
      <ModalApiKey open={modalKey} apiKey={apiKey}
        onClose={() => setModalKey(false)}
        onSave={salvarApiKey} />
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────
function KpiCard({ label, value, subValue, icon: Icon, color }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    orange:  'bg-orange-50 text-orange-600',
    red:     'bg-red-50 text-red-600',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-6 w-6 rounded-md flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-3 w-3" />
        </div>
      </div>
      <p className="text-base font-bold text-gray-900 tabular-nums">{value}</p>
      {subValue && <p className="text-[10px] text-gray-400 mt-0.5">{subValue}</p>}
    </motion.div>
  );
}

// ─── Insights renderer (estruturado) ─────────────────────────
function InsightsContent({ insights, kpis }) {
  const situacaoConfig = {
    saudavel: { label: 'Saudavel', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
    alerta:   { label: 'Alerta',   color: 'bg-amber-100 text-amber-800 border-amber-200',         icon: AlertTriangle },
    critico:  { label: 'Crítico',  color: 'bg-red-100 text-red-800 border-red-200',               icon: XCircle },
  };
  const sit = situacaoConfig[insights.resumo_executivo?.situacao] || situacaoConfig.alerta;
  const SitIcon = sit.icon;

  return (
    <div className="space-y-6">
      {/* 1. Resumo Executivo */}
      <Section title="Resumo Executivo" icon={Activity} color="blue">
        <div className={`rounded-xl border px-4 py-3 mb-3 flex items-start gap-2.5 ${sit.color}`}>
          <SitIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1">Situação: {sit.label}</p>
            <p className="text-sm leading-relaxed">{insights.resumo_executivo?.resumo}</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <BulletCard title="Pontos positivos" items={insights.resumo_executivo?.pontos_positivos} icon={TrendingUp} color="emerald" />
          <BulletCard title="Pontos negativos" items={insights.resumo_executivo?.pontos_negativos} icon={TrendingDown} color="red" />
        </div>
      </Section>

      {/* 2. Analise de Margens */}
      <Section title="Análise de Margens" icon={Percent} color="emerald">
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <MiniKpi label="Margem bruta" value={`${kpis.margemBruta.toFixed(2)}%`} />
          <MiniKpi label="Margem liquida" value={`${kpis.margemLiquida.toFixed(2)}%`} />
          <MiniKpi label="Margem op./liq." value={`${kpis.margemBrutaSobreLiquida.toFixed(2)}%`} />
        </div>
        <p className="text-sm text-gray-700 leading-relaxed mb-3">{insights.margens?.interpretacao}</p>
        {insights.margens?.causas && insights.margens.causas.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Possíveis causas</p>
            <ul className="space-y-1.5">
              {insights.margens.causas.map((c, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-gray-400 flex-shrink-0">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* 3. Custos e Despesas */}
      <Section title="Custos e Despesas" icon={Activity} color="orange">
        {insights.custos_despesas?.maiores_itens && insights.custos_despesas.maiores_itens.length > 0 && (
          <div className="space-y-2 mb-3">
            {insights.custos_despesas.maiores_itens.map((item, i) => (
              <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900">{item.nome}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono tabular-nums text-gray-700">{formatCurrency(item.valor)}</span>
                    <span className="text-orange-600 font-semibold">{item.pct_receita?.toFixed(1)}%</span>
                  </div>
                </div>
                {item.comentario && <p className="text-xs text-gray-500">{item.comentario}</p>}
              </div>
            ))}
          </div>
        )}
        {insights.custos_despesas?.excessos && insights.custos_despesas.excessos.length > 0 && (
          <BulletCard title="Possíveis excessos" items={insights.custos_despesas.excessos} icon={AlertTriangle} color="red" />
        )}
      </Section>

      {/* 4. Pontos de Atencao */}
      <Section title="Pontos de Atenção" icon={AlertTriangle} color="red">
        <div className="grid sm:grid-cols-3 gap-3">
          <BulletCard title="Gargalos" items={insights.atencao?.gargalos} compact />
          <BulletCard title="Riscos" items={insights.atencao?.riscos} compact />
          <BulletCard title="Dependencias" items={insights.atencao?.dependencias} compact />
        </div>
      </Section>

      {/* 5. Oportunidades */}
      <Section title="Oportunidades de Melhoria" icon={Lightbulb} color="amber">
        <div className="grid lg:grid-cols-3 gap-3">
          <BulletCard title="Aumentar margem" items={insights.oportunidades?.aumentar_margem} icon={TrendingUp} color="emerald" />
          <BulletCard title="Reduzir custos" items={insights.oportunidades?.reduzir_custos} icon={TrendingDown} color="orange" />
          <BulletCard title="Sugestoes práticas" items={insights.oportunidades?.sugestoes_praticas} icon={Lightbulb} color="amber" />
        </div>
      </Section>

      {/* 6. Insights Estrategicos */}
      <Section title="Insights Estrategicos" icon={Target} color="violet">
        <div className="space-y-2">
          {(insights.estrategicos || []).map((item, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-violet-50/50 border border-violet-100 p-3">
              <div className="h-6 w-6 rounded-md bg-violet-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 7. Perguntas para o Gestor */}
      <Section title="Perguntas para reflexão" icon={HelpCircle} color="blue">
        <div className="grid sm:grid-cols-2 gap-2.5">
          {(insights.perguntas || []).map((p, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-3 flex items-start gap-2.5">
              <HelpCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 leading-relaxed">{p}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Helper components ───────────────────────────────────────
function Section({ title, icon: Icon, color, children }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    orange: 'bg-orange-100 text-orange-600',
    red: 'bg-red-100 text-red-600',
    amber: 'bg-amber-100 text-amber-600',
    violet: 'bg-violet-100 text-violet-600',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h4 className="text-[13px] font-semibold text-gray-900 uppercase tracking-wide">{title}</h4>
      </div>
      <div>{children}</div>
    </motion.div>
  );
}

function BulletCard({ title, items, icon: Icon, color, compact }) {
  if (!items || items.length === 0) return null;
  const colors = {
    emerald: 'border-emerald-200 bg-emerald-50/50',
    red: 'border-red-200 bg-red-50/50',
    orange: 'border-orange-200 bg-orange-50/50',
    amber: 'border-amber-200 bg-amber-50/50',
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[color] || 'border-gray-200 bg-gray-50/50'}`}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-gray-500" />}
        <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">{title}</p>
      </div>
      <ul className={`space-y-${compact ? '1' : '1.5'}`}>
        {items.map((item, i) => (
          <li key={i} className={`${compact ? 'text-[12px]' : 'text-sm'} text-gray-700 flex gap-2 leading-relaxed`}>
            <span className="text-gray-400 flex-shrink-0">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniKpi({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-center">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
    </div>
  );
}

// ─── Modal API Key ───────────────────────────────────────────
function ModalApiKey({ open, apiKey, onClose, onSave }) {
  const [value, setValue] = useState(apiKey || '');

  return (
    <Modal open={open} onClose={onClose} title="Chave da API Anthropic" size="sm">
      <div className="space-y-4">
        <div className="rounded-lg bg-violet-50/60 border border-violet-200 p-3 flex gap-2">
          <Key className="h-4 w-4 text-violet-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-violet-900 leading-relaxed">
            Para gerar análises com IA, e necessária uma chave da API Anthropic. Obtenha em{' '}
            <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer"
              className="font-medium underline">console.anthropic.com</a>.
            A chave fica salva no seu navegador (localStorage) e não e enviada ao Supabase.
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Chave (sk-ant-...)</label>
          <input type="password" value={value} onChange={e => setValue(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button onClick={() => onSave(value.trim())} disabled={!value.trim()}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors disabled:opacity-50">
            Salvar e gerar análise
          </button>
        </div>
      </div>
    </Modal>
  );
}
