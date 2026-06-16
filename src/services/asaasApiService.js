// ─── Asaas API client ───────────────────────────────────────
// Via Vite proxy: /api/asaas-sandbox -> api-sandbox.asaas.com/v3
//                 /api/asaas         -> api.asaas.com/v3
//
// Docs: https://docs.asaas.com/reference

function getBaseUrl(ambiente) {
  return ambiente === 'producao' ? '/api/asaas' : '/api/asaas-sandbox';
}

async function request(ambiente, apiKey, method, endpoint, body = null, queryParams = null) {
  const url = new URL(`${getBaseUrl(ambiente)}${endpoint}`, window.location.origin);
  if (queryParams) {
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url.pathname + url.search, options);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// ─── Connection test ────────────────────────────────────────
export async function testarConexao(ambiente, apiKey) {
  return request(ambiente, apiKey, 'GET', '/finance/balance');
}

// ─── Customers ──────────────────────────────────────────────
export async function listarCustomers(ambiente, apiKey, { limit = 50, offset = 0, name, cpfCnpj } = {}) {
  return request(ambiente, apiKey, 'GET', '/customers', null, { limit, offset, name, cpfCnpj });
}

export async function criarCustomer(ambiente, apiKey, { name, cpfCnpj, email, phone, mobilePhone, address, addressNumber, complement, province, postalCode, city, state, externalReference, notificationDisabled }) {
  return request(ambiente, apiKey, 'POST', '/customers', {
    name, cpfCnpj, email, phone, mobilePhone,
    address, addressNumber, complement, province, postalCode,
    city, state, externalReference, notificationDisabled,
  });
}

// PUT /customers/:id — atualiza apenas os campos passados.
export async function atualizarCustomer(ambiente, apiKey, customerId, campos) {
  return request(ambiente, apiKey, 'PUT', `/customers/${customerId}`, campos);
}

export async function buscarCustomer(ambiente, apiKey, customerId) {
  if (!customerId) return null;
  return request(ambiente, apiKey, 'GET', `/customers/${customerId}`);
}

export async function buscarCustomerPorCnpj(ambiente, apiKey, cpfCnpj) {
  const res = await listarCustomers(ambiente, apiKey, { cpfCnpj, limit: 1 });
  return res?.data?.[0] || null;
}

// Calcula o diff entre o que TEMOS (nosso) e o que ESTÁ no Asaas (deles).
// Regra: só sobrescreve quando temos valor preenchido. Campo vazio do
// nosso lado NÃO apaga o que está lá (evita perder dado bom).
//
// Comparação tolerante: trim em string, normaliza dígitos em CEP/CPF,
// considera null/undefined/'' como iguais entre si.
function _norm(v)   { return v == null ? '' : String(v).trim(); }
function _digits(v) { return _norm(v).replace(/\D/g, ''); }

export function diffCustomer(nosso, deles) {
  const update = {};
  const pares = [
    ['email',         _norm(nosso.email),                  _norm(deles?.email)],
    ['address',       _norm(nosso.address),                _norm(deles?.address)],
    ['addressNumber', _norm(nosso.addressNumber),          _norm(deles?.addressNumber)],
    ['complement',    _norm(nosso.complement),             _norm(deles?.complement)],
    ['province',      _norm(nosso.province),               _norm(deles?.province)],
    ['city',          _norm(nosso.city),                   _norm(deles?.city)],
    ['state',         _norm(nosso.state),                  _norm(deles?.state)],
    ['postalCode',    _digits(nosso.postalCode),           _digits(deles?.postalCode)],
    ['phone',         _digits(nosso.phone),                _digits(deles?.phone)],
    ['mobilePhone',   _digits(nosso.mobilePhone),          _digits(deles?.mobilePhone)],
  ];
  for (const [campo, novo, atual] of pares) {
    if (novo && novo !== atual) update[campo] = nosso[campo];
  }
  return update;
}

export async function encontrarOuCriarCustomer(ambiente, apiKey, clienteData) {
  const limpo = (clienteData.cpfCnpj || '').replace(/\D/g, '');
  if (limpo) {
    const existente = await buscarCustomerPorCnpj(ambiente, apiKey, limpo);
    if (existente) {
      // Sincroniza endereço/contato se houver divergência
      const update = diffCustomer(clienteData, existente);
      if (Object.keys(update).length > 0) {
        try {
          return await atualizarCustomer(ambiente, apiKey, existente.id, update);
        } catch {
          // Se a atualização falhar, mantém o customer existente
          // (não bloqueia a emissão por causa de sync de endereço)
          return existente;
        }
      }
      return existente;
    }
  }
  return criarCustomer(ambiente, apiKey, { ...clienteData, cpfCnpj: limpo });
}

// ─── Municipal Services (servicos municipais do prefeitura) ─
export async function listarMunicipalServices(ambiente, apiKey, { description, limit = 50, offset = 0 } = {}) {
  return request(ambiente, apiKey, 'GET', '/invoices/municipalServices', null, { description, limit, offset });
}

// ─── Invoices (NFS-e) ───────────────────────────────────────
export async function listarInvoices(ambiente, apiKey, { status, customer, effectiveDate, limit = 20, offset = 0 } = {}) {
  return request(ambiente, apiKey, 'GET', '/invoices', null, { status, customer, effectiveDate, limit, offset });
}

export async function buscarInvoice(ambiente, apiKey, id) {
  return request(ambiente, apiKey, 'GET', `/invoices/${id}`);
}

// Criar NFS-e (nao emite ainda, fica como SCHEDULED ate effectiveDate).
// Suporta o NOVO formato Portal Nacional NFS-e (PNFS-e) via `nationalServiceCode`
// (ex: "17.03.03" — código NBS). Mantém compat com os campos municipais
// legados — só envia os que estiverem preenchidos.
export async function criarInvoice(ambiente, apiKey, {
  customer,
  serviceDescription,
  observations,
  value,
  deductions = 0,
  effectiveDate,
  // ─── Portal Nacional ───────────────────────
  nationalServiceCode,        // ex: "17.03.03"
  serie,                      // Série da NF (1-6 alfanuméricos, ex: "1" ou "NFS-E")
  // ─── Compat municipal (mesmo no Portal Nacional, Asaas ainda exige) ─
  municipalServiceId,
  municipalServiceCode,
  municipalServiceName,
  municipalServiceDescription,
  // impostos retidos (%)
  taxes = null,  // { retainedIss, iss, cofins, csll, inss, ir, pis }
  externalReference,
}) {
  const payload = {
    customer, serviceDescription, observations, value, deductions, effectiveDate,
    taxes, externalReference,
  };
  // Portal Nacional tem prioridade quando preenchido
  if (nationalServiceCode) payload.nationalServiceCode = nationalServiceCode;
  if (serie)               payload.serie = serie;
  if (municipalServiceId)          payload.municipalServiceId          = municipalServiceId;
  if (municipalServiceCode)        payload.municipalServiceCode        = municipalServiceCode;
  if (municipalServiceName)        payload.municipalServiceName        = municipalServiceName;
  if (municipalServiceDescription) payload.municipalServiceDescription = municipalServiceDescription;
  return request(ambiente, apiKey, 'POST', '/invoices', payload);
}

// Cancelar uma NFS-e
export async function cancelarInvoice(ambiente, apiKey, id, reason = 'Cancelamento solicitado') {
  return request(ambiente, apiKey, 'POST', `/invoices/${id}/cancel`, {
    description: reason,
  });
}

// Autorizar/emitir uma NFS-e agendada imediatamente
export async function autorizarInvoice(ambiente, apiKey, id) {
  return request(ambiente, apiKey, 'POST', `/invoices/${id}/authorize`);
}
