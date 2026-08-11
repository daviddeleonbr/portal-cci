// Aba "De/Para" da Exportação Contábil.
// Mapeia as contas gerenciais do cliente (tabela `conta` do Autosystem, via
// túnel) → contas contábeis do plano atribuído à rede. Duas camadas:
//   • Mapa direto: conta gerencial → conta contábil.
//   • Regras condicionais: sobrepõem o mapa conforme conta débito/crédito.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Loader2, Network, Search, Plus, Trash2, Check, ChevronDown, AlertCircle, X, ListChecks, GitBranch, Type, Pencil, Ban, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import * as autosystemService from '../../services/autosystemService';
import * as deParaService from '../../services/deParaService';
import * as planoService from '../../services/planoContabilService';

export default function AbaDePara({ showToast }) {
  const [redes, setRedes] = useState([]);
  const [redeId, setRedeId] = useState('');
  const [planos, setPlanos] = useState([]);
  const [planoId, setPlanoId] = useState('');

  const [gerenciais, setGerenciais] = useState([]);   // {codigo, nome, credor, tipo_despesa, lancar}
  const [contabeis, setContabeis] = useState([]);      // {codigo, descricao, classificacao}
  const [mapa, setMapa] = useState({});                // conta_gerencial -> conta_contabil_codigo
  const [regras, setRegras] = useState([]);
  const [historicos, setHistoricos] = useState([]);
  const [exclusoes, setExclusoes] = useState([]);
  const [passagem, setPassagem] = useState(new Set()); // contas gerenciais marcadas como passagem

  const [carregandoRede, setCarregandoRede] = useState(false);
  const [erroTunel, setErroTunel] = useState(null);
  const [sub, setSub] = useState('mapa'); // 'mapa' | 'regras'

  // redes Autosystem
  useEffect(() => {
    (async () => {
      try { setRedes(await autosystemService.listarRedes()); }
      catch (err) { showToast?.('error', 'Erro ao carregar redes: ' + err.message); }
    })();
  }, [showToast]);

  // planos atribuídos à rede
  useEffect(() => {
    if (!redeId) { setPlanos([]); setPlanoId(''); return; }
    (async () => {
      try {
        const lista = await deParaService.listarPlanosDaRede(redeId);
        setPlanos(lista);
        setPlanoId(lista.length === 1 ? lista[0].id : '');
      } catch (err) { showToast?.('error', err.message); }
    })();
  }, [redeId, showToast]);

  // carrega gerencial (túnel) + contábil + mapa + regras quando rede+plano prontos
  const carregar = useCallback(async () => {
    if (!redeId || !planoId) return;
    setCarregandoRede(true); setErroTunel(null);
    try {
      const [ger, cont, mp, rg, pass, hist, excl] = await Promise.all([
        deParaService.buscarPlanoGerencial(redeId),
        planoService.listarContas(planoId),
        deParaService.listarMapa(redeId, planoId),
        deParaService.listarRegras(redeId, planoId),
        deParaService.listarPassagem(redeId),
        deParaService.listarHistoricos(redeId, planoId),
        deParaService.listarExclusoes(redeId, planoId),
      ]);
      setGerenciais(ger);
      setContabeis(cont);
      setMapa(Object.fromEntries(mp.map(m => [m.conta_gerencial, m.conta_contabil_codigo])));
      setRegras(rg);
      setPassagem(new Set(pass));
      setHistoricos(hist);
      setExclusoes(excl);
    } catch (err) {
      setErroTunel(err.message);
      setGerenciais([]);
    } finally { setCarregandoRede(false); }
  }, [redeId, planoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const contabilPorCodigo = useMemo(
    () => Object.fromEntries(contabeis.map(c => [c.codigo, c])), [contabeis]);

  const definirMapa = async (contaGerencial, contaContabilCodigo) => {
    setMapa(prev => ({ ...prev, [contaGerencial]: contaContabilCodigo }));
    try { await deParaService.salvarMapa(redeId, planoId, contaGerencial, contaContabilCodigo); }
    catch (err) { showToast?.('error', err.message); carregar(); }
  };

  const alternarPassagem = async (contaGerencial) => {
    const marcar = !passagem.has(contaGerencial);
    setPassagem(prev => { const n = new Set(prev); marcar ? n.add(contaGerencial) : n.delete(contaGerencial); return n; });
    try { await deParaService.marcarPassagem(redeId, contaGerencial, marcar); }
    catch (err) { showToast?.('error', err.message); carregar(); }
  };

  return (
    <div className="space-y-4">
      {/* Seletores rede + plano */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900 p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Rede (cliente)</label>
          <div className="relative">
            <select value={redeId} onChange={e => setRedeId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 pr-8 text-sm dark:text-gray-100 appearance-none focus:border-blue-400 focus:outline-none">
              <option value="">Selecione a rede…</option>
              {redes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
            <ChevronDown className="h-4 w-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
        <div className="flex-1">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Plano contábil</label>
          <div className="relative">
            <select value={planoId} onChange={e => setPlanoId(e.target.value)} disabled={!redeId || planos.length === 0}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 pr-8 text-sm dark:text-gray-100 appearance-none disabled:opacity-50 focus:border-blue-400 focus:outline-none">
              <option value="">{redeId && planos.length === 0 ? 'Nenhum plano atribuído a esta rede' : 'Selecione o plano…'}</option>
              {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <ChevronDown className="h-4 w-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          {redeId && planos.length === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Atribua um plano a esta rede na aba "Plano Contábil".</p>
          )}
        </div>
      </div>

      {!redeId || !planoId ? (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center text-center gap-2 py-16 px-6">
          <GitBranch className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Selecione a rede e o plano para mapear as contas.</p>
        </div>
      ) : carregandoRede ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-sm">Buscando contas gerenciais do cliente…</span>
        </div>
      ) : erroTunel ? (
        <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50/60 dark:bg-red-500/10 p-6 text-center">
          <AlertCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Não foi possível carregar as contas do cliente</p>
          <p className="text-[12.5px] text-red-700 dark:text-red-400 mt-1 max-w-md mx-auto">{erroTunel}</p>
          <button onClick={carregar} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-red-700">Tentar de novo</button>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900 overflow-hidden">
          {/* sub-abas */}
          <div className="flex items-center gap-1 px-3 border-b border-gray-100 dark:border-white/10">
            {[
              { key: 'mapa', label: 'Mapa direto', icon: ListChecks },
              { key: 'passagem', label: `Contas de passagem${passagem.size ? ` (${passagem.size})` : ''}`, icon: Network },
              { key: 'regras', label: `Regras${regras.length ? ` (${regras.length})` : ''}`, icon: GitBranch },
              { key: 'historicos', label: `Históricos${historicos.length ? ` (${historicos.length})` : ''}`, icon: Type },
              { key: 'exclusoes', label: `Exclusões${exclusoes.length ? ` (${exclusoes.length})` : ''}`, icon: Ban },
            ].map(s => {
              const Icon = s.icon; const ativo = sub === s.key;
              return (
                <button key={s.key} onClick={() => setSub(s.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors ${
                    ativo ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}>
                  <Icon className="h-4 w-4" /> {s.label}
                </button>
              );
            })}
          </div>

          {sub === 'mapa' && (
            <MapaDireto gerenciais={gerenciais} contabeis={contabeis} contabilPorCodigo={contabilPorCodigo}
              mapa={mapa} passagem={passagem} onDefinir={definirMapa} />
          )}
          {sub === 'passagem' && (
            <Passagem gerenciais={gerenciais} passagem={passagem} onAlternar={alternarPassagem} />
          )}
          {sub === 'regras' && (
            <Regras redeId={redeId} planoId={planoId} gerenciais={gerenciais} contabeis={contabeis}
              contabilPorCodigo={contabilPorCodigo} regras={regras} passagem={passagem} onMudou={carregar} showToast={showToast} />
          )}
          {sub === 'historicos' && (
            <Historicos redeId={redeId} planoId={planoId} gerenciais={gerenciais}
              historicos={historicos} passagem={passagem} onMudou={carregar} showToast={showToast} />
          )}
          {sub === 'exclusoes' && (
            <Exclusoes redeId={redeId} planoId={planoId} gerenciais={gerenciais}
              exclusoes={exclusoes} onMudou={carregar} showToast={showToast} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Mapa direto ─────────────────────────────────────────────
function MapaDireto({ gerenciais, contabeis, contabilPorCodigo, mapa, passagem, onDefinir }) {
  const [busca, setBusca] = useState('');
  const [soLancaveis, setSoLancaveis] = useState(true);
  const [soNaoMapeadas, setSoNaoMapeadas] = useState(false);

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    return gerenciais.filter(g => {
      if (soLancaveis && !g.lancar) return false;
      if (soNaoMapeadas && mapa[g.codigo]) return false;
      if (!q) return true;
      return [g.codigo, g.nome].some(v => (v || '').toLowerCase().includes(q));
    });
  }, [gerenciais, mapa, busca, soLancaveis, soNaoMapeadas]);

  const totalMapeadas = useMemo(
    () => gerenciais.filter(g => (!soLancaveis || g.lancar) && mapa[g.codigo]).length, [gerenciais, mapa, soLancaveis]);
  const totalAlvo = useMemo(
    () => gerenciais.filter(g => !soLancaveis || g.lancar).length, [gerenciais, soLancaveis]);

  return (
    <div className="flex flex-col">
      <div className="px-5 py-2.5 border-b border-gray-100 dark:border-white/10 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Search className="h-4 w-4 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar conta gerencial…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-gray-100" />
        </div>
        <span className="text-[11.5px] text-gray-400">{totalMapeadas}/{totalAlvo} mapeadas</span>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={soLancaveis} onChange={e => setSoLancaveis(e.target.checked)} className="rounded" /> Só lançáveis
        </label>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={soNaoMapeadas} onChange={e => setSoNaoMapeadas(e.target.checked)} className="rounded" /> Só não mapeadas
        </label>
      </div>

      <div className="overflow-y-auto max-h-[56vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-100 dark:bg-slate-800 z-10">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-5 py-2 w-[40%]">Conta gerencial</th>
              <th className="px-3 py-2">Conta contábil (destino)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-white/5">
            {lista.map(g => (
              <tr key={g.codigo} className="hover:bg-gray-50/60 dark:hover:bg-white/5">
                <td className="px-5 py-1.5 align-top">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[12px] text-gray-600 dark:text-gray-400">{g.codigo}</span>
                    <span className="text-gray-800 dark:text-gray-200">{g.nome}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  {passagem.has(g.codigo) ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 px-2.5 py-1.5 text-[12px] font-medium">
                      <Network className="h-3.5 w-3.5" /> Conta de passagem — resolve por regra
                    </span>
                  ) : (
                    <ContaPicker contas={contabeis} valor={mapa[g.codigo] || ''} permitirLimpar
                      valorLabel={contabilPorCodigo[mapa[g.codigo]] ? `${mapa[g.codigo]} · ${contabilPorCodigo[mapa[g.codigo]].descricao}` : ''}
                      placeholder="Definir conta contábil…"
                      onSelect={cod => onDefinir(g.codigo, cod)} />
                  )}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr><td colSpan={2} className="px-5 py-8 text-center text-[13px] text-gray-400">Nenhuma conta gerencial encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Contas de passagem ──────────────────────────────────────
function Passagem({ gerenciais, passagem, onAlternar }) {
  const [busca, setBusca] = useState('');
  const [soMarcadas, setSoMarcadas] = useState(false);
  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    return gerenciais.filter(g => {
      if (soMarcadas && !passagem.has(g.codigo)) return false;
      if (!q) return true;
      return [g.codigo, g.nome].some(v => (v || '').toLowerCase().includes(q));
    });
  }, [gerenciais, passagem, busca, soMarcadas]);

  return (
    <div className="flex flex-col">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-white/10">
        <p className="text-[12.5px] text-gray-500 dark:text-gray-400">
          Marque as contas cuja conta contábil <strong>depende da despesa de origem</strong> (ex.: <span className="font-mono">2.1.1</span> Contas a Pagar).
          Elas não usam o mapa direto — resolvem por regra, rastreando a provisão no pagamento.
        </p>
      </div>
      <div className="px-5 py-2.5 border-b border-gray-100 dark:border-white/10 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Search className="h-4 w-4 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar conta gerencial…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-gray-100" />
        </div>
        <span className="text-[11.5px] text-gray-400">{passagem.size} marcada(s)</span>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={soMarcadas} onChange={e => setSoMarcadas(e.target.checked)} className="rounded" /> Só marcadas
        </label>
      </div>
      <div className="overflow-y-auto max-h-[56vh] divide-y divide-gray-50 dark:divide-white/5">
        {lista.map(g => {
          const on = passagem.has(g.codigo);
          return (
            <label key={g.codigo} className="flex items-center gap-3 px-5 py-2 hover:bg-gray-50/60 dark:hover:bg-white/5 cursor-pointer">
              <input type="checkbox" checked={on} onChange={() => onAlternar(g.codigo)} className="rounded" />
              <span className="font-mono text-[12px] text-gray-600 dark:text-gray-400">{g.codigo}</span>
              <span className="text-[13px] text-gray-800 dark:text-gray-200">{g.nome}</span>
              {on && <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 dark:text-violet-300"><Network className="h-3 w-3" /> passagem</span>}
            </label>
          );
        })}
        {lista.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-gray-400">Nenhuma conta encontrada.</p>}
      </div>
    </div>
  );
}

// ─── Regras condicionais ─────────────────────────────────────
function Regras({ redeId, planoId, gerenciais, contabeis, contabilPorCodigo, regras, passagem, onMudou, showToast }) {
  const gerPorCodigo = useMemo(() => Object.fromEntries(gerenciais.map(g => [g.codigo, g])), [gerenciais]);
  const passagemContas = useMemo(() => gerenciais.filter(g => passagem.has(g.codigo)), [gerenciais, passagem]);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const novaRegra = (tipo) => setForm(tipo === 'pagamento'
    ? { tipo_lancamento: 'pagamento', cond_conta_debitar: '', cond_despesa_origem: '', lado: 'debito', conta_contabil_codigo: '', descricao: '' }
    : { tipo_lancamento: 'provisao', cond_conta_debitar: '', cond_conta_creditar: '', lado: 'credito', conta_contabil_codigo: '', descricao: '' });

  const salvar = async () => {
    if (form.tipo_lancamento === 'pagamento') {
      if (!form.cond_conta_debitar) { showToast?.('warning', 'Escolha a conta de passagem.'); return; }
      // despesa de origem é opcional: sem ela, a regra é a PADRÃO da passagem.
    } else if (!form.cond_conta_debitar && !form.cond_conta_creditar) {
      showToast?.('warning', 'Defina ao menos uma condição (débito ou crédito).'); return;
    }
    if (!form.conta_contabil_codigo) { showToast?.('warning', 'Escolha a conta contábil de destino.'); return; }
    const editando = !!form.id;
    try {
      setSalvando(true);
      const campos = {
        tipo_lancamento: form.tipo_lancamento,
        cond_conta_debitar: form.cond_conta_debitar || null,
        cond_conta_creditar: form.cond_conta_creditar || null,
        cond_despesa_origem: form.cond_despesa_origem || null,
        lado: form.lado,
        conta_contabil_codigo: form.conta_contabil_codigo,
        descricao: form.descricao?.trim() || null,
      };
      if (editando) await deParaService.atualizarRegra(form.id, campos);
      else await deParaService.criarRegra(redeId, planoId, form);
      setForm(null);
      await onMudou();
      showToast?.('success', editando ? 'Regra atualizada' : 'Regra criada');
    } catch (err) { showToast?.('error', err.message); }
    finally { setSalvando(false); }
  };

  const editar = (r) => setForm({
    id: r.id, tipo_lancamento: r.tipo_lancamento,
    cond_conta_debitar: r.cond_conta_debitar || '',
    cond_conta_creditar: r.cond_conta_creditar || '',
    cond_despesa_origem: r.cond_despesa_origem || '',
    lado: r.lado, conta_contabil_codigo: r.conta_contabil_codigo,
    descricao: r.descricao || '',
  });

  const excluir = async (id) => {
    try { await deParaService.excluirRegra(id); await onMudou(); showToast?.('success', 'Regra removida'); }
    catch (err) { showToast?.('error', err.message); }
  };

  const rotuloGer = (cod) => cod ? `${cod} · ${gerPorCodigo[cod]?.nome || '—'}` : 'qualquer';
  const rotuloCont = (cod) => cod ? `${cod} · ${contabilPorCodigo[cod]?.descricao || '—'}` : '—';
  const LADO = { debito: 'Débito', credito: 'Crédito', ambos: 'Ambos' };
  const provisao = form?.tipo_lancamento === 'provisao';
  // "padrão" = sem a condição específica (pagamento: sem origem; provisão: só 1 conta)
  const ehPadrao = !!form && (provisao
    ? !(form.cond_conta_debitar && form.cond_conta_creditar)
    : !form.cond_despesa_origem);

  const exportarXlsx = () => {
    const aoa = [
      ['Tipo', 'Condição débito', 'Condição crédito', 'Despesa de origem', 'Lado contábil', 'Conta contábil', 'Descrição'],
      ...regras.map(r => [
        r.tipo_lancamento === 'pagamento' ? 'Pagamento' : 'Provisão',
        r.cond_conta_debitar ? rotuloGer(r.cond_conta_debitar) : '',
        r.cond_conta_creditar ? rotuloGer(r.cond_conta_creditar) : '',
        r.cond_despesa_origem ? rotuloGer(r.cond_despesa_origem) : '',
        LADO[r.lado] || r.lado,
        rotuloCont(r.conta_contabil_codigo),
        r.descricao || '',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 11 }, { wch: 34 }, { wch: 34 }, { wch: 28 }, { wch: 12 }, { wch: 36 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Regras');
    XLSX.writeFile(wb, 'regras-de-para.xlsx');
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-[12.5px] text-gray-500 dark:text-gray-400">
          <strong>Provisão</strong>: condiciona pelas contas da própria linha. <strong>Pagamento</strong>: condiciona pela conta de passagem + a despesa de origem (rastreando a provisão).
          <br /><span className="text-gray-400">💡 Regra <strong>padrão</strong>: deixe a condição específica em branco (despesa de origem no pagamento; ou só uma das contas na provisão). A regra com mais condições sempre vence a padrão.</span>
        </p>
        {!form && (
          <div className="flex gap-2 flex-shrink-0">
            {regras.length > 0 && (
              <button onClick={exportarXlsx} title="Exportar regras em .xlsx"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2 text-[12.5px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5">
                <Download className="h-4 w-4" /> Exportar
              </button>
            )}
            <button onClick={() => novaRegra('provisao')} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Provisão
            </button>
            <button onClick={() => novaRegra('pagamento')} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-violet-700">
              <Plus className="h-4 w-4" /> Pagamento
            </button>
          </div>
        )}
      </div>

      {form && (
        <div className={`rounded-xl border p-4 mb-4 space-y-3 ${provisao ? 'border-blue-200 dark:border-blue-500/30 bg-blue-50/40 dark:bg-blue-500/5' : 'border-violet-200 dark:border-violet-500/30 bg-violet-50/40 dark:bg-violet-500/5'}`}>
          <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
            {form.id ? 'Editar regra' : 'Regra'} de <span className={provisao ? 'text-blue-700 dark:text-blue-300' : 'text-violet-700 dark:text-violet-300'}>{provisao ? 'Provisão' : 'Pagamento'}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ehPadrao ? 'bg-gray-200 dark:bg-white/15 text-gray-600 dark:text-gray-300' : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>
              {ehPadrao ? '★ REGRA PADRÃO' : 'específica'}
            </span>
          </p>

          {provisao ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">SE conta a DÉBITO (opcional)</label>
                <ContaPicker contas={gerenciais} campoLabel="nome" valor={form.cond_conta_debitar}
                  valorLabel={form.cond_conta_debitar ? rotuloGer(form.cond_conta_debitar) : ''} placeholder="qualquer" permitirLimpar
                  onSelect={cod => setForm(f => ({ ...f, cond_conta_debitar: cod }))} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">SE conta a CRÉDITO (opcional)</label>
                <ContaPicker contas={gerenciais} campoLabel="nome" valor={form.cond_conta_creditar}
                  valorLabel={form.cond_conta_creditar ? rotuloGer(form.cond_conta_creditar) : ''} placeholder="qualquer" permitirLimpar
                  onSelect={cod => setForm(f => ({ ...f, cond_conta_creditar: cod }))} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">SE conta de PASSAGEM (débito do pagamento)</label>
                {passagemContas.length === 0 ? (
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 py-2">Marque contas na aba "Contas de passagem" primeiro.</p>
                ) : (
                  <ContaPicker contas={passagemContas} campoLabel="nome" valor={form.cond_conta_debitar}
                    valorLabel={form.cond_conta_debitar ? rotuloGer(form.cond_conta_debitar) : ''} placeholder="Escolher conta de passagem…"
                    onSelect={cod => setForm(f => ({ ...f, cond_conta_debitar: cod }))} />
                )}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">E a DESPESA DE ORIGEM <span className="text-gray-400 font-normal">(vazio = padrão da passagem)</span></label>
                <ContaPicker contas={gerenciais} campoLabel="nome" valor={form.cond_despesa_origem} permitirLimpar
                  valorLabel={form.cond_despesa_origem ? rotuloGer(form.cond_despesa_origem) : ''} placeholder="qualquer (padrão)"
                  onSelect={cod => setForm(f => ({ ...f, cond_despesa_origem: cod }))} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            {provisao ? (
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">ENTÃO no lado contábil</label>
                <div className="relative">
                  <select value={form.lado} onChange={e => setForm(f => ({ ...f, lado: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 pr-8 text-sm dark:text-gray-100 appearance-none focus:border-blue-400 focus:outline-none">
                    <option value="debito">Débito</option>
                    <option value="credito">Crédito</option>
                    <option value="ambos">Ambos</option>
                  </select>
                  <ChevronDown className="h-4 w-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">ENTÃO no débito contábil</label>
                <div className="h-10 flex items-center px-3 rounded-lg bg-gray-100 dark:bg-white/5 text-[13px] text-gray-500">Débito</div>
              </div>
            )}
            <div>
              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">= conta contábil</label>
              <ContaPicker contas={contabeis} valor={form.conta_contabil_codigo}
                valorLabel={form.conta_contabil_codigo ? rotuloCont(form.conta_contabil_codigo) : ''} placeholder="Escolher conta contábil…"
                onSelect={cod => setForm(f => ({ ...f, conta_contabil_codigo: cod }))} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Descrição (opcional)</label>
            <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Ex.: FGTS a recolher"
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 text-sm dark:text-gray-100 focus:border-blue-400 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">Cancelar</button>
            <button onClick={salvar} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {form.id ? 'Salvar alterações' : 'Salvar regra'}
            </button>
          </div>
        </div>
      )}

      {regras.length === 0 && !form ? (
        <p className="text-center text-[13px] text-gray-400 py-10">Nenhuma regra. O mapa direto será usado para todas as contas.</p>
      ) : (
        <div className="space-y-2">
          {regras.map(r => {
            const pag = r.tipo_lancamento === 'pagamento';
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 dark:border-white/10 p-3 flex items-center gap-3">
                <span className={`flex-shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${pag ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'}`}>
                  {pag ? 'PAGAMENTO' : 'PROVISÃO'}
                </span>
                <div className="flex-1 min-w-0 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-gray-400">SE</span>
                    {pag ? (
                      <>
                        <span>passagem=<span className="font-medium text-gray-800 dark:text-gray-200">{rotuloGer(r.cond_conta_debitar)}</span></span>
                        {r.cond_despesa_origem
                          ? <><span className="text-gray-400">e origem=</span><span className="font-medium text-gray-800 dark:text-gray-200">{rotuloGer(r.cond_despesa_origem)}</span></>
                          : <span className="rounded bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 text-[10px] font-medium">padrão</span>}
                      </>
                    ) : (
                      <>
                        {r.cond_conta_debitar && <span>déb=<span className="font-medium text-gray-800 dark:text-gray-200">{rotuloGer(r.cond_conta_debitar)}</span></span>}
                        {r.cond_conta_debitar && r.cond_conta_creditar && <span className="text-gray-400">e</span>}
                        {r.cond_conta_creditar && <span>créd=<span className="font-medium text-gray-800 dark:text-gray-200">{rotuloGer(r.cond_conta_creditar)}</span></span>}
                      </>
                    )}
                    <span className="text-gray-400">→</span>
                    <span className="inline-flex items-center rounded bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 text-[11px] font-medium">{LADO[r.lado]}</span>
                    <span className="text-gray-400">=</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{rotuloCont(r.conta_contabil_codigo)}</span>
                  </div>
                  {r.descricao && <p className="text-[11px] text-gray-400 mt-0.5">{r.descricao}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => editar(r)} className="rounded-lg p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => excluir(r.id)} className="rounded-lg p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Históricos padrão (templates de narração) ───────────────
function Historicos({ redeId, planoId, gerenciais, historicos, passagem, onMudou, showToast }) {
  const gerPorCodigo = useMemo(() => Object.fromEntries(gerenciais.map(g => [g.codigo, g])), [gerenciais]);
  const passagemContas = useMemo(() => gerenciais.filter(g => passagem.has(g.codigo)), [gerenciais, passagem]);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const templateRef = useRef(null);

  const nova = (tipo) => setForm(tipo === 'pagamento'
    ? { tipo_lancamento: 'pagamento', cond_conta_debitar: '', cond_despesa_origem: '', template: '', descricao: '' }
    : { tipo_lancamento: 'provisao', cond_conta_debitar: '', cond_conta_creditar: '', template: '', descricao: '' });

  const inserirToken = (tk) => {
    const el = templateRef.current;
    setForm(f => {
      const t = f.template || '';
      if (!el) return { ...f, template: t + tk };
      const start = el.selectionStart ?? t.length;
      const end = el.selectionEnd ?? t.length;
      const novo = t.slice(0, start) + tk + t.slice(end);
      requestAnimationFrame(() => { el.focus(); const p = start + tk.length; el.setSelectionRange(p, p); });
      return { ...f, template: novo };
    });
  };

  const salvar = async () => {
    // condições são opcionais (sem condição = histórico padrão do tipo)
    if (!form.template.trim()) { showToast?.('warning', 'Escreva o template do histórico.'); return; }
    const editando = !!form.id;
    try {
      setSalvando(true);
      if (editando) {
        await deParaService.atualizarHistorico(form.id, {
          tipo_lancamento: form.tipo_lancamento,
          cond_conta_debitar: form.cond_conta_debitar || null,
          cond_conta_creditar: form.cond_conta_creditar || null,
          cond_despesa_origem: form.cond_despesa_origem || null,
          template: form.template.trim(),
          descricao: form.descricao?.trim() || null,
        });
      } else {
        await deParaService.criarHistorico(redeId, planoId, form);
      }
      setForm(null); await onMudou();
      showToast?.('success', editando ? 'Histórico atualizado' : 'Histórico criado');
    } catch (err) { showToast?.('error', err.message); }
    finally { setSalvando(false); }
  };

  const editar = (h) => setForm({
    id: h.id, tipo_lancamento: h.tipo_lancamento,
    cond_conta_debitar: h.cond_conta_debitar || '',
    cond_conta_creditar: h.cond_conta_creditar || '',
    cond_despesa_origem: h.cond_despesa_origem || '',
    template: h.template || '', descricao: h.descricao || '',
  });

  const excluir = async (id) => {
    try { await deParaService.excluirHistorico(id); await onMudou(); showToast?.('success', 'Histórico removido'); }
    catch (err) { showToast?.('error', err.message); }
  };

  const rotuloGer = (cod) => cod ? `${cod} · ${gerPorCodigo[cod]?.nome || '—'}` : 'qualquer';
  const provisao = form?.tipo_lancamento === 'provisao';

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-[12.5px] text-gray-500 dark:text-gray-400">
          Template do histórico com <strong>tokens</strong>. Ex.: <code className="text-[11px] bg-gray-100 dark:bg-white/10 rounded px-1">PG DOC {'{documento}'} {'{pessoa}'}</code>.
          Uma regra sem condição vira o padrão do tipo.
        </p>
        {!form && (
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => nova('provisao')} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Provisão</button>
            <button onClick={() => nova('pagamento')} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-violet-700"><Plus className="h-4 w-4" /> Pagamento</button>
          </div>
        )}
      </div>

      {form && (
        <div className={`rounded-xl border p-4 mb-4 space-y-3 ${provisao ? 'border-blue-200 dark:border-blue-500/30 bg-blue-50/40 dark:bg-blue-500/5' : 'border-violet-200 dark:border-violet-500/30 bg-violet-50/40 dark:bg-violet-500/5'}`}>
          <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-200">
            {form.id ? 'Editar histórico' : 'Histórico'} de <span className={provisao ? 'text-blue-700 dark:text-blue-300' : 'text-violet-700 dark:text-violet-300'}>{provisao ? 'Provisão' : 'Pagamento'}</span>
          </p>

          {provisao ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">SE conta a DÉBITO (opcional)</label>
                <ContaPicker contas={gerenciais} campoLabel="nome" valor={form.cond_conta_debitar}
                  valorLabel={form.cond_conta_debitar ? rotuloGer(form.cond_conta_debitar) : ''} placeholder="qualquer" permitirLimpar
                  onSelect={cod => setForm(f => ({ ...f, cond_conta_debitar: cod }))} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">SE conta a CRÉDITO (opcional)</label>
                <ContaPicker contas={gerenciais} campoLabel="nome" valor={form.cond_conta_creditar}
                  valorLabel={form.cond_conta_creditar ? rotuloGer(form.cond_conta_creditar) : ''} placeholder="qualquer" permitirLimpar
                  onSelect={cod => setForm(f => ({ ...f, cond_conta_creditar: cod }))} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">SE conta de PASSAGEM (opcional)</label>
                {passagemContas.length === 0 ? (
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 py-2">Marque contas na aba "Contas de passagem".</p>
                ) : (
                  <ContaPicker contas={passagemContas} campoLabel="nome" valor={form.cond_conta_debitar}
                    valorLabel={form.cond_conta_debitar ? rotuloGer(form.cond_conta_debitar) : ''} placeholder="qualquer" permitirLimpar
                    onSelect={cod => setForm(f => ({ ...f, cond_conta_debitar: cod }))} />
                )}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">E a DESPESA DE ORIGEM (opcional)</label>
                <ContaPicker contas={gerenciais} campoLabel="nome" valor={form.cond_despesa_origem}
                  valorLabel={form.cond_despesa_origem ? rotuloGer(form.cond_despesa_origem) : ''} placeholder="Ex.: 1.4…" permitirLimpar
                  onSelect={cod => setForm(f => ({ ...f, cond_despesa_origem: cod }))} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Template do histórico</label>
            <input ref={templateRef} value={form.template} onChange={e => setForm(f => ({ ...f, template: e.target.value }))}
              placeholder="Ex.: PG DOC {documento} {pessoa}"
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 text-sm font-mono dark:text-gray-100 focus:border-blue-400 focus:outline-none" />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {deParaService.HISTORICO_TOKENS.map(t => (
                <button key={t.token} type="button" onClick={() => inserirToken(t.token)}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-white/10 px-2 py-1 text-[11px] font-mono text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5">
                  {t.token}<span className="text-gray-400 font-sans">· {t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Descrição (opcional)</label>
            <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 text-sm dark:text-gray-100 focus:border-blue-400 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">Cancelar</button>
            <button onClick={salvar} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {form.id ? 'Salvar alterações' : 'Salvar histórico'}
            </button>
          </div>
        </div>
      )}

      {historicos.length === 0 && !form ? (
        <p className="text-center text-[13px] text-gray-400 py-10">Nenhum histórico padrão. Defina os templates de narração.</p>
      ) : (
        <div className="space-y-2">
          {historicos.map(h => {
            const pag = h.tipo_lancamento === 'pagamento';
            return (
              <div key={h.id} className="rounded-xl border border-gray-200 dark:border-white/10 p-3 flex items-center gap-3">
                <span className={`flex-shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${pag ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'}`}>
                  {pag ? 'PAGAMENTO' : 'PROVISÃO'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[13px] text-gray-900 dark:text-gray-100 truncate">{h.template}</p>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400 mt-0.5">
                    {(h.cond_conta_debitar || h.cond_conta_creditar || h.cond_despesa_origem) ? (
                      <>
                        <span>SE</span>
                        {pag
                          ? <>{h.cond_conta_debitar && <span>passagem={rotuloGer(h.cond_conta_debitar)}</span>}{h.cond_despesa_origem && <span>· origem={rotuloGer(h.cond_despesa_origem)}</span>}</>
                          : <>{h.cond_conta_debitar && <span>déb={rotuloGer(h.cond_conta_debitar)}</span>}{h.cond_conta_creditar && <span>· créd={rotuloGer(h.cond_conta_creditar)}</span>}</>}
                      </>
                    ) : <span className="italic">padrão ({pag ? 'todos pagamentos' : 'todas provisões'})</span>}
                    {h.descricao && <span>· {h.descricao}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => editar(h)} className="rounded-lg p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => excluir(h.id)} className="rounded-lg p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Exclusões (não exportar) ────────────────────────────────
function Exclusoes({ redeId, planoId, gerenciais, exclusoes, onMudou, showToast }) {
  const gerPorCodigo = useMemo(() => Object.fromEntries(gerenciais.map(g => [g.codigo, g])), [gerenciais]);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const nova = () => setForm({ cond_conta_debitar: '', cond_conta_creditar: '', descricao: '' });
  const editar = (e) => setForm({ id: e.id, cond_conta_debitar: e.cond_conta_debitar || '', cond_conta_creditar: e.cond_conta_creditar || '', descricao: e.descricao || '' });

  const salvar = async () => {
    if (!form.cond_conta_debitar && !form.cond_conta_creditar) { showToast?.('warning', 'Defina ao menos uma condição (débito ou crédito).'); return; }
    const editando = !!form.id;
    try {
      setSalvando(true);
      const campos = { cond_conta_debitar: form.cond_conta_debitar || null, cond_conta_creditar: form.cond_conta_creditar || null, descricao: form.descricao?.trim() || null };
      if (editando) await deParaService.atualizarExclusao(form.id, campos);
      else await deParaService.criarExclusao(redeId, planoId, form);
      setForm(null); await onMudou();
      showToast?.('success', editando ? 'Exclusão atualizada' : 'Exclusão criada');
    } catch (err) { showToast?.('error', err.message); }
    finally { setSalvando(false); }
  };

  const remover = async (id) => {
    try { await deParaService.excluirExclusao(id); await onMudou(); showToast?.('success', 'Exclusão removida'); }
    catch (err) { showToast?.('error', err.message); }
  };

  const rotuloGer = (cod) => cod ? `${cod} · ${gerPorCodigo[cod]?.nome || '—'}` : 'qualquer';

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-[12.5px] text-gray-500 dark:text-gray-400">
          Lançamentos que casam uma condição <strong>não saem no arquivo</strong> (a contabilidade importa por outro módulo — fiscal, DP). Ex.: débito Estoque + crédito Contas a Pagar.
        </p>
        {!form && (
          <button onClick={nova} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-red-700 flex-shrink-0">
            <Ban className="h-4 w-4" /> Nova exclusão
          </button>
        )}
      </div>

      {form && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50/40 dark:bg-red-500/5 p-4 mb-4 space-y-3">
          <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-200">{form.id ? 'Editar exclusão' : 'Nova exclusão'} — não exportar quando…</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Conta a DÉBITO (opcional)</label>
              <ContaPicker contas={gerenciais} campoLabel="nome" valor={form.cond_conta_debitar}
                valorLabel={form.cond_conta_debitar ? rotuloGer(form.cond_conta_debitar) : ''} placeholder="qualquer" permitirLimpar
                onSelect={cod => setForm(f => ({ ...f, cond_conta_debitar: cod }))} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Conta a CRÉDITO (opcional)</label>
              <ContaPicker contas={gerenciais} campoLabel="nome" valor={form.cond_conta_creditar}
                valorLabel={form.cond_conta_creditar ? rotuloGer(form.cond_conta_creditar) : ''} placeholder="qualquer" permitirLimpar
                onSelect={cod => setForm(f => ({ ...f, cond_conta_creditar: cod }))} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Motivo/descrição (opcional)</label>
            <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Ex.: Importado pelo módulo fiscal"
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 text-sm dark:text-gray-100 focus:border-blue-400 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">Cancelar</button>
            <button onClick={salvar} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {form.id ? 'Salvar alterações' : 'Salvar exclusão'}
            </button>
          </div>
        </div>
      )}

      {exclusoes.length === 0 && !form ? (
        <p className="text-center text-[13px] text-gray-400 py-10">Nenhuma exclusão. Todos os lançamentos serão exportados.</p>
      ) : (
        <div className="space-y-2">
          {exclusoes.map(e => (
            <div key={e.id} className="rounded-xl border border-gray-200 dark:border-white/10 p-3 flex items-center gap-3">
              <Ban className="h-4 w-4 text-red-500 flex-shrink-0" />
              <div className="flex-1 min-w-0 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-gray-400">Não exportar SE</span>
                  {e.cond_conta_debitar && <span>déb=<span className="font-medium text-gray-800 dark:text-gray-200">{rotuloGer(e.cond_conta_debitar)}</span></span>}
                  {e.cond_conta_debitar && e.cond_conta_creditar && <span className="text-gray-400">e</span>}
                  {e.cond_conta_creditar && <span>créd=<span className="font-medium text-gray-800 dark:text-gray-200">{rotuloGer(e.cond_conta_creditar)}</span></span>}
                </div>
                {e.descricao && <p className="text-[11px] text-gray-400 mt-0.5">{e.descricao}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => editar(e)} className="rounded-lg p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remover(e.id)} className="rounded-lg p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Picker searchable de conta (gerencial ou contábil) ──────
// contas: [{codigo, descricao|nome}]. campoLabel = 'descricao' (default) ou 'nome'.
function ContaPicker({ contas, valor, valorLabel, placeholder, onSelect, campoLabel = 'descricao', permitirLimpar = false }) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const filtradas = useMemo(() => {
    const s = q.toLowerCase();
    const base = s ? contas.filter(c => [c.codigo, c[campoLabel]].some(v => (v || '').toLowerCase().includes(s))) : contas;
    return base.slice(0, 100); // limita render
  }, [contas, q, campoLabel]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setAberto(o => !o); setQ(''); }}
        className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 h-9 text-left text-[12.5px] transition-colors ${
          valor ? 'border-gray-200 dark:border-white/10 text-gray-800 dark:text-gray-200' : 'border-dashed border-gray-300 dark:border-white/15 text-gray-400'
        } bg-white dark:bg-white/[0.03] hover:border-blue-300`}>
        <span className="truncate">{valor ? (valorLabel || valor) : placeholder}</span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {valor && permitirLimpar && (
            <span onClick={(e) => { e.stopPropagation(); onSelect(''); }} className="text-gray-300 hover:text-gray-500"><X className="h-3.5 w-3.5" /></span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </span>
      </button>

      {aberto && (
        <div className="absolute z-30 mt-1 w-full min-w-[260px] rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-white/10">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar código ou descrição…"
              className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-gray-400 dark:text-gray-100" />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtradas.map(c => {
              const sel = c.codigo === valor;
              return (
                <button key={c.codigo} type="button"
                  onClick={() => { onSelect(c.codigo); setAberto(false); }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-white/5 ${sel ? 'bg-blue-50/60 dark:bg-blue-500/10' : ''}`}>
                  <span className="font-mono text-[11.5px] text-gray-500 dark:text-gray-400 flex-shrink-0">{c.codigo}</span>
                  <span className="text-[12.5px] text-gray-800 dark:text-gray-200 truncate">{c[campoLabel]}</span>
                  {sel && <Check className="h-3.5 w-3.5 text-blue-600 ml-auto flex-shrink-0" />}
                </button>
              );
            })}
            {filtradas.length === 0 && <p className="px-3 py-4 text-center text-[12px] text-gray-400">Nada encontrado.</p>}
            {contas.length > 100 && !q && <p className="px-3 py-2 text-center text-[11px] text-gray-400">Digite para buscar entre {contas.length} contas…</p>}
          </div>
        </div>
      )}
    </div>
  );
}
