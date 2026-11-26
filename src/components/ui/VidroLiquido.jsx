// Superfície "liquid glass": vidro translúcido que acompanha o tema (claro/escuro),
// com brilho na borda e, no Chrome/Edge, REFRAÇÃO nas bordas (o fundo entorta como
// numa lente). Nos outros navegadores fica o vidro desfocado. Estilos: `.vidro-liquido`
// no index.css (inclui "reduzir transparência" e "reduzir movimento").
import { useId, useLayoutEffect, useRef, useState } from 'react';

// Filtro SVG dentro de backdrop-filter só funciona no Chromium; o Safari e o
// Firefox aceitam a regra mas não desenham nada.
const REFRATA = typeof navigator !== 'undefined'
  && !!navigator.userAgentData?.brands?.some(b => /Chromium/i.test(b.brand));

// Mapa de deslocamento do tamanho da peça: vermelho = eixo X, azul = eixo Y.
// O miolo (meio-tom, desfocado) não desloca nada: só as bordas entortam.
function mapaLente(w, h, raio) {
  const b = 12; // largura da borda que refrata
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
    + '<defs><linearGradient id="x" x1="1" x2="0"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#000"/></linearGradient>'
    + '<linearGradient id="y" x1="0" x2="0" y1="1" y2="0"><stop offset="0" stop-color="#00f"/><stop offset="1" stop-color="#000"/></linearGradient></defs>'
    + `<rect width="${w}" height="${h}" fill="#000"/><rect width="${w}" height="${h}" rx="${raio}" fill="url(#x)"/>`
    + `<rect width="${w}" height="${h}" rx="${raio}" fill="url(#y)" style="mix-blend-mode:screen"/>`
    + `<rect x="${b}" y="${b}" width="${w - 2 * b}" height="${h - 2 * b}" rx="${Math.max(0, raio - b / 2)}" fill="#800080" style="filter:blur(7px)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export default function VidroLiquido({ raio = 22, className = '', style, children, ...props }) {
  const ref = useRef(null);
  const idFiltro = `vidro${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [tam, setTam] = useState(null);

  useLayoutEffect(() => {
    if (!REFRATA || !ref.current) return undefined;
    const el = ref.current;
    const medir = () => {
      const w = Math.round(el.offsetWidth); const h = Math.round(el.offsetHeight);
      setTam(t => (t && t.w === w && t.h === h ? t : { w, h }));
    };
    const ro = new ResizeObserver(medir); // já mede ao começar a observar
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} {...props} className={`vidro-liquido ${tam ? 'vidro-refrata' : ''} ${className}`}
      style={{ ...style, borderRadius: raio, ...(tam ? { '--vidro-filtro': `url(#${idFiltro})` } : {}) }}>
      {tam && (
        <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true" focusable="false">
          <filter id={idFiltro} x="0" y="0" width={tam.w} height={tam.h}
            filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feImage href={mapaLente(tam.w, tam.h, raio)} x="0" y="0" width={tam.w} height={tam.h} result="mapa" preserveAspectRatio="none" />
            <feDisplacementMap in="SourceGraphic" in2="mapa" scale="56" xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </svg>
      )}
      {children}
    </div>
  );
}
