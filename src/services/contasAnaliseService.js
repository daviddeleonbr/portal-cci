// Flags de contas marcadas para Analise de Lancamentos.
// scopeId e o identificador do escopo: chave_api_id (rede webposto) ou cliente.id (manual).
// Persiste em localStorage como { [codigoConta]: { codigo, descricao, hierarquia } }.

const KEY = (scopeId) => `contas_analise_flags:${scopeId}`;

export function listarFlags(scopeId) {
  if (!scopeId) return {};
  try {
    const raw = localStorage.getItem(KEY(scopeId));
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

export function salvarFlags(scopeId, flags) {
  if (!scopeId) return;
  try {
    localStorage.setItem(KEY(scopeId), JSON.stringify(flags || {}));
  } catch (_) { /* ignore */ }
}

export function toggleFlag(scopeId, conta) {
  const flags = listarFlags(scopeId);
  const codigo = String(conta.codigo);
  if (flags[codigo]) delete flags[codigo];
  else flags[codigo] = { codigo, descricao: conta.descricao, hierarquia: conta.hierarquia, recorrente: false };
  salvarFlags(scopeId, flags);
  return flags;
}

// Alterna a marcacao de "recorrencia mensal obrigatoria" de uma conta ja flagada.
// Retorna o novo objeto de flags.
export function toggleRecorrencia(scopeId, contaCodigo) {
  const flags = listarFlags(scopeId);
  const codigo = String(contaCodigo);
  if (!flags[codigo]) return flags;
  flags[codigo] = { ...flags[codigo], recorrente: !flags[codigo].recorrente };
  salvarFlags(scopeId, flags);
  return flags;
}

export function isFlagged(scopeId, contaCodigo) {
  const flags = listarFlags(scopeId);
  return !!flags[String(contaCodigo)];
}

export function contagem(scopeId) {
  return Object.keys(listarFlags(scopeId)).length;
}

// Resolve o escopo correto a partir de um cliente (webposto → chave_api_id, manual → cliente.id)
export function scopeDoCliente(cliente) {
  if (!cliente) return null;
  if (cliente.usa_webposto && cliente.chave_api_id) return cliente.chave_api_id;
  return cliente.id;
}
