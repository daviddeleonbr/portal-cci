// BPO · Contas a pagar — portal do cliente (Webposto e Autosystem, tipo-aware
// via session.tipoCliente). Agenda das contas lançadas pela CCI no sistema:
// as do dia, as futuras e o que já foi incluído no banco aguardando a
// autorização do cliente. Autorizar exige 'bpo_contas_pagar_autorizar'.

import { useMemo, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import PainelContasPagarBpo from '../../components/bpo/PainelContasPagarBpo';
import { useClienteSession } from '../../hooks/useAuth';
import * as qualityApi from '../../services/qualityApiService';

export default function ClienteBpoContasPagar() {
  const session = useClienteSession();
  const tipo = session?.tipoCliente === 'autosystem' ? 'autosystem' : 'webposto';
  const usuario = session?.usuario;
  const [recarga, setRecarga] = useState(0);

  const empresas = useMemo(() => (session?.clientesRede || [])
    .filter(c => c.empresa_codigo != null && c.empresa_codigo !== '' && (tipo === 'autosystem' || c.chave_api_id))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), [session?.clientesRede, tipo]);

  const cabecalho = (
    <PageHeader title="Contas a Pagar" description="Agenda de pagamentos: contas do dia, as próximas e o que a CCI já incluiu no banco para você autorizar" acoesNaLinha>
      {/* celular: só o ícone, na linha do título; computador: com o texto */}
      <button type="button" onClick={() => { qualityApi.limparCacheTransacional(); setRecarga(n => n + 1); }}
        aria-label="Atualizar" title="Atualizar"
        className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto sm:px-4">
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Atualizar</span>
      </button>
    </PageHeader>
  );

  if (!empresas.length) {
    return (
      <div>
        {cabecalho}
        <div className="rounded-2xl border border-gray-200/60 bg-white px-6 py-14 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-900">Nenhuma empresa da rede está vinculada ao sistema.</p>
          <p className="mt-1 text-xs text-gray-600">Fale com a CCI para habilitar.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {cabecalho}
      <PainelContasPagarBpo tipo={tipo} empresas={empresas} redeId={tipo === 'autosystem' ? session?.asRede?.id : null}
        podeAutorizar={(usuario?.permissoes || []).includes('bpo_contas_pagar_autorizar')}
        usuarioNome={usuario?.nome || ''} recarga={recarga} />
    </div>
  );
}
