// Conferência de recebimentos — portal do cliente (Webposto e Autosystem).
// Por empresa + dia: o total recebido no sistema por forma de pagamento
// (dinheiro, cada administradora/conta de cartão, cheque…), a coluna
// "Conferido" (valores dos portais/extratos, digitados pelo usuário) e a
// diferença. "Salvar rascunho" guarda o digitado (por empresa+dia, no banco)
// para terminar depois. Ao confirmar, fica travada e o rascunho some; a aba
// Consulta lista o que foi enviado.
// Formas SEM lançamento no sistema: o usuário adiciona (Sistema = 0, Conferido
// digitado); se o sistema passar a ter lançamento nela, ao recarregar a linha
// casa pela chave e passa a mostrar o valor do sistema, mantendo o conferido.
// O miolo (ResumoCaixa) também é usado no admin, como aba da Conciliação de
// caixas (modoAdmin): todas as empresas, tipo Webposto/Autosystem por empresa.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardCheck, FileClock, FileSpreadsheet, Loader2, Lock, LockOpen, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import ConsultaConferencias from '../../components/conferencia/ConsultaConferencias';
import { SelectBusca } from '../../components/tarefas/CamposTarefas';
import { useClienteSession } from '../../hooks/useAuth';
import * as conferenciaService from '../../services/conferenciaRecebimentosService';
import { formatCurrency } from '../../utils/format';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ontem = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };
const fmtData = (s) => { const [y, m, d] = String(s || '').split('-'); return d ? `${d}/${m}/${y}` : s; };
const nomeEmp = (c) => c?.nome || c?.razao_social || 'Empresa';
const num = (v) => { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const corDif = (v) => (Math.abs(v) < 0.005 ? 'text-emerald-600' : v > 0 ? 'text-amber-600' : 'text-red-600');

export default function ClienteConferenciaRecebimentos() {
  const session = useClienteSession();
  const usuario = session?.usuario;
  const empresas = useMemo(() => session?.clientesRede || [], [session?.clientesRede]);
  return (
    <ResumoCaixa empresas={empresas} empresaInicial={session?.cliente?.id || empresas[0]?.id || ''}
      tipoFixo={session?.tipoCliente} usuarioNome={usuario?.nome}
      podeConferir={(usuario?.permissoes || []).includes('conferencia_recebimentos')}
      podeReabrir={!!session?._demo} />
  );
}

// tipoFixo: 'webposto' | 'autosystem' (portal do cliente). Sem ele (admin), o
// tipo sai da própria empresa (as_rede_id → Autosystem).
// podeReabrir: admin (aba do BPO ou portal Demo) reabre um resumo confirmado.
export function ResumoCaixa({ empresas, empresaInicial = '', tipoFixo = null, usuarioNome, podeConferir = true, modoAdmin = false, podeReabrir = modoAdmin }) {
  const [aba, setAba] = useState(podeConferir ? 'conferencia' : 'consulta');
  const [empresaId, setEmpresaId] = useState(empresaInicial);
  const [data, setData] = useState(ontem());
  const [itens, setItens] = useState([]);           // [{ chave, rotulo, tipo, sistema, conferido(string), adicionada? }]
  const [salva, setSalva] = useState(null);         // conferência já confirmada
  const [observacoes, setObservacoes] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [rascunho, setRascunho] = useState(null);     // { atualizado_em, atualizado_por }
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  const [reabrir, setReabrir] = useState(false);       // modal de reabertura
  const [reabrindo, setReabrindo] = useState(false);
  const [alterado, setAlterado] = useState(false);    // mexeu desde o último rascunho
  const [formas, setFormas] = useState([]);           // todas as formas da empresa (p/ adicionar)
  const [novaForma, setNovaForma] = useState({ chave: '', valor: '' });
  const [carregado, setCarregado] = useState(false);  // dia carregado e editável
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const showToast = (type, message) => { setToast({ show: true, type, message }); setTimeout(() => setToast(t => ({ ...t, show: false })), 3500); };

  const empresa = empresas.find(e => e.id === empresaId) || null;
  const tipoCliente = tipoFixo || (empresa?.as_rede_id ? 'autosystem' : 'webposto');
  const hoje = ymd(new Date());

  // manter: estado da tela (Recarregar) — prevalece sobre o rascunho salvo.
  const carregar = useCallback(async (forcar = false, manter = null) => {
    if (!empresa || !data) return;
    setCarregando(true); setErro(''); setItens([]); setSalva(null); setObservacoes(''); setRascunho(null); setAlterado(false);
    setCarregado(false); setNovaForma({ chave: '', valor: '' });
    try {
      const existente = await conferenciaService.buscarConferencia(empresa.id, data);
      if (existente) { setSalva(existente); return; }
      if (data >= hoje) { setErro('Só é possível conferir dias anteriores a hoje.'); return; }
      const [linhas, rasc, todas] = await Promise.all([
        conferenciaService.carregarRecebimentosDia(empresa, data, tipoCliente, { forcar }),
        conferenciaService.buscarRascunho(empresa.id, data).catch(() => null),
        conferenciaService.listarFormasRecebimento(empresa, tipoCliente).catch(() => []),
      ]);
      const vals = { ...(rasc?.valores || {}), ...(manter?.valores || {}) };
      const adicionadas = manter ? manter.adicionadas : (rasc?.ocorrencias || []);
      // Forma adicionada que agora TEM lançamento → some daqui e fica a linha do sistema.
      const noSistema = new Set(linhas.map(l => l.chave));
      const extras = adicionadas.filter(a => a.chave && !noSistema.has(a.chave))
        .map(a => ({ chave: a.chave, rotulo: a.rotulo, tipo: a.tipo, sistema: 0, adicionada: true }));
      setItens([...linhas, ...extras].map(l => ({ ...l, conferido: vals[l.chave] ?? '' })));
      setFormas(todas);
      if (rasc) setRascunho(rasc);
      setObservacoes(manter ? manter.observacoes : (rasc?.observacoes || ''));
      if (manter) setAlterado(manter.alterado);
      setCarregado(true);
      if (!linhas.length) setErro('Nenhum recebimento no sistema para este dia.');
    } catch (e) { setErro(e.message || 'Falha ao carregar os recebimentos.'); }
    finally { setCarregando(false); }
  }, [empresa, data, tipoCliente, hoje]);
  useEffect(() => { if (aba === 'conferencia') carregar(); }, [carregar, aba]);

  const linhas = salva ? (salva.itens || []) : itens.map(i => ({ ...i, conferidoNum: num(i.conferido), diferenca: num(i.conferido) - i.sistema }));
  const totSistema = linhas.reduce((s, i) => s + Number(i.sistema || 0), 0);
  const totConferido = linhas.reduce((s, i) => s + (Number(salva ? i.conferido : i.conferidoNum) || 0), 0);
  const totDif = totConferido - totSistema;
  const preenchidos = itens.filter(i => String(i.conferido).trim() !== '').length;
  const formasDisponiveis = formas.filter(f => !itens.some(i => i.chave === f.chave));

  // Recarregar sem perder o que foi digitado (nem as formas adicionadas).
  const recarregar = () => {
    const manter = carregado && !salva ? {
      valores: Object.fromEntries(itens.filter(i => String(i.conferido).trim() !== '').map(i => [i.chave, i.conferido])),
      adicionadas: itens.filter(i => i.adicionada).map(({ chave, rotulo, tipo }) => ({ chave, rotulo, tipo })),
      observacoes, alterado,
    } : null;
    carregar(true, manter);
  };

  const adicionarForma = () => {
    const f = formas.find(x => x.chave === novaForma.chave);
    if (!f || itens.some(i => i.chave === f.chave)) return;
    setItens(l => [...l, { ...f, sistema: 0, adicionada: true, conferido: novaForma.valor }]);
    setNovaForma({ chave: '', valor: '' });
    setAlterado(true);
  };
  const removerForma = (chave) => { setItens(l => l.filter(x => x.chave !== chave)); setAlterado(true); };

  // avisa ao sair da página com digitação não salva
  useEffect(() => {
    if (!alterado || salva) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [alterado, salva]);

  const guardarRascunho = async () => {
    setSalvandoRascunho(true);
    try {
      const row = await conferenciaService.salvarRascunho({
        clienteId: empresa.id, data, itens, observacoes: observacoes.trim(), atualizadoPor: usuarioNome,
      });
      setRascunho(row); setAlterado(false);
      showToast('success', 'Rascunho salvo. Você pode sair e continuar depois.');
    } catch (e) { showToast('error', e.message || 'Falha ao salvar o rascunho.'); }
    finally { setSalvandoRascunho(false); }
  };

  const descartarRascunho = async () => {
    try {
      await conferenciaService.excluirRascunho(empresa.id, data);
      setRascunho(null); setAlterado(false); setObservacoes('');
      setItens(list => list.filter(x => !x.adicionada).map(x => ({ ...x, conferido: '' })));
      showToast('success', 'Rascunho descartado.');
    } catch (e) { showToast('error', e.message || 'Falha ao descartar o rascunho.'); }
  };

  // Exporta o que está na tela (confirmado, rascunho ou em digitação) p/ .xlsx.
  const exportarExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const status = salva
        ? `Confirmado em ${new Date(salva.confirmado_em).toLocaleString('pt-BR')} por ${salva.confirmado_por || '—'}`
        : rascunho ? `Rascunho (não confirmado) — salvo em ${new Date(rascunho.atualizado_em).toLocaleString('pt-BR')}` : 'Não confirmado';
      const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
      const aoa = [
        ['Resumo de Caixa'],
        ['Empresa', nomeEmp(empresa)],
        ['Data', fmtData(data)],
        ['Situação', status],
        [],
        ['Forma de recebimento', 'Tipo', 'Sistema', 'Conferido', 'Diferença'],
      ];
      linhas.forEach((l, idx) => {
        const preenchido = salva || String(itens[idx]?.conferido ?? '').trim() !== '';
        const conferido = salva ? Number(l.conferido) : l.conferidoNum;
        aoa.push([
          l.adicionada ? `${l.rotulo} (sem lançamento no sistema)` : l.rotulo, conferenciaService.ROTULO_TIPO[l.tipo] || l.tipo, r2(l.sistema),
          preenchido ? r2(conferido) : null, preenchido ? r2(l.diferenca) : null,
        ]);
      });
      aoa.push(['Totais', '', r2(totSistema), r2(totConferido), r2(totDif)]);
      const obs = salva ? salva.observacoes : observacoes.trim();
      if (obs) aoa.push([], ['Observações', obs]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      const inicio = 6; // 1ª linha de valores (0-based)
      for (let r = inicio; r < inicio + linhas.length + 1; r += 1) {
        for (let c = 2; c <= 4; c += 1) {
          const cel = ws[XLSX.utils.encode_cell({ r, c })];
          if (cel && cel.t === 'n') cel.z = '#,##0.00';
        }
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Resumo de caixa');
      const nomeArq = `resumo-caixa-${nomeEmp(empresa)}-${data}`.normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase();
      XLSX.writeFile(wb, `${nomeArq}.xlsx`);
    } catch (e) { showToast('error', e.message || 'Falha ao gerar o Excel.'); }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const row = await conferenciaService.salvarConferencia({
        cliente: empresa, data, observacoes: observacoes.trim(), confirmadoPor: usuarioNome,
        itens: itens.map(i => ({ ...i, conferido: num(i.conferido) })),
      });
      setSalva(row); setConfirmar(false); setRascunho(null); setAlterado(false);
      showToast('success', 'Resumo de caixa confirmado e salvo.');
    } catch (e) { showToast('error', e.message); }
    finally { setSalvando(false); }
  };

  const reabrirResumo = async () => {
    setReabrindo(true);
    try {
      await conferenciaService.reabrirConferencia(salva, usuarioNome);
      setReabrir(false);
      showToast('success', 'Resumo de caixa reaberto. Os valores conferidos voltaram como rascunho.');
      await carregar(true);
    } catch (e) { showToast('error', e.message); }
    finally { setReabrindo(false); }
  };

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      {!modoAdmin && <PageHeader title="Resumo de Caixa" description="Confira o que o sistema recebeu no dia, por forma de pagamento, com os portais e extratos" />}

      {!modoAdmin && <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
        {podeConferir && (
          <button onClick={() => setAba('conferencia')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${aba === 'conferencia' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Conferência</button>
        )}
        <button onClick={() => setAba('consulta')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${aba === 'consulta' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Consulta</button>
      </div>}

      {aba === 'consulta' ? <ConsultaConferencias empresas={empresas} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
            {(empresas.length > 1 || modoAdmin) && (
              <div className="min-w-[260px] flex-1">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Empresa</label>
                <SelectBusca value={empresaId} onChange={setEmpresaId} vazio={modoAdmin ? 'Selecione a empresa…' : undefined}
                  placeholderBusca="Buscar empresa…" vazioLista="Nenhuma empresa encontrada."
                  opcoes={empresas.map(e => ({ value: e.id, label: modoAdmin ? `${nomeEmp(e)}${e.as_rede_id ? ' · Autosystem' : ' · Webposto'}` : nomeEmp(e) }))} />
              </div>
            )}
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Data</label>
              <input type="date" value={data} max={ontem()} onChange={e => setData(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm" />
            </div>
            <button onClick={recarregar} disabled={carregando || !empresa}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} /> Recarregar
            </button>
          </div>

          {salva && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <Lock className="mt-0.5 h-4 w-4 text-emerald-600" />
              <p className="flex-1 text-sm text-emerald-900">
                <strong>Resumo de caixa confirmado</strong> em {new Date(salva.confirmado_em).toLocaleString('pt-BR')} por <strong>{salva.confirmado_por || '—'}</strong>. Os valores não podem mais ser alterados.
              </p>
              {podeReabrir && (
                <button onClick={() => setReabrir(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
                  <LockOpen className="h-4 w-4" /> Reabrir
                </button>
              )}
            </div>
          )}
          {rascunho && !salva && !carregando && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <FileClock className="h-4 w-4 text-blue-600" />
              <p className="flex-1 text-sm text-blue-900">
                <strong>Rascunho</strong> salvo em {new Date(rascunho.atualizado_em).toLocaleString('pt-BR')}{rascunho.atualizado_por ? <> por <strong>{rascunho.atualizado_por}</strong></> : null}.
                {alterado ? ' Há alterações ainda não salvas.' : ' Ainda não foi confirmado.'}
              </p>
              <button onClick={descartarRascunho}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                <Trash2 className="h-3.5 w-3.5" /> Descartar rascunho
              </button>
            </div>
          )}
          {erro && !salva && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" /><p className="text-xs text-amber-700">{erro}</p>
            </div>
          )}

          {carregando ? (
            <div className="flex justify-center rounded-2xl border border-gray-200/60 bg-white py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
          ) : (salva ? linhas.length > 0 : carregado) && (
            <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
                <ClipboardCheck className="h-4 w-4 text-blue-500" />
                <h3 className="flex-1 text-sm font-semibold text-gray-800">Recebimentos de {fmtData(data)} — {nomeEmp(empresa)}</h3>
                <button onClick={exportarExcel}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Forma de recebimento</th>
                      <th className="px-4 py-3 text-right">Sistema</th>
                      <th className="px-4 py-3 text-right">Conferido</th>
                      <th className="px-4 py-3 text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {linhas.map((l, idx) => {
                      const temValor = salva || String(itens[idx]?.conferido ?? '').trim() !== '';
                      const dif = salva ? Number(l.diferenca) : l.diferenca;
                      return (
                        <tr key={l.chave}>
                          <td className="px-4 py-2.5">
                            <p className="flex items-center gap-2 font-medium text-gray-900">
                              {l.rotulo}
                              {l.adicionada && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Sem lançamento</span>}
                              {l.adicionada && !salva && (
                                <button onClick={() => removerForma(l.chave)} title="Remover esta forma"
                                  className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-400">{conferenciaService.ROTULO_TIPO[l.tipo] || l.tipo}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-gray-900">{formatCurrency(l.sistema)}</td>
                          <td className="px-4 py-2.5 text-right">
                            {salva ? (
                              <span className="font-mono tabular-nums text-gray-900">{formatCurrency(l.conferido)}</span>
                            ) : (
                              <input inputMode="decimal" value={itens[idx].conferido} placeholder="0,00"
                                onChange={e => { setAlterado(true); setItens(list => list.map((x, k) => (k === idx ? { ...x, conferido: e.target.value } : x))); }}
                                className="h-9 w-36 rounded-lg border border-gray-200 bg-white px-3 text-right font-mono text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                            )}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono font-semibold tabular-nums ${temValor ? corDif(dif) : 'text-gray-300'}`}>
                            {temValor ? formatCurrency(dif) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-gray-200 bg-gray-50 text-sm font-semibold">
                    <tr>
                      <td className="px-4 py-3 text-gray-700">Totais</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(totSistema)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(totConferido)}</td>
                      <td className={`px-4 py-3 text-right font-mono tabular-nums ${corDif(totDif)}`}>{formatCurrency(totDif)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {!salva && (
                <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3">
                  <span className="text-xs font-medium text-gray-600">Forma sem lançamento no sistema?</span>
                  <select value={novaForma.chave} onChange={e => setNovaForma(f => ({ ...f, chave: e.target.value }))}
                    className="h-9 min-w-[220px] flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm sm:flex-none">
                    <option value="">{formasDisponiveis.length ? 'Selecione a forma de recebimento…' : 'Nenhuma outra forma disponível'}</option>
                    {formasDisponiveis.map(f => <option key={f.chave} value={f.chave}>{f.rotulo}</option>)}
                  </select>
                  <input inputMode="decimal" value={novaForma.valor} placeholder="Conferido 0,00"
                    onChange={e => setNovaForma(f => ({ ...f, valor: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') adicionarForma(); }}
                    className="h-9 w-36 rounded-lg border border-gray-200 bg-white px-3 text-right font-mono text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                  <button onClick={adicionarForma} disabled={!novaForma.chave}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                    <Plus className="h-4 w-4" /> Adicionar
                  </button>
                </div>
              )}

              {salva ? (salva.observacoes && (
                <div className="border-t border-gray-100 px-5 py-3 text-sm text-gray-700"><strong>Observações:</strong> {salva.observacoes}</div>
              )) : (
                <div className="space-y-3 border-t border-gray-100 p-4">
                  <textarea rows={2} value={observacoes} onChange={e => { setAlterado(true); setObservacoes(e.target.value); }} placeholder="Observações (opcional)"
                    className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-xs ${preenchidos === itens.length ? 'text-emerald-700' : 'text-amber-600'}`}>
                      {preenchidos === itens.length ? <><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Todas as formas conferidas</> : `${itens.length - preenchidos} forma(s) em branco serão salvas como R$ 0,00`}
                    </span>
                    <div className="flex items-center gap-2">
                    <button onClick={guardarRascunho} disabled={!empresa || salvandoRascunho || (!alterado && !!rascunho)}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      {salvandoRascunho ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileClock className="h-4 w-4" />} {rascunho && !alterado ? 'Rascunho salvo' : 'Salvar rascunho'}
                    </button>
                    <button onClick={() => setConfirmar(true)} disabled={!empresa}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                      <Save className="h-4 w-4" /> Confirmar e salvar
                    </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Modal open={confirmar} onClose={() => !salvando && setConfirmar(false)} title="Confirmar resumo de caixa" size="md"
        footer={(
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmar(false)} disabled={salvando} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Revisar</button>
            <button onClick={salvar} disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Sim, confirmar e salvar
            </button>
          </div>
        )}>
        <div className="space-y-3 text-sm text-gray-700">
          <p>{nomeEmp(empresa)} · {fmtData(data)}</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-gray-200 p-3"><p className="text-[10px] uppercase text-gray-400">Sistema</p><p className="font-mono font-semibold">{formatCurrency(totSistema)}</p></div>
            <div className="rounded-lg border border-gray-200 p-3"><p className="text-[10px] uppercase text-gray-400">Conferido</p><p className="font-mono font-semibold">{formatCurrency(totConferido)}</p></div>
            <div className="rounded-lg border border-gray-200 p-3"><p className="text-[10px] uppercase text-gray-400">Diferença</p><p className={`font-mono font-semibold ${corDif(totDif)}`}>{formatCurrency(totDif)}</p></div>
          </div>
          <p className="text-[12px] text-amber-700">Após salvar, o resumo de caixa deste dia fica travado e não pode mais ser alterada.</p>
        </div>
      </Modal>

      <Modal open={reabrir} onClose={() => !reabrindo && setReabrir(false)} title="Reabrir resumo de caixa" size="md"
        footer={(
          <div className="flex justify-end gap-3">
            <button onClick={() => setReabrir(false)} disabled={reabrindo} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={reabrirResumo} disabled={reabrindo}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {reabrindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />} Sim, reabrir
            </button>
          </div>
        )}>
        <div className="space-y-2 text-sm text-gray-700">
          <p>{nomeEmp(empresa)} · {fmtData(data)}</p>
          <p>A confirmação de <strong>{salva?.confirmado_por || '—'}</strong> será desfeita. Os valores conferidos voltam como <strong>rascunho</strong>, para alterar e confirmar novamente.</p>
        </div>
      </Modal>
    </div>
  );
}
