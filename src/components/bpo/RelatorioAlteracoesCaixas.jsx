// Documento de impressão — Histórico de Alterações em Caixas.
// Usa o MESMO padrão dos relatórios de IA: papel timbrado CCI + CSS
// relatorioImpressao.css (cores da marca teal/amarelo, fonte Sora). Fica oculto
// na tela (.rd-doc-wrap) e aparece só na impressão (Ctrl+P / Salvar como PDF).

import PapelTimbrado from '../ia/PapelTimbrado';
import '../ia/relatorioImpressao.css';

const TIPO = {
  INCLUSAO:      { rotulo: 'Inclusão',      cor: '#15803d' },
  ALTERACAO:     { rotulo: 'Alteração',     cor: '#b45309' },
  AJUSTE:        { rotulo: 'Ajuste',        cor: '#0f766e' },
  EXCLUSAO:      { rotulo: 'Exclusão',      cor: '#b91c1c' },
  INDETERMINADO: { rotulo: 'Indeterminado', cor: '#8a9199' },
};

function dataPtBr(iso) {
  if (iso == null || iso === '') return '—';
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
  return s;
}
function timestampPtBr(when) {
  if (!when) return '—';
  const s = String(when);
  const dm = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const tm = s.match(/(\d{2}):(\d{2})/);
  if (!dm) return s;
  const dataBr = `${dm[3]}/${dm[2]}/${dm[1]}`;
  return tm ? `${dataBr} ${tm[1]}:${tm[2]}` : dataBr;
}
function moedaBr(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function normalizar(v) { return v == null ? '' : String(v).trim(); }
function formatarCampo(valor, field, obj) {
  if (valor == null || String(valor).trim() === '') return '—';
  if (field.type === 'date')     return dataPtBr(valor);
  if (field.type === 'currency') return moedaBr(valor);
  if (field.type === 'conta') {
    const nome = field.nomeKey ? obj?.[field.nomeKey] : null;
    return nome ? `${valor}  ${nome}` : String(valor);
  }
  if (field.type === 'motivo') {
    const nome = field.nomeKey ? obj?.[field.nomeKey] : null;
    return nome ? String(nome) : String(valor);
  }
  return String(valor);
}
function equivalente(a, b, type) {
  if (type === 'date')     return dataPtBr(a) === dataPtBr(b);
  if (type === 'currency') return (Number(a) || 0) === (Number(b) || 0);
  return normalizar(a) === normalizar(b);
}
function montarLinhasDiff(ev, campos) {
  const antes = ev.antes || null;
  const depois = ev.depois || null;
  const out = [];
  for (const c of campos) {
    const a = antes?.[c.key];
    const d = depois?.[c.key];
    const vazioAmbos = (a == null || String(a).trim() === '') && (d == null || String(d).trim() === '');
    if (vazioAmbos) continue;
    if (ev.tipo === 'INCLUSAO') out.push({ campo: c.label, antes: '—', depois: formatarCampo(d, c, depois), mudou: false });
    else if (ev.tipo === 'EXCLUSAO') out.push({ campo: c.label, antes: formatarCampo(a, c, antes), depois: '—', mudou: false });
    else out.push({ campo: c.label, antes: formatarCampo(a, c, antes), depois: formatarCampo(d, c, depois), mudou: !equivalente(a, d, c.type) });
  }
  return out;
}

const REALCE = { background: '#fffbeb', color: '#7c4a00', fontWeight: 700 };

function EventoImpresso({ ev, campos, mapaEmpresas, labelEmpresa }) {
  const node = ev._node;
  const src = ev.depois || ev.antes || {};
  const empresaObj = mapaEmpresas?.get(Number(node?.empresa));
  const empresaNome = empresaObj ? (labelEmpresa?.(empresaObj) || '') : '';
  const partes = [timestampPtBr(ev.timestamp)];
  if (src.data) partes.push(dataPtBr(src.data));
  if (src.turno != null && src.turno !== '') partes.push(`Turno ${src.turno}`);
  if (src.documento) partes.push(`Doc ${src.documento}`);
  if (Number(src.valor)) partes.push(moedaBr(src.valor));
  const alteradoPor = String(src.usuario_nome || src.pgd_username || '').trim();
  if (alteradoPor) partes.push(`Alterado por ${alteradoPor}`);
  if (empresaNome) partes.push(empresaNome);

  const linhas = montarLinhasDiff(ev, campos);
  return (
    <div style={{ margin: '0 0 3mm', breakInside: 'avoid' }}>
      <p style={{ margin: '0 0 1mm', fontSize: '8.5pt', color: '#191a1c', fontWeight: 600 }}>{partes.join('  ·  ')}</p>
      {linhas.length === 0 ? (
        <p className="rd-muted" style={{ fontStyle: 'italic', fontSize: '8.5pt', margin: 0 }}>Sem campos relevantes para exibir.</p>
      ) : (
        <table className="rd-tabela">
          <thead>
            <tr><th>Campo</th><th>Antes</th><th>Depois</th></tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td style={l.mudou ? { ...REALCE, fontWeight: 700 } : undefined}>{l.campo}</td>
                <td style={l.mudou ? REALCE : undefined}>{l.antes}</td>
                <td style={l.mudou ? REALCE : undefined}>{l.depois}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function RelatorioAlteracoesCaixas({ arvore = [], camposRelevantes = [], mapaEmpresas, labelEmpresa, contexto = {} }) {
  const sub = [contexto.rede, contexto.empresa, contexto.periodo].filter(Boolean).join('  ·  ');
  return (
    <div className="rd-doc-wrap">
      {/* Impressão limpa: oculta o fundo decorativo do app e sombras. O timbrado
          e suas margens vêm de relatorioImpressao.css (padrão dos relatórios IA). */}
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

            {arvore.length === 0 && (
              <p className="rd-muted" style={{ marginTop: '4mm' }}>Nenhum evento corresponde aos filtros.</p>
            )}

            {arvore.map((owner) => (
              <div className="rd-secao" key={owner.userKey}>
                <h2>
                  {owner.usuarioNome}
                  <span className="rd-muted" style={{ fontWeight: 400, fontSize: '9pt', marginLeft: '2mm' }}>
                    · {owner.tipos.map(t => `${TIPO[t.tipo]?.rotulo || t.tipo}: ${t.count}`).join('   ·   ')}
                  </span>
                </h2>
                {owner.tipos.map((t) => (
                  <div key={t.tipo} style={{ margin: '0 0 3mm' }}>
                    <h3 style={{ color: (TIPO[t.tipo]?.cor || '#191a1c'), margin: '0 0 1.5mm' }}>
                      {TIPO[t.tipo]?.rotulo || t.tipo}
                      <span className="rd-muted" style={{ fontWeight: 400, marginLeft: '1.5mm' }}>({t.count})</span>
                    </h3>
                    {t.eventos.map((ev, i) => (
                      <EventoImpresso key={i} ev={ev} campos={camposRelevantes} mapaEmpresas={mapaEmpresas} labelEmpresa={labelEmpresa} />
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
