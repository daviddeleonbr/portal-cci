-- 107_seguranca_revoke_funcoes_sensiveis
-- ============================================================
-- Correção de segurança — BLOCO SEGURO (sem impacto para usuários).
--
-- Contexto: a autenticação do portal é custom (localStorage), então o
-- banco só enxerga o papel público `anon` — a mesma chave que vai no
-- bundle público do frontend. Algumas funções SECURITY DEFINER que
-- criptografam/decriptam as credenciais dos ERPs Autosystem estavam com
-- EXECUTE liberado para PUBLIC (default do Postgres em CREATE FUNCTION),
-- permitindo que qualquer cliente anônimo chamasse
-- `rpc('as_rede_decrypt', ...)` e recuperasse a senha do Postgres / token
-- de túnel de QUALQUER rede — anulando o mascaramento por role das
-- migrations 096–098.
--
-- Por que é seguro revogar: essas primitivas NUNCA são chamadas direto
-- pelo frontend. Ele usa apenas as RPCs de alto nível
-- (as_rede_get_credenciais / as_rede_set_credenciais / as_rede_create_full),
-- que são SECURITY DEFINER e chamam as primitivas internamente como DONAS
-- da função (owner = postgres). Revogar o EXECUTE de PUBLIC não afeta
-- nenhum fluxo legítimo; a service_role (Edge Functions) mantém acesso.
-- ============================================================

-- 1) Primitivas de cripto do Autosystem ─────────────────────────────
--    Só a service_role (Edge Functions) pode executar direto. As RPCs
--    definer continuam funcionando pois rodam como dona.
revoke execute on function as_rede_crypto_key()   from public;
revoke execute on function as_rede_encrypt(text)  from public;
revoke execute on function as_rede_decrypt(text)  from public;

grant  execute on function as_rede_crypto_key()   to service_role;
grant  execute on function as_rede_encrypt(text)  to service_role;
grant  execute on function as_rede_decrypt(text)  to service_role;

-- 2) Disparador de worker Webposto (mitiga SSRF) ────────────────────
--    A função aceita URL + bearer do CHAMADOR e faz net.http_post — um
--    anônimo podia forçar o banco a POSTar para qualquer host com
--    qualquer Authorization. Só o worker batch precisa chamar, e ele roda
--    como service_role (ver 069/080). Remove o acesso de anon/authenticated.
revoke execute on function cci_webposto_dispara_worker(text, text, uuid, int, date, date, text, uuid)
  from anon, authenticated;
