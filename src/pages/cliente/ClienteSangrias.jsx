import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Coins, Loader2, AlertCircle, Calendar, CheckCircle2,
  TrendingUp, TrendingDown, RefreshCw, Lock, History, Save,
  Building2,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import { useClienteSession } from '../../hooks/useAuth';
import * as mapService from '../../services/mapeamentoService';
import * as qualityApi from '../../services/qualityApiService';
import * as sangriasService from '../../services/clienteSangriasService';
import { formatCurrency } from '../../utils/format';

// Usa componentes locais (nao UTC) para evitar que, a noite no Brasil,
// o "hoje UTC" ja seja o dia seguinte do "hoje local" e libere o dia atual.
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function hojeStr() { return toLocalDateStr(new Date()); }
function ontemStr() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return toLocalDateStr(d);
}
function formatDataBR(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

export default function ClienteSangrias() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const usuario = session?.usuario;

  const [data, setData] = useState(ontemStr());
  const [fechamento, setFechamento] = useState(null); // row do supabase se ja existe
  const [registros, setRegistros] = useState([]); // [{ funcionarioCodigo, nome, dinheiroApurado, apresentado (input) }]
  const [responsavel, setResponsavel] = useState(usuario?.nome || '');
  const [observacoes, setObservacoes] = useState('');
  const [loadingDados, setLoadingDados] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const [historico, setHistorico] = useState([]);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [cienciaConfirmada, setCienciaConfirmada] = useState(false);
  const [modalConfirmacao, setModalConfirmacao] = useState(false);

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  // Reset local state ao trocar de empresa e recarrega historico
  useEffect(() => {
    if (!cliente?.id) return;
    setFechamento(null);
    setRegistros([]);
    setObservacoes('');
    setResponsavel(usuario?.nome || '');
    setError(null);
    setCienciaConfirmada(false);
    (async () => {
      try {
        const h = await sangriasService.listarHistorico(cliente.id);
        setHistorico(h);
      } catch (_) { setHistorico([]); }
    })();
  }, [cliente?.id, usuario?.nome]);

  const dataInvalida = useMemo(() => data && data >= hojeStr(), [data]);

  // Verifica se existe fechamento + carrega vendas quando data muda
  const carregarDia = useCallback(async () => {
    if (!cliente || !data) return;
    if (data >= hojeStr()) {
      setError('Data invalida. Somente dias anteriores ao dia de hoje podem ser conciliados.');
      setRegistros([]);
      setFechamento(null);
      return;
    }
    setLoadingDados(true);
    setError(null);
    setRegistros([]);
    setFechamento(null);
    try {
      // 1. Consulta fechamento ja salvo
      const existente = await sangriasService.buscarFechamento(cliente.id, data);
      if (existente) {
        setFechamento(existente);
        setRegistros(existente.registros || []);
        setResponsavel(existente.confirmado_por || responsavel);
        setObservacoes(existente.observacoes || '');
        return;
      }

      // 2. Sem fechamento, busca dados da API (se for Webposto)
      if (!cliente.usa_webposto || !cliente.chave_api_id || !cliente.empresa_codigo) {
        throw new Error('Esta funcionalidade requer integracao Webposto configurada');
      }
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API nao encontrada');

      const filtros = { dataInicial: data, dataFinal: data, empresaCodigo: cliente.empresa_codigo };
      const [vendas, formasPag, funcs] = await Promise.all([
        qualityApi.buscarVendas(chave.chave, filtros),
        qualityApi.buscarVendaFormaPagamento(chave.chave, filtros),
        qualityApi.buscarFuncionarios(chave.chave),
      ]);

      // Mapa funcionario
      const mapaFunc = new Map();
      (funcs || []).forEach(f => mapaFunc.set(f.funcionarioCodigo || f.codigo, f.nome));

      // Por venda -> funcionario
      const vendaParaFunc = new Map();
      (vendas || []).forEach(v => {
        if (v.cancelada === 'S') return;
        vendaParaFunc.set(v.vendaCodigo || v.codigo, v.funcionarioCodigo);
      });

      // Agrega dinheiro apurado por funcionario
      const porFunc = new Map();
      (formasPag || []).forEach(fp => {
        const nome = (fp.nomeFormaPagamento || '').toUpperCase();
        if (!/DINHEIRO|ESPECIE/.test(nome)) return;
        const fcod = vendaParaFunc.get(fp.vendaCodigo);
        if (!fcod) return;
        porFunc.set(fcod, (porFunc.get(fcod) || 0) + Number(fp.valorPagamento || 0));
      });

      // Monta registros iniciais
      const lista = Array.from(porFunc.entries())
        .map(([fcod, apurado]) => ({
          funcionarioCodigo: fcod,
          nome: mapaFunc.get(fcod) || `Funcionario #${fcod}`,
          dinheiroApurado: Number(apurado.toFixed(2)),
          dinheiroApresentado: '',
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome));

      setRegistros(lista);
      if (lista.length === 0) {
        setError('Nenhuma venda em dinheiro encontrada para esta data.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [cliente, data]);

  useEffect(() => { carregarDia(); }, [carregarDia]);

  const atualizarApresentado = (fcod, valor) => {
    setRegistros(prev => prev.map(r =>
      r.funcionarioCodigo === fcod ? { ...r, dinheiroApresentado: valor } : r
    ));
  };

  const totais = useMemo(() => {
    let apurado = 0, apresentado = 0;
    registros.forEach(r => {
      apurado += Number(r.dinheiroApurado || 0);
      apresentado += Number(r.dinheiroApresentado || 0);
    });
    return { apurado, apresentado, diferenca: apresentado - apurado };
  }, [registros]);

  const todosPreenchidos = registros.length > 0 && registros.every(r =>
    r.dinheiroApresentado != null && String(r.dinheiroApresentado).trim() !== ''
  );

  const travado = !!fechamento;

  const abrirConfirmacao = () => {
    if (!cliente || travado) return;
    if (data >= hojeStr()) {
      showToast('error', 'Nao e permitido salvar sangrias do dia de hoje ou futuros.');
      return;
    }
    if (!responsavel.trim()) {
      showToast('error', 'Informe o nome do responsavel pela contagem.');
      return;
    }
    if (!cienciaConfirmada) {
      showToast('error', 'Confirme a ciencia dos valores antes de salvar.');
      return;
    }
    setModalConfirmacao(true);
  };

  const confirmarSalvamento = async () => {
    if (!cliente || travado) return;
    try {
      setSalvando(true);
      const regsParaSalvar = registros.map(r => ({
        funcionarioCodigo: r.funcionarioCodigo,
        nome: r.nome,
        dinheiroApurado: Number(r.dinheiroApurado || 0),
        dinheiroApresentado: Number(r.dinheiroApresentado || 0),
        diferenca: Number(r.dinheiroApresentado || 0) - Number(r.dinheiroApurado || 0),
      }));
      const row = await sangriasService.salvarFechamento({
        cliente_id: cliente.id,
        empresa_codigo: cliente.empresa_codigo,
        data,
        registros: regsParaSalvar,
        confirmado_por: responsavel.trim(),
        observacoes: observacoes.trim() || null,
      });
      setFechamento(row);
      setRegistros(row.registros);
      setModalConfirmacao(false);
      showToast('success', 'Fechamento confirmado e salvo.');
      // Recarrega historico
      const h = await sangriasService.listarHistorico(cliente.id);
      setHistorico(h);
    } catch (err) {
      showToast('error', 'Erro ao salvar: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  if (!cliente) {
    return (
      <div>
        <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
        <PageHeader title="Sangrias - Contagem de Caixa" description="Confira o dinheiro apurado e registre o apresentado por funcionario" />
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-900 mb-1">Sessao sem cliente vinculado</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            O usuario logado nao tem um cliente associado. Contate o administrador.
          </p>
        </div>
      </div>
    );
  }

  if (!cliente.usa_webposto || !cliente.chave_api_id || !cliente.empresa_codigo) {
    return (
      <div>
        <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
        <PageHeader title="Sangrias - Contagem de Caixa" description={cliente.nome} />
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-900 mb-1">Integracao Webposto nao configurada</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Este cliente ainda nao tem <strong>Webposto ativo</strong>, chave API ou codigo da empresa cadastrados. Contate o administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Sangrias - Contagem de Caixa" description="Confira o dinheiro apurado no sistema e registre o apresentado no fechamento de cada funcionario">
        <button onClick={() => setMostrarHistorico(!mostrarHistorico)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <History className="h-4 w-4" /> {mostrarHistorico ? 'Ocultar historico' : 'Ver historico'}
        </button>
      </PageHeader>

      {/* Empresa ativa */}
      <div className="mb-4 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 p-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Empresa selecionada</p>
          <p className="text-sm font-semibold text-gray-900 truncate">{cliente.nome}</p>
          <div className="flex items-center gap-3 mt-0.5">
            {cliente.cnpj && <p className="text-[11px] text-gray-500 font-mono">{cliente.cnpj}</p>}
            {cliente.empresa_codigo && <p className="text-[11px] text-gray-400">cod {cliente.empresa_codigo}</p>}
          </div>
        </div>
        {(session?.clientesRede?.length || 0) > 1 && usuario?.permissoes?.includes('trocar_empresa') && (
          <p className="text-[11px] text-blue-600 italic hidden sm:block">
            Troque no seletor do topo
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Data da conciliacao</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)}
              max={ontemStr()}
              disabled={loadingDados}
              className={`w-full h-10 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 disabled:opacity-50 ${
                dataInvalida
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-100 bg-red-50/40 text-red-700'
                  : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'
              }`} />
            {dataInvalida && (
              <p className="mt-1 text-[11px] text-red-600">Somente dias anteriores sao permitidos.</p>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Responsavel pela contagem</label>
            <input type="text" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}
              disabled={travado}
              placeholder="Nome completo"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-600" />
          </div>
          <button onClick={carregarDia} disabled={loadingDados || !cliente}
            className="flex items-center gap-2 h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
            {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Recarregar
          </button>
        </div>
      </div>

      {/* Aviso de fechamento */}
      {travado && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-start gap-3">
          <Lock className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Fechamento confirmado</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Este dia foi fechado em <strong>{new Date(fechamento.confirmado_em).toLocaleString('pt-BR')}</strong> por <strong>{fechamento.confirmado_por || '—'}</strong>.
              Os valores nao podem mais ser alterados.
            </p>
          </div>
        </div>
      )}

      {error && !travado && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">{error}</p>
        </div>
      )}

      {loadingDados ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <Loader2 className="h-7 w-7 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800">Buscando vendas e apuracao de {formatDataBR(data)}...</p>
        </div>
      ) : registros.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Coins className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Sem registros para {formatDataBR(data)}</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {error || 'Nao foram encontradas vendas em dinheiro neste dia.'}
          </p>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <Kpi label="Total apurado" valor={formatCurrency(totais.apurado)} icon={TrendingUp} color="emerald" />
            <Kpi label="Total apresentado" valor={formatCurrency(totais.apresentado)} icon={CheckCircle2} color="blue" />
            <Kpi label="Diferenca"
              valor={formatCurrency(totais.diferenca)}
              icon={Math.abs(totais.diferenca) < 0.01 ? CheckCircle2 : totais.diferenca > 0 ? TrendingUp : TrendingDown}
              color={Math.abs(totais.diferenca) < 0.01 ? 'emerald' : totais.diferenca > 0 ? 'amber' : 'red'} />
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-800">Fechamento de {formatDataBR(data)}</h3>
              <span className="text-[11px] text-gray-400">· {registros.length} funcionarios</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Funcionario</th>
                    <th className="px-4 py-3 text-right">Dinheiro apurado</th>
                    <th className="px-4 py-3 text-right">Apresentado (contado)</th>
                    <th className="px-4 py-3 text-right">Diferenca</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {registros.map(r => {
                    const apr = Number(r.dinheiroApresentado || 0);
                    const temApr = r.dinheiroApresentado != null && String(r.dinheiroApresentado).trim() !== '';
                    const diff = apr - Number(r.dinheiroApurado || 0);
                    const conciliado = temApr && Math.abs(diff) < 0.01;
                    return (
                      <tr key={r.funcionarioCodigo} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0">
                              {(r.nome || '?').charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{r.nome}</p>
                              <p className="text-[10px] text-gray-400 font-mono">#{r.funcionarioCodigo}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-gray-900 tabular-nums">
                          {formatCurrency(r.dinheiroApurado)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" step="0.01" inputMode="decimal"
                            value={r.dinheiroApresentado ?? ''}
                            onChange={(e) => atualizarApresentado(r.funcionarioCodigo, e.target.value)}
                            disabled={travado}
                            placeholder="0,00"
                            className="w-32 h-9 rounded-lg border border-gray-200 px-3 text-sm font-mono text-right focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-600" />
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-sm tabular-nums font-semibold ${
                          !temApr ? 'text-gray-300'
                            : conciliado ? 'text-emerald-600'
                            : diff > 0 ? 'text-amber-600'
                            : 'text-red-600'
                        }`}>
                          {temApr ? formatCurrency(diff) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!temApr ? (
                            <span className="text-[10px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">Pendente</span>
                          ) : conciliado ? (
                            <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-2.5 w-2.5" /> OK
                            </span>
                          ) : diff > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
                              <TrendingUp className="h-2.5 w-2.5" /> Sobra
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-red-50 text-red-700 border border-red-200">
                              <TrendingDown className="h-2.5 w-2.5" /> Falta
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50/60 border-t border-gray-200">
                  <tr className="text-sm font-semibold">
                    <td className="px-4 py-3 text-gray-700">Totais</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900 tabular-nums">{formatCurrency(totais.apurado)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900 tabular-nums">{formatCurrency(totais.apresentado)}</td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${
                      Math.abs(totais.diferenca) < 0.01 ? 'text-emerald-600'
                        : totais.diferenca > 0 ? 'text-amber-600'
                        : 'text-red-600'
                    }`}>{formatCurrency(totais.diferenca)}</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Observacoes + Ciencia + Botão confirmar */}
          {!travado && (
            <div className="mt-4 bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Observacoes (opcional)</label>
                <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Alguma nota sobre o fechamento deste dia"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>

              {/* Ciencia */}
              <label className={`flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all ${
                cienciaConfirmada ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 bg-gray-50/40 hover:border-gray-300'
              }`}>
                <input type="checkbox" checked={cienciaConfirmada}
                  onChange={(e) => setCienciaConfirmada(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-400" />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${cienciaConfirmada ? 'text-emerald-900' : 'text-gray-800'}`}>
                    Declaro que conferi pessoalmente os valores apresentados
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Confirmo que o dinheiro apresentado por cada funcionario foi contado fisicamente
                    e que todos os valores digitados estao corretos. Apos salvar, os dados ficam travados.
                  </p>
                </div>
              </label>

              {/* Status + Botão */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-500">
                  {todosPreenchidos ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Todos os funcionarios preenchidos
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-600">
                      <AlertCircle className="h-3.5 w-3.5" /> Funcionarios em branco serao salvos como R$ 0,00
                    </span>
                  )}
                </div>
                <button onClick={abrirConfirmacao}
                  disabled={salvando || !responsavel.trim() || !cienciaConfirmada}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!cienciaConfirmada ? 'Marque a declaracao de ciencia para habilitar' : undefined}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Confirmar e salvar
                </button>
              </div>
            </div>
          )}

          {travado && fechamento?.observacoes && (
            <div className="mt-4 bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Observacoes</p>
              <p className="text-sm text-gray-700">{fechamento.observacoes}</p>
            </div>
          )}
        </>
      )}

      {/* Historico */}
      {mostrarHistorico && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <History className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Historico de fechamentos</h3>
            <span className="text-[11px] text-gray-400">· {historico.length} registros</span>
          </div>
          {historico.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-gray-500">Nenhum fechamento registrado ainda.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {historico.map(h => {
                const conciliado = Math.abs(Number(h.total_diferenca || 0)) < 0.01;
                return (
                  <button key={h.id} onClick={() => setData(h.data)}
                    className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50/60 transition-colors text-left">
                    <Calendar className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{formatDataBR(h.data)}</p>
                      <p className="text-[11px] text-gray-400">
                        Confirmado em {new Date(h.confirmado_em).toLocaleString('pt-BR')} por {h.confirmado_por || '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Apresentado</p>
                      <p className="text-sm font-mono text-gray-900 tabular-nums">{formatCurrency(h.total_apresentado)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Diferenca</p>
                      <p className={`text-sm font-mono font-semibold tabular-nums ${
                        conciliado ? 'text-emerald-600'
                          : Number(h.total_diferenca) > 0 ? 'text-amber-600'
                          : 'text-red-600'
                      }`}>{formatCurrency(h.total_diferenca)}</p>
                    </div>
                    <Lock className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmacao */}
      <Modal open={modalConfirmacao} onClose={() => !salvando && setModalConfirmacao(false)}
        title="Confirmar fechamento de sangria" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Revise os dados antes de confirmar. Apos salvar, o fechamento fica travado e os valores nao podem mais ser alterados.
          </p>

          <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Empresa</span>
              <span className="font-medium text-gray-900 text-right truncate max-w-[60%]">{cliente?.nome}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Data</span>
              <span className="font-medium text-gray-900">{formatDataBR(data)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Responsavel</span>
              <span className="font-medium text-gray-900 text-right truncate max-w-[60%]">{responsavel || '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Funcionarios</span>
              <span className="font-medium text-gray-900">{registros.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Apurado</p>
              <p className="text-sm font-mono font-semibold text-gray-900 tabular-nums mt-0.5">{formatCurrency(totais.apurado)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Apresentado</p>
              <p className="text-sm font-mono font-semibold text-gray-900 tabular-nums mt-0.5">{formatCurrency(totais.apresentado)}</p>
            </div>
            <div className={`rounded-lg border p-3 ${
              Math.abs(totais.diferenca) < 0.01 ? 'border-emerald-200 bg-emerald-50/40'
                : totais.diferenca > 0 ? 'border-amber-200 bg-amber-50/40'
                : 'border-red-200 bg-red-50/40'
            }`}>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Diferenca</p>
              <p className={`text-sm font-mono font-semibold tabular-nums mt-0.5 ${
                Math.abs(totais.diferenca) < 0.01 ? 'text-emerald-700'
                  : totais.diferenca > 0 ? 'text-amber-700'
                  : 'text-red-700'
              }`}>{formatCurrency(totais.diferenca)}</p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800">
              Declaracao de ciencia confirmada. Esta acao nao pode ser desfeita.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => setModalConfirmacao(false)} disabled={salvando}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">
              Revisar novamente
            </button>
            <button onClick={confirmarSalvamento} disabled={salvando}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Sim, confirmar e salvar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Kpi({ label, valor, icon: Icon, color }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    red:     'bg-red-50 text-red-600',
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
      <p className="text-lg font-bold text-gray-900 tabular-nums">{valor}</p>
    </motion.div>
  );
}
