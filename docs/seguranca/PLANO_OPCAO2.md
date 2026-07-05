# Plano de Segurança — Opção 2 (identidade real + RLS enforçado)

> Documento vivo. Marque o status de cada fase conforme avança.
> Princípio que guia toda a ordenação: **criar a identidade real ANTES de apertar o RLS.** Se inverter, o app fica no escuro.

## Contexto (por que existe este plano)

A autenticação do portal é custom (localStorage), então o banco só enxerga o papel público `anon` — a mesma chave que vai no bundle público do frontend. Como quase toda tabela tem apenas `policy "Allow all" using(true) with check(true)` + `grant to anon`, **a anon key é hoje um superusuário de leitura/escrita do banco inteiro**. Os route guards e a sessão no localStorage são cosméticos (gateiam a UI, não os dados).

Já foi aplicado o **bloco seguro** (migration `107`): revoke das primitivas de cripto do Autosystem e do disparador SSRF. Isso NÃO resolve o buraco principal — resolve-se apenas com identidade real + RLS, que é este plano.

## Decisão de estratégia

**JWT próprio assinado por uma Edge Function de login** (não migrar para Supabase Auth nativo). Motivo: o app tem duas sessões simultâneas (admin + cliente ao mesmo tempo) e modo demo/impersonation — o Supabase Auth assume uma sessão por client e brigaria com esse design. Com JWT próprio, mantemos `cci_usuarios_sistema` como fonte de verdade, as permissões atuais e os dois portais, e ganhamos uma identidade que o RLS lê via `auth.jwt()`.

Plano B registrado: Supabase Auth nativo (mais robusto em reset/refresh/MFA, refatoração bem maior).

## Status das fases

| Fase | Entrega | Reversível? | Status |
|---|---|---|---|
| 0 | Preparação, mapa de tenant, matriz de fumaça | Total | ✅ concluída (`MAPA_TENANT.md`, `MATRIZ_FUMACA.md`) |
| 1 | Senhas com hash (coluna nova, dual-read) | Total | ✅ migration `108` authorada — **falta aplicar** (`npx supabase db push`) |
| 2 | Login por Edge Function emitindo JWT assinado | Total (RLS ainda allow-all) | ✅ backend deployado+validado (login/refresh/rotação OK) · ✅ cutover do frontend authorado (`auth.js`, `authToken.js`, `supabase.js`, migr. 110 self-heal). Falta: aplicar 110 + smoke test via `npm run dev` |
| 3 | RLS real por tenant, tabela a tabela (canário) | Por-tabela | ✅ TODAS as tabelas (não-segredo `112`–`123` + segredos/H `124`–`129`). Admin vê tudo, cliente só a própria rede, senha protegida por coluna. |
| 4 | Segredos fora do navegador (IA/Quality/Asaas) | Reversível c/ flag | ✅ 4a-IA (proxy + `124`) · 4b-Asaas (admin-only `125`) · 4c-Quality (Opção A: RLS por tenant em `chaves_api` `126`). Chaves Anthropic/Asaas/Quality não são mais legíveis por anônimo. |
| 5 | Autorização nas Edge Functions (fecha IDOR) | Reversível | ✅ as 20 `autosystem-*` validam a posse da rede (admin ou `as_rede_id` do JWT) via `autorizarRede`/`obterRede`. auth-*/ia-proxy checam `cci_tipo`. `webposto-sync-*` são cron/service_role (sem IDOR de navegador). Resíduo menor: apertar CORS `*`. |
| 6 | Reset tokens, TLS Autosystem, **rotação de chaves** | Ponto de não-retorno parcial | 🔶 reset tokens ✅ (auth-reset `129`). **Falta:** TLS nas conexões Autosystem (testar rede a rede) + **rotação** de tudo que foi legível por anon (Quality/Asaas/Anthropic/senhas ERP/chave do Vault). |
| 7 | Verificação final, drop do texto puro, monitoração | Ponto de não-retorno final | ⬜ **Falta:** drop da coluna `senha` (após todos self-heal), policies de Storage (buckets), auditoria "deny by default", atualizar seção Security do CLAUDE.md. |

As Fases 0–2 não têm impacto para o usuário — a identidade passa a existir mas ainda não gateia nada. O risco real começa na Fase 3.

---

## Fase 0 — Preparação (sem impacto, 100% reversível)

- Backup do banco; ambiente de staging espelhado.
- **Mapa de tenant** (`MAPA_TENANT.md`): para cada tabela, qual coluna liga a linha a um dono (`chave_api_id`, `as_rede_id`, `usuario_id`, ou "global/admin"). Espinha dorsal das policies da Fase 3.
- **Matriz de fumaça** (`MATRIZ_FUMACA.md`): checklist manual de validação usado em todas as fases seguintes (não há testes automatizados).

## Fase 1 — Hash de senha (dual-read, reversível)

- Coluna `senha_hash` (bcrypt via `pgcrypto`); migração única gera o hash do texto atual; **mantém a coluna `senha`** por enquanto (rollback).
- Verificação passa a ser possível server-side via `cci_verificar_senha` (semente da Fase 2). O login atual continua usando o texto puro até a Fase 2 — nada quebra.
- Migration: `supabase/migrations/108_seguranca_hash_senha.sql`.
- Ponto de não-retorno: o `drop` da coluna `senha` fica na Fase 7.

## Fase 2 — Identidade real: login via Edge Function + JWT assinado (reversível)

- Edge Function `auth-login`: verifica o hash, carrega tipo/permissões/vínculo de rede/`empresas_permitidas`, e assina um JWT (`SUPABASE_JWT_SECRET`) com `sub`, `role: 'authenticated'` e claims da app (`cci_tipo`, `cci_usuario_id`, `chave_api_id`/`as_rede_id`, `empresas_permitidas`).
- Frontend: `loginAdmin`/`loginCliente` passam a chamar a função; o JWT entra na sessão.
- **Refatoração-chave:** hoje há um client Supabase singleton com a anon key. Para o RLS valer por usuário, cada request precisa carregar o token daquele usuário. Como há duas sessões simultâneas, é preciso dois clients (ou um wrapper que injeta o token certo por chamada).
- Risco contido: RLS ainda allow-all, então token errado não quebra nada visível. Por isso é seguro subir.
- Decisão pendente: expiração/refresh do token (vida longa simples vs refresh).

## Fase 3 — RLS real, tabela a tabela (canário — reversível por tabela)

- Trocar `using(true)` por policies que leem claims:
  - Admin → `using (auth.jwt()->>'cci_tipo' = 'admin')`.
  - Tenant → `using (chave_api_id = (auth.jwt()->>'chave_api_id')::uuid or as_rede_id = (auth.jwt()->>'as_rede_id')::uuid)` + filtro por `empresas_permitidas`.
- Ordem canário: tabelas menos arriscadas primeiro; segredos por último (dependem da Fase 4).
- **Regra de ouro:** nunca apertar o RLS de uma tabela antes de (a) identidade viva e verificada em prod e (b) todo caminho de código daquela tabela mandar o token certo.
- Rollback rápido: voltar a policy para allow-all naquela tabela.
- Teste negativo obrigatório: logado como cliente A, tentar ler dados do cliente B → vazio.

## Fase 4 — Segredos fora do navegador (reversível com flag)

- IA (Anthropic), Quality (`chaves_api.chave`) e Asaas (`configuracoes_asaas.api_key`) deixam de ser lidos pelo browser. Chamadas ao fornecedor via Edge Functions que guardam a chave (env/Vault) e autorizam o chamador (ex.: `ia-proxy`). Fim do `anthropic-dangerous-direct-browser-access`.
- Depois, RLS dessas tabelas trava em admin-only.
- Subir atrás de feature flag.

## Fase 5 — Autorização nas Edge Functions (fecha o IDOR)

- `autosystem-*`, `webposto-*`, `agendamentos-nf-emitir` param de confiar no `rede_id` do body: validam o JWT e checam posse do recurso; rejeitam cross-tenant. Cron segue com `service_role`.
- Commitar `config.toml` com `verify_jwt = true`; apertar CORS.

## Fase 6 — Reset tokens, TLS e rotação (ponto de não-retorno parcial)

- `password_reset_tokens`: inacessível ao anon; geração/validação server-side; token hasheado, uso único, expiração curta.
- TLS nas conexões Autosystem (`tls.enabled = true`) — testar rede a rede.
- **Rotação obrigatória** de tudo que foi legível por anon: chaves Quality, Asaas, Anthropic, senhas dos Postgres Autosystem e a chave de cripto do Vault (teve versão hardcoded no histórico do git).

## Fase 7 — Verificação final e limpeza (ponto de não-retorno final)

- Matriz completa em staging → produção; auditoria "deny by default" (consultar cada tabela com a anon key crua e confirmar que nada vaza); `drop` da coluna `senha`; atualizar a seção Security do CLAUDE.md para refletir o estado enforçado.

---

## Riscos transversais

1. Sessão dupla simultânea (admin+cliente) — maior complexidade de frontend, concentrada na Fase 2.
2. Modo demo/impersonation — precisa de claim especial ou token escopado; validar em cada fase.
3. Sem testes automatizados — a matriz de fumaça é a rede; considerar um e2e mínimo antes da Fase 3.
4. Expiração/refresh de token — decidir na Fase 2.
5. Rotação de credenciais é obrigatória — tudo que foi exposto deve ser considerado comprometido.

## Ordem de dependência

`0 → 1 → 2` são o alicerce (sem impacto). `3` só depois de `2` verificada em prod. `4` antes de travar o RLS das tabelas de segredo em `3`. `5` depois de `2`. `6` e `7` fecham. As Fases 3–5 podem avançar em paralelo por domínio depois que `2` estiver sólida.
