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

> This project currently ships with a **systemic critical vulnerability class** that must not be replicated in new code, and should be actively remediated. Treat everything in this section as mandatory, not advisory. When a change would touch auth, database policies, secrets, or the Edge Function boundary, prefer the secure pattern below even if the surrounding legacy code does it the insecure way — and flag the legacy instance so it gets fixed.

### The root cause you must understand

Auth is **custom (localStorage), not Supabase Auth**. The database therefore only ever sees the public **`anon`** role — the same anon key shipped in the frontend bundle. Yet nearly every table is protected only by `create policy "Allow all" ... using (true) with check (true)` plus default (or explicit) `grant ... to anon`. **Net effect: the public anon key is a read/write superuser over the whole database.** Route guards (`RequireAdmin`, `hasPermissaoCliente`, etc.) and the localStorage session are **cosmetic** — they gate the UI, not the data. Anyone with the anon key (it is in the JS bundle) can bypass the entire app and call PostgREST / RPCs directly.

Because of this, the following are all currently exploitable by an anonymous client and **must be fixed** (do not add more of the same):

- **Plaintext passwords.** `cci_usuarios_sistema.senha` is stored in cleartext and compared client-side in [src/lib/auth.js](src/lib/auth.js) (`usuario.senha !== senha`). Anon can `select email, senha, permissoes` and dump every admin+client credential, or `update` its own `permissoes` to escalate. A seed admin password is even committed in migration `016`.
- **Reset-token takeover.** `password_reset_tokens` (migration `042`) is anon read/write — anyone can read or mint a valid token for any user and complete the redefinir-senha flow.
- **Decryptable ERP credentials.** `as_rede` ciphertext columns (`*_enc`) are anon-readable, and the `SECURITY DEFINER` functions `as_rede_decrypt` / `as_rede_encrypt` / `as_rede_crypto_key` have no `REVOKE EXECUTE FROM public`, so anon can call `rpc('as_rede_decrypt', …)` and recover every Autosystem client's live Postgres password + tunnel token. This nullifies the role-gated `as_rede_get_credenciais` masking added in migrations `096`–`098`.
- **Plaintext third-party keys readable by anon.** Quality API keys (`chaves_api.chave`), the Asaas token (`configuracoes_asaas.api_key`), and the Anthropic key (`configuracoes_ia.api_key` — this table never even had `enable row level security`).
- **Open Edge Functions with service-role DB access.** The `autosystem-*`, `webposto-sync-*`, and `agendamentos-nf-emitir` functions create a `SERVICE_ROLE_KEY` client and **do no caller authN/authZ** — they trust a `rede_id`/`chave_api_id` from the request body. CORS is `*`. This is cross-tenant IDOR: enumerate UUIDs → pull any client's financials. `cci_webposto_dispara_worker` (migration `080`, `grant execute to anon`) takes a caller-supplied URL + bearer token → SSRF.
- **Plaintext TCP to client DBs.** [supabase/functions/_shared/autosystem-query.ts](supabase/functions/_shared/autosystem-query.ts) uses `tls: { enabled: false }` in direct-TCP mode.

### Mandatory rules for new code

1. **Never store or compare passwords in plaintext.** Passwords must be hashed (bcrypt/argon2) and verified **server-side** (Edge Function or Postgres function), never in the browser. Never `select` a password/secret column into the client. Never commit a credential to a migration or the repo.
2. **RLS must actually restrict.** Do **not** write `using (true) with check (true)` on any new table, and do not `grant ... to anon` tables holding user data, financials, PII, or secrets. Every new table gets `enable row level security` plus a policy scoped to the real tenant/identity. Until the app moves to a trusted server identity (see below), any table exposed to the browser must assume the reader is a hostile anonymous client.
3. **Secrets never reach the browser.** API keys (Anthropic, Asaas, Quality) and any credential belong server-side (Edge Function env / Supabase Vault), fronted by a function that authorizes the caller. Do not add new "call the vendor API directly from the browser with the key" paths (the existing Anthropic-in-browser and localStorage key are legacy debt to unwind, not a pattern to copy).
4. **Every Edge Function must authenticate and authorize the caller** before doing service-role work. Verify a real session/token, resolve *who* is calling, and check they own the `rede_id`/`cliente_id`/empresa they're asking about. Do not trust tenant identifiers from the request body. Keep `verify_jwt` on; commit `supabase/config.toml` so function auth settings are reviewable. Tighten CORS to known origins.
5. **`SECURITY DEFINER` functions must be locked down.** Add `REVOKE EXECUTE ... FROM public;` and grant execute only to the intended role. Never expose a decrypt/crypto-key primitive to `anon`/`public`. Never accept a target URL or credential as a caller-supplied parameter to a definer function (SSRF).
6. **Encrypt transport to client databases** (`tls: { enabled: true }`) and keep encryption keys in Vault, never hardcoded in a migration.
7. **Validate and parameterize.** Keep SQL parameterized (`$1..$n`) — never string-concatenate user input into SQL. Sanitize file names/paths (see `sanitizarNomeArquivo`). Avoid `dangerouslySetInnerHTML`/`innerHTML`/`eval` (currently none in the codebase — keep it that way).

### The real fix (when the user prioritizes it)

The durable remediation is to give the database a **trusted identity** so RLS can mean something — either migrate to Supabase Auth, or issue signed JWTs from a login Edge Function and have RLS policies read `auth.uid()`/claims instead of `using (true)`. Passwords move to server-side hashing; secrets move behind authorized functions; Edge Functions gain caller authorization. Until then, be explicit with the user that the portal's access control is **UI-only** and the anon key is effectively a master key. Do not describe the current state as secure.
