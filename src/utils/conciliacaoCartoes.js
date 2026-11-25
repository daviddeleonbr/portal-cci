// Conciliação de cartões: arquivos (Equals/adquirentes) × sistema. Função pura,
// usada por BpoDiagnosticarCartoes.
//
// Transação dos dois lados: { adquirente, bandeira, modalidade, autorizacao, valor, … }
// já normalizadas. `coberto: false` (só no sistema) = adquirente que nenhum arquivo
// cobre: não é cobrada, mas ainda pode ser o par de uma venda lançada na adquirente errada.

const v2 = t => t.valor.toFixed(2);
// Bandeira e modalidade só contam quando OS DOIS lados têm o valor (vazio = não se
// aplica — ex.: Good Card sem bandeira no sistema, arquivo sem débito/crédito).
const compat = (x, y) => !x || !y || x === y;
const difere = (x, y) => !!x && !!y && x !== y;

// PROVÁVEIS: só um campo (ou um par específico) diverge. Na mesma adquirente.
const PADROES_PROVAVEL = [
  { motivo: 'valor', label: 'Valor diferente',
    casa: (e, s) => e.autorizacao === s.autorizacao && v2(e) !== v2(s) && compat(e.bandeira, s.bandeira) && compat(e.modalidade, s.modalidade) },
  { motivo: 'autorizacao', label: 'Autorização diferente',
    casa: (e, s) => v2(e) === v2(s) && e.autorizacao !== s.autorizacao && compat(e.bandeira, s.bandeira) && compat(e.modalidade, s.modalidade) },
  { motivo: 'bandeira', label: 'Bandeira diferente',
    casa: (e, s) => e.autorizacao === s.autorizacao && v2(e) === v2(s) && difere(e.bandeira, s.bandeira) && compat(e.modalidade, s.modalidade) },
  { motivo: 'modalidade', label: 'Tipo diferente',
    casa: (e, s) => e.autorizacao === s.autorizacao && v2(e) === v2(s) && difere(e.modalidade, s.modalidade) && compat(e.bandeira, s.bandeira) },
  { motivo: 'bandeira_modalidade', label: 'Bandeira e tipo diferentes',
    casa: (e, s) => e.autorizacao === s.autorizacao && v2(e) === v2(s) && difere(e.bandeira, s.bandeira) && difere(e.modalidade, s.modalidade) },
];

function indexar(lista, chave) {
  const m = new Map();
  lista.forEach(t => { const k = chave(t); const arr = m.get(k) || []; arr.push(t); m.set(k, arr); });
  return m;
}

export function conciliarCartoes(listaArquivos, sistemaTx) {
  const usados = new Set();
  const cobertas = sistemaTx.filter(t => t.coberto !== false);

  // 1) CONCILIADAS: adquirente, autorização e valor iguais; bandeira e tipo compatíveis.
  const idxExato = indexar(cobertas, t => `${t.adquirente}|${t.autorizacao}|${v2(t)}`);
  const conciliadas = [];
  let restArquivos = [];
  listaArquivos.forEach(e => {
    const s = (idxExato.get(`${e.adquirente}|${e.autorizacao}|${v2(e)}`) || [])
      .find(t => !usados.has(t) && compat(e.bandeira, t.bandeira) && compat(e.modalidade, t.modalidade));
    if (s) { usados.add(s); conciliadas.push({ equals: e, sistema: s }); }
    else restArquivos.push(e);
  });

  const provaveis = [];
  const parear = (motivo, motivoLabel, achar) => {
    restArquivos = restArquivos.filter(e => {
      const s = achar(e);
      if (!s) return true;
      usados.add(s);
      provaveis.push({ equals: e, sistema: s, motivo, motivoLabel });
      return false;
    });
  };

  // 2) ADQUIRENTE DIFERENTE: autorização e valor iguais, bandeira e tipo compatíveis,
  //    lançada em outra adquirente. Vem antes dos demais padrões porque autorização +
  //    valor é prova mais forte (o padrão "autorização diferente" casa só pelo valor).
  //    Aqui entram também as adquirentes sem arquivo.
  const idxAutValor = indexar(
    sistemaTx.filter(t => !usados.has(t) && t.adquirente),
    t => `${t.autorizacao}|${v2(t)}`,
  );
  parear('adquirente', 'Adquirente diferente', e => (!e.adquirente ? null
    : (idxAutValor.get(`${e.autorizacao}|${v2(e)}`) || []).find(t => !usados.has(t) && t.adquirente !== e.adquirente
      && compat(e.bandeira, t.bandeira) && compat(e.modalidade, t.modalidade))));

  // 3) Demais prováveis, na mesma adquirente.
  PADROES_PROVAVEL.forEach(p => {
    const porAdq = indexar(cobertas.filter(t => !usados.has(t)), t => t.adquirente);
    parear(p.motivo, p.label, e => (porAdq.get(e.adquirente) || []).find(t => !usados.has(t) && p.casa(e, t)));
  });

  return {
    conciliadas,
    provaveis,
    soEquals: restArquivos,
    soSistema: cobertas.filter(t => !usados.has(t)),
    // Adquirente sem arquivo e sem par: fora da conferência
    naoConferidas: sistemaTx.filter(t => t.coberto === false && !usados.has(t)),
  };
}

// Resumo "lançado em X, arquivo diz Y" das prováveis por adquirente.
export function resumoAdquirentes(provaveis) {
  const m = new Map();
  (provaveis || []).filter(p => p.motivo === 'adquirente').forEach(p => {
    const k = `${p.sistema.adquirente}|${p.equals.adquirente}`;
    const g = m.get(k) || { sistema: p.sistema.adquirente, arquivo: p.equals.adquirente, qtd: 0, valor: 0 };
    g.qtd += 1; g.valor += p.equals.valor || 0;
    m.set(k, g);
  });
  return [...m.values()].sort((a, b) => b.qtd - a.qtd);
}
