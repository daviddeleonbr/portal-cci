import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, AlertCircle, Settings, Fuel, Search, Save, Droplet, CheckCircle2,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import { useClienteSession } from '../../../hooks/useAuth';
import * as autosystemService from '../../../services/autosystemService';

function fmtNum(v, casas = 0) {
  if (v == null || !Number.isFinite(Number(v))) return '0';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// Botão "tipo": Aditivada / Comum / Sem classificação
const TIPO_OPTS = [
  { value: 'aditivada', label: 'Aditivada', cor: 'violet' },
  { value: 'comum',     label: 'Comum',     cor: 'amber' },
  { value: null,        label: '—',         cor: 'gray' },
];

export default function ClienteConfiguracoes() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  const redeId = asRede?.id;

  const [combustiveis, setCombustiveis] = useState([]);   // [{ produto_codigo, produto_nome, grupo_codigo, litros_vendidos }]
  const [classificacao, setClassificacao] = useState(new Map());  // produto_codigo (number) → tipo
  const [classOriginal, setClassOriginal] = useState(new Map());  // estado salvo (para detectar dirty)
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [busca, setBusca] = useState('');
  const [gruposCombustivel, setGruposCombustivel] = useState([]);

  // Carrega grupos classificados como combustível (pra filtrar a busca de produtos)
  useEffect(() => {
    if (!redeId) return;
    (async () => {
      try {
        const lista = await autosystemService.listarGruposProdutoRede(redeId);
        setGruposCombustivel(
          (lista || []).filter(g => g.categoria === 'combustivel' && g.grid != null)
                       .map(g => Number(g.grid))
        );
      } catch { /* noop */ }
    })();
  }, [redeId]);

  async function carregar() {
    if (!redeId) return;
    setLoading(true);
    setErro('');
    setSucesso('');
    try {
      // Combustíveis vendidos recentemente + classificação atual em paralelo.
      const [produtos, mixSalvo] = await Promise.all([
        autosystemService.buscarCombustiveisDisponiveisAutosystem(redeId, {
          grupos_filtro: gruposCombustivel, dias: 180,
        }),
        autosystemService.listarMixProdutos(redeId),
      ]);
      setCombustiveis(produtos || []);
      const mapa = new Map();
      (mixSalvo || []).forEach(c => mapa.set(Number(c.produto_codigo), c.tipo));
      setClassificacao(new Map(mapa));
      setClassOriginal(new Map(mapa));
    } catch (err) {
      setErro(err.message || 'Falha ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (redeId && gruposCombustivel.length >= 0) carregar(); /* eslint-disable-next-line */ }, [redeId, gruposCombustivel.length]);

  function setTipo(produtoCodigo, tipo) {
    setClassificacao(prev => {
      const next = new Map(prev);
      const k = Number(produtoCodigo);
      if (tipo == null) next.delete(k);
      else next.set(k, tipo);
      return next;
    });
    setSucesso('');
  }

  async function salvar() {
    if (!redeId) return;
    setSalvando(true);
    setErro('');
    setSucesso('');
    try {
      // Monta payload com nome do produto (para cache da exibição mesmo se
      // o produto sair do range das vendas recentes)
      const mapaProdutos = new Map(combustiveis.map(p => [Number(p.produto_codigo), p]));
      const payload = [];
      classificacao.forEach((tipo, codigo) => {
        if (!tipo) return;
        const p = mapaProdutos.get(codigo);
        payload.push({
          produto_codigo: codigo,
          produto_nome:   p?.produto_nome || '',
          tipo,
        });
      });
      await autosystemService.salvarMixProdutos(redeId, payload);
      setClassOriginal(new Map(classificacao));
      setSucesso('Configurações salvas com sucesso.');
    } catch (err) {
      setErro(err.message || 'Falha ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  // Lista filtrada
  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return combustiveis;
    return combustiveis.filter(p => (p.produto_nome || '').toLowerCase().includes(q));
  }, [combustiveis, busca]);

  // Contadores
  const contagem = useMemo(() => {
    let aditivada = 0, comum = 0;
    classificacao.forEach(t => {
      if (t === 'aditivada') aditivada++;
      else if (t === 'comum') comum++;
    });
    return { aditivada, comum, total: combustiveis.length };
  }, [classificacao, combustiveis.length]);

  // Detecta mudanças não salvas
  const isDirty = useMemo(() => {
    if (classificacao.size !== classOriginal.size) return true;
    for (const [k, v] of classificacao) {
      if (classOriginal.get(k) !== v) return true;
    }
    return false;
  }, [classificacao, classOriginal]);

  if (!redeId) {
    return (
      <div>
        <PageHeader title="Configurações" description="Parametrizações da rede" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Configurações disponíveis apenas para usuários do portal Autosystem.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Configurações" description={asRede?.nome || 'Parametrizações da rede'} />

      {/* Seção: MIX */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <Droplet className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-gray-900">Mix de gasolina</h2>
              <p className="text-[12px] text-gray-500 mt-0.5 max-w-xl">
                Classifique cada gasolina vendida como <strong className="text-violet-700">Aditivada</strong> ou{' '}
                <strong className="text-amber-700">Comum</strong>. O Mix é calculado por{' '}
                <em>(litros aditivada) ÷ (litros aditivada + litros comum)</em>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[11.5px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                Aditivada {contagem.aditivada}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Comum {contagem.comum}
              </span>
              <span className="text-gray-400">de {contagem.total} produtos</span>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
          </div>
          <div className="flex-1" />
          {sucesso && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {sucesso}
            </span>
          )}
          {erro && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-red-700">
              <AlertCircle className="h-4 w-4" /> {erro}
            </span>
          )}
          <button onClick={salvar} disabled={!isDirty || salvando}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isDirty
                ? 'bg-violet-600 text-white hover:bg-violet-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}>
            {salvando
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />}
            {salvando ? 'Salvando...' : isDirty ? 'Salvar alterações' : 'Salvo'}
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
            <span className="text-sm">Carregando combustíveis...</span>
          </div>
        ) : combustiveis.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-3">
              <Fuel className="h-6 w-6 text-amber-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">Nenhum combustível encontrado</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Verifique se os grupos de combustível estão classificados em{' '}
              <em>/admin/clientes → Redes Autosystem → Classificar grupos</em>.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {listaFiltrada.length === 0 ? (
              <p className="px-5 py-8 text-center text-[12px] text-gray-400">
                Nenhum produto corresponde à busca.
              </p>
            ) : listaFiltrada.map(p => {
              const codigo = Number(p.produto_codigo);
              const tipoAtual = classificacao.get(codigo) || null;
              return (
                <div key={codigo} className="px-5 py-3 flex items-center gap-3 flex-wrap hover:bg-gray-50/40 transition-colors">
                  <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <Fuel className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{p.produto_nome}</p>
                    <p className="text-[10.5px] text-gray-400 font-mono">
                      cód {codigo}
                      {p.grupo_codigo != null && ` · grupo ${p.grupo_codigo}`}
                      {p.litros_vendidos != null && ` · ${fmtNum(p.litros_vendidos, 0)} L em 180 dias`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5 flex-shrink-0">
                    {TIPO_OPTS.map(opt => {
                      const ativo = tipoAtual === opt.value;
                      const corClasses = ativo
                        ? opt.cor === 'violet' ? 'bg-white text-violet-700 shadow-sm ring-1 ring-violet-200'
                        : opt.cor === 'amber'  ? 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-200'
                                               : 'bg-white text-gray-600 shadow-sm ring-1 ring-gray-200'
                        : 'text-gray-500 hover:text-gray-800';
                      return (
                        <button key={String(opt.value)} type="button"
                          onClick={() => setTipo(codigo, opt.value)}
                          className={`px-3 py-1 text-[11.5px] font-medium rounded-md transition-colors ${corClasses}`}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
