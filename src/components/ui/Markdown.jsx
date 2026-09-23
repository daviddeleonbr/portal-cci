// Renderizador de Markdown leve e SEGURO (constrói elementos React — nunca
// injeta HTML cru, então não há risco de XSS). Suporta um subconjunto:
//   # ## ###  títulos · **negrito** _itálico_ · - / * listas · 1. listas
//   [texto](https://…) links · parágrafos separados por linha em branco.
import React from 'react';

const PADROES = [
  { re: /^\*\*([^*]+)\*\*/, tag: 'strong' },
  { re: /^__([^_]+)__/, tag: 'strong' },
  { re: /^\*([^*]+)\*/, tag: 'em' },
  { re: /^_([^_]+)_/, tag: 'em' },
  { re: /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/, tag: 'a' },
];

function inline(text, kp) {
  const out = [];
  let i = 0, buf = '', k = 0;
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  while (i < text.length) {
    const sub = text.slice(i);
    let achou = false;
    for (const p of PADROES) {
      const m = sub.match(p.re);
      if (!m) continue;
      flush();
      if (p.tag === 'a') {
        out.push(<a key={`${kp}-${k++}`} href={m[2]} target="_blank" rel="noreferrer" className="text-teal-700 underline underline-offset-2">{m[1]}</a>);
      } else {
        out.push(React.createElement(p.tag, { key: `${kp}-${k++}` }, m[1]));
      }
      i += m[0].length; achou = true; break;
    }
    if (!achou) { buf += text[i]; i++; }
  }
  flush();
  return out;
}

function parseBlocos(texto) {
  const linhas = String(texto || '').replace(/\r\n/g, '\n').split('\n');
  const blocos = [];
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i];
    if (!linha.trim()) { i++; continue; }
    const h = linha.match(/^(#{1,3})\s+(.*)$/);
    if (h) { blocos.push({ tipo: 'h', nivel: h[1].length, texto: h[2] }); i++; continue; }
    if (/^\s*[-*]\s+/.test(linha)) {
      const itens = [];
      while (i < linhas.length && /^\s*[-*]\s+/.test(linhas[i])) { itens.push(linhas[i].replace(/^\s*[-*]\s+/, '')); i++; }
      blocos.push({ tipo: 'ul', itens }); continue;
    }
    if (/^\s*\d+\.\s+/.test(linha)) {
      const itens = [];
      while (i < linhas.length && /^\s*\d+\.\s+/.test(linhas[i])) { itens.push(linhas[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      blocos.push({ tipo: 'ol', itens }); continue;
    }
    const par = [linha]; i++;
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,3}\s|\s*[-*]\s|\s*\d+\.\s)/.test(linhas[i])) { par.push(linhas[i]); i++; }
    blocos.push({ tipo: 'p', texto: par.join(' ') });
  }
  return blocos;
}

export default function Markdown({ children, className = '' }) {
  const blocos = parseBlocos(children);
  return (
    <div className={className}>
      {blocos.map((b, idx) => {
        if (b.tipo === 'h') {
          const cls = b.nivel === 1
            ? 'text-[1.15em] font-bold text-slate-900 mt-5 mb-2'
            : b.nivel === 2
            ? 'text-[1.02em] font-bold text-teal-800 mt-5 mb-1.5'
            : 'text-[0.95em] font-semibold text-slate-800 mt-4 mb-1';
          const Tag = `h${Math.min(b.nivel + 1, 4)}`;
          return React.createElement(Tag, { key: idx, className: cls }, inline(b.texto, `h${idx}`));
        }
        if (b.tipo === 'ul') {
          return <ul key={idx} className="my-2 space-y-1 list-disc pl-5 marker:text-teal-500">{b.itens.map((it, j) => <li key={j} className="leading-relaxed">{inline(it, `u${idx}-${j}`)}</li>)}</ul>;
        }
        if (b.tipo === 'ol') {
          return <ol key={idx} className="my-2 space-y-1 list-decimal pl-5 marker:text-teal-600 marker:font-semibold">{b.itens.map((it, j) => <li key={j} className="leading-relaxed">{inline(it, `o${idx}-${j}`)}</li>)}</ol>;
        }
        return <p key={idx} className="my-2.5 leading-relaxed text-slate-600">{inline(b.texto, `p${idx}`)}</p>;
      })}
    </div>
  );
}
