// Detalhamento de um SERVIÇO (catálogo) exibido de forma estruturada.
// Reconhece a estrutura do texto digitado normalmente no cadastro — sem exigir
// sintaxe especial — e também aceita marcações simples:
//   - linha curta sem pontuação final  → título          (ex.: "Entregas")
//   - "1. Título"                      → seção numerada  (ex.: "1. Análise de vendas")
//   - linhas seguidas dentro de seção   → itens de lista
//   - "Termo: explicação"              → item com o termo em negrito
//   - linha com várias frases           → parágrafo
//   - "- item" / "• item"              → item; **texto** → negrito
// Tamanhos em `em`: escala com a fonte do lugar onde é usado (contrato,
// proposta pública, PDF). Cores via props para servir tela/impressão.

import React from 'react';

const RE_NUMERADO = /^(\d+)[.)]\s+(.+)$/;
const RE_MARCADOR = /^[-*•]\s+(.+)$/;
const RE_TERMO = /^([^:]{2,70}):\s+(.+)$/;

// Linha curta sem pontuação de fim → título de bloco.
function ehTitulo(t) {
  return t.length <= 70 && !/[;:.,]$/.test(t) && !RE_MARCADOR.test(t) && !RE_TERMO.test(t);
}
// Duas ou mais frases → parágrafo explicativo, não item.
function ehParagrafo(t) {
  return (t.match(/[.!?](\s|$)/g) || []).length >= 2 && !RE_TERMO.test(t);
}

function estruturarDescricao(texto) {
  const linhas = String(texto || '').replace(/\r\n/g, '\n').split('\n').map(l => l.trim());
  const blocos = [];
  let lista = null;
  const fecharLista = () => { if (lista) { blocos.push(lista); lista = null; } };

  linhas.forEach((t) => {
    if (!t) { fecharLista(); return; }
    const md = t.match(/^#{1,3}\s+(.+)$/);
    if (md) { fecharLista(); blocos.push({ tipo: 'titulo', texto: md[1] }); return; }
    const num = t.match(RE_NUMERADO);
    if (num && num[2].length <= 90 && !/[;]$/.test(num[2])) {
      fecharLista(); blocos.push({ tipo: 'secao', numero: num[1], texto: num[2] }); return;
    }
    const mk = t.match(RE_MARCADOR);
    const conteudo = mk ? mk[1] : t;
    if (!mk && ehTitulo(t)) { fecharLista(); blocos.push({ tipo: 'titulo', texto: t }); return; }
    if (!mk && ehParagrafo(t)) { fecharLista(); blocos.push({ tipo: 'paragrafo', texto: t }); return; }
    const termo = conteudo.match(RE_TERMO);
    if (!lista) lista = { tipo: 'lista', itens: [] };
    lista.itens.push(termo ? { termo: termo[1], texto: termo[2] } : { texto: conteudo });
  });
  fecharLista();
  return blocos;
}

// **negrito** inline (constrói elementos React — nunca injeta HTML).
function inline(texto, kp) {
  return String(texto).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) => (
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={`${kp}-${i}`}>{p.slice(2, -2)}</strong> : <React.Fragment key={`${kp}-${i}`}>{p}</React.Fragment>
  ));
}

// cores: { titulo, texto, marcador } — classes Tailwind ou cores CSS (style).
export default function DescricaoEstruturada({ texto, className = '', corTitulo = '#0f766e', corTexto = 'inherit', corForte = 'inherit' }) {
  const blocos = estruturarDescricao(texto);
  if (blocos.length === 0) return null;
  return (
    <div className={className} style={{ color: corTexto }}>
      {blocos.map((b, i) => {
        if (b.tipo === 'titulo') {
          return <p key={i} style={{ color: corTitulo, fontWeight: 700, fontSize: '0.92em', textTransform: 'uppercase', letterSpacing: '0.03em', margin: i ? '0.9em 0 0.3em' : '0 0 0.3em' }}>{inline(b.texto, `t${i}`)}</p>;
        }
        if (b.tipo === 'secao') {
          return (
            <p key={i} style={{ color: corForte, fontWeight: 700, margin: i ? '0.75em 0 0.25em' : '0 0 0.25em' }}>
              <span style={{ color: corTitulo }}>{b.numero}.</span> {inline(b.texto, `s${i}`)}
            </p>
          );
        }
        if (b.tipo === 'paragrafo') {
          return <p key={i} style={{ margin: '0.35em 0', lineHeight: 1.5 }}>{inline(b.texto, `p${i}`)}</p>;
        }
        return (
          <ul key={i} style={{ margin: '0.2em 0 0.4em', paddingLeft: '1.15em', listStyle: 'disc', lineHeight: 1.5 }}>
            {b.itens.map((it, j) => (
              <li key={j} style={{ margin: '0.15em 0' }}>
                {it.termo && <strong style={{ color: corForte }}>{inline(it.termo, `k${i}-${j}`)}: </strong>}
                {inline(it.texto, `v${i}-${j}`)}
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
