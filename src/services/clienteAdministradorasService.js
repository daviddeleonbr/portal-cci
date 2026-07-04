import { supabase } from '../lib/supabase';

// Classificação das administradoras de cartão por REDE (chave_api).
// Marca quais são de CARTÃO FROTA. Uma config por rede vale para todas
// as empresas. Espelha clienteContasBancariasService.

// Lista classificações de uma rede (chave_api)
export async function listarPorRede(chaveApiId) {
  if (!chaveApiId) return [];
  const { data, error } = await supabase
    .from('cliente_administradoras')
    .select('*')
    .eq('chave_api_id', chaveApiId)
    .order('administradora_codigo', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Só as marcadas como frota (ativas) — útil pra contagem/filtragem.
export async function listarFrotaPorRede(chaveApiId) {
  if (!chaveApiId) return [];
  const { data, error } = await supabase
    .from('cliente_administradoras')
    .select('id, administradora_codigo, descricao')
    .eq('chave_api_id', chaveApiId)
    .eq('ativo', true)
    .eq('frota', true)
    .order('administradora_codigo', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function atualizar(id, campos) {
  const { data, error } = await supabase
    .from('cliente_administradoras')
    .update(campos)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Sincroniza com a lista vinda do endpoint ADMINISTRADORA do Quality:
//  - cria as novas (frota=false por padrão)
//  - atualiza a descrição se mudou
//  - NÃO apaga as existentes (preserva a marcação do admin)
export async function sincronizarComQuality(chaveApiId, administradorasQuality) {
  if (!chaveApiId || !Array.isArray(administradorasQuality)) return [];
  const existentes = await listarPorRede(chaveApiId);
  const mapaExistentes = new Map(existentes.map(r => [Number(r.administradora_codigo), r]));

  const vistosNovos = new Set();
  const novos = [];
  for (const a of administradorasQuality) {
    const codigoRaw = a.administradoraCodigo ?? a.codigo;
    if (codigoRaw == null) continue;
    const codigo = Number(codigoRaw);
    if (!Number.isFinite(codigo)) continue;
    const descricao = a.descricao || a.nome || a.administradoraDescricao || null;
    const existente = mapaExistentes.get(codigo);
    if (existente) {
      if (descricao && existente.descricao !== descricao) {
        await atualizar(existente.id, { descricao });
      }
    } else if (!vistosNovos.has(codigo)) {
      vistosNovos.add(codigo);
      novos.push({ chave_api_id: chaveApiId, administradora_codigo: codigo, descricao, frota: false, ativo: true });
    }
  }
  if (novos.length > 0) {
    const { error } = await supabase.from('cliente_administradoras').insert(novos);
    if (error) throw error;
  }
  return listarPorRede(chaveApiId);
}
