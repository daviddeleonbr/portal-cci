// Aba "Plano Contábil" da Exportação Contábil.
// Cadastra vários planos de contas contábeis (importados de planilha) e define
// quais redes usam cada um. Base do de/para gerencial → contábil.
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus, FileSpreadsheet, Upload, Trash2, Search, Loader2, Network,
  Check, Pencil, FolderTree, AlertCircle, Download, FileUp, CheckCircle2, ChevronRight,
} from 'lucide-react';
import Modal from '../ui/Modal';
import * as planoService from '../../services/planoContabilService';
import * as autosystemService from '../../services/autosystemService';
import { parsePlanoContabilFile, montarArvore, baixarModeloPlano } from '../../utils/parsePlanoContabil';

export default function AbaPlanoContabil({ showToast }) {
  const [planos, setPlanos] = useState([]);
  const [loadingPlanos, setLoadingPlanos] = useState(true);
  const [selId, setSelId] = useState(null);

  const carregarPlanos = useCallback(async (manterSel) => {
    try {
      setLoadingPlanos(true);
      const lista = await planoService.listarPlanos();
      setPlanos(lista);
      setSelId(prev => {
        const alvo = manterSel ?? prev;
        return lista.some(p => p.id === alvo) ? alvo : (lista[0]?.id ?? null);
      });
    } catch (err) {
      showToast?.('error', 'Erro ao carregar planos: ' + err.message);
    } finally {
      setLoadingPlanos(false);
    }
  }, [showToast]);

  useEffect(() => { carregarPlanos(); }, [carregarPlanos]);

  const planoSel = planos.find(p => p.id === selId) || null;

  // ─── Novo plano ────────────────────────────────────────────
  const [modalNovo, setModalNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState('');
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const criarPlano = async () => {
    if (!nomeNovo.trim()) return;
    try {
      setSalvandoNovo(true);
      const novo = await planoService.criarPlano({ nome: nomeNovo });
      setModalNovo(false); setNomeNovo('');
      await carregarPlanos(novo.id);
      showToast?.('success', 'Plano criado');
    } catch (err) {
      showToast?.('error', err.message);
    } finally { setSalvandoNovo(false); }
  };

  const excluirPlano = async (plano) => {
    if (!window.confirm(`Excluir o plano "${plano.nome}" e todas as suas contas?`)) return;
    try {
      await planoService.excluirPlano(plano.id);
      await carregarPlanos();
      showToast?.('success', 'Plano excluído');
    } catch (err) { showToast?.('error', err.message); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
      {/* Lista de planos */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Planos</p>
          <button onClick={() => { setNomeNovo(''); setModalNovo(true); }}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Novo
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 max-h-[70vh]">
          {loadingPlanos ? (
            <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : planos.length === 0 ? (
            <p className="text-center text-[12.5px] text-gray-400 py-10 px-3">Nenhum plano ainda. Crie o primeiro.</p>
          ) : planos.map(p => {
            const ativo = p.id === selId;
            return (
              <button key={p.id} onClick={() => setSelId(p.id)}
                className={`w-full text-left rounded-xl px-3 py-2.5 mb-1 transition-colors ${
                  ativo ? 'bg-blue-50 dark:bg-blue-500/15' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                }`}>
                <p className={`text-sm font-medium truncate ${ativo ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>{p.nome}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{p.qtdContas} conta{p.qtdContas === 1 ? '' : 's'} · {p.qtdRedes} rede{p.qtdRedes === 1 ? '' : 's'}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalhe do plano selecionado */}
      {planoSel ? (
        <PlanoDetalhe key={planoSel.id} plano={planoSel} showToast={showToast}
          onExcluir={() => excluirPlano(planoSel)} onMudou={() => carregarPlanos(planoSel.id)} />
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center text-center gap-3 py-20 px-6">
          <div className="h-12 w-12 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400"><FolderTree className="h-6 w-6" /></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Crie um plano de contas contábil e importe a planilha da contabilidade.</p>
        </div>
      )}

      {/* Modal novo plano */}
      <Modal open={modalNovo} onClose={() => setModalNovo(false)} title="Novo plano contábil" size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setModalNovo(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={criarPlano} disabled={!nomeNovo.trim() || salvandoNovo}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {salvandoNovo && <Loader2 className="h-4 w-4 animate-spin" />} Criar
            </button>
          </div>
        }>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do plano</label>
        <input autoFocus value={nomeNovo} onChange={e => setNomeNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') criarPlano(); }}
          placeholder="Ex: Plano Contábil — Contabilidade Silva"
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:text-gray-100" />
      </Modal>
    </div>
  );
}

// ─── Detalhe: contas (tree) + importar + redes ────────────────
function PlanoDetalhe({ plano, showToast, onExcluir, onMudou }) {
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const fileRef = useRef(null);

  // edição do nome
  const [editandoNome, setEditandoNome] = useState(false);
  const [nome, setNome] = useState(plano.nome);
  useEffect(() => { setNome(plano.nome); }, [plano.nome]);

  const carregarContas = useCallback(async () => {
    try {
      setLoading(true);
      setContas(await planoService.listarContas(plano.id));
    } catch (err) { showToast?.('error', 'Erro ao carregar contas: ' + err.message); }
    finally { setLoading(false); }
  }, [plano.id, showToast]);
  useEffect(() => { carregarContas(); }, [carregarContas]);

  const salvarNome = async () => {
    setEditandoNome(false);
    if (nome.trim() && nome.trim() !== plano.nome) {
      try { await planoService.atualizarPlano(plano.id, { nome: nome.trim() }); onMudou?.(); }
      catch (err) { showToast?.('error', err.message); setNome(plano.nome); }
    }
  };

  // ── Importar planilha (modal: instruções → seleção → prévia → confirmar) ──
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState(null); // { linhas, header, colunas, total, fileName }
  const [importando, setImportando] = useState(false);
  const abrirImport = () => { setPreview(null); setImportOpen(true); };
  const fecharImport = () => { setImportOpen(false); setPreview(null); };
  const escolherArquivo = () => fileRef.current?.click();
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reimportar o mesmo arquivo
    if (!file) return;
    try {
      const res = await parsePlanoContabilFile(file);
      if (res.total === 0) { showToast?.('warning', 'Nenhuma conta encontrada na planilha.'); return; }
      setPreview({ ...res, fileName: file.name });
    } catch (err) { showToast?.('error', err.message); }
  };
  const confirmarImport = async () => {
    try {
      setImportando(true);
      const { entrada, inseridas, duplicados, semDados } = await planoService.importarContas(plano.id, preview.linhas, { substituir: true });
      fecharImport();
      await carregarContas();
      onMudou?.();
      const motivos = [];
      if (duplicados > 0) motivos.push(`${duplicados} com código repetido`);
      if (semDados > 0) motivos.push(`${semDados} sem código/descrição`);
      const perdidas = entrada - inseridas;
      const extra = perdidas > 0 ? ` — ${perdidas} ignorada(s): ${motivos.join(', ')}` : '';
      showToast?.(perdidas > 0 ? 'warning' : 'success', `${inseridas} de ${entrada} conta(s) importada(s)${extra}`);
    } catch (err) { showToast?.('error', err.message); }
    finally { setImportando(false); }
  };

  // ── Árvore / busca ──
  const arvore = useMemo(() => montarArvore(contas), [contas]);
  const [expandidos, setExpandidos] = useState(() => new Set());
  // Totalmente recolhida ao (re)carregar/importar.
  useEffect(() => { setExpandidos(new Set()); }, [contas]);

  const idsComFilhos = useMemo(() => {
    const ids = [];
    const walk = (nos) => nos.forEach(n => { if (n.filhos.length) { ids.push(n.id); walk(n.filhos); } });
    walk(arvore);
    return ids;
  }, [arvore]);

  const buscando = busca.trim().length > 0;
  const linhasVisiveis = useMemo(() => {
    if (buscando) {
      const q = busca.toLowerCase();
      return contas
        .filter(c => [c.codigo, c.codigo_reduzido, c.descricao].some(v => (v || '').toLowerCase().includes(q)))
        .map(c => ({ ...c, nivel: 0, filhos: [] }));
    }
    const out = [];
    const walk = (nos) => nos.forEach(n => {
      out.push(n);
      if (n.filhos.length && expandidos.has(n.id)) walk(n.filhos);
    });
    walk(arvore);
    return out;
  }, [contas, arvore, busca, buscando, expandidos]);

  const toggleNo = (id) => setExpandidos(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900 overflow-hidden flex flex-col">
      {/* Header do plano */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-white/10">
        <div className="flex-1 min-w-0">
          {editandoNome ? (
            <input autoFocus value={nome} onChange={e => setNome(e.target.value)} onBlur={salvarNome}
              onKeyDown={e => { if (e.key === 'Enter') salvarNome(); if (e.key === 'Escape') { setNome(plano.nome); setEditandoNome(false); } }}
              className="w-full h-8 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-2.5 text-sm font-semibold dark:text-gray-100 focus:border-blue-400 focus:outline-none" />
          ) : (
            <button onClick={() => setEditandoNome(true)} className="group inline-flex items-center gap-1.5 max-w-full">
              <span className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{plano.nome}</span>
              <Pencil className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
            </button>
          )}
          <p className="text-[11px] text-gray-400 mt-0.5">{contas.length} conta{contas.length === 1 ? '' : 's'}</p>
        </div>
        <button onClick={abrirImport}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-blue-700 transition-colors">
          <Upload className="h-4 w-4" /> Importar planilha
        </button>
        <button onClick={onExcluir} title="Excluir plano"
          className="rounded-lg p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" onChange={onFile} className="hidden" />
      </div>

      {/* Redes que usam */}
      <SeletorRedesPlano planoId={plano.id} showToast={showToast} onMudou={onMudou} />

      {/* Contas */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-5 py-2.5 border-y border-gray-100 dark:border-white/10 flex items-center gap-3">
          <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por código, reduzido ou descrição…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-gray-100" />
          {!buscando && idsComFilhos.length > 0 && (
            <div className="flex items-center gap-2 text-[11.5px] flex-shrink-0">
              <button onClick={() => setExpandidos(new Set(idsComFilhos))} className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">Expandir tudo</button>
              <span className="text-gray-300">·</span>
              <button onClick={() => setExpandidos(new Set())} className="font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400">Recolher tudo</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : contas.length === 0 ? (
          <button onClick={abrirImport}
            className="m-5 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-blue-50/40 dark:hover:bg-blue-500/5 transition-colors flex flex-col items-center justify-center gap-2 py-16 text-center">
            <FileSpreadsheet className="h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Importar plano de contas</p>
            <p className="text-[12px] text-gray-400 max-w-xs">Planilha .xls, .xlsx ou .csv com as colunas Código, Código reduzido, Descrição e Natureza.</p>
          </button>
        ) : (
          <div className="flex-1 overflow-y-auto max-h-[52vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-100 dark:bg-slate-800 z-10">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="px-5 py-2">Código</th>
                  <th className="px-3 py-2">Reduzido</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Natureza</th>
                  <th className="px-3 py-2">Sint./Anal.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                {linhasVisiveis.map(c => {
                  const temFilhos = c.filhos && c.filhos.length > 0;
                  const aberto = expandidos.has(c.id);
                  return (
                    <tr key={c.id} onClick={() => temFilhos && toggleNo(c.id)}
                      className={`hover:bg-gray-50/60 dark:hover:bg-white/5 ${temFilhos ? 'cursor-pointer' : ''}`}>
                      <td className="px-5 py-1.5 font-mono text-[12px] text-gray-700 dark:text-gray-300 whitespace-nowrap"
                        style={{ paddingLeft: `${16 + (c.nivel || 0) * 18}px` }}>
                        <span className="inline-flex items-center gap-1">
                          {temFilhos ? (
                            <button onClick={(e) => { e.stopPropagation(); toggleNo(c.id); }}
                              className="p-0.5 -ml-1 rounded text-gray-400 hover:bg-gray-200/70 dark:hover:bg-white/10">
                              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${aberto ? 'rotate-90' : ''}`} />
                            </button>
                          ) : (
                            <span className="inline-block w-[18px]" />
                          )}
                          <span className={temFilhos ? 'font-semibold text-gray-800 dark:text-gray-100' : ''}>{c.codigo}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[12px] text-gray-500 dark:text-gray-400">{c.codigo_reduzido || '—'}</td>
                      <td className={`px-3 py-1.5 ${temFilhos ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-800 dark:text-gray-200'}`}>{c.descricao}</td>
                      <td className="px-3 py-1.5">{c.natureza ? <NaturezaBadge natureza={c.natureza} /> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-1.5">{c.classificacao ? <ClassificacaoBadge classificacao={c.classificacao} /> : <span className="text-gray-300">—</span>}</td>
                    </tr>
                  );
                })}
                {linhasVisiveis.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-[13px] text-gray-400">Nada encontrado para "{busca}".</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de importação: instruções/seleção → prévia/confirmação */}
      <Modal open={importOpen} onClose={fecharImport} title="Importar plano de contas" size="lg"
        footer={preview ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> Substitui as contas atuais do plano.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPreview(null)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">Voltar</button>
              <button onClick={confirmarImport} disabled={importando}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {importando && <Loader2 className="h-4 w-4 animate-spin" />} Importar {preview?.total} contas
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button onClick={fecharImport} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">Cancelar</button>
          </div>
        )}>
        {!preview ? (
          /* ESTADO A — como deve ser a planilha + baixar modelo + selecionar */
          <div className="space-y-4">
            <p className="text-[13px] text-gray-600 dark:text-gray-300">
              A planilha (<strong>.xlsx, .xls</strong> ou <strong>.csv</strong>) precisa ter uma linha de
              cabeçalho e uma coluna por campo. As colunas são identificadas pelo <strong>nome do cabeçalho</strong>
              (a ordem não importa).
            </p>

            <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-white/5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-3 py-2">Coluna</th><th className="px-3 py-2">Obrigatória</th><th className="px-3 py-2">O que é</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {[
                    ['Código', true, 'Código contábil (ex.: 1.1.01.001). Os pontos definem a hierarquia da árvore.'],
                    ['Código reduzido', false, 'Código reduzido usado por alguns layouts contábeis.'],
                    ['Descrição', true, 'Nome/descrição da conta.'],
                    ['Natureza', false, 'Devedora ou Credora.'],
                    ['Sintética/Analítica', false, 'Sintética agrupa (tem filhas); Analítica é folha e recebe lançamento.'],
                  ].map(([col, obr, desc]) => (
                    <tr key={col}>
                      <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{col}</td>
                      <td className="px-3 py-2">
                        {obr
                          ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400"><CheckCircle2 className="h-3.5 w-3.5" /> Sim</span>
                          : <span className="text-[11px] text-gray-400">Opcional</span>}
                      </td>
                      <td className="px-3 py-2 text-[12.5px] text-gray-500 dark:text-gray-400">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg bg-blue-50/60 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 px-3 py-2.5 text-[12px] text-blue-800 dark:text-blue-200">
              Aceita variações no cabeçalho: <em>Código/Conta</em>, <em>Cód. reduzido/Reduzido</em>,
              <em> Descrição/Nome</em>, <em>Natureza/D-C</em>, <em>Sintética-Analítica/Tipo</em>. Importar <strong>substitui</strong> todas as contas atuais do plano.
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button onClick={baixarModeloPlano}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <Download className="h-4 w-4" /> Baixar modelo (.xlsx)
              </button>
              <button onClick={escolherArquivo}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                <FileUp className="h-4 w-4" /> Selecionar planilha
              </button>
            </div>
          </div>
        ) : (
          /* ESTADO B — prévia do que foi lido */
          <div>
            <p className="text-[13px] text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span><strong>{preview.fileName}</strong> — {preview.total} contas detectadas. Prévia das primeiras linhas:</span>
            </p>
            <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-white/5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Reduzido</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2">Natureza</th><th className="px-3 py-2">Sint./Anal.</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {preview.linhas.slice(0, 8).map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-[12px]">{l.codigo}</td>
                      <td className="px-3 py-1.5 font-mono text-[12px] text-gray-500">{l.codigo_reduzido || '—'}</td>
                      <td className="px-3 py-1.5">{l.descricao}</td>
                      <td className="px-3 py-1.5 text-gray-500">{l.natureza || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-500">{l.classificacao || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.total > 8 && <p className="text-[12px] text-gray-400 mt-2">e mais {preview.total - 8} conta(s)…</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function NaturezaBadge({ natureza }) {
  const n = natureza.toLowerCase();
  const cred = n.startsWith('c') || n.includes('cred');
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
      cred ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
           : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
    }`}>{natureza}</span>
  );
}

function ClassificacaoBadge({ classificacao }) {
  const c = classificacao.toLowerCase();
  const sintetica = c.startsWith('s'); // sintética / S
  const analitica = c.startsWith('a');  // analítica / A
  const label = sintetica ? 'Sintética' : analitica ? 'Analítica' : classificacao;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
      sintetica ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
                : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
    }`}>{label}</span>
  );
}

// ─── Seletor de redes (Autosystem) que usam o plano ───────────
function SeletorRedesPlano({ planoId, showToast, onMudou }) {
  const [redes, setRedes] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        setLoading(true);
        const [lista, doPlano] = await Promise.all([
          autosystemService.listarRedes(),
          planoService.listarRedesDoPlano(planoId),
        ]);
        if (!vivo) return;
        setRedes(lista || []);
        setSel(new Set(doPlano.asRedeIds));
      } catch (err) { showToast?.('error', 'Erro ao carregar redes: ' + err.message); }
      finally { if (vivo) setLoading(false); }
    })();
    return () => { vivo = false; };
  }, [planoId, showToast]);

  const toggle = async (rede) => {
    const next = new Set(sel);
    next.has(rede.id) ? next.delete(rede.id) : next.add(rede.id);
    setSel(next);
    setSalvandoId(rede.id);
    try {
      await planoService.definirRedesDoPlano(planoId, { asRedeIds: [...next] });
      onMudou?.();
    } catch (err) {
      showToast?.('error', err.message);
      setSel(sel); // reverte
    } finally { setSalvandoId(null); }
  };

  return (
    <div className="px-5 py-3 bg-gray-50/60 dark:bg-white/[0.02]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
        <Network className="h-3.5 w-3.5" /> Redes que usam este plano
      </p>
      {loading ? (
        <div className="text-gray-400 py-1"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : redes.length === 0 ? (
        <p className="text-[12px] text-gray-400">Nenhuma rede Autosystem cadastrada.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {redes.map(r => {
            const on = sel.has(r.id);
            const saving = salvandoId === r.id;
            return (
              <button key={r.id} onClick={() => toggle(r)} disabled={saving}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  on ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300'
                     : 'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5'
                }`}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : on ? <Check className="h-3 w-3" /> : null}
                {r.nome}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
