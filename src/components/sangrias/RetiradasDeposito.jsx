// Sangrias — retiradas em dinheiro antes do depósito e a tarefa "Depósito em
// banco" (Webposto e Autosystem usam o mesmo bloco). Valor a depositar =
// total apresentado (contado) − retiradas. A tarefa é criada por quem tem a
// permissão 'sangrias_tarefa_deposito' (regras no banco — migration 198).

import { useEffect, useState } from 'react';
import { Banknote, Camera, CheckCircle2, ExternalLink, Landmark, Loader2, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { SelectBusca } from '../tarefas/CamposTarefas';
import * as sangriasService from '../../services/clienteSangriasService';
import { formatCurrency } from '../../utils/format';
import { novaRetirada, resumoRetiradas, proximoDiaUtilTexto, semValorContado } from '../../utils/sangriasDeposito';

// Responsável pela tarefa de depósito (funcionários com Tarefas nesta empresa).
export function ResponsavelDeposito({ clienteId, value, onChange }) {
  const [res, setRes] = useState({ clienteId: null, lista: [] });
  useEffect(() => {
    if (!clienteId) return undefined;
    let cancel = false;
    sangriasService.listarResponsaveisDeposito(clienteId)
      .catch(() => [])
      .then(l => { if (!cancel) setRes({ clienteId, lista: l }); });
    return () => { cancel = true; };
  }, [clienteId]);
  const lista = res.clienteId === clienteId ? res.lista : [];
  return (
    <SelectBusca value={lista.some(u => u.id === value) ? value : ''} onChange={onChange} vazio="Selecione o responsável…"
      placeholderBusca="Buscar pessoa…" vazioLista="Nenhum funcionário com acesso a Tarefas nesta empresa."
      opcoes={lista.map(u => ({ value: u.id, label: u.nome }))} />
  );
}

const inp = 'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

export function SecaoRetiradas({ travado, fechamento, retiradas, setRetiradas, totalApresentado, podeCriarTarefa, clienteId, onTarefaCriada, showToast }) {
  const salvas = fechamento?.retiradas || [];
  const resumo = travado
    ? { total: Number(fechamento?.total_retiradas || 0), deposito: Number(fechamento?.valor_deposito ?? fechamento?.total_apresentado ?? 0) }
    : resumoRetiradas(retiradas, totalApresentado);
  const altera = (chave, patch) => setRetiradas(l => l.map(r => (r.chave === chave ? { ...r, ...patch } : r)));

  const abrirArquivo = async (path) => {
    try { window.open(await sangriasService.urlArquivoRetirada(path), '_blank', 'noopener'); }
    catch (e) { showToast('error', e.message); }
  };

  return (
    <div className="mt-4 bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <Banknote className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-gray-800">Retiradas em dinheiro antes do depósito</h3>
        <span className="text-[11px] text-gray-400">· {travado ? salvas.length : semValorContado(totalApresentado) ? 0 : retiradas.length} retirada(s)</span>
      </div>

      <div className="p-4 space-y-2">
        {travado ? (
          salvas.length === 0 ? <p className="text-xs text-gray-400">Nenhuma retirada antes do depósito.</p> : (
            <ul className="divide-y divide-gray-100">
              {salvas.map((r, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <span className="flex-1 text-sm text-gray-800">{r.descricao}</span>
                  {r.arquivo_path && (
                    <button onClick={() => abrirArquivo(r.arquivo_path)} className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> {r.arquivo_nome || 'Arquivo'}
                    </button>
                  )}
                  <span className="w-28 text-right font-mono text-sm tabular-nums text-gray-900">{formatCurrency(r.valor)}</span>
                </li>
              ))}
            </ul>
          )
        ) : semValorContado(totalApresentado) ? (
          <p className="text-xs text-gray-400">Sem valor contado — não há retiradas nem depósito a fazer.</p>
        ) : (
          <>
            {retiradas.length === 0 && <p className="text-xs text-gray-400">Houve retirada de dinheiro antes do depósito (pagamento, troco, vale…)? Registre aqui com o comprovante.</p>}
            {retiradas.map(r => (
              <div key={r.chave} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-2 sm:flex-row sm:items-center">
                <input value={r.descricao} onChange={e => altera(r.chave, { descricao: e.target.value })} placeholder="Descrição (ex.: pagamento de frete)"
                  className={`${inp} flex-1`} />
                <input type="number" step="0.01" min="0" inputMode="decimal" value={r.valor} onChange={e => altera(r.chave, { valor: e.target.value })}
                  placeholder="0,00" className={`${inp} w-full font-mono text-right sm:w-32`} />
                {r.arquivo ? (
                  <span className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-[12px] text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" /><span className="truncate">{r.arquivo.name}</span>
                    <button onClick={() => altera(r.chave, { arquivo: null })} className="rounded p-0.5 hover:text-red-600"><X className="h-3 w-3" /></button>
                  </span>
                ) : (
                  <div className="flex gap-1.5">
                    <ArquivoBtn icone={Camera} rot="Foto" camera onArquivo={f => altera(r.chave, { arquivo: f })} />
                    <ArquivoBtn icone={Paperclip} rot="Arquivo" onArquivo={f => altera(r.chave, { arquivo: f })} />
                  </div>
                )}
                <button onClick={() => setRetiradas(l => l.filter(x => x.chave !== r.chave))} title="Remover"
                  className="self-end rounded p-1.5 text-gray-400 hover:text-red-600 sm:self-center"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={() => setRetiradas(l => [...l, novaRetirada()])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              <Plus className="h-3.5 w-3.5" /> Adicionar retirada
            </button>
          </>
        )}
      </div>

      {/* Total apresentado − retiradas = a depositar */}
      <div className="grid grid-cols-1 gap-2 border-t border-gray-100 bg-gray-50 p-4 sm:grid-cols-3">
        <Linha rot="Total apresentado (contado)" valor={formatCurrency(travado ? fechamento?.total_apresentado : totalApresentado)} />
        <Linha rot="(−) Retiradas" valor={formatCurrency(resumo.total)} cls="text-amber-600" />
        <div className={`rounded-lg border-2 px-3 py-2 ${resumo.deposito < 0 ? 'border-red-300 bg-red-50' : 'border-blue-300 bg-white'}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">(=) Valor a depositar</p>
          <p className={`text-lg font-bold font-mono tabular-nums ${resumo.deposito < 0 ? 'text-red-600' : 'text-blue-700'}`}>{formatCurrency(resumo.deposito)}</p>
        </div>
      </div>

      {travado && <StatusTarefaDeposito fechamento={fechamento} deposito={resumo.deposito} podeCriarTarefa={podeCriarTarefa}
        clienteId={clienteId} onTarefaCriada={onTarefaCriada} showToast={showToast} />}
    </div>
  );
}

function Linha({ rot, valor, cls = 'text-gray-900' }) {
  return (
    <div className="rounded-lg px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{rot}</p>
      <p className={`text-lg font-semibold font-mono tabular-nums ${cls}`}>{valor}</p>
    </div>
  );
}

function ArquivoBtn({ icone, rot, camera = false, onArquivo }) {
  const Icone = icone;
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50">
      <Icone className="h-3.5 w-3.5" /> {rot}
      <input type="file" className="hidden" accept={camera ? 'image/*' : 'image/*,application/pdf'} {...(camera ? { capture: 'environment' } : {})}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onArquivo(f); }} />
    </label>
  );
}

// Fechamento travado: mostra a tarefa criada ou (com permissão) permite criá-la.
function StatusTarefaDeposito({ fechamento, deposito, podeCriarTarefa, clienteId, onTarefaCriada, showToast }) {
  const [resp, setResp] = useState('');
  const [criando, setCriando] = useState(false);
  if (fechamento?.tarefa_deposito_id) {
    return (
      <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-3 text-sm text-emerald-700">
        <Landmark className="h-4 w-4" /> Tarefa <strong>Depósito em banco</strong> criada para {fechamento.deposito_responsavel_nome || 'o responsável'}.
      </div>
    );
  }
  if (!podeCriarTarefa || !(deposito > 0)) return null;
  const criar = async () => {
    setCriando(true);
    try { await sangriasService.criarTarefaDeposito(fechamento.id, resp); showToast('success', 'Tarefa de depósito criada.'); onTarefaCriada(); }
    catch (e) { showToast('error', e.message); }
    finally { setCriando(false); }
  };
  return (
    <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center">
      <p className="flex-1 text-sm text-amber-700">A tarefa de depósito deste fechamento ainda não foi criada.</p>
      <div className="w-full sm:w-64"><ResponsavelDeposito clienteId={clienteId} value={resp} onChange={setResp} /></div>
      <button onClick={criar} disabled={!resp || criando}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
        {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Criar tarefa de depósito
      </button>
    </div>
  );
}

// Bloco do modal de confirmação: retiradas, valor a depositar e o responsável.
export function ResumoDepositoModal({ retiradas, totalApresentado, podeCriarTarefa, clienteId, respDeposito, setRespDeposito }) {
  const { total, deposito } = resumoRetiradas(retiradas, totalApresentado);
  if (semValorContado(totalApresentado)) {
    return <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-[12px] text-gray-500">Sem valor contado — não há depósito nem tarefa de depósito.</p>;
  }
  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="flex justify-between text-sm"><span className="text-gray-600">Retiradas antes do depósito ({retiradas.length})</span>
        <span className="font-mono font-semibold tabular-nums text-amber-700">{formatCurrency(total)}</span></div>
      <div className="flex justify-between text-sm"><span className="font-semibold text-blue-800">Valor a depositar</span>
        <span className="font-mono text-base font-bold tabular-nums text-blue-800">{formatCurrency(deposito)}</span></div>
      {podeCriarTarefa && deposito > 0 && (
        <div className="border-t border-blue-200 pt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-600">Responsável pelo depósito</p>
          <ResponsavelDeposito clienteId={clienteId} value={respDeposito} onChange={setRespDeposito} />
          <p className="mt-1.5 text-[11px] text-gray-500">
            Será criada a tarefa <strong>Depósito em banco</strong> de {formatCurrency(deposito)}, com vencimento {proximoDiaUtilTexto()} e comprovante obrigatório.
          </p>
        </div>
      )}
    </div>
  );
}
