-- ============================================================
-- Catálogo padrão de ADQUIRENTES e BANDEIRAS (BPO → Conciliação de caixas).
-- Nomes canônicos usados como dropdown na configuração de "Contas de cartão"
-- (evita digitar manualmente) e na conferência movto × Equals. Global (admin).
-- ============================================================

create table if not exists bpo_cartao_catalogo (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('adquirente', 'bandeira')),
  nome       text not null,
  created_at timestamptz default now(),
  unique (tipo, nome)
);

alter table bpo_cartao_catalogo enable row level security;

-- Admin-only (configuração interna da consultoria).
drop policy if exists bpo_cartao_catalogo_admin on bpo_cartao_catalogo;
create policy bpo_cartao_catalogo_admin on bpo_cartao_catalogo
  for all
  using (cci_is_admin())
  with check (cci_is_admin());
