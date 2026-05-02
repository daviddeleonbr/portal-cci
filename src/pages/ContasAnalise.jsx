import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Search, Loader2, AlertCircle, FlaskConical,
  Check, ChevronRight, Key, FolderOpen, Folder, Minus,
  Repeat,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as flagsService from '../services/contasAnaliseService';

// ═══════════════════════════════════════════════════════════
// Monta a arvore a partir do campo hierarquia (formato "1.1.01")
// ═══════════════════════════════════════════════════════════
function buildPlanoTree(flatList) {
  const sorted = [...flatList].sort((a, b) => {
    const aParts = (a.hierarquia || '').split('.').map(Number);
    const bParts = (b.hierarquia || '').split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const ai = aParts[i] ?? 0;
      const bi = bParts[i] ?? 0;
      if (ai !== bi) return ai - bi;
    }
    return 0;
  });

  const byHier = new Map();
  sorted.forEach(item => byHier.set(item.hierarquia, { ...item, children: [] }));

  const roots = [];
  sorted.forEach(item => {
    const node = byHier.get(item.hierarquia);
    const parts = (item.hierarquia || '').split('.');
    if (parts.length <= 1) {
      roots.push(node);
    } else {
      const parentHier = parts.slice(0, -1).join('.');
      const parent = byHier.get(parentHier);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  });
  return roots;
}

function coletarFolhas(node) {
  if (!node.children || node.children.length === 0) return [node];
  return node.children.flatMap(coletarFolhas);
}

// ═══════════════════════════════════════════════════════════
export default function ContasAnalise() {
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const [chaves, setChaves] = useState([]);
  const [loadingChaves, setLoadingChaves] = useState(true);
  const [chaveSelecionada, setChaveSelecionada] = useState(null);
  const [planoContas, setPlanoContas] = useState([]);
  const [loadingPlano, setLoadingPlano] = useState(false);
  const [flags, setFlags] = useState({});
  const [busca, setBusca] = useState('');
  const [expandidos, setExpandidos] = useState(new Set());

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  useEffect(() => {
    (async () => {
      try {
        const lista = await mapService.listarChavesApi();
        setChaves(lista || []);
      } catch (err) {
        showToast('error', 'Erro ao carregar chaves: ' + err.message);
      } finally {
        setLoadingChaves(false);
      }
    })();
  }, []);

  const carregarPlano = useCallback(async (chave) => {
    setLoadingPlano(true);
    try {
      const plano = await qualityApi.buscarPlanoContasGerencial(chave.chave);
      setPlanoContas(plano || []);
      setFlags(flagsService.listarFlags(chave.id));
      // Auto-expandir primeiro nivel
      const raizes = (plano || []).filter(p => p.hierarquia && p.hierarquia.split('.').length === 1);
      setExpandidos(new Set(raizes.map(r => r.hierarquia)));
    } catch (err) {
      showToast('error', 'Erro ao carregar plano de contas: ' + err.message);
    } finally {
      setLoadingPlano(false);
    }
  }, []);

  const selecionarChave = (chave) => {
    setChaveSelecionada(chave);
    carregarPlano(chave);
  };

  const toggleExpand = (hier) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(hier) ? next.delete(hier) : next.add(hier);
      return next;
    });
  };

  // Auto-expand ao buscar
  useEffect(() => {
    if (!busca) return;
    const q = busca.toLowerCase();
    const hierarquias = new Set();
    planoContas
      .filter(c => (c.descricao || '').toLowerCase().includes(q) || (c.hierarquia || '').includes(busca))
      .forEach(c => {
        const parts = (c.hierarquia || '').split('.');
        for (let i = 1; i < parts.length; i++) hierarquias.add(parts.slice(0, i).join('.'));
      });
    setExpandidos(prev => new Set([...prev, ...hierarquias]));
  }, [busca, planoContas]);

  const planoFiltrado = useMemo(() => {
    if (!busca.trim()) return planoContas;
    const q = busca.trim().toLowerCase();
    return planoContas.filter(c =>
      (c.descricao || '').toLowerCase().includes(q) || (c.hierarquia || '').includes(busca)
    );
  }, [planoContas, busca]);

  const tree = useMemo(() => buildPlanoTree(planoFiltrado), [planoFiltrado]);

  const toggleConta = (conta) => {
    if (!chaveSelecionada) return;
    const novas = flagsService.toggleFlag(chaveSelecionada.id, conta);
    setFlags(novas);
  };

  const toggleRecorrencia = (contaCodigo) => {
    if (!chaveSelecionada) return;
    const novas = flagsService.toggleRecorrencia(chaveSelecionada.id, contaCodigo);
    setFlags(novas);
  };

  const marcarFolhasDoNode = (node, marcar) => {
    if (!chaveSelecionada) return;
    const folhas = coletarFolhas(node);
    const atualizadas = { ...flags };
    folhas.forEach(f => {
      const codigo = String(f.codigo || f.planoContaGerencialCodigo || f.hierarquia);
      if (marcar) {
        const existing = atualizadas[codigo];
        atualizadas[codigo] = { codigo, descricao: f.descricao, hierarquia: f.hierarquia, recorrente: existing?.recorrente || false };
      } else {
        delete atualizadas[codigo];
      }
    });
    flagsService.salvarFlags(chaveSelecionada.id, atualizadas);
    setFlags(atualizadas);
  };

  const totalFlagged = Object.keys(flags).length;

  // ─── LISTA DE CHAVES (nenhuma selecionada) ─────────────────
  if (!chaveSelecionada) {
    return (
      <div>
        <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
        <PageHeader title="Análise de Lançamentos" description="Marque as contas do plano gerencial cujos lançamentos devem ser analisados" />

        {loadingChaves ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
          </div>
        ) : chaves.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Nenhuma chave API cadastrada.</p>
            <p className="text-xs text-gray-400 mt-1">Cadastre em Parâmetros &gt; Mapeamento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {chaves.map(c => {
              const qtd = flagsService.contagem(c.id);
              return (
                <button key={c.id} onClick={() => selecionarChave(c)}
                  className="group bg-white rounded-xl border border-gray-200/60 p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                      <Key className="h-4 w-4 text-white" />
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded uppercase tracking-wider">
                      {c.provedor || 'quality'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-700">{c.nome}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {c.clientes?.length || 0} empresa(s) vinculada(s)
                  </p>
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-[11px] text-gray-500">
                    <FlaskConical className="h-3 w-3" />
                    <span>{qtd} {qtd === 1 ? 'conta marcada' : 'contas marcadas'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── WORKSPACE (chave selecionada) ─────────────────────────
  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => { setChaveSelecionada(null); setPlanoContas([]); setFlags({}); }}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <FlaskConical className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">Contas para análise</h2>
            <p className="text-[11px] text-gray-400 truncate">
              Plano gerencial da rede <strong>{chaveSelecionada.nome}</strong>
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-gray-400">Marcadas</p>
          <p className="text-base font-bold text-blue-600">{totalFlagged}</p>
        </div>
      </motion.div>

      {/* Busca */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição ou hierarquia..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>

      {/* Tree */}
      {loadingPlano ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
        </div>
      ) : tree.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {planoContas.length === 0 ? 'Nenhuma conta no plano gerencial.' : 'Nenhuma conta corresponde a busca.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
          <div className="py-1">
            {tree.map(node => (
              <TreeNode
                key={node.hierarquia}
                node={node}
                depth={0}
                flags={flags}
                expandidos={expandidos}
                onToggleExpand={toggleExpand}
                onToggleConta={toggleConta}
                onToggleRecorrencia={toggleRecorrencia}
                onMarcarFolhas={marcarFolhasDoNode}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Tree node recursivo
// ═══════════════════════════════════════════════════════════
function TreeNode({ node, depth, flags, expandidos, onToggleExpand, onToggleConta, onToggleRecorrencia, onMarcarFolhas }) {
  const isLeaf = !node.children || node.children.length === 0;
  const isExpanded = expandidos.has(node.hierarquia);
  const indent = depth * 18;

  // Estado agregado dos descendentes (para parents)
  const folhas = isLeaf ? [node] : coletarFolhas(node);
  const folhasFlagadas = folhas.filter(f => flags[String(f.codigo || f.hierarquia)]).length;
  const todas = folhas.length > 0 && folhasFlagadas === folhas.length;
  const parcial = folhasFlagadas > 0 && folhasFlagadas < folhas.length;

  const codigoConta = String(node.codigo || node.hierarquia);
  const flag = flags[codigoConta];
  const marcada = !!flag;
  const recorrente = !!flag?.recorrente;

  const handleCheckbox = (e) => {
    e.stopPropagation();
    if (isLeaf) {
      onToggleConta({ codigo: codigoConta, descricao: node.descricao, hierarquia: node.hierarquia });
    } else {
      onMarcarFolhas(node, !todas);
    }
  };

  const handleRecorrencia = (e) => {
    e.stopPropagation();
    onToggleRecorrencia(codigoConta);
  };

  return (
    <>
      <div
        className={`flex items-center gap-2 pr-3 py-1.5 transition-colors cursor-pointer ${
          isLeaf && marcada ? 'bg-blue-50/50' : 'hover:bg-gray-50'
        }`}
        style={{ paddingLeft: 12 + indent }}
        onClick={() => !isLeaf && onToggleExpand(node.hierarquia)}
      >
        {/* Chevron */}
        {isLeaf ? (
          <div className="w-4 flex-shrink-0" />
        ) : (
          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}
            className="text-gray-400 flex-shrink-0">
            <ChevronRight className="h-3.5 w-3.5" />
          </motion.div>
        )}

        {/* Checkbox */}
        <button onClick={handleCheckbox}
          className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            isLeaf
              ? marcada ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 hover:border-blue-400'
              : todas ? 'bg-blue-600 border-blue-600'
                : parcial ? 'bg-blue-100 border-blue-400'
                : 'bg-white border-gray-300 hover:border-blue-400'
          }`}>
          {isLeaf
            ? (marcada && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />)
            : todas ? <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
              : parcial ? <Minus className="h-2.5 w-2.5 text-blue-600" strokeWidth={3} /> : null
          }
        </button>

        {/* Icon */}
        {!isLeaf && (isExpanded
          ? <FolderOpen className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
          : <Folder className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
        )}

        {/* Hierarquia + descricao */}
        <span className={`text-[11px] font-mono flex-shrink-0 ${
          depth === 0 ? 'text-gray-900 font-semibold' : 'text-gray-400'
        }`}>
          {node.hierarquia}
        </span>
        <span className={`text-sm truncate flex-1 ${
          depth === 0 ? 'font-semibold text-gray-900'
            : isLeaf && marcada ? 'text-blue-900 font-medium'
            : 'text-gray-700'
        }`}>
          {node.descricao}
        </span>

        {/* Botao recorrencia (so em folhas marcadas) */}
        {isLeaf && marcada && (
          <button onClick={handleRecorrencia}
            title={recorrente ? 'Recorrência mensal obrigatoria (clique para desmarcar)' : 'Marcar como recorrência mensal obrigatoria'}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all flex-shrink-0 ${
              recorrente
                ? 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200'
                : 'bg-white text-gray-400 border-gray-200 hover:text-purple-600 hover:border-purple-200'
            }`}>
            <Repeat className="h-2.5 w-2.5" />
            Mensal
          </button>
        )}

        {/* Counter for parents */}
        {!isLeaf && folhas.length > 0 && (
          <span className="text-[10px] text-gray-400 flex-shrink-0 font-mono">
            {folhasFlagadas}/{folhas.length}
          </span>
        )}
      </div>

      {/* Children */}
      {!isLeaf && isExpanded && node.children.map(child => (
        <TreeNode key={child.hierarquia} node={child} depth={depth + 1}
          flags={flags}
          expandidos={expandidos}
          onToggleExpand={onToggleExpand}
          onToggleConta={onToggleConta}
          onToggleRecorrencia={onToggleRecorrencia}
          onMarcarFolhas={onMarcarFolhas}
        />
      ))}
    </>
  );
}
