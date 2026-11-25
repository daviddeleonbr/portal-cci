// Seleção rede → empresa das consultas do admin (Sangrias, Relatório geral).
// selecao = { rede: { tipo, id } | null, empresa: '' | TODAS | <id> }
export const TODAS_DA_REDE = 'todas';
export const SELECAO_VAZIA = { rede: null, empresa: '' };

const nomeEmp = (c) => c?.nome || c?.razao_social || 'Empresa';

export function empresasDaRede(empresas, rede) {
  if (!rede) return [];
  return (empresas || [])
    .filter(c => (rede.tipo === 'webposto' ? c.chave_api_id === rede.id : rede.tipo === 'autosystem' ? c.as_rede_id === rede.id : false))
    .sort((a, b) => nomeEmp(a).localeCompare(nomeEmp(b)));
}

// Ids a consultar; null = ainda falta escolher a rede ou a empresa.
export function idsDaSelecao(empresas, selecao) {
  if (!selecao?.rede || !selecao.empresa) return null;
  return selecao.empresa === TODAS_DA_REDE ? empresasDaRede(empresas, selecao.rede).map(e => e.id) : [selecao.empresa];
}
