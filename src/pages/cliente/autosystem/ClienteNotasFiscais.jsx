// Notas a Manifestar (Autosystem) — CONSULTA das NF-e recebidas que ainda não
// tiveram evento de manifestação registrado (nfe_evento = 0) no Autosystem.
// Somente leitura: o portal lista o que está pendente; o ato de manifestar
// continua no Autosystem.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertCircle, RefreshCw, Search, FileText, Coins, Building2, Store,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import SkeletonComercial from '../../../components/vendas/SkeletonComercial';
import EmpresaSeletorCompartilhado from '../../../components/vendas/EmpresaMultiSelect';
import { useClienteSession } from '../../../hooks/useAuth';
import { useEmpresaAtiva } from '../../../contexts/EmpresaAtivaContext';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';
import { numeroNotaDaChave, serieDaChave, formatNumeroNota } from '../../../utils/nfe';

// situacao_nfe do resumo DFe: 1 = autorizada, 3 = denegada.
const SITUACAO = {
  1: { label: 'Autorizada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  3: { label: 'Denegada',   cls: 'bg-red-50 text-red-700 border-red-200' },
};

function fmtData(iso) {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}
function fmtDoc(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return v || '—';
}

export default function ClienteNotasFiscais() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  const redeId = asRede?.id;

  const { empresaId, setEmpresaId, empresasDisponiveis } = useEmpresaAtiva();
  const empresaAtual = useMemo(
    () => empresasDisponiveis.find(c => c.id === empresaId) || null,
    [empresasDisponiveis, empresaId],
  );
  const empresasSelIds = useMemo(() => new Set(empresaId ? [empresaId] : []), [empresaId]);

  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    if (!redeId || !empresaAtual?.empresa_codigo) { setNotas([]); return; }
    setLoading(true); setErro('');
    try {
      const rows = await autosystemService.buscarNotasManifestarAutosystem(
        redeId, [Number(empresaAtual.empresa_codigo)], {},
      );
      setNotas(rows || []);
    } catch (err) {
      setErro(err.message || 'Falha ao carregar notas a manifestar');
      setNotas([]);
    } finally { setLoading(false); }
  }, [redeId, empresaAtual?.empresa_codigo]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return notas;
    return notas.filter(n =>
      (n.emitente_nome || '').toLowerCase().includes(q) ||
      (n.chave || '').includes(q) ||
      String(numeroNotaDaChave(n.chave) || '').includes(q) ||
      (n.emitente_cnpj || '').includes(q),
    );
  }, [notas, busca]);

  const kpis = useMemo(() => ({
    qtd: notas.length,
    valor: notas.reduce((s, n) => s + (Number(n.valor) || 0), 0),
  }), [notas]);

  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Notas a Manifestar" description="Manifestação do destinatário" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Sua rede ainda não tem <strong>empresas Autosystem</strong> com <code className="font-mono bg-amber-100 px-1 mx-1 rounded">empresa_codigo</code> vinculado.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Notas a Manifestar" description={asRede?.nome || 'Manifestação do destinatário'} sticky>
        {empresasDisponiveis.length > 1 && (
          <EmpresaSeletorCompartilhado
            single
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresaId(id)}
          />
        )}
        <button onClick={carregar} disabled={loading || !empresaAtual}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </PageHeader>

      {loading ? (
        <SkeletonComercial cards={2} linhas={8} comAbas={false} />
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar as notas</p>
            <p className="text-red-700 mt-1">{erro}</p>
          </div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><FileText className="h-4 w-4" /></div>
              <div>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">A manifestar</p>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{kpis.qtd}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0"><Coins className="h-4 w-4" /></div>
              <div>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Valor total</p>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{formatCurrency(kpis.valor)}</p>
              </div>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-blue-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Notas recebidas pendentes de manifestação</h3>
                <span className="text-[11px] text-gray-400">· {filtradas.length} de {notas.length}</span>
              </div>
              <div className="flex-1" />
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por emitente, chave, nº..."
                  className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left">Emissão</th>
                    <th className="px-4 py-2.5 text-left">Emitente</th>
                    <th className="px-4 py-2.5 text-right border-l border-gray-100">Nº / Série</th>
                    <th className="px-4 py-2.5 text-center border-l border-gray-100">Situação</th>
                    <th className="px-4 py-2.5 text-right border-l border-gray-100">Valor</th>
                    <th className="px-4 py-2.5 text-left border-l border-gray-100">Recebida SEFAZ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtradas.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-[12px] text-gray-400">
                      {notas.length === 0 ? 'Nenhuma nota pendente de manifestação nesta empresa.' : 'Nada corresponde à busca.'}
                    </td></tr>
                  ) : filtradas.map(n => {
                    const sit = SITUACAO[n.situacao_nfe];
                    return (
                      <tr key={n.manifestacao_grid} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-2.5 text-[12px] text-gray-700 whitespace-nowrap">{fmtData(n.data_emissao)}</td>
                        <td className="px-4 py-2.5">
                          <p className="text-[12.5px] font-medium text-gray-900 truncate max-w-[320px]">{n.emitente_nome || <span className="italic text-gray-400">—</span>}</p>
                          <p className="text-[10.5px] text-gray-400 font-mono">{fmtDoc(n.emitente_cnpj)}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right border-l border-gray-100 whitespace-nowrap">
                          <span className="font-mono tabular-nums text-[12px] text-gray-800">{formatNumeroNota(numeroNotaDaChave(n.chave))}</span>
                          <span className="text-[10px] text-gray-400"> / {serieDaChave(n.chave) ?? '—'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center border-l border-gray-100">
                          {sit
                            ? <span className={`inline-flex items-center text-[10.5px] rounded-full px-2 py-0.5 border ${sit.cls}`}>{sit.label}</span>
                            : <span className="text-[10.5px] text-gray-400">Cód {n.situacao_nfe}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right border-l border-gray-100 font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatCurrency(n.valor)}</td>
                        <td className="px-4 py-2.5 text-[11.5px] text-gray-500 border-l border-gray-100 whitespace-nowrap">{fmtData(n.data_rec_sefaz)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-gray-400 flex items-center gap-1.5">
            <Building2 className="h-3 w-3" />
            Consulta somente leitura — a manifestação (ciência/confirmação) é registrada no Autosystem.
          </p>
        </>
      )}
    </div>
  );
}
