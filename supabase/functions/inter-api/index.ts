// inter-api — Banco Inter (API PJ) da PRÓPRIA CCI. Não é usado por clientes.
// ============================================================
// A API do Inter exige mTLS (certificado .crt + chave .key da integração) +
// OAuth2 client_credentials — impossível no navegador. Esta função:
//   - autoriza SÓ admin com a permissão 'banco_inter';
//   - lê client_secret/certificado/chave do Vault (service_role) — nunca
//     devolve segredo ao navegador;
//   - reaproveita o token (vale 1h; o Inter limita ~5 emissões/min);
//   - grava a cópia local do extrato (a API de extrato limita ~10 chamadas/min).
//
// Body: { acao, ...params }
//   status                 → dados da conta (sem segredos)
//   salvar_config          → { nome?, ambiente?, conta_corrente?, client_id, client_secret?, cert?, key? }
//   testar                 → emite um token (valida credenciais + certificado)
//   saldo                  → { data? (YYYY-MM-DD) }
//   sincronizar_extrato    → { dataInicio, dataFim } (YYYY-MM-DD)
//   sincronizar_cobrancas  → { dataInicial, dataFinal, filtrarDataPor? }   (Contas a Receber)
//   emitir_cobranca        → { cliente_id, valor, dataVencimento, seuNumero?, mensagem?, enviarEmail? }
//   pdf_cobranca           → { codigoSolicitacao } → { pdf (base64) }
//   cancelar_cobranca      → { codigoSolicitacao, motivo }
// ============================================================
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { X509Certificate } from "node:crypto";
import { CORS, json } from "../_shared/auth-jwt.ts";

// Host por ambiente (coluna cci_inter_conta.ambiente).
const HOSTS: Record<string, string> = {
  producao: "https://cdpj.partners.bancointer.com.br",
  sandbox: "https://cdpj-sandbox.partners.uatinter.co",
};
const base = (conta: { ambiente?: string }) => HOSTS[conta.ambiente || "producao"] || HOSTS.producao;
const PERMISSAO = "banco_inter";
const MAX_DIAS_POR_CHAMADA = 89;      // extrato: janela máx. por requisição
const TAMANHO_PAGINA = 1000;

// ─── Autorização ──────────────────────────────────────────────
// O gateway (verify_jwt) já validou a assinatura; aqui checamos os claims.
function claimsDoToken(req: Request): Record<string, unknown> | null {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
}

// ─── Estado por instância (cache de cliente mTLS e de token) ─────
type Conta = {
  id: string; nome: string; conta_corrente: string | null; client_id: string;
  escopos: string; updated_at: string; tem_segredos: boolean; ambiente: string;
};
let _http: { chave: string; client: Deno.HttpClient } | null = null;
const _tokens = new Map<string, { token: string; expira: number }>(); // escopo → token

function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function carregarConta(sb: SupabaseClient): Promise<Conta | null> {
  const { data, error } = await sb.from("cci_inter_conta")
    .select("id, nome, conta_corrente, client_id, escopos, updated_at, tem_segredos, ambiente")
    .limit(1).maybeSingle();
  if (error) throw new Error("Falha ao ler a configuração do Inter: " + error.message);
  return data as Conta | null;
}

async function segredos(sb: SupabaseClient) {
  const { data, error } = await sb.rpc("cci_inter_get_segredos");
  if (error) throw new Error("Falha ao ler os segredos do Inter.");
  const s = Array.isArray(data) ? data[0] : data;
  if (!s?.client_secret || !s?.cert || !s?.key) {
    throw new ErroInter("Integração do Inter incompleta: envie client secret, certificado (.crt) e chave (.key).", 400);
  }
  return s as { client_secret: string; cert: string; key: string };
}

class ErroInter extends Error {
  constructor(msg: string, public status = 502) { super(msg); }
}

// Cliente HTTP com o certificado da integração (mTLS). Recriado se a conta mudar.
async function httpClient(sb: SupabaseClient, conta: Conta) {
  const chave = `${conta.id}:${conta.updated_at}`;
  if (_http?.chave === chave) return _http.client;
  const s = await segredos(sb);
  _http?.client.close();
  _http = { chave, client: Deno.createHttpClient({ cert: s.cert, key: s.key }) };
  _tokens.clear();
  return _http.client;
}

// Emite (ou reaproveita) um token para o escopo pedido. Pede SEMPRE todos os
// escopos da integração num token só: a emissão de boletos no Inter falha
// (500 "Erro desconhecido") com token só de boleto-cobranca.write. Se o Inter
// recusar o conjunto (integração sem algum escopo), tenta só o da operação.
async function token(sb: SupabaseClient, conta: Conta, escopo: string): Promise<string> {
  const todos = [...new Set(`${conta.escopos || ""} ${escopo}`.split(/\s+/).filter(Boolean))].sort().join(" ");
  for (const pedido of todos === escopo ? [escopo] : [todos, escopo]) {
    const cache = _tokens.get(pedido);
    if (cache && cache.expira > Date.now() + 60_000) return cache.token;
  }
  const client = await httpClient(sb, conta);
  const s = await segredos(sb);
  const pedir = (scope: string) => fetch(`${base(conta)}/oauth/v2/token`, {
    method: "POST",
    client,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: conta.client_id,
      client_secret: s.client_secret,
      grant_type: "client_credentials",
      scope,
    }),
  } as RequestInit);

  let pedido = todos;
  let res = await pedir(pedido);
  if (!res.ok && res.status !== 429 && todos !== escopo) {
    await res.text();
    pedido = escopo;
    res = await pedir(pedido);
  }
  const txt = await res.text();
  if (!res.ok) {
    throw new ErroInter(
      res.status === 429
        ? "Limite de emissão de token do Inter atingido. Tente em 1 minuto."
        : `Inter recusou o token (${res.status}). Confira client id/secret, certificado e escopos. ${txt.slice(0, 300)}`,
      res.status === 429 ? 429 : 502,
    );
  }
  const j = JSON.parse(txt);
  _tokens.set(pedido, { token: j.access_token, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
  return j.access_token;
}

async function chamar(
  sb: SupabaseClient, conta: Conta, escopo: string, caminho: string,
  params: Record<string, unknown> = {}, opts: { method?: string; body?: unknown } = {},
) {
  const tk = await token(sb, conta, escopo);
  const client = await httpClient(sb, conta);
  const qp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") qp.set(k, String(v)); });
  const headers: Record<string, string> = { Authorization: `Bearer ${tk}` };
  if (conta.conta_corrente) headers["x-conta-corrente"] = conta.conta_corrente;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const metodo = opts.method || "GET";
  const url = `${base(conta)}${caminho}${qp.size ? `?${qp}` : ""}`;

  // Inter fora do ar (502/503/504, ex.: "no healthy upstream"): consultas (GET)
  // são repetidas com pausa curta; emissão/cancelamento (POST) NÃO — repetir
  // poderia emitir o mesmo boleto duas vezes.
  const tentativas = metodo === "GET" ? 3 : 1;
  let res: Response | null = null;
  let txt = "";
  for (let t = 0; t < tentativas; t++) {
    if (t > 0) await new Promise(r => setTimeout(r, 1500 * t));
    res = await fetch(url, {
      client, headers, method: metodo,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    } as RequestInit);
    txt = await res.text();
    if (![502, 503, 504].includes(res.status)) break;
  }
  if (!res!.ok) {
    const st = res!.status;
    console.error(`[inter-api] ${metodo} ${caminho} → ${st}: ${txt.slice(0, 300)}`);
    throw new ErroInter(
      st === 429
        ? "Limite de chamadas da API do Inter atingido. Aguarde 1 minuto e tente de novo."
        : [502, 503, 504].includes(st)
          ? `O serviço do Banco Inter está indisponível no momento (${st}). Tente novamente em alguns minutos.`
          : `Erro do Inter em ${caminho} (${st}): ${txt.slice(0, 300)}`,
      st === 429 ? 429 : 502,
    );
  }
  return txt ? JSON.parse(txt) : null;
}

// ─── Helpers de data ───────────────────────────────────────────
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function janelas(ini: string, fim: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let c = new Date(`${ini}T00:00:00Z`);
  const f = new Date(`${fim}T00:00:00Z`);
  while (c <= f) {
    const e = new Date(c); e.setUTCDate(e.getUTCDate() + MAX_DIAS_POR_CHAMADA - 1);
    const fimJ = e > f ? f : e;
    out.push([ymd(c), ymd(fimJ)]);
    c = new Date(fimJ); c.setUTCDate(c.getUTCDate() + 1);
  }
  return out;
}

// Valor da transação: aceita número ou texto ("1234.56" / "1.234,56"),
// sempre positivo (o sentido vem de tipoOperacao), arredondado em centavos.
// Valores fora do normal vão pro log (a sandbox do Inter devolve fictícios).
function lerValor(v: unknown, t: Record<string, unknown>): number {
  let n: number;
  if (typeof v === "number") n = v;
  else {
    const s = String(v ?? "").trim();
    n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s);
  }
  n = Math.round(Math.abs(Number.isFinite(n) ? n : 0) * 100) / 100;
  if (n >= 1e9) console.warn("[inter-api] valor fora do normal no extrato:", JSON.stringify({ valor: v, idTransacao: t.idTransacao, titulo: t.titulo }));
  return n;
}

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join("");
}

// ─── Ações ─────────────────────────────────────────────────────
async function salvarConfig(sb: SupabaseClient, body: Record<string, string>) {
  const clientId = String(body.client_id || "").trim();
  if (!clientId) throw new ErroInter("Informe o client id da integração.", 400);
  const cert = body.cert?.trim() || null;
  const key = body.key?.trim() || null;

  let validade: string | null | undefined;
  if (cert) {
    try { validade = new Date(new X509Certificate(cert).validTo).toISOString(); }
    catch { throw new ErroInter("Certificado (.crt) inválido — envie o arquivo .crt da integração do Inter.", 400); }
  }
  if (key && !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key)) {
    throw new ErroInter("Chave (.key) inválida — envie o arquivo .key da integração do Inter.", 400);
  }

  const { error: errS } = await sb.rpc("cci_inter_set_segredos", {
    p_client_secret: body.client_secret?.trim() || null, p_cert: cert, p_key: key,
  });
  if (errS) throw new Error("Falha ao gravar os segredos: " + errS.message);

  const { data: seg } = await sb.rpc("cci_inter_get_segredos");
  const s = Array.isArray(seg) ? seg[0] : seg;
  const linha: Record<string, unknown> = {
    nome: body.nome?.trim() || "Banco Inter",
    conta_corrente: body.conta_corrente?.replace(/\D/g, "") || null,
    client_id: clientId,
    ambiente: body.ambiente === "sandbox" ? "sandbox" : "producao",
    tem_segredos: !!(s?.client_secret && s?.cert && s?.key),
  };
  if (validade !== undefined) linha.certificado_validade = validade;

  const atual = await carregarConta(sb);
  const q = atual
    ? sb.from("cci_inter_conta").update(linha).eq("id", atual.id)
    : sb.from("cci_inter_conta").insert(linha);
  const { error } = await q;
  if (error) throw new Error("Falha ao salvar a conta: " + error.message);
  _http = null; _tokens.clear();
  return { ok: true };
}

async function sincronizarExtrato(sb: SupabaseClient, conta: Conta, dataInicio: string, dataFim: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFim) || dataInicio > dataFim) {
    throw new ErroInter("Período inválido.", 400);
  }
  let total = 0;
  for (const [ini, fim] of janelas(dataInicio, dataFim)) {
    let pagina = 0;
    for (;;) {
      const r = await chamar(sb, conta, "extrato.read", "/banking/v2/extrato/completo", {
        dataInicio: ini, dataFim: fim, pagina, tamanhoPagina: TAMANHO_PAGINA,
      });
      const transacoes: any[] = r?.transacoes || [];
      const linhas = await Promise.all(transacoes.map(async (t) => ({
        // idTransacao identifica a transação; sem ele, hash estável dos campos.
        id_transacao: String(t.idTransacao ?? await sha256(JSON.stringify(t))),
        conta_id: conta.id,
        data_transacao: String(t.dataTransacao || t.dataEntrada || t.dataInclusao || ini).slice(0, 10),
        data_inclusao: t.dataInclusao || null,
        tipo_operacao: String(t.tipoOperacao || "").toUpperCase().startsWith("D") ? "D" : "C",
        tipo_transacao: t.tipoTransacao || null,
        valor: lerValor(t.valor, t),
        titulo: t.titulo || null,
        descricao: t.descricao || null,
        detalhes: t.detalhes || null,
        sincronizado_em: new Date().toISOString(),
      })));
      if (linhas.length) {
        const { error } = await sb.from("cci_inter_extrato").upsert(linhas, { onConflict: "id_transacao" });
        if (error) throw new Error("Falha ao gravar o extrato: " + error.message);
        total += linhas.length;
      }
      const totalPaginas = Number(r?.totalPaginas ?? 1);
      pagina++;
      if (!transacoes.length || pagina >= totalPaginas) break;
    }
  }
  await sb.from("cci_inter_conta").update({ ultima_sincronizacao_em: new Date().toISOString() }).eq("id", conta.id);
  return { ok: true, transacoes: total };
}

// ─── Cobrança (boletos) — Contas a Receber da CCI ────────────────
const ESC_COB_LER = "boleto-cobranca.read";
const ESC_COB_ESCREVER = "boleto-cobranca.write";
const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// Item da listagem/consulta v3 → linha de cci_inter_cobranca.
function linhaCobranca(conta: Conta, item: any, extra: Record<string, unknown> = {}) {
  const c = item?.cobranca || item || {};
  const b = item?.boleto || {};
  const px = item?.pix || {};
  const num = (v: unknown) => (v == null || v === "" ? null : Math.round(Number(v) * 100) / 100);
  return {
    codigo_solicitacao: String(c.codigoSolicitacao),
    conta_id: conta.id,
    seu_numero: c.seuNumero || null,
    pagador_nome: c.pagador?.nome || null,
    pagador_cpf_cnpj: soDigitos(c.pagador?.cpfCnpj) || null,
    data_emissao: c.dataEmissao ? String(c.dataEmissao).slice(0, 10) : null,
    data_vencimento: c.dataVencimento ? String(c.dataVencimento).slice(0, 10) : null,
    valor_nominal: num(c.valorNominal),
    situacao: c.situacao || null,
    data_situacao: c.dataSituacao ? String(c.dataSituacao).slice(0, 10) : null,
    valor_recebido: num(c.valorTotalRecebido),
    nosso_numero: b.nossoNumero || null,
    linha_digitavel: b.linhaDigitavel || null,
    pix_copia_cola: px.pixCopiaECola || null,
    detalhes: item,
    sincronizado_em: new Date().toISOString(),
    ...extra,
  };
}

// Liga o boleto ao cliente da CCI pelo CNPJ/CPF do pagador (quando não veio do portal).
async function vincularClientes(sb: SupabaseClient, linhas: Record<string, any>[]) {
  const docs = [...new Set(linhas.filter(l => !l.cliente_id && l.pagador_cpf_cnpj).map(l => l.pagador_cpf_cnpj))];
  if (!docs.length) return;
  const { data } = await sb.from("clientes").select("id, cnpj");
  const porDoc = new Map<string, string>();
  (data || []).forEach((c: any) => { const d = soDigitos(c.cnpj); if (d && !porDoc.has(d)) porDoc.set(d, c.id); });
  linhas.forEach(l => { if (!l.cliente_id && porDoc.has(l.pagador_cpf_cnpj)) l.cliente_id = porDoc.get(l.pagador_cpf_cnpj); });
}

async function sincronizarCobrancas(sb: SupabaseClient, conta: Conta, dataInicial: string, dataFinal: string, filtrarDataPor = "VENCIMENTO") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicial) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFinal) || dataInicial > dataFinal) {
    throw new ErroInter("Período inválido.", 400);
  }
  let total = 0;
  let pagina = 0;
  for (;;) {
    const r = await chamar(sb, conta, ESC_COB_LER, "/cobranca/v3/cobrancas", {
      dataInicial, dataFinal, filtrarDataPor,
      "paginacao.paginaAtual": pagina, "paginacao.itensPorPagina": 1000,
    });
    const itens: any[] = r?.cobrancas || [];
    const linhas = itens.filter(i => (i?.cobranca || i)?.codigoSolicitacao).map(i => linhaCobranca(conta, i));
    if (linhas.length) {
      // Preserva o vínculo/emissor já gravados (não sobrescreve com null).
      const { data: existentes } = await sb.from("cci_inter_cobranca")
        .select("codigo_solicitacao, cliente_id, emitido_por")
        .in("codigo_solicitacao", linhas.map(l => l.codigo_solicitacao));
      const ant = new Map((existentes || []).map((e: any) => [e.codigo_solicitacao, e]));
      linhas.forEach((l: any) => {
        const e: any = ant.get(l.codigo_solicitacao);
        if (e) { l.cliente_id = e.cliente_id; l.emitido_por = e.emitido_por; }
      });
      await vincularClientes(sb, linhas);
      const { error } = await sb.from("cci_inter_cobranca").upsert(linhas, { onConflict: "codigo_solicitacao" });
      if (error) throw new Error("Falha ao gravar os boletos: " + error.message);
      total += linhas.length;
    }
    pagina++;
    const totalPaginas = Number(r?.totalPaginas ?? 1);
    if (!itens.length || pagina >= totalPaginas) break;
  }
  return { ok: true, boletos: total };
}

async function atualizarUmaCobranca(sb: SupabaseClient, conta: Conta, codigo: string, extra: Record<string, unknown> = {}) {
  const item = await chamar(sb, conta, ESC_COB_LER, `/cobranca/v3/cobrancas/${encodeURIComponent(codigo)}`);
  const linha = linhaCobranca(conta, item, extra);
  if (!linha.codigo_solicitacao || linha.codigo_solicitacao === "undefined") linha.codigo_solicitacao = codigo;
  const { error } = await sb.from("cci_inter_cobranca").upsert(linha, { onConflict: "codigo_solicitacao" });
  if (error) throw new Error("Falha ao gravar o boleto: " + error.message);
  return linha;
}

async function emitirCobranca(sb: SupabaseClient, conta: Conta, body: any, usuarioId: string | null) {
  const valor = Math.round(Number(body.valor) * 100) / 100;
  if (!(valor >= 2.5)) throw new ErroInter("Informe o valor do boleto (mínimo R$ 2,50).", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.dataVencimento || ""))) throw new ErroInter("Informe o vencimento.", 400);
  if (!body.cliente_id) throw new ErroInter("Escolha o cliente (pagador).", 400);

  // Pagador vem do CADASTRO do cliente (servidor), não do navegador.
  const { data: cli, error } = await sb.from("clientes")
    .select("id, nome, razao_social, cnpj, endereco, numero, complemento, bairro, cidade, estado, cep, contato_email")
    .eq("id", body.cliente_id).maybeSingle();
  if (error || !cli) throw new ErroInter("Cliente não encontrado.", 400);
  const doc = soDigitos(cli.cnpj);
  const faltando = [
    !(doc.length === 11 || doc.length === 14) && "CNPJ/CPF",
    !cli.endereco && "endereço", !cli.cidade && "cidade",
    !(cli.estado && String(cli.estado).trim().length === 2) && "UF",
    soDigitos(cli.cep).length !== 8 && "CEP",
  ].filter(Boolean);
  if (faltando.length) {
    throw new ErroInter(`Complete o cadastro do cliente antes de emitir: ${faltando.join(", ")}.`, 400);
  }
  if (body.enviarEmail && !/^\S+@\S+\.\S+$/.test(String(cli.contato_email || "").trim())) {
    throw new ErroInter("Para enviar por e-mail, cadastre o e-mail de contato do cliente.", 400);
  }

  const seuNumero = String(body.seuNumero || "").trim().slice(0, 15)
    || `CCI${Date.now().toString(36).toUpperCase()}`.slice(0, 15);
  const pagador: Record<string, unknown> = {
    cpfCnpj: doc,
    tipoPessoa: doc.length === 14 ? "JURIDICA" : "FISICA",
    nome: String(cli.razao_social || cli.nome).slice(0, 100),
    endereco: String(cli.endereco).slice(0, 90),
    numero: cli.numero ? String(cli.numero).slice(0, 10) : undefined,
    complemento: cli.complemento ? String(cli.complemento).slice(0, 30) : undefined,
    bairro: cli.bairro ? String(cli.bairro).slice(0, 60) : undefined,
    cidade: String(cli.cidade).slice(0, 60),
    uf: String(cli.estado).trim().toUpperCase(),
    cep: soDigitos(cli.cep),
    // E-mail só vai ao Inter quando o usuário pede o envio (flag enviarEmail):
    // sem e-mail no pagador, o Inter não tem para onde mandar o boleto.
    email: body.enviarEmail ? String(cli.contato_email).trim() : undefined,
  };
  const payload: Record<string, unknown> = {
    seuNumero,
    valorNominal: valor,
    dataVencimento: body.dataVencimento,
    numDiasAgenda: 60,
    pagador,
  };
  if (body.mensagem) payload.mensagem = { linha1: String(body.mensagem).slice(0, 78) };

  const r = await chamar(sb, conta, ESC_COB_ESCREVER, "/cobranca/v3/cobrancas", {}, { method: "POST", body: payload });
  const codigo = r?.codigoSolicitacao;
  if (!codigo) throw new ErroInter("O Inter não devolveu o código do boleto.", 502);

  const extra = { cliente_id: cli.id, emitido_por: usuarioId };
  try {
    return { ok: true, boleto: await atualizarUmaCobranca(sb, conta, codigo, extra) };
  } catch {
    // A emissão é assíncrona no Inter: se a consulta ainda não achou, grava o básico.
    const linha = {
      codigo_solicitacao: codigo, conta_id: conta.id, seu_numero: seuNumero,
      pagador_nome: pagador.nome, pagador_cpf_cnpj: doc,
      data_emissao: new Date().toISOString().slice(0, 10), data_vencimento: body.dataVencimento,
      valor_nominal: valor, situacao: "EM_PROCESSAMENTO", detalhes: r, ...extra,
    };
    await sb.from("cci_inter_cobranca").upsert(linha, { onConflict: "codigo_solicitacao" });
    return { ok: true, boleto: linha };
  }
}

async function cancelarCobranca(sb: SupabaseClient, conta: Conta, codigo: string, motivo: string) {
  if (!codigo) throw new ErroInter("Boleto não informado.", 400);
  const motivoCancelamento = String(motivo || "").trim().slice(0, 50);
  if (!motivoCancelamento) throw new ErroInter("Informe o motivo do cancelamento.", 400);
  await chamar(sb, conta, ESC_COB_ESCREVER, `/cobranca/v3/cobrancas/${encodeURIComponent(codigo)}/cancelar`, {},
    { method: "POST", body: { motivoCancelamento } });
  try { await atualizarUmaCobranca(sb, conta, codigo); }
  catch { await sb.from("cci_inter_cobranca").update({ situacao: "CANCELADO" }).eq("codigo_solicitacao", codigo); }
  return { ok: true };
}

// Ações de boleto (Contas a Receber) x ações bancárias (extrato/saldo/config).
const ACOES_COBRANCA = new Set(["status", "sincronizar_cobrancas", "emitir_cobranca", "pdf_cobranca", "cancelar_cobranca"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  // SÓ admin da CCI. N3 = acesso total. Extrato/saldo/config: permissão
  // 'banco_inter'. Boletos (Contas a Receber): 'contas_receber' ou 'banco_inter'.
  const claims = claimsDoToken(req);
  const perms = Array.isArray(claims?.cci_permissoes) ? claims!.cci_permissoes as string[] : [];
  const n3 = Number(claims?.cci_nivel_admin) === 3;
  const podeBanco = n3 || perms.includes(PERMISSAO);
  const podeReceber = podeBanco || perms.includes("contas_receber");

  try {
    const body = await req.json().catch(() => ({}));
    const permitido = claims?.cci_tipo === "admin"
      && (ACOES_COBRANCA.has(body.acao) ? podeReceber : podeBanco);
    if (!permitido) return json({ error: "Sem permissão para o Banco Inter." }, 403);
    const usuarioId = (claims?.cci_usuario_id as string) || null;
    const sb = admin();

    if (body.acao === "salvar_config") return json(await salvarConfig(sb, body));

    const conta = await carregarConta(sb);
    if (body.acao === "status") {
      const { data } = await sb.from("cci_inter_conta").select("*").limit(1).maybeSingle();
      return json({ conta: data || null });
    }
    if (!conta) return json({ error: "Banco Inter ainda não configurado." }, 400);
    if (!conta.tem_segredos) return json({ error: "Integração do Inter incompleta: envie client secret, certificado e chave." }, 400);

    switch (body.acao) {
      case "testar": {
        try {
          await token(sb, conta, "extrato.read");
          await sb.from("cci_inter_conta").update({ ultimo_teste_em: new Date().toISOString(), ultimo_teste_ok: true, ultimo_teste_msg: "Conexão OK" }).eq("id", conta.id);
          return json({ ok: true });
        } catch (e) {
          const msg = (e as Error).message;
          await sb.from("cci_inter_conta").update({ ultimo_teste_em: new Date().toISOString(), ultimo_teste_ok: false, ultimo_teste_msg: msg.slice(0, 500) }).eq("id", conta.id);
          throw e;
        }
      }
      case "saldo":
        return json(await chamar(sb, conta, "extrato.read", "/banking/v2/saldo", { dataSaldo: body.data || undefined }));
      case "sincronizar_extrato":
        return json(await sincronizarExtrato(sb, conta, body.dataInicio, body.dataFim));
      case "sincronizar_cobrancas":
        return json(await sincronizarCobrancas(sb, conta, body.dataInicial, body.dataFinal, body.filtrarDataPor || "VENCIMENTO"));
      case "emitir_cobranca":
        return json(await emitirCobranca(sb, conta, body, usuarioId));
      case "pdf_cobranca": {
        if (!body.codigoSolicitacao) return json({ error: "Boleto não informado." }, 400);
        const r = await chamar(sb, conta, ESC_COB_LER, `/cobranca/v3/cobrancas/${encodeURIComponent(body.codigoSolicitacao)}/pdf`);
        return json({ pdf: r?.pdf || null });
      }
      case "cancelar_cobranca":
        return json(await cancelarCobranca(sb, conta, body.codigoSolicitacao, body.motivo));
      default:
        return json({ error: "Ação inválida." }, 400);
    }
  } catch (e) {
    const status = e instanceof ErroInter ? e.status : 500;
    console.error("[inter-api]", (e as Error).message);
    return json({ error: (e as Error).message }, status);
  }
});
