// Consultoria > Análise de cartões: busca as baixas e as vendas no cartão do período
// e monta o modelo (utils/analiseCartoes). Webposto pela API da Quality; Autosystem
// pela Edge autosystem-cartoes-baixas.
import * as qualityApi from './qualityApiService';
import * as autosystemService from './autosystemService';
import { classificarItem } from './mapeamentoVendasService';
import { modeloAutosystem, modeloWebposto } from '../utils/analiseCartoes';

// empresas: as do escopo (uma ou todas da rede, mesma rede). chave: chave da API (Webposto).
export async function carregarAnaliseCartoes({ empresas, chave, de, ate }) {
  if (!empresas?.length) throw new Error('Selecione a empresa.');
  const ehAutosystem = !!empresas[0].as_rede_id && !empresas[0].chave_api_id;
  return ehAutosystem ? autosystem({ empresas, de, ate }) : webposto({ empresas, chave, de, ate });
}

async function autosystem({ empresas, de, ate }) {
  const rede = empresas[0].as_rede_id;
  const [contas, grupos] = await Promise.all([
    autosystemService.listarContasCategorizadasRede(rede),
    autosystemService.listarGruposProdutoRede(rede),
  ]);
  const contasCartao = (contas || []).filter(c => c.categoria === 'cartao_pix').map(c => String(c.codigo));
  if (!contasCartao.length) {
    throw new Error('Nenhuma conta desta rede está classificada como Cartão/PIX. Classifique as contas em Parâmetros para analisar os cartões.');
  }
  const { dias, produtos } = await autosystemService.buscarBaixasCartoesAutosystem(rede, empresas.map(e => e.empresa_codigo), {
    data_de: de, data_ate: ate, contasCartao,
  });
  return modeloAutosystem({
    dias, produtos,
    categoriaGrupo: new Map((grupos || []).filter(g => g.grid != null).map(g => [Number(g.grid), g.categoria])),
  });
}

async function webposto({ empresas, chave, de, ate }) {
  if (!chave) throw new Error('Chave da API não encontrada para esta rede.');
  const [produtos, grupos] = await Promise.all([qualityApi.buscarProdutos(chave), qualityApi.buscarGrupos(chave)]);
  const prods = new Map((produtos || []).map(p => [p.produtoCodigo || p.codigo, p]));
  const grps = new Map((grupos || []).map(g => [g.grupoCodigo || g.codigo, g]));
  // Uma empresa por vez (a API filtra por empresaCodigo); as administradoras são as da rede.
  const partes = await Promise.all(empresas.map(async (e) => {
    const f = { dataInicial: de, dataFinal: ate, empresaCodigo: e.empresa_codigo };
    const [remessas, cartoes, itens] = await Promise.all([
      qualityApi.buscarCartaoRemessa(chave, f),
      qualityApi.buscarCartoes(chave, f),
      // Híbrido: dias antigos do cache no Supabase, recentes da API (período longo fica rápido)
      qualityApi.buscarVendaItensHibrido(chave, { ...f, situacao: 'A', chaveApiId: e.chave_api_id }),
    ]);
    const daEmpresa = (l) => (l || []).filter(x => x.empresaCodigo == null || Number(x.empresaCodigo) === Number(e.empresa_codigo));
    return { remessas: daEmpresa(remessas), cartoes: daEmpresa(cartoes), itens: daEmpresa(itens) };
  }));
  return modeloWebposto({
    remessas: partes.flatMap(p => p.remessas),
    cartoes: partes.flatMap(p => p.cartoes),
    itens: partes.flatMap(p => p.itens),
    ehCombustivel: (i) => classificarItem(i, prods, grps) === 'combustivel',
    de, ate,
  });
}
