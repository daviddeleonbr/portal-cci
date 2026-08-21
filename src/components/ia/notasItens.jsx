// Notas explicativas do consultor por ITEM / TÓPICO.
//
// O consultor clica em "+ porquê" num item problemático específico OU no
// cabeçalho de qualquer tópico e escreve o motivo. Cada nota guarda um RÓTULO
// (o texto do item/tópico) + o TEXTO da explicação. No PDF, todas as notas são
// impressas numa seção consolidada e destacada ("Notas do consultor"), cada uma
// com o seu rótulo — então nenhuma nota se perde, mesmo que o item não apareça
// isoladamente no relatório.
//
// A CHAVE é derivada do texto que identifica o item — use SEMPRE chaveNota(secao,
// texto) com os mesmos argumentos na tela e (quando aplicável) no PDF.

import { createContext, useContext, useState } from 'react';

// ─── Chave estável de um item anotável ─────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function chaveNota(secao, texto) {
  const slug = String(texto || '')
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${secao}:${slug}`;
}

// Valor da nota pode ser string (legado) ou { rotulo, texto }.
// eslint-disable-next-line react-refresh/only-export-components
export function textoNota(val) {
  if (!val) return '';
  return typeof val === 'string' ? val : (val.texto || '');
}
// eslint-disable-next-line react-refresh/only-export-components
export function rotuloNota(val, chave) {
  if (val && typeof val === 'object' && val.rotulo) return val.rotulo;
  // fallback: deriva um rótulo legível da própria chave (secao:slug)
  const semSecao = String(chave || '').split(':').slice(1).join(':');
  return semSecao.replace(/-/g, ' ').trim() || 'Item';
}

// ─── Contexto (evita prop-drilling pelos cards) ────────────────
const Ctx = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useNotasItens() {
  return useContext(Ctx);
}

export function NotasItensProvider({ notas, onSalvar, children }) {
  const [abertaChave, setAberta] = useState(null);
  const valor = {
    notas: notas || {},
    abertaChave,
    abrir: (chave) => setAberta(chave),
    fechar: () => setAberta(null),
    salvar: (chave, texto, rotulo) => { onSalvar?.(chave, texto, rotulo); setAberta(null); },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

// ─── Botão + editor inline (só na TELA) ────────────────────────
// rotulo: identifica o item/tópico (vira o título da nota no PDF).
export function AnotarItem({ chave, rotulo, compacto = false }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null; // fora do provider (ex.: importado no PDF) → nada
  const texto = textoNota(ctx.notas[chave]);
  const tem = !!texto.trim();
  const aberta = ctx.abertaChave === chave;

  if (aberta) {
    return <EditorInline chave={chave} rotulo={rotulo} inicial={texto} ctx={ctx} />;
  }
  return (
    <button
      type="button"
      onClick={() => ctx.abrir(chave)}
      className={`inline-flex items-center gap-1 rounded-md border font-semibold transition-colors ${
        compacto ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[10.5px]'
      } ${
        tem
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
      }`}
      title={tem ? 'Editar o porquê deste item' : 'Explicar o porquê (entra no PDF)'}
    >
      {tem ? '✎ porquê' : '+ porquê'}
    </button>
  );
}

function EditorInline({ chave, rotulo, inicial, ctx }) {
  const [txt, setTxt] = useState(inicial);
  return (
    <div className="mt-1.5 w-full rounded-lg border border-emerald-300 bg-emerald-50/60 p-2 text-left">
      {rotulo && <p className="text-[10px] font-semibold text-emerald-800 mb-1">Por que: {rotulo}</p>}
      <textarea
        value={txt}
        onChange={e => setTxt(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Explique o motivo / o que fazer sobre este item específico…"
        className="w-full rounded-md border border-emerald-200 px-2 py-1.5 text-[12px] text-gray-800 leading-relaxed focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 resize-y"
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button type="button" onClick={() => ctx.salvar(chave, txt.trim(), rotulo)}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700">
          Salvar
        </button>
        <button type="button" onClick={ctx.fechar}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100">
          Cancelar
        </button>
        {inicial.trim() && (
          <button type="button" onClick={() => ctx.salvar(chave, '', rotulo)}
            className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50">
            Remover
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Painel: lista os itens da seção p/ escolher onde anotar ───
export function PainelNotasSecao({ itens, onFechar }) {
  const ctx = useContext(Ctx);
  if (!ctx || !itens?.length) return null;
  return (
    <div className="mb-1 mt-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <p className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
          Escolha o item para explicar o porquê — a nota entra no PDF, abaixo do item
        </p>
        {onFechar && (
          <button type="button" onClick={onFechar}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            title="Fechar sem anotar">
            ✕ Fechar
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {itens.map((it) => (
          <div key={it.chave} className="rounded-md bg-white border border-emerald-100 px-2.5 py-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 min-w-[140px] text-[12px] font-medium text-gray-800">{it.rotulo}</span>
              <AnotarItem chave={it.chave} rotulo={it.rotulo} compacto />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function algumaNotaEm(notas, itens) {
  return (itens || []).some((it) => textoNota(notas?.[it.chave]).trim());
}

// ─── Nota inline (impressa NO CONTEXTO do item/tópico) ─────────
export function NotaItemImpressa({ chave, notas, rotulo }) {
  const texto = textoNota(notas?.[chave]).trim();
  if (!texto) return null;
  return (
    <div className="rd-nota-item">
      <span className="rd-nota-item-rot">✎ Nota do consultor{rotulo ? ` — ${rotulo}` : ''}:</span> {texto}
    </div>
  );
}

// ─── Notas de uma seção (por prefixo de secao), impressas NO CONTEXTO ──
// Para seções cujos itens não são listados 1-a-1 no PDF: imprime todas as
// notas daquela seção, cada uma rotulada com o item.
export function NotasDaSecao({ notas, prefixo }) {
  const alvo = `${prefixo}:`;
  const entradas = Object.entries(notas || {})
    .filter(([chave]) => chave.startsWith(alvo))
    .map(([chave, val]) => ({ rotulo: rotuloNota(val, chave), texto: textoNota(val).trim() }))
    .filter(e => e.texto);
  if (!entradas.length) return null;
  return entradas.map((e, i) => (
    <div key={i} className="rd-nota-item">
      <span className="rd-nota-item-rot">✎ Nota do consultor — {e.rotulo}:</span> {e.texto}
    </div>
  ));
}

// ─── Seção "sobras": notas cujo tópico não tem seção própria ───
// filtro(chave) → true para incluir a nota. Serve p/ imprimir no fim só o que
// NÃO foi mostrado inline no contexto.
export function NotasConsultorConsolidado({ notas, titulo = 'Notas do consultor', filtro }) {
  const entradas = Object.entries(notas || {})
    .filter(([chave]) => !filtro || filtro(chave))
    .map(([chave, val]) => ({ rotulo: rotuloNota(val, chave), texto: textoNota(val).trim() }))
    .filter(e => e.texto);
  if (entradas.length === 0) return null;
  return (
    <section className="rd-notas-consultor rd-secao">
      <div className="rd-nc-cabeca">
        <span className="rd-nc-icone" aria-hidden="true">✎</span>
        <h2>{titulo}</h2>
      </div>
      <p className="rd-nc-intro">Observações da CCI sobre os pontos abaixo:</p>
      {entradas.map((e, i) => (
        <div key={i} className="rd-nc-item">
          <div className="rd-nc-rotulo">{e.rotulo}</div>
          <div className="rd-nc-texto">{e.texto}</div>
        </div>
      ))}
    </section>
  );
}
