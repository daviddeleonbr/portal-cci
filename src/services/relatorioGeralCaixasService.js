// Relatório geral dos caixas (admin): busca os dados no sistema do cliente e monta
// o modelo (utils/relatorioGeralCaixas). As alterações vêm à parte, porque a
// auditoria demora mais e não deve segurar o resto do relatório.
import * as qualityApi from './qualityApiService';
import * as autosystemService from './autosystemService';
import * as sangriasService from './clienteSangriasService';
import * as contasBancariasService from './clienteContasBancariasService';
import { buscarAlteracoesCaixasWebposto } from './alteracoesCaixasWebpostoService';
import {
  alteracoesAutosystem, alteracoesWebposto, modeloAutosystem, modeloSangrias, modeloWebposto, sangriasAtuaisWebposto,
} from '../utils/relatorioGeralCaixas';

const LIMITE_LOG_AS = 10000; // teto da Edge autosystem-movto-flow
const ehAutosystem = (empresa) => !!empresa?.as_rede_id && !empresa?.chave_api_id;

export async function carregarRelatorio({ empresa, chave, de, ate }) {
  if (ehAutosystem(empresa)) {
    const rede = empresa.as_rede_id, cods = [empresa.empresa_codigo], periodo = { data_de: de, data_ate: ate };
    const [contas, gruposRede] = await Promise.all([
      autosystemService.listarContasCategorizadasRede(rede),
      autosystemService.listarGruposProdutoRede(rede),
    ]);
    // Contas de sobra/falta (algumas redes usam UMA conta, ex. 1.5 'SOBRA E FALTA', cadastrada
    // como falta): o lançamento que CREDITA nela é sobra (o PDV é debitado) e não pode cair
    // em Outras entradas; por isso entram as duas categorias.
    const sobras = (contas || []).filter(c => c.categoria === 'sobra_caixa' || c.categoria === 'falta_caixa').map(c => String(c.codigo));
    const [vendas, recebimentos, outrasEntradas] = await Promise.all([
      autosystemService.buscarVendasAutosystem(rede, cods, periodo),
      autosystemService.buscarRecebimentosAutosystem(rede, cods, { ...periodo, contas_creditar_extras: sobras }),
      autosystemService.buscarOutrasEntradasAutosystem(rede, cods, { ...periodo, contas_creditar_excluir: sobras }),
    ]);
    return modeloAutosystem({
      vendas, recebimentos, outrasEntradas,
      categoriaGrupo: new Map((gruposRede || []).filter(g => g.grid != null).map(g => [Number(g.grid), g.categoria])),
      categoriaConta: new Map((contas || []).filter(c => c.codigo).map(c => [String(c.codigo), c.categoria])),
    });
  }
  if (!chave) throw new Error('Chave da API não encontrada para esta rede.');
  const f = { dataInicial: de, dataFinal: ate, empresaCodigo: empresa.empresa_codigo };
  // Sem `.catch` nas vendas/itens: relatório incompleto não pode parecer completo.
  const [vendas, canceladas, itens, produtos, grupos, formas, caixas, apresentados, funcionarios, individuais, vales] = await Promise.all([
    qualityApi.buscarVendas(chave, { ...f, situacao: 'A' }),
    qualityApi.buscarVendas(chave, { ...f, situacao: 'C' }),
    qualityApi.buscarVendaItens(chave, { ...f, situacao: 'A' }),
    qualityApi.buscarProdutos(chave),
    qualityApi.buscarGrupos(chave),
    qualityApi.buscarVendaFormaPagamento(chave, f),
    qualityApi.buscarCaixas(chave, f),
    qualityApi.buscarCaixasApresentados(chave, f),
    qualityApi.buscarFuncionarios(chave),
    // Sobra/falta por funcionário; se falhar, a diferença fica com o responsável (com aviso)
    qualityApi.buscarCaixasIndividuais(chave, f).catch(e => { console.warn('[relatorio geral] caixas individuais', e); return null; }),
    // Caixa consolidado: a sobra/falta de cada funcionário vira vale (o fechamento fica zerado)
    qualityApi.buscarValesFuncionario(chave, f).catch(e => { console.warn('[relatorio geral] vales de funcionário', e); return null; }),
  ]);
  // A API ignora empresaCodigo em CAIXA_APRESENTADO
  const daEmpresa = (apresentados || []).filter(a => a.empresaCodigo === empresa.empresa_codigo);
  return modeloWebposto({
    vendas, canceladas, itens, produtos, grupos, formas, caixas, funcionarios, apresentados: daEmpresa,
    individuais: individuais || [], individuaisFalhou: individuais === null,
    vales: vales || [], valesFalhou: vales === null,
  });
}

// Sangrias por funcionário: contagem confirmada pelo cliente × valor atual no sistema.
// Falha ao consultar o sistema não esconde a contagem: as alterações ficam sem valor.
export async function carregarSangrias({ empresa, chave, de, ate }) {
  const [fechamentos, atuais] = await Promise.all([
    sangriasService.listarFechamentos({ clienteIds: [empresa.id], de, ate }),
    (ehAutosystem(empresa) ? atuaisAutosystem({ empresa, de, ate }) : atuaisWebposto({ empresa, chave, de, ate }))
      .catch(e => { console.warn('[relatorio geral] sangrias do sistema', e); return null; }),
  ]);
  return modeloSangrias({ fechamentos, atuais });
}

async function atuaisWebposto({ empresa, chave, de, ate }) {
  const contas = await contasBancariasService.listarParaSangria(empresa.chave_api_id);
  if (!contas?.length) return null; // nenhuma conta habilitada p/ sangrias: não dá para comparar
  const f = { dataInicial: de, dataFinal: ate, empresaCodigo: empresa.empresa_codigo };
  const [sangrias, caixas, funcionarios] = await Promise.all([
    qualityApi.buscarSangriasCaixa(chave, f), qualityApi.buscarCaixas(chave, f), qualityApi.buscarFuncionarios(chave),
  ]);
  return sangriasAtuaisWebposto({ sangrias, caixas, funcionarios, contas: new Set(contas.map(c => Number(c.conta_codigo))), de, ate });
}

async function atuaisAutosystem({ empresa, de, ate }) {
  const dias = [];
  for (let d = new Date(`${de}T12:00:00Z`); d <= new Date(`${ate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
  const saida = [];
  for (let i = 0; i < dias.length; i += 4) { // a Edge responde por dia: de 4 em 4
    const partes = await Promise.all(dias.slice(i, i + 4).map(dia => autosystemService.buscarSangriasDia(empresa.as_rede_id, empresa.empresa_codigo, dia).then(rows => [dia, rows])));
    partes.forEach(([dia, rows]) => {
      const m = new Map();
      (rows || []).forEach(r => {
        const func = r.pessoa_codigo != null ? String(r.pessoa_codigo) : `nome:${r.pessoa_nome || '—'}`;
        const g = m.get(func) || { dia, func, caixa: null, nome: r.pessoa_nome || 'Funcionário', turno: '', ordem: 99, valor: 0 };
        g.valor = Math.round((g.valor + (Number(r.valor) || 0)) * 100) / 100;
        m.set(func, g);
      });
      saida.push(...m.values());
    });
  }
  return saida;
}

// → { lista, incompleta }
export async function carregarAlteracoes({ empresa, chave, de, ate }) {
  if (ehAutosystem(empresa)) {
    const rede = empresa.as_rede_id;
    // Como na aba Alterações: lançamentos de sobra/falta de caixa ficam de fora
    const contas = await autosystemService.listarContasCategorizadasRede(rede);
    const { alteracoes } = await autosystemService.buscarMovtoFlowAutosystem(rede, [Number(empresa.empresa_codigo)], {
      data_de: de, data_ate: ate, limit: LIMITE_LOG_AS,
      contas_excluidas: (contas || []).filter(c => c.categoria === 'sobra_caixa' || c.categoria === 'falta_caixa').map(c => String(c.codigo)),
    });
    return { lista: alteracoesAutosystem(alteracoes || []), incompleta: (alteracoes || []).length >= LIMITE_LOG_AS };
  }
  const itens = await buscarAlteracoesCaixasWebposto({ chave, empresaCodigo: empresa.empresa_codigo, de, ate });
  return { lista: alteracoesWebposto(itens), incompleta: false };
}
