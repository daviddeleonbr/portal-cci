-- ============================================================
-- 186 — Banco Inter (API PJ) — SOMENTE para a conta da própria CCI
--
-- Fase 1: conexão segura + extrato + saldo, usados no Financeiro da CCI.
-- Nada aqui é de cliente: as tabelas são acessíveis só por admin COM a
-- permissão 'banco_inter' (claim cci_permissoes). Cliente nunca enxerga.
--
--  - cci_inter_conta    : dados NÃO secretos da integração (1 conta).
--  - Segredos (client_secret, certificado .crt, chave .key) ficam no
--    Supabase Vault e só a Edge Function `inter-api` (service_role) lê/grava,
--    pelas RPCs cci_inter_set_segredos / cci_inter_get_segredos.
--  - cci_inter_extrato  : cópia local do extrato (a API limita 10 chamadas/min),
--    UPSERT idempotente por id_transacao do Inter.
-- ============================================================

create extension if not exists supabase_vault;

-- Admin com a permissão do Banco Inter (mais restrito que cci_tem_permissao,
-- que libera qualquer admin).
create or replace function cci_pode_banco_inter()
returns boolean language sql stable
as $$
  select cci_is_admin()
     and coalesce((auth.jwt() -> 'cci_permissoes') ? 'banco_inter', false);
$$;

-- ─── Conta / integração (dados não secretos) ─────────────────────
create table if not exists cci_inter_conta (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null default 'Banco Inter',
  conta_corrente   text,                 -- header x-conta-corrente (opcional p/ 1 conta)
  client_id        text not null,
  -- Escopos liberados na integração (informativo / pedidos de token)
  escopos          text not null default 'extrato.read boleto-cobranca.read',
  certificado_validade timestamptz,      -- lido do .crt ao salvar (aviso de vencimento)
  tem_segredos     boolean not null default false,
  ativo            boolean not null default true,
  ultimo_teste_em  timestamptz,
  ultimo_teste_ok  boolean,
  ultimo_teste_msg text,
  ultima_sincronizacao_em timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Uma única conta (a CCI tem 1 conta no Inter).
create unique index if not exists ux_cci_inter_conta_unica on cci_inter_conta ((true));

drop trigger if exists trg_cci_inter_conta_updated on cci_inter_conta;
create trigger trg_cci_inter_conta_updated
  before update on cci_inter_conta
  for each row execute function update_updated_at();

alter table cci_inter_conta enable row level security;
drop policy if exists cci_inter_conta_sel on cci_inter_conta;
create policy cci_inter_conta_sel on cci_inter_conta
  for select using (cci_pode_banco_inter());
-- Escrita só pela Edge Function (service_role ignora RLS): sem policy de escrita.
revoke all on cci_inter_conta from anon;

-- ─── Cópia local do extrato ────────────────────────────────────────
create table if not exists cci_inter_extrato (
  id_transacao     text primary key,     -- idTransacao do Inter
  conta_id         uuid not null references cci_inter_conta(id) on delete cascade,
  data_transacao   date not null,
  data_inclusao    timestamptz,
  tipo_operacao    char(1) not null check (tipo_operacao in ('C','D')), -- C=entrada, D=saída
  tipo_transacao   text,                 -- PIX, BOLETO_COBRANCA, PAGAMENTO, TED...
  valor            numeric(14,2) not null,
  titulo           text,
  descricao        text,
  detalhes         jsonb,
  sincronizado_em  timestamptz not null default now()
);
create index if not exists ix_cci_inter_extrato_data on cci_inter_extrato (conta_id, data_transacao);

alter table cci_inter_extrato enable row level security;
drop policy if exists cci_inter_extrato_sel on cci_inter_extrato;
create policy cci_inter_extrato_sel on cci_inter_extrato
  for select using (cci_pode_banco_inter());
revoke all on cci_inter_extrato from anon;

-- ─── Segredos no Vault (só service_role) ───────────────────────────
-- Grava/atualiza os segredos. Parâmetro null = mantém o valor atual
-- (permite editar só o client_id sem reenviar o certificado).
create or replace function cci_inter_set_segredos(p_client_secret text, p_cert text, p_key text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_nome text;
  v_valor text;
  v_id uuid;
begin
  foreach v_nome in array array['inter_client_secret', 'inter_cert', 'inter_key'] loop
    v_valor := case v_nome
      when 'inter_client_secret' then p_client_secret
      when 'inter_cert' then p_cert
      else p_key end;
    if v_valor is null or v_valor = '' then continue; end if;
    select id into v_id from vault.secrets where name = v_nome;
    if v_id is null then
      perform vault.create_secret(v_valor, v_nome, 'Banco Inter (CCI) — ' || v_nome);
    else
      perform vault.update_secret(v_id, v_valor);
    end if;
  end loop;
end;
$$;

create or replace function cci_inter_get_segredos()
returns table (client_secret text, cert text, key text)
language sql
security definer
stable
set search_path = public, vault
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'inter_client_secret'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'inter_cert'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'inter_key');
$$;

-- Primitivas de segredo: NUNCA expor a anon/authenticated (só a Edge Function).
revoke execute on function cci_inter_set_segredos(text, text, text) from public, anon, authenticated;
revoke execute on function cci_inter_get_segredos() from public, anon, authenticated;
grant execute on function cci_inter_set_segredos(text, text, text) to service_role;
grant execute on function cci_inter_get_segredos() to service_role;
