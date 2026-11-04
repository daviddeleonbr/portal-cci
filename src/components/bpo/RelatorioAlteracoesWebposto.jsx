// Documento de impressão — Alterações em caixas (redes WEBPOSTO).
// Mesmo padrão do RelatorioAlteracoesCaixas (Autosystem): papel timbrado CCI +
// relatorioImpressao.css. Fica oculto na tela (.rd-doc-wrap) e aparece só na
// impressão (Ctrl+P / Salvar como PDF). Recebe os grupos JÁ filtrados e
// agrupados (funcionário → categoria → operação) pelo AlteracoesCaixasWebposto.

import PapelTimbrado from '../ia/PapelTimbrado';
import '../ia/relatorioImpressao.css';

const OPERACAO = {
  INCLUIR: { rotulo: 'Inclusão',  cor: '#15803d' },
  ALTERAR: { rotulo: 'Alteração', cor: '#b45309' },
  EXCLUIR: { rotulo: 'Exclusão',  cor: '#b91c1c' },
  OUTROS:  { rotulo: 'Outras',    cor: '#8a9199' },
};
const REALCE = { background: '#fffbeb', color: '#7c4a00', fontWeight: 700 };

function ItemImpresso({ item }) {
  return (
    <div style={{ margin: '0 0 2.5mm', breakInside: 'avoid' }}>
      <p style={{ margin: '0 0 1mm', fontSize: '8.5pt', color: '#191a1c', fontWeight: 600 }}>
        {[item.titulo, item.dataHora, `Alterado por ${item.usuario}`].join('  ·  ')}
      </p>
      {item.alterados.length > 0 && (
        <table className="rd-tabela">
          <thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
          <tbody>
            {item.alterados.map(l => (
              <tr key={l.campo}>
                <td style={REALCE}>{l.campo}</td>
                <td style={REALCE}>{l.antes || '—'}</td>
                <td style={REALCE}>{l.depois || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {item.detalhe.length > 0 && (
        <table className="rd-tabela" style={item.alterados.length ? { marginTop: '1mm' } : undefined}>
          <tbody>
            {item.detalhe.map(([k, v]) => (
              <tr key={k}><td style={{ width: '32%', fontWeight: 600 }}>{k}</td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {item.alterados.length === 0 && item.detalhe.length === 0 && (
        <p className="rd-muted" style={{ fontStyle: 'italic', fontSize: '8.5pt', margin: 0 }}>Sem campos relevantes para exibir.</p>
      )}
    </div>
  );
}

export default function RelatorioAlteracoesWebposto({ grupos = [], contexto = {} }) {
  const sub = [contexto.rede, contexto.empresa, contexto.periodo].filter(Boolean).join('  ·  ');
  return (
    <div className="rd-doc-wrap">
      <style>{`
        @media print {
          .fixed.inset-0.pointer-events-none { display: none !important; }
          *, *::before, *::after { box-shadow: none !important; }
        }
      `}</style>
      <PapelTimbrado />
      <table className="rd-layout">
        <thead><tr><td><div className="rd-espaco-topo" aria-hidden="true" /></td></tr></thead>
        <tfoot><tr><td><div className="rd-espaco-base" aria-hidden="true" /></td></tr></tfoot>
        <tbody><tr><td>
          <div className="rd-doc">
            <h1 className="rd-capa-titulo">Histórico de Alterações em Caixas</h1>
            <p className="rd-capa-sub">{sub}{contexto.geradoEm ? `  ·  Gerado ${contexto.geradoEm}` : ''}</p>

            {grupos.length === 0 && (
              <p className="rd-muted" style={{ marginTop: '4mm' }}>Nenhuma alteração corresponde aos filtros.</p>
            )}

            {grupos.map(g => (
              <div className="rd-secao" key={g.nome}>
                <h2>
                  {g.nome}
                  <span className="rd-muted" style={{ fontWeight: 400, fontSize: '9pt', marginLeft: '2mm' }}>
                    · {g.total} registro{g.total === 1 ? '' : 's'}
                  </span>
                </h2>
                {g.tabelas.map(t => (
                  <div key={t.tabela} style={{ margin: '0 0 3mm' }}>
                    <h3 style={{ margin: '0 0 1.5mm' }}>
                      {t.tabela}
                      <span className="rd-muted" style={{ fontWeight: 400, marginLeft: '1.5mm' }}>
                        ({t.operacoes.map(o => `${OPERACAO[o.op]?.rotulo || o.op}: ${o.lista.length}`).join('  ·  ')})
                      </span>
                    </h3>
                    {t.operacoes.map(o => (
                      <div key={o.op} style={{ margin: '0 0 2mm 3mm' }}>
                        <p style={{ margin: '0 0 1mm', fontSize: '9pt', fontWeight: 700, color: OPERACAO[o.op]?.cor || '#191a1c' }}>
                          {OPERACAO[o.op]?.rotulo || o.op} ({o.lista.length})
                        </p>
                        {o.lista.map(item => <ItemImpresso key={item.id} item={item} />)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}

            <div className="rd-rodape">CCI · Consultoria Inteligente — Histórico de Alterações em Caixas</div>
          </div>
        </td></tr></tbody>
      </table>
    </div>
  );
}
