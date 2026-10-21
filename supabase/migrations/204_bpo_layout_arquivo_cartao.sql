-- 204_bpo_layout_arquivo_cartao
-- Modelos de layout de arquivos de vendas de cartão (Diagnosticar): cada
-- adquirente exporta com colunas diferentes. O admin mapeia as colunas de um
-- arquivo uma vez e salva como modelo; nos próximos envios o modelo é
-- reconhecido pelos nomes das colunas e aplicado automaticamente.
--   mapeamento: { campo: "Nome da coluna no arquivo" } (adquirente, bandeira,
--               modalidade, autorizacao, valor, total, parcelas, hora)
--   adquirente: adquirente fixa do arquivo (null = vem da coluna "adquirente", ex.: Equals)
create table if not exists bpo_layout_arquivo_cartao (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(trim(nome)) between 2 and 80),
  adquirente  text,
  mapeamento  jsonb not null default '{}'::jsonb,
  colunas     text[] not null default '{}',   -- cabeçalho do arquivo de origem (reconhecimento)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (nome)
);
alter table bpo_layout_arquivo_cartao enable row level security;
revoke all on bpo_layout_arquivo_cartao from anon;
drop policy if exists bpo_layout_arquivo_cartao_adm on bpo_layout_arquivo_cartao;
create policy bpo_layout_arquivo_cartao_adm on bpo_layout_arquivo_cartao
  for all using (cci_is_admin()) with check (cci_is_admin());
