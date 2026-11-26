// "1. Rede" e "2. Empresa" das consultas do admin. A empresa só libera depois da
// rede; "Todas as empresas da rede" também precisa ser escolhida.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import SeletorRedeBPO from '../ui/SeletorRedeBPO';
import { TODAS_DA_REDE, empresasDaRede } from '../../utils/selecaoRede';

const rot = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500';

// `admin`: { chavesApi, redesAutosystem, contagensPorRede, selecao, onSelecao }
// `semTodas`: só uma empresa (sem "Todas as empresas da rede").
// `multipla`: várias empresas; a seleção vem/vai em `selecao.empresas` (array de ids).
export default function SeletorRedeEmpresa({ empresas, admin, onTrocar, semTodas = false, multipla = false }) {
  const id = useId();
  const { rede, empresa } = admin.selecao;
  const lista = useMemo(() => empresasDaRede(empresas, rede), [empresas, rede]);
  const mudar = (s) => { onTrocar?.(); admin.onSelecao(s); };
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <label className={rot}>1. Rede</label>
        <SeletorRedeBPO chavesApi={admin.chavesApi} redesAutosystem={admin.redesAutosystem} contagensPorRede={admin.contagensPorRede}
          value={rede} onChange={r => mudar({ rede: r, empresa: '', empresas: [] })} />
      </div>
      <div className="min-w-0">
        <label htmlFor={id} className={rot}>2. {multipla ? 'Empresas' : 'Empresa'}</label>
        {multipla ? (
          <EmpresasMulti id={id} lista={lista} rede={rede} valor={admin.selecao.empresas || []}
            onAplicar={ids => mudar({ rede, empresa: '', empresas: ids })} />
        ) : (
        <select id={id} data-empresa-consulta="" value={empresa} disabled={!rede} onChange={e => mudar({ rede, empresa: e.target.value })}
          className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400">
          <option value="">{rede ? 'Selecione uma empresa...' : 'Escolha a rede primeiro'}</option>
          {!semTodas && lista.length > 1 && <option value={TODAS_DA_REDE}>Todas as empresas da rede</option>}
          {lista.map(e => <option key={e.id} value={e.id}>{e.nome || e.razao_social || 'Empresa'}</option>)}
        </select>
        )}
      </div>
    </div>
  );
}

const nomeEmp = (e) => e?.nome || e?.razao_social || 'Empresa';

// Várias empresas da rede: marca na lista e aplica (o relatório só recarrega no Aplicar).
function EmpresasMulti({ id, lista, rede, valor, onAplicar }) {
  const [aberto, setAberto] = useState(false);
  const [marcadas, setMarcadas] = useState(() => new Set(valor));
  const ref = useRef(null);
  const abrir = () => { setMarcadas(new Set(valor)); setAberto(a => !a); };
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  const todas = lista.length > 0 && lista.every(e => marcadas.has(e.id));
  const alternar = (eid) => setMarcadas(s => { const n = new Set(s); if (n.has(eid)) n.delete(eid); else n.add(eid); return n; });
  const aplicar = () => { onAplicar(lista.filter(e => marcadas.has(e.id)).map(e => e.id)); setAberto(false); };
  const escolhidas = lista.filter(e => valor.includes(e.id));
  const texto = !rede ? 'Escolha a rede primeiro'
    : !escolhidas.length ? 'Selecione as empresas...'
    : escolhidas.length === lista.length && lista.length > 1 ? `Todas as empresas da rede (${lista.length})`
    : escolhidas.length === 1 ? nomeEmp(escolhidas[0])
    : `${escolhidas.length} de ${lista.length} empresas`;
  const caixa = (on) => `flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white'}`;
  return (
    <div ref={ref} className="relative">
      <button id={id} type="button" data-empresa-consulta="" disabled={!rede} onClick={abrir} aria-haspopup="listbox" aria-expanded={aberto}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 text-left text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400">
        <span className={`truncate ${escolhidas.length ? 'text-gray-900' : 'text-gray-500'}`}>{texto}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      </button>
      {aberto && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto py-1">
            {lista.length > 1 && (
              <button type="button" role="option" aria-selected={todas} onClick={() => setMarcadas(todas ? new Set() : new Set(lista.map(e => e.id)))}
                className="flex w-full items-center gap-2.5 border-b border-gray-100 px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50">
                <span className={caixa(todas)}>{todas && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}</span>
                Todas as empresas da rede
              </button>
            )}
            {lista.map(e => {
              const on = marcadas.has(e.id);
              return (
                <button key={e.id} type="button" role="option" aria-selected={on} onClick={() => alternar(e.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                  <span className={caixa(on)}>{on && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}</span>
                  <span className="truncate">{nomeEmp(e)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2">
            <span className="text-xs text-gray-500">{marcadas.size} de {lista.length} marcada{marcadas.size === 1 ? '' : 's'}</span>
            <button type="button" onClick={aplicar} disabled={!marcadas.size}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Aplicar</button>
          </div>
        </div>
      )}
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
