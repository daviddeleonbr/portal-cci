-- ============================================================
-- Agendamentos NF: permite dia de emissão 1..31 (antes era 1..28)
-- ============================================================
--
-- Antes limitávamos a 28 pra evitar "31 de fevereiro". Agora aceitamos
-- qualquer dia 1..31 e, quando o mês não tem aquele dia (ex.: 31 em
-- fevereiro, 31 em abril), a emissão cai automaticamente no ÚLTIMO dia
-- do mês. A opção 'ultimo' (último dia do mês) continua válida.

-- ─── 1) Afrouxa o CHECK do dia_emissao ───────────────────────
-- Regex aceita: 'ultimo' OU 1..31
--   [1-9]      → 1..9
--   [12][0-9]  → 10..29
--   3[01]      → 30, 31
alter table agendamentos_nf
  drop constraint if exists agendamentos_nf_dia_emissao_check;

alter table agendamentos_nf
  add constraint agendamentos_nf_dia_emissao_check
  check (dia_emissao = 'ultimo' or dia_emissao ~ '^[1-9]$|^[12][0-9]$|^3[01]$');

-- ─── 2) Recalcula próxima emissão com clamp pro último dia ────
-- Se o dia escolhido (ex.: 31) não existe no mês alvo, usa o último
-- dia daquele mês. Aplica o clamp tanto no mês de p_base quanto no mês
-- seguinte (quando o dia já passou).
create or replace function calcular_proxima_emissao_nf(
  p_base          date,
  p_periodicidade text,
  p_dia_emissao   text
) returns date language plpgsql immutable as $$
declare
  v_proximo_mes date;
  v_dia      int;
  v_mes_base date;
  v_ultimo   int;   -- último dia do mês alvo (28/29/30/31)
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

    -- Mês de p_base: usa o dia X, mas clampa pro último dia se o mês
    -- não tiver aquele dia (ex.: dia 31 em fevereiro → 28/29).
    v_mes_base := date_trunc('month', p_base)::date;
    v_ultimo   := extract(day from (v_mes_base + interval '1 month - 1 day'))::int;
    v_proximo_mes := v_mes_base + (least(v_dia, v_ultimo) - 1) * interval '1 day';

    -- Se já passou, vai pro mês seguinte e reclampa pro último dia dele.
    if v_proximo_mes < p_base then
      v_mes_base := (v_mes_base + interval '1 month')::date;
      v_ultimo   := extract(day from (v_mes_base + interval '1 month - 1 day'))::int;
      v_proximo_mes := v_mes_base + (least(v_dia, v_ultimo) - 1) * interval '1 day';
    end if;
    return v_proximo_mes::date;
  end if;
end;
$$;

-- Reaplica o cálculo nos agendamentos ativos (trigger roda no UPDATE).
update agendamentos_nf set dia_emissao = dia_emissao where ativo;
