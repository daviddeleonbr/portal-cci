// Motor do Fluxo de Caixa — funções PURAS (sem React, sem rede, sem Supabase).
// É a mesma regra da tela RelatorioFluxoCaixa (de onde o código saiu sem mudança de
// comportamento) e passa a ser a fonte única para a tela, a IA e os testes:
//   1. lancamentosAutosystemParaMovimentos → movimentos no formato do Webposto
//   2. indexarMovimentos                  → totais por plano/contrapartida e mês
//   3. montarArvoreFluxo                  → árvore da máscara (grupos + contas)
//   4. montarSemClassificacao             → o que não caiu em nenhum grupo
//   5. montarTransferencias               → transferências entre contas próprias
//   6. aplicarCalculosFluxo / totalGeralFluxo → subtotais e Variação de Caixa
//   7. conciliarFluxoComSaldos            → fluxo × (saldo final − saldo inicial)
// Convenção: valor > 0 = entrou no caixa (Crédito); valor < 0 = saiu (Débito).

// Prefixo do código sintético dos movimentos SEM plano (ou com plano não mapeado).
// Não colide com códigos reais.
export const SEM_PLANO_PREFIX = '__sem_plano__';
// Rótulo/código do grupo sintético de transferências entre contas próprias (só
// aparece quando o usuário filtra um subconjunto de contas no Autosystem: o que
// vem de contas fora da seleção conta como entrada/saída real e É somado na
// Variação de Caixa — diferente de "Sem classificação", que fica de fora).
export const TRANSFER_TIPO_DOC = 'Transferências entre contas';
export const TRANSFER_CODE = `${SEM_PLANO_PREFIX}${TRANSFER_TIPO_DOC}`;

const ordenarPorData = (a, b) => (a.data || '').localeCompare(b.data || '');

// ─── TITULO_PAGAR_PAGAMENTO (Webposto) ───────────────────────────
// Liga o movimento bancário aos títulos pagos nele (titulo.pagamento[].codigoDocumento
// == movimentoContaCodigo) e devolve [{ titulo, valorTitulo, planoCod }] — o valor de
// cada título no plano dele. null = não é pagamento de título (ou sem título).
export function distribuirPagamentoTitulos(m, titulosPorPagamento) {
  if (m.tipoDocumentoOrigem !== 'TITULO_PAGAR_PAGAMENTO' || m.movimentoContaCodigo == null) return null;
  const chave = Number(m.movimentoContaCodigo);
  const lote = titulosPorPagamento?.get(chave);
  if (!Array.isArray(lote) || lote.length === 0) return null;
  const partes = lote.map(t => {
    const entry = Array.isArray(t.pagamento)
      ? t.pagamento.find(p => Number(p?.codigoDocumento) === chave)
      : null;
    const valorDoTitulo = Math.max(0, Number(
      entry?.valorPago ?? t.valorPago ?? t.valor ?? t.valorTitulo ?? 0
    ));
    return { titulo: t, valorTitulo: valorDoTitulo, planoCod: t.planoContaGerencialCodigo };
  }).filter(x => x.valorTitulo > 0 && x.planoCod != null && x.planoCod !== 0);
  const total = partes.reduce((s, x) => s + x.valorTitulo, 0);
  if (!(partes.length > 0 && total > 0)) return null;
  // A soma das partes TEM que fechar com o movimento bancário (senão a variação do
  // fluxo não bate com o extrato). A Quality às vezes grava o lote torto — ex.:
  // lote de 320,60 (mensalidade 159 + seguro 161,60) com pagamento 320,60 num
  // título e 0,64 no outro → 321,24. Se não fechar: usa o valor de face dos
  // títulos quando ELE fecha; senão reparte o movimento proporcionalmente
  // (resíduo na última parte p/ bater ao centavo).
  const alvo = Math.abs(Number(m.valor || 0));
  if (alvo > 0 && Math.abs(total - alvo) > 0.005) {
    const face = partes.map(x => Math.max(0, Number(x.titulo.valor ?? x.titulo.valorTitulo ?? 0)));
    const somaFace = face.reduce((s, v) => s + v, 0);
    const base = Math.abs(somaFace - alvo) <= 0.005 ? face : partes.map(x => x.valorTitulo);
    const somaBase = base.reduce((s, v) => s + v, 0);
    let acum = 0;
    return partes.map((x, i) => {
      const v = i === partes.length - 1
        ? Math.round((alvo - acum) * 100) / 100
        : Math.round(alvo * (base[i] / somaBase) * 100) / 100;
      acum += v;
      return { ...x, valorTitulo: v };
    }).filter(x => x.valorTitulo > 0);
  }
  return partes;
}

// ─── 1. Autosystem: lançamentos da Edge autosystem-fluxo-caixa → movimentos ──
// Contraparte 2.1.1.x (conta-ponte) → usa a despesa real resolvida pela provisão;
// sem provisão nem rateio = "Despesa não classificada (2.1.1)". Contraparte que é
// caixa/banco (direta ou resolvida) = transferência entre contas próprias.
// → { movimentos, naoClassificadas211 }
export function lancamentosAutosystemParaMovimentos(lancs = [], rateio = []) {
  // Rateio de baixa em lote por lançamento (chave = lancamento_id/grid da baixa):
  // cada entrada é uma despesa real (conta debitada da provisão ligada via
  // movto.child/parent) com seu valor — resolve "N títulos num pagamento só".
  const rateioPorLanc = new Map();
  (rateio || []).forEach(x => {
    const id = x?.lancamento_id;
    if (id == null) return;
    const cod = String(x.codigo ?? '').trim();
    if (!cod) return;
    const key = String(id);
    if (!rateioPorLanc.has(key)) rateioPorLanc.set(key, []);
    rateioPorLanc.get(key).push({ codigo: cod, nome: x.nome || '', valor: Math.abs(Number(x.valor || 0)) });
  });
  let naoClassificadas211 = 0;
  const movimentos = (lancs || []).map(l => {
    const sinal = Number(l.sinal) || 0;
    const tipo = sinal > 0 ? 'Crédito' : 'Débito';
    // Códigos vêm da movto (colunas char podem ter espaços) → trim pra casar com o
    // mapeamento/contas caixa (salvos sem espaço).
    const cpBruto = String(l.contraparte_codigo ?? '').trim();
    const cpResolv = l.contraparte_resolvida_codigo != null ? String(l.contraparte_resolvida_codigo).trim() : null;
    const isPonte211 = /^2\.1\.1/.test(cpBruto);
    const rateioLanc = l.lancamento_id != null ? rateioPorLanc.get(String(l.lancamento_id)) : null;
    const temRateio = Array.isArray(rateioLanc) && rateioLanc.length > 0;
    // "Não classificada" só quando é ponte 2.1.1 SEM resolução alguma.
    const naoClassificada = isPonte211 && !cpResolv && !temRateio;
    if (naoClassificada) naoClassificadas211++;
    const ehTransferencia = !!l.contraparte_eh_caixa || !!l.contraparte_resolvida_eh_caixa;
    const planoEfetivo = ehTransferencia ? null : (cpResolv || cpBruto);
    return {
      codigo: l.lancamento_id != null ? `as-${l.lancamento_id}` : undefined,
      movimentoContaCodigo: l.lancamento_id ?? null,
      contaCodigo: (l.lado_caixa === 'debito' ? String(l.debito_codigo ?? '') : String(l.credito_codigo ?? '')).trim(),
      planoContaGerencialCodigo: planoEfetivo,
      planoContaGerencialDescricao: l.contraparte_resolvida_nome || l.contraparte_nome || null,
      _viaProvisao: !!l.via_provisao || temRateio,
      _naoClassificada211: naoClassificada,
      _contraparteBruta: cpBruto,
      // Baixa em lote: não aplica a transferências (vão pro grupo de transferências).
      _rateioProvisao: ehTransferencia ? null : (temRateio ? rateioLanc : null),
      tipo,
      valor: Math.abs(Number(l.valor || 0)),
      dataMovimento: String(l.data ?? '').slice(0, 10),
      descricao: [
        ehTransferencia ? `↔ ${l.contraparte_nome || ('conta ' + cpBruto)}` : '',
        naoClassificada ? '[2.1.1 sem provisão]' : '',
        l.documento ? `Nº ${l.documento}` : '',
        l.pessoa_nome || '',
        l.obs || '',
      ].filter(Boolean).join(' · '),
      tipoDocumentoOrigem: ehTransferencia ? TRANSFER_TIPO_DOC : 'AUTOSYSTEM',
      empresaCodigo: l.empresa,
      // Para a análise (contrapartida/pessoa); não muda o cálculo
      pessoaCodigo: l.pessoa_codigo ?? null,
      pessoaNome: l.pessoa_nome || null,
    };
  });
  return { movimentos, naoClassificadas211 };
}

// ─── 2. Índice por plano/contrapartida e mês ─────────────────────
// dadosPorMes: { [mesKey]: { movimentos } }. Filtros: só contas bancária/caixa
// (tipoPorConta), tipos ativos, contas escolhidas (vazio = todas), empresas
// (null = todas). mapCodesSet: códigos mapeados direto na máscara (vencem a
// resolução por provisão).
// → { totaisPorConta, totaisPorContaLado, lancamentosPorConta, nomesPorPlano }
export function indexarMovimentos({
  dadosPorMes = {}, tipoPorConta = new Map(), tiposContaAtivos = new Set(['bancaria', 'caixa']),
  filtroContas = new Set(), titulosPorPagamento = null, mapCodesSet = new Set(), empresaFiltroSet = null,
}) {
  const totais = {};
  // Totais SEPARADOS por direção ('C' entradas > 0, 'D' saídas < 0) por conta+mês —
  // mapeamento por direção do Autosystem (mesma conta em grupos diferentes).
  const totaisLado = {};
  const addLado = (codigo, mesKey, valorSignado, sinal) => {
    const dir = sinal > 0 ? 'C' : 'D';
    if (!totaisLado[codigo]) totaisLado[codigo] = { C: {}, D: {} };
    totaisLado[codigo][dir][mesKey] = (totaisLado[codigo][dir][mesKey] || 0) + valorSignado;
  };
  const lancs = {};
  const nomes = {}; // código do plano → nome da conta gerencial (p/ diagnóstico)
  Object.entries(dadosPorMes).forEach(([mesKey, dados]) => {
    (dados.movimentos || []).forEach(m => {
      if (m.contaCodigo == null) return;
      if (empresaFiltroSet && !empresaFiltroSet.has(String(m.empresaCodigo ?? ''))) return;
      const cod = String(m.contaCodigo);
      // Só conta classificada como bancária/caixa entra no fluxo
      const tipoConta = tipoPorConta.get(cod);
      if (tipoConta !== 'bancaria' && tipoConta !== 'caixa') return;
      if (!tiposContaAtivos.has(tipoConta)) return;
      if (filtroContas.size > 0 && !filtroContas.has(cod)) return;

      // Sem plano (transferências internas, suprimento…) → bucket por tipo de documento
      let planoBruto = m.planoContaGerencialCodigo;
      // Mapeamento DIRETO da contrapartida crua vence a resolução por provisão
      const cpBruta = m._contraparteBruta != null ? String(m._contraparteBruta).trim() : null;
      if (cpBruta && cpBruta !== String(planoBruto ?? '').trim() && mapCodesSet.has(cpBruta)) {
        planoBruto = cpBruta;
      }
      const temPlano = planoBruto != null && planoBruto !== 0 && planoBruto !== '';

      const sinal = m.tipo === 'Crédito' ? 1 : -1;
      const valorAbs = Math.abs(Number(m.valor || 0));
      const valor = valorAbs * sinal;
      const idBase = m.codigo || `${m.movimentoContaCodigo}`;
      const extra = { empresaCodigo: m.empresaCodigo ?? null, contaCodigo: cod, pessoaNome: m.pessoaNome || null };

      // ─ Baixa em lote (Autosystem): 1 pagamento contra 2.1.1 baixou N provisões ─
      // Reparte pelo valor de cada provisão (resíduo na última parte). Se a própria
      // conta-ponte foi mapeada na máscara, ela vence e não rateia.
      const pontePropriaMapeada = !!(cpBruta && mapCodesSet.has(cpBruta));
      const rateio = m._rateioProvisao;
      if (!pontePropriaMapeada && Array.isArray(rateio) && rateio.length > 0) {
        const somaR = rateio.reduce((s, x) => s + Math.abs(Number(x.valor || 0)), 0);
        if (somaR > 0) {
          let acumuladoAbs = 0;
          rateio.forEach((x, idx) => {
            const planoKey = String(x.codigo);
            const parcelaAbs = idx === rateio.length - 1
              ? valorAbs - acumuladoAbs
              : Math.round(valorAbs * (Math.abs(Number(x.valor || 0)) / somaR) * 100) / 100;
            acumuladoAbs += parcelaAbs;
            const parcela = parcelaAbs * sinal;
            if (x.nome && !nomes[planoKey]) nomes[planoKey] = x.nome;
            if (!totais[planoKey]) totais[planoKey] = {};
            totais[planoKey][mesKey] = (totais[planoKey][mesKey] || 0) + parcela;
            addLado(planoKey, mesKey, parcela, sinal);
            if (!lancs[planoKey]) lancs[planoKey] = [];
            const parte = rateio.length > 1 ? ` · parte da baixa em lote (${idx + 1}/${rateio.length})` : '';
            lancs[planoKey].push({
              id: rateio.length > 1 ? `${idBase}-r${idx}` : idBase,
              mesKey,
              data: m.dataMovimento,
              descricao: `${(m.descricao || '').trim() || '—'}${parte}`,
              tipoDoc: m.tipoDocumentoOrigem,
              movimentoContaCodigo: m.movimentoContaCodigo ?? null,
              valor: parcelaAbs,
              sinal,
              ...extra,
            });
          });
          return;
        }
      }

      // ─ TITULO_PAGAR_PAGAMENTO: valor de cada título no plano dele ─
      const entradasComPlano = distribuirPagamentoTitulos(m, titulosPorPagamento);
      if (entradasComPlano) {
        entradasComPlano.forEach((x, idx) => {
          const parcela = x.valorTitulo * sinal;
          const planoKey = String(x.planoCod);
          if (x.titulo.planoContaGerencialDescricao && !nomes[planoKey]) {
            nomes[planoKey] = x.titulo.planoContaGerencialDescricao;
          }
          if (!totais[planoKey]) totais[planoKey] = {};
          totais[planoKey][mesKey] = (totais[planoKey][mesKey] || 0) + parcela;
          addLado(planoKey, mesKey, parcela, sinal);
          if (!lancs[planoKey]) lancs[planoKey] = [];
          const tituloCod = x.titulo.tituloPagarCodigo ?? x.titulo.codigo ?? null;
          const partLabel = entradasComPlano.length > 1
            ? ` · parte do lote (${idx + 1}/${entradasComPlano.length}) · título #${tituloCod ?? '—'}`
            : ` · título #${tituloCod ?? '—'}`;
          lancs[planoKey].push({
            id: entradasComPlano.length > 1 ? `${idBase}-p${idx}` : idBase,
            mesKey,
            data: m.dataMovimento,
            descricao: `${(m.descricao || '').trim() || '—'}${partLabel}`,
            tipoDoc: m.tipoDocumentoOrigem,
            movimentoContaCodigo: m.movimentoContaCodigo ?? null,
            tituloPagarCodigo: tituloCod,
            valor: x.valorTitulo,
            sinal,
            ...extra,
          });
        });
        return;
      }

      const codigo = temPlano ? String(planoBruto) : `${SEM_PLANO_PREFIX}${m.tipoDocumentoOrigem || 'OUTROS'}`;
      if (temPlano && m.planoContaGerencialDescricao && !nomes[codigo]) {
        nomes[codigo] = m.planoContaGerencialDescricao;
      }
      if (!totais[codigo]) totais[codigo] = {};
      totais[codigo][mesKey] = (totais[codigo][mesKey] || 0) + valor;
      addLado(codigo, mesKey, valor, sinal);
      if (!lancs[codigo]) lancs[codigo] = [];
      lancs[codigo].push({
        id: idBase,
        mesKey,
        data: m.dataMovimento,
        descricao: (m.descricao || '').trim() || '—',
        tipoDoc: m.tipoDocumentoOrigem,
        movimentoContaCodigo: m.movimentoContaCodigo ?? null,
        valor: valorAbs,
        sinal,
        ...extra,
      });
    });
  });
  return { totaisPorConta: totais, totaisPorContaLado: totaisLado, lancamentosPorConta: lancs, nomesPorPlano: nomes };
}

// Códigos mapeados direto na máscara (para indexarMovimentos.mapCodesSet)
export const codigosMapeados = (mapeamentos = []) => new Set(mapeamentos.map(m => String(m.plano_conta_codigo || '').trim()));

// ─── 3. Árvore da máscara ────────────────────────────────────────
// grupos: grupos_fluxo_caixa (parent_id, ordem, tipo…); mapeamentos: conta → grupo
// (lado 'C' = só entradas, 'D' = só saídas, null = líquido); meses: [{ key }].
export function montarArvoreFluxo({ grupos = [], mapeamentos = [], indice, meses = [] }) {
  if (!grupos.length) return [];
  const { totaisPorConta = {}, totaisPorContaLado = {}, lancamentosPorConta = {} } = indice || {};

  function buildNode(grupo) {
    const contas = mapeamentos.filter(m => m.grupo_fluxo_id === grupo.id).map(m => {
      const codKey = String(m.plano_conta_codigo);
      const fonte = m.lado === 'C' ? (totaisPorContaLado[codKey]?.C)
        : m.lado === 'D' ? (totaisPorContaLado[codKey]?.D)
          : totaisPorConta[codKey];
      const valoresPorMes = {};
      let totalPeriodo = 0;
      meses.forEach(mes => {
        const v = fonte?.[mes.key] || 0;
        valoresPorMes[mes.key] = v;
        totalPeriodo += v;
      });
      let lancs = lancamentosPorConta[codKey] || [];
      if (m.lado === 'C') lancs = lancs.filter(l => l.sinal > 0);
      else if (m.lado === 'D') lancs = lancs.filter(l => l.sinal < 0);
      lancs = lancs.slice().sort(ordenarPorData);
      return {
        id: m.id,
        codigo: m.plano_conta_codigo,
        descricao: m.plano_conta_descricao,
        lado: m.lado,
        isManual: m.isManual,
        valoresPorMes,
        totalPeriodo,
        lancamentos: lancs,
      };
    });

    const children = grupos
      .filter(g => g.parent_id === grupo.id)
      .sort((a, b) => a.ordem - b.ordem)
      .map(buildNode);

    const valoresPorMes = {};
    let totalPeriodo = 0;
    meses.forEach(mes => {
      const fromContas = contas.reduce((s, c) => s + (c.valoresPorMes[mes.key] || 0), 0);
      const fromChildren = children.reduce((s, c) => s + (c.valoresPorMes[mes.key] || 0), 0);
      valoresPorMes[mes.key] = fromContas + fromChildren;
      totalPeriodo += valoresPorMes[mes.key];
    });
    return { ...grupo, contas, children, valoresPorMes, totalPeriodo };
  }

  return grupos.filter(g => !g.parent_id).sort((a, b) => a.ordem - b.ordem).map(buildNode);
}

// ─── 4. "Sem classificação" ──────────────────────────────────────
// O que não caiu em nenhum grupo (sem plano, plano sem vínculo, direção não
// mapeada). Fica FORA da Variação de Caixa — é informativo, com o motivo.
// nomePlanoGerencial: Map(código → nome) do catálogo; contasClassificadas: contas
// caixa/banco da rede (para o motivo "deveria ser transferência").
export function montarSemClassificacao({ indice, mapeamentos = [], meses = [], contasClassificadas = [], nomePlanoGerencial = new Map() }) {
  const { totaisPorConta = {}, totaisPorContaLado = {}, lancamentosPorConta = {}, nomesPorPlano = {} } = indice || {};
  const mapNull = new Set(mapeamentos.filter(m => !m.lado).map(m => String(m.plano_conta_codigo)));
  const mapC = new Set(mapeamentos.filter(m => m.lado === 'C').map(m => String(m.plano_conta_codigo)));
  const mapD = new Set(mapeamentos.filter(m => m.lado === 'D').map(m => String(m.plano_conta_codigo)));
  const caixaSet = new Set(contasClassificadas.filter(c => c.ativo !== false).map(c => String(c.conta_codigo)));
  const contas = [];
  Object.entries(totaisPorConta).forEach(([codigo, valoresPorMesAll]) => {
    if (codigo === TRANSFER_CODE) return; // vai pro grupo "Transferências"
    if (mapNull.has(codigo)) return; // vínculo "ambos" cobre a conta inteira
    const dirsNaoMapeadas = [];
    if (!mapC.has(codigo)) dirsNaoMapeadas.push('C');
    if (!mapD.has(codigo)) dirsNaoMapeadas.push('D');
    if (dirsNaoMapeadas.length === 0) return;
    const soUmaDirecao = dirsNaoMapeadas.length === 1;

    const semPlano = codigo.startsWith(SEM_PLANO_PREFIX);
    const tipoDoc = semPlano ? codigo.substring(SEM_PLANO_PREFIX.length) : null;
    const nomeConta = semPlano ? null : ((nomesPorPlano && nomesPorPlano[codigo]) || nomePlanoGerencial.get(String(codigo)) || null);
    const descricao = semPlano ? (tipoDoc || 'OUTROS').replace(/_/g, ' ') : (nomeConta || `Plano #${codigo} (sem mapeamento)`);

    const valoresPorMes = {};
    let totalPeriodo = 0;
    meses.forEach(mes => {
      const v = soUmaDirecao
        ? (totaisPorContaLado[codigo]?.[dirsNaoMapeadas[0]]?.[mes.key] || 0)
        : (valoresPorMesAll[mes.key] || 0);
      valoresPorMes[mes.key] = v;
      totalPeriodo += v;
    });

    let lancs = lancamentosPorConta[codigo] || [];
    if (soUmaDirecao) {
      const d = dirsNaoMapeadas[0];
      lancs = lancs.filter(l => (l.sinal > 0 ? 'C' : 'D') === d);
    }
    lancs = lancs.slice().sort(ordenarPorData);
    const tiposDoc = semPlano ? [(tipoDoc || 'OUTROS').replace(/_/g, ' ')] : [...new Set(lancs.map(l => l.tipoDoc).filter(Boolean))];
    const motivo = caixaSet.has(codigo)
      ? 'É conta caixa/banco — deveria ser transferência (código não bate com a lista de caixa)'
      : (mapC.has(codigo) || mapD.has(codigo))
        ? `Mapeada só no lado ${mapC.has(codigo) ? 'crédito' : 'débito'} — o outro lado fica sem classificação`
        : 'Sem vínculo nesta máscara (código não encontrado no mapeamento)';
    contas.push({ id: `sc-${codigo}`, codigo, semPlano, nomeConta, tiposDoc, descricao, motivo, valoresPorMes, totalPeriodo, lancamentos: lancs });
  });

  if (contas.length === 0) return null;
  contas.sort((a, b) => Math.abs(b.totalPeriodo) - Math.abs(a.totalPeriodo));
  const valoresPorMes = {};
  let totalPeriodo = 0;
  meses.forEach(mes => {
    valoresPorMes[mes.key] = contas.reduce((s, c) => s + (c.valoresPorMes[mes.key] || 0), 0);
    totalPeriodo += valoresPorMes[mes.key];
  });
  return { id: '__sem_classificacao__', nome: 'Sem classificação', tipo: 'grupo', contas, children: [], valoresPorMes, totalPeriodo, isSemClassificacao: true };
}

// ─── 5. Grupo sintético "Transferências entre contas" (entra na variação) ──
export function montarTransferencias({ indice, meses = [] }) {
  const { totaisPorConta = {}, lancamentosPorConta = {} } = indice || {};
  const valoresPorMesAll = totaisPorConta[TRANSFER_CODE];
  if (!valoresPorMesAll) return null;
  const valoresPorMes = {};
  let totalPeriodo = 0;
  meses.forEach(mes => { const v = valoresPorMesAll[mes.key] || 0; valoresPorMes[mes.key] = v; totalPeriodo += v; });
  const temValor = Math.abs(totalPeriodo) > 0.005 || meses.some(m => Math.abs(valoresPorMes[m.key]) > 0.005);
  if (!temValor) return null;
  const lancs = (lancamentosPorConta[TRANSFER_CODE] || []).slice().sort(ordenarPorData);
  return {
    id: '__transferencias__',
    nome: TRANSFER_TIPO_DOC,
    tipo: 'grupo',
    contas: [{ id: 'tr-contas', codigo: TRANSFER_CODE, descricao: 'Entre contas próprias', valoresPorMes, totalPeriodo, lancamentos: lancs }],
    children: [],
    valoresPorMes,
    totalPeriodo,
    isTransferencias: true,
  };
}

// ─── 6. Subtotais e Variação de Caixa ────────────────────────────
// Transferências entram logo ANTES da linha de resultado. Subtotal = acumulado dos
// grupos raiz até ele; resultado = total de TODOS os grupos (independe da posição).
export function aplicarCalculosFluxo({ arvore = [], transferencias = null, meses = [] }) {
  const acumPorMes = {};
  let acumTotal = 0;
  meses.forEach(m => { acumPorMes[m.key] = 0; });
  let nodes = arvore;
  if (transferencias) {
    nodes = [...arvore];
    let idx = -1;
    for (let i = nodes.length - 1; i >= 0; i--) { if (nodes[i].tipo === 'resultado') { idx = i; break; } }
    if (idx === -1) nodes.push(transferencias);
    else nodes.splice(idx, 0, transferencias);
  }
  const ehCalc = (n) => n.tipo === 'subtotal' || n.tipo === 'resultado';
  const grandTotal = nodes.reduce((s, n) => s + (ehCalc(n) ? 0 : n.totalPeriodo), 0);
  const grandPorMes = {};
  meses.forEach(m => { grandPorMes[m.key] = nodes.reduce((s, n) => s + (ehCalc(n) ? 0 : (n.valoresPorMes[m.key] || 0)), 0); });
  return nodes.map(node => {
    if (node.tipo === 'resultado') return { ...node, isCalc: true, valoresPorMes: { ...grandPorMes }, totalPeriodo: grandTotal };
    if (node.tipo === 'subtotal') {
      meses.forEach(m => { acumPorMes[m.key] += (node.valoresPorMes[m.key] || 0); });
      acumTotal += node.totalPeriodo;
      return { ...node, isCalc: true, valoresPorMes: { ...acumPorMes }, totalPeriodo: acumTotal };
    }
    meses.forEach(m => { acumPorMes[m.key] += (node.valoresPorMes[m.key] || 0); });
    acumTotal += node.totalPeriodo;
    return node;
  });
}

export function totalGeralFluxo({ comCalculos = [], arvore = [], transferencias = null }) {
  return comCalculos.find(n => n.tipo === 'resultado')?.totalPeriodo
    ?? (arvore.reduce((s, n) => s + ((n.tipo === 'subtotal' || n.tipo === 'resultado') ? 0 : n.totalPeriodo), 0) + (transferencias?.totalPeriodo || 0));
}

// Tudo de uma vez (para a IA e para os testes)
export function montarFluxo({ dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas, titulosPorPagamento, empresaFiltroSet,
  grupos = [], mapeamentos = [], meses = [], contasClassificadas = [], nomePlanoGerencial = new Map() }) {
  const indice = indexarMovimentos({ dadosPorMes, tipoPorConta, tiposContaAtivos, filtroContas, titulosPorPagamento,
    mapCodesSet: codigosMapeados(mapeamentos), empresaFiltroSet });
  const arvore = montarArvoreFluxo({ grupos, mapeamentos, indice, meses });
  const semClassificacao = montarSemClassificacao({ indice, mapeamentos, meses, contasClassificadas, nomePlanoGerencial });
  const transferencias = montarTransferencias({ indice, meses });
  const comCalculos = aplicarCalculosFluxo({ arvore, transferencias, meses });
  const totalGeral = totalGeralFluxo({ comCalculos, arvore, transferencias });
  return { indice, arvore, semClassificacao, transferencias, comCalculos, totalGeral };
}

// ─── 7. Conciliação: o fluxo bate com a variação dos saldos? ─────
// composicao: [{ saldoInicial, saldoAtual, entradas, saidas }] (Composição do saldo).
// A diferença esperada vem do que ficou fora da Variação de Caixa ("Sem
// classificação"). Sobra além disso = conferir (saldo de abertura, lançamento fora
// do período, conta mal classificada…).
export function conciliarFluxoComSaldos({ composicao = [], totalGeral = 0, semClassificacaoTotal = 0, tolerancia = 0.05 }) {
  if (!composicao.length) return null;
  const r2 = (v) => Math.round(v * 100) / 100;
  const variacaoSaldos = composicao.reduce((s, c) => s + (Number(c.saldoAtual) - Number(c.saldoInicial)), 0);
  const movimentoSaldos = composicao.reduce((s, c) => s + Number(c.entradas || 0) - Number(c.saidas || 0), 0);
  const diferenca = variacaoSaldos - totalGeral;
  const explicada = semClassificacaoTotal;
  const naoExplicada = diferenca - explicada;
  return {
    variacaoSaldos: r2(variacaoSaldos),
    movimentoSaldos: r2(movimentoSaldos),
    totalFluxo: r2(totalGeral),
    diferenca: r2(diferenca),
    explicadaPorSemClassificacao: r2(explicada),
    naoExplicada: r2(naoExplicada),
    // saldo inicial + entradas − saídas = saldo final, conta a conta
    saldosFecham: composicao.every(c => Math.abs(Number(c.saldoInicial) + Number(c.entradas || 0) - Number(c.saidas || 0) - Number(c.saldoAtual)) <= tolerancia),
    bate: Math.abs(naoExplicada) <= tolerancia,
  };
}
