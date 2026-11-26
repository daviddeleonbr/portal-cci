// Conciliação de caixas › Relatório geral (admin). Vendas, recebimentos, acréscimos,
// descontos, sobras e faltas por funcionário e, no fim, as alterações feitas nos
// caixas pelos usuários escolhidos. Folha plana: a mesma da tela vai para o PDF.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileText, Loader2, Printer, RefreshCw } from 'lucide-react';
import SeletorRedeEmpresa, { AvisoSelecao } from './SeletorRedeEmpresa';
import InputData from '../ui/InputData';
import TimbradoPaisagem, { TimbradoCabecalho } from '../ia/TimbradoPaisagem';
import { useAnonimizador } from '../../services/anonimizarService';
import { carregarAlteracoes, carregarRelatorio, carregarSangrias } from '../../services/relatorioGeralCaixasService';
import { alteracoesPorTurno, usuariosDasAlteracoes } from '../../utils/relatorioGeralCaixas';
import { formatCurrency } from '../../utils/format';
import { isoDataBR } from '../../utils/dataBR';
import './relatorioGeralCaixas.css';

const MAX_DIAS = 31;
const dataBR = (s) => String(s || '').split('-').reverse().join('/');
// Nome do PDF: parecer_auto_posto_trivela_2_24-11-2026 (barra não pode em nome de arquivo)
const nomeArquivo = (empresa, de, ate) => {
  const nome = String(empresa || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const dia = (s) => dataBR(s).replace(/\//g, '-');
  return ['parecer', nome, de === ate ? dia(de) : `${dia(de)}_a_${dia(ate)}`].filter(Boolean).join('_');
};
const dias = (de, ate) => Math.round((new Date(`${ate}T12:00:00`) - new Date(`${de}T12:00:00`)) / 86400000) + 1;
const ontem = () => { const d = new Date(); d.setDate(d.getDate() - 1); return isoDataBR(d); };
const zero = (v) => Math.abs(v) < 0.005;
const moeda = (v) => (zero(v) ? <span className="rg-mudo">–</span> : formatCurrency(v));
const pct = (v, t) => (t ? `${((v / t) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '–');
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const CLS_OPERACAO = { Inclusão: 'rg-inc', Exclusão: 'rg-neg', Alteração: 'rg-pos' };
const rot = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500';
const inp = 'h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

// `admin`: { chavesApi, redesAutosystem, contagensPorRede, selecao, onSelecao }
export default function RelatorioGeralCaixas({ empresas, admin, usuarioNome = '' }) {
  const { labelEmpresa, labelRede } = useAnonimizador();
  const [de, setDe] = useState(ontem);
  const [ate, setAte] = useState(ontem);
  const [rel, setRel] = useState(null);         // { modelo, empresa, rede, de, ate, geradoEm }
  const [alt, setAlt] = useState(null);         // { lista, incompleta } | { erro }
  const [carregando, setCarregando] = useState(false);
  const [carregandoAlt, setCarregandoAlt] = useState(false);
  const [erro, setErro] = useState('');
  const [usuariosSel, setUsuariosSel] = useState(() => new Set());
  const pedidoRef = useRef(0); // só a busca mais recente vale

  const { rede, empresa: empresaId } = admin.selecao;
  const empresa = useMemo(() => (empresas || []).find(e => e.id === empresaId) || null, [empresas, empresaId]);

  const limpar = () => { pedidoRef.current += 1; setRel(null); setAlt(null); setErro(''); setUsuariosSel(new Set()); setCarregando(false); setCarregandoAlt(false); };

  const gerar = useCallback(async () => {
    if (!empresa || !rede) return;
    if (!de || !ate || de > ate) { setErro('Período inválido.'); return; }
    if (dias(de, ate) > MAX_DIAS) { setErro(`Escolha no máximo ${MAX_DIAS} dias.`); return; }
    const n = ++pedidoRef.current;
    const vale = () => n === pedidoRef.current;
    const chaveRow = rede.tipo === 'webposto' ? admin.chavesApi.find(c => c.id === rede.id) : admin.redesAutosystem.find(r => r.id === rede.id);
    const ctx = { empresa, chave: rede.tipo === 'webposto' ? chaveRow?.chave : null, de, ate };
    setErro(''); setRel(null); setAlt(null); setUsuariosSel(new Set());
    setCarregando(true); setCarregandoAlt(true);
    carregarAlteracoes(ctx)
      .then(r => { if (vale()) setAlt(r); })
      .catch(e => { if (vale()) setAlt({ erro: e?.code === 'AUDITORIA_SEM_USUARIO' ? 'A chave desta rede não tem usuário vinculado no Webposto, por isso as alterações não podem ser consultadas.' : (e?.message || 'Falha ao buscar as alterações.') }); })
      .finally(() => { if (vale()) setCarregandoAlt(false); });
    try {
      const [modelo, sangrias] = await Promise.all([
        carregarRelatorio(ctx),
        carregarSangrias(ctx).catch(e => ({ erro: e?.message || 'Falha ao buscar as sangrias.' })),
      ]);
      if (vale()) setRel({ modelo, sangrias, empresa, redeNome: chaveRow?.nome || '', redeId: rede.id, de, ate, geradoEm: new Date() });
    } catch (e) { if (vale()) setErro(e?.message || 'Falha ao gerar o relatório.'); }
    finally { if (vale()) setCarregando(false); }
  }, [empresa, rede, de, ate, admin.chavesApi, admin.redesAutosystem]);

  // O navegador sugere o título da página como nome do PDF: troca só durante a impressão
  // (no `beforeprint` também, para valer no Ctrl+P).
  const titulo = rel ? nomeArquivo(labelEmpresa(rel.empresa), rel.de, rel.ate) : '';
  const tituloAntRef = useRef(null);
  const trocarTitulo = useCallback(() => {
    if (tituloAntRef.current === null) tituloAntRef.current = document.title;
    document.title = titulo;
  }, [titulo]);
  const imprimir = () => { trocarTitulo(); setTimeout(() => window.print(), 150); }; // dá tempo de o título valer
  useEffect(() => {
    if (!titulo) return undefined;
    const depois = () => { if (tituloAntRef.current !== null) { document.title = tituloAntRef.current; tituloAntRef.current = null; } };
    window.addEventListener('beforeprint', trocarTitulo);
    window.addEventListener('afterprint', depois);
    return () => { window.removeEventListener('beforeprint', trocarTitulo); window.removeEventListener('afterprint', depois); depois(); };
  }, [titulo, trocarTitulo]);

  const usuarios = useMemo(() => usuariosDasAlteracoes(alt?.lista), [alt]);
  const grupos = useMemo(() => alteracoesPorTurno(alt?.lista, usuariosSel), [alt, usuariosSel]);
  const alternar = (k) => setUsuariosSel(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const todos = usuarios.length > 0 && usuariosSel.size === usuarios.length;

  return (
    <div className="space-y-4">
      {/* PDF: A4 deitado no timbrado. Margem zero (a arte vai até a borda) e 10mm embaixo só
          para a numeração; o respiro do conteúdo vem do thead/tfoot da .rg-folha. */}
      <style>{'@media print { @page { size: A4 landscape; margin: 0 0 10mm 0; @bottom-right { padding-right: 12mm; } } .fixed.inset-0.pointer-events-none { display: none !important; } }'}</style>

      <div className="no-print flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
        <SeletorRedeEmpresa empresas={empresas} admin={admin} onTrocar={limpar} semTodas />
        <div className="w-full min-w-0 sm:w-40"><label className={rot}>De</label>
          <InputData value={de} onChange={e => { setDe(e.target.value); if (e.target.value > ate) setAte(e.target.value); }} className={inp} /></div>
        <div className="w-full min-w-0 sm:w-40"><label className={rot}>Até</label>
          <InputData value={ate} onChange={e => setAte(e.target.value)} className={inp} /></div>
        <button type="button" onClick={gerar} disabled={!empresa || carregando}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : rel ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
          {rel ? 'Gerar de novo' : 'Gerar relatório'}
        </button>
        {rel && (
          <button type="button" onClick={imprimir} disabled={carregandoAlt}
            title={carregandoAlt ? 'Aguarde as alterações terminarem de carregar' : 'Abre a impressão: escolha "Salvar como PDF"'}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Printer className="h-4 w-4" aria-hidden="true" /> PDF
          </button>
        )}
      </div>

      {erro && <p role="alert" className="no-print rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      {!rel && (
        <div className="no-print rounded-2xl border border-gray-200/60 bg-white shadow-sm">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-600"><Loader2 className="h-5 w-5 animate-spin text-blue-500" aria-hidden="true" /> Buscando vendas e caixas…</div>
          ) : !empresa ? <AvisoSelecao rede={rede}>Depois escolha o período e gere o relatório.</AvisoSelecao>
            : <p className="px-6 py-14 text-center text-sm text-gray-600">Escolha o período e clique em Gerar relatório.</p>}
        </div>
      )}

      {rel && (
        <div className="rg rounded-2xl border border-gray-200/60 bg-white p-5 sm:p-6">
          <TimbradoPaisagem />
          <table className="rg-folha" role="presentation">
            <thead><tr><td><TimbradoCabecalho /><div className="rg-espaco-topo" aria-hidden="true" /></td></tr></thead>
            <tfoot><tr><td><div className="rg-espaco-base" aria-hidden="true" /></td></tr></tfoot>
            <tbody><tr><td>
          <div className="rg-topo">
            <div>
              <h2>{labelEmpresa(rel.empresa)}</h2>
              <p>Relatório geral dos caixas · {rel.de === rel.ate ? dataBR(rel.de) : `${dataBR(rel.de)} a ${dataBR(rel.ate)}`} · {labelRede(rel.redeNome, rel.redeId)}</p>
            </div>
            <p style={{ textAlign: 'right' }}>Gerado em {rel.geradoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{usuarioNome ? ` por ${usuarioNome}` : ''}</p>
          </div>
          <Corpo m={rel.modelo} sangrias={rel.sangrias} variosDias={rel.de !== rel.ate} />

          <Titulo n={5} sub={grupos.length > 0 ? `${plural(grupos.reduce((s, g) => s + g.qtd, 0), 'alteração', 'alterações')} · ${usuariosSel.size <= 3 ? `por ${usuarios.filter(u => usuariosSel.has(u.chave)).map(u => u.nome).join(', ')}` : `${usuariosSel.size} usuários`}` : null}>Alterações realizadas nos caixas</Titulo>
          {carregandoAlt && <p className="rg-nota no-print"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />Buscando as alterações…</p>}
          {alt?.erro && <p className="rg-nota"><AlertCircle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{alt.erro}</p>}
          {alt?.lista && usuarios.length === 0 && <p className="rg-nota">Nenhuma alteração encontrada nos caixas do período.</p>}
          {usuarios.length > 0 && (
            <fieldset className="no-print mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 py-1">
              <legend className="sr-only">Usuários que realizaram as alterações</legend>
              <span className="rg-mudo">Mostrar alterações de:</span>
              <label className="inline-flex min-h-[28px] cursor-pointer items-center gap-1.5 font-semibold">
                <input type="checkbox" checked={todos} onChange={() => setUsuariosSel(todos ? new Set() : new Set(usuarios.map(u => u.chave)))} /> Todos
              </label>
              {usuarios.map(u => (
                <label key={u.chave} className="inline-flex min-h-[28px] cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={usuariosSel.has(u.chave)} onChange={() => alternar(u.chave)} /> {u.nome} <span className="rg-mudo">({u.qtd})</span>
                </label>
              ))}
            </fieldset>
          )}
          {usuarios.length > 0 && grupos.length === 0 && <p className="rg-nota">Selecione o usuário que realizou as alterações. Nenhum usuário selecionado.</p>}
          {alt?.incompleta && <p className="rg-nota rg-pos">O período tem alterações demais e a lista pode estar incompleta. Use um período menor.</p>}
          {grupos.length > 0 && <TabelaAlteracoes turnos={grupos} de={rel.de} ate={rel.ate} comUsuario={usuariosSel.size > 1} />}
            </td></tr></tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Título de seção numerado (faixa): separa os blocos na tela e no PDF.
function Titulo({ n, children, sub }) {
  return <h3><span>{n}</span>{children}{sub && <small>{sub}</small>}</h3>;
}

function Corpo({ m, sangrias, variosDias }) {
  const saldo = m.sobras - m.faltas;
  const apres = m.temApresentado;
  const totalApresentado = m.formas.reduce((s, f) => s + f.apresentado, 0);
  const totalDiferenca = m.formas.reduce((s, f) => s + f.diferenca, 0);
  return (
    <>
      {/* Resumo: o que foi vendido × o que entrou no caixa */}
      <div className="rg-resumo">
        <section>
          <h4>Vendas</h4>
          <dl>
            <Num rotulo="Total vendido" valor={m.totalVendas} sub={m.qtdVendas != null ? plural(m.qtdVendas, 'venda', 'vendas') : null} forte />
            <Num rotulo="Acréscimos" valor={m.acrescimos} />
            <Num rotulo="Descontos" valor={m.descontos} />
            {m.canceladas && <Num rotulo="Canceladas" valor={m.canceladas.valor} sub={`${m.canceladas.qtd} venda${m.canceladas.qtd === 1 ? '' : 's'}`} />}
          </dl>
        </section>
        <section>
          <h4>Caixas{m.caixas != null && <small>{m.caixas} no período</small>}</h4>
          <dl>
            <Num rotulo={apres ? 'Apurado' : 'Recebido'} valor={m.totalRecebido} forte />
            {apres && <Num rotulo="Apresentado" valor={totalApresentado} />}
            <Num rotulo="Sobras" valor={m.sobras} cls={zero(m.sobras) ? '' : 'rg-inc'} />
            <Num rotulo="Faltas" valor={m.faltas} cls={zero(m.faltas) ? '' : 'rg-neg'} />
            <Num rotulo="Saldo" valor={saldo} cls={zero(saldo) ? '' : saldo < 0 ? 'rg-neg' : 'rg-inc'} />
          </dl>
        </section>
      </div>

      <div className="rg-duas">
        <section>
          <Titulo n={1}>Vendas por categoria</Titulo>
          <table className="rg-tab rg-zebra">
            <colgroup><col /><col style={{ width: '34%' }} /><col style={{ width: '18%' }} /></colgroup>
            <thead><tr><th>Categoria</th><th className="n">Valor</th><th className="n">%</th></tr></thead>
            <tbody>
              {m.categorias.map(c => <tr key={c.rotulo}><td>{c.rotulo}</td><td className="n">{formatCurrency(c.valor)}</td><td className="n rg-mudo">{pct(c.valor, m.totalVendas)}</td></tr>)}
              {m.categorias.length === 0 && <tr><td colSpan={3} className="rg-mudo">Nenhuma venda no período.</td></tr>}
            </tbody>
            <tfoot><tr><td>Total</td><td className="n">{formatCurrency(m.totalVendas)}</td><td /></tr></tfoot>
          </table>
          {m.outrasEntradas != null && !zero(m.outrasEntradas) && <p className="rg-nota">Outras entradas do caixa (não são venda): {formatCurrency(m.outrasEntradas)}.</p>}
        </section>
        <section>
          <Titulo n={2}>Formas de recebimento</Titulo>
          <div className="rg-rolagem"><table className={`rg-tab rg-zebra ${apres ? 'rg-formas' : ''}`}>
            <colgroup><col /><col style={{ width: apres ? '20%' : '30%' }} /><col style={{ width: '11%' }} />{apres && <><col style={{ width: '20%' }} /><col style={{ width: '18%' }} /></>}</colgroup>
            <thead><tr><th>Forma</th><th className="n">{apres ? 'Apurado' : 'Valor'}</th><th className="n">%</th>{apres && <><th className="n">Apresentado</th><th className="n">Diferença</th></>}</tr></thead>
            <tbody>
              {m.formas.map(f => (
                <tr key={f.rotulo}><td>{f.rotulo}</td><td className="n">{formatCurrency(f.apurado)}</td><td className="n rg-mudo">{pct(f.apurado, m.totalRecebido)}</td>
                  {apres && <><td className="n">{moeda(f.apresentado)}</td><td className="n"><Dif v={f.diferenca} /></td></>}</tr>
              ))}
              {m.formas.length === 0 && <tr><td colSpan={apres ? 5 : 3} className="rg-mudo">Nenhum recebimento no período.</td></tr>}
            </tbody>
            <tfoot><tr><td>Total</td><td className="n">{formatCurrency(m.totalRecebido)}</td><td />
              {apres && <><td className="n">{formatCurrency(totalApresentado)}</td><td className="n"><Dif v={totalDiferenca} /></td></>}</tr></tfoot>
          </table></div>
          {m.caixasSemFechamento > 0 && <p className="rg-nota rg-pos">{m.caixasSemFechamento} caixa(s) sem fechamento: entram pelo valor da venda, sem apresentado, sobra ou falta.</p>}
        </section>
      </div>
      {m.avisos.map(a => <p key={a} className="rg-nota rg-pos">{a}</p>)}

      <Sangrias s={sangrias} variosDias={variosDias} />

      <section>
        <Titulo n={4}>Resultado por funcionário</Titulo>
        <div className="rg-rolagem">
          <table className="rg-tab rg-zebra rg-func">
            <colgroup><col style={{ width: '25%' }} /><col /><col /><col /><col /><col /><col /></colgroup>
            <thead>
              <tr className="rg-sup"><th /><th colSpan={3} className="rg-div">Vendas (de quem vendeu)</th>
                <th colSpan={3} className="rg-div">{m.sistema === 'webposto' ? 'Caixa (de cada funcionário)' : 'Caixa (de quem lançou)'}</th></tr>
              <tr><th>Funcionário</th><th className="n rg-div">Vendas</th><th className="n">Acréscimos</th><th className="n">Descontos</th>
                <th className="n rg-div">Sobras</th><th className="n">Faltas</th><th className="n">Saldo</th></tr>
            </thead>
            <tbody>
              {m.funcionarios.map((f, k) => (
                <tr key={`${f.nome}-${k}`}><td>{f.nome}</td><td className="n rg-div">{moeda(f.vendas)}</td><td className="n">{moeda(f.acrescimos)}</td><td className="n">{moeda(f.descontos)}</td>
                  <td className={`n rg-div ${zero(f.sobra) ? '' : 'rg-inc'}`}>{moeda(f.sobra)}</td><td className={`n ${zero(f.falta) ? '' : 'rg-neg'}`}>{moeda(f.falta)}</td><td className="n"><Dif v={f.sobra - f.falta} /></td></tr>
              ))}
              {m.funcionarios.length === 0 && <tr><td colSpan={7} className="rg-mudo">Nenhum movimento por funcionário.</td></tr>}
            </tbody>
            <tfoot><tr><td>Total</td><td className="n rg-div">{formatCurrency(m.totalVendas)}</td><td className="n">{moeda(m.acrescimos)}</td><td className="n">{moeda(m.descontos)}</td>
              <td className="n rg-div">{moeda(m.sobras)}</td><td className="n">{moeda(m.faltas)}</td><td className="n"><Dif v={saldo} /></td></tr></tfoot>
          </table>
        </div>
        {m.caixasSemDetalhe > 0 && <p className="rg-nota rg-pos">{plural(m.caixasSemDetalhe, 'caixa', 'caixas')} com diferença sem detalhe por funcionário no Webposto: {m.caixasSemDetalhe === 1 ? 'esse valor ficou' : 'esses valores ficaram'} com o responsável pelo caixa.</p>}
        {m.sistema !== 'webposto' && <p className="rg-nota">Sobras e faltas são os lançamentos nas contas de sobra e falta de caixa.</p>}
      </section>
    </>
  );
}

// Sangrias (dinheiro) por funcionário: contagem do cliente × sistema.
function Sangrias({ s, variosDias }) {
  const v = (x) => (x == null ? <span className="rg-mudo">–</span> : moeda(x));
  const sinal = (x) => (x == null || zero(x) ? <span className="rg-mudo">–</span> : `${x > 0 ? '+' : ''}${formatCurrency(x)}`);
  const fim = (x) => (x == null ? <span className="rg-mudo">–</span> : <Dif v={x} />);
  const quem = (s?.conferencias || []).map(c => `${variosDias ? `${dataBR(c.dia)}: ` : ''}${c.por || 'sem nome'} em ${new Date(c.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`).join('; ');
  return (
    <section className={s?.linhas?.length > 14 ? 'rg-longa' : undefined}>
      <Titulo n={3} sub={quem && !variosDias ? `Conferida por ${quem}` : null}>Sangrias por funcionário</Titulo>
      {s?.erro && <p className="rg-nota rg-pos">Não foi possível buscar as sangrias: {s.erro}</p>}
      {s?.linhas && (
        <div className="rg-rolagem">
          <table className="rg-tab rg-zebra rg-func">
            <colgroup>{variosDias && <col style={{ width: '10%' }} />}<col style={{ width: '13%' }} /><col style={{ width: '27%' }} /><col /><col /><col /><col /></colgroup>
            <thead><tr>{variosDias && <th>Data</th>}<th>Turno</th><th>Funcionário</th><th className="n">Apurado</th><th className="n">Apresentado</th><th className="n">Alterações</th><th className="n">Diferença</th></tr></thead>
            <tbody>
              {s.linhas.map((l, i) => (
                <tr key={i} className={l.retirada ? 'rg-retirada' : undefined}>{variosDias && <td>{dataBR(l.dia)}</td>}
                  {l.retirada
                    ? <td colSpan={2} style={l.detalhe ? { paddingLeft: 22 } : undefined}><em>{l.detalhe ? '↳ ' : ''}(−) Retirada antes do depósito: {l.nome}</em></td>
                    : <><td>{l.turno || '–'}</td><td>{l.nome}</td></>}
                  <td className="n">{l.retirada ? <span className="rg-mudo">–</span> : v(l.apurado)}</td><td className="n">{v(l.apresentado)}</td>
                  {/* retirada: valor sem cor (não é falta), mas soma no total */}
                  <td className="n">{sinal(l.alteracoes)}</td><td className="n">{l.retirada ? sinal(l.diferenca) : fim(l.diferenca)}</td></tr>
              ))}
              {s.linhas.length === 0 && <tr><td colSpan={variosDias ? 7 : 6} className="rg-mudo">Nenhuma sangria no período.</td></tr>}
            </tbody>
            {s.linhas.length > 0 && (
              <tfoot><tr><td colSpan={variosDias ? 3 : 2}>Total</td><td className="n">{v(s.totais.apurado)}</td><td className="n">{v(s.totais.apresentado)}</td><td className="n">{sinal(s.totais.alteracoes)}</td><td className="n">{fim(s.totais.diferenca)}</td></tr></tfoot>
            )}
          </table>
        </div>
      )}
      {s?.linhas?.length > 0 && <p className="rg-nota">Apurado: sangria no sistema quando o cliente confirmou a contagem. Alterações: o que mudou no sistema depois disso. Diferença: apresentado − (apurado + alterações). Retiradas antes do depósito (lançadas pelo cliente na conferência) saem do apresentado: do funcionário de quem saiu o dinheiro (mostrada logo abaixo dele) ou, quando não foi informado, numa linha no fim do dia.</p>}
      {variosDias && quem && <p className="rg-nota">Conferida por: {quem}.</p>}
      {s?.semConferencia?.length > 0 && <p className="rg-nota rg-pos">Ainda sem conferência do cliente: {s.semConferencia.map(dataBR).join(', ')}. Nesses dias, o apurado é o valor atual no sistema.</p>}
      {s?.atualIndisponivel && <p className="rg-nota rg-pos">Não foi possível consultar as sangrias no sistema agora (ou nenhuma conta está habilitada para sangrias): as alterações não foram calculadas.</p>}
    </section>
  );
}

function Num({ rotulo, valor, sub, cls = '', forte = false }) {
  return <div className={forte ? 'rg-forte' : undefined}><dt>{rotulo}</dt><dd className={cls}>{formatCurrency(valor)}</dd>{sub && <small>{sub}</small>}</div>;
}
function Dif({ v }) {
  if (zero(v)) return <span className="rg-mudo">–</span>;
  return <span className={v < 0 ? 'rg-neg' : 'rg-inc'}>{v > 0 ? '+' : ''}{formatCurrency(v)}</span>;
}

// Turno → funcionário → alteração. Cada campo mudado é uma linha Campo | Antes | Depois;
// inclusão mostra os dados em Depois e exclusão em Antes. Caixa e funcionário estão nos títulos. "Alterado por" só com mais de um usuário escolhido.
function TabelaAlteracoes({ turnos, de, ate, comUsuario }) {
  const ano = `/${de.slice(0, 4)}`;
  const curto = (s) => String(s || '').replace(ano, ''); // sem o ano do período
  const temValor = turnos.some(t => t.funcionarios.some(f => f.linhas.some(a => a.valor))); // sem valor, a coluna some
  const colunas = 7 + (comUsuario ? 1 : 0) + (temValor ? 1 : 0);
  return (
    <div className="rg-rolagem">
      <table className="rg-tab rg-alt">
        <thead><tr>
          <th>Operação</th><th>Quando</th>{comUsuario && <th>Alterado por</th>}<th>Lançamento</th><th>Identificação</th>
          <th>Campo</th><th className="m">Antes</th><th className="m">Depois</th>{temValor && <th className="n">Valor</th>}
        </tr></thead>
        {turnos.map(t => (
          <Fragment key={t.chave}>
            {t.funcionarios.map((f, k) => (
              <tbody key={f.nome} className={f.linhas.length <= 8 ? 'rg-junto' : undefined}>
                {k === 0 && (
                  <tr className="rg-turno"><td colSpan={colunas}>{t.turno}{t.dataCaixa && de !== ate ? ` · ${t.dataCaixa}` : ''} <span>{plural(t.qtd, 'alteração', 'alterações')}</span></td></tr>
                )}
                <tr className="rg-pessoa"><td colSpan={colunas}>{f.nome} <span>{[f.pdvs.length > 0 && `PDV ${f.pdvs.join(', ')}`, ...f.operacoes.map(([o, n]) => `${o}: ${n}`)].filter(Boolean).join(' · ')}</span></td></tr>
                {f.linhas.map(a => <Registro key={a.id} a={a} quando={curto(a.quando)} comUsuario={comUsuario} temValor={temValor} />)}
              </tbody>
            ))}
          </Fragment>
        ))}
      </table>
    </div>
  );
}

function Registro({ a, quando, comUsuario, temValor }) {
  const alto = a.principais.length || 1;
  const [primeira, ...outras] = a.principais;
  return (
    <>
      <tr className="rg-ini">
        <td rowSpan={alto} className={`q ${CLS_OPERACAO[a.operacao] || ''}`}>{a.operacao}</td>
        <td rowSpan={alto} className="q">{quando}</td>
        {comUsuario && <td rowSpan={alto}>{a.usuario}</td>}
        <td rowSpan={alto}>{a.lancamento || '–'}</td>
        <td rowSpan={alto}>{a.identificacao || '–'}</td>
        {primeira ? <Mudanca c={primeira} /> : <td colSpan={3} className="m rg-mudo">–</td>}
        {temValor && <td rowSpan={alto} className="n">{a.valor}</td>}
      </tr>
      {outras.map(c => <tr key={c.campo} className="rg-cont"><Mudanca c={c} /></tr>)}
    </>
  );
}
function Mudanca({ c }) {
  return <><td className="rg-mudo">{c.campo}</td><td className={`m ${c.depois === '—' ? 'depois' : 'antes'}`}>{c.antes}</td><td className={`m ${c.depois === '—' ? 'antes' : 'depois'}`}>{c.depois}</td></>;
}
