// Config da empresa CONTRATADA (CCI) + regras gerais do contrato.
// Singleton: sempre a linha id=1 de cci_config_empresa (admin-only por RLS).

import { supabase } from '../lib/supabase';

const COLS = `id, razao_social, nome_fantasia, cnpj, inscricao_estadual, inscricao_municipal,
  endereco, numero, complemento, bairro, cidade, estado, cep, email, telefone,
  representante_nome, representante_cpf, representante_cargo, representante_email,
  regras, updated_at`;

// Retorna a config (linha singleton). Se por algum motivo não existir, devolve
// um objeto vazio com regras {} — a validação do contrato apontará o que falta.
export async function obterConfigEmpresa() {
  const { data, error } = await supabase
    .from('cci_config_empresa')
    .select(COLS)
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data || { id: 1, regras: {} };
}

// Salva a config (upsert na linha 1). `config` traz os campos da CONTRATADA e
// o objeto `regras` (vigencia/reajuste/rescisao/pagamento/foro/lgpd).
export async function salvarConfigEmpresa(config) {
  // eslint-disable-next-line no-unused-vars
  const { id, created_at, updated_at, ...payload } = config;
  const { data, error } = await supabase
    .from('cci_config_empresa')
    .update({ ...payload, regras: config.regras || {} })
    .eq('id', 1)
    .select(COLS)
    .single();
  if (error) throw error;
  return data;
}
