// Seleção de máscaras (DRE + Fluxo) permitidas a UMA empresa (cliente).
// Persiste na hora ao marcar/desmarcar (mesmo padrão dos toggles de relatório
// do modal). Nenhuma marcada = todas liberadas.
import { useState, useEffect } from 'react';
import { Loader2, Layers, Wallet, Check } from 'lucide-react';
import * as dreService from '../../services/mascaraDreService';
import * as fluxoService from '../../services/mascaraFluxoCaixaService';
import * as clientesService from '../../services/clientesService';

export default function SeletorMascarasCliente({ clienteId, showToast }) {
  const [dreMascaras, setDreMascaras] = useState([]);
  const [fluxoMascaras, setFluxoMascaras] = useState([]);
  const [selDre, setSelDre] = useState(() => new Set());
  const [selFluxo, setSelFluxo] = useState(() => new Set());
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(null); // 'dre' | 'fluxo' | null

  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    (async () => {
      setCarregando(true);
      try {
        const [dre, fluxo, atuais] = await Promise.all([
          dreService.listarMascaras().catch(() => []),
          fluxoService.listarMascaras().catch(() => []),
          clientesService.listarMascarasDoCliente(clienteId).catch(() => ({ dre: [], fluxo: [] })),
        ]);
        if (!vivo) return;
        setDreMascaras(dre || []);
        setFluxoMascaras(fluxo || []);
        setSelDre(new Set(atuais.dre || []));
        setSelFluxo(new Set(atuais.fluxo || []));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [clienteId]);

  const persistir = async (tipo, novoSet) => {
    setSalvando(tipo);
    try {
      const ids = [...novoSet];
      if (tipo === 'dre') await clientesService.definirMascarasClienteDre(clienteId, ids);
      else await clientesService.definirMascarasClienteFluxo(clienteId, ids);
      showToast?.('success', 'Máscaras da empresa atualizadas');
    } catch (e) {
      showToast?.('error', e.message || 'Falha ao salvar máscaras');
    } finally {
      setSalvando(null);
    }
  };

  const toggle = (tipo, id) => {
    if (tipo === 'dre') {
      const novo = new Set(selDre);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      setSelDre(novo); persistir('dre', novo);
    } else {
      const novo = new Set(selFluxo);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      setSelFluxo(novo); persistir('fluxo', novo);
    }
  };

  const Secao = ({ tipo, titulo, Icone, mascaras, sel }) => (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Icone className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">{titulo}</span>
        {salvando === tipo && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
        <span className="text-[10.5px] text-gray-400">{sel.size === 0 ? '— todas liberadas' : `${sel.size} marcada(s)`}</span>
      </div>
      {mascaras.length === 0 ? (
        <p className="text-[11.5px] text-gray-400 px-1">Nenhuma máscara cadastrada.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {mascaras.map(m => {
            const on = sel.has(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggle(tipo, m.id)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
                  on ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                {on && <Check className="h-3 w-3" />}
                {m.nome}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-gray-500 py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando máscaras...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400">
        Marque as máscaras permitidas a esta empresa. <strong>Nenhuma marcada = todas liberadas.</strong>
      </p>
      <Secao tipo="dre"   titulo="DRE"             Icone={Layers} mascaras={dreMascaras}   sel={selDre} />
      <Secao tipo="fluxo" titulo="Fluxo de Caixa"  Icone={Wallet} mascaras={fluxoMascaras} sel={selFluxo} />
    </div>
  );
}
