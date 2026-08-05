// Hub único "Editar rede": consolida, em abas, todas as parametrizações da
// rede. As parametrizações pesadas (que já têm modal próprio) são abertas pela
// aba; as inline (máscaras) ficam embutidas. Webposto e Autosystem têm abas
// diferentes.
import { useState } from 'react';
import {
  X, Building2, Link2, Landmark, CreditCard, Layers, Network,
  Database, Boxes, Wallet, Trash2, ExternalLink, Settings2,
} from 'lucide-react';
import SeletorMascarasRede from './SeletorMascarasRede';

// Painel padrão para uma parametrização que abre em modal próprio.
function PainelAbrir({ Icone, titulo, descricao, botao, onAbrir, danger }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
          <Icone className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{titulo}</p>
          <p className="text-[12px] text-gray-500 mt-0.5 max-w-md">{descricao}</p>
        </div>
      </div>
      <button onClick={onAbrir}
        className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
          danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}>
        {danger ? <Trash2 className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />} {botao}
      </button>
    </div>
  );
}

export default function ModalEditarRedeHub({
  open, tipo, rede, onClose, showToast,
  // Webposto
  onVincularEmpresas, onContasBancarias, onAdministradoras,
  // Autosystem
  onParametrizarRede, onImportarEmpresas, onGrupos, onContasAS, onContasReceberAS, onExcluirRede,
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
        { key: 'grupos',    label: 'Grupos de produto',   icon: Boxes },
        { key: 'contas',    label: 'Contas / recebimento', icon: Wallet },
        { key: 'receber',   label: 'Contas a receber',    icon: CreditCard },
        { key: 'mascaras',  label: 'Máscaras',            icon: Layers },
      ];
  const [aba, setAba] = useState(abas[0].key);

  if (!open || !rede) return null;

  const redeMascara = webposto
    ? { chaveApiId: rede.chaveApiId, asRedeId: null }
    : { chaveApiId: null, asRedeId: rede.id };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
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
          {aba === 'mascaras' && (
            <div>
              <p className="text-xs font-semibold text-gray-900 mb-2">Máscaras permitidas (rede)</p>
              <SeletorMascarasRede rede={redeMascara} showToast={showToast} />
            </div>
          )}

          {webposto && aba === 'empresas' && (
            <PainelAbrir Icone={Building2} titulo="Empresas da rede"
              descricao="Vincule/importe as empresas do Webposto para esta rede."
              botao="Vincular empresas" onAbrir={onVincularEmpresas} />
          )}
          {webposto && aba === 'contas' && (
            <PainelAbrir Icone={Landmark} titulo="Contas bancárias"
              descricao="Classifique as contas bancárias/caixa usadas no Fluxo de Caixa."
              botao="Classificar contas" onAbrir={onContasBancarias} />
          )}
          {webposto && aba === 'admin' && (
            <PainelAbrir Icone={CreditCard} titulo="Administradoras (cartões frota)"
              descricao="Cadastre as administradoras de cartões frota da rede."
              botao="Abrir administradoras" onAbrir={onAdministradoras} />
          )}

          {!webposto && aba === 'rede' && (
            <PainelAbrir Icone={Settings2} titulo="Parametrização da rede"
              descricao="Nome, slug e credenciais de conexão (TCP/HTTPS) do Autosystem."
              botao="Editar parametrização" onAbrir={onParametrizarRede} />
          )}
          {!webposto && aba === 'empresas' && (
            <PainelAbrir Icone={Database} titulo="Empresas"
              descricao="Importe as empresas do servidor Autosystem para a rede."
              botao="Importar empresas" onAbrir={onImportarEmpresas} />
          )}
          {!webposto && aba === 'grupos' && (
            <PainelAbrir Icone={Boxes} titulo="Grupos de produto"
              descricao="Classifique os grupos de produto (combustível, automotivos, conveniência)."
              botao="Classificar grupos" onAbrir={onGrupos} />
          )}
          {!webposto && aba === 'contas' && (
            <PainelAbrir Icone={Wallet} titulo="Contas / formas de recebimento"
              descricao="Classifique as contas do plano de contas (formas de recebimento)."
              botao="Classificar contas" onAbrir={onContasAS} />
          )}
          {!webposto && aba === 'receber' && (
            <PainelAbrir Icone={CreditCard} titulo="Contas a receber"
              descricao="Prefixos por categoria (cartões, cheques, notas, faturas)."
              botao="Classificar contas a receber" onAbrir={onContasReceberAS} />
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
