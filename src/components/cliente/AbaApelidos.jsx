// Aba compartilhada (Webposto + Autosystem): apelidos das empresas.
// Define um nome curto por empresa (ex.: "Complexo Costa Azul" → "Costa Azul").
// Salva no servidor (compartilhado com a rede) via RPC e atualiza a sessão em
// memória. O toggle "Razão social ↔ Apelido" fica no cabeçalho do portal.
import { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, Save, CheckCircle2, Tag, Building2 } from 'lucide-react';
import { useClienteSession } from '../../hooks/useAuth';
import * as clientesService from '../../services/clientesService';
import { atualizarEmpresaNaSessao } from '../../lib/auth';

export default function AbaApelidos() {
  const session = useClienteSession();
  const empresas = useMemo(() => {
    const base = session?.clientesRede?.length ? session.clientesRede : (session?.cliente ? [session.cliente] : []);
    return [...base].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [session?.clientesRede, session?.cliente]);

  const [valores, setValores] = useState({});
  const [ordens, setOrdens] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(null);

  // Inicializa/ressincroniza os inputs a partir da sessão.
  useEffect(() => {
    const initAp = {};
    const initOrd = {};
    empresas.forEach(e => {
      initAp[e.id] = e.apelido || '';
      initOrd[e.id] = e.ordem_exibicao != null ? String(e.ordem_exibicao) : '';
    });
    setValores(initAp);
    setOrdens(initOrd);
  }, [empresas]);

  const dirty = useMemo(
    () => empresas.filter(e =>
      (valores[e.id] ?? '').trim() !== (e.apelido || '').trim()
      || String(ordens[e.id] ?? '').trim() !== (e.ordem_exibicao != null ? String(e.ordem_exibicao) : ''),
    ),
    [empresas, valores, ordens],
  );

  const salvar = async () => {
    if (dirty.length === 0) return;
    setSalvando(true);
    try {
      for (const e of dirty) {
        const novoAp = (valores[e.id] ?? '').trim();
        if (novoAp !== (e.apelido || '').trim()) {
          await clientesService.salvarApelidoEmpresa(e.id, novoAp);
          atualizarEmpresaNaSessao(e.id, { apelido: novoAp || null });
        }
        const ordemStr = String(ordens[e.id] ?? '').trim();
        if (ordemStr !== (e.ordem_exibicao != null ? String(e.ordem_exibicao) : '')) {
          const novaOrdem = ordemStr === '' ? null : Number(ordemStr);
          await clientesService.salvarOrdemEmpresa(e.id, novaOrdem);
          atualizarEmpresaNaSessao(e.id, { ordem_exibicao: Number.isFinite(novaOrdem) ? novaOrdem : null });
        }
      }
      setToast({ tipo: 'success', msg: `${dirty.length} empresa(s) salva(s)` });
    } catch (err) {
      setToast({ tipo: 'error', msg: 'Erro ao salvar: ' + (err.message || err) });
    } finally {
      setSalvando(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  if (empresas.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500">
        Nenhuma empresa disponível.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <Tag className="h-4 w-4 text-blue-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Apelidos das empresas</p>
          <p className="text-[11.5px] text-gray-500">
            Defina um nome curto e uma <strong>numeração</strong> por empresa. O <strong>Nº</strong> ordena a DRE
            "Por Empresa" (crescente/decrescente); o botão <strong>Razão social ↔ Apelido</strong> alterna a exibição.
          </p>
        </div>
        <button onClick={salvar} disabled={salvando || dirty.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar{dirty.length > 0 ? ` (${dirty.length})` : ''}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-gray-50/80 border-b border-gray-100">
            <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-2.5">Empresa</th>
              <th className="px-3 py-2.5">CNPJ</th>
              <th className="px-3 py-2.5 w-[90px]">Nº</th>
              <th className="px-3 py-2.5 w-[38%]">Apelido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {empresas.map(e => (
              <tr key={e.id} className="hover:bg-gray-50/40">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-gray-300 flex-shrink-0" />
                    <span className="text-[12.5px] font-medium text-gray-900 truncate max-w-[220px]" title={e.nome}>{e.nome || '—'}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[11.5px] text-gray-400 font-mono whitespace-nowrap">{e.cnpj || '—'}</td>
                <td className="px-3 py-2.5">
                  <input type="number" inputMode="numeric" value={ordens[e.id] ?? ''}
                    onChange={ev => setOrdens(prev => ({ ...prev, [e.id]: ev.target.value }))}
                    placeholder="—"
                    className="w-[74px] h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 text-center placeholder:text-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </td>
                <td className="px-3 py-2.5">
                  <input type="text" value={valores[e.id] ?? ''}
                    onChange={ev => setValores(prev => ({ ...prev, [e.id]: ev.target.value }))}
                    placeholder="Ex.: Costa Azul"
                    maxLength={60}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className={`px-4 py-2.5 text-[12.5px] flex items-center gap-2 ${
          toast.tipo === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {toast.tipo === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
