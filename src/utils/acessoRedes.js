// Redes e empresas que um admin N1 acessa (cci_usuarios_sistema.acesso_redes,
// migration 238). null = todas (inclusive futuras). Senão:
//   { chaves_api: [id], as_redes: [id], empresas: [id] }
//   rede na lista = rede inteira (pega empresas cadastradas depois);
//   empresas = empresas avulsas de redes que não estão inteiras.
// `rede` aqui é { id, tipo: 'wp' | 'as', nome, empresas: [{ id, nome }] }.

const campoRede = (tipo) => (tipo === 'wp' ? 'chaves_api' : 'as_redes');

export function normalizarAcesso(a) {
  if (!a) return null;
  return {
    chaves_api: [...new Set(a.chaves_api || [])],
    as_redes: [...new Set(a.as_redes || [])],
    empresas: [...new Set(a.empresas || [])],
  };
}

export const acessoVazio = () => ({ chaves_api: [], as_redes: [], empresas: [] });

// Todas as redes inteiras (ponto de partida ao sair de "todas": nada some de imediato).
export function acessoTodasRedes(redes) {
  return {
    chaves_api: redes.filter(r => r.tipo === 'wp').map(r => r.id),
    as_redes: redes.filter(r => r.tipo === 'as').map(r => r.id),
    empresas: [],
  };
}

export function redeInteira(acesso, rede) {
  return !acesso || (acesso[campoRede(rede.tipo)] || []).includes(rede.id);
}

export function empresaVisivel(acesso, rede, empresaId) {
  return redeInteira(acesso, rede) || (acesso.empresas || []).includes(empresaId);
}

// 'inteira' | 'parcial' | 'nenhuma'
export function estadoRede(acesso, rede) {
  if (redeInteira(acesso, rede)) return 'inteira';
  return rede.empresas.some(e => acesso.empresas.includes(e.id)) ? 'parcial' : 'nenhuma';
}

const semEmpresasDa = (lista, rede) => {
  const ids = new Set(rede.empresas.map(e => e.id));
  return lista.filter(id => !ids.has(id));
};

// Marca/desmarca a rede inteira. Ao marcar, as avulsas dela somem (a rede cobre).
export function alternarRede(acesso, rede) {
  const a = normalizarAcesso(acesso) || acessoVazio();
  const campo = campoRede(rede.tipo);
  const inteira = a[campo].includes(rede.id);
  const parcial = !inteira && rede.empresas.some(e => a.empresas.includes(e.id));
  a.empresas = semEmpresasDa(a.empresas, rede);
  a[campo] = (inteira || parcial) ? a[campo].filter(id => id !== rede.id) : [...a[campo], rede.id];
  return a;
}

// Marca/desmarca uma empresa. Se a rede estava inteira, vira "todas menos esta"
// (perde as futuras). Marcar todas à mão NÃO promove a rede inteira.
export function alternarEmpresa(acesso, rede, empresaId) {
  const a = normalizarAcesso(acesso) || acessoVazio();
  const campo = campoRede(rede.tipo);
  if (a[campo].includes(rede.id)) {
    a[campo] = a[campo].filter(id => id !== rede.id);
    a.empresas = [...semEmpresasDa(a.empresas, rede), ...rede.empresas.map(e => e.id).filter(id => id !== empresaId)];
    return a;
  }
  a.empresas = a.empresas.includes(empresaId) ? a.empresas.filter(id => id !== empresaId) : [...a.empresas, empresaId];
  return a;
}

export function contarAcesso(acesso, redes) {
  if (!acesso) return null;
  const inteiras = redes.filter(r => redeInteira(acesso, r)).length;
  const avulsas = redes.filter(r => !redeInteira(acesso, r))
    .reduce((n, r) => n + r.empresas.filter(e => acesso.empresas.includes(e.id)).length, 0);
  return { inteiras, avulsas, total: inteiras + avulsas };
}

const chave = (a) => {
  const n = normalizarAcesso(a);
  return n ? JSON.stringify([n.chaves_api.sort(), n.as_redes.sort(), n.empresas.sort()]) : 'todas';
};
export const acessoIgual = (a, b) => chave(a) === chave(b);

// Diferenças legíveis entre dois acessos: { adicionadas: [texto], removidas: [texto] }.
export function diffAcesso(antes, depois, redes) {
  const adicionadas = [];
  const removidas = [];
  if (acessoIgual(antes, depois)) return { adicionadas, removidas };
  if (!depois) return { adicionadas: ['Todas as redes e empresas, inclusive as cadastradas depois'], removidas };
  if (!antes) removidas.push('Todas as redes e empresas (passa a ver só as selecionadas)');
  for (const r of redes) {
    const ea = antes ? estadoRede(antes, r) : 'inteira';
    const ed = estadoRede(depois, r);
    if (ea === ed && ea !== 'parcial') continue;
    if (ea === 'inteira' && ed !== 'inteira') removidas.push(`${r.nome} (rede inteira)`);
    if (ed === 'inteira' && ea !== 'inteira') adicionadas.push(`${r.nome} (rede inteira)`);
    // empresas: só quando a rede não foi marcada/desmarcada por completo
    if ((ea === 'inteira' && ed === 'nenhuma') || (ea === 'nenhuma' && ed === 'inteira')) continue;
    if (ed === 'inteira') continue;
    for (const e of r.empresas) {
      const va = !antes || empresaVisivel(antes, r, e.id);
      const vd = empresaVisivel(depois, r, e.id);
      if (va && !vd) removidas.push(`Empresa ${e.nome}`);
      if (!va && vd) adicionadas.push(`Empresa ${e.nome}`);
    }
  }
  return { adicionadas, removidas };
}
