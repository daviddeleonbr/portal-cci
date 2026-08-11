// Aba "Exportação" da Exportação Contábil.
// Busca a movto do período/empresa (via túnel), aplica o de/para + históricos
// (com rastreio de provisão) e mostra a prévia + download para testes.
// As colunas exportadas são configuráveis (modal "Colunas").
import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, ChevronDown, AlertCircle, Play, Download, FileDown, CheckCircle2, SlidersHorizontal,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '../ui/Modal';
import * as autosystemService from '../../services/autosystemService';
import * as deParaService from '../../services/deParaService';
import * as planoService from '../../services/planoContabilService';
import { resolverLinha } from '../../utils/resolverDePara';

function primeiroUltimoDiaMes() {
  const h = new Date();
  const ini = new Date(h.getFullYear(), h.getMonth(), 1);
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return [fmt(ini), fmt(fim)];
}

const fmtValorBR = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDataBR = (d) => {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const [a, m, dia] = s.split('-');
  return (a && m && dia) ? `${dia}/${m}/${a}` : s;
};

// Colunas disponíveis. `contabil` marca as que devem sinalizar pendência.
const COLUNAS = [
  { key: 'data',       label: 'Data',              get: (l) => fmtDataBR(l.data) },
  { key: 'deb_cont',   label: 'Conta contábil débito',  get: (l) => l.contabil_debito || '', contabil: 'deb' },
  { key: 'deb_red',    label: 'Reduzido débito',    get: (l, ctx) => ctx.reduzido(l.contabil_debito) },
  { key: 'cred_cont',  label: 'Conta contábil crédito', get: (l) => l.contabil_credito || '', contabil: 'cred' },
  { key: 'cred_red',   label: 'Reduzido crédito',   get: (l, ctx) => ctx.reduzido(l.contabil_credito) },
  { key: 'valor',      label: 'Valor',              get: (l) => Number(l.valor || 0), num: true },
  { key: 'historico',  label: 'Histórico',          get: (l) => l.historico || '' },
  // opcionais (default OFF) — referência/depuração
  { key: 'deb_ger',    label: 'Débito gerencial',   get: (l) => l.conta_debitar || '', opcional: true },
  { key: 'cred_ger',   label: 'Crédito gerencial',  get: (l) => l.conta_creditar || '', opcional: true },
  { key: 'documento',  label: 'Documento',          get: (l) => l.documento || '', opcional: true },
  { key: 'pessoa',     label: 'Pessoa',             get: (l) => l.pessoa_nome || '', opcional: true },
];
const COLS_PADRAO = COLUNAS.filter(c => !c.opcional).map(c => c.key);

export default function AbaExportacao({ showToast }) {
  const [redes, setRedes] = useState([]);
  const [redeId, setRedeId] = useState('');
  const [planos, setPlanos] = useState([]);
  const [planoId, setPlanoId] = useState('');
  const [empresas, setEmpresas] = useState([]);
  const [empresaSel, setEmpresaSel] = useState(new Set());
  const [carregandoEmp, setCarregandoEmp] = useState(false);
  const [erroEmp, setErroEmp] = useState(null);

  const [dtIni, dtFimDefault] = useMemo(() => primeiroUltimoDiaMes(), []);
  const [dataDe, setDataDe] = useState(dtIni);
  const [dataAte, setDataAte] = useState(dtFimDefault);

  const [contabeis, setContabeis] = useState([]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState(null);
  const [linhas, setLinhas] = useState(null); // resolvidas

  const [colsSel, setColsSel] = useState(() => new Set(COLS_PADRAO));
  const [modalCols, setModalCols] = useState(false);
  const [mostrarExcluidas, setMostrarExcluidas] = useState(false);

  useEffect(() => {
    (async () => {
      try { setRedes(await autosystemService.listarRedes()); }
      catch (err) { showToast?.('error', 'Erro ao carregar redes: ' + err.message); }
    })();
  }, [showToast]);

  useEffect(() => {
    setLinhas(null);
    if (!redeId) { setPlanos([]); setPlanoId(''); setEmpresas([]); setEmpresaSel(new Set()); return; }
    (async () => {
      try {
        const ps = await deParaService.listarPlanosDaRede(redeId);
        setPlanos(ps); setPlanoId(ps.length === 1 ? ps[0].id : '');
      } catch (err) { showToast?.('error', err.message); }
    })();
    (async () => {
      setCarregandoEmp(true); setErroEmp(null);
      try {
        const emp = await deParaService.buscarEmpresas(redeId);
        setEmpresas(emp);
        setEmpresaSel(new Set(emp.map(e => String(e.grid)))); // todas por padrão (filtra por grid)
      } catch (err) { setErroEmp(err.message); setEmpresas([]); }
      finally { setCarregandoEmp(false); }
    })();
  }, [redeId, showToast]);

  useEffect(() => {
    if (!planoId) { setContabeis([]); return; }
    (async () => { try { setContabeis(await planoService.listarContas(planoId)); } catch { /* ignore */ } })();
  }, [planoId]);

  const contabilPorCodigo = useMemo(() => Object.fromEntries(contabeis.map(c => [c.codigo, c])), [contabeis]);
  const ctx = useMemo(() => ({
    reduzido: (cod) => (cod && contabilPorCodigo[cod]?.codigo_reduzido) || '',
  }), [contabilPorCodigo]);
  const colunasAtivas = useMemo(() => COLUNAS.filter(c => colsSel.has(c.key)), [colsSel]);

  const gerar = async () => {
    if (!redeId || !planoId) { showToast?.('warning', 'Selecione rede e plano.'); return; }
    if (empresaSel.size === 0) { showToast?.('warning', 'Selecione ao menos uma empresa.'); return; }
    setGerando(true); setErro(null); setLinhas(null);
    try {
      const [cfg, movto] = await Promise.all([
        deParaService.carregarConfig(redeId, planoId),
        deParaService.buscarMovtoExport(redeId, { empresaCodigos: [...empresaSel], dataDe, dataAte }),
      ]);
      setLinhas(movto.map(row => resolverLinha(row, cfg)));
    } catch (err) { setErro(err.message); }
    finally { setGerando(false); }
  };

  const exportaveis = useMemo(() => (linhas || []).filter(l => !l.excluida), [linhas]);
  const resumo = useMemo(() => {
    if (!linhas) return null;
    const excluidas = linhas.filter(l => l.excluida).length;
    const pend = exportaveis.filter(l => l.pendente).length;
    return { total: linhas.length, excluidas, exportaveis: exportaveis.length, pendentes: pend };
  }, [linhas, exportaveis]);

  const baixar = () => {
    if (!exportaveis.length) return;
    const aoa = [
      colunasAtivas.map(c => c.label),
      ...exportaveis.map(l => colunasAtivas.map(c => c.num ? Number(c.get(l, ctx)) : c.get(l, ctx))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Exportacao');
    XLSX.writeFile(wb, `exportacao-contabil-${dataDe}_a_${dataAte}.xlsx`);
  };

  const toggleEmp = (cod) => setEmpresaSel(prev => { const n = new Set(prev); const k = String(cod); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleCol = (key) => setColsSel(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900 p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Rede</label>
            <div className="relative">
              <select value={redeId} onChange={e => setRedeId(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 pr-8 text-sm dark:text-gray-100 appearance-none focus:border-blue-400 focus:outline-none">
                <option value="">Selecione…</option>
                {redes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
              <ChevronDown className="h-4 w-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Plano contábil</label>
            <div className="relative">
              <select value={planoId} onChange={e => setPlanoId(e.target.value)} disabled={!redeId || planos.length === 0}
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 pr-8 text-sm dark:text-gray-100 appearance-none disabled:opacity-50 focus:border-blue-400 focus:outline-none">
                <option value="">{redeId && planos.length === 0 ? 'Nenhum plano atribuído' : 'Selecione…'}</option>
                {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <ChevronDown className="h-4 w-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">De</label>
            <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 text-sm dark:text-gray-100 focus:border-blue-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Até</label>
            <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 text-sm dark:text-gray-100 focus:border-blue-400 focus:outline-none" />
          </div>
        </div>

        {/* Empresas */}
        {redeId && (
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Empresas</label>
            {carregandoEmp ? (
              <div className="text-gray-400 py-1"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : erroEmp ? (
              <p className="text-[12px] text-red-600 dark:text-red-400">{erroEmp}</p>
            ) : empresas.length === 0 ? (
              <p className="text-[12px] text-gray-400">Nenhuma empresa.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {empresas.map(e => {
                  const on = empresaSel.has(String(e.grid));
                  return (
                    <button key={e.grid} onClick={() => toggleEmp(e.grid)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                        on ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300'
                           : 'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5'
                      }`}>
                      {on && <CheckCircle2 className="h-3 w-3" />}{e.codigo != null && <span className="font-mono">#{e.codigo}</span>} {e.nome}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setModalCols(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2.5 text-[12.5px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5">
            <SlidersHorizontal className="h-4 w-4" /> Colunas ({colunasAtivas.length})
          </button>
          <button onClick={gerar} disabled={gerando || !redeId || !planoId}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Gerar prévia
          </button>
        </div>
      </div>

      {/* Resultado */}
      {gerando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /> <span className="text-sm">Buscando movimentação e aplicando o de/para…</span></div>
      ) : erro ? (
        <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50/60 dark:bg-red-500/10 p-6 text-center">
          <AlertCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Falha ao gerar a exportação</p>
          <p className="text-[12.5px] text-red-700 dark:text-red-400 mt-1 max-w-lg mx-auto">{erro}</p>
        </div>
      ) : linhas ? (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-white/10">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{resumo.exportaveis} exportável(is) de {resumo.total}</p>
            {resumo.excluidas > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 px-2 py-0.5 text-[11.5px] font-medium">{resumo.excluidas} excluída(s)</span>}
            {resumo.pendentes > 0
              ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11.5px] font-medium"><AlertCircle className="h-3.5 w-3.5" /> {resumo.pendentes} sem mapeamento completo</span>
              : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11.5px] font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> todos mapeados</span>}
            <div className="ml-auto flex items-center gap-3">
              {resumo.excluidas > 0 && (
                <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={mostrarExcluidas} onChange={e => setMostrarExcluidas(e.target.checked)} className="rounded" /> Mostrar excluídas
                </label>
              )}
              <button onClick={baixar} disabled={!exportaveis.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50">
                <Download className="h-4 w-4" /> Baixar .xlsx
              </button>
            </div>
          </div>

          {linhas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <FileDown className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma movimentação no período/empresa.</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-100 dark:bg-slate-800 z-10">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {colunasAtivas.map(c => <th key={c.key} className={`px-3 py-2 ${c.num ? 'text-right' : ''}`}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {(mostrarExcluidas ? linhas : exportaveis).slice(0, 500).map((l, i) => (
                    <tr key={i} className={l.excluida ? 'opacity-45' : l.pendente ? 'bg-amber-50/40 dark:bg-amber-500/5' : 'hover:bg-gray-50/60 dark:hover:bg-white/5'}>
                      {colunasAtivas.map(c => {
                        const v = c.get(l, ctx);
                        if (c.contabil && !v && !l.excluida) {
                          const ger = c.contabil === 'deb' ? l.conta_debitar : l.conta_creditar;
                          return <td key={c.key} className="px-3 py-1.5 text-[12.5px] text-red-500 whitespace-nowrap">⚠ {ger}</td>;
                        }
                        if (c.num) return <td key={c.key} className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${l.excluida ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>{fmtValorBR(v)}</td>;
                        return <td key={c.key} className={`px-3 py-1.5 text-[12.5px] whitespace-nowrap ${l.excluida ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>{v || <span className="text-gray-300">—</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {(mostrarExcluidas ? linhas.length : exportaveis.length) > 500 && <p className="px-5 py-2 text-[12px] text-gray-400">Mostrando 500 de {mostrarExcluidas ? linhas.length : exportaveis.length}. Baixe o .xlsx para ver todas.</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center text-center gap-2 py-16 px-6">
          <FileDown className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Selecione rede, plano, empresas e período, e clique em "Gerar prévia".</p>
        </div>
      )}

      {/* Modal de colunas */}
      <Modal open={modalCols} onClose={() => setModalCols(false)} title="Colunas da exportação" size="sm"
        footer={<div className="flex justify-end"><button onClick={() => setModalCols(false)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Concluir</button></div>}>
        <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mb-3">Escolha as colunas do arquivo. Documento e Pessoa normalmente vão no <strong>Histórico</strong> (parametrizado nas regras de histórico).</p>
        <div className="space-y-1">
          {COLUNAS.map(c => (
            <label key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer">
              <input type="checkbox" checked={colsSel.has(c.key)} onChange={() => toggleCol(c.key)} className="rounded" />
              <span className="text-sm text-gray-800 dark:text-gray-200">{c.label}</span>
              {c.opcional && <span className="text-[10.5px] text-gray-400">opcional</span>}
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
