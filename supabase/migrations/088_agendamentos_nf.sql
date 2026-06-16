-- ============================================================
-- Agendamento recorrente de emissão de notas fiscais
-- ============================================================
--
-- Cada linha representa uma "regra" que dispara a emissão de uma NFS-e
-- para um cliente em uma data periódica (mensal por padrão, normalmente
-- no último dia útil/calendário do mês). O cron/worker percorre as
-- linhas com `ativo=true AND proxima_emissao <= today` e chama a API
-- do Asaas pra cada uma, atualizando `ultima_emissao` e recalculando
-- `proxima_emissao` em seguida.

create table if not exists agendamentos_nf (
  id uuid default gen_random_uuid() primary key,
  config_id uuid not null references configuracoes_asaas(id) on delete cascade,

  -- Tomador do serviço (snapshot — não amarra ao cadastro do cliente
  -- pra continuar funcionando mesmo que o cliente seja editado/removido)
  cliente_id      uuid,                          -- ref opcional ao cci_clientes
  cliente_nome    text not null,
  cliente_cnpj    text,
  cliente_email   text,

  -- Dados do serviço (replicados a cada emissão)
  descricao             text     not null,
  observacoes           text,
  valor                 numeric(15,2) not null,
  deducoes              numeric(15,2) default 0,
  aliquota_iss          numeric(5,2),
  national_service_code text not null,           -- NBS (ex: '17.03.03')
  serie                 text default '1',

  -- Recorrência
  -- periodicidade: 'mensal' (MVP). Futuro: 'semanal', 'quinzenal'.
  -- dia_emissao: 'ultimo' (último dia do mês) OU número 1..28 (dia X do mês).
  --   Limitamos a 28 pra evitar "31 de fevereiro".
  periodicidade text not null default 'mensal'
    check (periodicidade in ('mensal')),
  dia_emissao   text not null default 'ultimo'
    check (dia_emissao = 'ultimo' or dia_emissao ~ '^[1-9]$|^1[0-9]$|^2[0-8]$'),

  -- Estado da execução
  ativo            boolean default true,
  proxima_emissao  date,                         -- calculado em INSERT/UPDATE
  ultima_emissao   date,
  notas_emitidas   int default 0,
  ultimo_erro      text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Função: calcula próxima emissão a partir de uma data base ─
-- baseado em (periodicidade, dia_emissao). A data retornada é
-- sempre > base (nunca retorna a própria base).
create or replace function calcular_proxima_emissao_nf(
  p_base          date,
  p_periodicidade text,
  p_dia_emissao   text
) returns date language plpgsql immutable as $$
declare
  v_proximo_mes date;
  v_dia int;
begin
  if p_periodicidade <> 'mensal' then
    return p_base + interval '1 month'; -- fallback simples
  end if;

  if p_dia_emissao = 'ultimo' then
    -- Último dia do mês de p_base. Se ainda for >= p_base, usa esse;
    -- senão, vai pro mês seguinte.
    v_proximo_mes := (date_trunc('month', p_base) + interval '1 month - 1 day')::date;
    if v_proximo_mes < p_base then
      v_proximo_mes := (date_trunc('month', p_base) + interval '2 month - 1 day')::date;
    end if;
    return v_proximo_mes;
  else
    v_dia := p_dia_emissao::int;
    -- Dia X do mês atual; se já passou, vai pro mês seguinte.
    v_proximo_mes := make_date(extract(year from p_base)::int,
                               extract(month from p_base)::int,
                               v_dia);
    if v_proximo_mes < p_base then
      v_proximo_mes := (date_trunc('month', p_base) + interval '1 month')::date
                       + (v_dia - 1) * interval '1 day';
    end if;
    return v_proximo_mes::date;
  end if;
end;
$$;

-- ─── Trigger: mantém proxima_emissao sempre coerente ──
-- Em INSERT, calcula a partir de hoje (ou ultima_emissao+1).
-- Em UPDATE da recorrência, recalcula. Em UPDATE que só mexe
-- em ultima_emissao, recalcula a partir dela.
create or replace function trg_agendamento_nf_calcular_proxima()
returns trigger language plpgsql as $$
declare
  v_base date;
begin
  -- Se a regra mudou ou é INSERT, recalcula a partir da última emissão ou de hoje
  if TG_OP = 'INSERT'
     or NEW.periodicidade is distinct from OLD.periodicidade
     or NEW.dia_emissao   is distinct from OLD.dia_emissao
     or NEW.ultima_emissao is distinct from OLD.ultima_emissao
  then
    v_base := coalesce(NEW.ultima_emissao + 1, current_date);
    NEW.proxima_emissao := calcular_proxima_emissao_nf(v_base, NEW.periodicidade, NEW.dia_emissao);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_agendamento_nf_proxima on agendamentos_nf;
create trigger trg_agendamento_nf_proxima
  before insert or update on agendamentos_nf
  for each row execute function trg_agendamento_nf_calcular_proxima();

create trigger trg_agendamentos_nf_updated
  before update on agendamentos_nf
  for each row execute function update_updated_at();

-- ─── Indexes ─────────────────────────────────────────────────
create index if not exists idx_agendamentos_nf_config       on agendamentos_nf(config_id);
create index if not exists idx_agendamentos_nf_proxima      on agendamentos_nf(proxima_emissao) where ativo;
create index if not exists idx_agendamentos_nf_cliente      on agendamentos_nf(cliente_id);

-- ─── RLS ─────────────────────────────────────────────────────
alter table agendamentos_nf enable row level security;
create policy "Allow all for agendamentos_nf"
  on agendamentos_nf for all using (true) with check (true);

grant all on agendamentos_nf to anon, authenticated;
