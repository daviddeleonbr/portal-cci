// Admin: lista solicitações de orçamento vindas da landing page.

import { useEffect, useState, useMemo } from 'react';
import {
  Loader2, RefreshCw, User, Phone, Mail, Building2,
  FileText, Sparkles, MessageSquare, Trash2, Send, Printer, ShoppingBag,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import * as svc from '../services/orcamentoSolicitacoesService';

function fmtMoeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(Number(v) || 0);
}
function fmtNumero(v) { return new Intl.NumberFormat('pt-BR').format(Number(v) || 0); }
function fmtDataHora(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}

export default function AdminOrcamentoSolicitacoes() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [statusFiltro, setStatusFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [selecionada, setSelecionada] = useState(null);
  const [toast, setToast] = useState(null);

  const carregar = async () => {
    setLoading(true); setErro(null);
    try {
      const data = await svc.listarSolicitacoes();
      setLista(data);
    } catch (err) { setErro(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, []);

  const filtradas = useMemo(() => {
    return lista.filter(s => {
      if (statusFiltro !== 'todas' && s.status !== statusFiltro) return false;
      if (busca) {
        const b = busca.toLowerCase();
        return (
          (s.nome || '').toLowerCase().includes(b)
          || (s.whatsapp || '').toLowerCase().includes(b)
          || (s.email || '').toLowerCase().includes(b)
          || (s.postos || []).some(p => (p.nome || '').toLowerCase().includes(b))
        );
      }
      return true;
    });
  }, [lista, statusFiltro, busca]);

  const contadores = useMemo(() => {
    const c = { total: lista.length };
    svc.STATUS_OPCOES.forEach(s => { c[s.key] = lista.filter(x => x.status === s.key).length; });
    return c;
  }, [lista]);

  return (
    <div>
      <PageHeader title="Solicitações de Orçamento" description="Leads vindos do site (landing page)">
        <button onClick={carregar} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        <CardKpi label="Total" valor={contadores.total} cor="gray" />
        {svc.STATUS_OPCOES.map(s => (
          <CardKpi key={s.key} label={s.label} valor={contadores[s.key] || 0} cor={s.cor} />
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/60 p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setStatusFiltro('todas')}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
              statusFiltro === 'todas' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            Todas <span className="text-gray-400">{contadores.total}</span>
          </button>
          {svc.STATUS_OPCOES.map(s => (
            <button key={s.key} onClick={() => setStatusFiltro(s.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                statusFiltro === s.key ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {s.label} <span className="text-gray-400">{contadores[s.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px]">
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, WhatsApp, empresa..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando solicitações...</span>
        </div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          Erro: {erro}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700">Nenhuma solicitação</p>
          <p className="text-xs text-gray-500 mt-1">Solicitações vindas da landing aparecem aqui.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtradas.map(s => (
            <ItemSolicitacao key={s.id} s={s} onClick={() => setSelecionada(s)} />
          ))}
        </div>
      )}

      {selecionada && (
        <ModalDetalhe s={selecionada} onClose={() => setSelecionada(null)}
          onMudar={async (payload) => {
            try {
              const atualizada = await svc.atualizarSolicitacao(selecionada.id, payload);
              setLista(prev => prev.map(x => x.id === atualizada.id ? atualizada : x));
              setSelecionada(atualizada);
              setToast({ tipo: 'success', mensagem: 'Atualizado' });
            } catch (err) {
              setToast({ tipo: 'error', mensagem: err.message });
            }
          }}
          onExcluir={async () => {
            if (!confirm('Excluir esta solicitação?')) return;
            try {
              await svc.excluirSolicitacao(selecionada.id);
              setLista(prev => prev.filter(x => x.id !== selecionada.id));
              setSelecionada(null);
              setToast({ tipo: 'success', mensagem: 'Excluída' });
            } catch (err) {
              setToast({ tipo: 'error', mensagem: err.message });
            }
          }} />
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
    violet:  'bg-violet-50 text-violet-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose:    'bg-rose-50 text-rose-700',
  };
  const c = cores[cor] || cores.gray;
  return (
    <div className={`${c} rounded-xl p-3`}>
      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-xl font-bold mt-0.5">{valor}</p>
    </div>
  );
}

function ItemSolicitacao({ s, onClick }) {
  const statusInfo = svc.STATUS_OPCOES.find(o => o.key === s.status) || svc.STATUS_OPCOES[0];
  const corStatus = {
    blue: 'bg-blue-100 text-blue-700', amber: 'bg-amber-100 text-amber-700',
    violet: 'bg-violet-100 text-violet-700', emerald: 'bg-emerald-100 text-emerald-700',
    rose: 'bg-rose-100 text-rose-700', gray: 'bg-gray-100 text-gray-700',
  }[statusInfo.cor];

  const totalPostos = (s.postos || []).length;
  const totalLitros = (s.postos || []).reduce((acc, p) => acc + Number(p.litrosMes || 0), 0);
  const totalFat = (s.postos || []).reduce((acc, p) => acc + Number(p.faturamentoMes || 0), 0);

  return (
    <button onClick={onClick}
      className="w-full bg-white rounded-2xl border border-gray-200/70 p-4 hover:border-blue-300 hover:shadow-sm transition-all text-left">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
          {(s.nome || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="text-[14px] font-bold text-gray-900">{s.nome}</h3>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${corStatus}`}>
              {statusInfo.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-gray-500 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {s.whatsapp}</span>
            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {s.email}</span>
            <span>· {fmtDataHora(s.criada_em)}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">{totalPostos} empresa{totalPostos !== 1 ? 's' : ''}</p>
          <p className="text-[13px] font-bold text-gray-800">{fmtNumero(totalLitros)} L/mês</p>
          <p className="text-[10.5px] text-gray-500 mt-0.5">{fmtMoeda(totalFat)} fat.</p>
        </div>
      </div>
    </button>
  );
}

function ModalDetalhe({ s, onClose, onMudar, onExcluir }) {
  const [obs, setObs] = useState(s.observacoes_admin || '');
  const [status, setStatus] = useState(s.status);

  const whatsLink = `https://wa.me/55${(s.whatsapp || '').replace(/\D/g, '')}`;
  const postos = s.postos || [];

  return (
    <Modal open onClose={onClose} title={`Solicitação · ${s.nome}`} size="lg">
      <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-2">

        <Secao titulo="Solicitante" icone={User}>
          <Linha label="Nome" valor={s.nome} />
          <Linha label="WhatsApp" valor={
            <a href={whatsLink} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{s.whatsapp}</a>
          } />
          <Linha label="E-mail" valor={
            <a href={`mailto:${s.email}`} className="text-blue-600 hover:underline">{s.email}</a>
          } />
          <Linha label="Recebida em" valor={fmtDataHora(s.criada_em)} />
        </Secao>

        <Secao titulo="O que deseja melhorar" icone={Sparkles}>
          <p className="text-[13px] text-gray-700 whitespace-pre-wrap">{s.desejo || '—'}</p>
        </Secao>

        <Secao titulo={`Empresas (${postos.length})`} icone={Building2}>
          {postos.length === 0 ? (
            <p className="text-[12px] text-gray-500 italic">Nenhuma empresa informada.</p>
          ) : (
            <div className="space-y-3">
              {postos.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
                  <p className="text-[13px] font-bold text-blue-700 mb-2 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> {p.nome || `Empresa ${idx + 1}`}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <Linha label="Litros/mês" valor={fmtNumero(p.litrosMes)} />
                    <Linha label="Faturamento/mês" valor={fmtMoeda(p.faturamentoMes)} />
                    <Linha label="Contas bancárias" valor={fmtNumero(p.contasBancarias)} />
                    <Linha label="Funcionários" valor={fmtNumero(p.funcionarios)} />
                    <Linha label="Custo médio func." valor={fmtMoeda(p.custoMedioFuncionario)} />
                    <Linha label="Cartão frota" valor={p.possuiCartaoFrota ? (p.cartoesFrota || 'Sim') : 'Não'} />
                    <Linha label={<span className="inline-flex items-center gap-1"><ShoppingBag className="h-3 w-3" /> Conveniência</span>}
                      valor={p.possuiConveniencia ? fmtMoeda(p.faturamentoConveniencia) : 'Não'} />
                  </div>
                  {p.adquirentes && <Linha label="Adquirentes" valor={p.adquirentes} multi />}
                </div>
              ))}
            </div>
          )}
        </Secao>

        <Secao titulo="Análise (admin)" icone={MessageSquare}>
          <label className="block">
            <span className="block text-[11px] font-semibold text-gray-600 mb-1 uppercase tracking-wider">Status</span>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {svc.STATUS_OPCOES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <label className="block mt-3">
            <span className="block text-[11px] font-semibold text-gray-600 mb-1 uppercase tracking-wider">Observações</span>
            <textarea value={obs} onChange={e => setObs(e.target.value)}
              rows={3} placeholder="Notas internas..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none" />
          </label>
          <button onClick={() => onMudar({ status, observacoesAdmin: obs })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-[13px] font-semibold transition-colors">
            <Send className="h-3.5 w-3.5" /> Salvar análise
          </button>
        </Secao>
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-gray-100">
        <button onClick={onExcluir}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 px-3 py-1.5 text-[12.5px] font-semibold transition-colors">
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-1.5 text-[12.5px] font-semibold transition-colors">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
          <a href={whatsLink} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-[12.5px] font-semibold transition-colors">
            <Phone className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </div>
      </div>
    </Modal>
  );
}

function Secao({ titulo, icone: Icone, children }) {
  return (
    <div className="rounded-xl border border-gray-200/70 bg-white p-4">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
        <Icone className="h-4 w-4 text-blue-600" />
        <h3 className="text-[12px] font-bold text-gray-800 uppercase tracking-wider">{titulo}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Linha({ label, valor, multi }) {
  if (valor == null || valor === '') return null;
  return (
    <div className={multi ? 'flex flex-col gap-0.5' : 'flex items-start justify-between gap-3'}>
      <span className="text-[11.5px] text-gray-500 flex-shrink-0">{label}</span>
      <span className={`text-[12.5px] text-gray-800 ${multi ? 'whitespace-pre-wrap' : 'text-right font-medium'}`}>{valor}</span>
    </div>
  );
}
