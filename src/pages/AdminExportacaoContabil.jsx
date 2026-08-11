// Ferramentas → Exportação Contábil (admin nível 3)
// Ferramenta para exportar os dados financeiros dos CLIENTES da CCI: busca a
// tabela `movto` do Autosystem (via túnel Cloudflare), faz o de/para das contas
// gerenciais → contas contábeis (plano importado) e gera o arquivo no layout da
// contabilidade do cliente.
//
// Abas: Plano Contábil (cadastro/import) · De/Para · Exportação.
import { useState } from 'react';
import { FolderTree, ArrowLeftRight, FileDown } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import AbaPlanoContabil from '../components/exportacaoContabil/AbaPlanoContabil';
import AbaDePara from '../components/exportacaoContabil/AbaDePara';
import AbaExportacao from '../components/exportacaoContabil/AbaExportacao';

const ABAS = [
  { key: 'plano',     label: 'Plano Contábil', icon: FolderTree },
  { key: 'de-para',   label: 'De/Para',        icon: ArrowLeftRight },
  { key: 'exportar',  label: 'Exportação',     icon: FileDown },
];

export default function AdminExportacaoContabil() {
  const [aba, setAba] = useState('plano');
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader
        title="Exportação Contábil"
        description="Exporte os dados financeiros dos clientes para o layout da contabilidade"
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-white/10 mb-5 overflow-x-auto">
        {ABAS.map(a => {
          const Icon = a.icon;
          const ativo = aba === a.key;
          return (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                ativo ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                      : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}>
              <Icon className="h-4 w-4" /> {a.label}
              {a.breve && <span className="ml-1 rounded-full bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">em breve</span>}
            </button>
          );
        })}
      </div>

      {aba === 'plano' && <AbaPlanoContabil showToast={showToast} />}
      {aba === 'de-para' && <AbaDePara showToast={showToast} />}
      {aba === 'exportar' && <AbaExportacao showToast={showToast} />}
    </div>
  );
}
