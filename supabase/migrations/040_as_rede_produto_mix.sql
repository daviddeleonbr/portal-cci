-- ============================================================
-- 040_as_rede_produto_mix
--
-- Classificação por produto do Autosystem para cálculo de MIX
-- (gasolina aditivada / (gasolina aditivada + gasolina comum)).
--
-- Cada rede classifica seus próprios produtos como `aditivada` ou
-- `comum`. Produtos não classificados são ignorados no cálculo.
-- ============================================================

create table if not exists as_rede_produto_mix (
  rede_id        uuid    not null references as_rede(id) on delete cascade,
  produto_codigo bigint  not null,                                -- produto.grid no Autosystem
  produto_nome   text,                                             -- cache p/ exibição (fallback)
  tipo           text    not null check (tipo in ('aditivada', 'comum')),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  primary key (rede_id, produto_codigo)
);

create index if not exists as_rede_produto_mix_rede_idx
  on as_rede_produto_mix (rede_id);

-- Listar classificações de uma rede
create or replace function as_rede_produto_mix_listar(p_rede_id uuid)
returns setof as_rede_produto_mix
language sql security definer stable as $$
  select * from as_rede_produto_mix where rede_id = p_rede_id
$$;

-- Salvar (replace-all): apaga as classificações existentes da rede e
-- insere as novas. `p_classificacoes` é um array JSON
-- [{produto_codigo, produto_nome, tipo}, ...].
create or replace function as_rede_produto_mix_salvar(
  p_rede_id uuid,
  p_classificacoes jsonb
) returns void
language plpgsql security definer as $$
declare
  v_rec jsonb;
begin
  delete from as_rede_produto_mix where rede_id = p_rede_id;
  if jsonb_array_length(coalesce(p_classificacoes, '[]'::jsonb)) = 0 then
    return;
  end if;
  for v_rec in select * from jsonb_array_elements(p_classificacoes)
  loop
    insert into as_rede_produto_mix (rede_id, produto_codigo, produto_nome, tipo)
    values (
      p_rede_id,
      (v_rec->>'produto_codigo')::bigint,
      v_rec->>'produto_nome',
      v_rec->>'tipo'
    )
    on conflict (rede_id, produto_codigo) do update
      set produto_nome = excluded.produto_nome,
          tipo         = excluded.tipo,
          updated_at   = now();
  end loop;
end$$;
