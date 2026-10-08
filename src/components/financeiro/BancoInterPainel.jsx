// Banco Inter — conta da PRÓPRIA CCI (aba do Financeiro). Não aparece para clientes.
// Saldo + extrato (cópia local sincronizada pela Edge Function `inter-api`) e a
// configuração da integração (client id/secret + certificado .crt/.key).

import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Landmark, RefreshCw, Settings, Loader2, AlertTriangle, CheckCircle2,
  ArrowDownLeft, ArrowUpRight, Search, FileDown, Upload, ShieldCheck,
} from 'lucide-react';
import Modal from '../ui/Modal';
import { formatCurrency } from '../../utils/format';
import * as inter from '../../services/bancoInterService';

const hojeYmd = () => new Date().toISOString().slice(0, 10);
const inicioMesYmd = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const fmtData = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
const fmtDataHora = (s) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const diasAte = (s) => (s ? Math.floor((new Date(s) - new Date()) / 86400000) : null);

export default function BancoInterPainel() {
  const [conta, setConta] = useState(undefined); // undefined = carregando, null = não configurado
  const [erro, setErro] = useState('');
  const [configAberta, setConfigAberta] = useState(false);

  const [saldo, setSaldo] = useState(null);
  const [carregandoSaldo, setCarregandoSaldo] = useState(false);

  const [dataInicial, setDataInicial] = useState(inicioMesYmd);
  const [dataFinal, setDataFinal] = useState(hojeYmd);
  const [extrato, setExtrato] = useState([]);
  const [carregandoExtrato, setCarregandoExtrato] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState('');

  const [filtroOp, setFiltroOp] = useState(''); // '' | 'C' | 'D'
  const [filtroTipo, setFiltroTipo] = useState('');
  const [busca, setBusca] = useState('');

  const carregarConta = useCallback(async () => {
    try { setConta(await inter.buscarConta()); setErro(''); }
    catch (e) { setErro(e.message); setConta(null); }
  }, []);
  useEffect(() => { carregarConta(); }, [carregarConta]);

  const pronta = !!conta?.tem_segredos;

  const carregarSaldo = useCallback(async () => {
    setCarregandoSaldo(true);
    try { setSaldo(await inter.buscarSaldo()); }
    catch (e) { setErro(e.message); }
    finally { setCarregandoSaldo(false); }
  }, []);

  const carregarExtrato = useCallback(async () => {
    setCarregandoExtrato(true);
    try { setExtrato(await inter.listarExtrato({ dataInicial, dataFinal })); }
    catch (e) { setErro(e.message); }
    finally { setCarregandoExtrato(false); }
  }, [dataInicial, dataFinal]);

  useEffect(() => { if (pronta) carregarSaldo(); }, [pronta, carregarSaldo]);
  useEffect(() => { if (pronta) carregarExtrato(); }, [pronta, carregarExtrato]);

  // Busca no Inter e grava a cópia local; depois recarrega saldo + extrato.
  const atualizar = async () => {
    setSincronizando(true); setErro(''); setAviso('');
    try {
      const r = await inter.sincronizarExtrato(dataInicial, dataFinal);
      setAviso(`${r.transacoes} transação(ões) atualizadas do Inter.`);
      await Promise.all([carregarExtrato(), carregarSaldo(), carregarConta()]);
    } catch (e) { setErro(e.message); }
    finally { setSincronizando(false); }
  };

  // Saldo de abertura = saldo no Inter no dia ANTERIOR ao início do período.
  // A coluna Saldo acumula entradas/saídas a partir dele (ordem cronológica).
  const [saldoAbertura, setSaldoAbertura] = useState(null);
  useEffect(() => {
    if (!pronta || !dataInicial) return;
    let cancelado = false;
    const d = new Date(`${dataInicial}T12:00:00`);
    d.setDate(d.getDate() - 1);
    inter.buscarSaldo(d.toISOString().slice(0, 10))
      .then(s => { if (!cancelado) setSaldoAbertura(s?.disponivel != null ? Number(s.disponivel) : null); })
      .catch(() => { if (!cancelado) setSaldoAbertura(null); });
    return () => { cancelado = true; };
  }, [pronta, dataInicial]);

  const tiposTransacao = useMemo(
    () => [...new Set(extrato.map(t => t.tipo_transacao).filter(Boolean))].sort(),
    [extrato],
  );

  // Extrato em ordem cronológica (como no banco) + saldo após cada transação.
  // O saldo é calculado sobre TODAS as transações do período (não só as
  // filtradas), então continua correto quando se filtra por tipo/busca.
  const cronologico = useMemo(() => [...extrato].sort((a, b) =>
    (a.data_transacao || '').localeCompare(b.data_transacao || '')
    || (a.data_inclusao || '').localeCompare(b.data_inclusao || '')), [extrato]);
  const saldoApos = useMemo(() => {
    const m = new Map();
    if (saldoAbertura == null) return m;
    let s = saldoAbertura;
    cronologico.forEach(t => {
      s += (t.tipo_operacao === 'C' ? 1 : -1) * Number(t.valor);
      m.set(t.id_transacao, Math.round(s * 100) / 100);
    });
    return m;
  }, [cronologico, saldoAbertura]);

  const filtrado = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cronologico.filter(t =>
      (!filtroOp || t.tipo_operacao === filtroOp)
      && (!filtroTipo || t.tipo_transacao === filtroTipo)
      && (!termo || `${t.titulo || ''} ${t.descricao || ''}`.toLowerCase().includes(termo)));
  }, [cronologico, filtroOp, filtroTipo, busca]);

  const totais = useMemo(() => {
    let entradas = 0, saidas = 0;
    filtrado.forEach(t => { if (t.tipo_operacao === 'C') entradas += Number(t.valor); else saidas += Number(t.valor); });
    return { entradas, saidas, resultado: entradas - saidas };
  }, [filtrado]);

  const exportar = () => {
    const linhas = filtrado.map(t => ({
      Data: fmtData(t.data_transacao),
      'Tipo de transação': t.tipo_transacao || '',
      Título: t.titulo || '',
      Descrição: t.descricao || '',
      Entradas: t.tipo_operacao === 'C' ? Number(t.valor) : null,
      Saídas: t.tipo_operacao === 'D' ? Number(t.valor) : null,
      Saldo: saldoApos.get(t.id_transacao) ?? null,
    }));
    if (saldoAbertura != null) {
      linhas.unshift({ Data: fmtData(dataInicial), Título: 'Saldo anterior', Saldo: saldoAbertura });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Extrato Inter');
    XLSX.writeFile(wb, `extrato-inter-${dataInicial}_a_${dataFinal}.xlsx`);
  };

  if (conta === undefined) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>;
  }

  const diasCert = diasAte(conta?.certificado_validade);

  return (
    <div className="space-y-4">
      {erro && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{erro}</p>
        </div>
      )}

      {!pronta ? (
        <div className="bg-white rounded-xl border border-gray-200/60 p-8 text-center shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-xl bg-orange-50 flex items-center justify-center mb-3">
            <Landmark className="h-6 w-6 text-orange-500" />
          </div>
          <p className="text-sm font-semibold text-gray-900">Conecte a conta da CCI no Banco Inter</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            No Internet Banking PJ do Inter, crie uma integração em <strong>Integrar → Nova integração</strong> com
            os escopos de extrato/saldo e de consulta de boletos. Depois informe aqui o client id, o client secret
            e envie o certificado (.crt) e a chave (.key).
          </p>
          <button onClick={() => setConfigAberta(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Settings className="h-4 w-4" /> Configurar integração
          </button>
        </div>
      ) : (
        <>
          {/* Aviso de vencimento do certificado */}
          {diasCert != null && diasCert <= 30 && (
            <div className={`rounded-lg border p-3 flex items-start gap-2 ${diasCert < 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${diasCert < 0 ? 'text-red-500' : 'text-amber-500'}`} />
              <p className={`text-xs ${diasCert < 0 ? 'text-red-700' : 'text-amber-800'}`}>
                {diasCert < 0
                  ? 'O certificado da integração com o Inter venceu. Gere um novo no Internet Banking e envie em Configurar.'
                  : `O certificado da integração com o Inter vence em ${diasCert} dia(s) (${fmtData(conta.certificado_validade)}). Gere um novo no Internet Banking e envie em Configurar.`}
              </p>
            </div>
          )}

          {/* Saldo + ações */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Kpi rotulo="Saldo disponível" valor={saldo?.disponivel} destaque carregando={carregandoSaldo} />
              <Kpi rotulo="Entradas no período" valor={totais.entradas} cor="text-emerald-600" />
              <Kpi rotulo="Saídas no período" valor={totais.saidas} cor="text-rose-600" />
              <Kpi rotulo="Resultado no período" valor={totais.resultado} cor={totais.resultado < 0 ? 'text-rose-600' : 'text-gray-900'} />
            </div>
            <div className="flex lg:flex-col items-stretch gap-2">
              <button onClick={atualizar} disabled={sincronizando}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar do Inter
              </button>
              <button onClick={() => setConfigAberta(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                <Settings className="h-4 w-4" /> Configurar
              </button>
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            {conta.ambiente === 'sandbox' && (
              <span className="mr-1.5 inline-flex rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-700">Sandbox</span>
            )}
            {conta.nome}{conta.conta_corrente ? ` · conta ${conta.conta_corrente}` : ''} · última atualização do extrato: {fmtDataHora(conta.ultima_sincronizacao_em)}
            {aviso && <span className="text-emerald-600"> · {aviso}</span>}
          </p>

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-200/60 px-3 py-2.5 shadow-sm flex flex-wrap items-end gap-2">
            <Campo rotulo="De">
              <input type="date" value={dataInicial} max={dataFinal} onChange={e => setDataInicial(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 px-2 text-[11px]" />
            </Campo>
            <Campo rotulo="Até">
              <input type="date" value={dataFinal} min={dataInicial} max={hojeYmd()} onChange={e => setDataFinal(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 px-2 text-[11px]" />
            </Campo>
            <Campo rotulo="Movimento">
              <select value={filtroOp} onChange={e => setFiltroOp(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 px-2 text-[11px]">
                <option value="">Entradas e saídas</option>
                <option value="C">Só entradas</option>
                <option value="D">Só saídas</option>
              </select>
            </Campo>
            <Campo rotulo="Tipo">
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 px-2 text-[11px]">
                <option value="">Todos</option>
                {tiposTransacao.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </Campo>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar no título ou descrição..."
                className="w-full h-8 rounded-lg border border-gray-200 pl-8 pr-2 text-[11px]" />
            </div>
            <button onClick={exportar} disabled={filtrado.length === 0}
              className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              <FileDown className="h-3.5 w-3.5" /> Excel
            </button>
          </div>

          {/* Extrato */}
          <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
            {carregandoExtrato ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
            ) : filtrado.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">
                {extrato.length === 0
                  ? 'Nenhuma transação salva neste período. Clique em "Atualizar do Inter" para buscar.'
                  : 'Nenhuma transação com esses filtros.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Data</th>
                      <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                      <th className="px-3 py-2 text-left font-semibold">Descrição</th>
                      <th className="px-3 py-2 text-right font-semibold">Entradas</th>
                      <th className="px-3 py-2 text-right font-semibold">Saídas</th>
                      <th className="px-3 py-2 text-right font-semibold">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* Saldo de abertura (dia anterior ao início do período) */}
                    <tr className="bg-gray-50/60">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500 tabular-nums">{fmtData(dataInicial)}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 font-medium text-gray-700">Saldo anterior</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right whitespace-nowrap font-mono tabular-nums font-semibold text-gray-700">
                        {saldoAbertura != null ? formatCurrency(saldoAbertura) : '—'}
                      </td>
                    </tr>
                    {filtrado.map(t => {
                      const entrada = t.tipo_operacao === 'C';
                      const saldoLinha = saldoApos.get(t.id_transacao);
                      return (
                        <tr key={t.id_transacao} className="hover:bg-gray-50/60">
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600 tabular-nums">{fmtData(t.data_transacao)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${entrada ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {entrada ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                              {(t.tipo_transacao || (entrada ? 'Entrada' : 'Saída')).replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-gray-900">{t.titulo || '—'}</p>
                            {t.descricao && t.descricao !== t.titulo && <p className="text-[11px] text-gray-500">{t.descricao}</p>}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap font-mono tabular-nums font-semibold text-emerald-600">
                            {entrada ? formatCurrency(Number(t.valor)) : ''}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap font-mono tabular-nums font-semibold text-rose-600">
                            {!entrada ? formatCurrency(Number(t.valor)) : ''}
                          </td>
                          <td className={`px-3 py-2 text-right whitespace-nowrap font-mono tabular-nums ${saldoLinha < 0 ? 'text-rose-600' : 'text-gray-700'}`}>
                            {saldoLinha != null ? formatCurrency(saldoLinha) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totais do que está na tela + saldo final do período */}
                  <tfoot className="bg-gray-50 border-t border-gray-200 text-[12px] font-semibold">
                    <tr>
                      <td className="px-3 py-2 text-gray-600" colSpan={3}>Totais ({filtrado.length} transações)</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-600">{formatCurrency(totais.entradas)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-rose-600">{formatCurrency(totais.saidas)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900">
                        {saldoAbertura != null && cronologico.length
                          ? formatCurrency(saldoApos.get(cronologico[cronologico.length - 1].id_transacao))
                          : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <ModalConfigInter
        open={configAberta}
        conta={conta}
        onClose={() => setConfigAberta(false)}
        onSalvo={async () => { await carregarConta(); }}
      />
    </div>
  );
}

function Kpi({ rotulo, valor, cor = 'text-gray-900', destaque = false, carregando = false }) {
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${destaque ? 'bg-orange-50/60 border-orange-200/70' : 'bg-white border-gray-200/60'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{rotulo}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${cor}`}>
        {carregando ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : valor == null ? '—' : formatCurrency(Number(valor))}
      </p>
    </div>
  );
}

function Campo({ rotulo, children }) {
  return (
    <div>
      <label className="block text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{rotulo}</label>
      {children}
    </div>
  );
}

// Configuração da integração. Segredos vazios = mantém os já salvos no servidor.
function ModalConfigInter({ open, conta, onClose, onSalvo }) {
  const [form, setForm] = useState({ nome: '', ambiente: 'sandbox', conta_corrente: '', client_id: '', client_secret: '' });
  const [cert, setCert] = useState({ nome: '', texto: '' });
  const [key, setKey] = useState({ nome: '', texto: '' });
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [msg, setMsg] = useState(null); // { tipo: 'ok'|'erro', texto }

  useEffect(() => {
    if (!open) return;
    setForm({ nome: conta?.nome || 'Banco Inter', ambiente: conta?.ambiente || 'sandbox', conta_corrente: conta?.conta_corrente || '', client_id: conta?.client_id || '', client_secret: '' });
    setCert({ nome: '', texto: '' }); setKey({ nome: '', texto: '' }); setMsg(null);
  }, [open, conta]);

  const lerArquivo = (setter) => async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setter({ nome: f.name, texto: await f.text() });
  };

  const primeiraVez = !conta?.tem_segredos;
  const podeSalvar = form.client_id.trim()
    && (!primeiraVez || (form.client_secret.trim() && cert.texto && key.texto));

  const salvar = async () => {
    setSalvando(true); setMsg(null);
    try {
      await inter.salvarConfiguracao({ ...form, cert: cert.texto || null, key: key.texto || null });
      await onSalvo();
      setMsg({ tipo: 'ok', texto: 'Configuração salva. Teste a conexão.' });
    } catch (e) { setMsg({ tipo: 'erro', texto: e.message }); }
    finally { setSalvando(false); }
  };

  const testar = async () => {
    setTestando(true); setMsg(null);
    try { await inter.testarConexao(); setMsg({ tipo: 'ok', texto: 'Conexão com o Inter OK.' }); await onSalvo(); }
    catch (e) { setMsg({ tipo: 'erro', texto: e.message }); }
    finally { setTestando(false); }
  };

  const input = 'w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

  return (
    <Modal open={open} onClose={onClose} title="Integração com o Banco Inter" size="md"
      footer={(
        <div className="flex items-center justify-between gap-2">
          <button onClick={testar} disabled={testando || !conta?.tem_segredos}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Testar conexão
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">Fechar</button>
            <button onClick={salvar} disabled={!podeSalvar || salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      )}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Conta da <strong>CCI</strong> — uso interno do Financeiro. O client secret, o certificado e a chave ficam
          criptografados no servidor e não voltam para o navegador.
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ambiente</label>
          <div className="inline-flex p-1 rounded-lg bg-gray-100">
            {[['sandbox', 'Sandbox (testes)'], ['producao', 'Produção']].map(([k, rot]) => (
              <button key={k} type="button" onClick={() => setForm(f => ({ ...f, ambiente: k }))}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  form.ambiente === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {rot}
              </button>
            ))}
          </div>
          {conta && form.ambiente !== (conta.ambiente || 'producao') && (
            <p className="text-[11px] text-amber-700 mt-1">
              Ao trocar de ambiente, envie o client id/secret e o certificado da integração desse ambiente.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
            <input className={input} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Conta corrente (opcional)</label>
            <input className={input} value={form.conta_corrente} placeholder="Só números"
              onChange={e => setForm(f => ({ ...f, conta_corrente: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
          <input className={input} value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Client Secret {!primeiraVez && <span className="text-gray-400 font-normal">(deixe vazio para manter o atual)</span>}
          </label>
          <input type="password" autoComplete="new-password" className={input} value={form.client_secret}
            onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ArquivoInput rotulo="Certificado (.crt)" accept=".crt,.pem" arquivo={cert} onChange={lerArquivo(setCert)} manter={!primeiraVez} />
          <ArquivoInput rotulo="Chave privada (.key)" accept=".key,.pem" arquivo={key} onChange={lerArquivo(setKey)} manter={!primeiraVez} />
        </div>
        {conta?.certificado_validade && (
          <p className="text-[11px] text-gray-500">Certificado atual válido até <strong>{fmtData(conta.certificado_validade)}</strong>.</p>
        )}
        {conta?.ultimo_teste_em && (
          <p className={`text-[11px] ${conta.ultimo_teste_ok ? 'text-emerald-600' : 'text-rose-600'}`}>
            Último teste em {fmtDataHora(conta.ultimo_teste_em)}: {conta.ultimo_teste_msg}
          </p>
        )}
        {msg && (
          <div className={`rounded-lg p-2.5 text-xs flex items-start gap-2 ${msg.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {msg.tipo === 'ok' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
            {msg.texto}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ArquivoInput({ rotulo, accept, arquivo, onChange, manter }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{rotulo}</label>
      <label className="flex items-center gap-2 h-9 rounded-lg border border-dashed border-gray-300 px-3 text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
        <Upload className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{arquivo.nome || (manter ? 'Manter o atual' : 'Escolher arquivo')}</span>
        <input type="file" accept={accept} className="hidden" onChange={onChange} />
      </label>
    </div>
  );
}
