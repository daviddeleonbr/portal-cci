# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language & conventions

The entire codebase is in **Brazilian Portuguese** — identifiers, comments, UI strings, table/column names, and route segments. Match this when writing new code (e.g. `listarClientes`, `salvarMapeamento`, `chaveApiId`). Comments are written casually and densely; follow the surrounding style. This is `.jsx`/JavaScript with ESM (`"type": "module"`) — there is **no TypeScript** in the frontend (only the Deno Edge Functions are `.ts`), and there are **no tests**.

## Commands

```bash
npm run dev        # Vite dev server (HMR). Proxies /api/quality, /api/asaas[-sandbox] — see vite.config.js
npm run build      # Production build (vite build)
npm run preview    # Serve the production build locally
npm run lint       # ESLint over the whole repo (eslint.config.js, flat config)
```

There is no test runner. Verification is manual via `npm run dev`.

Supabase CLI (`supabase` is a dev dependency) manages the backend:
```bash
npx supabase db push                       # apply migrations in supabase/migrations/ (numbered NNN_*.sql)
npx supabase functions deploy <name>       # deploy an Edge Function from supabase/functions/<name>
```

### Environment

Frontend needs `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Edge Functions read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the Deno env. The Anthropic API key for AI features is **not** an env var — it is stored admin-side in the `configuracoes_ia` table (see AI section).

## Architecture

A single-page React app (React 19, React Router 7, Tailwind 4, Vite 8, PWA via `vite-plugin-pwa`) backed entirely by **Supabase** (Postgres + Edge Functions). There is no custom backend server — the browser talks to Supabase directly, plus a few external APIs through the Vite dev proxy / Edge Functions.

### Two portals, custom auth

The app is split into an **Admin portal** (`/admin/*`, the CCI consultancy's internal tooling) and a **Client portal** (`/cliente/*`, for gas-station network owners). Routing for everything lives in [src/App.jsx](src/App.jsx).

Auth is **custom, not Supabase Auth** — see [src/lib/auth.js](src/lib/auth.js). Login queries the `cci_usuarios_sistema` table and compares the password directly. Sessions are plain objects in `localStorage` under two independent keys (`cci_session_admin`, `cci_session_cliente`), so a person can be logged into both portals at once. [src/hooks/useAuth.js](src/hooks/useAuth.js) exposes the session reactively via `useSyncExternalStore` (listening to `storage` and a custom `cci:session-change` event). Route guards live in [src/components/auth/RequireAuth.jsx](src/components/auth/RequireAuth.jsx): `RequireAdmin`, `RequireCliente`, `RequirePermissaoCliente` (per-feature gating), and `RequireDashboardCliente`.

Permissions are string keys checked against `usuario.permissoes`. The canonical catalogs (`PERMISSOES_ADMIN`, `PERMISSOES_CLIENTE`) live in [src/services/usuariosSistemaService.js](src/services/usuariosSistemaService.js) — keep route guards, sidebar visibility, and these catalogs in sync when adding a feature.

### Client portal: two backend "tipos" (webposto vs autosystem)

A client user is bound to exactly one ERP source — either **Webposto** (`chaves_api` row → `tipoCliente: 'webposto'`) or **Autosystem** (`as_rede` row → `tipoCliente: 'autosystem'`); a schema XOR constraint enforces exclusivity. `loginCliente` detects which one and stores `tipoCliente` in the session; this governs the URL prefix (`/cliente/webposto/*` vs `/cliente/autosystem/*`) and which page implementations render. Page components are duplicated under [src/pages/cliente/webposto/](src/pages/cliente/webposto/) and [src/pages/cliente/autosystem/](src/pages/cliente/autosystem/), with shared pieces in [src/components/vendas/](src/components/vendas/). The session also carries `clientesRede` (all empresas the user may see) and an active `cliente`; the header lets the user switch the active empresa via `trocarEmpresaAtiva`.

### Data sources & the Edge Function layer

Two external ERP integrations feed the client portal, and they work very differently:

- **Webposto → Quality API** (REST). The browser calls it through the Vite proxy (`/api/quality` in dev) via [src/services/qualityApiService.js](src/services/qualityApiService.js), which has its own in-memory cache + semaphore (HTTP/2 multiplexing, chunked by date range). Sales data is **also synced into Supabase cache tables** (`cci_webposto_venda*`) by Edge Function workers ([webposto-sync-vendas](supabase/functions/webposto-sync-vendas), `*-batch`); syncs are idempotent UPSERTs and the client reads aggregates back via Postgres RPCs (see migrations `070`–`081`).
- **Autosystem → remote Postgres** (live query). Each `as_rede` stores **encrypted** DB credentials (`*_enc` columns, key in `supabase_vault`); the frontend never reads them — it goes through RPCs (`as_rede_get_credenciais`, `as_rede_set_credenciais`, `as_rede_create_full`). The `autosystem-*` Edge Functions run live SQL against the client's Postgres via [supabase/functions/_shared/autosystem-query.ts](supabase/functions/_shared/autosystem-query.ts), which abstracts the transport (direct TCP or HTTPS-via-Cloudflare-tunnel). Note the documented encoding caveat (`convert_to(..., 'LATIN1')` only works in TCP mode).

### Service layer

`src/services/*.js` is the data-access layer — one module per domain, each a thin wrapper over `supabase.from(...)` calls (or Edge Function / external API calls). The shared client is the singleton in [src/lib/supabase.js](src/lib/supabase.js). Pages and components import services; **they do not call `supabase` directly**. Follow this pattern: a new feature gets a `xxxService.js` exporting `listar/buscar/criar/atualizar/excluir`-style functions that `throw` on error.

### Webposto client-side cache (v3)

[src/services/webpostoCacheV3.js](src/services/webpostoCacheV3.js) is a two-tier cache (RAM `Map` for synchronous reads + IndexedDB for persistence, 24h TTL) because Webposto datasets blow past the localStorage quota. [src/main.jsx](src/main.jsx) **hydrates RAM from IndexedDB before rendering** (races a 500ms timeout). Keys are `pagina:chaveApiId`. On logout, webposto caches are cleared to prevent cross-session leakage. (`webpostoCacheV2.js` is the older localStorage version; v3 cleans up its leftover keys.)

### AI features (Claude)

Several reports offer an "Análise com IA" view. [src/services/iaSharedHelpers.js](src/services/iaSharedHelpers.js) calls the Anthropic API **directly from the browser** (`anthropic-dangerous-direct-browser-access`). The API key, model, and params are admin-managed in the `configuracoes_ia` Supabase table (with a localStorage fallback/hydration for legacy sync code). Domain-specific prompt builders live in `vendasInsightsService.js`, `dreInsightsService.js`, `fluxoInsightsService.js`, `diagnosticoGeralService.js`. When touching model IDs or API params here, consult the `claude-api` skill rather than relying on memory.

### Domain concepts

This is a **BPO contábil** (accounting outsourcing) product for fuel-station networks. Recurring concepts:
- **DRE** (income statement) and **Fluxo de Caixa** (cash flow): built from configurable **máscaras** (templates of `grupos_dre`) plus **mapeamento** rules that map source accounts/sales categories into those groups. See `mascaraDreService`, `mascaraFluxoCaixaService`, `mapeamento*Service`, and the `/admin/parametros` pages.
- **Rede** = a client network (a `chaves_api` for Webposto or an `as_rede` for Autosystem); reports exist in per-empresa and consolidated **rede** variants (`Relatorio*Rede`, `Relatorio*AsRede`).
- **BPO** admin tools: conciliação bancária/caixas, manifestação de NF, caixa administrativo (`Bpo*` pages, `bpoConciliacaoService`, `extratosBancariosService`, `ofxCorrelacaoService`).
- **Asaas** integration for boletos (via the `/api/asaas` proxy and `asaasApiService` / `asaasConfigService`).

### Routing notes

Many legacy paths `<Navigate>`-redirect to current ones, and several admin "tab" pages (Cadastros, Financeiro, Parâmetros) are reached by multiple URLs that all render one component — the URL just picks the initial tab. When adding routes, mirror this and keep the `webposto`/`autosystem` pair in sync.

## Security (READ FIRST when touching auth, RLS, secrets, or Edge Functions)

> The app was hardened in Fases 1–5 of a phased plan (see [docs/seguranca/](docs/seguranca/) — `PLANO_OPCAO2.md` is the index). Auth is now a **custom signed JWT** (NOT Supabase Auth), passwords are **bcrypt-hashed**, RLS is **enforced by tenant on every table**, secrets are **server-side**, and Edge Functions **authorize the caller**. The rules below are how it works now and must stay true — do not reintroduce the old `using(true)` / plaintext / key-in-browser patterns. Full history and per-table policy map in `docs/seguranca/`.

### The identity model (how RLS actually works)

Login goes through the **`auth-login` Edge Function** ([supabase/functions/auth-login](supabase/functions/auth-login)): it verifies the password hash server-side (RPC `cci_verificar_senha`) and mints a JWT **signed with the project JWT secret** (`APP_JWT_SECRET`), carrying claims `cci_tipo`, `cci_usuario_id`, `chave_api_id`, `as_rede_id`, `empresas_permitidas`, `cci_permissoes`. The frontend stores it and [src/lib/authToken.js](src/lib/authToken.js) injects it into every Supabase request via the supabase-js `accessToken` option (picking the admin vs cliente token by route; silent refresh via `auth-refresh`). So PostgREST/RPCs see a **real identity**, and RLS policies read it through helper functions (migration `111`): `cci_is_admin()`, `cci_jwt_chave_api_id()`, `cci_jwt_as_rede_id()`, `cci_jwt_usuario_id()`, `cci_rede_bate(...)`, `cci_pode_ver_cliente(cliente_id)`. **Route guards (`RequireAdmin`, etc.) are still UI-only — the DB enforcement is the RLS.**

Migrations `107`–`129` carry the whole RLS rollout (canário → B/C/D/E/F/G → segredos/H). Every table is `enable row level security` with tenant-scoped policies; the old `"Allow all"` policies are gone.

### Mandatory rules for new code

1. **Passwords: hash, server-side only.** Verify via `cci_verificar_senha` / set via `cci_definir_senha` (both `SECURITY DEFINER`, service_role-only) inside an Edge Function. Never compare/store plaintext, never `select senha`/`senha_hash` into the browser (a column-level `REVOKE SELECT (senha, senha_hash)` enforces this — keep table reads to explicit column lists, never `select('*')` on `cci_usuarios_sistema`; see the `COLS` const in `usuariosSistemaService.js`).
2. **RLS by tenant on every new table.** `enable row level security` + policies using the helper functions. **Never** `using (true) with check (true)`, never `grant ... to anon` on data. Pattern: `using (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id))` for tenant tables, `cci_pode_ver_cliente(cliente_id)` for por-empresa, `cci_is_admin()` for admin-global. Client-written tables need the tenant predicate in `with check` too. Drop the allow-all policy **by its exact name** when tightening (some are `"todos"`, `p_*_all`, etc. — see `docs/seguranca/FASE3_RLS.md`).
3. **Secrets never reach the browser.** Vendor keys (Anthropic, Asaas, Quality) live in DB tables read only by `service_role`, or in Vault. Call vendors through an Edge Function that injects the key and authorizes the caller (e.g. `ia-proxy` for Claude — note it **streams** SSE to dodge the 150s idle timeout). The secret tables (`configuracoes_ia`, `configuracoes_asaas`, `chaves_api`, `as_rede`, `cci_usuarios_sistema`, `password_reset_tokens`) are admin-only or tenant-scoped + revoked from anon.
4. **Edge Functions must authorize the caller.** Decode the JWT, check `cci_tipo === 'admin'` OR that the requested `rede_id`/`cliente_id` belongs to the caller — never trust a tenant id from the body alone. For Autosystem functions this is centralized in `obterRede(supabase, redeId, req)` → `autorizarRede(req, redeId)` in [supabase/functions/_shared/autosystem-query.ts](supabase/functions/_shared/autosystem-query.ts); pass `req`. Public/pre-login functions (`auth-login`, `auth-refresh`, `auth-reset`, `auth-primeiro-acesso`) deploy with `--no-verify-jwt`; everything else keeps `verify_jwt` on.
5. **`SECURITY DEFINER` functions stay locked down.** `REVOKE EXECUTE ... FROM public;` + grant only to the intended role (see migration `107` for the `as_rede_*` crypto primitives). Never expose a decrypt/crypto-key primitive to `anon`, never accept a caller-supplied URL/credential to a definer function (SSRF).
6. **Keep SQL parameterized** (`$1..$n`), sanitize file names (`sanitizarNomeArquivo`), no `dangerouslySetInnerHTML`/`eval` (there are none — keep it that way).

### Known residuals (not yet done — Fases 6–7)

- **Key rotation pending** (`docs/seguranca/ROTACAO_CHAVES.md`): Quality/Asaas/Anthropic keys and Autosystem ERP passwords were readable by anon historically — treat as compromised until rotated.
- Autosystem TCP is still `tls: { enabled: false }` (`_shared/autosystem-query.ts`) — enable per-rede after testing.
- The plaintext `cci_usuarios_sistema.senha` column still exists (self-heals to hash on login) — drop it once all users have logged in.
- Storage buckets (`storage.objects`) still allow-all — a per-tenant policy pass is pending.
- Edge Function CORS is still `*` — tighten to known origins.
