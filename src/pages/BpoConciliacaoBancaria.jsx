import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Landmark, Loader2, AlertCircle, RefreshCw, Search, TrendingUp, TrendingDown,
  ArrowDownToLine, ArrowUpFromLine, Wallet, Calendar, FileText, Upload, Download,
  FileSpreadsheet, Trash2, Check, ChevronDown,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as contasBancariasService from '../services/clienteContasBancariasService';
import * as extratosService from '../services/extratosBancariosService';
import { formatCurrency } from '../utils/format';

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function ontemStr() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return toLocalDateStr(d);
}
function formatDataBR(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

// Resolve a pessoa envolvida no movimento com lookup nos catalogos CLIENTE/FORNECEDOR:
// - tipoPessoa='C' -> busca clienteCodigo (ou pessoaCodigo/codigoPessoa) no catalogo CLIENTE
// - tipoPessoa='F' -> busca no catalogo FORNECEDOR
// Quality costuma usar 'C'=Cliente, 'F'=Fornecedor, 'FU'=Funcionario.
function resolvePessoa(m, mapaClientesQ, mapaFornecedores) {
  const t = String(m?.tipoPessoa || '').trim().toUpperCase();
  const pessoaId = m?.pessoaCodigo ?? m?.codigoPessoa ?? m?.clienteCodigo ?? m?.fornecedorCodigo ?? m?.funcionarioCodigo ?? null;
  const cnpjGen = m?.cpfCnpj || m?.cpfCnpjPessoa || '';

  // Extrai razao + CNPJ do registro de catalogo (Quality usa nomes curtos:
  // razao, fantasia, cnpjCpf - alem de aliases defensivos)
  const extrairRazao = (reg) => reg
    ? (reg.razao || reg.razaoSocial || reg.fantasia || reg.nomeFantasia
        || reg.nome || reg.descricao || '')
    : '';
  const extrairCnpj = (reg) => reg
    ? (reg.cnpjCpf || reg.cpfCnpj || reg.cnpj || reg.cpf || '')
    : '';

  if (t === 'C' || t === 'CLIENTE') {
    const reg = mapaClientesQ?.get(pessoaId);
    return {
      tipo: 'Cliente',
      razao: extrairRazao(reg) || m.clienteRazaoSocial || m.nomeCliente || m.razaoSocial || '',
      cnpj: extrairCnpj(reg) || m.clienteCpfCnpj || cnpjGen || '',
      codigo: pessoaId,
    };
  }
  if (t === 'F' || t === 'FORNECEDOR') {
    const reg = mapaFornecedores?.get(pessoaId);
    return {
      tipo: 'Fornecedor',
      razao: extrairRazao(reg) || m.fornecedorRazaoSocial || m.nomeFornecedor || m.razaoSocial || '',
      cnpj: extrairCnpj(reg) || m.fornecedorCpfCnpj || cnpjGen || '',
      codigo: pessoaId,
    };
  }
  if (t === 'FU' || t === 'FUNCIONARIO') {
    return {
      tipo: 'Funcionario',
      razao: m.nomeFuncionario || m.funcionarioNome || '',
      cnpj: m.funcionarioCpfCnpj || cnpjGen || '',
      codigo: pessoaId,
    };
  }
  // Sem tipoPessoa: fallback
  if (m?.fornecedorCodigo != null || m?.nomeFornecedor) {
    const reg = mapaFornecedores?.get(m.fornecedorCodigo);
    return {
      tipo: 'Fornecedor',
      razao: extrairRazao(reg) || m.nomeFornecedor || '',
      cnpj: extrairCnpj(reg) || m.fornecedorCpfCnpj || cnpjGen || '',
      codigo: m.fornecedorCodigo ?? null,
    };
  }
  if (m?.clienteCodigo != null || m?.nomeCliente) {
    const reg = mapaClientesQ?.get(m.clienteCodigo);
    return {
      tipo: 'Cliente',
      razao: extrairRazao(reg) || m.nomeCliente || '',
      cnpj: extrairCnpj(reg) || m.clienteCpfCnpj || cnpjGen || '',
      codigo: m.clienteCodigo ?? null,
    };
  }
  if (m?.funcionarioCodigo != null || m?.nomeFuncionario) {
    return { tipo: 'Funcionario', razao: m.nomeFuncionario || '', cnpj: '', codigo: m.funcionarioCodigo ?? null };
  }
  return { tipo: '', razao: m?.razaoSocial || '', cnpj: cnpjGen || '', codigo: null };
}

// Remove CNPJ zerado (consumidor final) - retorna '' para nao exibir
function sanitizarCnpj(s) {
  if (!s) return '';
  const str = String(s).trim();
  if (!str) return '';
  if (/^[0.\-\/\s]+$/.test(str)) return '';
  return str;
}

export default function BpoConciliacaoBancaria() {
  const [clientes, setClientes] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);
  const [redeId, setRedeId] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [cliente, setCliente] = useState(null);
  const [dataInicial, setDataInicial] = useState(ontemStr());
  const [dataFinal, setDataFinal] = useState(ontemStr());
  const [loading, setLoading] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [movimentos, setMovimentos] = useState([]);
  const [planoContas, setPlanoContas] = useState([]);
  const [contas, setContas] = useState([]);
  const [clientesQuality, setClientesQuality] = useState([]);
  const [fornecedoresQuality, setFornecedoresQuality] = useState([]);
  const [contasClassificadas, setContasClassificadas] = useState([]); // local (cliente_contas_bancarias)
  const [carregado, setCarregado] = useState(false);
  const [error, setError] = useState(null);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos'); // todos | credito | debito
  const [filtroContas, setFiltroContas] = useState(() => new Set()); // Set<contaCodigo>; vazio = todas
  const [filtroContasOpen, setFiltroContasOpen] = useState(false);

  // Modal de detalhes
  const [detalheMov, setDetalheMov] = useState(null);

  // Extratos bancarios enviados pelo cliente
  const [extratos, setExtratos] = useState([]);
  const [carregandoExtratos, setCarregandoExtratos] = useState(false);
  const [modalUpload, setModalUpload] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [lista, chs] = await Promise.all([
          clientesService.listarClientes(),
          mapService.listarChavesApi(),
        ]);
        const webposto = (lista || []).filter(c => c.usa_webposto && c.chave_api_id && c.empresa_codigo);
        setClientes(webposto);
        const ids = new Set(webposto.map(c => c.chave_api_id));
        setChavesApi((chs || []).filter(ch => ch.ativo !== false && ids.has(ch.id)));
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const empresasDaRede = useMemo(() => {
    if (!redeId) return [];
    return clientes
      .filter(c => c.chave_api_id === redeId)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [redeId, clientes]);

  useEffect(() => {
    if (clienteId && !empresasDaRede.some(c => c.id === clienteId)) setClienteId('');
  }, [redeId, empresasDaRede, clienteId]);

  useEffect(() => {
    setCliente(clientes.find(c => c.id === clienteId) || null);
    setCarregado(false);
    setMovimentos([]);
    setExtratos([]);
  }, [clienteId, clientes]);

  useEffect(() => {
    setCarregado(false);
    setMovimentos([]);
    setExtratos([]);
  }, [dataInicial, dataFinal]);

  const carregar = useCallback(async () => {
    if (!cliente) return;
    if (!dataInicial || !dataFinal) { setError('Informe o periodo.'); return; }
    if (dataInicial > dataFinal) { setError('Data inicial nao pode ser maior que a final.'); return; }
    setLoadingDados(true);
    setError(null);
    try {
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API nao encontrada para este cliente');

      const filtros = { dataInicial, dataFinal, empresaCodigo: cliente.empresa_codigo };
      const [movs, plano, ctas, cliQ, forn, classif] = await Promise.all([
        qualityApi.buscarMovimentoConta(chave.chave, filtros),
        qualityApi.buscarPlanoContasGerencial(chave.chave).catch(() => []),
        qualityApi.buscarContas(chave.chave).catch(() => []),
        qualityApi.buscarClientesQuality(chave.chave).catch(() => []),
        qualityApi.buscarFornecedoresQuality(chave.chave).catch(() => []),
        contasBancariasService.listarPorRede(cliente.chave_api_id).catch(() => []),
      ]);
      setMovimentos(movs || []);
      setPlanoContas(plano || []);
      setContas(ctas || []);
      setClientesQuality(cliQ || []);
      setFornecedoresQuality(forn || []);
      setContasClassificadas(classif || []);
      setCarregado(true);
      // Carrega extratos enviados pelo cliente cujo periodo intersecta com o filtro
      try {
        setCarregandoExtratos(true);
        const extrs = await extratosService.listarPorPeriodo({
          cliente_id: cliente.id, chave_api_id: cliente.chave_api_id,
          dataInicial, dataFinal,
        });
        setExtratos(extrs || []);
      } catch (_) { setExtratos([]); }
      finally { setCarregandoExtratos(false); }
    } catch (err) {
      setError('Erro ao carregar movimentos: ' + err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [cliente, dataInicial, dataFinal]);

  const mapaPlanoContas = useMemo(() => {
    const m = new Map();
    planoContas.forEach(p => m.set(p.planoContaGerencialCodigo || p.codigo, p));
    return m;
  }, [planoContas]);

  const mapaContas = useMemo(() => {
    const m = new Map();
    contas.forEach(c => m.set(c.contaCodigo ?? c.codigo, c));
    return m;
  }, [contas]);

  const mapaClientesQ = useMemo(() => {
    const m = new Map();
    clientesQuality.forEach(c => {
      const id = c.clienteCodigo ?? c.codigo ?? c.id;
      if (id != null) m.set(id, c);
    });
    return m;
  }, [clientesQuality]);

  const mapaFornecedores = useMemo(() => {
    const m = new Map();
    fornecedoresQuality.forEach(f => {
      const id = f.fornecedorCodigo ?? f.codigo ?? f.id;
      if (id != null) m.set(id, f);
    });
    return m;
  }, [fornecedoresQuality]);

  // Conjunto de contas que devem aparecer na conciliacao: apenas aquelas
  // classificadas como 'bancaria' ou 'aplicacao' E ativas.
  // Se NAO ha classificacao para uma conta, ela aparece (default = bancaria).
  const contasAceitas = useMemo(() => {
    const permitidas = new Map();
    contasClassificadas.forEach(c => {
      permitidas.set(c.conta_codigo, c);
    });
    return { map: permitidas };
  }, [contasClassificadas]);

  // Decide se o contaCodigo do movimento entra na conciliacao
  const contaEntraNaConciliacao = (contaCodigo) => {
    const classif = contasAceitas.map.get(contaCodigo);
    if (!classif) return true; // sem classificacao = default bancaria
    if (classif.ativo === false) return false;
    return contasBancariasService.TIPOS_PARA_CONCILIACAO.includes(classif.tipo);
  };

  const movimentosEnriquecidos = useMemo(() => {
    // Filtra movimentos com base na classificacao local da conta bancaria
    const movs = movimentos.filter(m => contaEntraNaConciliacao(m.contaCodigo));
    const normalizados = movs.map(m => {
      const plano = mapaPlanoContas.get(m.planoContaGerencialCodigo);
      const conta = mapaContas.get(m.contaCodigo);
      const isCredito = m.tipo === 'Crédito' || m.tipo === 'Credito' || m.tipo === 'C';
      const pessoa = resolvePessoa(m, mapaClientesQ, mapaFornecedores);
      return {
        id: m.codigo || m.movimentoContaCodigo,
        data: m.dataMovimento,
        descricao: (m.descricao || '').trim() || '—',
        documento: m.documento || m.numeroDocumento || '',
        tipo: isCredito ? 'credito' : 'debito',
        valor: Math.abs(Number(m.valor || 0)),
        planoCodigo: m.planoContaGerencialCodigo,
        planoNome: plano?.planoContaGerencialNome || plano?.nome || plano?.descricao || '—',
        contaCodigo: m.contaCodigo,
        contaNome: conta?.descricao || conta?.nome || conta?.contaDescricao || (m.contaCodigo ? `Conta #${m.contaCodigo}` : '—'),
        contraparte: pessoa.razao,
        pessoaTipo: pessoa.tipo,
        pessoaRazao: pessoa.razao,
        pessoaCnpj: sanitizarCnpj(pessoa.cnpj),
        pessoaCodigo: pessoa.codigo,
        // Campos de saldo que a Quality pode expor no MOVIMENTO_CONTA
        saldoAnterior: m.saldoAnterior ?? m.saldoAnteriorConta ?? null,
        saldoPosterior: m.saldoPosterior ?? m.saldoApos ?? m.saldoAtual ?? null,
      };
    }).sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.id - b.id);

    // Saldo corrente por conta, partindo do saldoAnterior do primeiro movimento da conta
    // (equivale ao saldo final do dia anterior ao periodo).
    const saldoCorrente = new Map();
    const saldoInicialPorConta = new Map();
    normalizados.forEach(m => {
      if (!saldoInicialPorConta.has(m.contaCodigo)) {
        const inicial = m.saldoAnterior != null ? Number(m.saldoAnterior) : 0;
        saldoInicialPorConta.set(m.contaCodigo, inicial);
        saldoCorrente.set(m.contaCodigo, inicial);
      }
    });
    return normalizados.map(m => {
      const delta = m.tipo === 'credito' ? m.valor : -m.valor;
      // Prefere saldoPosterior do endpoint se presente (mais confiavel)
      let novoSaldo;
      if (m.saldoPosterior != null) {
        novoSaldo = Number(m.saldoPosterior);
      } else {
        novoSaldo = Number(saldoCorrente.get(m.contaCodigo) || 0) + delta;
      }
      saldoCorrente.set(m.contaCodigo, novoSaldo);
      return { ...m, saldoAtual: novoSaldo };
    });
  }, [movimentos, mapaPlanoContas, mapaContas, mapaClientesQ, mapaFornecedores, contasAceitas]);

  // Contas excluidas (para informar o usuario no banner)
  const contasExcluidas = useMemo(() => {
    return contasClassificadas.filter(c => c.ativo === false
      || !contasBancariasService.TIPOS_PARA_CONCILIACAO.includes(c.tipo));
  }, [contasClassificadas]);


  // Contas bancarias elegiveis (empresa selecionada + classificadas como bancaria/aplicacao)
  const contasElegiveis = useMemo(() => {
    if (!cliente?.empresa_codigo) return [];
    const mapaDesc = new Map();
    contas
      .filter(c => Number(c.empresaCodigo) === Number(cliente.empresa_codigo))
      .forEach(c => {
        const codigo = c.contaCodigo ?? c.codigo;
        if (codigo == null) return;
        mapaDesc.set(codigo, c.descricao || c.nome || c.contaDescricao || `Conta #${codigo}`);
      });
    return Array.from(mapaDesc.entries())
      .filter(([codigo]) => contaEntraNaConciliacao(codigo))
      .map(([codigo, descricao]) => ({ codigo, descricao }))
      .sort((a, b) => a.descricao.localeCompare(b.descricao));
  }, [contas, contasAceitas, cliente]);

  // ============ Extratos bancarios ============
  const recarregarExtratos = async () => {
    if (!cliente) return;
    const extrs = await extratosService.listarPorPeriodo({
      cliente_id: cliente.id, chave_api_id: cliente.chave_api_id,
      dataInicial, dataFinal,
    });
    setExtratos(extrs || []);
  };

  const handleUploadExtrato = async ({ file, conta_codigo, saldo_final, data_inicial, data_final, observacoes }) => {
    if (!cliente) return;
    await extratosService.upload({
      file,
      cliente_id: cliente.id,
      chave_api_id: cliente.chave_api_id,
      conta_codigo,
      saldo_final,
      data_inicial,
      data_final,
      enviado_por: 'admin',
      observacoes,
    });
    await recarregarExtratos();
  };

  // Calcula saldo do sistema ate a data_final do extrato para a conta informada.
  // Usa os movimentos ja enriquecidos (que tem saldo corrente por linha).
  const calcularSaldoSistema = (contaCodigo, dataFinalExtrato) => {
    if (contaCodigo == null || !dataFinalExtrato) return null;
    const cod = Number(contaCodigo);
    const candidatos = movimentosEnriquecidos
      .filter(m => Number(m.contaCodigo) === cod && (m.data || '') <= dataFinalExtrato);
    if (candidatos.length === 0) {
      // Sem movimento ate a data: saldo = saldoInicial declarado da conta na composicao (se houver)
      const c = composicaoSaldo.find(c => Number(c.contaCodigo) === cod);
      return c ? c.saldoInicial : null;
    }
    // Ultimo movimento (por data, depois por id crescente): ja traz saldoAtual correto
    const ultimo = [...candidatos].sort((a, b) => {
      if ((a.data || '') !== (b.data || '')) return (a.data || '').localeCompare(b.data || '');
      return (a.id || 0) - (b.id || 0);
    }).pop();
    return ultimo?.saldoAtual ?? null;
  };

  const handleDownloadExtrato = async (extrato) => {
    try {
      const url = await extratosService.getDownloadUrl(extrato.arquivo_path, 300);
      if (url) window.open(url, '_blank');
    } catch (err) {
      setError('Erro ao gerar link de download: ' + err.message);
    }
  };

  const handleExcluirExtrato = async (extrato) => {
    if (!confirm(`Excluir extrato "${extrato.arquivo_nome}"?`)) return;
    try {
      await extratosService.excluir(extrato.id, extrato.arquivo_path);
      setExtratos(prev => prev.filter(e => e.id !== extrato.id));
      if (verificacao?.extratoId === extrato.id) setVerificacao(null);
    } catch (err) {
      setError('Erro ao excluir: ' + err.message);
    }
  };


  // Contas que aparecem nos movimentos (para popular o dropdown). NAO filtrado,
  // para manter todas as opcoes disponiveis mesmo apos selecao.
  const contasDisponiveis = useMemo(() => {
    const set = new Map();
    movimentosEnriquecidos.forEach(m => {
      if (m.contaCodigo != null && !set.has(m.contaCodigo)) {
        set.set(m.contaCodigo, m.contaNome);
      }
    });
    return Array.from(set.entries())
      .map(([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [movimentosEnriquecidos]);

  // Base filtrada pelo multiselect de contas - aplicada em KPIs, composicao E tabela
  const movimentosNaConta = useMemo(() => {
    if (filtroContas.size === 0) return movimentosEnriquecidos;
    return movimentosEnriquecidos.filter(m => filtroContas.has(m.contaCodigo));
  }, [movimentosEnriquecidos, filtroContas]);

  const totais = useMemo(() => {
    let entradas = 0, saidas = 0;
    movimentosNaConta.forEach(m => {
      if (m.tipo === 'credito') entradas += m.valor;
      else saidas += m.valor;
    });
    return { entradas, saidas, saldo: entradas - saidas };
  }, [movimentosNaConta]);

  // Composicao do saldo por conta bancaria (saldo inicial + movimentos = saldo atual)
  const composicaoSaldo = useMemo(() => {
    const porConta = new Map();
    movimentosNaConta.forEach(m => {
      const atual = porConta.get(m.contaCodigo) || {
        contaCodigo: m.contaCodigo,
        contaNome: m.contaNome,
        saldoInicial: m.saldoAnterior != null ? Number(m.saldoAnterior) : 0,
        entradas: 0,
        saidas: 0,
        saldoAtual: 0,
      };
      if (m.tipo === 'credito') atual.entradas += m.valor;
      else atual.saidas += m.valor;
      atual.saldoAtual = m.saldoAtual;
      porConta.set(m.contaCodigo, atual);
    });
    return Array.from(porConta.values())
      .sort((a, b) => (a.contaNome || '').localeCompare(b.contaNome || ''));
  }, [movimentosNaConta]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return movimentosNaConta.filter(m => {
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
      if (!q) return true;
      return m.descricao.toLowerCase().includes(q)
        || m.planoNome.toLowerCase().includes(q)
        || m.contaNome.toLowerCase().includes(q)
        || m.contraparte.toLowerCase().includes(q)
        || String(m.documento).toLowerCase().includes(q);
    });
  }, [movimentosNaConta, busca, filtroTipo]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div>
      <PageHeader title="Conciliacao Bancaria" description="Lista as movimentacoes das contas bancarias (endpoint MOVIMENTO_CONTA) da empresa selecionada" />

      {/* Seletor rede + empresa + periodo */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_160px_160px_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">1. Rede</label>
            <select value={redeId} onChange={(e) => setRedeId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Selecione uma rede...</option>
              {chavesApi.map(ch => {
                const qtd = clientes.filter(c => c.chave_api_id === ch.id).length;
                return (
                  <option key={ch.id} value={ch.id}>
                    {ch.nome} · {qtd} empresa{qtd === 1 ? '' : 's'}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">2. Empresa</label>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}
              disabled={!redeId}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400">
              <option value="">{redeId ? 'Selecione uma empresa...' : 'Escolha a rede primeiro'}</option>
              {empresasDaRede.map(c => (
                <option key={c.id} value={c.id}>{c.nome}{c.cnpj ? ` (${c.cnpj})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">De</label>
            <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Ate</label>
            <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <button onClick={carregar} disabled={!cliente || loadingDados}
            className="flex items-center gap-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Carregar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {!cliente ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Landmark className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Selecione a rede, a empresa e o periodo</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">Os movimentos sao buscados via endpoint <strong>MOVIMENTO_CONTA</strong> (Quality) para a empresa escolhida.</p>
        </div>
      ) : loadingDados ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <Loader2 className="h-7 w-7 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800">Buscando movimentos de {formatDataBR(dataInicial)} a {formatDataBR(dataFinal)}...</p>
        </div>
      ) : !carregado ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Calendar className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Clique em "Carregar" para buscar os movimentos</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Periodo <strong>{formatDataBR(dataInicial)}</strong> a <strong>{formatDataBR(dataFinal)}</strong>.
          </p>
        </div>
      ) : movimentosEnriquecidos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Nenhum movimento encontrado no periodo.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
            <Kpi label="Registros" valor={movimentosEnriquecidos.length} icon={FileText} color="blue" raw />
            <Kpi label="Entradas (creditos)" valor={formatCurrency(totais.entradas)} icon={ArrowDownToLine} color="emerald" />
            <Kpi label="Saidas (debitos)" valor={formatCurrency(totais.saidas)} icon={ArrowUpFromLine} color="red" />
            <Kpi label="Saldo"
              valor={formatCurrency(totais.saldo)}
              icon={totais.saldo >= 0 ? TrendingUp : TrendingDown}
              color={totais.saldo >= 0 ? 'emerald' : 'red'} />
          </div>

          {contasExcluidas.length > 0 && (
            <div className="mb-4 rounded-lg bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-800">
                {contasExcluidas.length} conta{contasExcluidas.length === 1 ? '' : 's'} oculta{contasExcluidas.length === 1 ? '' : 's'} desta conciliacao (caixa / outras / inativas).
                Ajuste a classificacao em <strong>Cadastros &gt; Clientes</strong>.
              </p>
            </div>
          )}

          {/* Extratos enviados pelo cliente */}
          <div className="mb-5 bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-800">Extratos bancarios do cliente</h3>
              <span className="text-[11px] text-gray-400">· {carregandoExtratos ? 'carregando...' : `${extratos.length} arquivo(s)`}</span>
              <button onClick={() => setModalUpload(true)} disabled={contasElegiveis.length === 0}
                title={contasElegiveis.length === 0 ? 'Classifique ao menos 1 conta bancaria ativa em Cadastros > Clientes' : 'Enviar extrato'}
                className="ml-auto flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Upload className="h-3.5 w-3.5" /> Enviar extrato
              </button>
            </div>
            {extratos.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <AlertCircle className="h-7 w-7 text-amber-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-900 mb-1">Cliente ainda nao enviou o extrato</p>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  Nenhum arquivo de extrato encontrado para o periodo {formatDataBR(dataInicial)} a {formatDataBR(dataFinal)}.
                  Solicite o envio ou utilize o botao acima para anexar manualmente.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {extratos.map(ex => {
                  const contaInfo = contasElegiveis.find(c => Number(c.codigo) === Number(ex.conta_codigo));
                  const saldoSistema = calcularSaldoSistema(ex.conta_codigo, ex.data_final);
                  const temDeclarado = ex.saldo_final != null;
                  const diff = temDeclarado && saldoSistema != null ? Number(ex.saldo_final) - Number(saldoSistema) : null;
                  const conciliado = diff != null && Math.abs(diff) < 0.01;
                  return (
                    <div key={ex.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                      <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{ex.arquivo_nome}</p>
                          {contaInfo ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
                              <Landmark className="h-2.5 w-2.5" /> {contaInfo.descricao}
                            </span>
                          ) : ex.conta_codigo != null ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 flex-shrink-0">
                              Conta #{ex.conta_codigo}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">
                              Sem conta vinculada
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {formatDataBR(ex.data_inicial) === formatDataBR(ex.data_final)
                            ? formatDataBR(ex.data_inicial)
                            : `${formatDataBR(ex.data_inicial)} a ${formatDataBR(ex.data_final)}`}
                          {ex.tamanho_bytes && <> · {extratosService.formatarTamanho(ex.tamanho_bytes)}</>}
                          {ex.enviado_em && <> · enviado {new Date(ex.enviado_em).toLocaleString('pt-BR')}</>}
                        </p>
                      </div>

                      {/* Comparacao de saldos */}
                      <div className="hidden md:flex items-center gap-3 text-right">
                        <div>
                          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Declarado</p>
                          <p className="text-[12px] font-mono font-semibold text-gray-800 tabular-nums">
                            {temDeclarado ? formatCurrency(Number(ex.saldo_final)) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Sistema</p>
                          <p className="text-[12px] font-mono font-semibold text-gray-800 tabular-nums">
                            {saldoSistema != null ? formatCurrency(saldoSistema) : '—'}
                          </p>
                        </div>
                        <div className={`rounded-md px-2 py-1 border ${
                          diff == null ? 'bg-gray-50 border-gray-200 text-gray-400'
                            : conciliado ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 text-emerald-700'
                            : 'bg-red-50 dark:bg-red-500/10 border-red-200 text-red-700'
                        }`}>
                          <p className="text-[9px] uppercase tracking-wider opacity-80">Diferenca</p>
                          <p className="text-[12px] font-mono font-semibold tabular-nums">
                            {diff == null ? '—' : `${diff > 0 ? '+' : ''}${formatCurrency(diff)}`}
                          </p>
                        </div>
                      </div>

                      <button onClick={() => handleDownloadExtrato(ex)}
                        className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Download">
                        <Download className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleExcluirExtrato(ex)}
                        className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* Composicao do saldo por conta bancaria */}
          {composicaoSaldo.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-gray-800">Composicao do saldo</h3>
                <span className="text-[11px] text-gray-400">
                  · Saldo inicial (dia anterior ao periodo) + movimentos = Saldo atual (fim do periodo)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-2.5">Conta bancaria</th>
                      <th className="px-4 py-2.5 text-right">Saldo inicial</th>
                      <th className="px-4 py-2.5 text-right">Entradas</th>
                      <th className="px-4 py-2.5 text-right">Saidas</th>
                      <th className="px-4 py-2.5 text-right">Variacao</th>
                      <th className="px-4 py-2.5 text-right">Saldo atual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {composicaoSaldo.map(c => {
                      const variacao = c.entradas - c.saidas;
                      return (
                        <tr key={c.contaCodigo ?? 'sem-conta'} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2 text-[12px] text-gray-800 truncate max-w-[260px]">{c.contaNome}</td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] text-gray-700 tabular-nums">
                            {formatCurrency(c.saldoInicial)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] text-emerald-600 tabular-nums">
                            +{formatCurrency(c.entradas)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] text-red-600 tabular-nums">
                            -{formatCurrency(c.saidas)}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono text-[12px] tabular-nums font-semibold ${
                            variacao === 0 ? 'text-gray-500' : variacao > 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}>
                            {variacao > 0 ? '+' : ''}{formatCurrency(variacao)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-sm font-bold text-gray-900 tabular-nums">
                            {formatCurrency(c.saldoAtual)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50/60 border-t border-gray-200">
                    <tr className="text-[12px] font-semibold">
                      <td className="px-4 py-3 text-gray-700">Consolidado</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">
                        {formatCurrency(composicaoSaldo.reduce((s, c) => s + c.saldoInicial, 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                        +{formatCurrency(totais.entradas)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-red-700 tabular-nums">
                        -{formatCurrency(totais.saidas)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono tabular-nums ${
                        totais.saldo === 0 ? 'text-gray-500' : totais.saldo > 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}>
                        {totais.saldo > 0 ? '+' : ''}{formatCurrency(totais.saldo)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900 tabular-nums">
                        {formatCurrency(composicaoSaldo.reduce((s, c) => s + c.saldoAtual, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por descricao, conta, fornecedor, documento..."
                className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'credito', label: 'Creditos' },
                { key: 'debito', label: 'Debitos' },
              ].map(opt => (
                <button key={opt.key} onClick={() => setFiltroTipo(opt.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    filtroTipo === opt.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <MultiSelectContas
              contas={contasDisponiveis}
              selecionadas={filtroContas}
              onChange={setFiltroContas}
              open={filtroContasOpen}
              setOpen={setFiltroContasOpen}
            />
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-800">Movimentos do periodo</h3>
              <span className="text-[11px] text-gray-400">· {filtrados.length} de {movimentosEnriquecidos.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Data</th>
                    <th className="px-4 py-2.5">Conta bancaria</th>
                    <th className="px-4 py-2.5">Descricao</th>
                    <th className="px-4 py-2.5">Doc.</th>
                    <th className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <ArrowDownToLine className="h-3 w-3" /> Entrada
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <ArrowUpFromLine className="h-3 w-3" /> Saida
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-right">Saldo apos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtrados.map(m => (
                    <tr key={m.id} onClick={() => setDetalheMov(m)}
                      className="hover:bg-blue-50/60 cursor-pointer transition-colors">
                      <td className="px-4 py-2 text-[12px] text-gray-700 font-mono tabular-nums">{formatDataBR(m.data)}</td>
                      <td className="px-4 py-2 text-[12px] text-gray-700 max-w-[220px] truncate">{m.contaNome}</td>
                      <td className="px-4 py-2 text-[12px] text-gray-800 max-w-[360px] truncate">{m.descricao}</td>
                      <td className="px-4 py-2 text-[12px] text-gray-500 font-mono">{m.documento || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-sm tabular-nums">
                        {m.tipo === 'credito' ? (
                          <span className="text-emerald-600 font-semibold">{formatCurrency(m.valor)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-sm tabular-nums">
                        {m.tipo === 'debito' ? (
                          <span className="text-red-600 font-semibold">{formatCurrency(m.valor)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-sm text-gray-800 tabular-nums font-semibold">
                        {formatCurrency(m.saldoAtual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/60 border-t border-gray-200">
                  {(() => {
                    const totEntrada = filtrados.filter(m => m.tipo === 'credito').reduce((s, m) => s + m.valor, 0);
                    const totSaida = filtrados.filter(m => m.tipo === 'debito').reduce((s, m) => s + m.valor, 0);
                    return (
                      <tr className="text-sm font-semibold">
                        <td className="px-4 py-3 text-gray-700" colSpan={4}>
                          Totais <span className="text-[11px] font-normal text-gray-500">({filtrados.length} registros)</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                          {formatCurrency(totEntrada)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-red-700 tabular-nums">
                          {formatCurrency(totSaida)}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums ${
                          totEntrada - totSaida >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}>
                          {(totEntrada - totSaida) >= 0 ? '+' : ''}{formatCurrency(totEntrada - totSaida)}
                        </td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      <ModalDetalheMovimento mov={detalheMov} onClose={() => setDetalheMov(null)} />

      <ModalUploadExtrato
        open={modalUpload}
        onClose={() => setModalUpload(false)}
        contasElegiveis={contasElegiveis}
        dataInicial={dataInicial}
        dataFinal={dataFinal}
        onSubmit={async (dados) => {
          await handleUploadExtrato(dados);
          setModalUpload(false);
        }}
      />
    </div>
  );
}

function ModalDetalheMovimento({ mov, onClose }) {
  if (!mov) return null;
  const isCredito = mov.tipo === 'credito';
  return (
    <Modal open={!!mov} onClose={onClose} title="Detalhes do movimento" size="md">
      <div className="space-y-3">
        {/* Cabecalho: Tipo + Valor + Data */}
        <div className={`rounded-lg border px-4 py-3 ${
          isCredito ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${
                isCredito ? 'text-emerald-700' : 'text-red-700'
              }`}>
                {isCredito ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
                {isCredito ? 'Entrada' : 'Saida'}
              </p>
              <p className={`text-2xl font-bold font-mono tabular-nums leading-none mt-1 ${
                isCredito ? 'text-emerald-700' : 'text-red-700'
              }`}>
                {isCredito ? '+' : '-'}{formatCurrency(mov.valor)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Data</p>
              <p className="text-sm font-semibold text-gray-900 font-mono">{formatDataBR(mov.data)}</p>
            </div>
          </div>
        </div>

        {/* Grid denso de detalhes */}
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          <DetalheLinha label="Conta bancaria" valor={mov.contaNome}
            hint={mov.contaCodigo != null ? `#${mov.contaCodigo}` : null} />
          <DetalheLinha label="Descricao" valor={mov.descricao} />
          <DetalheLinha label="Conta gerencial" valor={mov.planoNome}
            hint={mov.planoCodigo != null ? `#${mov.planoCodigo}` : null} />
          <DetalheLinha
            label={mov.pessoaTipo || 'Pessoa'}
            valor={mov.pessoaRazao || '—'}
            hint={mov.pessoaCnpj || null}
          />
          <DetalheLinha label="Documento" valor={mov.documento || '—'} mono />
          {mov.saldoAnterior != null && (
            <DetalheLinha label="Saldo anterior" valor={formatCurrency(Number(mov.saldoAnterior))} mono />
          )}
        </div>
      </div>
    </Modal>
  );
}

function DetalheLinha({ label, valor, hint, mono }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-[11px] text-gray-500 uppercase tracking-wider flex-shrink-0">{label}</span>
      <div className="text-right min-w-0 flex-1">
        <p className={`text-[13px] text-gray-800 truncate ${mono ? 'font-mono tabular-nums' : ''}`}>{valor}</p>
        {hint && <p className="text-[10px] text-gray-400 font-mono leading-tight">{hint}</p>}
      </div>
    </div>
  );
}

function MultiSelectContas({ contas, selecionadas, onChange, open, setOpen }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  const toggle = (codigo) => {
    const next = new Set(selecionadas);
    next.has(codigo) ? next.delete(codigo) : next.add(codigo);
    onChange(next);
  };

  const marcarTodas = () => onChange(new Set(contas.map(c => c.codigo)));
  const limpar = () => onChange(new Set());

  const label = selecionadas.size === 0
    ? 'Todas as contas'
    : selecionadas.size === 1
      ? (contas.find(c => c.codigo === [...selecionadas][0])?.nome || '1 conta')
      : `${selecionadas.size} contas selecionadas`;

  return (
    <div ref={ref} className="relative min-w-[220px]">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-left flex items-center gap-2 hover:border-blue-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
        <span className="flex-1 truncate text-gray-700">{label}</span>
        {selecionadas.size > 0 && (
          <span className="rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 flex-shrink-0">
            {selecionadas.size}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 w-[280px] bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/60">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Contas bancarias</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={marcarTodas}
                className="text-[10px] font-medium text-blue-600 hover:text-blue-800">Todas</button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={limpar}
                className="text-[10px] font-medium text-gray-500 hover:text-gray-800">Limpar</button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {contas.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-500">Nenhuma conta disponivel.</p>
            ) : contas.map(c => {
              const marcada = selecionadas.has(c.codigo);
              return (
                <label key={c.codigo}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${marcada ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>
                  <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    marcada ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                  }`}>
                    {marcada && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={marcada} onChange={() => toggle(c.codigo)} />
                  <span className="flex-1 text-xs text-gray-800 truncate">{c.nome}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valor, icon: Icon, color, raw }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red:     'bg-red-50 text-red-600',
    amber:   'bg-amber-50 text-amber-600',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className={`font-bold text-gray-900 tabular-nums ${raw ? 'text-xl' : 'text-lg'}`}>{valor}</p>
    </motion.div>
  );
}

function ModalUploadExtrato({ open, onClose, contasElegiveis, dataInicial, dataFinal, onSubmit }) {
  const [file, setFile] = useState(null);
  const [contaCodigo, setContaCodigo] = useState('');
  const [data, setData] = useState('');
  const [saldoFinal, setSaldoFinal] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [extraindoSaldo, setExtraindoSaldo] = useState(false);
  const [saldoAuto, setSaldoAuto] = useState(null); // sinaliza visualmente que o saldo foi extraido do arquivo
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (open) {
      setFile(null); setContaCodigo(''); setSaldoFinal(''); setObservacoes(''); setErro(null);
      setSaldoAuto(null);
      setData(dataFinal || dataInicial || '');
    }
  }, [open, dataInicial, dataFinal]);

  const handleFileChange = async (ev) => {
    const f = ev.target.files?.[0] || null;
    setFile(f);
    setSaldoAuto(null);
    if (!f) return;
    // Tenta extrair automaticamente o saldo final (linha "SALDO DO DIA" no Sicoob)
    try {
      setExtraindoSaldo(true);
      const saldo = await extratosService.extrairSaldoFinal(f);
      if (saldo != null) {
        setSaldoFinal(String(saldo).replace('.', ','));
        setSaldoAuto(saldo);
      }
    } catch { /* noop */ }
    finally { setExtraindoSaldo(false); }
  };

  const podeEnviar = !!file && !!contaCodigo && !!data && saldoFinal !== '' && !enviando;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!podeEnviar) return;
    try {
      setEnviando(true);
      setErro(null);
      // Aceita valor em formato BR ("-750,00" / "28.251,80") ou EN
      const saldoNum = (() => {
        const s = String(saldoFinal).trim();
        if (!s) return null;
        let clean = s.replace(/\s/g, '');
        if (clean.includes(',') && clean.includes('.')) clean = clean.replace(/\./g, '').replace(',', '.');
        else if (clean.includes(',')) clean = clean.replace(',', '.');
        const n = Number(clean);
        return isFinite(n) ? n : null;
      })();
      await onSubmit({
        file,
        conta_codigo: Number(contaCodigo),
        saldo_final: saldoNum,
        data_inicial: data,
        data_final: data,
        observacoes: observacoes || null,
      });
    } catch (err) {
      setErro(err.message);
    } finally { setEnviando(false); }
  };

  return (
    <Modal open={open} onClose={() => !enviando && onClose()} title="Enviar extrato bancario" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {erro && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{erro}</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Arquivo *</label>
          <input type="file" accept=".csv,.xlsx,.xls,.txt,.pdf,.ofx"
            onChange={handleFileChange}
            className="block w-full text-xs file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100" />
          {file && (
            <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1.5">
              {file.name} · {(file.size / 1024).toFixed(1)} KB
              {extraindoSaldo && <><Loader2 className="h-3 w-3 animate-spin" /> lendo saldo do arquivo...</>}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Conta bancaria *</label>
            <select value={contaCodigo} onChange={e => setContaCodigo(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Selecione...</option>
              {contasElegiveis.map(c => (
                <option key={c.codigo} value={c.codigo}>{c.descricao}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data do extrato *</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Saldo final declarado no arquivo *
            {saldoAuto != null && (
              <span className="ml-2 text-[10px] font-normal text-emerald-600">
                ✓ detectado automaticamente no arquivo
              </span>
            )}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
            <input type="text" inputMode="decimal"
              value={saldoFinal}
              onChange={e => { setSaldoFinal(e.target.value); setSaldoAuto(null); }}
              placeholder="0,00"
              className={`w-full h-10 rounded-lg border pl-9 pr-3 text-sm font-mono text-right focus:outline-none focus:ring-2 ${
                saldoAuto != null
                  ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-500/10 focus:border-emerald-400 focus:ring-emerald-100'
                  : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'
              }`} />
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Usado para comparar com o saldo calculado pelo sistema (via MOVIMENTO_CONTA).
            {' '}Sicoob: linha "SALDO DO DIA" (C = positivo, D = negativo).
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Observacoes (opcional)</label>
          <textarea rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)}
            placeholder="Notas sobre este extrato"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} disabled={enviando}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={!podeEnviar}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Enviar
          </button>
        </div>
      </form>
    </Modal>
  );
}
