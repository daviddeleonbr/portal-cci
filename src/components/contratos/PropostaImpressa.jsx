// Documento de impressão de uma PROPOSTA (admin) — independe da validade.
// Mesmo padrão dos relatórios: papel timbrado CCI + relatorioImpressao.css.
// Renderizado num portal fora do #root e impresso na hora (window.print →
// "Salvar como PDF"); durante a impressão o app (#root) fica oculto.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import PapelTimbrado from '../ia/PapelTimbrado';
import Markdown from '../ui/Markdown';
import '../ia/relatorioImpressao.css';
import './propostaImpressa.css';

const PERIODO = { mensal: 'Mensal', anual: 'Anual', unico: 'Único' };
const CATEGORIA_LABEL = {
  bpo: 'BPO', fiscal: 'Fiscal', consultoria: 'Consultoria',
  tecnologia: 'Tecnologia', treinamento: 'Treinamento', outro: 'Outros',
};
const CATEGORIA_ORDEM = ['bpo', 'fiscal', 'consultoria', 'tecnologia', 'treinamento', 'outro'];

const moeda = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function dataBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : '—';
}
function dataHoraBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const cnpjFmt = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (v || '');
};

// Totais iguais aos da página pública: anual rateado no mês, % de desconto
// sobre mensal/anual; implantação (único) à parte.
function calcularTotais(itens, descPct) {
  let mensal = 0, anual = 0, unico = 0;
  itens.forEach(it => {
    const b = (Number(it.valor_unitario) || 0) * (Number(it.quantidade) || 1);
    if (it.periodicidade === 'anual') anual += b;
    else if (it.periodicidade === 'unico') unico += b;
    else mensal += b;
  });
  const desc = v => v * (1 - descPct / 100);
  return { mensal: desc(mensal), anual: desc(anual), unico, mensalMedio: desc(mensal + anual / 12) };
}

function Documento({ proposta: p }) {
  const itens = p.itens || [];
  const descPct = Number(p.desconto_percentual) || 0;
  const descValor = Number(p.desconto_valor) || 0;
  const consultiva = p.modelo === 'consultiva';
  const tot = calcularTotais(itens, descPct);
  const aceita = !!p.aceita_em && (p.status === 'aceita' || p.status === 'convertida');

  const rank = c => { const i = CATEGORIA_ORDEM.indexOf(c); return i < 0 ? 99 : i; };
  const grupos = [...itens.reduce((m, it) => {
    const c = it.categoria || 'outro';
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(it);
    return m;
  }, new Map()).entries()].sort((a, b) => rank(a[0]) - rank(b[0]));

  const inv = Number(p.investimento_valor) || 0;
  const perInv = p.investimento_periodicidade || 'mensal';

  return (
    <div className="rd-doc">
      <p className="rd-pi-sobretitulo">Proposta comercial</p>
      <h1 className="rd-capa-titulo">{p.titulo || 'Proposta de serviços'}</h1>
      <p className="rd-capa-sub">
        Preparada para <span className="rd-forte">{p.cliente_nome}</span>
        {p.cliente_cnpj ? ` · CNPJ ${cnpjFmt(p.cliente_cnpj)}` : ''}
      </p>

      <div className="rd-pi-meta">
        <div><span className="rot">Data da proposta</span><span className="val">{dataBR(p.data_proposta)}</span></div>
        <div><span className="rot">Válida até</span><span className="val">{p.valida_ate ? dataBR(p.valida_ate) : '—'}</span></div>
        {aceita && <div><span className="rot">Aceita em</span><span className="val">{dataHoraBR(p.aceita_em)}</span></div>}
      </div>

      {consultiva ? (
        <>
          {(p.descricao || p.conteudo_md) && (
            <section className="rd-secao rd-pi-markdown">
              {p.descricao && <p className="rd-pi-lead">{p.descricao}</p>}
              {p.conteudo_md && <Markdown>{p.conteudo_md}</Markdown>}
            </section>
          )}
          {inv > 0 && (
            <section className="rd-secao">
              <h2>Investimento</h2>
              <div className="rd-pi-total">
                <span className="rot">{perInv === 'unico' ? 'Pagamento único' : `Valor ${perInv === 'anual' ? 'anual' : 'mensal'}`}</span>
                <span className="val">{moeda(inv)}{perInv === 'anual' ? ' /ano' : perInv === 'unico' ? '' : ' /mês'}</span>
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          {p.descricao && <section className="rd-secao"><p className="rd-pi-lead">{p.descricao}</p></section>}

          <section className="rd-secao">
            <h2>Serviços</h2>
            {grupos.length === 0 && <p className="rd-muted">Proposta sem serviços.</p>}
            {grupos.map(([cat, its]) => (
              <div key={cat} className="rd-pi-grupo">
                <h3>{CATEGORIA_LABEL[cat] || cat}</h3>
                <table className="rd-tabela">
                  <thead>
                    <tr>
                      <th>Serviço</th>
                      <th>Periodicidade</th>
                      <th className="num">Qtd × valor</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {its.map(it => {
                      const q = Number(it.quantidade) || 1;
                      const unit = Number(it.valor_unitario) || 0;
                      return (
                        <tr key={it.id}>
                          <td>
                            <span className="rd-forte">{it.nome}</span>
                            {it.descricao && <span className="rd-pi-desc">{it.descricao}</span>}
                          </td>
                          <td>{PERIODO[it.periodicidade] || 'Mensal'}</td>
                          <td className="num">
                            {it.tipo_valor === 'unitario' ? `${q}${it.unidade ? ` ${it.unidade}` : ''} × ${moeda(unit)}` : moeda(unit)}
                          </td>
                          <td className="num">{moeda(unit * q)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          <section className="rd-secao">
            <h2>Investimento</h2>
            <div className="rd-pi-total">
              <span className="rot">Valor mensal estimado</span>
              <span className="val">{moeda(tot.mensalMedio)} /mês</span>
            </div>
            <ul className="rd-pi-notas">
              {tot.anual > 0 && <li>Inclui serviços anuais ({moeda(tot.anual)} /ano) rateados no mês.</li>}
              {tot.unico > 0 && <li>Implantação (pagamento único): <span className="rd-forte">{moeda(tot.unico)}</span>.</li>}
              {descPct > 0 && <li>Desconto de {descPct}% já aplicado.</li>}
              {!descPct && descValor > 0 && <li>Desconto negociado: {moeda(descValor)}.</li>}
              {itens.some(i => i.tipo_valor === 'unitario') && <li>Serviços unitários calculados pelas quantidades desta proposta.</li>}
            </ul>
          </section>
        </>
      )}

      {aceita && (
        <section className="rd-secao">
          <h2>Aceite</h2>
          <p>Proposta aceita pelo cliente em <span className="rd-forte">{dataHoraBR(p.aceita_em)}</span>, pelo link enviado pela CCI.</p>
        </section>
      )}

      <div className="rd-rodape">
        Valores e condições formalizados em contrato pela CCI Consultoria.
        {' '}Documento gerado em {dataHoraBR(new Date().toISOString())}.
      </div>
    </div>
  );
}

// Monta o documento num portal, imprime e avisa quando terminar.
export default function PropostaImpressa({ proposta, onFim }) {
  useEffect(() => {
    if (!proposta) return undefined;
    document.body.classList.add('imprimindo-proposta');
    const tituloAnt = document.title;
    // Nome sugerido do arquivo ao "Salvar como PDF".
    document.title = `Proposta CCI - ${proposta.cliente_nome || ''}`.trim();
    const fim = () => {
      document.body.classList.remove('imprimindo-proposta');
      document.title = tituloAnt;
      onFim?.();
    };
    window.addEventListener('afterprint', fim, { once: true });
    // Espera o portal pintar (fontes/timbrado) antes de abrir a impressão.
    const t = setTimeout(() => window.print(), 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', fim);
      document.body.classList.remove('imprimindo-proposta');
      document.title = tituloAnt;
    };
  }, [proposta, onFim]);

  if (!proposta) return null;
  return createPortal(
    <div className="rd-doc-wrap rd-proposta-impressa">
      <PapelTimbrado />
      <table className="rd-layout">
        <thead><tr><td><div className="rd-espaco-topo" aria-hidden="true" /></td></tr></thead>
        <tfoot><tr><td><div className="rd-espaco-base" aria-hidden="true" /></td></tr></tfoot>
        <tbody><tr><td><Documento proposta={proposta} /></td></tr></tbody>
      </table>
    </div>,
    document.body,
  );
}
