-- ============================================================
-- Produtos novos (não cadastrados no Webposto). Quando o cliente
-- escaneia um código e o produto não existe no catálogo, ele cadastra
-- como "produto_novo" e anexa duas fotos: o produto em si e o código
-- de barras. A CCI usa essas fotos pra cadastrar no Webposto e lançar.
-- ============================================================

alter table nf_manifestacao_produto
  add column if not exists produto_novo boolean not null default false;

-- Permite associar arquivos a um produto específico (foto_produto e
-- foto_codigo_barras). Quando produto_id é NULL, o arquivo pertence à
-- nota como um todo (nota_fiscal, boleto — comportamento original).
alter table nf_manifestacao_arquivo
  add column if not exists produto_id uuid
    references nf_manifestacao_produto(id) on delete cascade;

create index if not exists idx_nf_manif_arquivo_produto
  on nf_manifestacao_arquivo(produto_id);

-- Atualiza check de tipo pra incluir os novos formatos.
alter table nf_manifestacao_arquivo
  drop constraint if exists nf_manifestacao_arquivo_tipo_check;

alter table nf_manifestacao_arquivo
  add constraint nf_manifestacao_arquivo_tipo_check
  check (tipo in ('nota_fiscal', 'boleto', 'foto_produto', 'foto_codigo_barras'));

-- Garante consistência: tipos de produto exigem produto_id, e os demais
-- exigem produto_id NULL.
alter table nf_manifestacao_arquivo
  drop constraint if exists nf_manifestacao_arquivo_produto_id_check;

alter table nf_manifestacao_arquivo
  add constraint nf_manifestacao_arquivo_produto_id_check
  check (
    (tipo in ('foto_produto', 'foto_codigo_barras') and produto_id is not null)
    or
    (tipo in ('nota_fiscal', 'boleto') and produto_id is null)
  );
