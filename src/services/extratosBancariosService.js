import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

const BUCKET = 'extratos-bancarios';

// ══════════════════════════════════════════════
// CRUD + Storage
// ══════════════════════════════════════════════

// Lista extratos cujo periodo intersecta com o intervalo informado.
// Se o extrato cobre 01-30 e o filtro e 15-20, ele aparece.
export async function listarPorPeriodo({ cliente_id, chave_api_id, dataInicial, dataFinal }) {
  let q = supabase.from('extratos_bancarios').select('*');
  if (cliente_id) q = q.eq('cliente_id', cliente_id);
  else if (chave_api_id) q = q.eq('chave_api_id', chave_api_id);
  if (dataInicial) q = q.lte('data_inicial', dataFinal || dataInicial);
  if (dataFinal) q = q.gte('data_final', dataInicial || dataFinal);
  q = q.order('enviado_em', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Upload do arquivo + registro dos metadados
export async function upload({
  file, cliente_id, chave_api_id, conta_codigo = null, saldo_final = null,
  data_inicial, data_final, enviado_por = null, observacoes = null,
}) {
  if (!file) throw new Error('Arquivo não informado.');
  if (!cliente_id || !chave_api_id) throw new Error('Cliente e rede são obrigatorios.');
  if (!data_inicial || !data_final) throw new Error('Informe o período do extrato.');

  const ts = Date.now();
  const safeNome = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${chave_api_id}/${cliente_id}/${ts}-${safeNome}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600',
    upsert: false,
  });
  if (up.error) throw new Error('Erro no upload: ' + up.error.message);

  const payload = {
    cliente_id,
    chave_api_id,
    conta_codigo: conta_codigo != null ? Number(conta_codigo) : null,
    saldo_final: saldo_final != null && saldo_final !== '' ? Number(saldo_final) : null,
    data_inicial,
    data_final,
    arquivo_nome: file.name,
    arquivo_path: path,
    tamanho_bytes: file.size || null,
    mime_type: file.type || null,
    enviado_por,
    observacoes,
  };
  const { data, error } = await supabase
    .from('extratos_bancarios')
    .insert(payload)
    .select()
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data;
}

// Gera URL temporaria (signed) para download
export async function getDownloadUrl(path, expiresInSeconds = 300) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data?.signedUrl;
}

export async function excluir(id, path) {
  const { error } = await supabase.from('extratos_bancarios').delete().eq('id', id);
  if (error) throw error;
  if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}

// ══════════════════════════════════════════════
// Extracao automatica do saldo final do arquivo
// Reconhece linha "SALDO DO DIA" (padrao Sicoob) e variantes
// com valor no formato "X.XXX,XX C|D" (C=credito+, D=debito-)
// ══════════════════════════════════════════════
const RX_SALDO_DIA = /saldo\s+do\s+dia/i;                      // prioridade 1 (Sicoob)
const RX_SALDO_FALLBACK = /saldo\s+(final|do\s+periodo|do\s+extrato)/i; // prioridade 2

export async function extrairSaldoFinal(file) {
  if (!file) return null;
  const nome = (file.name || '').toLowerCase();
  try {
    if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) return null;
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      return varrerLinhasSaldo(aoa);
    }
    if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
      const texto = await file.text();
      const linhas = texto.split(/\r?\n/).map(l => {
        const sep = (l.split(';').length > l.split(',').length) ? ';' : ',';
        return l.split(sep).map(s => s.replace(/^"|"$/g, '').trim());
      });
      return varrerLinhasSaldo(linhas);
    }
  } catch (_) { return null; }
  return null;
}

// Procura primeiro por linhas contendo "SALDO DO DIA" (padrao Sicoob) e,
// na mesma linha, extrai o valor da DIREITA PARA ESQUERDA (a coluna VALOR
// costuma ser a ultima). Se nao achar, tenta padroes alternativos.
function varrerLinhasSaldo(linhas) {
  const extrairValorDaLinha = (row) => {
    if (!row) return null;
    for (let j = row.length - 1; j >= 0; j--) {
      const v = parseValorSicoob(row[j]);
      if (v != null) return v;
    }
    return null;
  };

  // 1) SALDO DO DIA (pega a ULTIMA ocorrencia — extrato multi-dia tem varias)
  let valor = null;
  for (let i = 0; i < linhas.length; i++) {
    const row = linhas[i] || [];
    const joined = row.map(c => String(c ?? '')).join(' ');
    if (RX_SALDO_DIA.test(joined)) {
      const v = extrairValorDaLinha(row);
      if (v != null) valor = v; // sobrescreve a cada match — retem o ultimo
    }
  }
  if (valor != null) return valor;

  // 2) Fallback: SALDO FINAL / DO PERIODO / DO EXTRATO (bottom-up)
  for (let i = linhas.length - 1; i >= 0; i--) {
    const row = linhas[i] || [];
    const joined = row.map(c => String(c ?? '')).join(' ');
    if (RX_SALDO_FALLBACK.test(joined)) {
      const v = extrairValorDaLinha(row);
      if (v != null) return v;
    }
  }
  return null;
}

// Parse de valor estilo Sicoob: "28.251,80 C", "-750,00 D", ou apenas numerico
function parseValorSicoob(valor) {
  const s = String(valor ?? '').trim();
  if (!s) return null;
  const mCD = s.match(/([CD])\s*$/i);
  const tipoCD = mCD ? mCD[1].toUpperCase() : null;
  let clean = s.replace(/[CD]\s*$/i, '').trim();
  clean = clean.replace(/R\$/gi, '').replace(/\s/g, '');
  const negParens = /^\(.*\)$/.test(clean);
  clean = clean.replace(/[()]/g, '');
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const n = Number(clean);
  if (!isFinite(n) || clean === '') return null;
  let final = n;
  if (negParens) final = -Math.abs(final);
  if (tipoCD === 'D') final = -Math.abs(final);
  else if (tipoCD === 'C') final = Math.abs(final);
  return final;
}

export function formatarTamanho(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
