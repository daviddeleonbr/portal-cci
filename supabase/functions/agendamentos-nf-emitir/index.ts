// ============================================================
// Edge Function: agendamentos-nf-emitir
//
// Disparada pelo pg_cron 1×/dia. Lê os agendamentos ATIVOS cuja
// proxima_emissao <= hoje e emite a NFS-e correspondente no Asaas,
// salvando o resultado no cache local (notas_fiscais_asaas).
//
// Em cada agendamento:
//   1. encontra ou cria o customer no Asaas (por CNPJ)
//   2. cria a invoice (NFS-e Portal Nacional, NBS)
//   3. grava a nota no cache local
//   4. atualiza o agendamento (ultima_emissao = hoje → trigger recalcula
//      proxima_emissao pro próximo mês)
//
// Falhas individuais NÃO param as outras — cada agendamento tem o
// próprio try/catch e o erro fica gravado em ultimo_erro pro admin
// ver na UI.
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function asaasBaseUrl(ambiente: string): string {
  return ambiente === 'producao'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

async function asaasRequest(
  ambiente: string,
  apiKey: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
  query?: Record<string, string>,
) {
  const url = new URL(asaasBaseUrl(ambiente) + endpoint);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const resp = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json', 'access_token': apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    const msg = data?.errors?.[0]?.description || data?.message || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}

// Helpers de normalização pra comparar campos sem barulho de formatação
const _norm   = (v: unknown) => v == null ? '' : String(v).trim();
const _digits = (v: unknown) => _norm(v).replace(/\D/g, '');

// Retorna só os campos que precisam ser atualizados. Vazio do nosso
// lado NÃO sobrescreve o que está no Asaas (preserva dado bom).
function diffCustomer(nosso: Record<string, unknown>, deles: any): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const pares: Array<[string, string, string]> = [
    ['email',         _norm(nosso.email),         _norm(deles?.email)],
    ['address',       _norm(nosso.address),       _norm(deles?.address)],
    ['addressNumber', _norm(nosso.addressNumber), _norm(deles?.addressNumber)],
    ['province',      _norm(nosso.province),      _norm(deles?.province)],
    ['city',          _norm(nosso.city),          _norm(deles?.city)],
    ['state',         _norm(nosso.state),         _norm(deles?.state)],
    ['postalCode',    _digits(nosso.postalCode),  _digits(deles?.postalCode)],
  ];
  for (const [campo, novo, atual] of pares) {
    if (novo && novo !== atual) update[campo] = nosso[campo];
  }
  return update;
}

async function encontrarOuCriarCustomer(
  ambiente: string,
  apiKey: string,
  ag: any,
): Promise<{ id: string; name: string; cpfCnpj: string }> {
  const cnpj = String(ag.cliente_cnpj || '').replace(/\D/g, '');
  const cep  = String(ag.cliente_cep  || '').replace(/\D/g, '');

  // Payload que reflete os dados que TEMOS no agendamento
  const nosso = {
    name:          ag.cliente_nome,
    email:         ag.cliente_email   || undefined,
    postalCode:    cep                || undefined,
    address:       ag.cliente_endereco|| undefined,
    addressNumber: ag.cliente_numero  || undefined,
    province:      ag.cliente_bairro  || undefined,
    city:          ag.cliente_cidade  || undefined,
    state:         ag.cliente_estado  || undefined,
  };

  // 1) tenta achar por CNPJ
  if (cnpj) {
    const lista = await asaasRequest(ambiente, apiKey, 'GET', '/customers', undefined, {
      cpfCnpj: cnpj, limit: '1',
    });
    const existente = lista?.data?.[0];
    if (existente) {
      // Sincroniza endereço/email se divergir do que temos
      const update = diffCustomer(nosso, existente);
      if (Object.keys(update).length > 0) {
        try {
          return await asaasRequest(ambiente, apiKey, 'PUT', `/customers/${existente.id}`, update);
        } catch {
          // Sync é best-effort — não bloqueia emissão por causa disso
          return existente;
        }
      }
      return existente;
    }
  }
  // 2) cria do zero
  return asaasRequest(ambiente, apiKey, 'POST', '/customers', {
    ...nosso,
    cpfCnpj: cnpj || undefined,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return json({ error: 'Método não permitido' }, 405);

  const supaUrl = Deno.env.get('SUPABASE_URL');
  const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supaUrl || !supaKey) {
    return json({ error: 'SUPABASE_URL/SERVICE_ROLE_KEY não configurados' }, 500);
  }
  const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

  const hoje = new Date().toISOString().slice(0, 10);

  // 1) Lista agendamentos devidos
  const { data: agendamentos, error: errAg } = await supabase
    .from('agendamentos_nf')
    .select('*')
    .eq('ativo', true)
    .lte('proxima_emissao', hoje);
  if (errAg) return json({ error: 'Falha ao listar agendamentos', detail: errAg.message }, 500);

  if (!agendamentos || agendamentos.length === 0) {
    return json({ ok: true, total: 0, mensagem: 'Nenhum agendamento devido hoje.' });
  }

  // 2) Cache de configs (Asaas) pra evitar buscar a mesma config várias vezes
  const configsCache = new Map<string, any>();
  async function getConfig(configId: string) {
    if (configsCache.has(configId)) return configsCache.get(configId);
    const { data, error } = await supabase
      .from('configuracoes_asaas')
      .select('*')
      .eq('id', configId)
      .single();
    if (error) throw new Error(`Config ${configId} não encontrada: ${error.message}`);
    configsCache.set(configId, data);
    return data;
  }

  const resultados: any[] = [];
  let sucessos = 0;
  let falhas   = 0;

  for (const ag of agendamentos) {
    try {
      const config = await getConfig(ag.config_id);
      if (!config?.api_key) throw new Error('Configuração Asaas sem api_key');

      // Customer (encontra ou cria)
      const customer = await encontrarOuCriarCustomer(config.ambiente, config.api_key, ag);

      // Espelha customer no cache local
      await supabase.from('asaas_customers').upsert({
        config_id: config.id,
        asaas_customer_id: customer.id,
        cliente_nome: customer.name,
        cliente_cnpj: customer.cpfCnpj,
        email: ag.cliente_email || null,
      }, { onConflict: 'config_id,asaas_customer_id' });

      // Monta payload da invoice (mesmo formato do front)
      const codigoNbs    = String(ag.national_service_code || config.national_service_code || '').trim();
      if (!codigoNbs) throw new Error('NBS não informado no agendamento nem na config');
      // Descrição do serviço municipal — Asaas obriga mesmo no Portal Nacional
      const descricaoNbs = String(
        ag.descricao || config.municipio_servico_descricao || 'Serviços prestados'
      ).slice(0, 250);

      const payload: Record<string, unknown> = {
        customer: customer.id,
        serviceDescription: ag.descricao,
        observations: ag.observacoes || config.observacoes_padrao || '',
        value: Number(ag.valor),
        deductions: Number(ag.deducoes || 0),
        effectiveDate: hoje,
        nationalServiceCode:         codigoNbs,
        municipalServiceCode:        codigoNbs,
        municipalServiceName:        descricaoNbs,
        municipalServiceDescription: descricaoNbs,
        serie: ag.serie || config.serie || '1',
        taxes: {
          iss: Number(ag.aliquota_iss ?? config.aliquota_iss ?? 0),
          retainedIss: false,
        },
        externalReference: `agendamento:${ag.id}`,
      };

      const invoice = await asaasRequest(config.ambiente, config.api_key, 'POST', '/invoices', payload);

      // Salva no cache local
      await supabase.from('notas_fiscais_asaas').upsert({
        config_id: config.id,
        asaas_invoice_id: invoice.id,
        numero: invoice.number || null,
        cliente_nome: customer.name,
        cliente_cnpj: customer.cpfCnpj,
        valor: invoice.value || ag.valor,
        valor_iss:    invoice.taxes?.iss    || 0,
        valor_pis:    invoice.taxes?.pis    || 0,
        valor_cofins: invoice.taxes?.cofins || 0,
        valor_inss:   invoice.taxes?.inss   || 0,
        valor_ir:     invoice.taxes?.ir     || 0,
        valor_csll:   invoice.taxes?.csll   || 0,
        data_emissao: invoice.effectiveDate || hoje,
        status: invoice.status || 'PENDING',
        servico_descricao: invoice.serviceDescription || ag.descricao,
        observacoes: invoice.observations || null,
        pdf_url: invoice.pdfUrl || null,
        xml_url: invoice.xmlUrl || null,
        erro_mensagem: invoice.statusDescription || null,
        raw_json: invoice,
      }, { onConflict: 'config_id,asaas_invoice_id' });

      // Atualiza agendamento — trigger no banco recalcula proxima_emissao
      await supabase
        .from('agendamentos_nf')
        .update({
          ultima_emissao: hoje,
          notas_emitidas: (ag.notas_emitidas || 0) + 1,
          ultimo_erro: null,
        })
        .eq('id', ag.id);

      sucessos++;
      resultados.push({ id: ag.id, cliente: ag.cliente_nome, status: 'ok', invoice_id: invoice.id });
    } catch (err: any) {
      falhas++;
      const msg = err?.message || String(err);
      // Marca o erro no agendamento (mas mantém ativo — tenta de novo amanhã)
      await supabase
        .from('agendamentos_nf')
        .update({ ultimo_erro: msg.slice(0, 500) })
        .eq('id', ag.id);
      resultados.push({ id: ag.id, cliente: ag.cliente_nome, status: 'erro', erro: msg });
    }
  }

  return json({
    ok: true,
    total: agendamentos.length,
    sucessos,
    falhas,
    resultados,
  });
});
