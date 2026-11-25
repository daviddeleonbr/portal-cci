// Faturamento da CCI: as NFS-e emitidas pela página Notas Fiscais (Asaas), já
// gravadas em notas_fiscais_asaas. Só leitura (RLS: admin). A sincronização com o
// Asaas continua na página Notas Fiscais.
import { supabase } from '../lib/supabase';

const COLS = 'id, numero, cliente_nome, cliente_cnpj, valor, valor_iss, valor_pis, valor_cofins, valor_inss, valor_ir, valor_csll, data_emissao, status, created_at';
const POR_PAGINA = 1000;

// Notas da configuração Asaas ativa (produção ou a que estiver ativa) desde `de` (YYYY-MM-DD).
// → { notas, ambiente } | { notas: [], ambiente: null } se não houver configuração
export async function listarNotasFaturamento({ de }) {
  const { data: cfg, error: e1 } = await supabase.from('configuracoes_asaas')
    .select('id, ambiente').eq('ativo', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (e1) throw e1;
  if (!cfg) return { notas: [], ambiente: null };
  const notas = [];
  for (let ini = 0; ; ini += POR_PAGINA) {
    const { data, error } = await supabase.from('notas_fiscais_asaas').select(COLS)
      .eq('config_id', cfg.id).gte('data_emissao', de)
      .order('data_emissao', { ascending: true }).order('id', { ascending: true })
      .range(ini, ini + POR_PAGINA - 1);
    if (error) throw error;
    notas.push(...(data || []));
    if (!data || data.length < POR_PAGINA) break;
  }
  return { notas, ambiente: cfg.ambiente };
}
