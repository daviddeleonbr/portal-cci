import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, AlertCircle, Fuel, Search, Save, Droplet, CheckCircle2, Tag, Building2,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import { useClienteSession } from '../../../hooks/useAuth';
import * as qualityApi from '../../../services/qualityApiService';
import * as mapeamentoService from '../../../services/mapeamentoService';
import * as clientesService from '../../../services/clientesService';
import { atualizarEmpresaNaSessao } from '../../../lib/auth';

const TIPO_OPTS = [
  { value: 'aditivada', label: 'Aditivada', cor: 'violet' },
  { value: 'comum',     label: 'Comum',     cor: 'amber' },
  { value: null,        label: '—',         cor: 'gray' },
];

const ABAS = [
  { key: 'gasolina', label: 'Classificação de gasolina', icon: Droplet, descricao: 'Aditivada / Comum por produto' },
  { key: 'apelidos', label: 'Apelidos das empresas', icon: Tag, descricao: 'Nome curto por empresa' },
];

export default function ClienteConfiguracoes() {
  const session = useClienteSession();
  const chaveApi = session?.chaveApi;
  const chaveApiId = chaveApi?.id;
  const [aba, setAba] = useState('gasolina');

  if (!chaveApiId) {
    return (
      <div>
        <PageHeader title="Configurações" description="Parametrizações da rede" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Configurações disponíveis apenas para usuários do portal Webposto.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Configurações" description={chaveApi?.nome || 'Parametrizações da rede'} />

      <div className="bg-white rounded-xl border border-gray-100 mb-4 overflow-hidden">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
          {ABAS.map(a => {
            const Icon = a.icon;
            const ativo = aba === a.key;
            return (
              <button key={a.key} onClick={() => setAba(a.key)}
                className={`flex items-start gap-2 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="text-left">
                  <p>{a.label}</p>
                  <p className="text-[10.5px] text-gray-400 font-normal">{a.descricao}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {aba === 'gasolina' && <AbaMixGasolina chaveApi={chaveApi} />}
      {aba === 'apelidos' && <AbaApelidos />}
    </div>
  );
}

// ─── Aba: apelidos das empresas ──────────────────────────────
// Define um nome curto por empresa (ex.: "Complexo Costa Azul" → "Costa Azul").
// Salva no servidor (compartilhado com a rede) via RPC e atualiza a sessão em
// memória. O toggle "Razão social ↔ Apelido" fica no cabeçalho do portal.
function AbaApelidos() {
  const session = useClienteSession();
  const empresas = useMemo(() => {
    const base = session?.clientesRede?.length ? session.clientesRede : (session?.cliente ? [session.cliente] : []);
    return [...base].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [session?.clientesRede, session?.cliente]);

  const [valores, setValores] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(null);

  // Inicializa/ressincroniza os inputs a partir da sessão.
  useEffect(() => {
    const init = {};
    empresas.forEach(e => { init[e.id] = e.apelido || ''; });
    setValores(init);
  }, [empresas]);

  const dirty = useMemo(
    () => empresas.filter(e => (valores[e.id] ?? '').trim() !== (e.apelido || '').trim()),
    [empresas, valores],
  );

  const salvar = async () => {
    if (dirty.length === 0) return;
    setSalvando(true);
    try {
      for (const e of dirty) {
        const novo = (valores[e.id] ?? '').trim();
        await clientesService.salvarApelidoEmpresa(e.id, novo);
        atualizarEmpresaNaSessao(e.id, { apelido: novo || null });
      }
      setToast({ tipo: 'success', msg: `${dirty.length} apelido(s) salvo(s)` });
    } catch (err) {
      setToast({ tipo: 'error', msg: 'Erro ao salvar: ' + (err.message || err) });
    } finally {
      setSalvando(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  if (empresas.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500">
        Nenhuma empresa disponível.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <Tag className="h-4 w-4 text-blue-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Apelidos das empresas</p>
          <p className="text-[11.5px] text-gray-500">
            Defina um nome curto por empresa. No cabeçalho, o botão <strong>Razão social ↔ Apelido</strong> alterna a
            exibição em todo o portal.
          </p>
        </div>
        <button onClick={salvar} disabled={salvando || dirty.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar{dirty.length > 0 ? ` (${dirty.length})` : ''}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-gray-50/80 border-b border-gray-100">
            <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-2.5">Empresa</th>
              <th className="px-3 py-2.5">CNPJ</th>
              <th className="px-3 py-2.5 w-[42%]">Apelido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {empresas.map(e => (
              <tr key={e.id} className="hover:bg-gray-50/40">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-gray-300 flex-shrink-0" />
                    <span className="text-[12.5px] font-medium text-gray-900 truncate max-w-[220px]" title={e.nome}>{e.nome || '—'}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[11.5px] text-gray-400 font-mono whitespace-nowrap">{e.cnpj || '—'}</td>
                <td className="px-3 py-2.5">
                  <input type="text" value={valores[e.id] ?? ''}
                    onChange={ev => setValores(prev => ({ ...prev, [e.id]: ev.target.value }))}
                    placeholder="Ex.: Costa Azul"
                    maxLength={60}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className={`px-4 py-2.5 text-[12.5px] flex items-center gap-2 ${
          toast.tipo === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {toast.tipo === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function AbaMixGasolina({ chaveApi }) {
  const chaveApiId = chaveApi?.id;
  const [combustiveis, setCombustiveis] = useState([]);
  const [classificacao, setClassificacao] = useState(new Map());
  const [classOriginal, setClassOriginal] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [busca, setBusca] = useState('');

  async function carregar() {
    if (!chaveApiId || !chaveApi?.chave) return;
    setLoading(true);
    setErro('');
    setSucesso('');
    try {
      const [produtos, mixSalvo] = await Promise.all([
        qualityApi.buscarProdutos(chaveApi.chave),
        mapeamentoService.listarMixProdutosWebposto(chaveApiId),
      ]);
      // Apenas combustíveis: flag dedicada `combustivel = true` do endpoint PRODUTO
      const combs = (produtos || []).filter(p =>
        p.combustivel === true || p.combustivel === 'S' || p.combustivel === 1
      ).map(p => ({
        produto_codigo: Number(p.codigo ?? p.produtoCodigo),
        produto_nome:   p.nome || p.descricao || `Produto #${p.codigo}`,
        grupo_codigo:   p.grupoCodigo ?? p.grupo_codigo ?? null,
      })).filter(p => Number.isFinite(p.produto_codigo));
      // Inclui também combustíveis já classificados mas que não vieram no catálogo
      const visiveis = new Set(combs.map(c => c.produto_codigo));
      (mixSalvo || []).forEach(c => {
        const cod = Number(c.produto_codigo);
        if (!visiveis.has(cod)) {
          combs.push({ produto_codigo: cod, produto_nome: c.produto_nome || `Produto #${cod}`, grupo_codigo: null });
        }
      });
      combs.sort((a, b) => (a.produto_nome || '').localeCompare(b.produto_nome || ''));
      setCombustiveis(combs);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [chaveApiId]);

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
    if (!chaveApiId) return;
    setSalvando(true);
    setErro('');
    setSucesso('');
    try {
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
      await mapeamentoService.salvarMixProdutosWebposto(chaveApiId, payload);
      setClassOriginal(new Map(classificacao));
      setSucesso('Configurações salvas com sucesso.');
    } catch (err) {
      setErro(err.message || 'Falha ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return combustiveis;
    return combustiveis.filter(p => (p.produto_nome || '').toLowerCase().includes(q));
  }, [combustiveis, busca]);

  const contagem = useMemo(() => {
    let aditivada = 0, comum = 0;
    classificacao.forEach(t => {
      if (t === 'aditivada') aditivada++;
      else if (t === 'comum') comum++;
    });
    return { aditivada, comum, total: combustiveis.length };
  }, [classificacao, combustiveis.length]);

  const isDirty = useMemo(() => {
    if (classificacao.size !== classOriginal.size) return true;
    for (const [k, v] of classificacao) {
      if (classOriginal.get(k) !== v) return true;
    }
    return false;
  }, [classificacao, classOriginal]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3 flex-wrap">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <Droplet className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-gray-900">Mix de gasolina</h2>
            <p className="text-[12px] text-gray-500 mt-0.5 max-w-xl">
              Classifique cada gasolina vendida como <strong className="text-blue-700">Aditivada</strong> ou{' '}
              <strong className="text-amber-700">Comum</strong>. O Mix é calculado por{' '}
              <em>(litros aditivada) ÷ (litros aditivada + litros comum)</em>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[11.5px]">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
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

      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
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
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}>
          {salvando
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />}
          {salvando ? 'Salvando...' : isDirty ? 'Salvar alterações' : 'Salvo'}
        </button>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando combustíveis...</span>
        </div>
      ) : combustiveis.length === 0 ? (
        <div className="p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-3">
            <Fuel className="h-6 w-6 text-amber-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhum combustível encontrado</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Nenhum produto com a flag <em>combustivel = true</em> foi retornado pelo endpoint PRODUTO da API Quality.
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
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5 flex-shrink-0">
                  {TIPO_OPTS.map(opt => {
                    const ativo = tipoAtual === opt.value;
                    const corClasses = ativo
                      ? opt.cor === 'violet' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200'
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
  );
}
