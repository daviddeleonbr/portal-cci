-- 217_nf_produto_embalagem
-- Manifestação de NF: conversão de embalagem no item.
-- Ex.: vieram 2 CAIXAS com 24 unidades cada → quantidade = 48 (unidades).
--   embalagem_qtd          = 2        (quantas embalagens vieram)
--   embalagem_tipo         = 'caixa'  (caixa | fardo | pacote | display | saco | outro)
--   unidades_por_embalagem = 24
--   quantidade             = 48       (sempre o total em UNIDADES; é o que a CCI lança)
-- Sem conversão: os 3 campos ficam null e quantidade é digitada direto.
-- O valor unitário deixou de ser pedido ao cliente (coluna continua, default 0).
-- Idempotente.

alter table nf_manifestacao_produto add column if not exists embalagem_qtd numeric;
alter table nf_manifestacao_produto add column if not exists embalagem_tipo text;
alter table nf_manifestacao_produto add column if not exists unidades_por_embalagem numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nf_produto_embalagem_valida') then
    alter table nf_manifestacao_produto add constraint nf_produto_embalagem_valida check (
      (embalagem_qtd is null and unidades_por_embalagem is null)
      or (embalagem_qtd > 0 and unidades_por_embalagem > 0)
    );
  end if;
end $$;
