-- ============================================================
-- 045_chave_api_produto_mix
--
-- Classificacao por produto (rede Webposto / chave_api) para
-- calculo de MIX de gasolina:
--   mix = litros_aditivada / (litros_aditivada + litros_comum)
--
-- Equivalente a 040_as_rede_produto_mix, porem chaveada por
-- chave_api_id (cada rede Webposto = uma chave_api). Produtos
-- nao classificados sao ignorados no calculo.
-- ============================================================

create table if not exists chave_api_produto_mix (
  chave_api_id   uuid    not null references chaves_api(id) on delete cascade,
  produto_codigo bigint  not null,                                -- produto.codigo da QualityAPI
  produto_nome   text,                                             -- cache p/ exibicao (fallback)
  tipo           text    not null check (tipo in ('aditivada', 'comum')),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  primary key (chave_api_id, produto_codigo)
);

create index if not exists chave_api_produto_mix_chave_idx
  on chave_api_produto_mix (chave_api_id);

-- Listar classificacoes de uma rede webposto
create or replace function chave_api_produto_mix_listar(p_chave_api_id uuid)
returns setof chave_api_produto_mix
language sql security definer stable as $$
  select * from chave_api_produto_mix where chave_api_id = p_chave_api_id
$$;

-- Salvar (replace-all): apaga as classificacoes existentes da rede e
-- insere as novas. `p_classificacoes` e um array JSON
-- [{produto_codigo, produto_nome, tipo}, ...].
create or replace function chave_api_produto_mix_salvar(
  p_chave_api_id uuid,
  p_classificacoes jsonb
) returns void
language plpgsql security definer as $$
declare
  v_rec jsonb;
begin
  delete from chave_api_produto_mix where chave_api_id = p_chave_api_id;
  if jsonb_array_length(coalesce(p_classificacoes, '[]'::jsonb)) = 0 then
    return;
  end if;
  for v_rec in select * from jsonb_array_elements(p_classificacoes)
  loop
    insert into chave_api_produto_mix (chave_api_id, produto_codigo, produto_nome, tipo)
    values (
      p_chave_api_id,
      (v_rec->>'produto_codigo')::bigint,
      v_rec->>'produto_nome',
      v_rec->>'tipo'
    )
    on conflict (chave_api_id, produto_codigo) do update
      set produto_nome = excluded.produto_nome,
          tipo         = excluded.tipo,
          updated_at   = now();
  end loop;
end$$;
