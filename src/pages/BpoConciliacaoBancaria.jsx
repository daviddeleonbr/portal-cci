import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Landmark, Loader2, AlertCircle, RefreshCw, Search, TrendingUp, TrendingDown,
  ArrowDownToLine, ArrowUpFromLine, Wallet, Calendar, FileText, Building2, ChevronRight,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as contasBancariasService from '../services/clienteContasBancariasService';
import { formatCurrency } from '../utils/format';
import { useAnonimizador } from '../services/anonimizarService';

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

const NOMES_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function formatMesAno(mesKey) {
  if (!mesKey || mesKey === 'sem-data') return 'Sem data';
  const [y, m] = String(mesKey).split('-');
  const idx = Number(m) - 1;
  return (NOMES_MESES[idx] || m) + ' / ' + y;
}

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

export default function BpoConciliacaoBancaria() {
  const { labelEmpresa, labelRede } = useAnonimizador();
  const [clientes, setClientes] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);
  const [redeId, setRedeId] = useState('');
  const [dataInicial, setDataInicial] = useState(ontemStr());
  const [dataFinal, setDataFinal] = useState(ontemStr());
  const [loading, setLoading] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ atual: 0, total: 0, mensagem: '' });
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
  const [detalheMov, setDetalheMov] = useState(null);

  // Expansoes da arvore (empresa → conta → mes → dia → lancamentos)
  const [saldoEmpresasExpandidas, setSaldoEmpresasExpandidas] = useState(new Set());
  const [movEmpresasExpandidas, setMovEmpresasExpandidas] = useState(new Set());
  const [movContasExpandidas, setMovContasExpandidas] = useState(new Set());
  const [movMesesExpandidos, setMovMesesExpandidos] = useState(new Set());
  const [movDiasExpandidos, setMovDiasExpandidos] = useState(new Set());

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
      .filter(c => c.chave_api_id === redeId && c.status !== 'inativo')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [redeId, clientes]);

  useEffect(() => {
    setCarregado(false);
    setMovimentos([]);
  }, [redeId, dataInicial, dataFinal]);

  const carregar = useCallback(async () => {
    if (!redeId || empresasDaRede.length === 0) { setError('Selecione uma rede com empresas Webposto ativas.'); return; }
    if (!dataInicial || !dataFinal) { setError('Informe o periodo.'); return; }
    if (dataInicial > dataFinal) { setError('Data inicial nao pode ser maior que a final.'); return; }
    setLoadingDados(true);
    setError(null);
    try {
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === redeId);
      if (!chave) throw new Error('Chave API da rede nao encontrada');

      // Catalogos (por rede — buscamos uma vez so)
      setLoadingProgress({ atual: 0, total: empresasDaRede.length + 1, mensagem: 'Carregando catalogos da rede...' });
      const [plano, ctas, cliQ, forn, classif] = await Promise.all([
        qualityApi.buscarPlanoContasGerencial(chave.chave).catch(() => []),
        qualityApi.buscarContas(chave.chave).catch(() => []),
        qualityApi.buscarClientesQuality(chave.chave).catch(() => []),
        qualityApi.buscarFornecedoresQuality(chave.chave).catch(() => []),
        contasBancariasService.listarPorRede(redeId).catch(() => []),
      ]);

      // Movimentos por empresa em paralelo
      let atual = 0;
      const movsPorEmpresa = await Promise.all(empresasDaRede.map(async (emp) => {
        const filtros = { dataInicial, dataFinal, empresaCodigo: emp.empresa_codigo };
        const m = await qualityApi.buscarMovimentoConta(chave.chave, filtros).catch(() => []);
        atual++;
        setLoadingProgress({ atual, total: empresasDaRede.length, mensagem: `${emp.nome}: ${m?.length || 0} movimentos` });
        return (m || []).map(mv => ({
          ...mv,
          _empresaId: emp.id,
          _empresaNome: labelEmpresa(emp),
          _empresaCnpj: emp.cnpj,
          empresaCodigo: Number(emp.empresa_codigo),
        }));
      }));

      const todosMovs = movsPorEmpresa.flat();
      setMovimentos(todosMovs);
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
  }, [redeId, empresasDaRede, dataInicial, dataFinal]);

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

  // Contas aceitas nesta conciliacao (bancaria / aplicacao). Sem classif = default bancaria.
  const contasAceitas = useMemo(() => {
    const permitidas = new Map();
    contasClassificadas.forEach(c => permitidas.set(c.conta_codigo, c));
    return { map: permitidas };
  }, [contasClassificadas]);

  const contaEntraNaConciliacao = (contaCodigo) => {
    const classif = contasAceitas.map.get(Number(contaCodigo));
    if (!classif) return true;
    if (classif.ativo === false) return false;
    return contasBancariasService.TIPOS_PARA_CONCILIACAO.includes(classif.tipo);
  };

  // Enriquece + calcula saldo corrente por (empresa, conta)
  const movimentosEnriquecidos = useMemo(() => {
    const movs = movimentos.filter(m => contaEntraNaConciliacao(m.contaCodigo));
    const normalizados = movs.map(m => {
      const plano = mapaPlanoContas.get(m.planoContaGerencialCodigo);
      const conta = mapaContas.get(m.contaCodigo);
      const isCredito = m.tipo === 'Crédito' || m.tipo === 'Credito' || m.tipo === 'C';
      const pessoa = resolvePessoa(m, mapaClientesQ, mapaFornecedores);
      return {
        id: `${m._empresaId}-${m.codigo || m.movimentoContaCodigo}`,
        empresaId: m._empresaId,
        empresaNome: m._empresaNome,
        empresaCnpj: m._empresaCnpj,
        empresaCodigo: Number(m.empresaCodigo),
        data: m.dataMovimento,
        descricao: (m.descricao || '').trim() || '—',
        documento: m.documento || m.numeroDocumento || '',
        tipo: isCredito ? 'credito' : 'debito',
        valor: Math.abs(Number(m.valor || 0)),
        planoCodigo: m.planoContaGerencialCodigo,
        planoNome: plano?.planoContaGerencialNome || plano?.nome || plano?.descricao || '—',
        contaCodigo: Number(m.contaCodigo),
        contaNome: conta?.descricao || conta?.nome || conta?.contaDescricao || (m.contaCodigo ? `Conta #${m.contaCodigo}` : '—'),
        contraparte: pessoa.razao,
        pessoaTipo: pessoa.tipo,
        pessoaRazao: pessoa.razao,
        pessoaCnpj: sanitizarCnpj(pessoa.cnpj),
        pessoaCodigo: pessoa.codigo,
        saldoAnterior: m.saldoAnterior ?? m.saldoAnteriorConta ?? null,
        saldoPosterior: m.saldoPosterior ?? m.saldoApos ?? m.saldoAtual ?? null,
      };
    }).sort((a, b) =>
      (a.empresaNome || '').localeCompare(b.empresaNome || '')
      || (a.contaNome || '').localeCompare(b.contaNome || '')
      || (a.data || '').localeCompare(b.data || '')
    );

    const chave = (m) => `${m.empresaId}|${m.contaCodigo}`;
    const saldoCorrente = new Map();
    const saldoInicialPorChave = new Map();
    normalizados.forEach(m => {
      const k = chave(m);
      if (!saldoInicialPorChave.has(k)) {
        const inicial = m.saldoAnterior != null ? Number(m.saldoAnterior) : 0;
        saldoInicialPorChave.set(k, inicial);
        saldoCorrente.set(k, inicial);
      }
    });
    return normalizados.map(m => {
      const k = chave(m);
      const delta = m.tipo === 'credito' ? m.valor : -m.valor;
      const novoSaldo = m.saldoPosterior != null
        ? Number(m.saldoPosterior)
        : Number(saldoCorrente.get(k) || 0) + delta;
      saldoCorrente.set(k, novoSaldo);
      return { ...m, saldoAtual: novoSaldo };
    });
  }, [movimentos, mapaPlanoContas, mapaContas, mapaClientesQ, mapaFornecedores, contasAceitas]);

  // Contas excluidas (informativo)
  const contasExcluidas = useMemo(() => {
    return contasClassificadas.filter(c => c.ativo === false
      || !contasBancariasService.TIPOS_PARA_CONCILIACAO.includes(c.tipo));
  }, [contasClassificadas]);

  // Totais globais
  const totais = useMemo(() => {
    let entradas = 0, saidas = 0;
    movimentosEnriquecidos.forEach(m => {
      if (m.tipo === 'credito') entradas += m.valor;
      else saidas += m.valor;
    });
    return { entradas, saidas, saldo: entradas - saidas };
  }, [movimentosEnriquecidos]);

  // Arvore saldo por empresa > conta
  const treeSaldos = useMemo(() => {
    const empresas = new Map();
    movimentosEnriquecidos.forEach(m => {
      if (!empresas.has(m.empresaId)) {
        empresas.set(m.empresaId, {
          empresaId: m.empresaId,
          empresaNome: m.empresaNome,
          empresaCnpj: m.empresaCnpj,
          contas: new Map(),
        });
      }
      const emp = empresas.get(m.empresaId);
      if (!emp.contas.has(m.contaCodigo)) {
        emp.contas.set(m.contaCodigo, {
          contaCodigo: m.contaCodigo,
          contaNome: m.contaNome,
          saldoInicial: m.saldoAnterior != null ? Number(m.saldoAnterior) : 0,
          entradas: 0,
          saidas: 0,
          saldoAtual: 0,
        });
      }
      const c = emp.contas.get(m.contaCodigo);
      if (m.tipo === 'credito') c.entradas += m.valor;
      else c.saidas += m.valor;
      c.saldoAtual = m.saldoAtual;
    });
    return Array.from(empresas.values())
      .map(emp => {
        const contas = Array.from(emp.contas.values())
          .sort((a, b) => (a.contaNome || '').localeCompare(b.contaNome || ''));
        const totSaldoInicial = contas.reduce((s, c) => s + c.saldoInicial, 0);
        const totEntradas = contas.reduce((s, c) => s + c.entradas, 0);
        const totSaidas = contas.reduce((s, c) => s + c.saidas, 0);
        const totSaldoAtual = contas.reduce((s, c) => s + c.saldoAtual, 0);
        return {
          ...emp,
          contas,
          saldoInicial: totSaldoInicial,
          entradas: totEntradas,
          saidas: totSaidas,
          variacao: totEntradas - totSaidas,
          saldoAtual: totSaldoAtual,
        };
      })
      .sort((a, b) => (a.empresaNome || '').localeCompare(b.empresaNome || ''));
  }, [movimentosEnriquecidos]);

  // Filtros de busca/tipo
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return movimentosEnriquecidos.filter(m => {
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
      if (!q) return true;
      return m.descricao.toLowerCase().includes(q)
        || m.planoNome.toLowerCase().includes(q)
        || m.contaNome.toLowerCase().includes(q)
        || m.empresaNome.toLowerCase().includes(q)
        || m.contraparte.toLowerCase().includes(q)
        || String(m.documento).toLowerCase().includes(q);
    });
  }, [movimentosEnriquecidos, busca, filtroTipo]);

  // Arvore movimentos por empresa > conta > mes > dia > lancamentos
  const treeMovimentos = useMemo(() => {
    const empresas = new Map();
    filtrados.forEach(m => {
      if (!empresas.has(m.empresaId)) {
        empresas.set(m.empresaId, {
          empresaId: m.empresaId,
          empresaNome: m.empresaNome,
          contas: new Map(),
        });
      }
      const emp = empresas.get(m.empresaId);
      if (!emp.contas.has(m.contaCodigo)) {
        emp.contas.set(m.contaCodigo, {
          contaCodigo: m.contaCodigo,
          contaNome: m.contaNome,
          entradas: 0,
          saidas: 0,
          qtdLancs: 0,
          meses: new Map(),
        });
      }
      const c = emp.contas.get(m.contaCodigo);
      if (m.tipo === 'credito') c.entradas += m.valor;
      else c.saidas += m.valor;
      c.qtdLancs++;

      const dataStr = String(m.data || '');
      const mesKey = dataStr.slice(0, 7) || 'sem-data';
      const diaKey = dataStr || 'sem-data';

      if (!c.meses.has(mesKey)) {
        c.meses.set(mesKey, { mesKey, entradas: 0, saidas: 0, qtdLancs: 0, dias: new Map() });
      }
      const mes = c.meses.get(mesKey);
      if (m.tipo === 'credito') mes.entradas += m.valor;
      else mes.saidas += m.valor;
      mes.qtdLancs++;

      if (!mes.dias.has(diaKey)) {
        mes.dias.set(diaKey, { diaKey, entradas: 0, saidas: 0, lancamentos: [] });
      }
      const dia = mes.dias.get(diaKey);
      if (m.tipo === 'credito') dia.entradas += m.valor;
      else dia.saidas += m.valor;
      dia.lancamentos.push(m);
    });
    return Array.from(empresas.values())
      .map(emp => {
        const contas = Array.from(emp.contas.values())
          .map(c => ({
            ...c,
            meses: Array.from(c.meses.values())
              .map(mes => ({
                ...mes,
                variacao: mes.entradas - mes.saidas,
                dias: Array.from(mes.dias.values())
                  .sort((a, b) => a.diaKey.localeCompare(b.diaKey))
                  .map(d => ({ ...d, variacao: d.entradas - d.saidas })),
              }))
              .sort((a, b) => a.mesKey.localeCompare(b.mesKey)),
            variacao: c.entradas - c.saidas,
          }))
          .sort((a, b) => (a.contaNome || '').localeCompare(b.contaNome || ''));
        const totEntradas = contas.reduce((s, c) => s + c.entradas, 0);
        const totSaidas = contas.reduce((s, c) => s + c.saidas, 0);
        return {
          ...emp,
          contas,
          entradas: totEntradas,
          saidas: totSaidas,
          variacao: totEntradas - totSaidas,
          qtdLancs: contas.reduce((s, c) => s + c.qtdLancs, 0),
        };
      })
      .sort((a, b) => (a.empresaNome || '').localeCompare(b.empresaNome || ''));
  }, [filtrados]);

  // Auto-expande empresas na primeira carga
  useEffect(() => {
    if (!carregado || treeSaldos.length === 0) return;
    setSaldoEmpresasExpandidas(new Set(treeSaldos.map(e => e.empresaId)));
    setMovEmpresasExpandidas(new Set(treeSaldos.map(e => e.empresaId)));
  }, [carregado, treeSaldos]);

  const toggleSaldoEmpresa = (id) => {
    setSaldoEmpresasExpandidas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleMovEmpresa = (id) => {
    setMovEmpresasExpandidas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleMovConta = (key) => {
    setMovContasExpandidas(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const toggleMovMes = (key) => {
    setMovMesesExpandidos(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const toggleMovDia = (key) => {
    setMovDiasExpandidos(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }

  const redeAtual = redeId ? chavesApi.find(ch => ch.id === redeId) : null;

  return (
    <div>
      <PageHeader title="Conciliacao Bancaria" description="Movimentacoes das contas bancarias de toda a rede, organizadas em arvore Empresa > Conta > Mes > Dia > Lancamentos" />

      {/* Seletor rede + periodo */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_160px_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Rede</label>
            <select value={redeId} onChange={(e) => setRedeId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Selecione uma rede...</option>
              {chavesApi.map(ch => {
                const qtd = clientes.filter(c => c.chave_api_id === ch.id).length;
                return (
                  <option key={ch.id} value={ch.id}>{labelRede(ch.nome, ch.id)} · {qtd} empresa{qtd === 1 ? '' : 's'}</option>
                );
              })}
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
          <button onClick={carregar} disabled={!redeId || loadingDados}
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

      {!redeId ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Landmark className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Selecione a rede e o periodo</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Aparecerao lancamentos de todas as empresas da rede, nas contas marcadas como <strong>bancaria</strong> ou <strong>aplicacao</strong> em Cadastros &gt; Clientes.
          </p>
        </div>
      ) : loadingDados ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <Loader2 className="h-7 w-7 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800 mb-1">{loadingProgress.mensagem || 'Carregando...'}</p>
          <p className="text-[11px] text-gray-400">{loadingProgress.atual} de {loadingProgress.total}</p>
        </div>
      ) : !carregado ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Calendar className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Clique em "Carregar" para buscar os movimentos</p>
        </div>
      ) : movimentosEnriquecidos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Nenhum movimento encontrado nas contas bancarias no periodo.</p>
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

          {contasExcluidas.length > 0 && (
            <div className="mb-4 rounded-lg bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-800">
                {contasExcluidas.length} conta{contasExcluidas.length === 1 ? '' : 's'} oculta{contasExcluidas.length === 1 ? '' : 's'} desta conciliacao (caixa / outras / inativas).
                Ajuste a classificacao em <strong>Cadastros &gt; Clientes</strong>.
              </p>
            </div>
          )}

          {/* Saldo por conta — arvore empresa > conta */}
          {treeSaldos.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-gray-800">Composicao do saldo</h3>
                <span className="text-[11px] text-gray-400">· {redeAtual ? labelRede(redeAtual.nome, redeAtual.id) : 'rede'} · {treeSaldos.length} empresas · inicial + movimentos = atual</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-2.5">Empresa / Conta bancaria</th>
                      <th className="px-4 py-2.5 text-right">Saldo inicial</th>
                      <th className="px-4 py-2.5 text-right">Entradas</th>
                      <th className="px-4 py-2.5 text-right">Saidas</th>
                      <th className="px-4 py-2.5 text-right">Variacao</th>
                      <th className="px-4 py-2.5 text-right">Saldo atual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {treeSaldos.map(emp => {
                      const expandida = saldoEmpresasExpandidas.has(emp.empresaId);
                      return (
                        <React.Fragment key={emp.empresaId}>
                          <tr onClick={() => toggleSaldoEmpresa(emp.empresaId)}
                            className={`cursor-pointer transition-colors ${expandida ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <motion.div animate={{ rotate: expandida ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                                </motion.div>
                                <Building2 className="h-3.5 w-3.5 text-blue-500" />
                                <span className="text-[12.5px] font-semibold text-gray-900">{emp.empresaNome}</span>
                                <span className="text-[10px] text-gray-400">{emp.contas.length} conta{emp.contas.length === 1 ? '' : 's'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-[12px] text-gray-700 tabular-nums">{formatCurrency(emp.saldoInicial)}</td>
                            <td className="px-4 py-2 text-right font-mono text-[12px] text-emerald-600 tabular-nums">+{formatCurrency(emp.entradas)}</td>
                            <td className="px-4 py-2 text-right font-mono text-[12px] text-red-600 tabular-nums">-{formatCurrency(emp.saidas)}</td>
                            <td className={`px-4 py-2 text-right font-mono text-[12px] tabular-nums font-semibold ${
                              Math.abs(emp.variacao) < 0.01 ? 'text-gray-500' : emp.variacao > 0 ? 'text-emerald-700' : 'text-red-700'
                            }`}>
                              {emp.variacao > 0 ? '+' : ''}{formatCurrency(emp.variacao)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(emp.saldoAtual)}</td>
                          </tr>
                          {expandida && emp.contas.map(c => {
                            const variacao = c.entradas - c.saidas;
                            return (
                              <tr key={`${emp.empresaId}-${c.contaCodigo}`} className="bg-gray-50/30 hover:bg-gray-50/60">
                                <td className="px-4 py-1.5" style={{ paddingLeft: 46 }}>
                                  <span className="text-[11.5px] text-gray-700">{c.contaNome}</span>
                                </td>
                                <td className="px-4 py-1.5 text-right font-mono text-[11px] text-gray-600 tabular-nums">{formatCurrency(c.saldoInicial)}</td>
                                <td className="px-4 py-1.5 text-right font-mono text-[11px] text-emerald-600 tabular-nums">+{formatCurrency(c.entradas)}</td>
                                <td className="px-4 py-1.5 text-right font-mono text-[11px] text-red-600 tabular-nums">-{formatCurrency(c.saidas)}</td>
                                <td className={`px-4 py-1.5 text-right font-mono text-[11px] tabular-nums ${
                                  Math.abs(variacao) < 0.01 ? 'text-gray-500' : variacao > 0 ? 'text-emerald-700' : 'text-red-700'
                                }`}>
                                  {variacao > 0 ? '+' : ''}{formatCurrency(variacao)}
                                </td>
                                <td className="px-4 py-1.5 text-right font-mono text-[12px] text-gray-800 tabular-nums">{formatCurrency(c.saldoAtual)}</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50/60 border-t border-gray-200">
                    <tr className="text-[12px] font-semibold">
                      <td className="px-4 py-3 text-gray-700">Consolidado da rede</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-800">{formatCurrency(treeSaldos.reduce((s, e) => s + e.saldoInicial, 0))}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">+{formatCurrency(totais.entradas)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">-{formatCurrency(totais.saidas)}</td>
                      <td className={`px-4 py-3 text-right font-mono tabular-nums ${totais.saldo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {totais.saldo >= 0 ? '+' : ''}{formatCurrency(totais.saldo)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900">{formatCurrency(treeSaldos.reduce((s, e) => s + e.saldoAtual, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Filtros de busca */}
          <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por descricao, empresa, conta, pessoa, documento..."
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
                  }`}>{opt.label}</button>
              ))}
            </div>
          </div>

          {/* Movimentos do periodo — arvore empresa > conta > mes > dia > lancamentos */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-800">Movimentos do periodo</h3>
              <span className="text-[11px] text-gray-400">· {filtrados.length} de {movimentosEnriquecidos.length} lancamentos</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Empresa / Conta / Mes / Dia</th>
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
                  {treeMovimentos.map(emp => {
                    const empAberta = movEmpresasExpandidas.has(emp.empresaId);
                    return (
                      <React.Fragment key={emp.empresaId}>
                        <tr onClick={() => toggleMovEmpresa(emp.empresaId)}
                          className={`cursor-pointer transition-colors ${empAberta ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}>
                          <td className="px-4 py-2" colSpan={3}>
                            <div className="flex items-center gap-2">
                              <motion.div animate={{ rotate: empAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                              </motion.div>
                              <Building2 className="h-3.5 w-3.5 text-blue-500" />
                              <span className="text-[12.5px] font-semibold text-gray-900">{emp.empresaNome}</span>
                              <span className="text-[10px] text-gray-400">{emp.contas.length} conta{emp.contas.length === 1 ? '' : 's'} · {emp.qtdLancs} lanc.</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] text-emerald-600 tabular-nums font-semibold">+{formatCurrency(emp.entradas)}</td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] text-red-600 tabular-nums font-semibold">-{formatCurrency(emp.saidas)}</td>
                          <td className={`px-4 py-2 text-right font-mono text-[12.5px] tabular-nums font-bold ${emp.variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {emp.variacao >= 0 ? '+' : ''}{formatCurrency(emp.variacao)}
                          </td>
                        </tr>
                        {empAberta && emp.contas.map(c => {
                          const contaKey = `${emp.empresaId}-${c.contaCodigo}`;
                          const contaAberta = movContasExpandidas.has(contaKey);
                          const variacao = c.entradas - c.saidas;
                          return (
                            <React.Fragment key={contaKey}>
                              <tr onClick={() => toggleMovConta(contaKey)}
                                className={`cursor-pointer transition-colors ${contaAberta ? 'bg-gray-100/60' : 'hover:bg-gray-50/60 bg-gray-50/30'}`}>
                                <td className="px-4 py-1.5" colSpan={3} style={{ paddingLeft: 40 }}>
                                  <div className="flex items-center gap-2">
                                    <motion.div animate={{ rotate: contaAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                      <ChevronRight className="h-3 w-3 text-gray-400" />
                                    </motion.div>
                                    <Landmark className="h-3 w-3 text-gray-500" />
                                    <span className="text-[11.5px] font-medium text-gray-800">{c.contaNome}</span>
                                    <span className="text-[10px] text-gray-400">{c.qtdLancs} lanc. · {c.meses.length} m{c.meses.length === 1 ? 'ês' : 'eses'}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-1.5 text-right font-mono text-[11px] text-emerald-600 tabular-nums">+{formatCurrency(c.entradas)}</td>
                                <td className="px-4 py-1.5 text-right font-mono text-[11px] text-red-600 tabular-nums">-{formatCurrency(c.saidas)}</td>
                                <td className={`px-4 py-1.5 text-right font-mono text-[11px] tabular-nums font-semibold ${variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {variacao >= 0 ? '+' : ''}{formatCurrency(variacao)}
                                </td>
                              </tr>
                              {contaAberta && c.meses.map(mes => {
                                const mesKey = `${contaKey}-${mes.mesKey}`;
                                const mesAberto = movMesesExpandidos.has(mesKey);
                                return (
                                  <React.Fragment key={mesKey}>
                                    <tr onClick={() => toggleMovMes(mesKey)}
                                      className={`cursor-pointer transition-colors ${mesAberto ? 'bg-blue-50/20' : 'hover:bg-gray-50/40'}`}>
                                      <td className="px-4 py-1" colSpan={3} style={{ paddingLeft: 72 }}>
                                        <div className="flex items-center gap-2">
                                          <motion.div animate={{ rotate: mesAberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                            <ChevronRight className="h-3 w-3 text-gray-400" />
                                          </motion.div>
                                          <Calendar className="h-3 w-3 text-indigo-400" />
                                          <span className="text-[11px] font-medium text-gray-700">{formatMesAno(mes.mesKey)}</span>
                                          <span className="text-[10px] text-gray-400">{mes.qtdLancs} lanc. · {mes.dias.length} dia{mes.dias.length === 1 ? '' : 's'}</span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-1 text-right font-mono text-[11px] text-emerald-600 tabular-nums">+{formatCurrency(mes.entradas)}</td>
                                      <td className="px-4 py-1 text-right font-mono text-[11px] text-red-600 tabular-nums">-{formatCurrency(mes.saidas)}</td>
                                      <td className={`px-4 py-1 text-right font-mono text-[11px] tabular-nums font-medium ${mes.variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {mes.variacao >= 0 ? '+' : ''}{formatCurrency(mes.variacao)}
                                      </td>
                                    </tr>
                                    {mesAberto && mes.dias.map(dia => {
                                      const diaKey = `${mesKey}-${dia.diaKey}`;
                                      const diaAberto = movDiasExpandidos.has(diaKey);
                                      return (
                                        <React.Fragment key={diaKey}>
                                          <tr onClick={() => toggleMovDia(diaKey)}
                                            className={`cursor-pointer transition-colors ${diaAberto ? 'bg-blue-50/10' : 'hover:bg-gray-50/30'}`}>
                                            <td className="px-4 py-1" colSpan={3} style={{ paddingLeft: 104 }}>
                                              <div className="flex items-center gap-2">
                                                <motion.div animate={{ rotate: diaAberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                                  <ChevronRight className="h-3 w-3 text-gray-400" />
                                                </motion.div>
                                                <span className="text-[10.5px] font-mono tabular-nums text-gray-600">{formatDataBR(dia.diaKey)}</span>
                                                <span className="text-[10px] text-gray-400">{dia.lancamentos.length} lanc.</span>
                                              </div>
                                            </td>
                                            <td className="px-4 py-1 text-right font-mono text-[10.5px] text-emerald-600 tabular-nums">+{formatCurrency(dia.entradas)}</td>
                                            <td className="px-4 py-1 text-right font-mono text-[10.5px] text-red-600 tabular-nums">-{formatCurrency(dia.saidas)}</td>
                                            <td className={`px-4 py-1 text-right font-mono text-[10.5px] tabular-nums ${dia.variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                              {dia.variacao >= 0 ? '+' : ''}{formatCurrency(dia.variacao)}
                                            </td>
                                          </tr>
                                          {diaAberto && dia.lancamentos.map(m => (
                                            <tr key={m.id} onClick={() => setDetalheMov(m)}
                                              className="hover:bg-blue-50/40 cursor-pointer transition-colors">
                                              <td className="px-4 py-1.5 text-[11px] text-gray-800 max-w-[360px] truncate" style={{ paddingLeft: 136 }} colSpan={2}>{m.descricao}</td>
                                              <td className="px-4 py-1.5 text-[11px] text-gray-500 font-mono">{m.documento || '—'}</td>
                                              <td className="px-4 py-1.5 text-right font-mono text-[12px] tabular-nums">
                                                {m.tipo === 'credito' ? (
                                                  <span className="text-emerald-600">{formatCurrency(m.valor)}</span>
                                                ) : (<span className="text-gray-300">—</span>)}
                                              </td>
                                              <td className="px-4 py-1.5 text-right font-mono text-[12px] tabular-nums">
                                                {m.tipo === 'debito' ? (
                                                  <span className="text-red-600">{formatCurrency(m.valor)}</span>
                                                ) : (<span className="text-gray-300">—</span>)}
                                              </td>
                                              <td className="px-4 py-1.5 text-right font-mono text-[12px] text-gray-800 tabular-nums">{formatCurrency(m.saldoAtual)}</td>
                                            </tr>
                                          ))}
                                        </React.Fragment>
                                      );
                                    })}
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
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
          <DetalheLinha label="Empresa" valor={mov.empresaNome || '—'} hint={mov.empresaCnpj || null} />
          <DetalheLinha label="Conta bancaria" valor={mov.contaNome}
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
