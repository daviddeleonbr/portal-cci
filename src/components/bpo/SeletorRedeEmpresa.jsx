// "1. Rede" e "2. Empresa" das consultas do admin. A empresa só libera depois da
// rede; "Todas as empresas da rede" também precisa ser escolhida.
import { useId, useMemo } from 'react';
import { Building2 } from 'lucide-react';
import SeletorRedeBPO from '../ui/SeletorRedeBPO';
import { TODAS_DA_REDE, empresasDaRede } from '../../utils/selecaoRede';

const rot = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500';

// `admin`: { chavesApi, redesAutosystem, contagensPorRede, selecao, onSelecao }
// `semTodas`: só uma empresa (sem "Todas as empresas da rede").
export default function SeletorRedeEmpresa({ empresas, admin, onTrocar, semTodas = false }) {
  const id = useId();
  const { rede, empresa } = admin.selecao;
  const lista = useMemo(() => empresasDaRede(empresas, rede), [empresas, rede]);
  const mudar = (s) => { onTrocar?.(); admin.onSelecao(s); };
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <label className={rot}>1. Rede</label>
        <SeletorRedeBPO chavesApi={admin.chavesApi} redesAutosystem={admin.redesAutosystem} contagensPorRede={admin.contagensPorRede}
          value={rede} onChange={r => mudar({ rede: r, empresa: '' })} />
      </div>
      <div className="min-w-0">
        <label htmlFor={id} className={rot}>2. Empresa</label>
        <select id={id} data-empresa-consulta="" value={empresa} disabled={!rede} onChange={e => mudar({ rede, empresa: e.target.value })}
          className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400">
          <option value="">{rede ? 'Selecione uma empresa...' : 'Escolha a rede primeiro'}</option>
          {!semTodas && lista.length > 1 && <option value={TODAS_DA_REDE}>Todas as empresas da rede</option>}
          {lista.map(e => <option key={e.id} value={e.id}>{e.nome || e.razao_social || 'Empresa'}</option>)}
        </select>
      </div>
    </div>
  );
}

export function AvisoSelecao({ rede, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <Building2 className="mb-3 h-8 w-8 text-gray-300" aria-hidden="true" />
      <p className="text-sm font-semibold text-gray-900">{rede ? 'Selecione a empresa' : 'Selecione a rede e a empresa'}</p>
      <p className="mt-1 text-xs text-gray-600">{children}</p>
    </div>
  );
}
