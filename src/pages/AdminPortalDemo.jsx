// Tela admin: seletor de rede pra acessar o portal cliente em MODO DEMO.
// Mostra todas as redes (chaves_api) com nomes FICTÍCIOS — admin escolhe
// uma e cai no portal cliente como demo. Dados numéricos são reais; só
// os nomes são substituídos.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, Eye, Network, Sparkles } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import { supabase } from '../lib/supabase';
import { acessarPortalDemo } from '../lib/auth';
import { mascararRede } from '../utils/demoMascarar';

export default function AdminPortalDemo() {
  const navigate = useNavigate();
  const [redes, setRedes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [acessando, setAcessando] = useState(null); // chaveApiId em andamento
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // Lista todas as chaves_api ativas
        const { data, error } = await supabase
          .from('chaves_api')
          .select('id, nome, provedor, clientes(id)')
          .order('nome', { ascending: true });
        if (error) throw error;
        // Mascara nomes pra exibição
        const mascaradas = (data || []).map(r => ({
          id: r.id,
          nomeOriginal: r.nome,
          nomeFicticio: mascararRede(r).nome,
          provedor: r.provedor || 'quality',
          qtdEmpresas: (r.clientes || []).length,
        }));
        setRedes(mascaradas);
      } catch (err) {
        setErro(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const entrarNoPortal = async (chaveApiId) => {
    setAcessando(chaveApiId);
    try {
      await acessarPortalDemo({ chaveApiId });
      navigate('/cliente/webposto/dashboard');
    } catch (err) {
      setToast({ tipo: 'error', mensagem: err.message });
    } finally {
      setAcessando(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Portal cliente · Modo demo"
        description="Acessa o portal do cliente com nomes fictícios — dados numéricos reais. Útil pra apresentações comerciais." />

      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-violet-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-violet-900">Como funciona o modo demo</p>
          <ul className="text-[12.5px] text-violet-800 mt-1 space-y-0.5 list-disc list-inside">
            <li>Nome da rede, empresas, vendedores, fornecedores e clientes são <strong>mascarados</strong></li>
            <li>Valores numéricos (vendas, custos, totais) são <strong>reais</strong></li>
            <li>Use o botão "Voltar pro admin" no banner topo do portal pra sair do modo demo</li>
          </ul>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
          <span className="text-sm">Carregando redes...</span>
        </div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{erro}</p>
        </div>
      ) : redes.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-sm text-amber-800">
          Nenhuma rede cadastrada.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {redes.map(r => (
            <div key={r.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-violet-300 hover:shadow-md transition-all">
              <div className="p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Network className="h-4.5 w-4.5 text-violet-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-gray-900 truncate">{r.nomeFicticio}</p>
                    <p className="text-[10.5px] text-gray-400 truncate" title={`Rede real: ${r.nomeOriginal}`}>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1 w-1 rounded-full bg-violet-400" />
                        rede real: {r.nomeOriginal}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-gray-500 mb-3">
                  <span>{r.qtdEmpresas} empresa(s)</span>
                  <span className="text-gray-300">·</span>
                  <span className="font-mono uppercase">{r.provedor}</span>
                </div>
                <button onClick={() => entrarNoPortal(r.id)}
                  disabled={acessando === r.id || r.qtdEmpresas === 0}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-[12px] font-semibold text-white transition-colors">
                  {acessando === r.id ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Entrando...</>
                  ) : (
                    <><Eye className="h-3.5 w-3.5" /> Acessar portal demo</>
                  )}
                </button>
                {r.qtdEmpresas === 0 && (
                  <p className="text-[10px] text-gray-400 mt-1.5 text-center">Sem empresas cadastradas</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}
    </div>
  );
}
