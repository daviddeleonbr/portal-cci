import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, Loader2, AlertCircle, RefreshCw, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle, Scale,
  Receipt, ScrollText, Landmark, CreditCard, FileCheck, Building2, Users,
  FileText, ChevronDown,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import { useClienteSession } from '../../hooks/useAuth';
import * as mapService from '../../services/mapeamentoService';
import * as qualityApi from '../../services/qualityApiService';
import { formatCurrency } from '../../utils/format';

// ─── Helpers ─────────────────────────────────────────────────
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

function pad(n) { return String(n).padStart(2, '0'); }
function toIso(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

function formatDataBR(s) {
  if (!s) return '—';
  const iso = String(s).slice(0, 10);
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

function diaSemanaLongo(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  const dt = new Date(+y, +m - 1, +d);
  return ['Domingo', 'Segunda-feira', 'Terca-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][dt.getDay()];
}

function hojeIso() {
  const d = new Date();
  return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

function extrairValor(t) {
  return toNumber(
    t.valorSaldo ?? t.saldo ?? t.valorAberto ?? t.valorPendente ??
    t.valor ?? t.valorTitulo ?? t.valorOriginal ?? t.valorLiquido
  );
}

function extrairVencimento(t) {
  const raw = t.dataVencimento || t.vencimento || t.dataVenc || t.data_vencimento ||
    t.dataCredito || t.dataPrevisao || t.dataPrevisaoCredito ||
    t.dataBomPara || t.dataDeposito || t.dataCompensacao || null;
  return raw ? String(raw).slice(0, 10) : null;
}

function extrairDocumento(t, fonte) {
  if (fonte === 'cartao') {
    return t.nsu || t.numeroNsu || t.nsuCartao || t.numeroAutorizacao ||
      t.autorizacao || t.cartaoCodigo || t.codigo || '';
  }
  if (fonte === 'cheque') {
    return t.numeroCheque || t.nrCheque || t.numeroDocumento || t.documento ||
      t.chequeCodigo || t.codigo || '';
  }
  return t.numeroDocumento || t.documento || t.numeroTitulo || t.nrDocumento || t.nrTitulo ||
    t.titulo || t.tituloReceberCodigo || t.tituloPagarCodigo ||
    t.duplicataCodigo || t.codigoTitulo || t.codigo || '';
}

function extrairNomePessoa(t, fonte, fornMap, cliMap, admMap) {
  if (fonte === 'pagar') {
    const cod = t.fornecedorCodigo ?? t.codigoFornecedor ?? t.pessoaCodigo;
    return t.fornecedorNome || t.fornecedor || t.razao || t.razaoSocial ||
      (cod != null ? fornMap.get(cod) : '') || 'Fornecedor';
  }
  const cod = t.clienteCodigo ?? t.codigoCliente ?? t.pessoaCodigo;
  const base = t.clienteNome || t.cliente || t.razao || t.razaoSocial ||
    (cod != null ? cliMap.get(cod) : '') || 'Cliente';
  if (fonte === 'cartao') {
    const admCod = t.administradoraCodigo ?? t.codigoAdministradora;
    const inline = t.administradoraDescricao || t.administradoraNome ||
      (typeof t.administradora === 'string' ? t.administradora : '');
    const adm = inline || (admCod != null ? admMap.get(admCod) : '') || '';
    return adm ? `${adm} (${base})` : base;
  }
  return base;
}

function extrairAdministradora(t, admMap) {
  const admCod = t.administradoraCodigo ?? t.codigoAdministradora;
  const inline = t.administradoraDescricao || t.administradoraNome ||
    (typeof t.administradora === 'string' ? t.administradora : '');
  return inline || (admCod != null ? admMap.get(admCod) : '') || 'Administradora não informada';
}

const FONTE_CFG = {
  pagar:     { label: 'Pagar',     icon: Receipt,     color: 'text-red-600',    bg: 'bg-red-50' },
  titulo:    { label: 'Título',    icon: ScrollText,  color: 'text-indigo-600', bg: 'bg-indigo-50' },
  duplicata: { label: 'Duplicata', icon: Landmark,    color: 'text-violet-600', bg: 'bg-violet-50' },
  cartao:    { label: 'Cartão',    icon: CreditCard,  color: 'text-cyan-600',   bg: 'bg-cyan-50' },
  cheque:    { label: 'Cheque',    icon: FileCheck,   color: 'text-teal-600',   bg: 'bg-teal-50' },
};

// ─── Componente ──────────────────────────────────────────────
export default function ClienteAgendaFinanceira() {
  const session = useClienteSession();
  const cliente = session?.cliente;

  const hoje = new Date();
  const [mesRef, setMesRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [pagar, setPagar] = useState([]);
  const [receber, setReceber] = useState([]);
  const [diaSelecionado, setDiaSelecionado] = useState(null);

  const carregar = useCallback(async () => {
    if (!cliente?.chave_api_id || !cliente?.empresa_codigo) {
      setError('Esta empresa não tem integração Webposto configurada.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API não encontrada');

      // Janela ampla pra cobrir parcelamentos: 2 anos atras ate 1 ano a frente.
      const hojeDt = new Date();
      const fmt = (d) => d.toISOString().slice(0, 10);
      const doisAnosAtras = new Date(hojeDt); doisAnosAtras.setFullYear(hojeDt.getFullYear() - 2);
      const umAnoAFrente = new Date(hojeDt); umAnoAFrente.setFullYear(hojeDt.getFullYear() + 1);
      const filtrosPagar = {
        empresaCodigo: cliente.empresa_codigo,
        apenasPendente: true,
      };
      // Todos os endpoints de contas a receber exigem dataInicial/dataFinal.
      const filtrosReceber = {
        ...filtrosPagar,
        dataInicial: fmt(doisAnosAtras),
        dataFinal: fmt(umAnoAFrente),
      };

      const erros = [];
      const seguro = (nome, promise) => promise.catch(err => {
        console.warn(`[Agenda] ${nome} falhou:`, err);
        erros.push({ nome, msg: err.message });
        return [];
      });

      const [tp, tr, dup, cart, chq, fornsQ, clisQ, admsQ] = await Promise.all([
        seguro('TITULO_PAGAR',   qualityApi.buscarTitulosPagar(chave.chave, filtrosPagar)),
        seguro('TITULO_RECEBER', qualityApi.buscarTitulosReceber(chave.chave, filtrosReceber)),
        seguro('DUPLICATA',      qualityApi.buscarDuplicatas(chave.chave, filtrosReceber)),
        seguro('CARTAO',         qualityApi.buscarCartoes(chave.chave, filtrosReceber)),
        seguro('CHEQUE',         qualityApi.buscarCheques(chave.chave, filtrosReceber)),
        seguro('FORNECEDOR',     qualityApi.buscarFornecedoresQuality(chave.chave)),
        seguro('CLIENTE',        qualityApi.buscarClientesQuality(chave.chave)),
        seguro('ADMINISTRADORA', qualityApi.buscarAdministradoras(chave.chave)),
      ]);
      setWarnings(erros);

      const fornMap = new Map();
      (fornsQ || []).forEach(f => {
        const cod = f.fornecedorCodigo ?? f.codigo;
        if (cod != null) fornMap.set(cod, f.razao || f.fantasia || f.nome || `Fornecedor #${cod}`);
      });
      const cliMap = new Map();
      (clisQ || []).forEach(c => {
        const cod = c.clienteCodigo ?? c.codigo;
        if (cod != null) cliMap.set(cod, c.razao || c.fantasia || c.nome || `Cliente #${cod}`);
      });
      const admMap = new Map();
      (admsQ || []).forEach(a => {
        const cod = a.administradoraCodigo ?? a.codigo ?? a.codigoAdministradora;
        const nome = a.descricao || a.nomeAdministradora || a.nome ||
          a.razao || a.razaoSocial || a.fantasia || a.nomeFantasia || '';
        if (cod != null && nome) admMap.set(cod, nome);
      });

      const enriquecer = (raw, fonte) => ({
        fonte,
        raw,
        valor: extrairValor(raw),
        vencimento: extrairVencimento(raw),
        documento: extrairDocumento(raw, fonte),
        pessoa: extrairNomePessoa(raw, fonte, fornMap, cliMap, admMap),
        administradora: fonte === 'cartao' ? extrairAdministradora(raw, admMap) : '',
        historico: raw.historico || raw.observacao || raw.descricao || '',
      });

      setPagar((tp || []).map(r => enriquecer(r, 'pagar')));
      setReceber([
        ...(tr || []).map(r => enriquecer(r, 'titulo')),
        ...(dup || []).map(r => enriquecer(r, 'duplicata')),
        ...(cart || []).map(r => enriquecer(r, 'cartao')),
        ...(chq || []).map(r => enriquecer(r, 'cheque')),
      ]);
    } catch (err) {
      setError(err.message);
      setPagar([]);
      setReceber([]);
    } finally {
      setLoading(false);
    }
  }, [cliente?.chave_api_id, cliente?.empresa_codigo]);

  useEffect(() => { carregar(); }, [carregar]);

  // Agrupa tudo por data ISO
  const porDia = useMemo(() => {
    const mapa = new Map();
    const add = (item, tipo) => {
      if (!item.vencimento) return;
      const key = item.vencimento;
      if (!mapa.has(key)) {
        mapa.set(key, { data: key, pagar: [], receber: [], totalPagar: 0, totalReceber: 0 });
      }
      const g = mapa.get(key);
      if (tipo === 'pagar') {
        g.pagar.push(item);
        g.totalPagar += item.valor;
      } else {
        g.receber.push(item);
        g.totalReceber += item.valor;
      }
    };
    pagar.forEach(i => add(i, 'pagar'));
    receber.forEach(i => add(i, 'receber'));
    mapa.forEach(g => { g.resultado = g.totalReceber - g.totalPagar; });
    return mapa;
  }, [pagar, receber]);

  // Matriz do calendario (6 semanas, domingo primeiro)
  const { ano, mes } = mesRef;
  const matriz = useMemo(() => {
    const primeiroDia = new Date(ano, mes - 1, 1);
    const inicio = primeiroDia.getDay(); // 0 = domingo
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const celulas = [];
    for (let i = 0; i < inicio; i++) celulas.push(null);
    for (let d = 1; d <= ultimoDia; d++) celulas.push(d);
    while (celulas.length < 42) celulas.push(null);
    return celulas;
  }, [ano, mes]);

  const hojeStr = hojeIso();

  const totaisMes = useMemo(() => {
    let tr = 0, tp = 0;
    porDia.forEach((g, key) => {
      if (key.startsWith(`${ano}-${pad(mes)}`)) {
        tr += g.totalReceber;
        tp += g.totalPagar;
      }
    });
    return { receber: tr, pagar: tp, resultado: tr - tp };
  }, [porDia, ano, mes]);

  const prevMes = () => {
    setMesRef(prev => {
      const m = prev.mes - 1;
      return m < 1 ? { ano: prev.ano - 1, mes: 12 } : { ano: prev.ano, mes: m };
    });
  };
  const nextMes = () => {
    setMesRef(prev => {
      const m = prev.mes + 1;
      return m > 12 ? { ano: prev.ano + 1, mes: 1 } : { ano: prev.ano, mes: m };
    });
  };
  const irParaHoje = () => setMesRef({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 });

  if (!cliente?.chave_api_id || !cliente?.empresa_codigo) {
    return (
      <div>
        <PageHeader title="Agenda Financeira" description="Calendário de recebimentos e pagamentos" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Esta empresa ainda não tem <strong>integração Webposto</strong> ativa. Contate o administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Agenda Financeira"
        description={`Calendário de vencimentos${cliente?.nome ? ` • ${cliente.nome}` : ''}`}
      >
        <button
          onClick={carregar}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </PageHeader>

      {/* Warnings parciais por endpoint */}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium mb-1">
              Dados parciais: {warnings.length} {warnings.length === 1 ? 'fonte não pode ser carregada' : 'fontes não puderam ser carregadas'}
            </p>
            <ul className="text-xs text-amber-700/90 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}><span className="font-mono">{w.nome}</span>: {w.msg}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Resumo do mes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <TotalCard
          icon={ArrowUpCircle}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          label="A receber no mês"
          valor={formatCurrency(totaisMes.receber)}
        />
        <TotalCard
          icon={ArrowDownCircle}
          iconBg="bg-red-50"
          iconColor="text-red-600"
          label="A pagar no mês"
          valor={formatCurrency(totaisMes.pagar)}
        />
        <TotalCard
          icon={Scale}
          iconBg={totaisMes.resultado >= 0 ? 'bg-blue-50' : 'bg-orange-50'}
          iconColor={totaisMes.resultado >= 0 ? 'text-blue-600' : 'text-orange-600'}
          label="Resultado provavel"
          valor={formatCurrency(totaisMes.resultado)}
          highlight={totaisMes.resultado >= 0}
          negative={totaisMes.resultado < 0}
        />
      </div>

      {/* Calendario */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">
              {MESES[mes - 1]} {ano}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prevMes} title="Mês anterior"
              className="rounded-md p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={irParaHoje}
              className="rounded-md px-3 py-1 text-[12px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
              Hoje
            </button>
            <button onClick={nextMes} title="Próximo mês"
              className="rounded-md p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Cabecalho de dias da semana */}
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
          {DIAS_SEMANA.map(dia => (
            <div key={dia} className="px-2 py-2 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              {dia}
            </div>
          ))}
        </div>

        {/* Matriz */}
        {loading ? (
          <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm">Carregando agenda...</span>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 text-sm text-red-800 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Não foi possível carregar a agenda</p>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {matriz.map((d, i) => {
              if (d === null) {
                return <div key={i} className="h-28 bg-gray-50/30 border-r border-b border-gray-100 last:border-r-0" />;
              }
              const iso = toIso(ano, mes, d);
              const info = porDia.get(iso);
              const eHoje = iso === hojeStr;
              const dow = new Date(ano, mes - 1, d).getDay();
              const fimDeSemana = dow === 0 || dow === 6;
              return (
                <DiaCelula
                  key={i}
                  dia={d}
                  iso={iso}
                  info={info}
                  eHoje={eHoje}
                  fimDeSemana={fimDeSemana}
                  onClick={() => setDiaSelecionado(iso)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-500 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> A receber
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" /> A pagar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" /> Saldo positivo do dia
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-orange-500" /> Saldo negativo do dia
        </span>
      </div>

      {/* Modal do dia */}
      <DiaModal
        iso={diaSelecionado}
        info={diaSelecionado ? porDia.get(diaSelecionado) : null}
        onClose={() => setDiaSelecionado(null)}
      />
    </div>
  );
}

function TotalCard({ icon: Icon, iconBg, iconColor, label, valor, highlight, negative }) {
  const borderCls = highlight ? 'border-blue-200 bg-gradient-to-br from-blue-50/50 to-white' :
    negative ? 'border-orange-200 bg-gradient-to-br from-orange-50/50 to-white' : 'border-gray-100';
  return (
    <div className={`bg-white rounded-xl border p-5 ${borderCls}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${iconBg} p-2.5 flex-shrink-0`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className={`text-xl font-semibold tracking-tight truncate ${negative ? 'text-orange-600' : 'text-gray-900'}`}>
            {valor}
          </p>
        </div>
      </div>
    </div>
  );
}

function DiaCelula({ dia, iso, info, eHoje, fimDeSemana, onClick }) {
  const temDados = !!info;
  const resultado = info?.resultado ?? 0;
  const saldoColor = resultado > 0 ? 'text-blue-600' : resultado < 0 ? 'text-orange-600' : 'text-gray-400';
  const saldoBg = resultado > 0 ? 'bg-blue-500' : resultado < 0 ? 'bg-orange-500' : '';

  return (
    <button
      onClick={onClick}
      className={`relative h-28 p-2 text-left border-r border-b border-gray-100 last:border-r-0 transition-colors ${
        eHoje ? 'bg-blue-50/40' : fimDeSemana ? 'bg-gray-50/40' : 'bg-white'
      } hover:bg-gray-50 group`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`inline-flex items-center justify-center text-[12px] font-semibold ${
          eHoje
            ? 'h-6 w-6 rounded-full bg-blue-600 text-white'
            : fimDeSemana
            ? 'text-gray-400'
            : 'text-gray-700'
        }`}>
          {dia}
        </span>
        {temDados && saldoBg && (
          <span className={`h-1.5 w-1.5 rounded-full ${saldoBg}`} />
        )}
      </div>
      {temDados && (
        <div className="space-y-1">
          {info.totalReceber > 0 && (
            <div className="flex items-center gap-1 text-[10.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-emerald-700 font-medium truncate">
                +{formatCurrency(info.totalReceber)}
              </span>
            </div>
          )}
          {info.totalPagar > 0 && (
            <div className="flex items-center gap-1 text-[10.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-red-700 font-medium truncate">
                −{formatCurrency(info.totalPagar)}
              </span>
            </div>
          )}
          {(info.totalReceber > 0 && info.totalPagar > 0) && (
            <div className={`text-[10px] font-semibold ${saldoColor} pt-0.5 border-t border-gray-100`}>
              {resultado >= 0 ? '+' : ''}{formatCurrency(resultado)}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function DiaModal({ iso, info, onClose }) {
  const open = !!iso;
  const titulo = iso ? `${formatDataBR(iso)} • ${diaSemanaLongo(iso)}` : '';

  const totalReceber = info?.totalReceber || 0;
  const totalPagar = info?.totalPagar || 0;
  const resultado = info?.resultado || 0;
  const temReceber = (info?.receber || []).length > 0;
  const temPagar = (info?.pagar || []).length > 0;

  return (
    <Modal open={open} onClose={onClose} title={titulo} size="xl">
      {!info ? (
        <div className="text-center py-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 mb-3">
            <CalendarDays className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhuma movimentação</p>
          <p className="text-xs text-gray-500 mt-1">Não ha vencimentos para este dia</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Resumo do dia */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span className="text-[11px] font-medium text-emerald-900 uppercase tracking-wide">A receber</span>
              </div>
              <p className="text-xl font-semibold text-emerald-700">{formatCurrency(totalReceber)}</p>
              <p className="text-[11px] text-emerald-600/70 mt-0.5">
                {(info.receber || []).length} {(info.receber || []).length === 1 ? 'lancamento' : 'lancamentos'}
              </p>
            </div>
            <div className="rounded-xl bg-red-50 border border-red-100 p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-red-600" />
                <span className="text-[11px] font-medium text-red-900 uppercase tracking-wide">A pagar</span>
              </div>
              <p className="text-xl font-semibold text-red-700">{formatCurrency(totalPagar)}</p>
              <p className="text-[11px] text-red-600/70 mt-0.5">
                {(info.pagar || []).length} {(info.pagar || []).length === 1 ? 'titulo' : 'titulos'}
              </p>
            </div>
            <div className={`rounded-xl border p-4 ${
              resultado >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <Scale className={`h-4 w-4 ${resultado >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                <span className={`text-[11px] font-medium uppercase tracking-wide ${
                  resultado >= 0 ? 'text-blue-900' : 'text-orange-900'
                }`}>Resultado do dia</span>
              </div>
              <p className={`text-xl font-semibold ${
                resultado >= 0 ? 'text-blue-700' : 'text-orange-700'
              }`}>
                {resultado >= 0 ? '+' : ''}{formatCurrency(resultado)}
              </p>
              <p className={`text-[11px] mt-0.5 ${resultado >= 0 ? 'text-blue-600/70' : 'text-orange-600/70'}`}>
                {resultado >= 0 ? 'Entrada liquida prevista' : 'Saída liquida prevista'}
              </p>
            </div>
          </div>

          {/* A receber - agrupado por tipo */}
          {temReceber && (
            <ReceberAgrupado
              itens={info.receber}
              totalReceber={totalReceber}
            />
          )}

          {/* A pagar */}
          {temPagar && (
            <Secao
              titulo="Contas a Pagar"
              subtitulo={`${(info.pagar || []).length} ${(info.pagar || []).length === 1 ? 'titulo' : 'titulos'} • ${formatCurrency(totalPagar)}`}
              cor="red"
              icone={ArrowDownCircle}
            >
              {info.pagar.map((item, i) => (
                <LinhaLancamento key={`p-${i}`} item={item} tipo="pagar" />
              ))}
            </Secao>
          )}
        </div>
      )}
    </Modal>
  );
}

// Agrupa recebimentos por fonte (titulo/duplicata/cartao/cheque).
// Cada grupo inicia COLAPSADO; o usuario clica no header pra expandir.
function ReceberAgrupado({ itens, totalReceber }) {
  const ORDEM = ['titulo', 'duplicata', 'cartao', 'cheque'];
  const LABEL_PLURAL = { titulo: 'Títulos', duplicata: 'Duplicatas', cartao: 'Cartões', cheque: 'Cheques' };

  const grupos = ORDEM
    .map(fonte => {
      const lista = itens.filter(i => i.fonte === fonte);
      if (lista.length === 0) return null;
      const total = lista.reduce((s, i) => s + i.valor, 0);
      return { fonte, lista, total };
    })
    .filter(Boolean);

  // Todos colapsados por padrao. Reseta quando a composicao dos grupos muda.
  const [expandidos, setExpandidos] = useState(new Set());
  const gruposKey = grupos.map(g => g.fonte).join(',');
  useEffect(() => {
    setExpandidos(new Set());
  }, [gruposKey]);

  const toggle = (fonte) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(fonte)) next.delete(fonte); else next.add(fonte);
      return next;
    });
  };
  const expandirTodos = () => setExpandidos(new Set(grupos.map(g => g.fonte)));
  const colapsarTodos = () => setExpandidos(new Set());
  const todosAbertos = expandidos.size === grupos.length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <div className="h-6 w-1 rounded-full bg-emerald-500" />
        <div className="flex items-center gap-2">
          <ArrowUpCircle className="h-4 w-4 text-emerald-700" />
          <h4 className="text-sm font-semibold text-gray-900">Contas a Receber</h4>
        </div>
        <span className="text-[11px] text-gray-500 ml-auto">
          {itens.length} {itens.length === 1 ? 'lancamento' : 'lancamentos'} • {formatCurrency(totalReceber)}
        </span>
      </div>

      {grupos.length > 1 && (
        <div className="flex items-center justify-end gap-2 mb-2">
          <button
            onClick={todosAbertos ? colapsarTodos : expandirTodos}
            className="text-[11px] text-gray-500 hover:text-emerald-600 transition-colors"
          >
            {todosAbertos ? 'Colapsar todos' : 'Expandir todos'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {grupos.map(({ fonte, lista, total }) => {
          const cfg = FONTE_CFG[fonte];
          const Icon = cfg.icon;
          const aberto = expandidos.has(fonte);
          return (
            <div key={fonte} className="rounded-xl border border-gray-100 overflow-hidden bg-white">
              <button
                onClick={() => toggle(fonte)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors text-left ${cfg.bg} hover:brightness-95`}
              >
                <Icon className={`h-3.5 w-3.5 ${cfg.color} flex-shrink-0`} />
                <span className={`text-[12px] font-semibold ${cfg.color}`}>
                  {LABEL_PLURAL[fonte]}
                </span>
                <span className="text-[11px] text-gray-500 ml-auto">
                  {lista.length} {lista.length === 1 ? 'item' : 'itens'}
                </span>
                <span className={`text-[12px] font-semibold ${cfg.color}`}>
                  {formatCurrency(total)}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 ${cfg.color} transition-transform ${aberto ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {aberto && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-gray-100 bg-gray-50/30 p-2 space-y-1.5">
                      <SubgruposPorPessoa fonte={fonte} lista={lista} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Segunda camada: agrupa itens de uma fonte por pessoa (ou administradora pra cartao).
// Cada sub-grupo inicia colapsado e pode ser expandido individualmente.
function SubgruposPorPessoa({ fonte, lista }) {
  const chaveGrupo = (it) => fonte === 'cartao'
    ? (it.administradora || 'Administradora não informada')
    : (it.pessoa || 'Sem identificação');

  const subgrupos = useMemo(() => {
    const mapa = new Map();
    lista.forEach(it => {
      const k = chaveGrupo(it);
      if (!mapa.has(k)) mapa.set(k, { chave: k, itens: [], total: 0 });
      const g = mapa.get(k);
      g.itens.push(it);
      g.total += it.valor;
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, fonte]);

  const [abertos, setAbertos] = useState(new Set());
  const chavesKey = subgrupos.map(g => g.chave).join('||');
  useEffect(() => { setAbertos(new Set()); }, [chavesKey]);

  const toggle = (k) => {
    setAbertos(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const cfg = FONTE_CFG[fonte];
  const labelHeader = fonte === 'cartao' ? 'Administradora' : 'Pessoa';
  const IconHeader = fonte === 'cartao' ? CreditCard : Users;

  return (
    <>
      {subgrupos.map(({ chave, itens, total }) => {
        const aberto = abertos.has(chave);
        return (
          <div key={chave} className="rounded-lg bg-white border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggle(chave)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50/70 transition-colors text-left"
            >
              <IconHeader className="h-3 w-3 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-gray-900 truncate">{chave}</p>
                <p className="text-[10px] text-gray-400">{labelHeader} • {itens.length} {itens.length === 1 ? 'item' : 'itens'}</p>
              </div>
              <span className={`text-[12px] font-semibold ${cfg.color} flex-shrink-0`}>
                {formatCurrency(total)}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform flex-shrink-0 ${aberto ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {aberto && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {itens.map((item, i) => (
                      <LinhaLancamento key={`${chave}-${i}`} item={item} tipo="receber" />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </>
  );
}

function Secao({ titulo, subtitulo, cor, icone: Icone, children }) {
  const corBg = cor === 'emerald' ? 'bg-emerald-500' : 'bg-red-500';
  const corTxt = cor === 'emerald' ? 'text-emerald-700' : 'text-red-700';
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <div className={`h-6 w-1 rounded-full ${corBg}`} />
        <div className="flex items-center gap-2">
          <Icone className={`h-4 w-4 ${corTxt}`} />
          <h4 className="text-sm font-semibold text-gray-900">{titulo}</h4>
        </div>
        <span className="text-[11px] text-gray-500 ml-auto">{subtitulo}</span>
      </div>
      <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50 bg-white">
        {children}
      </div>
    </div>
  );
}

function LinhaLancamento({ item, tipo }) {
  const cfg = FONTE_CFG[item.fonte];
  const Icon = cfg.icon;
  const corValor = tipo === 'receber' ? 'text-emerald-700' : 'text-red-700';
  return (
    <motion.div
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50 transition-colors"
    >
      <div className={`rounded-md ${cfg.bg} ${cfg.color} p-1.5 flex-shrink-0`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {tipo === 'pagar'
            ? <Building2 className="h-3 w-3 text-gray-400 flex-shrink-0" />
            : <Users className="h-3 w-3 text-gray-400 flex-shrink-0" />}
          <p className="text-[13px] font-medium text-gray-900 truncate">{item.pessoa}</p>
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${cfg.bg} ${cfg.color} flex-shrink-0`}>
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 min-w-0">
          {item.documento && (
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <FileText className="h-3 w-3" />
              {item.fonte === 'cartao' ? `NSU ${item.documento}` : item.documento}
            </span>
          )}
          {item.historico && <span className="truncate text-gray-400">{item.historico}</span>}
        </div>
      </div>
      <p className={`text-[13px] font-semibold flex-shrink-0 ${corValor}`}>
        {tipo === 'receber' ? '+' : '−'}{formatCurrency(item.valor)}
      </p>
    </motion.div>
  );
}
