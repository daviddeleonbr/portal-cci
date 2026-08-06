// Hub único "Editar rede": consolida, em abas, todas as parametrizações da
// rede. As parametrizações pesadas (que já têm modal próprio) são abertas pela
// aba; as inline (máscaras) ficam embutidas. Webposto e Autosystem têm abas
// diferentes.
import { useState, useEffect } from 'react';
import {
  X, Link2, Landmark, CreditCard, Layers, Network,
  Database, Wallet, Trash2, Settings2,
  BarChart3, TrendingUp, Loader2,
} from 'lucide-react';
import SeletorMascarasRede from './SeletorMascarasRede';

// Aba "Relatórios" (Autosystem) — toggles DRE/Fluxo por rede. Estado local
// inicializado da rede (montada com key={rede.id}, sem efeito de sync).
function RelatoriosTabAS({ rede, onToggleRelatorio, togglesAtivos }) {
  const [flags, setFlags] = useState({ exibir_dre: !!rede.exibir_dre, exibir_fluxo_caixa: !!rede.exibir_fluxo_caixa });
  const toggleFlag = (campo) => {
    setFlags(f => ({ ...f, [campo]: !f[campo] }));
    onToggleRelatorio?.(rede, campo);
  };
  const itens = [
    { campo: 'exibir_dre', Icone: BarChart3, label: 'DRE', desc: 'Demonstração do resultado do exercício' },
    { campo: 'exibir_fluxo_caixa', Icone: TrendingUp, label: 'Fluxo de Caixa', desc: 'Entradas e saídas por período' },
  ];
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-gray-500 mb-1">Controle o que a rede pode visualizar no portal do cliente.</p>
      {itens.map(({ campo, Icone, label, desc }) => {
        const on = flags[campo];
        const loading = togglesAtivos?.has(`${rede.id}:${campo}`);
        return (
          <div key={campo} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
            <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><Icone className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-[11px] text-gray-500">{desc}</p>
            </div>
            <button onClick={() => toggleFlag(campo)} disabled={loading}
              className={`relative h-6 w-11 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-blue-600' : 'bg-gray-300'} disabled:opacity-60`}>
              {loading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                : <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function ModalEditarRedeHub({
  open, tipo, rede, onClose, showToast,
  onExcluirRede, onToggleRelatorio, togglesAtivos,
  // Painéis inline (sub-modais/wizard em modo inline) por aba, montados pelo pai
  paineis,
}) {
  const webposto = tipo === 'webposto';
  const abas = webposto
    ? [
        { key: 'empresas',  label: 'Empresas',            icon: Link2 },
        { key: 'contas',    label: 'Contas bancárias',    icon: Landmark },
        { key: 'admin',     label: 'Administradoras',     icon: CreditCard },
        { key: 'mascaras',  label: 'Máscaras',            icon: Layers },
      ]
    : [
        { key: 'rede',      label: 'Parametrização da rede', icon: Settings2 },
        { key: 'empresas',  label: 'Empresas',            icon: Database },
        { key: 'contas',    label: 'Contas / recebimento', icon: Wallet },
        { key: 'relatorios', label: 'Relatórios',         icon: BarChart3 },
        { key: 'mascaras',  label: 'Máscaras',            icon: Layers },
      ];
  const [aba, setAba] = useState(abas[0].key);

  // Ao (re)abrir, ou trocar de rede/tipo, volta sempre pra primeira aba —
  // senão o estado fica preso na aba da rede anterior (ex.: "Sem conteúdo").
  useEffect(() => {
    if (open) setAba(abas[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tipo, rede?.id]);

  if (!open || !rede) return null;

  const redeMascara = webposto
    ? { chaveApiId: rede.chaveApiId, asRedeId: null }
    : { chaveApiId: null, asRedeId: rede.id };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white flex-shrink-0">
            <Network className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">Editar rede</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {rede.nome} · {webposto ? 'Webposto' : 'Autosystem'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 -mr-1 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-5 w-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
          {abas.map(a => {
            const Icon = a.icon;
            const ativo = aba === a.key;
            return (
              <button key={a.key} onClick={() => setAba(a.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                  ativo ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icon className="h-3.5 w-3.5" /> {a.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">
          {aba === 'mascaras' ? (
            <div>
              <p className="text-xs font-semibold text-gray-900 mb-2">Máscaras permitidas (rede)</p>
              <SeletorMascarasRede rede={redeMascara} showToast={showToast} />
            </div>
          ) : aba === 'relatorios' ? (
            <RelatoriosTabAS key={rede.id} rede={rede} onToggleRelatorio={onToggleRelatorio} togglesAtivos={togglesAtivos} />
          ) : (
            /* Config inline montada pelo pai — só a aba ativa monta */
            paineis?.[aba] || <p className="text-sm text-gray-400">Sem conteúdo.</p>
          )}
        </div>

        {/* Footer (Autosystem: excluir rede) */}
        {!webposto && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center">
            <button onClick={onExcluirRede}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-red-600 hover:text-red-700">
              <Trash2 className="h-3.5 w-3.5" /> Excluir rede
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
