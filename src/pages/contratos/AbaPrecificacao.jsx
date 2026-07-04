// Aba "Precificação" da página Contratos.
// Calculadora de precificação de serviços de BPO para postos de
// combustíveis. Cobrança por esforço: soma linhas por serviço e compara com
// o custo interno atual pra mostrar a economia.

import { useState, useEffect, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calculator, Wallet, Building2, Network, Download,
  MessageCircle, RotateCcw, Search, Loader2, Sparkles, AlertCircle, ChevronRight,
  FileText, Info, Printer, X,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import * as clientesService from '../../services/clientesService';
import * as precificacaoService from '../../services/precificacaoService';
import * as servicosService from '../../services/servicosOferecidosService';
import * as autosystemService from '../../services/autosystemService';
import * as propostasService from '../../services/propostasService';

// ═══════════════════════════════════════════════════════════
// PREÇOS PADRÃO (fallback) — usados quando o item NÃO está
// vinculado a um serviço do catálogo. Vinculando no painel
// "Vincular preços", o valor passa a vir do serviço.
// ═══════════════════════════════════════════════════════════
const PRECOS_PADRAO = {
  taxa_base:    450,      // taxa base de gestão (fixa por mês)
  nota_entrada: 1.20,     // lançamento de nota fiscal de entrada (por nota)
  lmc_litro:    0.00035,  // estoque/LMC — parcela por litro vendido
  lmc_bico:     18,       // estoque/LMC — parcela por bico/bomba
  caixa:        12,       // conciliação de caixas (por caixa/turno)
  conta:        90,       // conciliação bancária (por conta)
  cartao:       0.45,     // cartões frota (por transação)
};

// Itens da composição que podem ser vinculados a um serviço do catálogo.
// `tipo` casa com tipo_valor do serviço; `driver` é o input que multiplica.
const ITENS_PRECO = [
  { key: 'taxa_base',    label: 'Taxa base de gestão',                 tipo: 'fixo' },
  { key: 'nota_entrada', label: 'Lançamento de nota fiscal de entrada', tipo: 'unitario', unidade: 'nota',      driver: 'notas' },
  { key: 'lmc_litro',    label: 'Estoque / LMC · por litro',            tipo: 'unitario', unidade: 'litro',     driver: 'litros' },
  { key: 'lmc_bico',     label: 'Estoque / LMC · por bico',             tipo: 'unitario', unidade: 'bico',      driver: 'bicos', vinculavel: false },
  { key: 'caixa',        label: 'Conciliação de caixas',               tipo: 'unitario', unidade: 'caixa',     driver: 'caixas' },
  { key: 'conta',        label: 'Conciliação bancária',                tipo: 'unitario', unidade: 'conta',     driver: 'contas' },
  { key: 'cartao',       label: 'Cartões frota',                       tipo: 'unitario', unidade: 'transação', driver: 'cartoes' },
];

// Número do WhatsApp pra captura de lead — PREENCHER com o número real.
// Formato: código do país + DDD + número, só dígitos. Ex.: 5527999998888
const WHATSAPP_NUMERO = '55XXXXXXXXXXX';

// Papel timbrado usado como fundo do relatório A4 da proposta.
// Coloque a imagem em `public/papel-timbrado.png` (ou troque o caminho).
// Se o arquivo não existir, o relatório sai sem fundo (não quebra).
const PAPEL_TIMBRADO_URL = '/papel-timbrado.png';

// Margens internas da folha A4 (mm) — AJUSTE ao seu papel timbrado para o
// conteúdo não invadir o cabeçalho/rodapé da imagem.
//   topo  → espaço reservado ao cabeçalho do timbrado
//   base  → espaço reservado ao rodapé do timbrado
const MARGENS_A4 = { topo: 40, laterais: 20, base: 45 };

// Quantas empresas cabem por folha A4 no relatório da rede. A 1ª folha tem
// menos (por causa do cabeçalho + esclarecimento). Reduza se o conteúdo
// encostar no rodapé do seu timbrado.
const EMPRESAS_POR_FOLHA_1 = 2;
const EMPRESAS_POR_FOLHA   = 3;

// Custo mensal real de um colaborador para a seção "Por que terceirizar".
// Baseado em planilha real (posto, salário-base R$ 1.621 + adicionais).
// AJUSTE aos seus números. `soLucroReal: true` marca os encargos patronais
// que NÃO incidem no Simples Nacional (já estão no DAS, não recolhidos à parte).
const CUSTO_PESSOAL = {
  descricaoExemplo: 'colaborador de posto (salário-base R$ 1.621 + adicionais de periculosidade e assiduidade)',
  itens: [
    { nome: 'Remuneração (salário + adicionais, líq. do VT descontado)', valor: 2172.14 },
    { nome: 'FGTS (8%)',                                    valor: 181.55 },
    { nome: 'INSS patronal (20%)',                          valor: 453.88, soLucroReal: true },
    { nome: 'RAT — Risco Ambiental do Trabalho',            valor: 48.63,  soLucroReal: true },
    { nome: 'Contribuição a Terceiros (Sistema S)',         valor: 94.02,  soLucroReal: true },
    { nome: 'Vale-transporte',                              valor: 234.00 },
    { nome: 'Ticket-alimentação',                           valor: 373.41 },
    { nome: 'Provisão de 13º salário',                      valor: 189.12 },
    { nome: 'Provisão de férias',                           valor: 189.12 },
    { nome: 'Provisão de 1/3 de férias',                    valor: 63.04 },
    { nome: 'Provisão de FGTS sobre 13º e férias',          valor: 35.30 },
    { nome: 'Provisão de INSS sobre 13º e férias',          valor: 88.25,  soLucroReal: true },
    { nome: 'Provisão de RAT sobre 13º e férias',           valor: 13.24,  soLucroReal: true },
    { nome: 'Provisão de Terceiros sobre 13º e férias',     valor: 25.59,  soLucroReal: true },
  ],
};

// Esclarecimento fixo que vai no topo da proposta (transparência).
const esclarecimento = (periodoLabel) =>
  `Os valores desta proposta foram calculados com base no último mês de operação` +
  (periodoLabel ? ` (${periodoLabel})` : '') +
  ` de cada empresa. A cobrança é feita por esforço: cada serviço é cobrado conforme o volume ` +
  `real de trabalho do período, e todas as empresas seguem exatamente a mesma tabela de preços — ` +
  `garantindo isonomia e transparência.`;

// Explicação de cada serviço para a proposta (transparência: o que é e por
// que é cobrado assim). Ajuste os textos à vontade.
const EXPLICACOES = {
  taxa_base:    'Gestão da conta: atendimento, organização mensal e responsabilidade técnica. Valor fixo, independente do volume — cobre a estrutura para atender o posto.',
  nota_entrada: 'Lançamento e escrituração das notas fiscais de entrada (compras). Cobrado por nota porque o esforço de conferência e lançamento cresce com o volume de documentos.',
  lmc_litro:    'Escrituração do estoque de combustível / LMC — parcela proporcional aos litros vendidos, que refletem o movimento a controlar.',
  lmc_bico:     'Escrituração do estoque de combustível / LMC — parcela por bico/bomba, que reflete a estrutura de abastecimento a conferir.',
  caixa:        'Conciliação de caixas / turnos de PDV. Cobrado por caixa porque cada fechamento exige conferência individual de valores.',
  conta:        'Conciliação bancária. Cobrado por conta porque cada conta é conciliada e revisada separadamente.',
  cartao:       'Conferência das transações de cartão frota. Cobrado por transação pelo volume de conciliações a realizar.',
};

const INTRO_PROPOSTA =
  'Trabalhamos com cobrança por esforço: você paga pelo volume real de trabalho do mês, com total transparência. ' +
  'Abaixo detalhamos cada serviço, como o valor é calculado e por quê. Os volumes foram apurados a partir dos seus dados do mês anterior.';

// ─── Helpers ───────────────────────────────────────────────
// Trata vazio / negativo / inválido como zero.
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Real com separador de milhar pt-BR e SEM casas decimais (arredondado).
const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
}).format(Math.round(v || 0));

// Formata uma taxa unitária preservando os centavos (só pro texto explicativo).
const fmtTaxa = (v) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
  minimumFractionDigits: 2, maximumFractionDigits: 4,
}).format(v);

// Inteiro pt-BR (milhar) — pros números da mensagem/detalhes.
const fmtInt = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(v || 0));

// Campos de entrada (a ordem aqui é a ordem na tela).
const CAMPOS = [
  { key: 'notas',       label: 'Notas fiscais de entrada lançadas/mês',     placeholder: 'ex: 800' },
  { key: 'litros',      label: 'Litros vendidos por mês',                   placeholder: 'ex: 300000' },
  { key: 'caixas',      label: 'Caixas / turnos de PDV p/ conciliar (mês)', placeholder: 'ex: 90' },
  { key: 'contas',      label: 'Contas bancárias conciliadas',              placeholder: 'ex: 4' },
  { key: 'cartoes',     label: 'Transações de cartão frota por mês',        placeholder: 'ex: 1200' },
  { key: 'bicos',       label: 'Número de bicos/bombas (LMC)',              placeholder: 'ex: 12' },
];

const VAZIO = Object.fromEntries(CAMPOS.map(c => [c.key, '']));

export default function AbaPrecificacao({ showToast }) {
  const [inputs, setInputs] = useState(VAZIO);
  const [resultado, setResultado] = useState(null);

  // Origem de cada campo ('portal' quando veio do cliente) — só pra badge.
  const [origem, setOrigem] = useState({});

  // Catálogo de serviços + vínculos (item_key → servico_id)
  const [servicos, setServicos] = useState([]);
  const [vinculos, setVinculos] = useState({});
  const [painelPrecos, setPainelPrecos] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [srv, vinc] = await Promise.all([
          servicosService.listarServicos({ apenasAtivos: true }),
          precificacaoService.listarVinculos().catch(() => ({})),
        ]);
        if (!cancelado) { setServicos(srv || []); setVinculos(vinc || {}); }
      } catch { /* usa preços padrão */ }
    })();
    return () => { cancelado = true; };
  }, []);

  // Mapa id → serviço, pra resolver o preço vinculado rapidamente.
  const servicoPorId = Object.fromEntries((servicos || []).map(s => [s.id, s]));

  // Preço efetivo de um item: do serviço vinculado (se houver valor), senão o padrão.
  const precoDe = (key) => {
    const sid = vinculos[key];
    if (sid && servicoPorId[sid]) {
      const v = Number(servicoPorId[sid].valor);
      if (Number.isFinite(v)) return v;
    }
    return PRECOS_PADRAO[key];
  };

  // Tipo de cobrança efetivo: do serviço vinculado, senão o padrão do item.
  // 'fixo' cobra o valor cheio; 'unitario' multiplica pela quantidade.
  const tipoDe = (key) => {
    const sid = vinculos[key];
    const t = sid && servicoPorId[sid]?.tipo_valor;
    if (t === 'fixo' || t === 'unitario') return t;
    return ITENS_PRECO.find(i => i.key === key)?.tipo || 'unitario';
  };

  // Vincula/desvincula um item e persiste.
  const vincular = async (itemKey, servicoId) => {
    const sid = servicoId || null;
    setVinculos(v => ({ ...v, [itemKey]: sid }));
    setResultado(null); // preço mudou → invalida resultado
    try {
      await precificacaoService.salvarVinculo(itemKey, sid);
    } catch (e) {
      showToast?.('error', 'Erro ao salvar vínculo: ' + e.message);
    }
  };

  // Seletor de cliente do portal
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState('');
  const [clienteSel, setClienteSel] = useState(null);
  const [buscandoDados, setBuscandoDados] = useState(false);
  const [infoBusca, setInfoBusca] = useState(null); // { fontes, avisos, label }

  // Carrega o catálogo de clientes 1x
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const data = await clientesService.listarClientes();
        if (!cancelado) setClientes((data || []).filter(c => c.status === 'ativo'));
      } catch { /* segue manual */ }
    })();
    return () => { cancelado = true; };
  }, []);

  const clientesFiltrados = (() => {
    const t = busca.trim().toLowerCase();
    if (!t) return clientes.slice(0, 20);
    return clientes.filter(c =>
      (c.nome || '').toLowerCase().includes(t)
      || (c.razao_social || '').toLowerCase().includes(t)
      || (c.cnpj || '').toLowerCase().includes(t),
    ).slice(0, 20);
  })();

  const setCampo = (key, value) => {
    setInputs(f => ({ ...f, [key]: value }));
    setOrigem(o => (o[key] ? { ...o, [key]: null } : o)); // edição manual tira o badge
    setResultado(null); // muda entrada → invalida o resultado anterior
  };

  // Seleciona um cliente e puxa os dados do mês anterior (best-effort).
  const selecionarCliente = async (c) => {
    setClienteSel(c);
    setBusca('');
    setBuscandoDados(true);
    setInfoBusca(null);
    setResultado(null);
    try {
      const dados = await precificacaoService.buscarDadosOperacionaisCliente(c);
      const { label } = precificacaoService.periodoMesAnterior();
      // Preenche só os campos que voltaram com valor.
      const preenchidos = {};
      const marca = {};
      const mapa = { litros: 'litros', notas: 'notas', bicos: 'bicos', contas: 'contas' };
      for (const [campoDado, campoInput] of Object.entries(mapa)) {
        if (dados[campoDado] != null) {
          preenchidos[campoInput] = String(dados[campoDado]);
          marca[campoInput] = 'portal';
        }
      }
      setInputs(f => ({ ...f, ...preenchidos }));
      setOrigem(marca);
      setInfoBusca({ fontes: dados.fontes, avisos: dados.avisos, label });
    } catch (e) {
      setInfoBusca({ fontes: {}, avisos: [e.message || 'Falha ao buscar dados do cliente.'], label: null });
    } finally {
      setBuscandoDados(false);
    }
  };

  const limparCliente = () => {
    setClienteSel(null);
    setBusca('');
    setInfoBusca(null);
    setOrigem({});
  };

  // Calcula a composição + total a partir de um objeto de volumes
  // { notas, litros, caixas, contas, cartoes, bicos }. Reaproveitado tanto
  // no cálculo por empresa quanto por empresa dentro de uma rede.
  const calcularValores = (vals) => {
    const n = (k) => num(vals[k]);

    // Cada item conforme o tipo efetivo: FIXO cobra o valor cheio;
    // UNITÁRIO multiplica pela quantidade do input (driver).
    const item = (key, driverKey, unidade) => {
      const preco = precoDe(key);
      if (tipoDe(key) === 'fixo' || !driverKey) {
        return { valor: preco, detalhe: 'Valor fixo mensal' };
      }
      const qtd = n(driverKey);
      return { valor: qtd * preco, detalhe: `${fmtInt(qtd)} ${unidade} × ${fmtTaxa(preco)}` };
    };

    const taxa   = item('taxa_base', null);
    const nota   = item('nota_entrada', 'notas', 'nota(s)');
    const litro  = item('lmc_litro', 'litros', 'L');
    const bico   = item('lmc_bico', 'bicos', 'bico(s)');
    const caixa  = item('caixa', 'caixas', 'caixa(s)');
    const conta  = item('conta', 'contas', 'conta(s)');
    const cartao = item('cartao', 'cartoes', 'transação(ões)');

    // Composição do valor mensal. LMC soma as duas parcelas numa linha só.
    const linhas = [
      { servico: 'Taxa base de gestão',                     detalhe: taxa.detalhe, valor: taxa.valor },
      { servico: 'Lançamento de notas fiscais de entrada',  detalhe: nota.detalhe, valor: nota.valor },
      { servico: 'Lançamento de estoque / LMC',             detalhe: `${litro.detalhe} + ${bico.detalhe}`, valor: litro.valor + bico.valor },
      { servico: 'Conciliação de caixas',                   detalhe: caixa.detalhe, valor: caixa.valor },
      { servico: 'Conciliação bancária',                    detalhe: conta.detalhe, valor: conta.valor },
      { servico: 'Cartões frota',                           detalhe: cartao.detalhe, valor: cartao.valor },
    ];

    const totalMensal = linhas.reduce((s, l) => s + l.valor, 0);
    return { linhas, totalMensal };
  };

  const calcular = () => setResultado(calcularValores(inputs));

  // ─── Modo por REDE ──────────────────────────────────────────
  const [modo, setModo] = useState('empresa'); // 'empresa' | 'rede'
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [redeSel, setRedeSel] = useState('');
  const [calculandoRede, setCalculandoRede] = useState(false);
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 });
  const [resultadoRede, setResultadoRede] = useState(null);
  const [expandida, setExpandida] = useState(null); // empresa_id com composição aberta

  useEffect(() => {
    autosystemService.listarRedes().then(setRedesAutosystem).catch(() => {});
  }, []);

  // Agrupa os clientes em redes (webposto por chave_api, autosystem por as_rede).
  const redes = useMemo(() => {
    const mapa = new Map();
    for (const c of clientes) {
      let chave = null, base = null;
      if (c.chave_api_id) {
        chave = `wp:${c.chave_api_id}`;
        base = { key: chave, tipo: 'webposto', id: c.chave_api_id, nome: c.chaves_api?.nome || 'Rede Webposto' };
      } else if (c.as_rede_id) {
        chave = `as:${c.as_rede_id}`;
        base = { key: chave, tipo: 'autosystem', id: c.as_rede_id, nome: null };
      } else continue;
      if (!mapa.has(chave)) mapa.set(chave, { ...base, empresas: [] });
      mapa.get(chave).empresas.push(c);
    }
    const asNome = new Map(redesAutosystem.map(r => [r.id, r.nome]));
    for (const r of mapa.values()) {
      if (r.tipo === 'autosystem') r.nome = asNome.get(r.id) || 'Rede Autosystem';
    }
    return [...mapa.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [clientes, redesAutosystem]);

  // Calcula o valor de cada empresa da rede (mês anterior), sequencial.
  const calcularRede = async () => {
    const rede = redes.find(r => r.key === redeSel);
    if (!rede) return;
    setCalculandoRede(true);
    setResultadoRede(null);
    setExpandida(null);
    setProgresso({ feito: 0, total: rede.empresas.length });
    const itens = [];
    for (const emp of rede.empresas) {
      let dados = { litros: null, notas: null, bicos: null, contas: null };
      try { dados = await precificacaoService.buscarDadosOperacionaisCliente(emp); } catch { /* zera */ }
      const valores = {
        notas: dados.notas || 0, litros: dados.litros || 0, bicos: dados.bicos || 0,
        contas: dados.contas || 0, caixas: 0, cartoes: 0,
      };
      const { linhas, totalMensal } = calcularValores(valores);
      itens.push({ empresa: emp, valores, linhas, totalMensal });
      setProgresso(p => ({ ...p, feito: p.feito + 1 }));
    }
    const totalRede = itens.reduce((s, l) => s + l.totalMensal, 0);
    setResultadoRede({ rede, itens, totalRede, label: precificacaoService.periodoMesAnterior().label });
    setCalculandoRede(false);
  };

  // Exporta o resultado da rede em CSV (por empresa).
  const exportarCsvRede = () => {
    if (!resultadoRede) return;
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cab = ['Empresa', 'CNPJ', 'Notas entrada', 'Litros', 'Bicos', 'Contas', 'Valor mensal'];
    const linhas = resultadoRede.itens.map(it => [
      it.empresa.razao_social || it.empresa.nome || '',
      it.empresa.cnpj || '',
      it.valores.notas, it.valores.litros, it.valores.bicos, it.valores.contas,
      Math.round(it.totalMensal).toString().replace('.', ','),
    ]);
    linhas.push(['TOTAL DA REDE', '', '', '', '', '', Math.round(resultadoRede.totalRede).toString().replace('.', ',')]);
    const csv = [cab, ...linhas].map(l => l.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `precificacao-rede-${(resultadoRede.rede.nome || 'rede').toLowerCase().replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const limpar = () => {
    setInputs(VAZIO); setResultado(null); setOrigem({});
    setClienteSel(null); setInfoBusca(null); setBusca('');
  };

  // Monta o link do WhatsApp com os dados digitados + resultado.
  const linkWhatsApp = () => {
    const n = (k) => num(inputs[k]);
    const linhasMsg = [
      'Olá! Fiz uma simulação na calculadora de BPO e gostaria de falar com um consultor.',
      ...(clienteSel ? ['', `*Cliente:* ${clienteSel.razao_social || clienteSel.nome}`] : []),
      '',
      '*Meus números:*',
      `• Notas fiscais de entrada/mês: ${fmtInt(n('notas'))}`,
      `• Litros/mês: ${fmtInt(n('litros'))}`,
      `• Caixas/turnos/mês: ${fmtInt(n('caixas'))}`,
      `• Contas bancárias: ${fmtInt(n('contas'))}`,
      `• Transações cartão frota/mês: ${fmtInt(n('cartoes'))}`,
      `• Bicos/bombas: ${fmtInt(n('bicos'))}`,
    ];
    if (resultado) {
      linhasMsg.push(
        '',
        `*Valor mensal estimado: ${fmtBRL(resultado.totalMensal)}*`,
      );
    }
    const texto = encodeURIComponent(linhasMsg.join('\n'));
    return `https://wa.me/${WHATSAPP_NUMERO}?text=${texto}`;
  };

  // ─── Montar / salvar proposta ───────────────────────────────
  const [modalProposta, setModalProposta] = useState(false);
  const [clienteProposta, setClienteProposta] = useState(null);
  const [tituloProposta, setTituloProposta] = useState('');
  const [obsProposta, setObsProposta] = useState('');
  const [itensProposta, setItensProposta] = useState([]);
  const [salvandoProposta, setSalvandoProposta] = useState(false);
  const [empresasProposta, setEmpresasProposta] = useState(null); // detalhe por empresa (rede) ou null
  const [periodoProposta, setPeriodoProposta] = useState('');
  const [relatorioAberto, setRelatorioAberto] = useState(false);

  // Constrói os itens da proposta a partir de um objeto de volumes.
  // numEmpresas > 1 (modo rede): itens fixos são cobrados por empresa
  // (quantidade = nº de empresas) e os unitários usam a soma dos volumes.
  const construirItens = (vals, numEmpresas = 1) => {
    const q = (k) => num(vals[k]);
    const itens = [];
    for (const it of ITENS_PRECO) {
      const preco = precoDe(it.key);
      const isFixo = tipoDe(it.key) === 'fixo' || !it.driver;
      const qtd = isFixo ? numEmpresas : q(it.driver);
      const valorTotal = qtd * preco;
      // Pula linhas zeradas (exceto a taxa base, que é sempre cobrada).
      if (valorTotal <= 0 && it.key !== 'taxa_base') continue;
      const srv = vinculos[it.key] ? servicoPorId[vinculos[it.key]] : null;
      const formula = isFixo
        ? (numEmpresas > 1 ? `${numEmpresas} empresa(s) × ${fmtTaxa(preco)}` : 'Valor fixo mensal')
        : `${fmtInt(qtd)} ${it.unidade}(s) × ${fmtTaxa(preco)}`;
      itens.push({
        servico_id:     vinculos[it.key] || null,
        nome:           srv?.nome || it.label,
        descricao:      srv?.descricao || EXPLICACOES[it.key],
        categoria:      srv?.categoria || 'bpo',
        periodicidade:  'mensal',
        tipo_valor:     isFixo ? 'fixo' : 'unitario',
        unidade:        it.unidade || null,
        quantidade:     qtd,
        valor_unitario: preco,
        valor_total:    valorTotal,
        formula,
        explicacao:     EXPLICACOES[it.key],
      });
    }
    return itens;
  };

  // Abre a proposta de UMA empresa (modo empresa).
  const abrirProposta = () => {
    if (!clienteSel) return;
    setClienteProposta(clienteSel);
    setItensProposta(construirItens(inputs, 1));
    setEmpresasProposta(null);
    setPeriodoProposta(precificacaoService.periodoMesAnterior().label);
    setTituloProposta(`Proposta de BPO — ${clienteSel.razao_social || clienteSel.nome}`);
    setObsProposta(INTRO_PROPOSTA);
    setModalProposta(true);
  };

  // Abre a proposta consolidada de uma REDE (soma os volumes das empresas).
  const abrirPropostaRede = () => {
    if (!resultadoRede) return;
    const emp = resultadoRede.itens;
    const soma = (k) => emp.reduce((s, it) => s + (Number(it.valores[k]) || 0), 0);
    const agregado = {
      notas: soma('notas'), litros: soma('litros'), bicos: soma('bicos'),
      contas: soma('contas'), caixas: 0, cartoes: 0,
    };
    setClienteProposta({ id: null, nome: resultadoRede.rede.nome, razao_social: resultadoRede.rede.nome, cnpj: null, contato_email: null });
    setItensProposta(construirItens(agregado, emp.length));
    setEmpresasProposta(emp);
    setPeriodoProposta(resultadoRede.label);
    setTituloProposta(`Proposta de BPO — Rede ${resultadoRede.rede.nome}`);
    setObsProposta(`${INTRO_PROPOSTA} Esta proposta cobre ${emp.length} empresa(s) da rede, com o detalhamento individual de cada uma.`);
    setModalProposta(true);
  };

  const totalProposta = itensProposta.reduce((s, i) => s + (i.valor_total || 0), 0);

  const salvarProposta = async () => {
    if (!clienteProposta || itensProposta.length === 0) return;
    setSalvandoProposta(true);
    try {
      // Proposta de rede: guarda o detalhamento por empresa (com os itens de
      // cada uma) pra permitir gerar um contrato separado por empresa.
      const empresas = empresasProposta
        ? empresasProposta.map(it => ({
            nome: it.empresa.razao_social || it.empresa.nome,
            cnpj: it.empresa.cnpj || null,
            cliente_id: it.empresa.id || null,
            total: it.totalMensal,
            itens: construirItens(it.valores, 1),
          }))
        : null;

      await propostasService.salvarProposta(
        {
          cliente_id:    clienteProposta.id || null,
          cliente_nome:  clienteProposta.razao_social || clienteProposta.nome,
          cliente_cnpj:  clienteProposta.cnpj || null,
          cliente_email: clienteProposta.contato_email || null,
          titulo:        tituloProposta.trim() || `Proposta — ${clienteProposta.nome}`,
          descricao:     'Proposta de serviços de BPO — cobrança por esforço.',
          observacoes:   obsProposta,
          empresas,
          status:        'rascunho',
        },
        itensProposta,
      );
      showToast?.('success', 'Proposta salva em Propostas (rascunho).');
      setModalProposta(false);
    } catch (e) {
      showToast?.('error', 'Erro ao salvar proposta: ' + e.message);
    } finally {
      setSalvandoProposta(false);
    }
  };

  return (
    <div>
      {/* Header da aba */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Calculadora de precificação</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Estime o valor mensal do BPO por esforço. Por empresa ou por rede inteira.
          </p>
        </div>
        {/* Toggle de modo */}
        <div className="inline-flex p-1 rounded-lg bg-gray-100">
          {[
            { key: 'empresa', label: 'Por empresa', icon: Building2 },
            { key: 'rede',    label: 'Por rede',    icon: Network },
          ].map(m => {
            const Icon = m.icon;
            const on = modo === m.key;
            return (
              <button key={m.key} onClick={() => setModo(m.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  on ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                }`}>
                <Icon className="h-3.5 w-3.5" /> {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {modo === 'rede' && (
        <RedeSection
          redes={redes} redeSel={redeSel} setRedeSel={setRedeSel}
          calcular={calcularRede} calculando={calculandoRede} progresso={progresso}
          resultado={resultadoRede} expandida={expandida} setExpandida={setExpandida}
          exportarCsv={exportarCsvRede} montarProposta={abrirPropostaRede}
          fmtBRL={fmtBRL} fmtInt={fmtInt}
        />
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-5 gap-4 ${modo === 'rede' ? 'hidden' : ''}`}>
        {/* ─── Entradas ─────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-white rounded-xl border border-gray-200/60 shadow-sm p-5">

          {/* Buscar dados de um cliente do portal (mês anterior) */}
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Preencher com dados do portal
              </p>
              {clienteSel && (
                <button onClick={limparCliente} className="text-[11px] text-rose-600 hover:text-rose-800 font-medium">
                  Limpar
                </button>
              )}
            </div>

            {clienteSel ? (
              <div className="bg-white rounded-lg border border-blue-200 px-3 py-2">
                <p className="text-[13px] font-semibold text-gray-900">{clienteSel.razao_social || clienteSel.nome}</p>
                <p className="text-[11px] text-gray-500">
                  {clienteSel.as_rede_id ? 'Autosystem' : clienteSel.chave_api_id ? 'Webposto' : 'Sem integração'}
                  {clienteSel.cnpj ? ` · ${clienteSel.cnpj}` : ''}
                </p>
                {buscandoDados && (
                  <p className="mt-1 text-[11px] text-blue-600 flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Buscando dados do mês anterior…
                  </p>
                )}
                {!buscandoDados && infoBusca && (
                  <div className="mt-1.5 space-y-0.5">
                    {infoBusca.label && (
                      <p className="text-[11px] text-emerald-700">
                        Dados de <span className="font-medium capitalize">{infoBusca.label}</span> aplicados aos campos.
                      </p>
                    )}
                    {(infoBusca.avisos || []).map((a, i) => (
                      <p key={i} className="text-[11px] text-amber-700 flex items-start gap-1">
                        <AlertCircle className="h-3 w-3 mt-px flex-shrink-0" /> {a}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar por nome, razão social ou CNPJ…"
                    className="w-full h-9 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
                {busca && clientesFiltrados.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {clientesFiltrados.map(c => (
                      <button key={c.id} type="button" onClick={() => selecionarCliente(c)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                        <p className="text-[13px] font-medium text-gray-800">{c.razao_social || c.nome}</p>
                        <div className="flex items-center gap-2 text-[10.5px] text-gray-500 mt-0.5">
                          {c.cnpj && <span className="font-mono">{c.cnpj}</span>}
                          <span className="text-gray-400">· {c.as_rede_id ? 'Autosystem' : c.chave_api_id ? 'Webposto' : 'Sem integração'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-[10.5px] text-gray-400">
                  Puxa litros, notas de entrada (compras), bicos e contas do mês anterior
                  (o que existir). Cartões seguem manuais.
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAMPOS.map(campo => (
              <div key={campo.key}>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
                  {campo.label}
                  {origem[campo.key] === 'portal' && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-px text-[9px] font-semibold text-emerald-700 uppercase tracking-wide">
                      <Sparkles className="h-2.5 w-2.5" /> portal
                    </span>
                  )}
                </label>
                <input
                  type="number" min="0" inputMode="decimal"
                  value={inputs[campo.key]}
                  onChange={e => setCampo(campo.key, e.target.value)}
                  placeholder={campo.placeholder}
                  className={`w-full h-10 rounded-lg border px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                    origem[campo.key] === 'portal'
                      ? 'border-emerald-300 bg-emerald-50/30 focus:border-emerald-400'
                      : 'border-gray-200 focus:border-blue-400'
                  }`}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-5">
            <button onClick={calcular}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
              <Calculator className="h-4 w-4" /> Calcular proposta
            </button>
            <button onClick={limpar} title="Limpar"
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </motion.div>

        {/* ─── Resultado ────────────────────────────────── */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {resultado ? (
              <motion.div key="resultado"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="space-y-4">

                {/* Valor mensal estimado — destaque único */}
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-9 w-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                      <Wallet className="h-4 w-4" />
                    </div>
                    <p className="text-[11px] font-medium text-blue-700 uppercase tracking-wide">Valor mensal estimado do serviço</p>
                  </div>
                  <p className="text-3xl font-bold text-blue-800 tabular-nums">{fmtBRL(resultado.totalMensal)}</p>
                </div>

                {/* Tabela de composição */}
                <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h4 className="text-sm font-semibold text-gray-900">Composição do valor mensal</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                          <th className="text-left px-5 py-2.5 font-medium">Serviço</th>
                          <th className="text-right px-5 py-2.5 font-medium">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {resultado.linhas.map((l, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-2.5">
                              <p className="text-sm font-medium text-gray-900">{l.servico}</p>
                              <p className="text-[11px] text-gray-400">{l.detalhe}</p>
                            </td>
                            <td className="px-5 py-2.5 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                              {fmtBRL(l.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-100 bg-gray-50/50">
                          <td className="px-5 py-3 text-sm font-semibold text-gray-900">Total mensal</td>
                          <td className="px-5 py-3 text-right text-base font-bold text-blue-700 tabular-nums whitespace-nowrap">
                            {fmtBRL(resultado.totalMensal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Ações */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {clienteSel && (
                    <button onClick={abrirProposta}
                      className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm">
                      <FileText className="h-4 w-4" /> Montar proposta
                    </button>
                  )}
                  <a href={linkWhatsApp()} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm ${clienteSel ? '' : 'sm:col-span-2'}`}>
                    <MessageCircle className="h-4 w-4" /> Falar com um consultor
                  </a>
                </div>
              </motion.div>
            ) : (
              <motion.div key="vazio"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="h-full min-h-[280px] flex flex-col items-center justify-center text-center bg-white rounded-xl border border-dashed border-gray-200 p-8">
                <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
                  <Calculator className="h-6 w-6 text-blue-500" />
                </div>
                <p className="text-sm font-medium text-gray-800 mb-1">Preencha os dados do posto</p>
                <p className="text-xs text-gray-500 max-w-xs">
                  Informe os volumes ao lado e clique em <span className="font-medium">Calcular proposta</span> pra ver o valor mensal estimado e a composição.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Vincular preços aos serviços oferecidos ───────── */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200/60 shadow-sm">
        <button onClick={() => setPainelPrecos(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left">
          <div>
            <p className="text-sm font-semibold text-gray-900">Vincular preços aos serviços oferecidos</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              O valor de cada item vem do serviço vinculado. Sem vínculo, usa o valor padrão.
            </p>
          </div>
          <span className={`text-gray-400 transition-transform ${painelPrecos ? 'rotate-180' : ''}`}>▾</span>
        </button>

        <AnimatePresence initial={false}>
          {painelPrecos && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="px-5 pb-5 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-100">
                {ITENS_PRECO.filter(item => item.vinculavel !== false).map(item => {
                  const sid = vinculos[item.key] || '';
                  const vinculado = !!(sid && servicoPorId[sid]);
                  // Tipo efetivo — itens sem driver (taxa base) são sempre fixos.
                  const tEff = item.driver ? tipoDe(item.key) : 'fixo';
                  return (
                    <div key={item.key} className="pt-3">
                      <label className="flex items-center justify-between text-xs font-medium text-gray-700 mb-1">
                        <span>{item.label}</span>
                        <span className="text-[10px] text-gray-400 normal-case">
                          {tEff === 'fixo' ? 'fixo' : `por ${item.unidade}`}
                        </span>
                      </label>
                      <select value={sid} onChange={e => vincular(item.key, e.target.value)}
                        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                        <option value="">Padrão ({fmtTaxa(PRECOS_PADRAO[item.key])})</option>
                        {servicos.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.nome} — {fmtTaxa(Number(s.valor) || 0)} ({s.tipo_valor === 'fixo' ? 'fixo' : 'por unid.'})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10.5px] text-gray-500">
                        Preço atual: <span className="font-semibold text-gray-700">{fmtTaxa(precoDe(item.key))}</span>
                        {' '}<span className="text-gray-400">({tEff === 'fixo' ? 'fixo' : `por ${item.unidade}`})</span>
                        {vinculado
                          ? <span className="text-emerald-600"> · do catálogo</span>
                          : <span className="text-gray-400"> · padrão</span>}
                      </p>
                    </div>
                  );
                })}
                {servicos.length === 0 && (
                  <p className="sm:col-span-2 pt-3 text-[11px] text-amber-700 flex items-start gap-1">
                    <AlertCircle className="h-3 w-3 mt-px flex-shrink-0" />
                    Nenhum serviço ativo no catálogo. Cadastre em "Serviços oferecidos" para vincular.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ModalProposta
        open={modalProposta} cliente={clienteProposta}
        titulo={tituloProposta} setTitulo={setTituloProposta}
        obs={obsProposta} setObs={setObsProposta}
        itens={itensProposta} total={totalProposta}
        salvando={salvandoProposta}
        onClose={() => setModalProposta(false)} onSalvar={salvarProposta}
        onImprimir={() => setRelatorioAberto(true)}
        fmtBRL={fmtBRL}
      />

      {relatorioAberto && (
        <RelatorioProposta
          cliente={clienteProposta} titulo={tituloProposta}
          itens={itensProposta} total={totalProposta} empresas={empresasProposta}
          periodo={periodoProposta} fmtBRL={fmtBRL}
          onFechar={() => setRelatorioAberto(false)}
        />
      )}
    </div>
  );
}

// ─── Modal: preview + salvar proposta ──────────────────────
function ModalProposta({ open, cliente, titulo, setTitulo, obs, setObs, itens, total, salvando, onClose, onSalvar, onImprimir, fmtBRL }) {
  return (
    <Modal open={open} onClose={onClose} title="Montar proposta" size="lg"
      footer={(
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={onImprimir} disabled={!itens.length}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
            <Printer className="h-4 w-4" /> Visualizar / Imprimir
          </button>
          <button onClick={onSalvar} disabled={salvando || !itens.length}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Salvar proposta
          </button>
        </div>
      )}>
      <div className="space-y-4">
        {/* Cliente + título */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Cliente</p>
          <p className="text-sm font-semibold text-gray-900">{cliente?.razao_social || cliente?.nome}</p>
          {cliente?.cnpj && <p className="text-[11px] text-gray-500 font-mono">{cliente.cnpj}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Título da proposta</label>
          <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        {/* Introdução / transparência (editável) */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-500" /> Apresentação (aparece na proposta)
          </label>
          <textarea rows={3} value={obs} onChange={e => setObs(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        {/* Detalhamento transparente dos serviços */}
        <div>
          <p className="text-xs font-semibold text-gray-900 mb-2">Serviços e forma de cálculo</p>
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
            {itens.map((it, i) => (
              <div key={i} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900">{it.nome}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{it.descricao}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">{fmtBRL(it.valor_total)}</p>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 font-medium text-blue-700">
                    {it.tipo_valor === 'fixo' ? 'Valor fixo' : `Por ${it.unidade}`}
                  </span>
                  <span className="text-gray-500">
                    {it.tipo_valor === 'fixo'
                      ? `${fmtBRL(it.valor_unitario)}/mês`
                      : `${it.formula} = ${fmtBRL(it.valor_total)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-blue-900">Total mensal</p>
          <p className="text-2xl font-bold text-blue-800 tabular-nums">{fmtBRL(total)}</p>
        </div>

        <p className="text-[11px] text-gray-400">
          Salva como <strong>rascunho</strong> na aba Propostas, onde pode ser revisada, enviada e depois convertida em contrato.
        </p>
      </div>
    </Modal>
  );
}

// Tabela de serviços do relatório (linhas da composição ou itens da proposta).
function TabelaServicos({ linhas, totalLinha, fmtBRL }) {
  return (
    <table className="w-full text-[11.5px] border-collapse">
      <thead>
        <tr className="border-b-2 border-gray-300 text-left text-[9.5px] uppercase tracking-wide text-gray-500">
          <th className="py-1 pr-2">Serviço</th>
          <th className="py-1 px-2">Forma de cálculo</th>
          <th className="py-1 pl-2 text-right">Valor</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className="border-b border-gray-100 align-top">
            <td className="py-0.5 pr-2 font-medium text-gray-900">{l.servico || l.nome}</td>
            <td className="py-0.5 px-2 text-gray-500">{l.detalhe || l.formula}</td>
            <td className="py-0.5 pl-2 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmtBRL(l.valor ?? l.valor_total)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-gray-300">
          <td colSpan={2} className="py-1 font-semibold text-gray-900">Total mensal</td>
          <td className="py-1 pl-2 text-right font-bold text-gray-900 tabular-nums">{fmtBRL(totalLinha)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// Seção de valor: custo real de equipe interna vs. terceirização.
function SecaoTerceirizacao({ fmtBRL }) {
  const custoGeral   = CUSTO_PESSOAL.itens.reduce((s, i) => s + i.valor, 0);
  const soLucroReal  = CUSTO_PESSOAL.itens.filter(i => i.soLucroReal);
  const deltaSimples = soLucroReal.reduce((s, i) => s + i.valor, 0);
  const custoSimples = custoGeral - deltaSimples;
  return (
    <div>
      <h2 className="text-[15px] font-bold text-gray-900">Por que terceirizar com a CCI compensa</h2>
      <p className="mt-2 text-[11.5px] leading-relaxed text-gray-700">
        Manter esses serviços com equipe própria custa muito mais do que o salário. Veja o custo mensal real
        de um {CUSTO_PESSOAL.descricaoExemplo}, com todos os encargos e provisões previstos na legislação:
      </p>

      <table className="w-full mt-3 text-[10.5px] border-collapse">
        <tbody>
          {CUSTO_PESSOAL.itens.map((it, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-[3px] text-gray-700">
                {it.nome}{it.soLucroReal && <span className="text-amber-600"> *</span>}
              </td>
              <td className="py-[3px] text-right text-gray-700 tabular-nums whitespace-nowrap">{fmtBRL(it.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <p className="text-[9.5px] uppercase tracking-wide text-emerald-700">Custo real · Simples Nacional*</p>
          <p className="text-lg font-bold text-emerald-800 tabular-nums">{fmtBRL(custoSimples)}<span className="text-[11px] font-normal">/mês</span></p>
          <p className="text-[9.5px] text-emerald-700/70">por colaborador</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-[9.5px] uppercase tracking-wide text-gray-500">Custo real · Lucro Presumido/Real</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{fmtBRL(custoGeral)}<span className="text-[11px] font-normal">/mês</span></p>
          <p className="text-[9.5px] text-gray-400">por colaborador</p>
        </div>
      </div>

      <p className="mt-2 text-[9px] text-gray-500 leading-relaxed">
        <span className="text-amber-600">*</span> No Simples Nacional (maioria dos anexos), o INSS patronal (20%), o
        RAT e a Contribuição a Terceiros — inclusive as provisões sobre 13º e férias — já estão no DAS e não são
        recolhidos à parte: uma diferença de {fmtBRL(deltaSimples)}/mês por colaborador. O FGTS permanece nos dois
        regimes. Valores de referência; variam conforme convenção coletiva, grau de risco (RAT) e enquadramento.
      </p>

      <p className="mt-4 text-[12px] font-semibold text-gray-900">
        Com a terceirização, uma equipe especializada faz o trabalho — e você elimina:
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 text-[11.5px] text-gray-700">
        <li>✓ Férias e 13º salário</li>
        <li>✓ Encargos trabalhistas (FGTS, INSS, RAT)</li>
        <li>✓ Treinamento e reciclagem da equipe</li>
        <li>✓ Admissões, demissões e rescisões</li>
        <li>✓ Absenteísmo, faltas e turnover</li>
        <li>✓ Passivos e riscos trabalhistas</li>
      </ul>
      <p className="mt-3 text-[11.5px] leading-relaxed text-gray-700">
        Ou seja: por um valor fixo e previsível, você conta com profissionais especializados dedicados às suas
        rotinas contábeis — sem o custo e a preocupação de gerir pessoal.
      </p>
    </div>
  );
}

// ─── Relatório A4 da proposta (imprimível, com papel timbrado) ──
function RelatorioProposta({ cliente, titulo, itens, total, empresas, periodo, fmtBRL, onFechar }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const bg = PAPEL_TIMBRADO_URL
    ? { backgroundImage: `url(${PAPEL_TIMBRADO_URL})`, backgroundSize: '210mm 297mm', backgroundRepeat: 'no-repeat' }
    : {};

  const folhaStyle = {
    width: '210mm', minHeight: '297mm', boxSizing: 'border-box',
    padding: `${MARGENS_A4.topo}mm ${MARGENS_A4.laterais}mm ${MARGENS_A4.base}mm`,
    ...bg,
  };
  const ehRede = empresas && empresas.length > 0;

  const preamble = (
    <>
      <h1 className="text-xl font-bold text-gray-900">{titulo}</h1>
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
        <span>{cliente?.razao_social || cliente?.nome}{cliente?.cnpj ? ` · ${cliente.cnpj}` : ''}</span>
        <span>Emitida em {hoje}</span>
      </div>
      <div className="mt-5 rounded-lg bg-gray-50 border border-gray-200 p-3 text-[11.5px] leading-relaxed text-gray-700">
        {esclarecimento(periodo)}
      </div>
    </>
  );
  const rodape = (
    <p className="mt-8 text-[10px] text-gray-400">
      Proposta gerada pela calculadora de precificação · cobrança por esforço · valores em reais (R$).
    </p>
  );
  const empresaBlock = (it, numero) => (
    <div key={numero} className="mt-5" style={{ breakInside: 'avoid' }}>
      <div className="flex items-center justify-between border-b border-gray-200 pb-1 mb-2">
        <p className="text-[13px] font-semibold text-gray-900">{numero}. {it.empresa.razao_social || it.empresa.nome}</p>
        {it.empresa.cnpj && <p className="text-[10px] text-gray-400 font-mono">{it.empresa.cnpj}</p>}
      </div>
      <TabelaServicos linhas={it.linhas} totalLinha={it.totalMensal} fmtBRL={fmtBRL} />
    </div>
  );

  // Monta as folhas A4. Rede: paginada (2 empresas na 1ª folha por causa do
  // preâmbulo, 3 nas demais). Empresa única: uma folha só.
  const folhas = [];
  if (ehRede) {
    const CHUNK1 = EMPRESAS_POR_FOLHA_1, CHUNK = EMPRESAS_POR_FOLHA;
    const chunks = [{ start: 0, itens: empresas.slice(0, CHUNK1) }];
    for (let i = CHUNK1; i < empresas.length; i += CHUNK) {
      chunks.push({ start: i, itens: empresas.slice(i, i + CHUNK) });
    }
    chunks.forEach((ch, ci) => {
      folhas.push(
        <div key={ci} className="folha bg-white shadow-xl mx-auto mb-6" style={folhaStyle}>
          {ci === 0 && preamble}
          {/* Total da rede no TOPO, em fonte normal */}
          {ci === 0 && (
            <div className="mt-4 flex items-center justify-between rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
              <span className="text-[12.5px] font-semibold text-gray-800">
                Total mensal da rede · {empresas.length} empresa{empresas.length === 1 ? '' : 's'}
              </span>
              <span className="text-[14px] font-bold text-gray-900 tabular-nums">{fmtBRL(total)}</span>
            </div>
          )}
          {ci === 0 && <p className="mt-5 text-[13px] font-semibold text-gray-900">Detalhamento por empresa</p>}
          {ch.itens.map((it, i) => empresaBlock(it, ch.start + i + 1))}
        </div>,
      );
    });
  } else {
    folhas.push(
      <div key="0" className="folha bg-white shadow-xl mx-auto mb-6" style={folhaStyle}>
        {preamble}
        <p className="mt-6 text-[13px] font-semibold text-gray-900 mb-2">Serviços e forma de cálculo</p>
        <TabelaServicos linhas={itens} totalLinha={total} fmtBRL={fmtBRL} />
      </div>,
    );
  }

  // Folha final: seção de valor (terceirização) + rodapé.
  folhas.push(
    <div key="comparativo" className="folha bg-white shadow-xl mx-auto mb-6" style={folhaStyle}>
      <SecaoTerceirizacao fmtBRL={fmtBRL} />
      {rodape}
    </div>,
  );

  // Portal pra document.body: fora do #root, a impressão consegue esconder o
  // app e paginar o relatório (elementos position:fixed só imprimem 1 página).
  return createPortal(
    <div className="relatorio-overlay fixed inset-0 z-[60] bg-gray-700/70 overflow-auto">
      <style>{`
        @media print {
          #root { display: none !important; }
          .relatorio-overlay { position: static !important; overflow: visible !important; background: #fff !important; }
          .relatorio-overlay .no-print { display: none !important; }
          #relatorio-proposta { padding: 0 !important; }
          #relatorio-proposta .folha { box-shadow: none !important; margin: 0 !important; break-after: page; }
          #relatorio-proposta .folha:last-child { break-after: auto; }
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; }
        }
        #relatorio-proposta .folha { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      {/* Barra de ações (não sai na impressão) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-2.5">
        <p className="text-sm font-medium text-gray-700">Pré-visualização · {folhas.length} página(s) A4</p>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
            <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
          </button>
          <button onClick={onFechar}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <X className="h-4 w-4" /> Fechar
          </button>
        </div>
      </div>

      <div id="relatorio-proposta" className="py-6 px-3">
        {folhas}
      </div>
    </div>,
    document.body,
  );
}

// ─── Seção "Por rede" ──────────────────────────────────────
function RedeSection({ redes, redeSel, setRedeSel, calcular, calculando, progresso, resultado, expandida, setExpandida, exportarCsv, montarProposta, fmtBRL, fmtInt }) {
  return (
    <div className="space-y-4 mb-4">
      {/* Seletor + ação */}
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Rede</label>
            <select value={redeSel} onChange={e => setRedeSel(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Selecione uma rede…</option>
              {redes.map(r => (
                <option key={r.key} value={r.key}>
                  {r.nome} · {r.tipo === 'webposto' ? 'Webposto' : 'Autosystem'} ({r.empresas.length} empresa{r.empresas.length === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          </div>
          <button onClick={calcular} disabled={!redeSel || calculando}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
            {calculando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            {calculando ? `Calculando… ${progresso.feito}/${progresso.total}` : 'Calcular rede (mês anterior)'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Puxa os dados do mês anterior de cada empresa da rede (litros, notas de entrada, bicos, contas).
          Caixas e cartões frota não vêm do portal — ficam zerados aqui.
        </p>
      </div>

      {resultado && (
        <>
          {/* Total da rede */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-9 w-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><Wallet className="h-4 w-4" /></div>
                <p className="text-[11px] font-medium text-blue-700 uppercase tracking-wide">Valor mensal da rede · {resultado.rede.nome}</p>
              </div>
              <p className="text-3xl font-bold text-blue-800 tabular-nums">{fmtBRL(resultado.totalRede)}</p>
              <p className="text-[11px] text-blue-700/70 mt-0.5 capitalize">{resultado.itens.length} empresa(s) · dados de {resultado.label}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportarCsv}
                className="flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors">
                <Download className="h-4 w-4" /> CSV
              </button>
              <button onClick={montarProposta}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm">
                <FileText className="h-4 w-4" /> Montar proposta
              </button>
            </div>
          </div>

          {/* Tabela por empresa */}
          <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                    <th className="text-left px-5 py-2.5 font-medium">Empresa</th>
                    <th className="text-right px-4 py-2.5 font-medium">Notas</th>
                    <th className="text-right px-4 py-2.5 font-medium">Litros</th>
                    <th className="text-right px-4 py-2.5 font-medium">Bicos</th>
                    <th className="text-right px-4 py-2.5 font-medium">Contas</th>
                    <th className="text-right px-5 py-2.5 font-medium">Valor mensal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {resultado.itens.map(it => {
                    const aberta = expandida === it.empresa.id;
                    return (
                      <Fragment key={it.empresa.id}>
                        <tr className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                          onClick={() => setExpandida(aberta ? null : it.empresa.id)}>
                          <td className="px-5 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <ChevronRight className={`h-3.5 w-3.5 text-gray-400 transition-transform ${aberta ? 'rotate-90' : ''}`} />
                              <div>
                                <p className="text-[13px] font-medium text-gray-900">{it.empresa.razao_social || it.empresa.nome}</p>
                                {it.empresa.cnpj && <p className="text-[10px] text-gray-400 font-mono">{it.empresa.cnpj}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtInt(it.valores.notas)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtInt(it.valores.litros)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtInt(it.valores.bicos)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtInt(it.valores.contas)}</td>
                          <td className="px-5 py-2.5 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmtBRL(it.totalMensal)}</td>
                        </tr>
                        {aberta && (
                          <tr className="bg-gray-50/40">
                            <td colSpan={6} className="px-5 py-2">
                              <div className="rounded-lg border border-gray-100 bg-white divide-y divide-gray-50">
                                {it.linhas.map((l, i) => (
                                  <div key={i} className="flex items-center justify-between px-3 py-1.5">
                                    <div>
                                      <p className="text-[12px] text-gray-800">{l.servico}</p>
                                      <p className="text-[10px] text-gray-400">{l.detalhe}</p>
                                    </div>
                                    <p className="text-[12px] font-medium text-gray-700 tabular-nums">{fmtBRL(l.valor)}</p>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-100 bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-semibold text-gray-900" colSpan={5}>Total da rede</td>
                    <td className="px-5 py-3 text-right text-base font-bold text-blue-700 tabular-nums">{fmtBRL(resultado.totalRede)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
