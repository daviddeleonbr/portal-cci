// Pedidos de compra (cliente Autosystem).
// Lista os pedidos do usuário, permite criar novo (com sugestões vindas da
// análise de estoque) e liberar pedidos pendentes (integral ou parcial).

import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, RefreshCw, Plus, ShoppingCart, FileText, Search, Filter,
  Building2, Send, CheckCircle2, XCircle, Trash2, AlertCircle,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import Toast from '../../../components/ui/Toast';
import { useClienteSession } from '../../../hooks/useAuth';
import * as svc from '../../../services/pedidosCompraService';
import ModalNovoPedido from './ModalNovoPedido';
import ModalDetalhePedido from './ModalDetalhePedido';

function fmtMoeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
    .format(Number(v) || 0);
}
function fmtData(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}

export default function ClienteCompras() {
  const session = useClienteSession();
  // Autosystem não tem `session.chaveApi` direto; cai pra `chave_api_id`
  // das empresas vinculadas (que apontam pra chaves_api da rede AS).
  const chaveApiId = session?.chaveApi?.id
    || session?.clientesRede?.[0]?.chave_api_id
    || null;
  const usuario = session?.usuario;

  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [toast, setToast] = useState(null);

  // Modais
  const [modalNovo, setModalNovo] = useState(false);
  const [selecionado, setSelecionado] = useState(null);

  const carregar = async () => {
    if (!chaveApiId) {
      // Sessão ainda não carregada — encerra loading
      setLoading(false);
      return;
    }
    setLoading(true); setErro(null);
    try {
      const data = await svc.listarPedidos({ chaveApiId });
      setLista(data);
    } catch (err) { setErro(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [chaveApiId]);

  const filtrada = useMemo(() => {
    return lista.filter(p => {
      if (statusFiltro !== 'todos' && p.status !== statusFiltro) return false;
      if (busca) {
        const b = busca.toLowerCase();
        return (
          (p.fornecedor || '').toLowerCase().includes(b)
          || (p.observacoes || '').toLowerCase().includes(b)
        );
      }
      return true;
    });
  }, [lista, statusFiltro, busca]);

  const contadores = useMemo(() => {
    const c = { todos: lista.length };
    svc.STATUS.forEach(s => { c[s.key] = lista.filter(x => x.status === s.key).length; });
    return c;
  }, [lista]);

  return (
    <div>
      <PageHeader title="Compras" description="Pedidos de compra · solicitação e liberação">
        <button onClick={carregar} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
        <button onClick={() => setModalNovo(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" /> Novo pedido
        </button>
      </PageHeader>

      {/* KPIs por status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        <CardKpi label="Total" valor={contadores.todos} cor="gray" />
        {svc.STATUS.map(s => (
          <CardKpi key={s.key} label={s.label} valor={contadores[s.key] || 0} cor={s.cor} />
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-200/60 p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setStatusFiltro('todos')}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
              statusFiltro === 'todos' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            Todos <span className="text-gray-400">{contadores.todos}</span>
          </button>
          {svc.STATUS.map(s => (
            <button key={s.key} onClick={() => setStatusFiltro(s.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                statusFiltro === s.key ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {s.label} <span className="text-gray-400">{contadores[s.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por fornecedor, observação..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-[12.5px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando pedidos...</span>
        </div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{erro}</p>
        </div>
      ) : filtrada.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <ShoppingCart className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700">Nenhum pedido</p>
          <p className="text-xs text-gray-500 mt-1">Clique em "Novo pedido" pra começar.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtrada.map(p => <ItemPedido key={p.id} p={p} onClick={() => setSelecionado(p)} />)}
        </div>
      )}

      {modalNovo && (
        <ModalNovoPedido
          chaveApiId={chaveApiId}
          session={session}
          onClose={() => setModalNovo(false)}
          onCriado={(p) => {
            setLista(prev => [p, ...prev]);
            setModalNovo(false);
            setSelecionado(p);
            setToast({ tipo: 'success', mensagem: 'Pedido criado' });
          }}
        />
      )}

      {selecionado && (
        <ModalDetalhePedido
          pedidoId={selecionado.id}
          session={session}
          usuario={usuario}
          onClose={() => setSelecionado(null)}
          onAtualizado={(p) => {
            setLista(prev => prev.map(x => x.id === p.id ? p : x));
          }}
          onExcluir={async () => {
            if (!confirm('Excluir este pedido?')) return;
            try {
              await svc.excluirPedido(selecionado.id);
              setLista(prev => prev.filter(x => x.id !== selecionado.id));
              setSelecionado(null);
              setToast({ tipo: 'success', mensagem: 'Excluído' });
            } catch (err) {
              setToast({ tipo: 'error', mensagem: err.message });
            }
          }}
        />
      )}

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}
    </div>
  );
}

function CardKpi({ label, valor, cor }) {
  const cores = {
    gray:    'bg-gray-50 text-gray-700',
    blue:    'bg-blue-50 text-blue-700',
    amber:   'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose:    'bg-rose-50 text-rose-700',
    violet:  'bg-violet-50 text-violet-700',
  };
  const c = cores[cor] || cores.gray;
  return (
    <div className={`${c} rounded-xl p-3`}>
      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-xl font-bold mt-0.5">{valor}</p>
    </div>
  );
}

function ItemPedido({ p, onClick }) {
  const status = svc.STATUS.find(s => s.key === p.status) || svc.STATUS[0];
  const corStatus = {
    gray: 'bg-gray-100 text-gray-700', amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700', emerald: 'bg-emerald-100 text-emerald-700',
    rose: 'bg-rose-100 text-rose-700', violet: 'bg-violet-100 text-violet-700',
  }[status.cor];

  return (
    <button onClick={onClick}
      className="w-full bg-white rounded-2xl border border-gray-200/70 p-4 hover:border-blue-300 hover:shadow-sm transition-all text-left">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
          <ShoppingCart className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="text-[14px] font-bold text-gray-900">{p.fornecedor || 'Sem fornecedor'}</h3>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${corStatus}`}>
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-gray-500 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Empresa {p.empresa_codigo || '—'}</span>
            <span>· criado {fmtData(p.criado_em)}</span>
            {p.enviado_em && <span>· enviado {fmtData(p.enviado_em)}</span>}
          </div>
          {p.observacoes && <p className="text-[12px] text-gray-600 mt-1.5 line-clamp-1">{p.observacoes}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total solicitado</p>
          <p className="text-[15px] font-bold text-gray-900">{fmtMoeda(p.total_solicitado)}</p>
          {Number(p.total_liberado) > 0 && (
            <p className="text-[10.5px] text-emerald-700 mt-0.5">Liberado {fmtMoeda(p.total_liberado)}</p>
          )}
        </div>
      </div>
    </button>
  );
}
