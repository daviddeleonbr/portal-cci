// Análise de Estoques — Webposto (placeholder).
// A implementação será adicionada após validar o autosystem.

import { Boxes } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';

export default function ClienteEstoques() {
  return (
    <div>
      <PageHeader title="Análise de Estoques" description="Snapshot do estoque atual por produto" />
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 p-12 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-500/15 mb-3">
          <Boxes className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Em construção</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          A análise de estoques para Webposto será disponibilizada em breve.
        </p>
      </div>
    </div>
  );
}
