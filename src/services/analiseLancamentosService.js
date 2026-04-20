// Analise de consistencia de lancamentos.
// Detecta:
//   - Duplicatas (mesma data + mesmo valor + mesma descricao dentro de uma conta)
//   - Aumentos exagerados (mes atual > mediaOutrosMeses * FATOR_AUMENTO)
//   - Diminuicoes exageradas (mes atual < mediaOutrosMeses * FATOR_DIMINUICAO)

const FATOR_AUMENTO = 2.0;     // acima de 100% da media = aumento exagerado
const FATOR_DIMINUICAO = 0.5;  // abaixo de 50% da media = queda exagerada
const VALOR_MINIMO = 1.0;      // ignora valores proximos de zero para nao gerar ruido

function normDescricao(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// lancamentosPorConta: { [codigoConta]: [ { id, data, descricao, valor, sinal, mesKey, situacao } ] }
// contasFlags: { [codigo]: { codigo, descricao } }
// meses: [ { key, label, ano, mes } ]
export function analisarLancamentos(lancamentosPorConta, contasFlags, meses) {
  const duplicados = [];
  const aumentos = [];
  const diminuicoes = [];
  const ausencias = [];
  const contasAnalisadas = [];

  const flags = contasFlags || {};
  const codigosFlagados = Object.keys(flags);

  for (const codigo of codigosFlagados) {
    const lancs = lancamentosPorConta[codigo] || [];
    const cfg = flags[codigo];
    const descricaoConta = cfg?.descricao || '';
    const recorrente = !!cfg?.recorrente;
    contasAnalisadas.push({ codigo, descricao: descricaoConta, totalLancamentos: lancs.length, recorrente });

    // Contas recorrentes: verificar se cada mes tem ao menos 1 lancamento
    if (recorrente) {
      const presentes = new Set(lancs.map(l => l.mesKey));
      meses.forEach(m => {
        if (!presentes.has(m.key)) {
          ausencias.push({ codigo, descricaoConta, mes: m.label, mesKey: m.key });
        }
      });
    }

    // ── 1) Duplicatas ──
    // Lancamentos parcelados NAO sao duplicatas. Detectamos parcelas por:
    //   a) quantidadeParcelas > 1 (quando a API preenche)
    //   b) mesmo numeroTitulo + mesmo fornecedor (mesmo titulo desdobrado em parcelas)
    // Para (b): primeiro agrupamos por (numeroTitulo + fornecedor). Se ha 2+ lancamentos
    // nesse grupo, sao parcelas do mesmo titulo - todos sao ignorados na deteccao.
    const idsParcelados = new Set();
    const porTitulo = new Map();
    lancs.forEach(l => {
      if (l.quantidadeParcelas && l.quantidadeParcelas > 1) {
        idsParcelados.add(l.id);
        return;
      }
      if (l.numeroTitulo && l.fornecedorCodigo) {
        const chave = `${l.numeroTitulo}|${l.fornecedorCodigo}`;
        if (!porTitulo.has(chave)) porTitulo.set(chave, []);
        porTitulo.get(chave).push(l);
      }
    });
    porTitulo.forEach(arr => {
      if (arr.length >= 2) arr.forEach(l => idsParcelados.add(l.id));
    });

    const grupos = new Map();
    lancs.forEach(l => {
      if (idsParcelados.has(l.id)) return;
      const key = `${l.data || ''}|${Number(l.valor || 0).toFixed(2)}|${normDescricao(l.descricao)}`;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(l);
    });
    grupos.forEach((arr) => {
      if (arr.length >= 2) {
        duplicados.push({
          codigo,
          descricaoConta,
          data: arr[0].data,
          valor: arr[0].valor,
          descricao: arr[0].descricao,
          quantidade: arr.length,
          ids: arr.map(x => x.id),
        });
      }
    });

    // ── 2) Picos e quedas (requer pelo menos 2 meses) ──
    if (meses.length >= 2) {
      const totaisPorMes = {};
      meses.forEach(m => { totaisPorMes[m.key] = 0; });
      lancs.forEach(l => {
        if (totaisPorMes[l.mesKey] !== undefined) {
          totaisPorMes[l.mesKey] += Math.abs(Number(l.valor || 0));
        }
      });

      for (const mes of meses) {
        const atual = totaisPorMes[mes.key];
        const outros = meses.filter(m => m.key !== mes.key).map(m => totaisPorMes[m.key]);
        const outrosValidos = outros.filter(v => v > VALOR_MINIMO);
        if (outrosValidos.length === 0) continue;
        const media = outrosValidos.reduce((s, v) => s + v, 0) / outrosValidos.length;
        if (media <= VALOR_MINIMO) continue;

        if (atual > media * FATOR_AUMENTO && atual > VALOR_MINIMO) {
          aumentos.push({
            codigo,
            descricaoConta,
            mes: mes.label,
            mesKey: mes.key,
            valorMes: atual,
            mediaOutrosMeses: media,
            variacaoPct: ((atual - media) / media) * 100,
          });
        } else if (atual < media * FATOR_DIMINUICAO && media > VALOR_MINIMO) {
          diminuicoes.push({
            codigo,
            descricaoConta,
            mes: mes.label,
            mesKey: mes.key,
            valorMes: atual,
            mediaOutrosMeses: media,
            variacaoPct: ((atual - media) / media) * 100,
          });
        }
      }
    }
  }

  // Ordenar por magnitude
  duplicados.sort((a, b) => b.quantidade - a.quantidade || Math.abs(b.valor) - Math.abs(a.valor));
  aumentos.sort((a, b) => b.variacaoPct - a.variacaoPct);
  diminuicoes.sort((a, b) => a.variacaoPct - b.variacaoPct);

  return {
    duplicados,
    aumentos,
    diminuicoes,
    ausencias,
    contasAnalisadas,
    resumo: {
      totalContas: contasAnalisadas.length,
      totalDuplicados: duplicados.length,
      totalAumentos: aumentos.length,
      totalDiminuicoes: diminuicoes.length,
      totalAusencias: ausencias.length,
    },
  };
}
