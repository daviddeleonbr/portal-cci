// Card "Empresa selecionada" compartilhado pelas páginas do cliente.
// Quando há mais de uma empresa E um handler de troca, o próprio card vira
// um seletor (dropdown) — o usuário troca a empresa ali mesmo. Com uma só
// empresa (ou sem permissão), fica estático (mostra o nome da rede à direita).
import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, CheckCircle2 } from 'lucide-react';

export default function CardEmpresaAtiva({ empresa, empresas = [], onTrocar, redeNome }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const podeTrocar = typeof onTrocar === 'function' && (empresas?.length || 0) > 1;

  useEffect(() => {
    if (!podeTrocar) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [podeTrocar]);

  const conteudo = (
    <>
      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
        <Building2 className="h-5 w-5 text-white" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">
          Empresa selecionada
          {podeTrocar && <span className="ml-1 normal-case font-normal text-blue-500">· toque para trocar</span>}
        </p>
        <p className="text-sm font-semibold text-gray-900 truncate">{empresa?.nome || '—'}</p>
        <div className="flex items-center gap-3 mt-0.5">
          {empresa?.cnpj && <p className="text-[11px] text-gray-500 font-mono">{empresa.cnpj}</p>}
          {empresa?.empresa_codigo != null && empresa?.empresa_codigo !== '' && (
            <p className="text-[11px] text-gray-400">cod {empresa.empresa_codigo}</p>
          )}
        </div>
      </div>
      {podeTrocar
        ? <ChevronDown className={`h-4 w-4 text-blue-500 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        : (redeNome && <p className="text-[11px] text-blue-600 italic hidden sm:block">{redeNome}</p>)}
    </>
  );

  const boxBase = 'mb-4 rounded-xl border p-3 flex items-center gap-3';

  if (!podeTrocar) {
    return (
      <div className={`${boxBase} border-blue-100 bg-gradient-to-br from-blue-50/80 to-blue-50/40`}>
        {conteudo}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative mb-4">
      <button type="button" onClick={() => setAberto(o => !o)}
        className={`w-full rounded-xl border p-3 flex items-center gap-3 transition-colors ${
          aberto
            ? 'border-blue-300 ring-2 ring-blue-100 bg-white'
            : 'border-blue-100 bg-gradient-to-br from-blue-50/80 to-blue-50/40 hover:border-blue-300'
        }`}>
        {conteudo}
      </button>

      {aberto && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
              {empresas.map(emp => {
                const ativa = emp.id === empresa?.id;
                return (
                  <button key={emp.id} type="button"
                    onClick={() => { if (!ativa) onTrocar(emp.id); setAberto(false); }}
                    className={`w-full flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left ${ativa ? 'bg-blue-50/60' : ''}`}>
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      ativa ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <Building2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12.5px] truncate ${ativa ? 'text-blue-900 font-semibold' : 'text-gray-800'}`}>{emp.nome}</p>
                      <div className="flex items-center gap-2">
                        {emp.cnpj && <p className="text-[10px] text-gray-400 font-mono truncate">{emp.cnpj}</p>}
                        {emp.empresa_codigo != null && emp.empresa_codigo !== '' && (
                          <p className="text-[10px] text-gray-400">cod {emp.empresa_codigo}</p>
                        )}
                      </div>
                    </div>
                    {ativa && <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
