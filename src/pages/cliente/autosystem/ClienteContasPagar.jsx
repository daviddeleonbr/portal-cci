import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, Search, Calendar, RefreshCw,
  ArrowUpRight, AlertTriangle, CheckCircle2, FileText,
  Building2, ChevronRight,
} from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import * as autosystemService from '../../../services/autosystemService';
import { ehDiaUtil, vencimentoEfetivoIso } from '../../../utils/diasUteis';

// ─── Helpers ────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function inicioMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function fimMesAtual() {
  const d = new Date();
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${ultimo.getFullYear()}-${pad(ultimo.getMonth() + 1)}-${pad(ultimo.getDate())}`;
}

function dataIso(vencto) {
  if (!vencto) return '';
  return typeof vencto === 'string' ? vencto.slice(0, 10) : '';
}

function formatDate(dateLike) {
  if (!dateLike) return '—';
  const s = typeof dateLike === 'string' ? dateLike.slice(0, 10) : null;
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    const d = new Date(dateLike);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch { return '—'; }
}

function diffDiasAteHoje(vencto) {
  const s = dataIso(vencto);
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const v = new Date(y, m - 1, d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((v - hoje) / (1000 * 60 * 60 * 24));
}

const fmtBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
});

function formatValor(v) {
  if (v == null) return 'R$ 0,00';
  const num = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(num)) return 'R$ 0,00';
  return fmtBRL.format(num);
}

// ─── Página ─────────────────────────────────────────────────────
export default function ClienteContasPagar() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);

  const [contasPorEmpresa, setContasPorEmpresa] = useState({}); // { [empresaId]: contas[] }
  const [errosPorEmpresa, setErrosPorEmpresa] = useState({});
  const [loading, setLoading] = useState(false);
  const [venctoDe, setVenctoDe] = useState(inicioMesAtual());
  const [venctoAte, setVenctoAte] = useState(fimMesAtual());
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('hoje');
  const [empresasExpandidas, setEmpresasExpandidas] = useState(new Set());
  const [datasExpandidas, setDatasExpandidas] = useState(new Set()); // chave: `${empresaId}|${dataIso}`

  const redeId = asRede?.id;
  const empresasComCodigo = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  const carregar = useCallback(async () => {
    if (!redeId || empresasComCodigo.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        empresasComCodigo.map(emp =>
          autosystemService.buscarContasPagar(redeId, emp.empresa_codigo, {
            vencto_de: venctoDe || null,
            vencto_ate: venctoAte || null,
          }).then(contas => ({ emp, contas })),
        ),
      );
      const dados = {};
      const erros = {};
      results.forEach((r, i) => {
        const emp = empresasComCodigo[i];
        if (r.status === 'fulfilled') dados[emp.id] = r.value.contas;
        else erros[emp.id] = r.reason?.message || 'Falha ao carregar';
      });
      setContasPorEmpresa(dados);
      setErrosPorEmpresa(erros);
    } finally {
      setLoading(false);
    }
  }, [redeId, empresasComCodigo, venctoDe, venctoAte]);

  useEffect(() => { carregar(); }, [carregar]);

  const hojeIso = isoHoje();
  // Regra: vencimentos em sábado/domingo/feriado são pagos no próximo dia útil.
  // "Hoje efetivo" = próximo dia útil a partir de hoje (igual a hoje se hoje for útil).
  const hojeEfetivoIso = useMemo(() => vencimentoEfetivoIso(hojeIso), [hojeIso]);
  const hojeNaoEhDiaUtil = hojeIso !== hojeEfetivoIso;

  // Aplica filtros locais (status + busca) e agrupa por empresa → data efetiva
  const arvore = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const passaBusca = (c) => {
      if (!q) return true;
      const campos = [c.pessoa_nome, c.documento, c.debito_nome, c.motivo_nome, c.obs];
      return campos.some(v => (v || '').toString().toLowerCase().includes(q));
    };
    const passaStatus = (c, efetivoIso) => {
      if (filtroStatus === 'todos') return true;
      const vencido = efetivoIso && efetivoIso < hojeIso;
      if (filtroStatus === 'vencido') return vencido;
      // "Hoje" considera a data efetiva de pagamento (rolando fins de semana/feriados).
      // Se hoje for útil: pega contas cujo dia útil de pagamento é hoje.
      // Se hoje não for útil: pega contas que serão pagas no próximo dia útil.
      if (filtroStatus === 'hoje') return efetivoIso === hojeEfetivoIso;
      if (filtroStatus === 'a_vencer') return !vencido && efetivoIso !== hojeEfetivoIso;
      return true;
    };

    return empresasComCodigo.map((emp) => {
      // Anota cada conta com sua data efetiva de pagamento
      const todas = (contasPorEmpresa[emp.id] || []).map(c => ({
        ...c,
        _efetivoIso: vencimentoEfetivoIso(dataIso(c.vencto)) || '',
      }));
      const contas = todas.filter(c => passaBusca(c) && passaStatus(c, c._efetivoIso));

      // Agrupa por data efetiva (não pelo vencto cru)
      const porData = new Map();
      let totalEmpresa = 0;
      let totalVencido = 0;
      for (const c of contas) {
        const efet = c._efetivoIso || 'sem_data';
        if (!porData.has(efet)) porData.set(efet, []);
        porData.get(efet).push(c);
        const val = Number(c.valor) || 0;
        totalEmpresa += val;
        if (efet && efet < hojeIso) totalVencido += val;
      }
      const datas = Array.from(porData.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dataKey, lista]) => ({
          dataKey,
          contas: lista,
          total: lista.reduce((acc, c) => acc + (Number(c.valor) || 0), 0),
        }));
      return {
        emp,
        contas,
        qtd: contas.length,
        total: totalEmpresa,
        totalVencido,
        datas,
        erro: errosPorEmpresa[emp.id] || null,
      };
    });
  }, [contasPorEmpresa, errosPorEmpresa, empresasComCodigo, filtroStatus, busca, hojeIso, hojeEfetivoIso]);

  // Totais gerais (agregado da rede). NÃO aplica filtro de status nem busca —
  // os cards refletem sempre o panorama completo do período selecionado.
  const totaisGerais = useMemo(() => {
    let total = 0, totalVencido = 0, totalHoje = 0, totalAVencer = 0;
    let qtd = 0, qtdVencido = 0, qtdHoje = 0;
    for (const empId in contasPorEmpresa) {
      for (const c of contasPorEmpresa[empId]) {
        const v = Number(c.valor) || 0;
        const efet = vencimentoEfetivoIso(dataIso(c.vencto)) || '';
        total += v; qtd++;
        if (efet && efet < hojeIso) { totalVencido += v; qtdVencido++; }
        else if (efet === hojeEfetivoIso) { totalHoje += v; qtdHoje++; }
        else totalAVencer += v;
      }
    }
    return { total, totalVencido, totalHoje, totalAVencer, qtd, qtdVencido, qtdHoje };
  }, [contasPorEmpresa, hojeIso, hojeEfetivoIso]);

  const toggleEmpresa = (empId) => {
    setEmpresasExpandidas(prev => {
      const n = new Set(prev);
      if (n.has(empId)) n.delete(empId); else n.add(empId);
      return n;
    });
  };
  const toggleData = (empId, dataKey) => {
    const k = `${empId}|${dataKey}`;
    setDatasExpandidas(prev => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  const expandirTodas = () => {
    setEmpresasExpandidas(new Set(arvore.filter(g => g.qtd > 0).map(g => g.emp.id)));
  };
  const recolherTodas = () => {
    setEmpresasExpandidas(new Set());
    setDatasExpandidas(new Set());
  };

  // Tela: nenhuma empresa importada com código
  if (empresasComCodigo.length === 0) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-1">Nenhuma empresa com vínculo Autosystem</p>
            <p className="text-xs">
              Nenhuma das empresas desta rede tem <code className="font-mono bg-amber-100 px-1 rounded">empresa_codigo</code> preenchido.
              Solicite ao administrador para importar as empresas em <em>/admin/clientes → Importar empresas</em>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white">
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Contas a Pagar</h1>
          </div>
          <p className="text-sm text-gray-500">
            {asRede?.nome} · {empresasComCodigo.length} empresa(s) · vencimentos entre {formatDate(venctoDe)} e {formatDate(venctoAte)}
          </p>
        </div>
        <button onClick={carregar} disabled={loading}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Aviso: hoje não é dia útil */}
      {hojeNaoEhDiaUtil && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Hoje não é dia útil ({formatDate(hojeIso)}).</p>
            <p className="text-xs mt-0.5">
              Pagamentos com vencimento em sábado, domingo ou feriado serão executados em <strong>{formatDate(hojeEfetivoIso)}</strong>.
              O filtro <strong>"Hoje"</strong> mostra os títulos que vão ser pagos nesse próximo dia útil.
            </p>
          </div>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Hoje" valor={formatValor(totaisGerais.totalHoje)} sublabel={`${totaisGerais.qtdHoje} título(s)`} icon={Calendar} color="amber" />
        <StatCard label="Vencido" valor={formatValor(totaisGerais.totalVencido)} sublabel={`${totaisGerais.qtdVencido} título(s)`} icon={AlertTriangle} color="red" />
        <StatCard label="A vencer" valor={formatValor(totaisGerais.totalAVencer)} sublabel={`${totaisGerais.qtd - totaisGerais.qtdVencido - totaisGerais.qtdHoje} título(s)`} icon={CheckCircle2} color="emerald" />
        <StatCard label="Total no período" valor={formatValor(totaisGerais.total)} sublabel={`${totaisGerais.qtd} título(s)`} icon={FileText} color="violet" />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <div className="flex items-center gap-1.5">
            <input type="date" value={venctoDe} onChange={e => setVenctoDe(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 px-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
            <span className="text-xs text-gray-400">até</span>
            <input type="date" value={venctoAte} onChange={e => setVenctoAte(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 px-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
          </div>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { v: 'todos', l: 'Todos' },
            { v: 'vencido', l: 'Vencido' },
            { v: 'hoje', l: 'Hoje' },
            { v: 'a_vencer', l: 'A vencer' },
          ].map(opt => (
            <button key={opt.v} onClick={() => setFiltroStatus(opt.v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filtroStatus === opt.v ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {opt.l}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por fornecedor, documento, motivo, conta..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
        </div>

        <div className="flex items-center gap-2">
          <button onClick={expandirTodas} className="text-[11px] font-medium text-violet-600 hover:text-violet-800 whitespace-nowrap">Expandir</button>
          <span className="text-gray-300">|</span>
          <button onClick={recolherTodas} className="text-[11px] font-medium text-gray-500 hover:text-gray-800 whitespace-nowrap">Recolher</button>
        </div>
      </div>

      {/* Árvore */}
      {loading && Object.keys(contasPorEmpresa).length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 py-16 flex flex-col items-center gap-2 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Consultando {empresasComCodigo.length} empresa(s)...</p>
        </div>
      ) : (
        <div className="space-y-2">
          {arvore.map(grupo => (
            <GrupoEmpresa
              key={grupo.emp.id}
              grupo={grupo}
              expandida={empresasExpandidas.has(grupo.emp.id)}
              onToggle={() => toggleEmpresa(grupo.emp.id)}
              datasExpandidas={datasExpandidas}
              onToggleData={(dk) => toggleData(grupo.emp.id, dk)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componentes ───────────────────────────────────────────────
function GrupoEmpresa({ grupo, expandida, onToggle, datasExpandidas, onToggleData }) {
  const { emp, qtd, total, totalVencido, datas, erro } = grupo;
  const empClickable = qtd > 0 && !erro;
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
      <button
        onClick={empClickable ? onToggle : undefined}
        disabled={!empClickable}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          empClickable ? 'hover:bg-gray-50' : 'cursor-default opacity-90'
        }`}
      >
        <ChevronRight className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${expandida ? 'rotate-90' : ''} ${empClickable ? '' : 'opacity-30'}`} />
        <div className="h-9 w-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{emp.nome}</p>
          <p className="text-[11px] text-gray-500 truncate">
            <span className="font-mono">{emp.cnpj || '—'}</span>
            {qtd > 0 && (
              <> · {qtd} título{qtd === 1 ? '' : 's'}</>
            )}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          {erro ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-[10px] font-medium">
              <AlertCircle className="h-2.5 w-2.5" /> erro
            </span>
          ) : qtd === 0 ? (
            <span className="text-[11px] text-gray-400">sem títulos</span>
          ) : (
            <>
              <p className="text-sm font-bold text-gray-900 tabular-nums">{formatValor(total)}</p>
              {totalVencido > 0 && (
                <p className="text-[10px] text-red-600 tabular-nums">{formatValor(totalVencido)} vencido</p>
              )}
            </>
          )}
        </div>
      </button>

      {erro && (
        <div className="px-4 pb-3 -mt-1 text-[11px] text-red-600">{erro}</div>
      )}

      <AnimatePresence initial={false}>
        {expandida && qtd > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 bg-gray-50/40 px-2 py-2 space-y-1">
              {datas.map(dataNode => (
                <GrupoData
                  key={dataNode.dataKey}
                  empId={emp.id}
                  data={dataNode}
                  expandida={datasExpandidas.has(`${emp.id}|${dataNode.dataKey}`)}
                  onToggle={() => onToggleData(dataNode.dataKey)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GrupoData({ data: dataNode, expandida, onToggle }) {
  const { dataKey, contas, total } = dataNode;
  const dias = diffDiasAteHoje(dataKey === 'sem_data' ? null : dataKey);
  const vencido = dias != null && dias < 0;
  const venceHoje = dias === 0;
  // Quantas contas tiveram o vencto rolado para a data efetiva?
  const roladas = contas.filter(c => dataIso(c.vencto) !== c._efetivoIso).length;
  return (
    <div className="rounded-lg bg-white border border-gray-100">
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left">
        <ChevronRight className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${expandida ? 'rotate-90' : ''}`} />
        <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 tabular-nums">
            {dataKey === 'sem_data' ? 'Sem data' : formatDate(dataKey)}
          </p>
          <p className="text-[10px] text-gray-400">
            {contas.length} título{contas.length === 1 ? '' : 's'}
            {roladas > 0 && ` · ${roladas} rolado(s) de dia não útil`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {vencido && (
            <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-red-50 text-red-700 border border-red-200">
              <AlertTriangle className="h-2.5 w-2.5" /> Vencido
            </span>
          )}
          {venceHoje && (
            <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
              Hoje
            </span>
          )}
          <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatValor(total)}</p>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expandida && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-3 py-2">Vencto</th>
                    <th className="px-3 py-2">Fornecedor</th>
                    <th className="px-3 py-2">Documento</th>
                    <th className="px-3 py-2">Conta (Débito)</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {contas.map((c, i) => {
                    const venctoOriginal = dataIso(c.vencto);
                    const rolou = venctoOriginal && venctoOriginal !== c._efetivoIso;
                    return (
                      <tr key={i} className="hover:bg-gray-50/40">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <p className="text-xs text-gray-700 tabular-nums">{formatDate(venctoOriginal)}</p>
                          {rolou && (
                            <p className="text-[10px] text-amber-600">→ paga em {formatDate(c._efetivoIso)}</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-sm text-gray-800 truncate max-w-[260px]">{c.pessoa_nome || '—'}</p>
                          {c.obs && <p className="text-[10px] text-gray-400 truncate max-w-[260px]">{c.obs}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-gray-600 whitespace-nowrap">{c.documento || '—'}</td>
                        <td className="px-3 py-2">
                          <p className="text-xs text-gray-700 truncate max-w-[220px]">{c.debito_nome || '—'}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{c.debito_codigo}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-gray-900 tabular-nums">
                          {formatValor(c.valor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, valor, sublabel, icon: Icon, color }) {
  const palettes = {
    violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  border: 'border-violet-100' },
    red:     { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100' },
  };
  const c = palettes[color] || palettes.violet;
  return (
    <div className={`bg-white rounded-xl border ${c.border} p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${c.bg} ${c.text}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{valor}</p>
      {sublabel && <p className="text-[11px] text-gray-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}
