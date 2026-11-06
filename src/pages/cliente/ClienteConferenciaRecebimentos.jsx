// Conferência de recebimentos — portal do cliente (Webposto e Autosystem).
// Por empresa + dia: o total recebido no sistema por forma de pagamento
// (dinheiro, cada administradora/conta de cartão, cheque…), a coluna
// "Conferido" (valores dos portais/extratos, digitados pelo usuário) e a
// diferença. "Salvar rascunho" guarda o digitado (por empresa+dia, no banco)
// para terminar depois. Ao confirmar, fica travada e o rascunho some; a aba
// Consulta lista o que foi enviado.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardCheck, FileClock, FileSpreadsheet, Loader2, Lock, RefreshCw, Save, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import ConsultaConferencias from '../../components/conferencia/ConsultaConferencias';
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
  const tipoCliente = session?.tipoCliente;
  const empresas = useMemo(() => session?.clientesRede || [], [session?.clientesRede]);
  const perms = usuario?.permissoes || [];
  const podeConferir = perms.includes('conferencia_recebimentos');

  const [aba, setAba] = useState(podeConferir ? 'conferencia' : 'consulta');
  const [empresaId, setEmpresaId] = useState(session?.cliente?.id || empresas[0]?.id || '');
  const [data, setData] = useState(ontem());
  const [itens, setItens] = useState([]);           // [{ chave, rotulo, tipo, sistema, conferido(string) }]
  const [salva, setSalva] = useState(null);         // conferência já confirmada
  const [observacoes, setObservacoes] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [rascunho, setRascunho] = useState(null);     // { atualizado_em, atualizado_por }
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  const [alterado, setAlterado] = useState(false);    // mexeu desde o último rascunho
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const showToast = (type, message) => { setToast({ show: true, type, message }); setTimeout(() => setToast(t => ({ ...t, show: false })), 3500); };

  const empresa = empresas.find(e => e.id === empresaId) || null;
  const hoje = ymd(new Date());

  const carregar = useCallback(async (forcar = false) => {
    if (!empresa || !data) return;
    setCarregando(true); setErro(''); setItens([]); setSalva(null); setObservacoes(''); setRascunho(null); setAlterado(false);
    try {
      const existente = await conferenciaService.buscarConferencia(empresa.id, data);
      if (existente) { setSalva(existente); return; }
      if (data >= hoje) { setErro('Só é possível conferir dias anteriores a hoje.'); return; }
      const [linhas, rasc] = await Promise.all([
        conferenciaService.carregarRecebimentosDia(empresa, data, tipoCliente, { forcar }),
        conferenciaService.buscarRascunho(empresa.id, data).catch(() => null),
      ]);
      const vals = rasc?.valores || {};
      setItens(linhas.map(l => ({ ...l, conferido: vals[l.chave] ?? '' })));
      if (rasc) { setRascunho(rasc); setObservacoes(rasc.observacoes || ''); }
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
        clienteId: empresa.id, data, itens, observacoes: observacoes.trim(), atualizadoPor: usuario?.nome,
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
      setItens(list => list.map(x => ({ ...x, conferido: '' })));
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
          l.rotulo, conferenciaService.ROTULO_TIPO[l.tipo] || l.tipo, r2(l.sistema),
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
        cliente: empresa, data, observacoes: observacoes.trim(), confirmadoPor: usuario?.nome,
        itens: itens.map(i => ({ ...i, conferido: num(i.conferido) })),
      });
      setSalva(row); setConfirmar(false); setRascunho(null); setAlterado(false);
      showToast('success', 'Resumo de caixa confirmado e salvo.');
    } catch (e) { showToast('error', e.message); }
    finally { setSalvando(false); }
  };

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader title="Resumo de Caixa" description="Confira o que o sistema recebeu no dia, por forma de pagamento, com os portais e extratos" />

      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
        {podeConferir && (
          <button onClick={() => setAba('conferencia')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${aba === 'conferencia' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Conferência</button>
        )}
        <button onClick={() => setAba('consulta')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${aba === 'consulta' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Consulta</button>
      </div>

      {aba === 'consulta' ? <ConsultaConferencias empresas={empresas} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
            {empresas.length > 1 && (
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Empresa</label>
                <select value={empresaId} onChange={e => setEmpresaId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm">
                  {empresas.map(e => <option key={e.id} value={e.id}>{nomeEmp(e)}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Data</label>
              <input type="date" value={data} max={ontem()} onChange={e => setData(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm" />
            </div>
            <button onClick={() => carregar(true)} disabled={carregando || !empresa}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} /> Recarregar
            </button>
          </div>

          {salva && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <Lock className="mt-0.5 h-4 w-4 text-emerald-600" />
              <p className="text-sm text-emerald-900">
                <strong>Resumo de caixa confirmado</strong> em {new Date(salva.confirmado_em).toLocaleString('pt-BR')} por <strong>{salva.confirmado_por || '—'}</strong>. Os valores não podem mais ser alterados.
              </p>
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
          ) : linhas.length > 0 && (
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
                            <p className="font-medium text-gray-900">{l.rotulo}</p>
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
    </div>
  );
}
