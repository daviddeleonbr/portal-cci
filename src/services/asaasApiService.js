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

export async function buscarCustomerPorCnpj(ambiente, apiKey, cpfCnpj) {
  const res = await listarCustomers(ambiente, apiKey, { cpfCnpj, limit: 1 });
  return res?.data?.[0] || null;
}

export async function encontrarOuCriarCustomer(ambiente, apiKey, clienteData) {
  const limpo = (clienteData.cpfCnpj || '').replace(/\D/g, '');
  if (limpo) {
    const existente = await buscarCustomerPorCnpj(ambiente, apiKey, limpo);
    if (existente) return existente;
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

// Criar NFS-e (nao emite ainda, fica como SCHEDULED ate effectiveDate)
// Campos obrigatorios: customer, serviceDescription, value, effectiveDate, municipalServiceCode/Id/Name
export async function criarInvoice(ambiente, apiKey, {
  customer,
  serviceDescription,
  observations,
  value,
  deductions = 0,
  effectiveDate,
  municipalServiceId,
  municipalServiceCode,
  municipalServiceName,
  // impostos retidos (%)
  taxes = null,  // { retainedIss, iss, cofins, csll, inss, ir, pis }
  externalReference,
}) {
  return request(ambiente, apiKey, 'POST', '/invoices', {
    customer,
    serviceDescription,
    observations,
    value,
    deductions,
    effectiveDate,
    municipalServiceId,
    municipalServiceCode,
    municipalServiceName,
    taxes,
    externalReference,
  });
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
