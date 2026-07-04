# Fase 2 — Backend (auth-login / auth-refresh)

Estratégia de token escolhida: **access curto (~1h) + refresh (~30d) com rotação.**

## O que foi entregue (authorado, NÃO deployado)

- `supabase/migrations/108_seguranca_hash_senha.sql` — `senha_hash` + `cci_verificar_senha`.
- `supabase/migrations/109_seguranca_refresh_tokens.sql` — tabela `cci_refresh_tokens` (RLS on, só service_role).
- `supabase/functions/_shared/auth-jwt.ts` — assinatura/verificação HS256, claims, helpers.
- `supabase/functions/auth-login/index.ts` — verifica senha (hash) e emite access+refresh.
- `supabase/functions/auth-refresh/index.ts` — rotaciona refresh e emite novo access.

Nada disso afeta o app atual até o **cutover do frontend** (próximo passo, ainda não feito).

## Passos para colocar de pé (em STAGING primeiro)

1. **Aplicar migrations:**
   ```bash
   npx supabase db push        # aplica 107, 108, 109
   ```
2. **Configurar o segredo de assinatura** (tem que ser o MESMO JWT Secret do projeto — Dashboard > Settings > API > JWT Secret; senão o PostgREST rejeita o token). O prefixo `SUPABASE_` é reservado pelo CLI, então o nome é `APP_JWT_SECRET`:
   ```bash
   npx supabase secrets set APP_JWT_SECRET="<JWT Secret do dashboard>"
   ```
3. **Deploy das funções:**
   ```bash
   npx supabase functions deploy auth-login
   npx supabase functions deploy auth-refresh
   ```
4. **Testar por fora do app** (sem tocar no frontend ainda):
   ```bash
   # login
   curl -X POST "$SUPABASE_URL/functions/v1/auth-login" \
     -H "apikey: $ANON" -H "content-type: application/json" \
     -d '{"email":"...","senha":"...","portal":"admin"}'
   # esperado: { access_token, refresh_token, expires_in: 3600, usuario }

   # validar que o access_token é aceito pelo PostgREST (RLS ainda allow-all,
   # então deve retornar dados — o que importa é NÃO dar 401 de JWT inválido):
   curl "$SUPABASE_URL/rest/v1/clientes?select=id&limit=1" \
     -H "apikey: $ANON" -H "Authorization: Bearer <access_token>"

   # refresh
   curl -X POST "$SUPABASE_URL/functions/v1/auth-refresh" \
     -H "apikey: $ANON" -H "content-type: application/json" \
     -d '{"refresh_token":"<refresh_token>"}'
   ```
   Decodificar o `access_token` em jwt.io e conferir os claims: `role=authenticated`, `sub`, `cci_tipo`, e `chave_api_id`/`as_rede_id` conforme o usuário.

## Critério de aceite (antes do cutover do frontend)

- [ ] `auth-login` retorna token para admin, cliente webposto e cliente autosystem.
- [ ] Senha errada → 401; usuário inativo → 403; portal errado → 403.
- [ ] O `access_token` é aceito pelo PostgREST (não dá 401 de "JWT invalid").
- [ ] `auth-refresh` rotaciona (o refresh antigo passa a dar 401).
- [ ] Claims corretos no token (conferir no jwt.io).

## Próximo passo (cutover do frontend — ainda NÃO feito, é o portão de risco)

Só depois do aceite acima:
1. `src/lib/auth.js`: `loginAdmin`/`loginCliente` chamam `auth-login` em vez de comparar senha no cliente; a sessão passa a guardar `access_token` + `refresh_token` + `usuario`.
2. Injetar o `access_token` nas chamadas Supabase. Como há **duas sessões simultâneas** (admin+cliente), não dá pra usar o singleton global cru — opções:
   - dois clients (`supabaseAdmin`/`supabaseCliente`) cada um com seu `Authorization`, ou
   - um wrapper que escolhe o token por contexto de rota.
3. Refresh silencioso: interceptar 401/expiração e chamar `auth-refresh`; se falhar, logout.
4. Modo demo/impersonation: emitir um access token especial (claim `_demo`) ou manter o caminho atual só para demo.
5. Rodar `MATRIZ_FUMACA.md` inteira em staging antes de produção.

> Enquanto o RLS seguir allow-all (até a Fase 3), um token mal-injetado **não vaza nem bloqueia dados** — por isso o cutover é seguro de validar. O aperto real vem na Fase 3, tabela a tabela.
