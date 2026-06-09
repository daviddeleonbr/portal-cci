// Mascaramento de dados para o modo DEMO do portal cliente.
//
// Quando o admin acessa o portal do cliente via /admin/portal-demo, criamos
// uma sessão cliente marcada com `_demo: true`. Nesse modo, queremos que
// nomes reais (empresa, vendedores, fornecedores, clientes) sejam
// substituídos por nomes fictícios — mas os DADOS NUMÉRICOS reais (vendas,
// valores) permanecem, pra que apresentações comerciais reflitam a
// realidade do sistema.
//
// As substituições são DETERMINÍSTICAS: o mesmo ID/código sempre devolve
// o mesmo nome fictício durante a sessão. Garante consistência entre
// telas (vendedor "João" no dashboard é o mesmo "João" na produtividade).

import { getClienteSession } from '../lib/auth';

// ─── Listas de nomes fictícios ───────────────────────────────

export const REDES_FICTICIAS = [
  'Rede Alfa Combustíveis', 'Rede Bravo Petróleo', 'Rede Charlie Energia',
  'Rede Delta Postos', 'Rede Echo Auto Center', 'Rede Foxtrot Combustíveis',
  'Rede Golf Petróleo', 'Rede Hotel Auto', 'Rede India Postos',
  'Rede Juliet Energia', 'Rede Kilo Combustíveis', 'Rede Lima Auto',
  'Rede Mike Postos', 'Rede November Energia', 'Rede Oscar Combustíveis',
];

const EMPRESAS_FICTICIAS = [
  'Posto Central', 'Posto Praia', 'Posto Rodoviário',
  'Posto Aeroporto', 'Posto Marginal', 'Posto Estação',
  'Posto Norte', 'Posto Sul', 'Posto Leste', 'Posto Oeste',
  'Posto Litorâneo', 'Posto Saída A', 'Posto Saída B',
  'Posto Shopping', 'Posto Plaza', 'Posto Centro',
  'Posto Beira-Rio', 'Posto Vila Nova', 'Posto Jardim',
  'Posto Universitário',
];

const NOMES_VENDEDORES = [
  'João Silva Santos', 'Maria Oliveira Costa', 'Pedro Almeida Souza',
  'Ana Beatriz Lima', 'Carlos Eduardo Pereira', 'Juliana Ferreira Rocha',
  'Roberto Carvalho Mendes', 'Patrícia Gomes Ribeiro', 'Lucas Martins Alves',
  'Camila Rodrigues Dias', 'Fernando Barbosa Castro', 'Mariana Cardoso Pinto',
  'Rafael Nunes Moreira', 'Beatriz Teixeira Lopes', 'Diego Araújo Cunha',
  'Larissa Correia Vieira', 'Thiago Moura Andrade', 'Gabriela Freitas Bueno',
  'André Cavalcante Melo', 'Renata Borges Salles', 'Marcelo Pacheco Brito',
  'Vanessa Duarte Tavares', 'Ricardo Magalhães Faria', 'Tatiana Coelho Reis',
  'Bruno Siqueira Campos', 'Daniela Macedo Vargas', 'Felipe Aragão Pires',
  'Aline Sampaio Nogueira', 'Eduardo Veloso Branco', 'Cíntia Antunes Caldeira',
  'Wagner Lemos Tinoco', 'Priscila Fontes Veiga', 'Otávio Sales Bittencourt',
  'Letícia Furtado Maia', 'Gustavo Henrique Bezerra', 'Sandra Regina Padilha',
  'Anderson Quintana Bastos', 'Mônica Santana Coutinho', 'Vinícius Pádua Lacerda',
  'Helena Soares Câmara',
];

const FORNECEDORES_FICTICIOS = [
  'Petromax Distribuidora S.A.', 'Combustec Indústria Ltda', 'AutoSupply Brasil',
  'Lubrificantes Premium Ltda', 'Conveniência Express SA', 'Refinaria Nacional',
  'Distribuidora Sigma', 'AutoPeças Norte', 'Bebidas e Snacks Ltda',
  'Logística Vector', 'Combustíveis União', 'Pneus & Cia',
  'Atacadão Conveniência', 'Limpeza Profissional Ltda', 'Lubrax Distribuidora',
  'Auto Filtros Brasil', 'Snacks do Posto SA', 'Café Premium Ltda',
  'Águas Cristalinas', 'Refrigerantes do Sul', 'Gás Industrial SA',
  'Doces e Salgados Ltda', 'Auto Acessórios Brasil', 'Equip Posto Industrial',
  'Higiene Profissional', 'TI Sistemas Ltda', 'Telefonia Empresarial',
  'Energia Sustentável SA', 'Manutenção Total Ltda', 'Segurança Eletrônica',
];

const NOMES_CLIENTES = [
  'José Pereira da Silva', 'Mariana Costa Lima', 'Antônio Carlos Souza',
  'Helena Maria Alves', 'Frota Logística Ltda', 'Express Transportes SA',
  'Roberto Mendes', 'Sandra Regina', 'Multinacional Frota Ltda',
  'Construtora Beta SA', 'Cooperativa Agrícola', 'Locadora Rota Express',
];

// ─── Hash determinístico ─────────────────────────────────────

function hashFnv(s) {
  const str = String(s ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pickFromList(lista, idOuCodigo, fallback) {
  if (!Array.isArray(lista) || lista.length === 0) return fallback;
  const i = hashFnv(idOuCodigo) % lista.length;
  return lista[i];
}

// ─── API pública ─────────────────────────────────────────────

export function isDemoAtivo() {
  const session = getClienteSession();
  return !!session?._demo;
}

// Mascarar pelo TIPO e ID. Retorna o nome fictício se demo ativo, senão
// retorna o `fallback` (nome real). Use sempre o fallback como segundo
// argumento — assim a chamada é uma substituição segura.
export function mascarar(tipo, idOuCodigo, fallback = null) {
  if (!isDemoAtivo()) return fallback;
  switch (tipo) {
    case 'rede':        return pickFromList(REDES_FICTICIAS, idOuCodigo, fallback);
    case 'empresa':     return pickFromList(EMPRESAS_FICTICIAS, idOuCodigo, fallback);
    case 'funcionario':
    case 'vendedor':    return pickFromList(NOMES_VENDEDORES, idOuCodigo, fallback);
    case 'fornecedor':  return pickFromList(FORNECEDORES_FICTICIOS, idOuCodigo, fallback);
    case 'cliente':     return pickFromList(NOMES_CLIENTES, idOuCodigo, fallback);
    default:            return fallback;
  }
}

// Versão pra usar fora de hooks (lê session direto). Útil pra mascarar
// ANTES de salvar na sessão (ex: mascarar nomes das empresas no momento
// do acesso demo).
export function mascararEmpresa(empresa) {
  if (!empresa) return empresa;
  return { ...empresa, nome: pickFromList(EMPRESAS_FICTICIAS, empresa.id, empresa.nome), fantasia: pickFromList(EMPRESAS_FICTICIAS, empresa.id, empresa.fantasia) };
}

export function mascararRede(chaveApi) {
  if (!chaveApi) return chaveApi;
  return { ...chaveApi, nome: pickFromList(REDES_FICTICIAS, chaveApi.id, chaveApi.nome) };
}
