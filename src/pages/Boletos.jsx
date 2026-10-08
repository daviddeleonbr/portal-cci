// Contas a Receber da CCI — boletos REAIS do Banco Inter (Cobrança v3).
// Lista a cópia local (sincronizada pela Edge Function `inter-api`), emite
// boleto para um cliente cadastrado (pagador montado no servidor a partir do
// cadastro), baixa o PDF e cancela. Uso interno da CCI (não é tela de cliente).

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Search, Building2, FileDown, XCircle, RefreshCw, Loader2, AlertTriangle, Landmark,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import { formatCurrency } from '../utils/format';
import * as inter from '../services/bancoInterService';
import * as clientesService from '../services/clientesService';

const hojeYmd = () => new Date().toISOString().slice(0, 10);
const somarDias = (ymd, n) => { const d = new Date(`${ymd}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const fimMesSeguinte = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 2, 0).toISOString().slice(0, 10); };
const fmtData = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

// Situação do Inter → status da tela. A_RECEBER vencido conta como vencido.
function statusDe(b) {
  const s = b.situacao;
  if (s === 'RECEBIDO' || s === 'MARCADO_RECEBIDO') return 'pago';
  if (s === 'CANCELADO' || s === 'EXPIRADO' || s === 'FALHA_EMISSAO') return 'cancelado';
  if (s === 'EM_PROCESSAMENTO') return 'processando';
  if (s === 'ATRASADO' || (b.data_vencimento && b.data_vencimento < hojeYmd())) return 'vencido';
  return 'pendente';
}
const STATUS = {
  pago:        { rotulo: 'Pago',         cls: 'bg-emerald-50 text-emerald-700' },
  pendente:    { rotulo: 'Pendente',     cls: 'bg-amber-50 text-amber-700' },
  vencido:     { rotulo: 'Vencido',      cls: 'bg-red-50 text-red-600' },
  processando: { rotulo: 'Processando',  cls: 'bg-blue-50 text-blue-700' },
  cancelado:   { rotulo: 'Cancelado',    cls: 'bg-gray-100 text-gray-500' },
};

export default function Boletos({ embedded = false }) {
  const [conta, setConta] = useState(undefined); // undefined = carregando
  const [boletos, setBoletos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState('');

  const [dataInicial, setDataInicial] = useState(inicioMes);
  const [dataFinal, setDataFinal] = useState(fimMesSeguinte);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');

  const [modalEmitir, setModalEmitir] = useState(false);
  const [cancelando, setCancelando] = useState(null); // boleto em cancelamento
  const [baixandoPdf, setBaixandoPdf] = useState(null);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  useEffect(() => {
    inter.buscarConta().then(setConta).catch(e => { setErro(e.message); setConta(null); });
  }, []);
  const pronta = !!conta?.tem_segredos;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setBoletos(await inter.listarBoletos({ dataInicial, dataFinal })); }
    catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, [dataInicial, dataFinal]);
  useEffect(() => { if (pronta) carregar(); }, [pronta, carregar]);

  const atualizar = async () => {
    setSincronizando(true); setErro('');
    try {
      const r = await inter.sincronizarBoletos(dataInicial, dataFinal);
      await carregar();
      showToast('success', `${r.boletos} boleto(s) atualizados do Inter.`);
    } catch (e) { setErro(e.message); }
    finally { setSincronizando(false); }
  };

  const comStatus = useMemo(() => boletos.map(b => ({ ...b, _status: statusDe(b) })), [boletos]);
  const nomeCliente = (b) => b.cliente?.razao_social || b.cliente?.nome || b.pagador_nome || '—';

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDoc = soDigitos(busca);
    return comStatus.filter(b =>
      (filtroStatus === 'todos' || b._status === filtroStatus)
      && (!termo
        || `${nomeCliente(b)} ${b.seu_numero || ''} ${b.nosso_numero || ''}`.toLowerCase().includes(termo)
        || (termoDoc && (b.pagador_cpf_cnpj || '').includes(termoDoc))));
  }, [comStatus, filtroStatus, busca]);

  const resumo = useMemo(() => {
    const r = { pago: [0, 0], pendente: [0, 0], vencido: [0, 0] };
    comStatus.forEach(b => {
      if (!r[b._status]) return;
      r[b._status][0] += Number(b._status === 'pago' ? (b.valor_recebido ?? b.valor_nominal) : b.valor_nominal) || 0;
      r[b._status][1] += 1;
    });
    return r;
  }, [comStatus]);

  const baixarPdf = async (b) => {
    setBaixandoPdf(b.codigo_solicitacao);
    try {
      const base64 = await inter.baixarPdfBoleto(b.codigo_solicitacao);
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `boleto-${(b.seu_numero || b.codigo_solicitacao).replace(/[^\w-]/g, '_')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { showToast('error', e.message); }
    finally { setBaixandoPdf(null); }
  };

  const cabecalhoAcoes = (
    <>
      <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-1.5">
        <Building2 className="h-4 w-4 text-orange-600" />
        <span className="text-xs font-medium text-orange-700">Banco Inter{conta?.ambiente === 'sandbox' ? ' · Sandbox' : ''}</span>
      </div>
      {pronta && (
        <>
          <button onClick={atualizar} disabled={sincronizando}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60">
            {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar do Inter
          </button>
          <button onClick={() => setModalEmitir(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Gerar Boleto
          </button>
        </>
      )}
    </>
  );

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      {!embedded
        ? <PageHeader title="Contas a Receber" description="Boletos da CCI no Banco Inter">{cabecalhoAcoes}</PageHeader>
        : <div className="flex flex-wrap items-center justify-end gap-2 mb-4">{cabecalhoAcoes}</div>}

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{erro}</p>
        </div>
      )}

      {conta === undefined ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
      ) : !pronta ? (
        <div className="bg-white rounded-xl border border-gray-200/60 p-8 text-center shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-xl bg-orange-50 flex items-center justify-center mb-3">
            <Landmark className="h-6 w-6 text-orange-500" />
          </div>
          <p className="text-sm font-semibold text-gray-900">Banco Inter não configurado</p>
          <p className="text-xs text-gray-500 mt-1">Configure a integração na aba <strong>Banco Inter</strong> para ver e emitir boletos.</p>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <CardResumo rotulo="Pagos" valor={resumo.pago[0]} qtd={resumo.pago[1]} cor="text-emerald-600" />
            <CardResumo rotulo="Pendentes" valor={resumo.pendente[0]} qtd={resumo.pendente[1]} cor="text-amber-600" />
            <CardResumo rotulo="Vencidos" valor={resumo.vencido[0]} qtd={resumo.vencido[1]} cor="text-red-500" />
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-3 p-4 border-b border-gray-50">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Vencimento de</label>
                  <input type="date" value={dataInicial} max={dataFinal} onChange={e => setDataInicial(e.target.value)}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-xs" />
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Até</label>
                  <input type="date" value={dataFinal} min={dataInicial} onChange={e => setDataFinal(e.target.value)}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-xs" />
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" placeholder="Buscar por cliente, CNPJ ou número..." value={busca}
                    onChange={e => setBusca(e.target.value)}
                    className="h-9 w-64 rounded-lg border border-gray-200 bg-gray-50/50 pl-9 pr-4 text-sm focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[['todos', 'Todos'], ['pago', 'Pagos'], ['pendente', 'Pendentes'], ['vencido', 'Vencidos'], ['cancelado', 'Cancelados']].map(([f, rot]) => (
                  <button key={f} onClick={() => setFiltroStatus(f)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                      filtroStatus === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {rot}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              {carregando ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
              ) : filtrados.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">
                  {boletos.length === 0
                    ? 'Nenhum boleto salvo com vencimento neste período. Clique em "Atualizar do Inter" para buscar.'
                    : 'Nenhum boleto com esses filtros.'}
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Número</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vencimento</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pagamento</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtrados.map(b => {
                      const st = STATUS[b._status];
                      const podeCancelar = b._status === 'pendente' || b._status === 'vencido';
                      return (
                        <tr key={b.codigo_solicitacao} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="text-sm font-mono font-medium text-gray-900">{b.seu_numero || '—'}</span>
                            {b.nosso_numero && <p className="text-[11px] text-gray-400 font-mono">Nosso nº {b.nosso_numero}</p>}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">
                            {nomeCliente(b)}
                            {b.pagador_cpf_cnpj && <p className="text-[11px] text-gray-400 font-mono">{b.pagador_cpf_cnpj}</p>}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{fmtData(b.data_vencimento)}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{b._status === 'pago' ? fmtData(b.data_situacao) : '—'}</td>
                          <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                            {formatCurrency(Number(b.valor_nominal) || 0)}
                            {b._status === 'pago' && b.valor_recebido != null && Number(b.valor_recebido) !== Number(b.valor_nominal) && (
                              <p className="text-[11px] font-normal text-emerald-600">recebido {formatCurrency(Number(b.valor_recebido))}</p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.rotulo}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              <button onClick={() => baixarPdf(b)} disabled={baixandoPdf === b.codigo_solicitacao || b._status === 'processando'}
                                className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
                                title="Baixar PDF">
                                {baixandoPdf === b.codigo_solicitacao ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                              </button>
                              {podeCancelar && (
                                <button onClick={() => setCancelando(b)}
                                  className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Cancelar boleto">
                                  <XCircle className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-50 text-sm text-gray-500">
              {filtrados.length} boleto(s) encontrado(s)
              {conta?.ambiente === 'sandbox' && <span className="text-amber-600"> · ambiente de testes (sandbox)</span>}
            </div>
          </div>
        </>
      )}

      <ModalEmitir open={modalEmitir} onClose={() => setModalEmitir(false)}
        onEmitido={async (b) => {
          setModalEmitir(false);
          showToast('success', `Boleto ${b?.seu_numero || ''} emitido no Inter.`);
          // Garante que o novo boleto apareça mesmo fora do período filtrado.
          if (b?.data_vencimento && (b.data_vencimento < dataInicial || b.data_vencimento > dataFinal)) {
            setDataInicial(b.data_vencimento < dataInicial ? b.data_vencimento : dataInicial);
            setDataFinal(b.data_vencimento > dataFinal ? b.data_vencimento : dataFinal);
          } else await carregar();
        }} />

      <ModalCancelar boleto={cancelando} nomeCliente={cancelando ? nomeCliente(cancelando) : ''}
        onClose={() => setCancelando(null)}
        onCancelado={async () => { setCancelando(null); showToast('success', 'Boleto cancelado no Inter.'); await carregar(); }} />
    </div>
  );
}

function CardResumo({ rotulo, valor, qtd, cor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-500 mb-1">{rotulo}</p>
      <p className={`text-xl font-semibold ${cor}`}>{formatCurrency(valor)}</p>
      <p className="text-xs text-gray-400 mt-1">{qtd} boleto(s)</p>
    </div>
  );
}

// Emissão: escolhe um CLIENTE cadastrado (o servidor monta o pagador a partir do
// cadastro) + valor + vencimento. Avisa se o cadastro estiver incompleto.
function ModalEmitir({ open, onClose, onEmitido }) {
  const [clientes, setClientes] = useState([]);
  const [buscaCli, setBuscaCli] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState(() => somarDias(hojeYmd(), 7));
  const [mensagem, setMensagem] = useState('');
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setClienteId(''); setBuscaCli(''); setValor(''); setMensagem(''); setErro(''); setEnviarEmail(false);
    setVencimento(somarDias(hojeYmd(), 7));
    clientesService.listarClientes()
      .then(cs => setClientes((cs || []).filter(c => c.status === 'ativo')))
      .catch(e => setErro(e.message));
  }, [open]);

  const termo = buscaCli.trim().toLowerCase();
  const opcoes = useMemo(() => clientes
    .filter(c => !termo || `${c.razao_social || ''} ${c.nome || ''} ${c.cnpj || ''}`.toLowerCase().includes(termo))
    .slice(0, 50), [clientes, termo]);
  const cli = clientes.find(c => c.id === clienteId);

  // Mesmas exigências do servidor (o Inter recusa sem endereço completo).
  const pendencias = cli ? [
    ![11, 14].includes(soDigitos(cli.cnpj).length) && 'CNPJ/CPF',
    !cli.endereco && 'endereço',
    !cli.cidade && 'cidade',
    !(cli.estado && String(cli.estado).trim().length === 2) && 'UF',
    soDigitos(cli.cep).length !== 8 && 'CEP',
  ].filter(Boolean) : [];

  const valorNum = Number(String(valor).replace(/\./g, '').replace(',', '.'));
  const emailCliente = /^\S+@\S+\.\S+$/.test(String(cli?.contato_email || '').trim()) ? cli.contato_email.trim() : '';
  // Por que o botão está bloqueado (mostrado ao usuário, em vez de só desabilitar).
  const VALOR_MINIMO = 2.5; // mínimo do Inter por boleto
  const bloqueios = [
    !cli && 'escolha o cliente',
    cli && pendencias.length > 0 && 'complete o cadastro do cliente',
    !(valorNum > 0) && 'informe o valor',
    valorNum > 0 && valorNum < VALOR_MINIMO && `o valor mínimo do boleto no Inter é ${formatCurrency(VALOR_MINIMO)}`,
    (!vencimento || vencimento < hojeYmd()) && 'o vencimento não pode ser no passado',
    enviarEmail && cli && !emailCliente && 'cadastre o e-mail do cliente ou desmarque o envio por e-mail',
  ].filter(Boolean);
  const podeEmitir = bloqueios.length === 0 && !emitindo;

  const emitir = async () => {
    setEmitindo(true); setErro('');
    try {
      const { boleto } = await inter.emitirBoleto({ cliente_id: clienteId, valor: valorNum, dataVencimento: vencimento, mensagem: mensagem.trim() || undefined, enviarEmail });
      onEmitido(boleto);
    } catch (e) { setErro(e.message); }
    finally { setEmitindo(false); }
  };

  const input = 'w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';
  return (
    <Modal open={open} onClose={onClose} title="Gerar Boleto" size="md"
      footer={(
        <div className="flex items-center justify-end gap-3">
          {bloqueios.length > 0 && (
            <p className="mr-auto text-[11px] text-amber-700">Para emitir: {bloqueios.join('; ')}.</p>
          )}
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
          <button onClick={emitir} disabled={!podeEmitir}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {emitindo && <Loader2 className="h-4 w-4 animate-spin" />} Emitir no Inter
          </button>
        </div>
      )}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Cliente (pagador)</label>
          <input className={input} placeholder="Buscar por razão social, nome ou CNPJ..." value={buscaCli}
            onChange={e => setBuscaCli(e.target.value)} />
          <div className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
            {opcoes.map(c => (
              <button key={c.id} type="button" onClick={() => setClienteId(c.id)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${clienteId === c.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                {c.razao_social || c.nome}
                <span className="ml-2 text-[11px] text-gray-400 font-mono">{c.cnpj || 'sem CNPJ'}</span>
              </button>
            ))}
            {opcoes.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">Nenhum cliente encontrado.</p>}
          </div>
          {cli && pendencias.length > 0 && (
            <p className="mt-1.5 text-[11px] text-amber-700">
              Complete o cadastro deste cliente antes de emitir: <strong>{pendencias.join(', ')}</strong> (Cadastros → Clientes).
            </p>
          )}
          {cli && pendencias.length === 0 && (
            <p className="mt-1.5 text-[11px] text-gray-500">
              {cli.endereco}{cli.numero ? `, ${cli.numero}` : ''} · {cli.cidade}/{cli.estado} · CEP {cli.cep}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Valor (R$)</label>
            <input className={input} inputMode="decimal" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} />
            <p className="mt-1 text-[10.5px] text-gray-400">Mínimo {formatCurrency(VALOR_MINIMO)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vencimento</label>
            <input type="date" className={input} min={hojeYmd()} value={vencimento} onChange={e => setVencimento(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mensagem no boleto (opcional)</label>
          <input className={input} maxLength={78} placeholder="Ex.: Honorários BPO — outubro/2026" value={mensagem} onChange={e => setMensagem(e.target.value)} />
        </div>
        {/* Envio por e-mail: só manda o e-mail do cliente ao Inter quando marcado */}
        <label className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer ${enviarEmail ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200'}`}>
          <input type="checkbox" checked={enviarEmail} onChange={e => setEnviarEmail(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
          <span className="text-xs text-gray-700">
            <span className="font-medium">Enviar o boleto por e-mail ao cliente</span>
            <span className="block text-[11px] text-gray-500 mt-0.5">
              {!cli
                ? 'O Inter envia para o e-mail de contato do cadastro do cliente.'
                : emailCliente
                  ? <>Será enviado para <strong>{emailCliente}</strong>.</>
                  : 'Este cliente não tem e-mail de contato cadastrado.'}
            </span>
          </span>
        </label>
        <div className="flex items-center gap-2 p-2.5 bg-orange-50 rounded-lg">
          <Building2 className="h-4 w-4 text-orange-600 flex-shrink-0" />
          <span className="text-xs text-orange-700">Emissão real no Banco Inter (boleto com Pix). O PDF fica disponível na lista.</span>
        </div>
        {erro && (
          <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {erro}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ModalCancelar({ boleto, nomeCliente, onClose, onCancelado }) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => { setMotivo(''); setErro(''); }, [boleto]);

  const cancelar = async () => {
    setEnviando(true); setErro('');
    try { await inter.cancelarBoleto(boleto.codigo_solicitacao, motivo.trim()); onCancelado(); }
    catch (e) { setErro(e.message); }
    finally { setEnviando(false); }
  };

  return (
    <Modal open={!!boleto} onClose={onClose} title="Cancelar boleto" size="sm"
      footer={(
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Voltar</button>
          <button onClick={cancelar} disabled={!motivo.trim() || enviando}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Cancelar no Inter
          </button>
        </div>
      )}>
      {boleto && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Cancelar o boleto <strong>{boleto.seu_numero}</strong> de <strong>{nomeCliente}</strong>,
            {' '}{formatCurrency(Number(boleto.valor_nominal) || 0)}, vencimento {fmtData(boleto.data_vencimento)}?
            O cancelamento é feito no Inter e não pode ser desfeito.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Motivo</label>
            <input maxLength={50} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: Emitido com valor errado"
              className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100" />
          </div>
          {erro && <p className="text-xs text-red-600">{erro}</p>}
        </div>
      )}
    </Modal>
  );
}
