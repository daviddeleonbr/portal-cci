import { motion } from 'framer-motion';
import { Construction, AlertCircle } from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';

// Placeholder usado por todas as páginas do portal Autosystem enquanto
// elas são implementadas página a página com os dados reais vindos do
// servidor Autosystem (via Edge Function). NÃO USA mockdata.
export default function PaginaEmConstrucao({ titulo, descricao }) {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const asRede = session?.asRede;

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0">
            <Construction className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{titulo}</h1>
            {descricao && <p className="text-sm text-gray-500 mt-1">{descricao}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium mb-1">Em implementação</p>
            <p className="text-xs">
              Esta página fará parte do Portal Autosystem. Os dados ainda não foram
              integrados ao servidor remoto Autosystem — o conteúdo será carregado
              quando a integração específica desta página estiver pronta.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Contexto da sessão</p>
          <dl className="space-y-2">
            <div className="flex gap-3">
              <dt className="w-32 text-gray-500">Rede Autosystem</dt>
              <dd className="text-gray-900 font-medium">{asRede?.nome || '—'}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-32 text-gray-500">Empresa ativa</dt>
              <dd className="text-gray-900 font-medium">{cliente?.nome || '—'}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-32 text-gray-500">CNPJ</dt>
              <dd className="text-gray-900 font-mono text-xs">{cliente?.cnpj || '—'}</dd>
            </div>
          </dl>
        </div>
      </motion.div>
    </div>
  );
}
