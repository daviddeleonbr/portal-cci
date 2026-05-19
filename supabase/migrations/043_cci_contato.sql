-- ============================================================
-- Configuração de contato CCI exibida na landing page.
--
-- Tabela singleton (id fixo) com os canais públicos pra agendamento
-- de diagnóstico:
--   - email_contato   : usado em links mailto: + UI
--   - whatsapp_numero : digits-only (E.164 sem +), ex: '5511999998888'
--   - whatsapp_mensagem : template de mensagem inicial (opcional)
-- ============================================================

create table if not exists cci_contato (
  id int primary key default 1,
  email_contato text,
  whatsapp_numero text,
  whatsapp_mensagem text,
  updated_at timestamptz default now(),
  -- garante que só haja UMA linha (id = 1)
  constraint chk_singleton check (id = 1)
);

create trigger trg_cci_contato_updated
  before update on cci_contato
  for each row execute function update_updated_at();

-- Seed inicial vazio
insert into cci_contato (id) values (1)
on conflict (id) do nothing;

alter table cci_contato enable row level security;
create policy "Allow all for cci_contato" on cci_contato
  for all using (true) with check (true);
