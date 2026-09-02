// Botão para alternar, EM NÍVEL DE PÁGINA, entre exibir a razão social e o
// apelido das empresas. Usa a mesma preferência global reativa (apelidoPref),
// então o estado fica consistente entre páginas e abas — mas o controle passa
// a estar acessível direto na barra de cada relatório.
//
// Props:
//   - somenteQuandoHaApelidos: se true (padrão), some quando nenhuma empresa
//     tem apelido; passe a lista em `empresas` para essa checagem.
//   - empresas: lista opcional de empresas p/ decidir se há apelidos.

import { Tag } from 'lucide-react';
import { useUsarApelido, toggleUsarApelido } from '../../lib/apelidoPref';

export default function ApelidoToggle({ empresas = null, somenteQuandoHaApelidos = true, className = '' }) {
  const usarApelido = useUsarApelido();

  const temApelidos = !somenteQuandoHaApelidos
    || empresas == null
    || (Array.isArray(empresas) && empresas.some(e => (e?.apelido || '').trim() !== ''));
  if (!temApelidos) return null;

  return (
    <button type="button" onClick={toggleUsarApelido}
      title={usarApelido ? 'Exibindo apelidos — clique para razão social' : 'Exibindo razão social — clique para apelidos'}
      className={`inline-flex items-center gap-1.5 rounded-lg border h-8 px-2.5 text-[11px] font-semibold transition-colors ${
        usarApelido
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      } ${className}`}>
      <Tag className="h-3.5 w-3.5" />
      <span>{usarApelido ? 'Apelidos' : 'Razão social'}</span>
    </button>
  );
}
