// ============================================================
// Service de Notas Fiscais a Manifestar
//
// Camada de dados das tabelas `nf_manifestacao*` + sincronização com a
// API Quality (endpoint NOTA_MANIFESTACAO) e gestão de arquivos no
// bucket Supabase Storage `nfs-manifestacao`.
//
// O fluxo de vida da nota:
//   pendente  → cliente sincronizou da Quality, ainda não abriu
//   em_preenchimento → cliente abriu e está preenchendo
//   enviada   → cliente concluiu, aguarda CCI
//   lancada   → admin CCI validou e lançou no sistema
//   devolvida → admin pediu correção; cliente edita e reenvia
// ============================================================

import { supabase } from '../lib/supabase';
import * as qualityApi from './qualityApiService';
import { buscarNotasManifestarAutosystem } from './autosystemService';

const BUCKET = 'nfs-manifestacao';
const TIPOS_ARQUIVO = ['nota_fiscal', 'boleto', 'foto_produto', 'foto_codigo_barras'];
const TIPOS_NIVEL_PRODUTO = new Set(['foto_produto', 'foto_codigo_barras']);

export const STATUS_PORTAL = [
  { key: 'pendente',        label: 'Pendente',         cor: 'gray'    },
  { key: 'em_preenchimento',label: 'Em preenchimento', cor: 'amber'   },
  { key: 'enviada',         label: 'Enviada à CCI',    cor: 'blue'    },
  { key: 'lancada',         label: 'Lançada',          cor: 'emerald' },
  { key: 'devolvida',       label: 'Devolvida',        cor: 'rose'    },
];

export const TIPO_DESTINACAO = [
  { key: 'estoque',     label: 'Estoque (revenda)' },
  { key: 'uso_consumo', label: 'Uso e consumo' },
];

// ─── Listagem / consulta ─────────────────────────────────────

// Lista notas do cliente (com produtos e arquivos contados).
export async function listarPorCliente(clienteId, { status } = {}) {
  if (!clienteId) return [];
  let q = supabase
    .from('nf_manifestacao')
    .select('*, produtos:nf_manifestacao_produto(count), arquivos:nf_manifestacao_arquivo(id, tipo)')
    .eq('cliente_id', clienteId)
    .order('data_emissao', { ascending: false });
  if (status) q = q.eq('status_portal', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(enriquecerContagens);
}

// Lista todas as notas enviadas para admin (qualquer cliente).
// Lista para admin com filtros opcionais. `status` aceita string única OU
// array (ex: ['pendente','em_preenchimento'] pra fila de cobrança).
// `chaveApiId` filtra por rede do cliente. `dataDe`/`dataAte` filtram por
// data_emissao da NF (formato YYYY-MM-DD).
export async function listarParaAdmin({ status, chaveApiId, asRedeId, dataDe, dataAte } = {}) {
  let q = supabase
    .from('nf_manifestacao')
    .select(`*,
      cliente:clientes(id, nome, cnpj, chave_api_id, as_rede_id),
      produtos:nf_manifestacao_produto(count),
      arquivos:nf_manifestacao_arquivo(id, tipo)`)
    .order('enviada_em', { ascending: false, nullsFirst: false });

  if (Array.isArray(status))      q = q.in('status_portal', status);
  else if (status)                q = q.eq('status_portal', status);
  else                            q = q.in('status_portal', ['pendente', 'em_preenchimento', 'enviada', 'lancada', 'devolvida']);

  if (dataDe)  q = q.gte('data_emissao', dataDe);
  if (dataAte) q = q.lte('data_emissao', dataAte);

  const { data, error } = await q;
  if (error) throw error;

  let rows = (data || []).map(enriquecerContagens);
  // Filtro de rede aplicado no JS (relação aninhada — Postgrest exige outro padrão).
  // Webposto = chave_api_id; Autosystem = as_rede_id.
  if (chaveApiId) rows = rows.filter(r => r.cliente?.chave_api_id === chaveApiId);
  if (asRedeId)   rows = rows.filter(r => r.cliente?.as_rede_id === asRedeId);
  return rows;
}

function enriquecerContagens(row) {
  const arqs = row.arquivos || [];
  return {
    ...row,
    qtdProdutos: row.produtos?.[0]?.count ?? 0,
    qtdNotaFiscal: arqs.filter(a => a.tipo === 'nota_fiscal').length,
    qtdBoleto:     arqs.filter(a => a.tipo === 'boleto').length,
  };
}

// Detalhe completo: nota + produtos + arquivos.
export async function obter(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('nf_manifestacao')
    .select(`*,
      cliente:clientes(id, nome, cnpj),
      produtos:nf_manifestacao_produto(*),
      arquivos:nf_manifestacao_arquivo(*)`)
    .eq('id', id)
    .single();
  if (error) throw error;
  if (data?.produtos) data.produtos.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  return data;
}

// ─── Sincronização com Quality ───────────────────────────────

// Busca o endpoint NOTA_MANIFESTACAO e cria registros novos (upsert por
// chave_documento). Notas que já existem localmente NÃO são sobrescritas
// (preservam o trabalho do cliente). Por padrão busca os últimos 90 dias
// e força refetch (ignora cache de 1h do qualityApiService) — usuário
// espera dados frescos ao clicar "Sincronizar".
export async function sincronizarComQuality({
  clienteId, apiKey, empresaCodigo,
  dataInicial, dataFinal, diasAtras = 90,
} = {}) {
  if (!clienteId || !apiKey) throw new Error('clienteId e apiKey são obrigatórios');

  // Default: últimos `diasAtras` até hoje (formato YYYY-MM-DD).
  if (!dataInicial && diasAtras) {
    const d = new Date(); d.setDate(d.getDate() - diasAtras);
    dataInicial = d.toISOString().slice(0, 10);
  }
  if (!dataFinal) {
    dataFinal = new Date().toISOString().slice(0, 10);
  }

  const remotas = await qualityApi.buscarNotaManifestacao(apiKey, {
    empresaCodigo,
    dataInicial, dataFinal,
    noCache: true,
  });

  // eslint-disable-next-line no-console
  console.log('[sincronizarComQuality]', {
    empresa: empresaCodigo, dataInicial, dataFinal,
    total: remotas?.length || 0,
  });

  if (!Array.isArray(remotas) || remotas.length === 0) {
    return { criadas: 0, total: 0, periodo: { dataInicial, dataFinal } };
  }

  // Quais já existem localmente?
  const chaves = remotas.map(r => r.chaveDocumento).filter(Boolean);
  const { data: existentes, error: errEx } = await supabase
    .from('nf_manifestacao')
    .select('chave_documento')
    .eq('cliente_id', clienteId)
    .in('chave_documento', chaves);
  if (errEx) throw errEx;
  const setExistentes = new Set((existentes || []).map(e => e.chave_documento));

  const novas = remotas
    .filter(r => r.chaveDocumento && !setExistentes.has(r.chaveDocumento))
    .map(r => ({
      cliente_id: clienteId,
      empresa_codigo: r.empresaCodigo ?? empresaCodigo ?? null,
      manifestacao_codigo: r.manifestacaoCodigo ?? null,
      chave_documento: r.chaveDocumento,
      cnpj_fornecedor: r.cnpjFornecedor || null,
      razao_social_fornecedor: r.razaoSocialFornecedor || null,
      data_emissao: r.dataEmissao || null,
      valor: r.valor ?? null,
      situacao_manifestacao: r.situacaoManifestacao ?? null,
      motivo_manifestacao: r.motivoManifestacao || null,
      compra_codigo: r.compraCodigo ?? null,
      codigo_quality: r.codigo ?? null,
      protocolo_manifestacao: r.protocoloManifestacao || null,
      status_portal: 'pendente',
    }));

  if (novas.length > 0) {
    const { error } = await supabase.from('nf_manifestacao').insert(novas);
    if (error) throw error;
  }
  return { criadas: novas.length, total: remotas.length };
}

// ─── Sincronização com Autosystem ────────────────────────────

// Espelha `sincronizarComQuality`, mas a fonte é o banco remoto Autosystem
// (via Edge Function autosystem-nfe-manifestacao). Traz as "notas a manifestar"
// (Sem operação · não cancelada · visualizada — o filtro vive na edge) e cria
// registros novos em `nf_manifestacao` (status pendente), deduplicando por
// chave_documento dentro de cada cliente. Notas já existentes NÃO são
// sobrescritas (preservam o trabalho do cliente).
//
// IMPORTANTE: busca a REDE INTEIRA (empresa_codigos = []). O banco remoto é
// consolidado da rede. Cada nota é atribuída à empresa dona casando, nesta
// ordem: (1) CNPJ da empresa do ERP × `clientes.cnpj` do portal — a ponte mais
// confiável, pois os `empresa_codigo` do portal costumam não bater com os do
// ERP; (2) `empresa_codigo`; (3) numa rede de empresa ÚNICA, cai tudo nela.
// Numa rede com várias empresas, notas que não casam com nenhuma empresa são
// IGNORADAS — nunca "despejadas" numa empresa arbitrária.
//
// `empresas` = [{ id, empresa_codigo, cnpj }] das empresas da rede (clientesRede).
export async function sincronizarComAutosystem({
  asRedeId, empresas = [],
} = {}) {
  if (!asRedeId) throw new Error('asRedeId é obrigatório');

  const remotas = await buscarNotasManifestarAutosystem(asRedeId, [], {});
  if (!Array.isArray(remotas) || remotas.length === 0) {
    return { criadas: 0, total: 0, ignoradas: 0 };
  }

  // Diagnóstico: distribuição das notas por EMPRESA REAL do ERP (código + nome
  // como vêm do Autosystem). Confira no DevTools → Console pra saber a qual
  // empresa as notas de fato pertencem (independente do cadastro do portal).
  const distrib = {};
  for (const r of remotas) {
    const k = `${r.empresa_codigo ?? '—'} · ${r.empresa_nome || '(sem nome)'}`;
    if (!distrib[k]) distrib[k] = { qtd: 0, valor: 0 };
    distrib[k].qtd += 1;
    distrib[k].valor += Number(r.valor || 0);
  }
  // eslint-disable-next-line no-console
  console.log('[sincronizarComAutosystem] notas a manifestar por empresa (ERP):', distrib);

  // Só dígitos (compara CNPJ independente de formatação).
  const soDigitos = (v) => String(v || '').replace(/\D/g, '');

  // Mapas de resolução: CNPJ (preferido) e empresa_codigo → cliente_id.
  const mapaCnpj = new Map();
  const mapaCodigo = new Map();
  for (const e of empresas) {
    const cnpj = soDigitos(e?.cnpj);
    if (cnpj) mapaCnpj.set(cnpj, e.id);
    if (e?.empresa_codigo != null && e.empresa_codigo !== '') {
      mapaCodigo.set(String(e.empresa_codigo), e.id);
    }
  }
  // Fallback SÓ para rede de empresa única (não há ambiguidade de destino).
  const fallback = empresas.length === 1 ? empresas[0].id : null;

  // Resolve cliente_id por nota, deduplicando por chave dentro de cada cliente
  // (o resultado remoto pode repetir a mesma chave por conta dos LEFT JOINs).
  const porCliente = new Map(); // clienteId -> Map(chave -> nota)
  let ignoradas = 0;
  for (const r of remotas) {
    if (!r.chave) { ignoradas++; continue; }
    const clienteId = mapaCnpj.get(soDigitos(r.empresa_cnpj))
      ?? mapaCodigo.get(String(r.empresa_codigo))
      ?? fallback;
    if (!clienteId) { ignoradas++; continue; }
    if (!porCliente.has(clienteId)) porCliente.set(clienteId, new Map());
    const m = porCliente.get(clienteId);
    if (!m.has(r.chave)) m.set(r.chave, r); // 1ª ocorrência por chave
  }

  let criadas = 0;
  for (const [clienteId, mapaNotas] of porCliente) {
    const notasCliente = [...mapaNotas.values()];
    const chaves = notasCliente.map(r => r.chave);
    const { data: existentes, error: errEx } = await supabase
      .from('nf_manifestacao')
      .select('chave_documento')
      .eq('cliente_id', clienteId)
      .in('chave_documento', chaves);
    if (errEx) throw errEx;
    const setExistentes = new Set((existentes || []).map(e => e.chave_documento));

    const novas = notasCliente
      .filter(r => !setExistentes.has(r.chave))
      .map(r => ({
        cliente_id: clienteId,
        empresa_codigo: r.empresa_codigo ?? null,
        chave_documento: r.chave,
        cnpj_fornecedor: r.emitente_cnpj || null,
        razao_social_fornecedor: r.emitente_nome || null,
        data_emissao: r.data_emissao || null,
        valor: r.valor ?? null,
        // Notas do Autosystem são, por definição do filtro da edge
        // (nfe_evento=0 "Sem operação"), ainda NÃO manifestadas → 0 = "Sem
        // manifestação". Coloca-as na aba "Para cobrar" do admin (que filtra
        // situacao_manifestacao === 0), igual ao Webposto.
        situacao_manifestacao: 0,
        status_portal: 'pendente',
        // Colunas exclusivas da Quality ficam nulas no Autosystem.
      }));

    if (novas.length > 0) {
      // upsert idempotente: ignora conflitos em (cliente_id, chave_documento)
      // — imune a corrida e a chaves repetidas eventuais.
      const { error } = await supabase
        .from('nf_manifestacao')
        .upsert(novas, { onConflict: 'cliente_id,chave_documento', ignoreDuplicates: true });
      if (error) throw error;
      criadas += novas.length;
    }
  }
  return { criadas, total: remotas.length, ignoradas };
}

// ─── Edição da nota e produtos ───────────────────────────────

export async function atualizar(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.cliente_id;
  delete payload.chave_documento;
  delete payload.created_at;
  delete payload.updated_at;
  const { data, error } = await supabase
    .from('nf_manifestacao')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function adicionarProduto(nfId, produto) {
  const payload = {
    nf_manifestacao_id: nfId,
    codigo_barras: produto.codigo_barras || null,
    codigo_interno: produto.codigo_interno || null,
    descricao: produto.descricao || null,
    quantidade: Number(produto.quantidade) || 1,
    valor_unitario: Number(produto.valor_unitario) || 0,
    ordem: produto.ordem ?? 0,
    produto_novo: !!produto.produto_novo,
    tipo_destinacao: produto.tipo_destinacao || 'estoque',
    bonificacao: !!produto.bonificacao,
  };
  const { data, error } = await supabase
    .from('nf_manifestacao_produto')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cria um produto NOVO (não cadastrado no Webposto) com 2 fotos obrigatórias:
// o produto em si + o código de barras. A CCI usa pra cadastrar no Webposto
// antes do lançamento. Faz tudo numa transação lógica: se qualquer upload
// falhar, remove o produto pra não deixar estado inconsistente.
export async function adicionarProdutoNovo({
  nfId, clienteId, descricao, codigoBarras, quantidade, valorUnitario, ordem,
  fotoProduto, fotoCodigoBarras,
}) {
  if (!nfId || !clienteId) throw new Error('nfId e clienteId obrigatórios');
  if (!descricao || !descricao.trim()) throw new Error('Descrição do produto é obrigatória');
  if (!fotoProduto)       throw new Error('Anexe uma foto do produto');
  if (!fotoCodigoBarras)  throw new Error('Anexe uma foto do código de barras');

  // 1) Cria o produto. Mensagem amigável se a migration 063 ainda não foi aplicada.
  let produto;
  try {
    produto = await adicionarProduto(nfId, {
      codigo_barras: codigoBarras || null,
      codigo_interno: null,                       // CCI define ao cadastrar
      descricao: descricao.trim(),
      quantidade, valor_unitario: valorUnitario,
      ordem,
      produto_novo: true,
    });
  } catch (err) {
    if (/produto_novo|column.*does not exist/i.test(err.message || '')) {
      throw new Error('Banco desatualizado: migration 063 não foi aplicada. Rode `supabase db push`.');
    }
    throw err;
  }

  // 2) Sobe as duas fotos. Rollback do produto se algo falhar.
  try {
    await adicionarArquivo({ nfId, clienteId, tipo: 'foto_produto',        file: fotoProduto,       produtoId: produto.id });
    await adicionarArquivo({ nfId, clienteId, tipo: 'foto_codigo_barras', file: fotoCodigoBarras,  produtoId: produto.id });
  } catch (err) {
    await excluirProduto(produto.id).catch(() => {});
    if (/produto_id|column.*does not exist/i.test(err.message || '')) {
      throw new Error('Banco desatualizado: migration 063 não foi aplicada. Rode `supabase db push`.');
    }
    if (/check constraint/i.test(err.message || '')) {
      throw new Error('Erro de validação no banco. Verifique se a migration 063 foi aplicada completamente. Detalhe: ' + err.message);
    }
    throw err;
  }
  return produto;
}

export async function atualizarProduto(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.nf_manifestacao_id;
  delete payload.subtotal;       // calculado pelo banco
  delete payload.created_at;
  const { data, error } = await supabase
    .from('nf_manifestacao_produto')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirProduto(id) {
  const { error } = await supabase
    .from('nf_manifestacao_produto').delete().eq('id', id);
  if (error) throw error;
}

// ─── Arquivos (upload / download / delete) ────────────────────

// Faz upload de arquivo no bucket privado e registra na tabela.
// `produtoId` é obrigatório para tipos foto_produto/foto_codigo_barras e
// inválido para nota_fiscal/boleto.
export async function adicionarArquivo({ nfId, clienteId, tipo, file, produtoId = null }) {
  if (!TIPOS_ARQUIVO.includes(tipo)) throw new Error(`Tipo inválido: ${tipo}`);
  if (!file) throw new Error('Arquivo obrigatório');
  if (TIPOS_NIVEL_PRODUTO.has(tipo) && !produtoId) {
    throw new Error('produtoId é obrigatório para fotos de produto');
  }
  if (!TIPOS_NIVEL_PRODUTO.has(tipo) && produtoId) {
    throw new Error('produtoId não deve ser informado para nota_fiscal/boleto');
  }

  const ts = Date.now();
  const seguro = sanitizarNomeArquivo(file.name);
  const subpasta = produtoId ? `${tipo}/${produtoId}` : tipo;
  const path = `${clienteId}/${nfId}/${subpasta}/${ts}-${seguro}`;

  const { error: errUp } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (errUp) throw errUp;

  const { data, error } = await supabase
    .from('nf_manifestacao_arquivo')
    .insert({
      nf_manifestacao_id: nfId,
      produto_id: produtoId,
      tipo,
      storage_path: path,
      nome_original: file.name,
      tamanho_bytes: file.size,
      mime_type: file.type || null,
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data;
}

// Gera URL assinada temporária (60min) pra visualizar/baixar.
export async function urlAssinada(storagePath, expiresSec = 3600) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresSec);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function excluirArquivo(arquivo) {
  if (!arquivo?.id || !arquivo?.storage_path) return;
  // Remove primeiro do storage; se falhar, mantém a linha pra retentativa.
  const { error: errSt } = await supabase.storage
    .from(BUCKET).remove([arquivo.storage_path]);
  if (errSt && errSt.message && !/not found/i.test(errSt.message)) throw errSt;
  const { error } = await supabase
    .from('nf_manifestacao_arquivo').delete().eq('id', arquivo.id);
  if (error) throw error;
}

function sanitizarNomeArquivo(nome) {
  return String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

// ─── Transições de status ────────────────────────────────────

// Cliente envia para CCI. Exige:
//   - ao menos 1 produto
//   - cada produto com tipo_destinacao definido (estoque ou uso_consumo)
//   - ao menos 1 arquivo Nota Fiscal (PDF/XML/foto)
//   - boleto: ao menos 1 arquivo OU motivo_sem_boleto preenchido
//   - soma dos produtos == valor total da NF (tolerância de 1 centavo).
//     Bonificações entram com seu valor unitário normalmente — a marca de
//     "bonificacao=true" é só um flag para a CCI lançar corretamente.
export async function enviarParaCci(id) {
  const nf = await obter(id);
  if (!nf) throw new Error('Nota não encontrada');
  if (!nf.produtos || nf.produtos.length === 0) throw new Error('Cadastre ao menos 1 produto');
  const semDestinacao = nf.produtos.filter(p => !p.tipo_destinacao);
  if (semDestinacao.length > 0) {
    throw new Error(`${semDestinacao.length} produto(s) sem destinação definida (estoque ou uso e consumo).`);
  }
  const arqs = nf.arquivos || [];
  if (!arqs.some(a => a.tipo === 'nota_fiscal')) throw new Error('Anexe ao menos 1 arquivo de Nota Fiscal');
  const temBoleto = arqs.some(a => a.tipo === 'boleto');
  const temMotivo = !!(nf.motivo_sem_boleto && nf.motivo_sem_boleto.trim());
  if (!temBoleto && !temMotivo) {
    throw new Error('Anexe pelo menos um boleto ou informe o motivo da ausência (ex: "paga em dinheiro").');
  }

  // Reenvio após correção: limpa os motivos de devolução (itens + arquivos).
  await limparMotivosItens(id);
  return atualizar(id, {
    status_portal: 'enviada',
    enviada_em: new Date().toISOString(),
    motivo_devol_nf: null,
    motivo_devol_boleto: null,
  });
}

// Admin marca como lançada.
export async function marcarLancada(id, { adminUsuarioId }) {
  await limparMotivosItens(id);
  return atualizar(id, {
    status_portal: 'lancada',
    lancada_em: new Date().toISOString(),
    lancada_por: adminUsuarioId || null,
    motivo_devolucao: null,
    motivo_devol_nf: null,
    motivo_devol_boleto: null,
  });
}

// Limpa o motivo de devolução de todos os itens da nota (ao reenviar/lançar).
async function limparMotivosItens(nfId) {
  const { error } = await supabase
    .from('nf_manifestacao_produto')
    .update({ motivo_devolucao: null })
    .eq('nf_manifestacao_id', nfId);
  if (error) throw error;
}

// Admin devolve para correção — motivos POR ITEM e/ou na Nota Fiscal / Boletos.
// `motivos`: [{ produtoId, motivo }] (os itens sem observação têm o motivo limpo).
// `motivoNf` / `motivoBoleto`: texto opcional apontando problema nos arquivos.
// Exige ao menos um motivo (item, NF ou boleto).
export async function devolverParaCliente(id, { motivos, motivoNf, motivoBoleto, adminUsuarioId }) {
  const lista = (motivos || []).map(m => ({ produtoId: m.produtoId, motivo: (m.motivo || '').trim() }));
  const nf = (motivoNf || '').trim();
  const boleto = (motivoBoleto || '').trim();
  if (!lista.some(m => m.motivo) && !nf && !boleto) {
    throw new Error('Aponte o motivo em ao menos um item, na Nota Fiscal ou nos Boletos');
  }
  // Zera todos os motivos de item e grava os informados (mantém consistência).
  await limparMotivosItens(id);
  const comMotivo = lista.filter(m => m.motivo && m.produtoId);
  const resultados = await Promise.all(comMotivo.map(m =>
    supabase.from('nf_manifestacao_produto')
      .update({ motivo_devolucao: m.motivo })
      .eq('id', m.produtoId)
  ));
  const falha = resultados.find(r => r.error);
  if (falha?.error) throw falha.error;

  return atualizar(id, {
    status_portal: 'devolvida',
    devolvida_em: new Date().toISOString(),
    devolvida_por: adminUsuarioId || null,
    motivo_devolucao: null,
    motivo_devol_nf: nf || null,
    motivo_devol_boleto: boleto || null,
  });
}
