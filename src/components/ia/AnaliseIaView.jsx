// Renderer generico de insights da IA. Detecta chaves presentes no objeto
// insights e renderiza os cards aplicaveis. Compartilhado entre as 4 abas.

import { motion } from 'framer-motion';
import {
  Sparkles, CheckCircle2, AlertTriangle, XCircle, TrendingUp, TrendingDown,
  Target, Lightbulb, HelpCircle, Award, AlertCircle, ListOrdered, Fuel,
  Layers, Wallet, GitBranch, Calendar, Package, Activity, CreditCard, ShieldAlert,
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';

export default function AnaliseIaView({ insights, modoRede = false, usage = null }) {
  if (!insights) return null;

  return (
    <div className="space-y-5">
      <ResumoExecutivo insights={insights} usage={usage} />

      {/* Cards de Vendas */}
      {insights.mix_produto && <CardMixProduto mix={insights.mix_produto} />}
      {insights.diagnostico_grupos && <CardDiagnosticoGrupos d={insights.diagnostico_grupos} />}
      {insights.combustiveis && <CardCombustiveis c={insights.combustiveis} />}
      {insights.automotivos_analise && <CardCategoriaAnalise a={insights.automotivos_analise} titulo="Automotivos" icone={Package} cor="blue" />}
      {insights.conveniencia_analise && <CardCategoriaAnalise a={insights.conveniencia_analise} titulo="Conveniencia" icone={Package} cor="emerald" />}
      {insights.volumes_precos?.analise && <CardVolumesPrecos v={insights.volumes_precos} />}
      {insights.alertas_produtos && <CardAlertasProdutos a={insights.alertas_produtos} />}
      {insights.formas_pagamento && <CardFormasPagamento f={insights.formas_pagamento} />}
      {insights.integridade_dados && <CardIntegridadeDados i={insights.integridade_dados} />}

      {/* Cards de DRE */}
      {insights.margens && <CardMargens m={insights.margens} />}
      {insights.linhas_criticas?.length > 0 && <CardLinhasCriticas linhas={insights.linhas_criticas} />}
      {insights.custos_despesas && <CardCustosDespesas c={insights.custos_despesas} />}

      {/* Cards de Fluxo */}
      {insights.variacao_caixa && <CardVariacaoCaixa v={insights.variacao_caixa} />}
      {insights.padrao_grupos && <CardPadraoGruposFluxo p={insights.padrao_grupos} />}
      {insights.concentracoes?.length > 0 && <CardConcentracoes c={insights.concentracoes} />}

      {/* Cards de Diagnostico Geral */}
      {insights.diagnostico_integrado && <CardDiagnosticoIntegrado d={insights.diagnostico_integrado} />}
      {insights.gargalos_criticos?.length > 0 && <CardGargalos g={insights.gargalos_criticos} />}
      {insights.alavancas_prioritarias?.length > 0 && <CardAlavancas a={insights.alavancas_prioritarias} />}
      {insights.contradicoes?.length > 0 && <CardContradicoes c={insights.contradicoes} />}
      {insights.plano_90_dias?.length > 0 && <CardPlano90 p={insights.plano_90_dias} />}

      {/* Comparativos */}
      {insights.comparativo && <CardComparativo c={insights.comparativo} />}
      {insights.comparativo_yoy?.o_que_mudou && <CardComparativoYoy c={insights.comparativo_yoy} />}
      {insights.tendencia && <CardTendencia t={insights.tendencia} />}

      {/* Ranking + Dispersao (rede) */}
      {modoRede && insights.ranking_empresas?.length > 0 && <CardRankingEmpresas r={insights.ranking_empresas} />}
      {modoRede && insights.dispersao && <CardDispersao d={insights.dispersao} />}

      {/* Riscos / Alertas genericos */}
      {insights.alertas?.length > 0 && <CardAlertas alertas={insights.alertas} />}
      {insights.riscos?.length > 0 && <CardRiscos riscos={insights.riscos} />}

      {/* Oportunidades */}
      {insights.oportunidades && <CardOportunidades o={insights.oportunidades} />}

      {/* Recomendacoes + Perguntas (universais) */}
      {insights.recomendacoes?.length > 0 && <CardRecomendacoes r={insights.recomendacoes} />}
      {(insights.perguntas_gestor?.length > 0 || insights.perguntas_chave_gestor?.length > 0) && (
        <CardPerguntas perguntas={insights.perguntas_gestor || insights.perguntas_chave_gestor} />
      )}

      {usage && (
        <div className="text-[10px] text-gray-400 text-right">
          entrada: {usage.input_tokens} tok · cache: {usage.cache_read_input_tokens || 0} tok · saida: {usage.output_tokens} tok
        </div>
      )}
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────

function ResumoExecutivo({ insights, usage }) {
  const re = insights.resumo_executivo || {};
  const situacao = re.situacao || re.situacao_caixa || 'alerta';
  const cfg = {
    saudavel: { cor: 'emerald', Icon: CheckCircle2, label: 'SAUDAVEL' },
    alerta: { cor: 'amber', Icon: AlertTriangle, label: 'ALERTA' },
    critico: { cor: 'red', Icon: XCircle, label: 'CRITICO' },
  }[situacao] || { cor: 'gray', Icon: AlertCircle, label: String(situacao).toUpperCase() };
  const bg = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  }[cfg.cor];

  const resumo = re.resumo ?? re.sintese ?? re.saude_liquidez ?? '';
  const positivos = re.destaques_positivos ?? re.pontos_positivos ?? [];
  const negativos = re.destaques_negativos ?? re.pontos_negativos ?? re.alertas_agudos ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-5 shadow-sm ${bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <cfg.Icon className="h-5 w-5" />
        <h3 className="text-sm font-bold uppercase tracking-wider">Situacao: {cfg.label}</h3>
        {usage?.cache_read_input_tokens > 0 && (
          <span className="ml-auto text-[10px] text-gray-500 bg-white/60 px-2 py-0.5 rounded-full">
            cache hit {usage.cache_read_input_tokens} tokens
          </span>
        )}
      </div>
      <p className="text-[13.5px] leading-relaxed">{resumo}</p>
      {(positivos.length > 0 || negativos.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {positivos.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">Destaques positivos</p>
              <ul className="space-y-1">
                {positivos.map((p, i) => (
                  <li key={i} className="text-[12px] flex items-start gap-1.5">
                    <TrendingUp className="h-3 w-3 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {negativos.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 mb-1">Pontos de atencao</p>
              <ul className="space-y-1">
                {negativos.map((p, i) => (
                  <li key={i} className="text-[12px] flex items-start gap-1.5">
                    <TrendingDown className="h-3 w-3 text-red-600 flex-shrink-0 mt-0.5" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function CardMixProduto({ mix }) {
  return (
    <Card icon={Target} color="blue" titulo="Mix de produto">
      {mix.interpretacao && <p className="text-[13px] text-gray-700 mb-3 leading-relaxed">{mix.interpretacao}</p>}
      {mix.concentracao?.length > 0 && (
        <Tabela headers={['Categoria', '% Receita', '% Margem', 'Comentario']}
          rows={mix.concentracao.map(c => [
            <span className="capitalize">{c.categoria}</span>,
            <span className="font-mono tabular-nums">{Number(c.pct_receita || 0).toFixed(1)}%</span>,
            <span className="font-mono tabular-nums">{Number(c.pct_margem || 0).toFixed(1)}%</span>,
            c.comentario,
          ])} />
      )}
      {mix.top_produtos?.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 mt-4">Top produtos</p>
          <div className="grid gap-1.5">
            {mix.top_produtos.slice(0, 8).map((p, i) => (
              <div key={i} className="flex items-center gap-3 text-[12px] py-1">
                <span className="font-mono text-gray-400 w-5">#{i + 1}</span>
                <span className="flex-1 truncate font-medium text-gray-800">{p.nome}</span>
                <span className="font-mono tabular-nums text-gray-700">{formatCurrency(p.receita || 0)}</span>
                <span className="font-mono tabular-nums text-gray-500 w-16 text-right">{Number(p.participacao_pct || 0).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function CardDiagnosticoGrupos({ d }) {
  return (
    <Card icon={Layers} color="violet" titulo="Diagnostico por grupo">
      {d.interpretacao && <p className="text-[13px] text-gray-700 mb-3 leading-relaxed">{d.interpretacao}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {d.grupos_problema?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 mb-2">Grupos em problema</p>
            <ul className="space-y-2">
              {d.grupos_problema.map((g, i) => (
                <li key={i} className="rounded-lg border border-red-200 bg-red-50/50 p-2.5">
                  <p className="text-[12.5px] font-semibold text-gray-900">{g.grupo}</p>
                  <p className="text-[11.5px] text-red-700 mt-0.5">{g.motivo}</p>
                  {g.acao_sugerida && <p className="text-[11px] text-gray-600 mt-1">Acao: {g.acao_sugerida}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.grupos_destaque?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-2">Grupos em destaque</p>
            <ul className="space-y-2">
              {d.grupos_destaque.map((g, i) => (
                <li key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                  <p className="text-[12.5px] font-semibold text-gray-900">{g.grupo}</p>
                  <p className="text-[11.5px] text-emerald-700 mt-0.5">{g.porque}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function CardCombustiveis({ c }) {
  return (
    <Card icon={Fuel} color="amber" titulo="Analise de combustiveis">
      {c.analise_por_tipo && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Por tipo (Gasolina, Diesel, Etanol, GNV)</p>
          <p className="text-[13px] text-gray-700 mb-3 leading-relaxed">{c.analise_por_tipo}</p>
        </>
      )}
      {c.analise_por_produto && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Por produto (nome individual)</p>
          <p className="text-[13px] text-gray-700 mb-3 leading-relaxed">{c.analise_por_produto}</p>
        </>
      )}
      {c.tipos_em_queda?.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 mb-2">Tipos em queda</p>
          <ul className="space-y-1.5 mb-3">
            {c.tipos_em_queda.map((t, i) => (
              <li key={i} className="text-[12px] flex items-start gap-2">
                <TrendingDown className="h-3.5 w-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold">{t.tipo}</span>
                  {t.variacao_litros_pct != null && (
                    <span className="ml-2 text-red-700 font-mono tabular-nums">{Number(t.variacao_litros_pct).toFixed(1)}%</span>
                  )}
                  {t.causa_provavel && <span className="block text-[11px] text-gray-600">{t.causa_provavel}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {(c.produtos_destaque?.length > 0 || c.produtos_preocupantes?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          {c.produtos_destaque?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-2">Produtos em destaque</p>
              <ul className="space-y-1.5">
                {c.produtos_destaque.map((p, i) => (
                  <li key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                    <p className="text-[12.5px] font-semibold text-gray-900">{p.produto}</p>
                    <p className="text-[11.5px] text-emerald-700 mt-0.5">{p.motivo}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.produtos_preocupantes?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 mb-2">Produtos preocupantes</p>
              <ul className="space-y-1.5">
                {c.produtos_preocupantes.map((p, i) => (
                  <li key={i} className="rounded-lg border border-red-200 bg-red-50/50 p-2.5">
                    <p className="text-[12.5px] font-semibold text-gray-900">{p.produto}</p>
                    <p className="text-[11.5px] text-red-700 mt-0.5">{p.motivo}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {c.mix_ideal && (
        <p className="text-[11.5px] text-gray-600 italic border-t border-gray-100 pt-2 mt-3">{c.mix_ideal}</p>
      )}
    </Card>
  );
}

function CardCategoriaAnalise({ a, titulo, icone: Icone = Package, cor = 'blue' }) {
  return (
    <Card icon={Icone} color={cor} titulo={`Analise de ${titulo}`}>
      {a.interpretacao && <p className="text-[13px] text-gray-700 mb-3 leading-relaxed">{a.interpretacao}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {a.grupos_destaque?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-2">Grupos em destaque</p>
            <ul className="space-y-2">
              {a.grupos_destaque.map((g, i) => (
                <li key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12.5px] font-semibold text-gray-900 flex-1">{g.grupo}</span>
                    {g.margem_pct != null && (
                      <span className="font-mono tabular-nums text-[11px] text-emerald-700">{Number(g.margem_pct).toFixed(1)}%</span>
                    )}
                  </div>
                  {g.receita != null && (
                    <p className="text-[11px] text-gray-600 font-mono tabular-nums">{formatCurrency(g.receita)}</p>
                  )}
                  {g.porque && <p className="text-[11.5px] text-emerald-700 mt-1">{g.porque}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {a.grupos_problema?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 mb-2">Grupos em problema</p>
            <ul className="space-y-2">
              {a.grupos_problema.map((g, i) => (
                <li key={i} className="rounded-lg border border-red-200 bg-red-50/50 p-2.5">
                  <p className="text-[12.5px] font-semibold text-gray-900">{g.grupo}</p>
                  {g.motivo && <p className="text-[11.5px] text-red-700 mt-0.5">{g.motivo}</p>}
                  {g.acao && <p className="text-[11px] text-gray-600 mt-1">Acao: {g.acao}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {a.mix_recomendado && (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 mb-1">Mix recomendado</p>
          <p className="text-[12px] text-gray-700 leading-relaxed">{a.mix_recomendado}</p>
        </div>
      )}
      {a.oportunidades?.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 mt-4">Oportunidades</p>
          <ul className="space-y-1">
            {a.oportunidades.map((o, i) => (
              <li key={i} className="text-[12px] text-gray-700 flex items-start gap-1.5">
                <span className="h-1 w-1 rounded-full bg-emerald-500 flex-shrink-0 mt-2" />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function CardVolumesPrecos({ v }) {
  return (
    <Card icon={TrendingUp} color="indigo" titulo="Volumes e precos">
      <p className="text-[13px] text-gray-700 leading-relaxed">{v.analise}</p>
      {v.observacoes?.length > 0 && (
        <ul className="space-y-1 mt-3">
          {v.observacoes.map((o, i) => (
            <li key={i} className="text-[12px] text-gray-700 flex items-start gap-1.5">
              <span className="h-1 w-1 rounded-full bg-indigo-500 flex-shrink-0 mt-2" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CardAlertasProdutos({ a }) {
  return (
    <Card icon={AlertTriangle} color="red" titulo="Produtos em movimento">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {a.produtos_em_queda?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 mb-2">Em queda</p>
            <ul className="space-y-1.5">
              {a.produtos_em_queda.map((p, i) => (
                <li key={i} className="rounded-lg border border-red-200 bg-red-50/50 p-2.5">
                  <div className="flex items-center gap-2">
                    {p.tipo === 'sumiu' ? (
                      <span className="inline-block rounded-full bg-red-600 text-white text-[9px] font-bold uppercase px-1.5 py-0.5">DESAPARECEU</span>
                    ) : (
                      <span className="inline-block rounded-full bg-red-100 text-red-700 text-[9px] font-bold uppercase px-1.5 py-0.5">{p.tipo}</span>
                    )}
                    <span className="text-[12.5px] font-semibold truncate">{p.produto}</span>
                  </div>
                  {p.queda_pct != null && (
                    <p className="text-[11.5px] text-red-700 font-mono tabular-nums mt-1">-{Math.abs(p.queda_pct).toFixed(1)}%</p>
                  )}
                  {p.acao && <p className="text-[11px] text-gray-600 mt-1">{p.acao}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {a.produtos_em_alta_para_replicar?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-2">Em alta — replicar</p>
            <ul className="space-y-1.5">
              {a.produtos_em_alta_para_replicar.map((p, i) => (
                <li key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                  <p className="text-[12.5px] font-semibold truncate">{p.produto}</p>
                  {p.crescimento_pct != null && (
                    <p className="text-[11.5px] text-emerald-700 font-mono tabular-nums mt-0.5">+{Number(p.crescimento_pct).toFixed(1)}%</p>
                  )}
                  {p.porque_funcionou && <p className="text-[11px] text-gray-600 mt-1">{p.porque_funcionou}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function CardMargens({ m }) {
  return (
    <Card icon={Activity} color="blue" titulo="Margens">
      {m.interpretacao_yoy && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">vs Ano Anterior</p>
          <p className="text-[13px] text-gray-700 leading-relaxed mb-3">{m.interpretacao_yoy}</p>
        </>
      )}
      {m.interpretacao_trimestre && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Trimestre vs Trimestre</p>
          <p className="text-[13px] text-gray-700 leading-relaxed mb-3">{m.interpretacao_trimestre}</p>
        </>
      )}
      {m.interpretacao && <p className="text-[13px] text-gray-700 leading-relaxed mb-3">{m.interpretacao}</p>}
      {m.causas?.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Causas provaveis</p>
          <ul className="space-y-1">
            {m.causas.map((c, i) => (
              <li key={i} className="text-[12px] text-gray-700">• {c}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function CardLinhasCriticas({ linhas }) {
  return (
    <Card icon={ListOrdered} color="red" titulo="Linhas criticas da DRE">
      <Tabela headers={['Linha', 'Atual', 'YoY', 'Var %', 'Impacto']}
        rows={linhas.map(l => [
          <span className="font-medium">{l.linha}</span>,
          <span className="font-mono tabular-nums">{formatCurrency(l.valor_atual || 0)}</span>,
          <span className="font-mono tabular-nums text-gray-500">{formatCurrency(l.valor_yoy || 0)}</span>,
          <span className={`font-mono tabular-nums font-semibold ${(l.variacao_yoy_pct || l.variacao_pct) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {(l.variacao_yoy_pct ?? l.variacao_pct) != null ? `${Number(l.variacao_yoy_pct ?? l.variacao_pct) >= 0 ? '+' : ''}${Number(l.variacao_yoy_pct ?? l.variacao_pct).toFixed(1)}%` : '—'}
          </span>,
          <Badge cor={l.impacto === 'alto' ? 'red' : l.impacto === 'medio' ? 'amber' : 'gray'}>{l.impacto}</Badge>,
        ])} />
      {linhas.some(l => l.comentario) && (
        <ul className="space-y-1 mt-3 border-t border-gray-100 pt-3">
          {linhas.filter(l => l.comentario).map((l, i) => (
            <li key={i} className="text-[11.5px] text-gray-600"><strong>{l.linha}:</strong> {l.comentario}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CardCustosDespesas({ c }) {
  return (
    <Card icon={Wallet} color="amber" titulo="Custos e despesas">
      {c.maiores_itens?.length > 0 && (
        <Tabela headers={['Item', 'Valor', '% Receita', 'Comentario']}
          rows={c.maiores_itens.map(i => [
            <span className="font-medium">{i.nome}</span>,
            <span className="font-mono tabular-nums">{formatCurrency(i.valor || 0)}</span>,
            <span className="font-mono tabular-nums">{Number(i.pct_receita || 0).toFixed(1)}%</span>,
            i.comentario,
          ])} />
      )}
      {c.avaliacao && (
        <div className="mt-3">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            c.avaliacao === 'preocupante' ? 'bg-red-100 text-red-700'
              : c.avaliacao === 'alto' ? 'bg-amber-100 text-amber-700'
              : 'bg-emerald-100 text-emerald-700'
          }`}>
            Avaliacao: {c.avaliacao}
          </span>
        </div>
      )}
      {c.excessos?.length > 0 && (
        <ul className="space-y-1 mt-3">
          {c.excessos.map((e, i) => (
            <li key={i} className="text-[12px] text-gray-700">• {e}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CardVariacaoCaixa({ v }) {
  return (
    <Card icon={Wallet} color="emerald" titulo="Variacao de caixa">
      <p className="text-[13px] text-gray-700 leading-relaxed">{v.interpretacao}</p>
      {v.causas_principais?.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 mt-3">Causas principais</p>
          <ul className="space-y-1">
            {v.causas_principais.map((c, i) => (
              <li key={i} className="text-[12px] text-gray-700">• {c}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function CardPadraoGruposFluxo({ p }) {
  return (
    <Card icon={Layers} color="blue" titulo="Padrao por grupo (caixa)">
      {p.entradas_principais?.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-2">Entradas principais</p>
          <div className="grid gap-1.5 mb-4">
            {p.entradas_principais.slice(0, 6).map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-[12px]">
                <span className="flex-1 truncate font-medium text-gray-800">{e.grupo}</span>
                <span className="font-mono tabular-nums text-emerald-700">{formatCurrency(e.valor || 0)}</span>
                <span className="font-mono tabular-nums text-gray-500 w-14 text-right">{Number(e.participacao_pct || 0).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
      {p.saidas_crescentes?.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 mb-2">Saidas crescentes vs YoY</p>
          <ul className="space-y-1.5">
            {p.saidas_crescentes.map((s, i) => (
              <li key={i} className="text-[12px] flex items-start gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold">{s.grupo}</span>
                  {s.variacao_yoy_pct != null && (
                    <span className="ml-2 font-mono tabular-nums text-red-700">+{Number(s.variacao_yoy_pct).toFixed(1)}%</span>
                  )}
                  {s.comentario && <span className="block text-[11px] text-gray-600">{s.comentario}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {p.outliers?.length > 0 && (
        <ul className="space-y-1 mt-3 border-t border-gray-100 pt-3">
          {p.outliers.map((o, i) => (
            <li key={i} className="text-[11.5px] text-gray-600">• {o}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CardConcentracoes({ c }) {
  return (
    <Card icon={AlertTriangle} color="amber" titulo="Concentracoes de risco">
      <div className="space-y-2">
        {c.map((item, i) => (
          <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12.5px] font-semibold">{item.conta_gerencial || item.conta}</span>
              {item.pct_do_total != null && (
                <span className="ml-auto font-mono tabular-nums text-[11.5px] text-amber-700">{Number(item.pct_do_total).toFixed(1)}%</span>
              )}
            </div>
            {item.risco && <p className="text-[11.5px] text-gray-700 mb-1">{item.risco}</p>}
            {item.sugestao && <p className="text-[11px] text-gray-600 italic">{item.sugestao}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function CardDiagnosticoIntegrado({ d }) {
  return (
    <Card icon={GitBranch} color="indigo" titulo="Diagnostico integrado">
      <p className="text-[14px] text-gray-800 leading-relaxed">{d}</p>
    </Card>
  );
}

function CardGargalos({ g }) {
  return (
    <Card icon={AlertCircle} color="red" titulo="Gargalos criticos">
      <div className="space-y-2">
        {g.map((item, i) => (
          <div key={i} className="rounded-lg border border-red-200 bg-red-50/50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12.5px] font-semibold">{item.gargalo}</span>
              {item.impacto && (
                <Badge cor={item.impacto === 'alto' ? 'red' : item.impacto === 'medio' ? 'amber' : 'gray'}>{item.impacto}</Badge>
              )}
            </div>
            {item.evidencia_cross && <p className="text-[11.5px] text-gray-700">{item.evidencia_cross}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function CardAlavancas({ a }) {
  return (
    <Card icon={Target} color="emerald" titulo="Alavancas prioritarias">
      <div className="space-y-2">
        {a.map((item, i) => (
          <div key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-[12.5px] font-semibold mb-1.5">{item.alavanca}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              {item.efeito_vendas && <div><span className="text-gray-500 font-semibold">Vendas:</span> {item.efeito_vendas}</div>}
              {item.efeito_dre && <div><span className="text-gray-500 font-semibold">DRE:</span> {item.efeito_dre}</div>}
              {item.efeito_caixa && <div><span className="text-gray-500 font-semibold">Caixa:</span> {item.efeito_caixa}</div>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CardContradicoes({ c }) {
  return (
    <Card icon={AlertTriangle} color="amber" titulo="Contradicoes a investigar">
      <ul className="space-y-2">
        {c.map((item, i) => (
          <li key={i} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <p className="text-[12.5px] text-gray-900 font-medium">{item.observacao}</p>
            {item.o_que_investigar && <p className="text-[11.5px] text-gray-700 mt-1 italic">{item.o_que_investigar}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CardPlano90({ p }) {
  return (
    <Card icon={Calendar} color="blue" titulo="Plano de 90 dias">
      <div className="space-y-2">
        {p.map((item, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5">{item.semana}</span>
              <span className="text-[12.5px] font-semibold flex-1">{item.acao}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-gray-600 ml-1">
              {item.responsavel_sugerido && <div><span className="font-semibold">Resp:</span> {item.responsavel_sugerido}</div>}
              {item.kpi_alvo && <div><span className="font-semibold">KPI:</span> {item.kpi_alvo}</div>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CardComparativo({ c }) {
  return (
    <Card icon={ListOrdered} color="cyan" titulo="Comparativos temporais">
      {c.vs_yoy && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">vs Ano anterior</p>
          <p className="text-[13px] text-gray-700 leading-relaxed">{c.vs_yoy}</p>
        </div>
      )}
      {c.vs_trimestre && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">vs Trimestre anterior</p>
          <p className="text-[13px] text-gray-700 leading-relaxed">{c.vs_trimestre}</p>
        </div>
      )}
      {c.vs_periodo_anterior && (
        <p className="text-[13px] text-gray-700 leading-relaxed mb-3">{c.vs_periodo_anterior}</p>
      )}
      {c.tendencia_direcao && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          c.tendencia_direcao === 'crescimento' ? 'bg-emerald-100 text-emerald-700' :
          c.tendencia_direcao === 'queda' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
        }`}>
          Tendencia: {c.tendencia_direcao}
        </span>
      )}
      {c.causas_provaveis?.length > 0 && (
        <ul className="space-y-1 mt-3 border-t border-gray-100 pt-3">
          {c.causas_provaveis.map((x, i) => (
            <li key={i} className="text-[12px] text-gray-700">• {x}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CardComparativoYoy({ c }) {
  return (
    <Card icon={ListOrdered} color="cyan" titulo="Comparativo YoY (Caixa)">
      {c.o_que_mudou && <p className="text-[13px] text-gray-700 leading-relaxed mb-2">{c.o_que_mudou}</p>}
      {c.por_que?.length > 0 && (
        <ul className="space-y-1">
          {c.por_que.map((x, i) => <li key={i} className="text-[12px] text-gray-700">• {x}</li>)}
        </ul>
      )}
    </Card>
  );
}

function CardTendencia({ t }) {
  const direcao = t.direcao || t.saldo_trajetoria;
  return (
    <Card icon={TrendingUp} color="indigo" titulo="Tendencia">
      {direcao && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold mb-3 ${
          direcao === 'melhora' || direcao === 'sube' ? 'bg-emerald-100 text-emerald-700'
            : direcao === 'piora' || direcao === 'desce' ? 'bg-red-100 text-red-700'
            : 'bg-gray-100 text-gray-700'
        }`}>Direcao: {direcao}</span>
      )}
      {t.resumo_6m && <p className="text-[13px] text-gray-700 leading-relaxed mb-3">{t.resumo_6m}</p>}
      {t.risco_liquidez_proximos_meses && (
        <p className="text-[12px] text-gray-700 mb-2">Risco de liquidez: <strong>{t.risco_liquidez_proximos_meses}</strong></p>
      )}
      {t.pontos_inflexao?.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Pontos de inflexao</p>
          <ul className="space-y-1">
            {t.pontos_inflexao.map((p, i) => <li key={i} className="text-[12px] text-gray-700">• {p}</li>)}
          </ul>
        </>
      )}
    </Card>
  );
}

function CardRankingEmpresas({ r }) {
  return (
    <Card icon={Award} color="amber" titulo="Ranking de empresas">
      <Tabela headers={['#', 'Empresa', 'Receita', 'Margem %', '% Rede', 'Avaliacao']}
        rows={r.map((e, i) => [
          <span className="font-mono text-gray-400">{e.posicao || i + 1}</span>,
          <span className="font-medium">{e.empresa}</span>,
          <span className="font-mono tabular-nums">{formatCurrency(e.receita || 0)}</span>,
          <span className="font-mono tabular-nums">{Number(e.margem_pct || 0).toFixed(1)}%</span>,
          <span className="font-mono tabular-nums text-gray-500">{Number(e.participacao_pct || 0).toFixed(1)}%</span>,
          <Badge cor={e.avaliacao === 'destaque' ? 'emerald' : e.avaliacao === 'atencao' ? 'red' : 'gray'}>{e.avaliacao}</Badge>,
        ])} />
    </Card>
  );
}

function CardDispersao({ d }) {
  return (
    <Card icon={Award} color="violet" titulo="Analise da rede">
      {d.concentracao && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Concentracao</p>
          <p className="text-[13px] text-gray-700 leading-relaxed">{d.concentracao}</p>
        </div>
      )}
      {d.outliers?.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Outliers</p>
          <ul className="space-y-1">{d.outliers.map((o, i) => <li key={i} className="text-[12px] text-gray-700">• {o}</li>)}</ul>
        </div>
      )}
      {d.padrao_rede && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Padrao da rede</p>
          <p className="text-[13px] text-gray-700 leading-relaxed">{d.padrao_rede}</p>
        </div>
      )}
    </Card>
  );
}

function CardAlertas({ alertas }) {
  return (
    <Card icon={AlertTriangle} color="red" titulo="Alertas">
      <div className="space-y-2">
        {alertas.map((a, i) => {
          const sev = a.severidade || 'media';
          const cls = sev === 'alta' ? 'border-red-300 bg-red-50/70'
            : sev === 'media' ? 'border-amber-300 bg-amber-50/60'
            : 'border-gray-200 bg-gray-50';
          return (
            <div key={i} className={`rounded-lg border px-3 py-2 ${cls}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <Badge cor={sev === 'alta' ? 'red' : sev === 'media' ? 'amber' : 'gray'}>{sev}</Badge>
                <p className="text-[12.5px] font-semibold text-gray-900">{a.titulo}</p>
              </div>
              <p className="text-[12px] text-gray-700">{a.detalhe}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CardRiscos({ riscos }) {
  return (
    <Card icon={AlertTriangle} color="red" titulo="Riscos">
      <ul className="space-y-2">
        {riscos.map((r, i) => {
          const sev = r.severidade || 'media';
          return (
            <li key={i} className="rounded-lg border border-gray-200 bg-white p-2.5">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge cor={sev === 'alta' ? 'red' : sev === 'media' ? 'amber' : 'gray'}>{sev}</Badge>
                <p className="text-[12.5px] font-semibold text-gray-900">{r.risco}</p>
              </div>
              {r.mitigacao && <p className="text-[11.5px] text-gray-700">Mitigacao: {r.mitigacao}</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CardOportunidades({ o }) {
  const cats = [
    ['Aumentar receita/ticket', o.aumentar_ticket || o.aumentar_receita || o.aumentar_entradas],
    ['Melhorar mix', o.melhorar_mix],
    ['Crescer conveniencia', o.crescer_conveniencia],
    ['Reduzir custos/ineficiencias', o.reduzir_custos || o.reduzir_ineficiencias || o.reduzir_saidas],
    ['Otimizar margens/prazo', o.otimizar_margens || o.otimizar_prazo],
  ].filter(([, l]) => Array.isArray(l) && l.length > 0);
  if (cats.length === 0) return null;
  return (
    <Card icon={Lightbulb} color="emerald" titulo="Oportunidades">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cats.map(([titulo, lista]) => (
          <div key={titulo}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">{titulo}</p>
            <ul className="space-y-1">
              {lista.map((item, i) => (
                <li key={i} className="text-[12px] text-gray-700 flex items-start gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-emerald-500 flex-shrink-0 mt-2" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CardRecomendacoes({ r }) {
  return (
    <Card icon={Target} color="blue" titulo="Recomendacoes estrategicas">
      <div className="space-y-2.5">
        {r.map((item, i) => {
          const prio = item.prioridade || 'media';
          const corPrio = prio === 'alta' ? 'red' : prio === 'media' ? 'amber' : 'gray';
          return (
            <div key={i} className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5">
              <div className="flex items-start gap-2 mb-1">
                <Badge cor={corPrio}>{prio}</Badge>
                <p className="text-[13px] font-semibold text-gray-900 leading-tight flex-1">{item.acao}</p>
              </div>
              {(item.justificativa || item.impacto_esperado || item.efeito_em_caixa || item.impacto) && (
                <p className="text-[12px] text-gray-600 leading-relaxed ml-12">{item.justificativa || item.impacto_esperado || item.efeito_em_caixa || item.impacto}</p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CardPerguntas({ perguntas }) {
  return (
    <Card icon={HelpCircle} color="violet" titulo="Perguntas para o gestor refletir">
      <ul className="space-y-1.5">
        {perguntas.map((p, i) => (
          <li key={i} className="text-[12.5px] text-gray-700 flex items-start gap-2">
            <span className="font-mono text-[11px] text-gray-400 w-4 flex-shrink-0">{i + 1}.</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Helpers visuais ───────────────────────────────────────────

function CardFormasPagamento({ f }) {
  if (!f) return null;
  return (
    <Card icon={CreditCard} color="indigo" titulo="Formas de pagamento">
      {f.interpretacao && <p className="text-[13px] text-gray-700 mb-3 leading-relaxed">{f.interpretacao}</p>}
      {f.distribuicao?.length > 0 && (
        <Tabela
          headers={['Forma / Administradora', 'Valor', '% Receita', 'Qtd', 'Ticket medio', 'Taxa', 'vs YoY']}
          rows={f.distribuicao.map(d => {
            const taxaReal = d.fonte_taxa === 'real (ADMINISTRADORA)';
            return [
              <span className="font-medium">{d.forma}</span>,
              <span className="font-mono tabular-nums">{formatCurrency(d.valor || 0)}</span>,
              <span className="font-mono tabular-nums">{Number(d.pct_receita ?? d.participacao_pct ?? 0).toFixed(1)}%</span>,
              <span className="font-mono tabular-nums text-gray-500">{Number(d.qtd_transacoes || 0)}</span>,
              <span className="font-mono tabular-nums">{formatCurrency(d.ticket_medio || 0)}</span>,
              <span className="inline-flex items-center gap-1">
                <span className={`font-mono tabular-nums ${taxaReal ? 'text-red-700 font-semibold' : 'text-amber-700'}`}>
                  {Number(d.custo_pct || 0).toFixed(2)}%
                </span>
                <span className={`inline-block rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase ${
                  taxaReal ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                }`} title={taxaReal ? 'Taxa real da administradora (percentualComissao)' : 'Taxa estimada por heuristica'}>
                  {taxaReal ? 'real' : 'est.'}
                </span>
              </span>,
              d.variacao_yoy_pct != null ? (
                <span className={`font-mono tabular-nums font-semibold ${d.variacao_yoy_pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {d.variacao_yoy_pct >= 0 ? '+' : ''}{Number(d.variacao_yoy_pct).toFixed(1)}%
                </span>
              ) : <span className="text-gray-400">—</span>,
            ];
          })} />
      )}
      {f.concentracao_risco && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-amber-900">{f.concentracao_risco}</p>
        </div>
      )}
      {f.custo_maquineta_estimado && (
        <div className="mt-2 text-[11.5px] text-gray-600">
          <span className="font-semibold">Custo estimado de maquineta/taxa:</span> {f.custo_maquineta_estimado}
        </div>
      )}
      {f.recomendacoes?.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 mt-3">Sugestoes</p>
          <ul className="space-y-1">
            {f.recomendacoes.map((r, i) => (
              <li key={i} className="text-[12px] text-gray-700 flex items-start gap-1.5">
                <span className="h-1 w-1 rounded-full bg-indigo-500 flex-shrink-0 mt-2" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function CardIntegridadeDados({ i }) {
  if (!i) return null;
  const temAlerta = (i.alertas?.length || 0) > 0;
  return (
    <Card icon={ShieldAlert} color={temAlerta ? 'amber' : 'gray'} titulo="Integridade dos dados">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">Receita em "Outros"</p>
          <p className="text-[13px] font-bold text-gray-800 tabular-nums">
            {Number(i.pct_outros || 0).toFixed(1)}%
          </p>
          <p className="text-[10.5px] text-gray-500">produtos sem classificacao (tipoProduto/tipoGrupo)</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">Cancelamentos</p>
          <p className="text-[13px] font-bold text-gray-800 tabular-nums">
            {Number(i.pct_canceladas || 0).toFixed(1)}%
          </p>
          <p className="text-[10.5px] text-gray-500">sobre total de vendas (autorizadas + canceladas)</p>
        </div>
      </div>
      {i.alertas?.length > 0 && (
        <ul className="space-y-1.5">
          {i.alertas.map((a, idx) => (
            <li key={idx} className="text-[12px] text-amber-800 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Card({ icon: Icon, color, titulo, children }) {
  const colorMap = {
    blue: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
    indigo: 'text-indigo-600 bg-indigo-50',
    cyan: 'text-cyan-600 bg-cyan-50',
    violet: 'text-violet-600 bg-violet-50',
    gray: 'text-gray-600 bg-gray-50',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.blue}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  );
}

function Tabela({ headers, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50/80 border-b border-gray-100">
          <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            {headers.map((h, i) => <th key={i} className="px-3 py-2">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => <td key={j} className="px-3 py-1.5 text-[12px] text-gray-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ cor = 'gray', children }) {
  const map = {
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${map[cor]}`}>
      {children}
    </span>
  );
}
