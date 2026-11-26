// Transferências ENTRE EMPRESAS do mesmo grupo (rede) — funções puras.
//
// 1. Indícios: evidência FORTE quando o plano/contrapartida é uma conta cadastrada
//    como de transferência entre filiais (rede_contas_intercompany). Sem cadastro,
//    um movimento "parece" transferência entre empresas quando a pessoa
//    (favorecido/pagador) ou o histórico citam OUTRA empresa da rede, ou o histórico
//    fala de transferência entre filiais/empresas, mútuo, conta corrente entre
//    empresas. Sem indício, um valor igual em outra empresa é só coincidência.
// 2. Casamento: saída de uma empresa × entrada de OUTRA empresa, mesmo valor (até
//    1 centavo), até 3 dias de distância. Nível da evidência:
//      comprovado — as duas pontas têm indício e a mesma data (ou o mesmo documento);
//      provavel   — pelo menos uma ponta tem indício, datas até 3 dias, par único;
//    Ponta com indício e sem par = "sem contrapartida" (na visão da rede inteira) ou
//    "contrapartida não verificada" (empresa analisada sozinha).
// 3. Eliminação: na visão CONSOLIDADA, só os pares comprovados/prováveis saem do
//    fluxo (as duas pontas). Nunca se elimina ponta solta.
// Não altera classificação nem lançamento — só lê.

const r2 = (v) => Math.round(v * 100) / 100;
const PALAVRAS_VAZIAS = new Set(['LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'S', 'A', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'COMERCIO', 'COM',
  'POSTO', 'AUTO', 'COMBUSTIVEIS', 'COMBUSTIVEL', 'DERIVADOS', 'PETROLEO', 'SERVICOS', 'SERVICO', 'LOJA', 'CONVENIENCIA', 'REDE', 'FILIAL', 'MATRIZ']);
const RE_TRANSFERENCIA = /(transf\w*|tr[ae]nsf\w*).{0,25}(filial|empresa|posto|grupo|matriz|loja)|entre\s+(empresas|filiais|postos)|m[uú]tuo|c\/?c\.?\s*(filial|empresa)|conta\s+corrente\s+(entre|filial|empresa)|intercompany|aporte\s+(filial|empresa)/i;

export const normalizarNome = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(p => p && !PALAVRAS_VAZIAS.has(p));

// Identificador estável de um movimento (para excluir as pontas casadas)
export const idMovimento = (m) => `${m.empresaCodigo ?? ''}|${m.codigo ?? m.movimentoContaCodigo ?? ''}|${m.contaCodigo ?? ''}|${m.dataMovimento ?? ''}|${m.tipo}|${Number(m.valor || 0)}`;

// Quais empresas da rede um texto cita (por nome/apelido, ignorando palavras
// genéricas). Vale o nome MAIS ESPECÍFICO: "DONA ROSA II" cita a Dona Rosa II, não
// a Dona Rosa — por isso compara com TODAS as empresas (inclusive a própria) e só
// depois tira a própria.
function empresasCitadas(texto, empresas, propria) {
  const t = ` ${normalizarNome(texto).join(' ')} `;
  if (t.trim() === '') return [];
  const achados = [];
  empresas.forEach(e => {
    [e.nome, e.apelido, e.razao_social, e.fantasia].filter(Boolean).map(n => normalizarNome(n).join(' '))
      .filter(n => n.length >= 3 && t.includes(` ${n} `))
      .forEach(n => achados.push({ cod: String(e.empresa_codigo), n }));
  });
  const maximos = achados.filter(a => !achados.some(b => b.n !== a.n && b.n.includes(a.n)));
  return [...new Set(maximos.map(a => a.cod))].filter(c => c !== propria);
}

// Indício de transferência entre empresas num movimento → { motivo, citadas, conta? } | null
// contasIntercompany: Set de códigos cadastrados (plano gerencial / contrapartida).
export function indicioIntercompany(m, empresas = [], contasIntercompany = null) {
  const propria = String(m.empresaCodigo ?? '');
  if (contasIntercompany?.size) {
    const codigos = [m.planoContaGerencialCodigo, m._contraparteBruta].filter(c => c != null).map(c => String(c).trim());
    if (codigos.some(c => contasIntercompany.has(c))) return { motivo: 'conta de transferência entre filiais', citadas: [], conta: true };
  }
  const pessoa = m.pessoaNome || m.nomePessoa || '';
  const citadasPessoa = pessoa ? empresasCitadas(pessoa, empresas, propria) : [];
  if (citadasPessoa.length) return { motivo: `pessoa "${pessoa}" é empresa do grupo`, citadas: citadasPessoa };
  const texto = [m.descricao, m.historico, m.planoContaGerencialDescricao].filter(Boolean).join(' · ');
  const citadasTexto = empresasCitadas(texto, empresas, propria);
  if (citadasTexto.length) return { motivo: 'histórico cita empresa do grupo', citadas: citadasTexto };
  if (RE_TRANSFERENCIA.test(texto)) return { motivo: 'histórico de transferência entre empresas', citadas: [] };
  return null;
}

const diasEntre = (a, b) => Math.abs((new Date(`${String(a).slice(0, 10)}T12:00:00Z`) - new Date(`${String(b).slice(0, 10)}T12:00:00Z`)) / 86400000);

// → { pares: [...], soltas: [...], idsEliminaveis: Set, resumo }
// movimentos: todos os movimentos carregados (normalizados), com empresaCodigo.
// tipoPorConta: só contas bancária/caixa entram. empresas: [{ empresa_codigo, nome, apelido? }].
// visaoRede: true quando TODAS as empresas envolvidas estão carregadas (consolidado).
export function analisarIntercompany({ movimentos = [], tipoPorConta = new Map(), empresas = [], contasIntercompany = null, visaoRede = true, toleranciaDias = 3 }) {
  const doCaixa = movimentos.filter(m => {
    const t = tipoPorConta.get(String(m.contaCodigo ?? '').trim());
    return (t === 'bancaria' || t === 'caixa') && m.empresaCodigo != null && Number(m.valor) > 0;
  });
  const comIndicio = new Map(); // id → indício
  doCaixa.forEach(m => { const ind = indicioIntercompany(m, empresas, contasIntercompany); if (ind) comIndicio.set(idMovimento(m), ind); });

  // Candidatos a par: com indício (de um lado), e qualquer movimento de outra empresa
  // com valor igual e sentido oposto (do outro lado)
  const porValor = new Map();
  doCaixa.forEach(m => {
    const k = r2(Number(m.valor)).toFixed(2);
    if (!porValor.has(k)) porValor.set(k, []);
    porValor.get(k).push(m);
  });

  const usados = new Set();
  const pares = [];
  // Primeiro os casos mais fortes: ordena pontas com indício, da maior para a menor
  const pontas = doCaixa.filter(m => comIndicio.has(idMovimento(m))).sort((a, b) => Number(b.valor) - Number(a.valor));
  pontas.forEach(a => {
    const idA = idMovimento(a);
    if (usados.has(idA)) return;
    const candidatos = (porValor.get(r2(Number(a.valor)).toFixed(2)) || []).filter(b => {
      const idB = idMovimento(b);
      if (usados.has(idB) || idB === idA) return false;
      if (String(b.empresaCodigo) === String(a.empresaCodigo)) return false;
      if (b.tipo === a.tipo) return false; // sentido oposto
      if (diasEntre(a.dataMovimento, b.dataMovimento) > toleranciaDias) return false;
      // se a ponta A cita empresas, a outra ponta tem que ser de uma delas
      const indA = comIndicio.get(idA);
      if (indA.citadas.length && !indA.citadas.includes(String(b.empresaCodigo))) return false;
      return true;
    });
    if (!candidatos.length) return;
    // Melhor candidato: com indício, mesma data, mesmo documento
    const nota = (b) => (comIndicio.has(idMovimento(b)) ? 4 : 0) + (diasEntre(a.dataMovimento, b.dataMovimento) === 0 ? 2 : 0)
      + (a.documento && b.documento && String(a.documento) === String(b.documento) ? 3 : 0);
    candidatos.sort((x, y) => nota(y) - nota(x) || diasEntre(a.dataMovimento, x.dataMovimento) - diasEntre(a.dataMovimento, y.dataMovimento));
    const b = candidatos[0];
    const ambosComIndicio = comIndicio.has(idMovimento(b));
    const mesmaData = diasEntre(a.dataMovimento, b.dataMovimento) === 0;
    const mesmoDoc = a.documento && b.documento && String(a.documento) === String(b.documento);
    // Par ambíguo (vários candidatos igualmente bons) não vira "comprovado"
    const empate = candidatos.length > 1 && nota(candidatos[1]) === nota(b);
    const pelasContas = comIndicio.get(idA)?.conta && comIndicio.get(idMovimento(b))?.conta && diasEntre(a.dataMovimento, b.dataMovimento) <= 1;
    const nivel = ((ambosComIndicio && mesmaData) || mesmoDoc || pelasContas) && !empate ? 'comprovado' : 'provavel';
    usados.add(idA); usados.add(idMovimento(b));
    const saida = a.tipo === 'Crédito' ? b : a;
    const entrada = a.tipo === 'Crédito' ? a : b;
    pares.push({
      nivel,
      valor: r2(Number(a.valor)),
      diasEntre: diasEntre(a.dataMovimento, b.dataMovimento),
      empresaOrigem: String(saida.empresaCodigo),
      empresaDestino: String(entrada.empresaCodigo),
      saida: resumoMov(saida, comIndicio.get(idMovimento(saida))),
      entrada: resumoMov(entrada, comIndicio.get(idMovimento(entrada))),
      ids: [idMovimento(saida), idMovimento(entrada)],
    });
  });

  const soltas = pontas.filter(m => !usados.has(idMovimento(m))).map(m => ({
    ...resumoMov(m, comIndicio.get(idMovimento(m))),
    situacao: visaoRede ? 'sem_contrapartida' : 'contrapartida_nao_verificada',
  }));

  const idsEliminaveis = new Set(pares.flatMap(p => p.ids));
  const soma = (l) => r2(l.reduce((s, p) => s + p.valor, 0));
  return {
    pares,
    soltas,
    idsEliminaveis,
    resumo: {
      pares: pares.length,
      comprovados: pares.filter(p => p.nivel === 'comprovado').length,
      provaveis: pares.filter(p => p.nivel === 'provavel').length,
      valorPares: soma(pares),
      soltas: soltas.length,
      valorSoltasEntradas: r2(soltas.filter(s => s.sinal > 0).reduce((s, x) => s + x.valor, 0)),
      valorSoltasSaidas: r2(soltas.filter(s => s.sinal < 0).reduce((s, x) => s + x.valor, 0)),
    },
  };
}

function resumoMov(m, indicio) {
  return {
    id: idMovimento(m),
    empresaCodigo: String(m.empresaCodigo),
    contaCodigo: String(m.contaCodigo ?? ''),
    data: String(m.dataMovimento || '').slice(0, 10),
    valor: r2(Number(m.valor || 0)),
    sinal: m.tipo === 'Crédito' ? 1 : -1,
    descricao: (m.descricao || '').trim() || '—',
    pessoa: m.pessoaNome || m.nomePessoa || null,
    indicio: indicio?.motivo || null,
  };
}

// dadosPorMes sem os movimentos eliminados (as duas pontas dos pares)
export function removerMovimentos(dadosPorMes = {}, ids = new Set()) {
  if (!ids || ids.size === 0) return dadosPorMes;
  const out = {};
  Object.entries(dadosPorMes).forEach(([k, d]) => {
    out[k] = { ...d, movimentos: (d.movimentos || []).filter(m => !ids.has(idMovimento(m))) };
  });
  return out;
}
