// Modal de criação de novo pedido de compra.
//   - Escolhe empresa + fornecedor
//   - Painel de sugestões: usa a análise de estoque (autosystem) pra mostrar
//     produtos em ruptura/crítico/baixo com qtd sugerida pra comprar
//   - Adicionar manualmente: produto + qtd + custo
//   - Lista de itens já adicionados embaixo (editáveis)
//   - Botões: Salvar como rascunho · Enviar pra liberação

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  X, Loader2, ShoppingCart, Plus, Trash2, Sparkles, Building2,
  AlertTriangle, AlertCircle, Package, Send, Save, Search,
} from 'lucide-react';
import * as svc from '../../../services/pedidosCompraService';
import * as autosystemService from '../../../services/autosystemService';

const STATUS_ESTOQUE = {
  ruptura:  { label: 'RUPTURA',   cor: 'bg-rose-100 text-rose-700' },
  critico:  { label: 'CRÍTICO',   cor: 'bg-amber-100 text-amber-700' },
  baixo:    { label: 'BAIXO',     cor: 'bg-yellow-100 text-yellow-700' },
  ok:       { label: 'OK',        cor: 'bg-emerald-100 text-emerald-700' },
  excesso:  { label: 'EXCESSO',   cor: 'bg-orange-100 text-orange-700' },
  parado:   { label: 'PARADO',    cor: 'bg-gray-200 text-gray-700' },
  inativo:  { label: 'INATIVO',   cor: 'bg-gray-100 text-gray-500' },
};

// Heurística de classificação (mesma da página de análise de estoque)
function classificarStatus(item, vendaDiaria, params) {
  const { leadTimeDias, coberturaMetaDias, diasParaMorto } = params;
  const estoque = Number(item.estoque_atual || 0);
  if (estoque <= 0) {
    if (Number(item.venda_qtd || 0) > 0) return 'ruptura';
    return 'inativo';
  }
  if (vendaDiaria <= 0) {
    const dias = diasSemVenda(item.ultima_venda);
    if (dias !== null && dias >= diasParaMorto) return 'parado';
    return 'inativo';
  }
  const cobertura = estoque / vendaDiaria;
  if (cobertura < leadTimeDias)           return 'critico';
  if (cobertura < coberturaMetaDias)      return 'baixo';
  if (cobertura > coberturaMetaDias * 2)  return 'excesso';
  return 'ok';
}
function diasSemVenda(iso) {
  if (!iso) return null;
  try { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }
  catch { return null; }
}

const PARAMS_PADRAO = { janelaDias: 90, leadTimeDias: 7, coberturaMetaDias: 30, diasParaMorto: 90 };

function fmtNumero(v) { return new Intl.NumberFormat('pt-BR').format(Number(v) || 0); }
function fmtMoeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(Number(v) || 0);
}

export default function ModalNovoPedido({ chaveApiId, session, onClose, onCriado }) {
  const empresas = useMemo(() => session?.clientesRede || [], [session]);
  const asRede = session?.asRede;
  const usuarioId = session?.usuario?.id;
  const tipoCliente = session?.tipoCliente;

  const [empresaSel, setEmpresaSel] = useState(empresas[0] || null);
  const [fornecedor, setFornecedor] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const [itens, setItens] = useState([]); // local antes de salvar no DB
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  // Modal de busca de produto — guarda o _key do item que está sendo editado
  const [buscaModalKey, setBuscaModalKey] = useState(null);

  const [showSugestoes, setShowSugestoes] = useState(false);
  const [analise, setAnalise] = useState([]);
  const [loadingAnalise, setLoadingAnalise] = useState(false);

  // Catálogo completo de produtos (todos cadastrados no AS).
  // Carregado uma vez por sessão do modal — usado no autocomplete.
  const [catalogo, setCatalogo] = useState([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);

  // Catálogo de pessoas (fornecedores) — modal de busca abre quando o
  // usuário clica no campo Fornecedor
  const [pessoas, setPessoas] = useState([]);
  const [loadingPessoas, setLoadingPessoas] = useState(false);
  const [buscaFornModal, setBuscaFornModal] = useState(false);

  useEffect(() => {
    if (tipoCliente !== 'autosystem' || !asRede?.id) return;
    let cancelado = false;
    (async () => {
      setLoadingCatalogo(true);
      setLoadingPessoas(true);
      try {
        const [produtos, pessoasArr] = await Promise.all([
          autosystemService.listarProdutosCatalogo(asRede.id),
          autosystemService.listarPessoasCatalogo(asRede.id),
        ]);
        if (!cancelado) {
          setCatalogo(produtos);
          setPessoas(pessoasArr);
        }
      } catch (err) {
        if (!cancelado) console.warn('Erro carregando catálogos:', err.message);
      } finally {
        if (!cancelado) {
          setLoadingCatalogo(false);
          setLoadingPessoas(false);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [tipoCliente, asRede?.id]);

  // Mescla catálogo + análise: produto vem do catálogo (completo),
  // info de estoque/custo/status vem da análise quando disponível.
  // Lookup é por GRID (p.produto) que é único; código humano (produto_codigo)
  // só vem do catálogo.
  const catalogoMesclado = useMemo(() => {
    const mapaAnalise = new Map(analise.map(a => [String(a.produto), a]));
    return catalogo.map(p => {
      const a = mapaAnalise.get(String(p.produto));
      return {
        ...p,
        ...(a || {}),
        // Preserva campos do catálogo (código humano, nome, grupos)
        produto:        p.produto,                // grid (lookup)
        produto_codigo: p.produto_codigo,         // código humano
        produto_nome:   p.produto_nome || a?.produto_nome,
        grupo:          p.grupo || a?.grupo,
        subgrupo:       p.subgrupo || a?.subgrupo,
      };
    });
  }, [catalogo, analise]);

  // Carrega análise de estoque (somente autosystem)
  useEffect(() => {
    if (tipoCliente !== 'autosystem' || !asRede?.id || !empresaSel) return;
    let cancelado = false;
    (async () => {
      setLoadingAnalise(true);
      try {
        const r = await autosystemService.buscarEstoqueAnalise(asRede.id, {
          empresaCodigo: empresaSel.empresa_codigo,
          janelaDias: PARAMS_PADRAO.janelaDias,
        });
        if (cancelado) return;
        // Enriquece com derivados + status
        const enriquecidos = (r.itens || []).map(p => {
          const vendaDiaria = PARAMS_PADRAO.janelaDias > 0
            ? Number(p.venda_qtd || 0) / PARAMS_PADRAO.janelaDias : 0;
          const cobertura = vendaDiaria > 0 ? Number(p.estoque_atual || 0) / vendaDiaria : (Number(p.estoque_atual || 0) > 0 ? 999 : 0);
          const sugestaoCompra = Math.max(0, vendaDiaria * PARAMS_PADRAO.coberturaMetaDias - Number(p.estoque_atual || 0));
          const status = classificarStatus(p, vendaDiaria, PARAMS_PADRAO);
          return { ...p, vendaDiaria, cobertura, sugestaoCompra, status };
        });
        setAnalise(enriquecidos);
      } catch (err) {
        if (!cancelado) console.warn('Erro análise estoque:', err.message);
      } finally {
        if (!cancelado) setLoadingAnalise(false);
      }
    })();
    return () => { cancelado = true; };
  }, [tipoCliente, asRede?.id, empresaSel]);

  // Filtra sugestões (prioridade: ruptura > critico > baixo)
  const sugestoes = useMemo(() => {
    const prio = { ruptura: 1, critico: 2, baixo: 3 };
    const b = busca.toLowerCase();
    return analise
      .filter(p => ['ruptura', 'critico', 'baixo'].includes(p.status))
      .filter(p => !b || (p.produto_nome || '').toLowerCase().includes(b) || String(p.produto || '').includes(b))
      .filter(p => !itens.some(i => String(i.produtoCodigo) === String(p.produto)))
      .sort((a, b) => (prio[a.status] || 99) - (prio[b.status] || 99))
      .slice(0, 100);
  }, [analise, busca, itens]);

  const adicionarSugestao = (p) => {
    const novo = {
      _key: `${p.produto}-${Date.now()}`,
      // `produto_codigo` (humano) preferido; cai pro `produto` (grid) se ausente
      produtoCodigo:        String(p.produto_codigo ?? p.produto),
      produtoNome:          p.produto_nome,
      grupo:                p.grupo,
      subgrupo:             p.subgrupo,
      quantidadeSolicitada: Math.ceil(p.sugestaoCompra || 1),
      custoUnitario:        Number(p.custo_unit || 0),
      precoUnitario:        Number(p.preco_unit || 0),
      estoqueAtual:         Number(p.estoque_atual || 0),
      statusEstoque:        p.status,
      coberturaDias:        Number(p.cobertura || 0),
    };
    setItens(prev => [...prev, novo]);
  };

  const adicionarManual = () => {
    setItens(prev => [...prev, {
      _key: `manual-${Date.now()}`,
      produtoCodigo: '',
      produtoNome: '',
      quantidadeSolicitada: 1,
      custoUnitario: 0,
      precoUnitario: 0,
      statusEstoque: null,
    }]);
  };

  const atualizarItem = (key, campo, valor) => {
    setItens(prev => prev.map(i => i._key === key ? { ...i, [campo]: valor } : i));
  };
  const removerItem = (key) => setItens(prev => prev.filter(i => i._key !== key));

  const totalSolicitado = itens.reduce(
    (s, i) => s + Number(i.custoUnitario || 0) * Number(i.quantidadeSolicitada || 0), 0
  );

  const validar = () => {
    if (!empresaSel) return 'Selecione uma empresa.';
    if (!fornecedor.trim()) return 'Informe o fornecedor.';
    if (itens.length === 0) return 'Adicione ao menos 1 item.';
    if (itens.some(i => !i.produtoCodigo || Number(i.quantidadeSolicitada) <= 0)) {
      return 'Cada item precisa de código e quantidade > 0.';
    }
    return null;
  };

  const salvar = async (enviarLiberacao = false) => {
    const err = validar();
    if (err) { setErro(err); return; }
    setSalvando(true); setErro(null);
    try {
      const pedido = await svc.criarPedido({
        chaveApiId,
        clienteId:     empresaSel.id,
        empresaCodigo: empresaSel.empresa_codigo,
        fornecedor:    fornecedor.trim(),
        observacoes:   observacoes.trim() || null,
        criadoPor:     usuarioId,
      });
      for (const i of itens) {
        await svc.adicionarItem(pedido.id, i);
      }
      if (enviarLiberacao) {
        await svc.enviarParaLiberacao(pedido.id);
      }
      onCriado(pedido);
    } catch (e) {
      setErro(e.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Novo pedido de compra</h2>
              <p className="text-[11.5px] text-gray-500">Selecione produtos, defina quantidades e envie pra liberação</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Cabeçalho — empresa + fornecedor */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Campo label="Empresa" obrigatorio icone={Building2}>
              <select value={empresaSel?.id || ''}
                onChange={e => setEmpresaSel(empresas.find(x => x.id === e.target.value))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.fantasia || emp.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Fornecedor" obrigatorio>
              <button type="button" onClick={() => setBuscaFornModal(true)}
                className="w-full flex items-center gap-2 text-left rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 px-3 py-2 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors">
                <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className={`flex-1 truncate ${fornecedor ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                  {fornecedor || 'Clique pra buscar fornecedor...'}
                </span>
              </button>
            </Campo>
            <Campo label="Observações">
              <input type="text" value={observacoes} onChange={e => setObservacoes(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </Campo>
          </div>

          {/* Sugestões da análise de estoque */}
          {tipoCliente === 'autosystem' && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/30">
              <button onClick={() => setShowSugestoes(v => !v)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-50/50 transition-colors">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <h3 className="text-[13px] font-bold text-blue-900">
                    Sugestões da Análise de Estoque
                    {sugestoes.length > 0 && <span className="text-blue-600 ml-1.5">({sugestoes.length})</span>}
                  </h3>
                </div>
                <span className="text-[11px] text-blue-700">{showSugestoes ? '▼ Ocultar' : '▶ Mostrar'}</span>
              </button>
              {showSugestoes && (
                <div className="px-4 pb-4">
                  <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar produto..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 mb-3" />
                  {loadingAnalise ? (
                    <div className="text-center py-6 text-gray-500 text-sm gap-2 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando análise...
                    </div>
                  ) : sugestoes.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 text-sm">
                      Nenhum produto em ruptura/crítico/baixo.
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto bg-white rounded-lg border border-gray-200">
                      <table className="w-full text-[12px]">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">Produto</th>
                            <th className="text-center px-2 py-2 font-semibold text-gray-600">Status</th>
                            <th className="text-right px-2 py-2 font-semibold text-gray-600">Estoque</th>
                            <th className="text-right px-2 py-2 font-semibold text-gray-600">Cob. (dias)</th>
                            <th className="text-right px-2 py-2 font-semibold text-gray-600">Sugestão</th>
                            <th className="text-center px-2 py-2 font-semibold text-gray-600"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sugestoes.map(p => {
                            const st = STATUS_ESTOQUE[p.status] || STATUS_ESTOQUE.ok;
                            return (
                              <tr key={p.produto} className="border-t border-gray-100 hover:bg-blue-50/30">
                                <td className="px-3 py-1.5">
                                  <p className="font-medium text-gray-800">{p.produto_nome}</p>
                                  <p className="text-[10.5px] text-gray-400 font-mono">#{p.produto_codigo ?? p.produto}</p>
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <span className={`inline-block text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${st.cor}`}>
                                    {st.label}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNumero(p.estoque_atual)}</td>
                                <td className="px-2 py-1.5 text-right font-mono tabular-nums">{p.cobertura.toFixed(1)}</td>
                                <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold text-blue-700">
                                  {Math.ceil(p.sugestaoCompra)}
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <button onClick={() => adicionarSugestao(p)}
                                    className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 text-[10.5px] font-semibold">
                                    <Plus className="h-3 w-3" /> Add
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Itens do pedido */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-bold text-gray-800 flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" /> Itens do pedido
                {itens.length > 0 && <span className="text-gray-500">({itens.length})</span>}
              </h3>
              <button onClick={adicionarManual}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 px-3 py-1.5 text-[12px] font-semibold transition-colors">
                <Plus className="h-3.5 w-3.5" /> Adicionar manual
              </button>
            </div>

            {itens.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500">
                <ShoppingCart className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm">Nenhum item adicionado.</p>
                <p className="text-xs mt-1">Use sugestões acima ou adicione manualmente.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-visible">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600 w-28">Código</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Produto</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-600 w-24">Estoque</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-600 w-28">Qtd</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-600 w-32">Custo unit.</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-600 w-32">Total</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map(i => {
                      const total = Number(i.quantidadeSolicitada || 0) * Number(i.custoUnitario || 0);
                      const st = i.statusEstoque ? STATUS_ESTOQUE[i.statusEstoque] : null;
                      return (
                        <tr key={i._key} className="border-t border-gray-100">
                          <td className="px-2 py-1.5">
                            <span className="font-mono text-[11.5px] text-gray-600 block px-2 py-1 bg-gray-50 rounded border border-gray-100">
                              {i.produtoCodigo || '—'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            <button type="button"
                              onClick={() => setBuscaModalKey(i._key)}
                              className="w-full flex items-center gap-2 text-left rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 px-2 py-1.5 text-[12px] transition-colors">
                              <Search className="h-3 w-3 text-gray-400 flex-shrink-0" />
                              <span className={`flex-1 truncate ${i.produtoNome ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                {i.produtoNome || 'Clique pra buscar produto...'}
                              </span>
                            </button>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {st ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${st.cor}`}>
                                  {st.label}
                                </span>
                                <span className="text-[10.5px] text-gray-500 tabular-nums">{fmtNumero(i.estoqueAtual)}</span>
                              </div>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} value={i.quantidadeSolicitada}
                              onChange={e => atualizarItem(i._key, 'quantidadeSolicitada', Number(e.target.value) || 0)}
                              className="w-full text-right rounded border border-gray-200 px-2 py-1 text-[12px] font-mono tabular-nums focus:border-blue-400 focus:outline-none" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} step="0.01" value={i.custoUnitario}
                              onChange={e => atualizarItem(i._key, 'custoUnitario', Number(e.target.value) || 0)}
                              className="w-full text-right rounded border border-gray-200 px-2 py-1 text-[12px] font-mono tabular-nums focus:border-blue-400 focus:outline-none" />
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold text-gray-800">
                            {fmtMoeda(total)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button onClick={() => removerItem(i._key)}
                              className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={5} className="px-3 py-2 text-right font-bold text-gray-700 text-[11.5px] uppercase">Total geral</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums font-bold text-blue-700">{fmtMoeda(totalSolicitado)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {erro && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/40">
          <button onClick={onClose} disabled={salvando}
            className="text-[12.5px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50">
            Cancelar
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => salvar(false)} disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar rascunho
            </button>
            <button onClick={() => salvar(true)} disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar pra liberação
            </button>
          </div>
        </div>
      </div>

      {/* Modal de busca de fornecedor */}
      {buscaFornModal && (
        <ModalBuscaPessoa
          pessoas={pessoas}
          loading={loadingPessoas}
          onClose={() => setBuscaFornModal(false)}
          onSelect={(p) => {
            setFornecedor(p.pessoa_nome || '');
            setBuscaFornModal(false);
          }}
        />
      )}

      {/* Modal de busca de produto */}
      {buscaModalKey && (
        <ModalBuscaProduto
          produtos={catalogoMesclado}
          loading={loadingCatalogo}
          onClose={() => setBuscaModalKey(null)}
          onSelect={(p) => {
            // Código humano (`produto_codigo`) preferido; fallback pro grid se ausente
            atualizarItem(buscaModalKey, 'produtoCodigo', String(p.produto_codigo ?? p.produto));
            atualizarItem(buscaModalKey, 'produtoNome', p.produto_nome);
            atualizarItem(buscaModalKey, 'custoUnitario', Number(p.custo_unit || 0));
            atualizarItem(buscaModalKey, 'precoUnitario', Number(p.preco_unit || 0));
            atualizarItem(buscaModalKey, 'estoqueAtual', Number(p.estoque_atual || 0));
            atualizarItem(buscaModalKey, 'statusEstoque', p.status || null);
            atualizarItem(buscaModalKey, 'coberturaDias', Number(p.cobertura || 0));
            setBuscaModalKey(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Modal de busca de pessoa (fornecedor) ────────────────
function ModalBuscaPessoa({ pessoas, loading, onSelect, onClose }) {
  const [termo, setTermo] = useState('');

  const filtrados = useMemo(() => {
    // Normaliza pra busca tolerante a acento, caixa e espaços
    const norm = s => String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim();
    const t = norm(termo);
    if (!t) return pessoas.slice(0, 200);
    // Aceita várias palavras: cada palavra precisa aparecer (não precisa ser na ordem)
    const palavras = t.split(' ').filter(Boolean);
    return pessoas
      .filter(p => {
        const haystack = norm(
          [p.pessoa_nome, p.nome_reduzido, p.pessoa_codigo, p.cpf, p.cidade, p.estado]
            .filter(Boolean).join(' ')
        );
        return palavras.every(w => haystack.includes(w));
      })
      .slice(0, 200);
  }, [termo, pessoas]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Search className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-gray-900">Buscar fornecedor</h3>
              <p className="text-[11.5px] text-gray-500">
                {loading ? 'Carregando cadastro...' : `${pessoas.length.toLocaleString('pt-BR')} pessoa(s) cadastrada(s)`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input autoFocus value={termo} onChange={e => setTermo(e.target.value)}
              placeholder="Buscar por nome ou código..."
              className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2.5 text-[14px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-500 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">
              Nenhum fornecedor encontrado{termo ? ` para "${termo}"` : ''}.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtrados.map(p => (
                <button key={p.pessoa} type="button" onClick={() => onSelect(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors">
                  <p className="text-[13px] font-medium text-gray-800 truncate">{p.pessoa_nome || '—'}</p>
                  <div className="flex items-center gap-2 text-[10.5px] text-gray-400 mt-0.5 flex-wrap">
                    <span className="font-mono">#{p.pessoa_codigo ?? p.pessoa}</span>
                    {p.cpf && <span>· CPF/CNPJ {p.cpf}</span>}
                    {(p.cidade || p.estado) && (
                      <span>· {[p.cidade, p.estado].filter(Boolean).join('/')}</span>
                    )}
                  </div>
                </button>
              ))}
              {filtrados.length === 200 && (
                <p className="text-[11px] text-center text-gray-400 py-3 italic">
                  Mostrando os 200 primeiros — refine a busca pra ver mais.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal de busca de produto ─────────────────────────────
// Modal dedicado pra buscar produto no catálogo. Mais espaço pra
// visualizar dados (status, estoque, grupo) e melhor experiência em
// mobile/tablet.
function ModalBuscaProduto({ produtos, loading, onSelect, onClose }) {
  const [termo, setTermo] = useState('');

  const filtrados = useMemo(() => {
    // Normaliza pra busca tolerante a acento, caixa e espaços
    const norm = s => String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim();
    const t = norm(termo);
    if (!t) return produtos.slice(0, 200);
    const palavras = t.split(' ').filter(Boolean);
    return produtos
      .filter(p => {
        const haystack = norm(
          [p.produto_nome, p.produto_codigo, p.produto, p.grupo, p.subgrupo]
            .filter(Boolean).join(' ')
        );
        return palavras.every(w => haystack.includes(w));
      })
      .slice(0, 200);
  }, [termo, produtos]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Search className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-gray-900">Buscar produto</h3>
              <p className="text-[11.5px] text-gray-500">
                {loading ? 'Carregando catálogo...' : `${produtos.length.toLocaleString('pt-BR')} produto(s) no catálogo`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input autoFocus
              value={termo}
              onChange={e => setTermo(e.target.value)}
              placeholder="Buscar por nome, código, grupo..."
              className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2.5 text-[14px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-500 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando produtos...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">
              Nenhum produto encontrado{termo ? ` para "${termo}"` : ''}.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtrados.map(p => {
                const stCor = {
                  ruptura: 'bg-rose-100 text-rose-700',
                  critico: 'bg-amber-100 text-amber-700',
                  baixo:   'bg-yellow-100 text-yellow-700',
                  ok:      'bg-emerald-100 text-emerald-700',
                  excesso: 'bg-orange-100 text-orange-700',
                  parado:  'bg-gray-200 text-gray-700',
                  inativo: 'bg-gray-100 text-gray-500',
                }[p.status] || null;
                return (
                  <button
                    key={p.produto}
                    type="button"
                    onClick={() => onSelect(p)}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-800 truncate">{p.produto_nome || '—'}</p>
                        <div className="flex items-center gap-2 text-[10.5px] text-gray-400 mt-0.5 flex-wrap">
                          <span className="font-mono">#{p.produto_codigo ?? p.produto}</span>
                          {p.grupo && <span>· {p.grupo}</span>}
                          {p.subgrupo && p.subgrupo !== p.grupo && <span>· {p.subgrupo}</span>}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2 text-[10.5px]">
                        {stCor && (
                          <span className={`font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${stCor}`}>
                            {p.status}
                          </span>
                        )}
                        {p.estoque_atual != null && (
                          <span className="text-gray-500 tabular-nums">
                            Est. {Number(p.estoque_atual || 0).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filtrados.length === 200 && (
                <p className="text-[11px] text-center text-gray-400 py-3 italic">
                  Mostrando os 200 primeiros — refine a busca pra ver mais.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, obrigatorio, icone: Icone, children }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">
        {Icone && <Icone className="h-3 w-3 text-gray-400" />}
        {label}
        {obrigatorio && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
