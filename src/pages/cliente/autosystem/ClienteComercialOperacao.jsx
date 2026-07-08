import React, { useState, useEffect, useMemo } from 'react';
import {
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronRight,
  Gauge, Droplet, Factory, Boxes, BarChart3, Search, Wrench,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import PageHeader from '../../../components/ui/PageHeader';
import SkeletonComercial from '../../../components/vendas/SkeletonComercial';
import { useClienteSession } from '../../../hooks/useAuth';
import { useEmpresaAtiva } from '../../../contexts/EmpresaAtivaContext';
import EmpresaSeletorCompartilhado from '../../../components/vendas/EmpresaMultiSelect';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';

function formatNumero(v, casas = 0) {
  if (v == null || !Number.isFinite(Number(v))) return '0';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function pad(n) { return String(n).padStart(2, '0'); }
function formatDataBR(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
}
// Aceita timestamp (ISO ou string com hora). Mostra "dd/mm/yyyy HH:MM".
function formatTimestamp(ts) {
  if (!ts) return '—';
  const s = String(ts);
  // ISO: 2026-05-17T14:30:00...
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (match) {
    const [, y, mo, d, h, mi] = match;
    return `${d}/${mo}/${y} ${h}:${mi}`;
  }
  return s;
}

// Cores suaves para os gráficos (paleta consistente com o resto do portal)
const CORES_FAB = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#a3e635', '#f472b6', '#fdba74', '#94a3b8'];

export default function ClienteComercialOperacao() {
  const session = useClienteSession();
  const asRede = session?.asRede;

  // Empresa ativa compartilhada com outras páginas Autosystem.
  const { empresaId, setEmpresaId, empresasDisponiveis } = useEmpresaAtiva();
  const empresaAtual = useMemo(
    () => empresasDisponiveis.find(c => c.id === empresaId) || null,
    [empresasDisponiveis, empresaId],
  );
  const empresasSel = useMemo(
    () => empresaAtual ? [empresaAtual] : [],
    [empresaAtual],
  );
  const empresasSelIds = useMemo(
    () => new Set(empresaId ? [empresaId] : []),
    [empresaId],
  );

  const [bombas, setBombas] = useState([]);
  const [bicos, setBicos] = useState([]);
  const [usoBicos, setUsoBicos] = useState([]);
  const [litrosDiaSemana, setLitrosDiaSemana] = useState([]);
  const [afericoes, setAfericoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [expandidas, setExpandidas] = useState(new Set());
  const [busca, setBusca] = useState('');
  const [buscaAfericoes, setBuscaAfericoes] = useState('');

  // Período de análise (em dias) — afeta uso, heatmap e aferições.
  const [periodoUsoDias, setPeriodoUsoDias] = useState(90);
  const PERIODO_OPTS = [30, 60, 90, 180];
  const { dataDeUso, dataAteUso } = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1); // ontem (exclui dia em aberto)
    const ate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const ini = new Date(d);
    ini.setDate(ini.getDate() - (periodoUsoDias - 1));
    const de = `${ini.getFullYear()}-${pad(ini.getMonth() + 1)}-${pad(ini.getDate())}`;
    return { dataDeUso: de, dataAteUso: ate };
  }, [periodoUsoDias]);

  const redeId = asRede?.id;

  // Mapa empresa_codigo → nome (para mostrar na tabela)
  const mapaEmpresas = useMemo(() => {
    const m = new Map();
    empresasDisponiveis.forEach(e => {
      const cod = Number(e.empresa_codigo);
      if (Number.isFinite(cod)) m.set(cod, e.nome || `Empresa ${cod}`);
    });
    return m;
  }, [empresasDisponiveis]);

  async function carregar() {
    if (!redeId || empresasSel.length === 0) return;
    setLoading(true);
    setErro('');
    try {
      const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
      const { bombas, bicos, uso_bicos, litros_dia_semana, afericoes } = await autosystemService.buscarBombasAutosystem(
        redeId, codigos,
        { data_de: dataDeUso, data_ate: dataAteUso },
      );
      setBombas(bombas || []);
      setBicos(bicos || []);
      setUsoBicos(uso_bicos || []);
      setLitrosDiaSemana(litros_dia_semana || []);
      setAfericoes(afericoes || []);
    } catch (err) {
      setErro(err.message || 'Falha ao carregar bombas');
      setBombas([]); setBicos([]); setUsoBicos([]); setLitrosDiaSemana([]); setAfericoes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [redeId, empresasSelIds, periodoUsoDias]);

  // ─── Agregações ────────────────────────────────────────────
  const bicosPorBomba = useMemo(() => {
    const m = new Map();
    (bicos || []).forEach(b => {
      const k = String(b.bomba);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(b);
    });
    return m;
  }, [bicos]);

  // `lancto.bico = bico.nome` (ambos TEXT). Indexa por (empresa, nome trimado).
  const mapaUsoBicos = useMemo(() => {
    const m = new Map();
    (usoBicos || []).forEach(u => {
      const nome = String(u.bico || '').trim();
      if (!nome) return;
      m.set(`${u.empresa}::${nome}`, {
        vendas_count:     Number(u.vendas_count)     || 0,
        quantidade_total: Number(u.quantidade_total) || 0,
        valor_total:      Number(u.valor_total)      || 0,
        afericoes_count:  Number(u.afericoes_count)  || 0,
      });
    });
    return m;
  }, [usoBicos]);

  const usoDoBico = (b) => {
    const nome = String(b?.nome || '').trim();
    if (!nome) return null;
    return mapaUsoBicos.get(`${b.empresa}::${nome}`) || null;
  };

  // Lista enriquecida de bombas com nº de bicos + uso somado (no período).
  const bombasEnriquecidas = useMemo(() => {
    return (bombas || []).map(b => {
      const bs = bicosPorBomba.get(String(b.grid)) || [];
      let usoVolume = 0;
      let usoVendas = 0;
      let usoAfericoes = 0;
      bs.forEach(bi => {
        const u = usoDoBico(bi);
        if (u) {
          usoVolume    += u.quantidade_total;
          usoVendas    += u.vendas_count;
          usoAfericoes += u.afericoes_count;
        }
      });
      return { ...b, bicos: bs, usoVolume, usoVendas, usoAfericoes };
    });
  }, [bombas, bicosPorBomba, mapaUsoBicos]);

  // Volume máximo no nível da tabela (para barra de uso por bomba).
  const maxVolumeBomba = useMemo(
    () => bombasEnriquecidas.reduce((m, b) => Math.max(m, b.usoVolume || 0), 0),
    [bombasEnriquecidas],
  );

  // Conta quantas vezes cada dia da semana ocorre na janela (para média).
  const contagemDiasSemana = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    if (!dataDeUso || !dataAteUso) return counts;
    const [y1, m1, d1] = dataDeUso.split('-').map(Number);
    const [y2, m2, d2] = dataAteUso.split('-').map(Number);
    const ini = new Date(y1, m1 - 1, d1);
    const fim = new Date(y2, m2 - 1, d2);
    for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
      counts[d.getDay()]++;
    }
    return counts;
  }, [dataDeUso, dataAteUso]);

  // Heatmap: dados (empresa, bico) → porDia[0..6] + total.
  // Identifica cada bico por (empresa, nome) — mesma chave de uso. Reusa
  // `bicos` para enriquecer com bomba (código) e produto.
  const dadosHeatmapBicos = useMemo(() => {
    const m = new Map();
    (litrosDiaSemana || []).forEach(r => {
      const nome = String(r.bico || '').trim();
      if (!nome) return;
      const k = `${r.empresa}::${nome}`;
      if (!m.has(k)) {
        m.set(k, {
          chave: k,
          empresa: r.empresa,
          nome,
          porDia: [0, 0, 0, 0, 0, 0, 0],
          total: 0,
        });
      }
      const node = m.get(k);
      const idxDia = Number(r.dia_semana);
      const litros = Number(r.litros) || 0;
      if (idxDia >= 0 && idxDia <= 6) node.porDia[idxDia] += litros;
      node.total += litros;
    });
    // Enriquece com dados do bico (nome amigável, bomba) e nome da bomba.
    const bicosPorChave = new Map();
    (bicos || []).forEach(b => {
      const nm = String(b.nome || '').trim();
      if (!nm) return;
      bicosPorChave.set(`${b.empresa}::${nm}`, b);
    });
    const bombasPorGrid = new Map();
    (bombas || []).forEach(b => bombasPorGrid.set(String(b.grid), b));

    return Array.from(m.values())
      .filter(n => n.total > 0)
      .map(n => {
        const bico = bicosPorChave.get(n.chave);
        const bomba = bico ? bombasPorGrid.get(String(bico.bomba)) : null;
        return {
          ...n,
          bombaCodigo: bomba?.codigo ?? null,
          bombaModelo: bomba?.modelo ?? null,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [litrosDiaSemana, bicos, bombas]);

  // KPIs
  const kpis = useMemo(() => {
    const totalBombas = bombasEnriquecidas.length;
    const totalBicos = bicos.length;
    const fabricantes = new Set();
    const modelos = new Set();
    let totalAfericoes = 0;
    bombasEnriquecidas.forEach(b => {
      if (b.fabricante_nome) fabricantes.add(b.fabricante_nome);
      if (b.modelo) modelos.add(b.modelo);
      totalAfericoes += b.usoAfericoes || 0;
    });
    const mediaBicosPorBomba = totalBombas > 0 ? totalBicos / totalBombas : 0;
    return {
      totalBombas, totalBicos,
      totalFabricantes: fabricantes.size, totalModelos: modelos.size,
      mediaBicosPorBomba, totalAfericoes,
    };
  }, [bombasEnriquecidas, bicos]);

  // Distribuição por fabricante (donut)
  const porFabricante = useMemo(() => {
    const m = new Map();
    bombasEnriquecidas.forEach(b => {
      const nome = b.fabricante_nome || 'Sem fabricante';
      m.set(nome, (m.get(nome) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [bombasEnriquecidas]);

  // Distribuição por modelo (top 10)
  const porModelo = useMemo(() => {
    const m = new Map();
    bombasEnriquecidas.forEach(b => {
      const nome = (b.modelo || 'Sem modelo').toString().trim() || 'Sem modelo';
      m.set(nome, (m.get(nome) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([modelo, qtd]) => ({ modelo, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 10);
  }, [bombasEnriquecidas]);

  // Bombas por empresa
  const porEmpresa = useMemo(() => {
    const m = new Map();
    bombasEnriquecidas.forEach(b => {
      const cod = b.empresa != null ? Number(b.empresa) : null;
      const nome = cod != null ? (mapaEmpresas.get(cod) || `Empresa ${cod}`) : 'Sem empresa';
      m.set(nome, (m.get(nome) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([empresa, qtd]) => ({ empresa, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [bombasEnriquecidas, mapaEmpresas]);

  const [expandidosAfericoes, setExpandidosAfericoes] = useState(new Set());
  function toggleAfericao(key) {
    setExpandidosAfericoes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Aferições enriquecidas + filtradas pela busca.
  const afericoesFiltradas = useMemo(() => {
    const q = buscaAfericoes.trim().toLowerCase();
    return (afericoes || []).filter(a => {
      if (!q) return true;
      return (a.produto_nome || '').toLowerCase().includes(q)
          || (a.pessoa_nome  || '').toLowerCase().includes(q)
          || (a.bico         || '').toString().toLowerCase().includes(q);
    });
  }, [afericoes, buscaAfericoes]);

  // Árvore Data → Produto → Hora (aferição leaf) sobre o resultado filtrado.
  const arvoreAfericoes = useMemo(() => {
    const dias = new Map();
    (afericoesFiltradas || []).forEach(a => {
      const dia = String(a.data || '').slice(0, 10);
      const produtoKey = a.produto_codigo != null ? String(a.produto_codigo) : 'sem_produto';
      if (!dias.has(dia)) {
        dias.set(dia, { dia, qtd: 0, count: 0, produtos: new Map() });
      }
      const dNode = dias.get(dia);
      if (!dNode.produtos.has(produtoKey)) {
        dNode.produtos.set(produtoKey, {
          codigo: a.produto_codigo,
          nome: a.produto_nome || `Produto #${a.produto_codigo ?? '—'}`,
          qtd: 0, count: 0,
          afericoes: [],
        });
      }
      const pNode = dNode.produtos.get(produtoKey);
      const qtd = Number(a.quantidade) || 0;
      pNode.afericoes.push(a);
      pNode.qtd   += qtd;  pNode.count += 1;
      dNode.qtd   += qtd;  dNode.count += 1;
    });
    return Array.from(dias.values())
      .sort((a, b) => b.dia.localeCompare(a.dia))
      .map(d => ({
        ...d,
        produtos: Array.from(d.produtos.values())
          .map(p => ({
            ...p,
            afericoes: p.afericoes.sort(
              (a, b) => String(b.hora || '').localeCompare(String(a.hora || ''))
            ),
          }))
          .sort((a, b) => b.qtd - a.qtd),
      }));
  }, [afericoesFiltradas]);

  // KPIs da seção de aferições.
  const kpisAfericoes = useMemo(() => {
    const total = afericoes.length;
    const produtos = new Set();
    const bicosSet = new Set();
    const pessoas = new Set();
    let ultima = null;
    afericoes.forEach(a => {
      if (a.produto_nome) produtos.add(a.produto_nome);
      if (a.bico) bicosSet.add(`${a.empresa}::${String(a.bico).trim()}`);
      if (a.pessoa_nome) pessoas.add(a.pessoa_nome);
      const ts = a.hora || a.data;
      if (ts && (!ultima || String(ts) > String(ultima))) ultima = ts;
    });
    return { total, produtos: produtos.size, bicos: bicosSet.size, pessoas: pessoas.size, ultima };
  }, [afericoes]);

  // Lista filtrada para tabela
  const bombasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return bombasEnriquecidas;
    return bombasEnriquecidas.filter(b =>
      String(b.codigo).includes(q) ||
      (b.nr_serie || '').toLowerCase().includes(q) ||
      (b.modelo || '').toLowerCase().includes(q) ||
      (b.fabricante_nome || '').toLowerCase().includes(q)
    );
  }, [bombasEnriquecidas, busca]);

  function toggleBomba(grid) {
    setExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(grid)) next.delete(grid); else next.add(grid);
      return next;
    });
  }

  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Operação" description="Bombas, bicos e aferições" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Sua rede ainda não tem <strong>empresas Autosystem</strong> com <code className="font-mono bg-amber-100 px-1 mx-1 rounded">empresa_codigo</code> vinculado.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Operação" description={asRede?.nome || 'Bombas, bicos e aferições'}>
        <div className="hidden md:flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Período</span>
          <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
            {PERIODO_OPTS.map(n => {
              const ativo = periodoUsoDias === n;
              return (
                <button key={n} onClick={() => setPeriodoUsoDias(n)}
                  className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-colors ${
                    ativo
                      ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}>{n}d</button>
              );
            })}
          </div>
        </div>
        {empresasDisponiveis.length > 1 && (
          <EmpresaSeletorCompartilhado
            single
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresaId(id)}
          />
        )}
        <button onClick={carregar} disabled={loading || empresasSel.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </PageHeader>

      {loading ? (
        <SkeletonComercial cards={4} linhas={6} comAbas={false} />
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar os dados</p>
            <p className="text-red-700 mt-1">{erro}</p>
          </div>
        </div>
      ) : bombasEnriquecidas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 mb-3">
            <Gauge className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhuma bomba cadastrada</p>
          <p className="text-xs text-gray-500 mt-1">Verifique no Autosystem se há bombas para as empresas selecionadas.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <Kpi icone={Gauge}   cor="violet" label="Bombas"      valor={formatNumero(kpis.totalBombas)}
              sub={`em ${empresasSel.length} empresa${empresasSel.length === 1 ? '' : 's'}`} />
            <Kpi icone={Droplet} cor="blue"   label="Bicos"       valor={formatNumero(kpis.totalBicos)}
              sub={`média ${formatNumero(kpis.mediaBicosPorBomba, 1)} bicos/bomba`} />
            <Kpi icone={Factory} cor="amber"  label="Fabricantes" valor={formatNumero(kpis.totalFabricantes)} />
            <Kpi icone={Boxes}   cor="emerald" label="Modelos"    valor={formatNumero(kpis.totalModelos)} />
            <Kpi icone={Wrench} cor="rose" label={`Aferições · ${periodoUsoDias}d`}
              valor={formatNumero(kpis.totalAfericoes)}
              sub={`em ${empresasSel.length} empresa${empresasSel.length === 1 ? '' : 's'}`} />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            {/* Distribuição por fabricante (donut) */}
            <CardGrafico titulo="Distribuição por fabricante" subtitulo={`${porFabricante.length} fabricante${porFabricante.length === 1 ? '' : 's'}`}>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={porFabricante} dataKey="qtd" nameKey="nome"
                    cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
                    {porFabricante.map((_, i) => (
                      <Cell key={`fab-${i}`} fill={CORES_FAB[i % CORES_FAB.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} bomba${value === 1 ? '' : 's'}`, name]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardGrafico>

            {/* Top modelos (bar horizontal) */}
            <CardGrafico titulo="Top modelos" subtitulo={`top ${porModelo.length} (de ${kpis.totalModelos} modelos)`}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={porModelo} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#e5e7eb" allowDecimals={false} />
                  <YAxis type="category" dataKey="modelo" width={130} tick={{ fontSize: 10, fill: '#64748b' }} stroke="#e5e7eb" />
                  <Tooltip
                    formatter={(value) => [`${value} bomba${value === 1 ? '' : 's'}`, 'Bombas']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="qtd" fill="#c4b5fd" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardGrafico>
          </div>

          {/* Bombas por empresa (apenas quando multi-empresa) */}
          {porEmpresa.length > 1 && (
            <CardGrafico titulo="Bombas por empresa" subtitulo={`${porEmpresa.length} empresas`}>
              <ResponsiveContainer width="100%" height={Math.max(180, porEmpresa.length * 36)}>
                <BarChart data={porEmpresa} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#e5e7eb" allowDecimals={false} />
                  <YAxis type="category" dataKey="empresa" width={180} tick={{ fontSize: 10, fill: '#64748b' }} stroke="#e5e7eb" />
                  <Tooltip
                    formatter={(value) => [`${value} bomba${value === 1 ? '' : 's'}`, 'Bombas']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="qtd" fill="#fda4af" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardGrafico>
          )}

          {/* Tabela de bombas */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mt-5">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-blue-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Bombas cadastradas</h3>
                <span className="text-[11px] text-gray-400">
                  · {formatNumero(bombasFiltradas.length)} / {formatNumero(bombasEnriquecidas.length)}
                </span>
              </div>
              <div className="flex-1" />
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por código, série, modelo, fabricante..."
                  className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-3 py-2 text-left w-8"></th>
                    <th className="px-3 py-2 text-left">Bomba</th>
                    <th className="px-3 py-2 text-left border-l border-gray-100">Empresa</th>
                    <th className="px-3 py-2 text-left border-l border-gray-100">Fabricante</th>
                    <th className="px-3 py-2 text-left border-l border-gray-100">Modelo</th>
                    <th className="px-3 py-2 text-left border-l border-gray-100">Nº de série</th>
                    <th className="px-3 py-2 text-right border-l-2 border-gray-300">Bicos</th>
                    <th className="px-3 py-2 text-left border-l-2 border-gray-300 min-w-[200px]">Uso · {periodoUsoDias}d</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bombasFiltradas.map(b => {
                    const aberto = expandidas.has(b.grid);
                    const bicosBomba = b.bicos || [];
                    return (
                      <React.Fragment key={b.grid}>
                        <tr className={`cursor-pointer hover:bg-blue-50/30 transition-colors ${aberto ? 'bg-blue-50/30' : ''}`}
                          onClick={() => toggleBomba(b.grid)}>
                          <td className="px-3 py-2">
                            {bicosBomba.length > 0 ? (aberto
                              ? <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
                              : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />)
                              : <span className="inline-block w-3.5" />}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Gauge className="h-3 w-3 text-blue-700" />
                              </div>
                              <span className="text-[12.5px] font-semibold text-gray-900">#{b.codigo}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[11.5px] text-gray-700 border-l border-gray-100">
                            {mapaEmpresas.get(Number(b.empresa)) || `Empresa ${b.empresa}`}
                          </td>
                          <td className="px-3 py-2 text-[11.5px] text-gray-700 border-l border-gray-100">
                            {b.fabricante_nome || <span className="text-gray-400 italic">sem fabricante</span>}
                          </td>
                          <td className="px-3 py-2 text-[11.5px] text-gray-700 border-l border-gray-100">
                            {b.modelo || <span className="text-gray-400 italic">—</span>}
                          </td>
                          <td className="px-3 py-2 text-[11.5px] text-gray-500 font-mono border-l border-gray-100">
                            {b.nr_serie || '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] font-bold text-gray-900 border-l-2 border-gray-300">
                            {bicosBomba.length}
                          </td>
                          <td className="px-3 py-2 border-l-2 border-gray-300">
                            {b.usoVolume > 0 || b.usoAfericoes > 0 ? (
                              <div className="flex flex-col gap-0.5 min-w-[200px]">
                                {b.usoVolume > 0 && (
                                  <>
                                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                                      <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all"
                                        style={{ width: `${Math.max(2, maxVolumeBomba > 0 ? (b.usoVolume / maxVolumeBomba) * 100 : 0)}%` }} />
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] font-mono tabular-nums">
                                      <span className="font-semibold text-gray-800">
                                        {b.usoVolume.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} L
                                      </span>
                                      <span className="text-gray-400">
                                        · {b.usoVendas.toLocaleString('pt-BR')} venda{b.usoVendas === 1 ? '' : 's'}
                                      </span>
                                    </div>
                                  </>
                                )}
                                <div className={`flex items-center gap-1 text-[10px] tabular-nums ${b.usoAfericoes > 0 ? 'text-amber-700' : 'text-gray-300'}`}>
                                  <Wrench className="h-3 w-3" />
                                  <span className="font-semibold">{b.usoAfericoes.toLocaleString('pt-BR')}</span>
                                  <span className="font-normal">aferiç{b.usoAfericoes === 1 ? 'ão' : 'ões'}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-300">sem movimentação</span>
                            )}
                          </td>
                        </tr>
                        {aberto && bicosBomba.length > 0 && (
                          <tr className="bg-gray-50/40">
                            <td colSpan={8} className="px-4 py-3">
                              <BicosBomba
                                bicos={bicosBomba}
                                getUso={usoDoBico}
                                periodoDias={periodoUsoDias}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Heatmap de vendas em litros por bico × dia da semana */}
          {dadosHeatmapBicos.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mt-5">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                <Droplet className="h-4 w-4 text-blue-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">
                  Vendas por bico × dia da semana
                </h3>
                <span className="text-[11px] text-gray-400">
                  · em litros · últimos {periodoUsoDias} dias · {dadosHeatmapBicos.length} bico{dadosHeatmapBicos.length === 1 ? '' : 's'}
                </span>
              </div>
              <HeatmapBicosDia
                dados={dadosHeatmapBicos}
                contagemDias={contagemDiasSemana}
              />
            </div>
          )}

          {/* Detalhamento das aferições realizadas */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mt-5">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-600" />
                <h3 className="text-[13px] font-semibold text-gray-800">Aferições realizadas</h3>
                <span className="text-[11px] text-gray-400">
                  · {formatNumero(afericoesFiltradas.length)} / {formatNumero(afericoes.length)} · últimos {periodoUsoDias} dias
                </span>
              </div>
              <div className="flex-1" />
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={buscaAfericoes} onChange={e => setBuscaAfericoes(e.target.value)}
                  placeholder="Buscar por produto, bico ou pessoa..."
                  className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100" />
              </div>
            </div>

            {/* KPIs da seção */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 border-b border-gray-100">
              <KpiSecao icone={Wrench}  label="Aferições no período" valor={formatNumero(kpisAfericoes.total)} cor="amber" />
              <KpiSecao icone={Droplet} label="Bicos aferidos"        valor={formatNumero(kpisAfericoes.bicos)} cor="violet" />
              <KpiSecao icone={Boxes}   label="Produtos aferidos"     valor={formatNumero(kpisAfericoes.produtos)} cor="emerald" />
              <KpiSecao icone={Factory} label="Pessoas envolvidas"    valor={formatNumero(kpisAfericoes.pessoas)} cor="blue" />
            </div>

            {/* Tree Data → Produto → Hora */}
            {afericoes.length === 0 ? (
              <div className="p-12 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-3">
                  <Wrench className="h-6 w-6 text-amber-600" />
                </div>
                <p className="text-sm font-medium text-gray-900">Nenhuma aferição registrada no período</p>
                <p className="text-xs text-gray-500 mt-1">Aumente o período acima ou verifique no Autosystem.</p>
              </div>
            ) : arvoreAfericoes.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-500">Nenhuma aferição encontrada para a busca aplicada.</p>
              </div>
            ) : (
              <AfericoesTree
                arvore={arvoreAfericoes}
                expandidos={expandidosAfericoes}
                onToggle={toggleAfericao}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Tree de aferições: Data → Produto → Hora (leaf).
function AfericoesTree({ arvore, expandidos, onToggle }) {
  const fmtQtd = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
          <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2 text-left">Data / Produto / Hora</th>
            <th className="px-3 py-2 text-left border-l border-gray-100">Bico</th>
            <th className="px-3 py-2 text-right border-l-2 border-gray-300">Aferições</th>
            <th className="px-3 py-2 text-right border-l border-gray-100">Quantidade</th>
            <th className="px-3 py-2 text-left border-l-2 border-gray-300">Pessoa</th>
          </tr>
        </thead>
        <tbody>
          {arvore.map(dNode => {
            const dKey = `afD:${dNode.dia}`;
            const dAberto = expandidos.has(dKey);
            return (
              <React.Fragment key={dKey}>
                <tr className="cursor-pointer bg-amber-50/40 hover:bg-amber-50/70 transition-colors border-t border-amber-100"
                  onClick={() => onToggle(dKey)}>
                  <td className="pl-4 pr-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {dAberto
                        ? <ChevronDown className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                        : <ChevronRight className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />}
                      <span className="text-[12.5px] font-semibold text-gray-900">{formatDataBR(dNode.dia)}</span>
                      <span className="text-[10px] text-gray-400">· {dNode.produtos.length} produto{dNode.produtos.length === 1 ? '' : 's'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 border-l border-gray-100" />
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12.5px] font-bold text-gray-900 border-l-2 border-gray-300">
                    {dNode.count}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12.5px] font-bold text-gray-900 border-l border-gray-100">
                    {fmtQtd(dNode.qtd)} L
                  </td>
                  <td className="px-3 py-2.5 border-l-2 border-gray-300" />
                </tr>
                {dAberto && dNode.produtos.map(pNode => {
                  const pKey = `${dKey}/p:${pNode.codigo ?? 'none'}`;
                  const pAberto = expandidos.has(pKey);
                  return (
                    <React.Fragment key={pKey}>
                      <tr className="cursor-pointer bg-gray-50/50 hover:bg-gray-100/70 transition-colors"
                        onClick={() => onToggle(pKey)}>
                        <td className="pl-10 pr-3 py-2">
                          <div className="flex items-center gap-2">
                            {pAberto
                              ? <ChevronDown className="h-3 w-3 text-gray-500 flex-shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-gray-500 flex-shrink-0" />}
                            <Boxes className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                            <span className="text-[12px] font-medium text-gray-800 truncate max-w-[300px]">{pNode.nome}</span>
                            {pNode.codigo != null && (
                              <span className="text-[10px] text-gray-400 font-mono">cód {pNode.codigo}</span>
                            )}
                            <span className="text-[10px] text-gray-400">· {pNode.afericoes.length} aferiç{pNode.afericoes.length === 1 ? 'ão' : 'ões'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 border-l border-gray-100" />
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-800 border-l-2 border-gray-300">
                          {pNode.count}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-800 border-l border-gray-100">
                          {fmtQtd(pNode.qtd)} L
                        </td>
                        <td className="px-3 py-2 border-l-2 border-gray-300" />
                      </tr>
                      {pAberto && pNode.afericoes.map((a, idx) => (
                        <tr key={`${pKey}/h:${idx}`}
                          className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-amber-50/30 transition-colors`}>
                          <td className="pl-16 pr-3 py-1.5">
                            <span className="text-[12px] font-mono tabular-nums text-gray-800">
                              {formatTimestamp(a.hora || a.data)}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 border-l border-gray-100">
                            <span className="inline-flex items-center gap-1 text-[11.5px] text-gray-700">
                              <Droplet className="h-3 w-3 text-blue-500" />
                              {a.bico || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-[11px] text-gray-300 border-l-2 border-gray-300">—</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-900 font-semibold border-l border-gray-100">
                            {fmtQtd(a.quantidade)} L
                          </td>
                          <td className="px-3 py-1.5 border-l-2 border-gray-300">
                            <p className="text-[11.5px] text-gray-700 truncate max-w-[220px]">
                              {a.pessoa_nome || <span className="italic text-gray-400">não identificada</span>}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Heatmap de bicos × dia da semana ────────────────────────
const DIAS_SEMANA_HEAT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function corHeatmap(valor, maxValor) {
  if (!valor || valor <= 0 || maxValor === 0) return { bg: '#f9fafb', text: '#9ca3af' };
  const r = valor / maxValor;
  if (r < 0.15) return { bg: '#ede9fe', text: '#4c1d95' }; // blue-100
  if (r < 0.30) return { bg: '#ddd6fe', text: '#4c1d95' }; // blue-200
  if (r < 0.50) return { bg: '#c4b5fd', text: '#4c1d95' }; // blue-300
  if (r < 0.70) return { bg: '#a78bfa', text: '#2e1065' }; // blue-400
  if (r < 0.90) return { bg: '#8b5cf6', text: '#ffffff' }; // blue-500
  return                 { bg: '#7c3aed', text: '#ffffff' }; // blue-600
}
function HeatmapBicosDia({ dados, contagemDias }) {
  const max = useMemo(() => {
    let m = 0;
    dados.forEach(p => p.porDia.forEach(v => { if (v > m) m = v; }));
    return m;
  }, [dados]);
  const totalPorDia = useMemo(() => {
    const t = [0, 0, 0, 0, 0, 0, 0];
    dados.forEach(p => p.porDia.forEach((v, i) => { t[i] += v; }));
    return t;
  }, [dados]);
  const totalGeral = totalPorDia.reduce((s, v) => s + v, 0);
  const totalDias = (contagemDias || []).reduce((s, v) => s + v, 0);
  const porDiaCount = contagemDias || [0, 0, 0, 0, 0, 0, 0];
  const media = (total, count) => (count > 0 ? total / count : 0);
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  return (
    <div className="p-3 sm:p-4">
      {/* Mobile (<md): lista de cards por bico — heatmap em linha de 7 pílulas */}
      <div className="md:hidden space-y-2">
        {dados.map(p => (
          <div key={p.chave} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Droplet className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{p.nome}</p>
                  {p.bombaCodigo != null && (
                    <p className="text-[10px] text-gray-400 truncate">
                      Bomba #{p.bombaCodigo}{p.bombaModelo ? ` · ${p.bombaModelo}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[13px] font-bold text-gray-900 font-mono tabular-nums leading-tight">{fmt(p.total)} L</p>
                {totalDias > 0 && (
                  <p className="text-[9.5px] text-gray-500 leading-tight">média {fmt(media(p.total, totalDias))}/dia</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {p.porDia.map((v, idx) => {
                const c = corHeatmap(v, max);
                const cnt = porDiaCount[idx];
                return (
                  <div key={idx}
                    className="rounded-md text-center px-0.5 py-1 font-mono tabular-nums"
                    style={{ background: c.bg, color: c.text }}>
                    <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70 leading-tight">{DIAS_SEMANA_HEAT[idx]}</div>
                    <div className="text-[10px] font-semibold leading-tight mt-0.5">
                      {v > 0 ? fmt(v) : '—'}
                    </div>
                    {v > 0 && cnt > 0 && (
                      <div className="text-[8.5px] opacity-60 leading-tight">{fmt(media(v, cnt))}/d</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Card de Total geral */}
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">Total</p>
            <div className="text-right">
              <p className="text-[14px] font-bold text-blue-900 font-mono tabular-nums leading-tight">{fmt(totalGeral)} L</p>
              {totalDias > 0 && (
                <p className="text-[10px] text-blue-700">média {fmt(media(totalGeral, totalDias))}/dia</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {totalPorDia.map((v, idx) => {
              const cnt = porDiaCount[idx];
              return (
                <div key={idx} className="rounded-md text-center px-0.5 py-1 font-mono tabular-nums bg-white border border-blue-100">
                  <div className="text-[9px] uppercase tracking-wider font-semibold text-blue-700 leading-tight">{DIAS_SEMANA_HEAT[idx]}</div>
                  <div className="text-[10px] font-bold text-gray-800 leading-tight mt-0.5">{v > 0 ? fmt(v) : '—'}</div>
                  {v > 0 && cnt > 0 && (
                    <div className="text-[8.5px] text-gray-500 leading-tight">{fmt(media(v, cnt))}/d</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop (md+): heatmap tabular original */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-separate table-fixed" style={{ borderSpacing: '4px' }}>
          <colgroup>
            <col style={{ width: '24%' }} />
            {DIAS_SEMANA_HEAT.map(d => <col key={d} style={{ width: '9%' }} />)}
            <col style={{ width: '13%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2 text-left">Bico</th>
              {DIAS_SEMANA_HEAT.map(d => (
                <th key={d} className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-2 text-center">{d}</th>
              ))}
              <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {dados.map(p => (
              <tr key={p.chave}>
                <td className="px-3 py-1.5 text-[12px] text-gray-800 pr-4">
                  <div className="flex items-center gap-1.5">
                    <Droplet className="h-3 w-3 text-blue-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{p.nome}</p>
                      {p.bombaCodigo != null && (
                        <p className="text-[9.5px] text-gray-400 truncate">
                          Bomba #{p.bombaCodigo}{p.bombaModelo ? ` · ${p.bombaModelo}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                {p.porDia.map((v, idx) => {
                  const c = corHeatmap(v, max);
                  const cnt = porDiaCount[idx];
                  return (
                    <td key={idx}
                      className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums transition-transform hover:scale-105 hover:ring-1 hover:ring-blue-500"
                      style={{ background: c.bg, color: c.text }}>
                      <div className="text-[11px] font-semibold leading-tight">
                        {v > 0 ? fmt(v) : '—'}
                      </div>
                      {v > 0 && cnt > 0 && (
                        <div className="text-[9px] opacity-70 leading-tight mt-0.5">
                          média {fmt(media(v, cnt))}/dia
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums bg-gray-100 text-gray-800">
                  <div className="text-[11.5px] font-bold leading-tight">{fmt(p.total)}</div>
                  {totalDias > 0 && (
                    <div className="text-[9px] text-gray-500 leading-tight mt-0.5">
                      média {fmt(media(p.total, totalDias))}/dia
                    </div>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap pr-4 border-t border-gray-200">
                Total
              </td>
              {totalPorDia.map((v, idx) => {
                const cnt = porDiaCount[idx];
                return (
                  <td key={idx} className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums bg-gray-100 text-gray-800">
                    <div className="text-[11.5px] font-bold leading-tight">{v > 0 ? fmt(v) : '—'}</div>
                    {v > 0 && cnt > 0 && (
                      <div className="text-[9px] text-gray-500 leading-tight mt-0.5">média {fmt(media(v, cnt))}/dia</div>
                    )}
                  </td>
                );
              })}
              <td className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums bg-blue-100 text-blue-900">
                <div className="text-[11.5px] font-bold leading-tight">{fmt(totalGeral)}</div>
                {totalDias > 0 && (
                  <div className="text-[9px] text-blue-700 leading-tight mt-0.5">
                    média {fmt(media(totalGeral, totalDias))}/dia
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-gray-400 mt-3 px-1">
        Valores em litros. Intensidade da cor proporcional ao total da célula
        (escala global, max = <strong className="text-gray-600">{fmt(max)} L</strong>).
      </p>
    </div>
  );
}

// ─── Componentes ─────────────────────────────────────────────
function Kpi({ icone: Icone, cor, label, valor, sub }) {
  const palette = {
    violet:  { bg: 'bg-blue-50',  icon: 'text-blue-600' },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600' },
  };
  const Pal = palette[cor] || palette.violet;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${Pal.bg} p-2.5 flex-shrink-0`}>
          <Icone className={`h-5 w-5 ${Pal.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className="text-lg font-semibold text-gray-900 tracking-tight truncate">{valor}</p>
          {sub && <p className="text-[10.5px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// KPI compacto usado dentro de seções (sem card de fundo branco grande).
function KpiSecao({ icone: Icone, label, valor, cor }) {
  const palette = {
    violet:  { bg: 'bg-blue-50',  icon: 'text-blue-600',  text: 'text-blue-900' },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    text: 'text-blue-900' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   text: 'text-amber-900' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', text: 'text-emerald-900' },
  };
  const Pal = palette[cor] || palette.violet;
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg ${Pal.bg} p-2 flex-shrink-0`}>
          <Icone className={`h-4 w-4 ${Pal.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider truncate">{label}</p>
          <p className={`text-base font-bold ${Pal.text} leading-tight tracking-tight`}>{valor}</p>
        </div>
      </div>
    </div>
  );
}

function CardGrafico({ titulo, subtitulo, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-blue-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">{titulo}</h3>
        {subtitulo && <span className="text-[11px] text-gray-400">· {subtitulo}</span>}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// Renderiza os bicos de uma bomba como uma tabelinha enxuta.
// O schema é dinâmico (select * from bico) — escondemos colunas redundantes/internas
// e priorizamos as colunas mais úteis para análise operacional.
function BicosBomba({ bicos, getUso, periodoDias = 90 }) {
  if (!bicos || bicos.length === 0) return null;
  // Volume máximo entre os bicos desta bomba (base da barra de uso).
  const maxVolume = (bicos || []).reduce((m, b) => {
    const u = getUso?.(b);
    return Math.max(m, u?.quantidade_total || 0);
  }, 0);
  // Colunas que NÃO devem aparecer no detalhamento (ruído / internas).
  const BLACKLIST = new Set([
    'grid', 'bomba', 'empresa',
    'bico_arla', 'casa_decimal_pu', 'desconto',
    'ctf', 'enc_ini', 'tipo_preco',
    'deposito', // mostramos os campos derivados (deposito_*) no lugar
  ]);
  // Ordem preferencial das colunas exibidas. `nome` vira a primeira (rotulada "Bico").
  const PRIORIDADE = [
    'nome',
    'deposito_codigo', 'deposito_nome', 'deposito_capacidade',
    'codigo', 'produto', 'produto_nome', 'combustivel', 'tipo', 'modelo', 'nr_serie',
  ];
  // Renomeações de cabeçalho (label customizado por chave).
  const LABEL = {
    nome: 'Bico',
    deposito_codigo: 'Código do tanque',
    deposito_nome: 'Tanque',
    deposito_capacidade: 'Capacidade',
  };
  // Colunas numéricas que devem ser formatadas com separador de milhar pt-BR.
  // (Códigos como `codigo` continuam exibidos sem separador.)
  const NUMERICAS = new Set(['deposito_capacidade']);
  const todasChaves = Array.from(
    new Set(bicos.flatMap(b => Object.keys(b))).values()
  ).filter(k => !BLACKLIST.has(k));
  const colunas = [
    ...PRIORIDADE.filter(k => todasChaves.includes(k)),
    ...todasChaves.filter(k => !PRIORIDADE.includes(k)).sort(),
  ];
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Droplet className="h-3.5 w-3.5 text-blue-500" />
        <h4 className="text-[12px] font-semibold text-gray-700">
          {bicos.length} bico{bicos.length === 1 ? '' : 's'} desta bomba
        </h4>
        <span className="text-[10px] text-gray-400">
          · uso baseado nos últimos {periodoDias} dias
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
              {colunas.map(c => (
                <th key={c} className="px-2.5 py-1.5 text-left whitespace-nowrap">
                  {LABEL[c] || c}
                </th>
              ))}
              <th className="px-2.5 py-1.5 text-left whitespace-nowrap border-l-2 border-gray-300 min-w-[200px]">
                Uso
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bicos.map((b, idx) => {
              const uso = getUso?.(b);
              const volume    = uso?.quantidade_total || 0;
              const vendas    = uso?.vendas_count     || 0;
              const afericoes = uso?.afericoes_count  || 0;
              const pct = maxVolume > 0 ? (volume / maxVolume) * 100 : 0;
              return (
                <tr key={String(b.grid) + idx} className="hover:bg-blue-50/30 transition-colors">
                  {colunas.map(c => {
                    const v = b[c];
                    const vazio = v == null || v === '';
                    let conteudo;
                    if (vazio) conteudo = <span className="text-gray-300">—</span>;
                    else if (NUMERICAS.has(c)) {
                      const num = Number(v);
                      conteudo = Number.isFinite(num)
                        ? num.toLocaleString('pt-BR', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })
                        : String(v);
                    } else {
                      conteudo = String(v);
                    }
                    return (
                      <td key={c} className="px-2.5 py-1.5 font-mono tabular-nums text-gray-700 whitespace-nowrap">
                        {conteudo}
                      </td>
                    );
                  })}
                  <td className="px-2.5 py-1.5 border-l-2 border-gray-300">
                    {volume > 0 || afericoes > 0 ? (
                      <div className="flex flex-col gap-0.5 min-w-[200px]">
                        {volume > 0 && (
                          <>
                            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all"
                                style={{ width: `${Math.max(2, pct)}%` }} />
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-mono tabular-nums">
                              <span className="font-semibold text-gray-800">
                                {volume.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} L
                              </span>
                              <span className="text-gray-400">
                                · {vendas.toLocaleString('pt-BR')} venda{vendas === 1 ? '' : 's'}
                              </span>
                            </div>
                          </>
                        )}
                        <div className={`flex items-center gap-1 text-[10px] tabular-nums ${afericoes > 0 ? 'text-amber-700' : 'text-gray-300'}`}>
                          <Wrench className="h-3 w-3" />
                          <span className="font-semibold">{afericoes.toLocaleString('pt-BR')}</span>
                          <span className="font-normal">aferiç{afericoes === 1 ? 'ão' : 'ões'}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-300">sem movimentação no período</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

