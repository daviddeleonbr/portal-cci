import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet, Loader2, AlertCircle, RefreshCw, Search, TrendingUp, TrendingDown,
  ArrowDownToLine, ArrowUpFromLine, Calendar, FileText,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as contasBancariasService from '../services/clienteContasBancariasService';
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

// Resolve a pessoa envolvida no movimento (mesma logica da Conciliacao Bancaria)
function resolvePessoa(m, mapaClientesQ, mapaFornecedores) {
  const t = String(m?.tipoPessoa || '').trim().toUpperCase();
  const pessoaId = m?.pessoaCodigo ?? m?.codigoPessoa ?? m?.clienteCodigo ?? m?.fornecedorCodigo ?? m?.funcionarioCodigo ?? null;
  const cnpjGen = m?.cpfCnpj || m?.cpfCnpjPessoa || '';

  const extrairRazao = (reg) => reg
    ? (reg.razao || reg.razaoSocial || reg.fantasia || reg.nomeFantasia || reg.nome || reg.descricao || '')
    : '';
  const extrairCnpj = (reg) => reg
    ? (reg.cnpjCpf || reg.cpfCnpj || reg.cnpj || reg.cpf || '')
    : '';

  if (t === 'C' || t === 'CLIENTE') {
    const reg = mapaClientesQ?.get(pessoaId);
    return { tipo: 'Cliente', razao: extrairRazao(reg) || m.nomeCliente || '', cnpj: extrairCnpj(reg) || m.clienteCpfCnpj || cnpjGen || '', codigo: pessoaId };
  }
  if (t === 'F' || t === 'FORNECEDOR') {
    const reg = mapaFornecedores?.get(pessoaId);
    return { tipo: 'Fornecedor', razao: extrairRazao(reg) || m.nomeFornecedor || '', cnpj: extrairCnpj(reg) || m.fornecedorCpfCnpj || cnpjGen || '', codigo: pessoaId };
  }
  if (t === 'FU' || t === 'FUNCIONARIO') {
    return { tipo: 'Funcionario', razao: m.nomeFuncionario || '', cnpj: cnpjGen || '', codigo: pessoaId };
  }
  return { tipo: '', razao: m?.razaoSocial || '', cnpj: cnpjGen || '', codigo: null };
}

function sanitizarCnpj(s) {
  if (!s) return '';
  const str = String(s).trim();
  if (!str) return '';
  if (/^[0.\-\/\s]+$/.test(str)) return '';
  return str;
}

export default function BpoCaixaAdministrativo() {
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
  const [contasClassificadas, setContasClassificadas] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [error, setError] = useState(null);

  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroConta, setFiltroConta] = useState('');
  const [detalheMov, setDetalheMov] = useState(null);

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
  }, [clienteId, clientes]);

  useEffect(() => {
    setCarregado(false);
    setMovimentos([]);
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

  // Apenas contas classificadas como 'caixa' e ativas
  const contasCaixa = useMemo(() => {
    const m = new Map();
    contasClassificadas.forEach(c => {
      if (c.ativo !== false && contasBancariasService.TIPOS_PARA_CAIXA_ADMIN.includes(c.tipo)) {
        m.set(c.conta_codigo, c);
      }
    });
    return m;
  }, [contasClassificadas]);

  const contaEhCaixa = (contaCodigo) => contasCaixa.has(contaCodigo);

  const movimentosEnriquecidos = useMemo(() => {
    const movs = movimentos.filter(m => contaEhCaixa(m.contaCodigo));
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
        contaNome: conta?.descricao || conta?.nome || conta?.contaDescricao || (m.contaCodigo ? `Caixa #${m.contaCodigo}` : '—'),
        contraparte: pessoa.razao,
        pessoaTipo: pessoa.tipo,
        pessoaRazao: pessoa.razao,
        pessoaCnpj: sanitizarCnpj(pessoa.cnpj),
        pessoaCodigo: pessoa.codigo,
        saldoAnterior: m.saldoAnterior ?? m.saldoAnteriorConta ?? null,
        saldoPosterior: m.saldoPosterior ?? m.saldoApos ?? m.saldoAtual ?? null,
      };
    }).sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.id - b.id);

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
      let novoSaldo;
      if (m.saldoPosterior != null) novoSaldo = Number(m.saldoPosterior);
      else novoSaldo = Number(saldoCorrente.get(m.contaCodigo) || 0) + delta;
      saldoCorrente.set(m.contaCodigo, novoSaldo);
      return { ...m, saldoAtual: novoSaldo };
    });
  }, [movimentos, mapaPlanoContas, mapaContas, mapaClientesQ, mapaFornecedores, contasCaixa]);

  const totais = useMemo(() => {
    let entradas = 0, saidas = 0;
    movimentosEnriquecidos.forEach(m => {
      if (m.tipo === 'credito') entradas += m.valor;
      else saidas += m.valor;
    });
    return { entradas, saidas, saldo: entradas - saidas };
  }, [movimentosEnriquecidos]);

  const composicao = useMemo(() => {
    const porConta = new Map();
    movimentosEnriquecidos.forEach(m => {
      const atual = porConta.get(m.contaCodigo) || {
        contaCodigo: m.contaCodigo, contaNome: m.contaNome,
        saldoInicial: m.saldoAnterior != null ? Number(m.saldoAnterior) : 0,
        entradas: 0, saidas: 0, saldoAtual: 0,
      };
      if (m.tipo === 'credito') atual.entradas += m.valor;
      else atual.saidas += m.valor;
      atual.saldoAtual = m.saldoAtual;
      porConta.set(m.contaCodigo, atual);
    });
    return Array.from(porConta.values()).sort((a, b) => (a.contaNome || '').localeCompare(b.contaNome || ''));
  }, [movimentosEnriquecidos]);

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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return movimentosEnriquecidos.filter(m => {
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
      if (filtroConta && String(m.contaCodigo) !== String(filtroConta)) return false;
      if (!q) return true;
      return m.descricao.toLowerCase().includes(q)
        || m.planoNome.toLowerCase().includes(q)
        || m.contaNome.toLowerCase().includes(q)
        || m.contraparte.toLowerCase().includes(q)
        || String(m.documento).toLowerCase().includes(q);
    });
  }, [movimentosEnriquecidos, busca, filtroTipo, filtroConta]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div>
      <PageHeader title="Caixa Administrativo" description="Movimentacoes das contas classificadas como 'Conta caixa' (MOVIMENTO_CONTA)" />

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
                  <option key={ch.id} value={ch.id}>{ch.nome} · {qtd} empresa{qtd === 1 ? '' : 's'}</option>
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
            <Wallet className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Selecione a rede, a empresa e o periodo</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Aparecerao apenas lancamentos de contas classificadas como <strong>Conta caixa</strong> em Cadastros &gt; Clientes.
          </p>
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
        </div>
      ) : contasCaixa.size === 0 ? (
        <div className="bg-white rounded-2xl border border-amber-200/60 px-6 py-16 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-900 mb-1">Nenhuma conta classificada como "Conta caixa"</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Nesta rede nenhuma conta foi marcada como <strong>Conta caixa</strong>. Ajuste em <strong>Cadastros &gt; Clientes &gt; Classificar contas bancarias</strong>.
          </p>
        </div>
      ) : movimentosEnriquecidos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Nenhum movimento encontrado nas contas caixa no periodo.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
            <Kpi label="Registros" valor={movimentosEnriquecidos.length} icon={FileText} color="blue" raw />
            <Kpi label="Entradas" valor={formatCurrency(totais.entradas)} icon={ArrowDownToLine} color="emerald" />
            <Kpi label="Saidas" valor={formatCurrency(totais.saidas)} icon={ArrowUpFromLine} color="red" />
            <Kpi label="Saldo"
              valor={formatCurrency(totais.saldo)}
              icon={totais.saldo >= 0 ? TrendingUp : TrendingDown}
              color={totais.saldo >= 0 ? 'emerald' : 'red'} />
          </div>

          {/* Composicao por caixa */}
          {composicao.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-gray-800">Saldo por caixa</h3>
                <span className="text-[11px] text-gray-400">· inicial + movimentos = atual</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-2.5">Caixa</th>
                      <th className="px-4 py-2.5 text-right">Saldo inicial</th>
                      <th className="px-4 py-2.5 text-right">Entradas</th>
                      <th className="px-4 py-2.5 text-right">Saidas</th>
                      <th className="px-4 py-2.5 text-right">Variacao</th>
                      <th className="px-4 py-2.5 text-right">Saldo atual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {composicao.map(c => {
                      const variacao = c.entradas - c.saidas;
                      return (
                        <tr key={c.contaCodigo ?? 'sem-conta'} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2 text-[12px] text-gray-800 truncate max-w-[260px]">{c.contaNome}</td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] text-gray-700 tabular-nums">{formatCurrency(c.saldoInicial)}</td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] text-emerald-600 tabular-nums">+{formatCurrency(c.entradas)}</td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] text-red-600 tabular-nums">-{formatCurrency(c.saidas)}</td>
                          <td className={`px-4 py-2 text-right font-mono text-[12px] tabular-nums font-semibold ${
                            variacao === 0 ? 'text-gray-500' : variacao > 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}>
                            {variacao > 0 ? '+' : ''}{formatCurrency(variacao)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(c.saldoAtual)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por descricao, conta, pessoa, documento..."
                className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'credito', label: 'Entradas' },
                { key: 'debito', label: 'Saidas' },
              ].map(opt => (
                <button key={opt.key} onClick={() => setFiltroTipo(opt.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    filtroTipo === opt.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}>{opt.label}</button>
              ))}
            </div>
            <select value={filtroConta} onChange={(e) => setFiltroConta(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-w-[200px]">
              <option value="">Todas as caixas</option>
              {contasDisponiveis.map(c => (
                <option key={c.codigo} value={c.codigo}>{c.nome}</option>
              ))}
            </select>
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-800">Movimentos do periodo</h3>
              <span className="text-[11px] text-gray-400">· {filtrados.length} de {movimentosEnriquecidos.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Data</th>
                    <th className="px-4 py-2.5">Caixa</th>
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
                        ) : (<span className="text-gray-300">—</span>)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-sm tabular-nums">
                        {m.tipo === 'debito' ? (
                          <span className="text-red-600 font-semibold">{formatCurrency(m.valor)}</span>
                        ) : (<span className="text-gray-300">—</span>)}
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
                        <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">{formatCurrency(totEntrada)}</td>
                        <td className="px-4 py-3 text-right font-mono text-red-700 tabular-nums">{formatCurrency(totSaida)}</td>
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

function ModalDetalheMovimento({ mov, onClose }) {
  if (!mov) return null;
  const isCredito = mov.tipo === 'credito';
  return (
    <Modal open={!!mov} onClose={onClose} title="Detalhes do movimento" size="md">
      <div className="space-y-3">
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

        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          <DetalheLinha label="Caixa" valor={mov.contaNome}
            hint={mov.contaCodigo != null ? `#${mov.contaCodigo}` : null} />
          <DetalheLinha label="Descricao" valor={mov.descricao} />
          <DetalheLinha label="Conta gerencial" valor={mov.planoNome}
            hint={mov.planoCodigo != null ? `#${mov.planoCodigo}` : null} />
          <DetalheLinha label={mov.pessoaTipo || 'Pessoa'} valor={mov.pessoaRazao || '—'}
            hint={mov.pessoaCnpj || null} />
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
