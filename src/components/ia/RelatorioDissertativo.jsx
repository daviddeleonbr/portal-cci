// Relatorio dissertativo para impressao em PDF A4 retrato.
// Converte o JSON estruturado da IA em prosa formal de consultoria.
// Fica invisivel em tela (display:none) e so aparece no @media print.

import { formatCurrency } from '../../utils/format';

const TITULO_POR_ABA = {
  vendas: 'Relatorio de Analise Tecnica Comercial',
  dre: 'Relatorio de Analise Tecnica da DRE Gerencial',
  fluxo: 'Relatorio de Analise Tecnica do Fluxo de Caixa',
  geral: 'Relatorio de Analise Tecnica · Diagnostico Estrategico Integrado',
};

export default function RelatorioDissertativo({ aba, insights, empresa, periodo, modoRede = false }) {
  if (!insights) return null;

  const dataAgora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const titulo = TITULO_POR_ABA[aba] || 'Analise Empresarial';

  return (
    <div className="relatorio-dissertativo">
      <style>{`
        .relatorio-dissertativo { display: none; }
        @media print {
          html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body, main, #root, .app-bg, .min-h-screen { background: white !important; background-image: none !important; }
          [aria-hidden="true"] { display: none !important; }
          aside, header { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .print-block-only { display: block !important; }
          .relatorio-dissertativo {
            display: block !important;
            font-family: Georgia, 'Times New Roman', serif;
            color: #111;
            max-width: 100%;
            padding: 0;
          }
          .rd-header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .rd-header h1 { font-size: 15pt; font-weight: bold; margin: 0 0 6px 0; }
          .rd-header .subtitulo { font-size: 11pt; margin: 0 0 3px 0; color: #333; }
          .rd-header .meta { font-size: 9pt; color: #666; margin: 2px 0 0 0; }

          /* Fluxo natural entre paginas: secoes NAO sao forcadas a caber em uma pagina.
             Apenas garantimos que (a) titulo nao fique sozinho no fim da pagina,
             (b) blocos pequenos (tabela, recomendacao) nao quebrem ao meio. */
          .rd-secao { margin-bottom: 14px; }
          .rd-secao h2 {
            font-size: 12pt; font-weight: bold; color: #000;
            margin: 12px 0 6px 0; padding-bottom: 2px;
            border-bottom: 1px solid #999;
            text-transform: uppercase; letter-spacing: 0.5px;
            page-break-after: avoid; break-after: avoid;
          }
          .rd-secao h3 {
            font-size: 10.5pt; font-weight: bold; color: #222;
            margin: 8px 0 4px 0;
            page-break-after: avoid; break-after: avoid;
          }
          .rd-secao p {
            font-size: 10.5pt; line-height: 1.45; text-align: justify;
            margin: 0 0 6px 0; color: #222;
            orphans: 3; widows: 3;
          }
          .rd-secao ul, .rd-secao ol { margin: 4px 0 8px 20px; padding: 0; }
          .rd-secao ul li, .rd-secao ol li {
            font-size: 10pt; line-height: 1.4; margin-bottom: 3px; color: #222;
            page-break-inside: avoid; break-inside: avoid;
          }
          .rd-secao .destaque { font-weight: 600; }

          .rd-tag {
            display: inline-block; padding: 1px 6px; border-radius: 3px;
            font-size: 8.5pt; font-weight: 600; text-transform: uppercase;
            border: 1px solid #666;
          }
          .rd-tag-saudavel { background: #e8f5e9; color: #1b5e20; border-color: #4caf50; }
          .rd-tag-alerta { background: #fff8e1; color: #7a5200; border-color: #ffb300; }
          .rd-tag-critico { background: #fce8e8; color: #8b1a1a; border-color: #e53935; }
          .rd-tag-alta { background: #fce8e8; color: #8b1a1a; border-color: #e53935; }
          .rd-tag-media { background: #fff8e1; color: #7a5200; border-color: #ffb300; }
          .rd-tag-baixa { background: #eeeeee; color: #333; border-color: #999; }

          .rd-tabela {
            width: 100%; border-collapse: collapse;
            margin: 6px 0 10px 0; font-size: 9.5pt;
            page-break-inside: avoid; break-inside: avoid;
          }
          .rd-tabela th, .rd-tabela td { border: 0.5pt solid #888; padding: 3px 6px; text-align: left; }
          .rd-tabela th { background: #eee; font-weight: bold; }
          .rd-tabela td.num { text-align: right; font-family: monospace; }
          /* Para tabelas longas (linhas criticas, plano 90 dias), permite quebra entre linhas */
          .rd-tabela.longa { page-break-inside: auto; break-inside: auto; }
          .rd-tabela.longa tr { page-break-inside: avoid; break-inside: avoid; }
          .rd-tabela thead { display: table-header-group; }

          .rd-footer {
            margin-top: 20px; padding-top: 10px; border-top: 1px solid #999;
            font-size: 8.5pt; color: #444;
            page-break-inside: avoid; break-inside: avoid;
          }
          .rd-footer .cci-info {
            display: flex; justify-content: space-between; align-items: flex-start;
            gap: 16px; margin-bottom: 8px;
          }
          .rd-footer .cci-info .esquerda { text-align: left; }
          .rd-footer .cci-info .esquerda .nome { font-size: 9pt; font-weight: 600; color: #000; margin: 0; }
          .rd-footer .cci-info .esquerda .cnpj { margin: 2px 0 0 0; font-family: monospace; color: #555; }
          .rd-footer .cci-info .direita { text-align: right; font-size: 8pt; color: #777; }
          .rd-footer .nota {
            font-size: 7.5pt; color: #888; text-align: center;
            margin-top: 6px; font-style: italic;
          }

          .rd-bloco-recomendacao {
            border-left: 2pt solid #666; padding: 4px 10px;
            margin: 6px 0;
            page-break-inside: avoid; break-inside: avoid;
          }
          .rd-bloco-recomendacao.prio-alta { border-left-color: #c62828; }
          .rd-bloco-recomendacao.prio-media { border-left-color: #e08600; }
          .rd-bloco-recomendacao.prio-baixa { border-left-color: #777; }

          @page {
            size: A4 portrait;
            margin: 15mm 15mm 18mm 15mm;
            @bottom-right {
              content: "Pagina " counter(page) " de " counter(pages);
              font-family: Georgia, 'Times New Roman', serif;
              font-size: 8pt;
              color: #777;
            }
          }
        }
      `}</style>

      <div className="rd-header">
        <h1>{titulo}</h1>
        <p className="subtitulo">{empresa?.nome}{empresa?.cnpj ? ` — CNPJ ${empresa.cnpj}` : ''}</p>
        <p className="meta">Periodo de referencia: {periodo}{modoRede ? ' (rede consolidada)' : ''}</p>
      </div>

      <SecaoResumoExecutivo insights={insights} />
      {aba === 'vendas' && <SecoesVendas insights={insights} modoRede={modoRede} />}
      {aba === 'dre' && <SecoesDRE insights={insights} />}
      {aba === 'fluxo' && <SecoesFluxo insights={insights} />}
      {aba === 'geral' && <SecoesGeral insights={insights} />}
      <SecaoComparativos insights={insights} />
      <SecaoAlertasRiscos insights={insights} />
      <SecaoOportunidades insights={insights} />
      <SecaoRecomendacoes insights={insights} />
      <SecaoPerguntas insights={insights} />

      <div className="rd-footer">
        <div className="cci-info">
          <div className="esquerda">
            <p className="nome">CCI ASSESSORIA E CONSULTORIA INTELIGENTE LTDA</p>
            <p className="cnpj">CNPJ 57.268.175/0001-00</p>
          </div>
          <div className="direita">
            <p style={{ margin: 0 }}>Impresso em {dataAgora}</p>
          </div>
        </div>
        <p className="nota">
          Relatorio gerado por Claude (IA) com supervisao da CCI. Os dados sao provenientes da integracao Webposto e das mascaras configuradas pela CCI.
          O documento deve ser lido em conjunto com os relatorios quantitativos correspondentes.
        </p>
      </div>
    </div>
  );
}

// ─── Secoes ─────────────────────────────────────────────────

function SecaoResumoExecutivo({ insights }) {
  const re = insights.resumo_executivo || {};
  const situacao = re.situacao || re.situacao_caixa;
  const tagClass = situacao === 'saudavel' ? 'rd-tag-saudavel'
    : situacao === 'critico' ? 'rd-tag-critico' : 'rd-tag-alerta';
  const texto = re.resumo ?? re.sintese ?? re.saude_liquidez ?? '';
  const positivos = re.destaques_positivos ?? re.pontos_positivos ?? [];
  const negativos = re.destaques_negativos ?? re.pontos_negativos ?? re.alertas_agudos ?? [];

  return (
    <section className="rd-secao">
      <h2>1. Resumo Executivo</h2>
      {situacao && (
        <p>
          <span className={`rd-tag ${tagClass}`}>Situacao: {String(situacao).toUpperCase()}</span>
        </p>
      )}
      {texto && <p>{texto}</p>}
      {positivos.length > 0 && (
        <>
          <h3>Destaques positivos</h3>
          <ul>{positivos.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </>
      )}
      {negativos.length > 0 && (
        <>
          <h3>Pontos de atencao</h3>
          <ul>{negativos.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </>
      )}
    </section>
  );
}

function SecoesVendas({ insights, modoRede }) {
  return (
    <>
      {insights.mix_produto && (
        <section className="rd-secao">
          <h2>2. Mix de Produto</h2>
          {insights.mix_produto.interpretacao && <p>{insights.mix_produto.interpretacao}</p>}
          {insights.mix_produto.concentracao?.length > 0 && (
            <table className="rd-tabela">
              <thead><tr><th>Categoria</th><th className="num">% Receita</th><th className="num">% Margem</th><th>Comentario</th></tr></thead>
              <tbody>
                {insights.mix_produto.concentracao.map((c, i) => (
                  <tr key={i}>
                    <td>{c.categoria}</td>
                    <td className="num">{Number(c.pct_receita || 0).toFixed(1)}%</td>
                    <td className="num">{Number(c.pct_margem || 0).toFixed(1)}%</td>
                    <td>{c.comentario || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {insights.mix_produto.top_produtos?.length > 0 && (
            <>
              <h3>Produtos de maior receita</h3>
              <ul>
                {insights.mix_produto.top_produtos.slice(0, 6).map((p, i) => (
                  <li key={i}><span className="destaque">{p.nome}</span> — {formatCurrency(p.receita || 0)} ({Number(p.participacao_pct || 0).toFixed(1)}% da receita){p.avaliacao ? `. ${p.avaliacao}` : ''}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {insights.diagnostico_grupos && (
        <section className="rd-secao">
          <h2>3. Diagnostico por Grupo</h2>
          {insights.diagnostico_grupos.interpretacao && <p>{insights.diagnostico_grupos.interpretacao}</p>}
          {insights.diagnostico_grupos.grupos_problema?.length > 0 && (
            <>
              <h3>Grupos em problema</h3>
              <ul>
                {insights.diagnostico_grupos.grupos_problema.map((g, i) => (
                  <li key={i}><span className="destaque">{g.grupo}</span> — {g.motivo}{g.acao_sugerida ? ` Acao sugerida: ${g.acao_sugerida}` : ''}</li>
                ))}
              </ul>
            </>
          )}
          {insights.diagnostico_grupos.grupos_destaque?.length > 0 && (
            <>
              <h3>Grupos em destaque</h3>
              <ul>
                {insights.diagnostico_grupos.grupos_destaque.map((g, i) => (
                  <li key={i}><span className="destaque">{g.grupo}</span> — {g.porque}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {insights.combustiveis && (
        <section className="rd-secao">
          <h2>4. Analise de Combustiveis por Tipo</h2>
          {insights.combustiveis.analise_por_tipo && <p>{insights.combustiveis.analise_por_tipo}</p>}
          {insights.combustiveis.tipos_em_queda?.length > 0 && (
            <>
              <h3>Tipos em queda de volume</h3>
              <ul>
                {insights.combustiveis.tipos_em_queda.map((t, i) => (
                  <li key={i}><span className="destaque">{t.tipo}</span>{t.variacao_litros_pct != null ? ` — ${Number(t.variacao_litros_pct).toFixed(1)}% em litros` : ''}{t.causa_provavel ? `. ${t.causa_provavel}` : ''}</li>
                ))}
              </ul>
            </>
          )}
          {insights.combustiveis.mix_ideal && <p><em>{insights.combustiveis.mix_ideal}</em></p>}
        </section>
      )}

      {insights.volumes_precos?.analise && (
        <section className="rd-secao">
          <h2>5. Volumes e Precos</h2>
          <p>{insights.volumes_precos.analise}</p>
          {insights.volumes_precos.observacoes?.length > 0 && (
            <ul>{insights.volumes_precos.observacoes.map((o, i) => <li key={i}>{o}</li>)}</ul>
          )}
        </section>
      )}

      {insights.alertas_produtos && (
        <section className="rd-secao">
          <h2>6. Produtos em Movimento</h2>
          {insights.alertas_produtos.produtos_em_queda?.length > 0 && (
            <>
              <h3>Produtos em queda</h3>
              <ul>
                {insights.alertas_produtos.produtos_em_queda.map((p, i) => (
                  <li key={i}>
                    <span className="destaque">{p.produto}</span>
                    {p.tipo === 'sumiu' ? ' — DESAPARECEU' : p.queda_pct != null ? ` — queda de ${Math.abs(Number(p.queda_pct)).toFixed(1)}% (${p.tipo})` : ''}
                    {p.acao ? `. Acao: ${p.acao}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
          {insights.alertas_produtos.produtos_em_alta_para_replicar?.length > 0 && (
            <>
              <h3>Produtos em alta — replicar o que funcionou</h3>
              <ul>
                {insights.alertas_produtos.produtos_em_alta_para_replicar.map((p, i) => (
                  <li key={i}>
                    <span className="destaque">{p.produto}</span>
                    {p.crescimento_pct != null ? ` — crescimento de ${Number(p.crescimento_pct).toFixed(1)}%` : ''}
                    {p.porque_funcionou ? `. ${p.porque_funcionou}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {modoRede && insights.ranking_empresas?.length > 0 && (
        <section className="rd-secao">
          <h2>7. Ranking de Empresas da Rede</h2>
          <table className="rd-tabela longa">
            <thead><tr><th>#</th><th>Empresa</th><th className="num">Receita</th><th className="num">Margem %</th><th className="num">% da Rede</th><th>Avaliacao</th></tr></thead>
            <tbody>
              {insights.ranking_empresas.map((r, i) => (
                <tr key={i}>
                  <td>{r.posicao || i + 1}</td>
                  <td>{r.empresa}</td>
                  <td className="num">{formatCurrency(r.receita || 0)}</td>
                  <td className="num">{Number(r.margem_pct || 0).toFixed(1)}%</td>
                  <td className="num">{Number(r.participacao_pct || 0).toFixed(1)}%</td>
                  <td>{r.avaliacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {modoRede && insights.dispersao && (
        <section className="rd-secao">
          <h2>8. Analise de Dispersao da Rede</h2>
          {insights.dispersao.concentracao && <><h3>Concentracao</h3><p>{insights.dispersao.concentracao}</p></>}
          {insights.dispersao.outliers?.length > 0 && (
            <><h3>Outliers</h3><ul>{insights.dispersao.outliers.map((o, i) => <li key={i}>{o}</li>)}</ul></>
          )}
          {insights.dispersao.padrao_rede && <><h3>Padrao da rede</h3><p>{insights.dispersao.padrao_rede}</p></>}
        </section>
      )}
    </>
  );
}

function SecoesDRE({ insights }) {
  return (
    <>
      {insights.margens && (
        <section className="rd-secao">
          <h2>2. Analise de Margens</h2>
          {insights.margens.interpretacao_yoy && (<><h3>vs. Ano Anterior</h3><p>{insights.margens.interpretacao_yoy}</p></>)}
          {insights.margens.interpretacao_trimestre && (<><h3>Trimestre vs. Trimestre</h3><p>{insights.margens.interpretacao_trimestre}</p></>)}
          {insights.margens.interpretacao && <p>{insights.margens.interpretacao}</p>}
          {insights.margens.causas?.length > 0 && (
            <><h3>Causas provaveis</h3><ul>{insights.margens.causas.map((c, i) => <li key={i}>{c}</li>)}</ul></>
          )}
        </section>
      )}

      {insights.linhas_criticas?.length > 0 && (
        <section className="rd-secao">
          <h2>3. Linhas Criticas da DRE</h2>
          <table className="rd-tabela longa">
            <thead><tr><th>Linha</th><th className="num">Atual</th><th className="num">YoY</th><th className="num">Var %</th><th>Impacto</th></tr></thead>
            <tbody>
              {insights.linhas_criticas.map((l, i) => {
                const varPct = l.variacao_yoy_pct ?? l.variacao_pct;
                return (
                  <tr key={i}>
                    <td>{l.linha}</td>
                    <td className="num">{formatCurrency(l.valor_atual || 0)}</td>
                    <td className="num">{formatCurrency(l.valor_yoy || 0)}</td>
                    <td className="num">{varPct != null ? `${Number(varPct) >= 0 ? '+' : ''}${Number(varPct).toFixed(1)}%` : '—'}</td>
                    <td>{l.impacto || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {insights.linhas_criticas.some(l => l.comentario) && (
            <ul>
              {insights.linhas_criticas.filter(l => l.comentario).map((l, i) => (
                <li key={i}><span className="destaque">{l.linha}:</span> {l.comentario}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {insights.custos_despesas && (
        <section className="rd-secao">
          <h2>4. Custos e Despesas</h2>
          {insights.custos_despesas.avaliacao && (
            <p>Avaliacao geral dos custos: <span className="destaque">{insights.custos_despesas.avaliacao}</span>.</p>
          )}
          {insights.custos_despesas.maiores_itens?.length > 0 && (
            <>
              <h3>Maiores itens de custo/despesa</h3>
              <table className="rd-tabela">
                <thead><tr><th>Item</th><th className="num">Valor</th><th className="num">% Receita</th><th>Comentario</th></tr></thead>
                <tbody>
                  {insights.custos_despesas.maiores_itens.map((i, idx) => (
                    <tr key={idx}>
                      <td>{i.nome}</td>
                      <td className="num">{formatCurrency(i.valor || 0)}</td>
                      <td className="num">{Number(i.pct_receita || 0).toFixed(1)}%</td>
                      <td>{i.comentario || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {insights.custos_despesas.excessos?.length > 0 && (
            <><h3>Excessos identificados</h3><ul>{insights.custos_despesas.excessos.map((e, i) => <li key={i}>{e}</li>)}</ul></>
          )}
        </section>
      )}

      {insights.tendencia && (
        <section className="rd-secao">
          <h2>5. Tendencia</h2>
          {insights.tendencia.direcao && <p>Direcao da tendencia: <span className="destaque">{insights.tendencia.direcao}</span></p>}
          {insights.tendencia.resumo_6m && <p>{insights.tendencia.resumo_6m}</p>}
          {insights.tendencia.pontos_inflexao?.length > 0 && (
            <><h3>Pontos de inflexao</h3><ul>{insights.tendencia.pontos_inflexao.map((p, i) => <li key={i}>{p}</li>)}</ul></>
          )}
        </section>
      )}
    </>
  );
}

function SecoesFluxo({ insights }) {
  return (
    <>
      {insights.variacao_caixa && (
        <section className="rd-secao">
          <h2>2. Variacao de Caixa</h2>
          {insights.variacao_caixa.interpretacao && <p>{insights.variacao_caixa.interpretacao}</p>}
          {insights.variacao_caixa.causas_principais?.length > 0 && (
            <><h3>Causas principais</h3><ul>{insights.variacao_caixa.causas_principais.map((c, i) => <li key={i}>{c}</li>)}</ul></>
          )}
        </section>
      )}

      {insights.padrao_grupos && (
        <section className="rd-secao">
          <h2>3. Padrao por Grupo</h2>
          {insights.padrao_grupos.entradas_principais?.length > 0 && (
            <>
              <h3>Entradas principais</h3>
              <ul>
                {insights.padrao_grupos.entradas_principais.map((e, i) => (
                  <li key={i}><span className="destaque">{e.grupo}</span> — {formatCurrency(e.valor || 0)} ({Number(e.participacao_pct || 0).toFixed(1)}% das entradas)</li>
                ))}
              </ul>
            </>
          )}
          {insights.padrao_grupos.saidas_crescentes?.length > 0 && (
            <>
              <h3>Saidas crescentes vs. Ano Anterior</h3>
              <ul>
                {insights.padrao_grupos.saidas_crescentes.map((s, i) => (
                  <li key={i}>
                    <span className="destaque">{s.grupo}</span>
                    {s.variacao_yoy_pct != null ? ` — +${Number(s.variacao_yoy_pct).toFixed(1)}%` : ''}
                    {s.comentario ? `. ${s.comentario}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
          {insights.padrao_grupos.outliers?.length > 0 && (
            <><h3>Outliers</h3><ul>{insights.padrao_grupos.outliers.map((o, i) => <li key={i}>{o}</li>)}</ul></>
          )}
        </section>
      )}

      {insights.concentracoes?.length > 0 && (
        <section className="rd-secao">
          <h2>4. Concentracoes de Risco</h2>
          <ul>
            {insights.concentracoes.map((c, i) => (
              <li key={i}>
                <span className="destaque">{c.conta_gerencial || c.conta}</span>
                {c.pct_do_total != null ? ` — ${Number(c.pct_do_total).toFixed(1)}% das saidas` : ''}.
                {c.risco ? ` ${c.risco}` : ''}
                {c.sugestao ? ` Sugestao: ${c.sugestao}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights.tendencia && (
        <section className="rd-secao">
          <h2>5. Tendencia e Risco de Liquidez</h2>
          {(insights.tendencia.direcao || insights.tendencia.saldo_trajetoria) && (
            <p>Trajetoria do saldo: <span className="destaque">{insights.tendencia.direcao || insights.tendencia.saldo_trajetoria}</span></p>
          )}
          {insights.tendencia.resumo_6m && <p>{insights.tendencia.resumo_6m}</p>}
          {insights.tendencia.risco_liquidez_proximos_meses && (
            <p>Risco de liquidez nos proximos meses: <span className="destaque">{insights.tendencia.risco_liquidez_proximos_meses}</span>.</p>
          )}
        </section>
      )}
    </>
  );
}

function SecoesGeral({ insights }) {
  return (
    <>
      {insights.diagnostico_integrado && (
        <section className="rd-secao">
          <h2>2. Diagnostico Integrado</h2>
          <p>{insights.diagnostico_integrado}</p>
        </section>
      )}

      {insights.gargalos_criticos?.length > 0 && (
        <section className="rd-secao">
          <h2>3. Gargalos Criticos</h2>
          <ul>
            {insights.gargalos_criticos.map((g, i) => (
              <li key={i}>
                <span className="destaque">{g.gargalo}</span> <span className={`rd-tag rd-tag-${g.impacto || 'media'}`}>{g.impacto || 'media'}</span>
                {g.evidencia_cross ? ` — ${g.evidencia_cross}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights.alavancas_prioritarias?.length > 0 && (
        <section className="rd-secao">
          <h2>4. Alavancas Prioritarias</h2>
          {insights.alavancas_prioritarias.map((a, i) => (
            <div key={i} className="rd-bloco-recomendacao">
              <h3 style={{ margin: 0 }}>{a.alavanca}</h3>
              {a.efeito_vendas && <p><span className="destaque">Vendas:</span> {a.efeito_vendas}</p>}
              {a.efeito_dre && <p><span className="destaque">DRE:</span> {a.efeito_dre}</p>}
              {a.efeito_caixa && <p><span className="destaque">Caixa:</span> {a.efeito_caixa}</p>}
            </div>
          ))}
        </section>
      )}

      {insights.contradicoes?.length > 0 && (
        <section className="rd-secao">
          <h2>5. Contradicoes a Investigar</h2>
          <ul>
            {insights.contradicoes.map((c, i) => (
              <li key={i}>
                <span className="destaque">{c.observacao}</span>
                {c.o_que_investigar ? ` — ${c.o_que_investigar}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights.plano_90_dias?.length > 0 && (
        <section className="rd-secao">
          <h2>6. Plano de 90 Dias</h2>
          <table className="rd-tabela longa">
            <thead><tr><th>Periodo</th><th>Acao</th><th>Responsavel</th><th>KPI Alvo</th></tr></thead>
            <tbody>
              {insights.plano_90_dias.map((p, i) => (
                <tr key={i}>
                  <td>{p.semana}</td>
                  <td>{p.acao}</td>
                  <td>{p.responsavel_sugerido || '—'}</td>
                  <td>{p.kpi_alvo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function SecaoComparativos({ insights }) {
  if (!insights.comparativo && !insights.comparativo_yoy?.o_que_mudou) return null;
  return (
    <section className="rd-secao">
      <h2>Comparativos Temporais</h2>
      {insights.comparativo?.vs_yoy && (<><h3>Versus Ano Anterior</h3><p>{insights.comparativo.vs_yoy}</p></>)}
      {insights.comparativo?.vs_trimestre && (<><h3>Versus Trimestre Anterior</h3><p>{insights.comparativo.vs_trimestre}</p></>)}
      {insights.comparativo_yoy?.o_que_mudou && (<><h3>Caixa vs. Ano Anterior</h3><p>{insights.comparativo_yoy.o_que_mudou}</p></>)}
      {insights.comparativo?.tendencia_direcao && (
        <p>Direcao da tendencia: <span className="destaque">{insights.comparativo.tendencia_direcao}</span>.</p>
      )}
      {insights.comparativo?.causas_provaveis?.length > 0 && (
        <><h3>Causas provaveis</h3><ul>{insights.comparativo.causas_provaveis.map((c, i) => <li key={i}>{c}</li>)}</ul></>
      )}
    </section>
  );
}

function SecaoAlertasRiscos({ insights }) {
  const temAlertas = insights.alertas?.length > 0;
  const temRiscos = insights.riscos?.length > 0;
  if (!temAlertas && !temRiscos) return null;
  return (
    <section className="rd-secao">
      <h2>Alertas e Riscos</h2>
      {temAlertas && (
        <ul>
          {insights.alertas.map((a, i) => (
            <li key={i}>
              <span className={`rd-tag rd-tag-${a.severidade || 'media'}`}>{a.severidade || 'media'}</span>{' '}
              <span className="destaque">{a.titulo}:</span> {a.detalhe}
            </li>
          ))}
        </ul>
      )}
      {temRiscos && (
        <ul>
          {insights.riscos.map((r, i) => (
            <li key={i}>
              <span className={`rd-tag rd-tag-${r.severidade || 'media'}`}>{r.severidade || 'media'}</span>{' '}
              <span className="destaque">{r.risco}.</span>
              {r.mitigacao ? ` Mitigacao: ${r.mitigacao}` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SecaoOportunidades({ insights }) {
  const o = insights.oportunidades;
  if (!o) return null;
  const blocos = [
    ['Aumentar ticket/receita', o.aumentar_ticket || o.aumentar_receita || o.aumentar_entradas],
    ['Melhorar mix', o.melhorar_mix],
    ['Crescer conveniencia', o.crescer_conveniencia],
    ['Reduzir custos/ineficiencias', o.reduzir_custos || o.reduzir_ineficiencias || o.reduzir_saidas],
    ['Otimizar margens/prazo', o.otimizar_margens || o.otimizar_prazo],
  ].filter(([, lista]) => Array.isArray(lista) && lista.length > 0);
  if (blocos.length === 0) return null;

  return (
    <section className="rd-secao">
      <h2>Oportunidades</h2>
      {blocos.map(([titulo, lista]) => (
        <div key={titulo}>
          <h3>{titulo}</h3>
          <ul>{lista.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </div>
      ))}
    </section>
  );
}

function SecaoRecomendacoes({ insights }) {
  if (!insights.recomendacoes?.length) return null;
  return (
    <section className="rd-secao">
      <h2>Recomendacoes Estrategicas</h2>
      {insights.recomendacoes.map((r, i) => {
        const prio = r.prioridade || 'media';
        return (
          <div key={i} className={`rd-bloco-recomendacao prio-${prio}`}>
            <p><span className={`rd-tag rd-tag-${prio}`}>{prio}</span> <span className="destaque">{r.acao}</span></p>
            {(r.justificativa || r.impacto_esperado || r.efeito_em_caixa || r.impacto) && (
              <p style={{ marginLeft: 0 }}>{r.justificativa || r.impacto_esperado || r.efeito_em_caixa || r.impacto}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function SecaoPerguntas({ insights }) {
  const perguntas = insights.perguntas_gestor || insights.perguntas_chave_gestor;
  if (!perguntas?.length) return null;
  return (
    <section className="rd-secao">
      <h2>Perguntas para Reflexao do Gestor</h2>
      <ol style={{ marginLeft: 20 }}>
        {perguntas.map((p, i) => (
          <li key={i} style={{ fontSize: '10.5pt', lineHeight: 1.45, marginBottom: 6 }}>{p}</li>
        ))}
      </ol>
    </section>
  );
}
