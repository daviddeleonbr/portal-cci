-- Exportação contábil: opção por rede+plano — quando a linha não tem histórico
-- (nenhuma regra de histórico casou ou o template saiu vazio), usa a observação
-- (movto.obs, token {obs}) do lançamento no sistema.
-- plano_contabil_rede já é admin-only (policy plano_contabil_rede_admin).
alter table plano_contabil_rede
  add column if not exists historico_fallback_obs boolean not null default false;
