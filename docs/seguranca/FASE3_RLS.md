# Fase 3 — RLS real, tabela a tabela (canário)

Troca o `using(true)` por policies que leem os claims do JWT (Fase 2), em lotes pequenos, testando cada um. Base: [MAPA_TENANT.md](MAPA_TENANT.md). Helpers: migração `111`.

## ⛔ Pré-requisito inegociável

A Fase 2 tem que estar **funcionando no app rodando** (login injeta o token em todo request). Se o token não flui em algum caminho, apertar o RLS **derruba aquela feature**. Não aplique nenhum lote da Fase 3 antes disso.

O **canário #1** é justamente o primeiro teste real disso, isolado numa tabela admin de baixo risco.

## Padrões de policy (usando os helpers da 111)

| Classe | Policy `using` (e `with check`) |
|---|---|
| ADMIN_GLOBAL (admin-only) | `cci_is_admin()` |
| ADMIN_GLOBAL (lê todo mundo, escreve admin) | select: `true` · insert/update/delete: `cci_is_admin()` |
| TENANT_WEBPOSTO / AUTOSYSTEM / AMBOS | `cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id)` |
| POR_EMPRESA (via cliente_id) | `cci_pode_ver_cliente(cliente_id)` |
| Filha indireta | `cci_is_admin() or exists(select 1 from <pai> p where p.id = <fk> and <cond. do pai>)` |
| SEGREDO | `cci_is_admin()` **e** revoke anon **e** só depois da Fase 4 |

> **Sempre incluir `cci_is_admin()`** nas tabelas de tenant — o portal admin gerencia todas as redes e precisa enxergar tudo.

## Procedimento por lote

1. Aplicar a migração do lote (`npx supabase db push`).
2. Rodar o trecho relevante da [MATRIZ_FUMACA.md](MATRIZ_FUMACA.md) — incluindo o **teste negativo** (cliente A não vê dados de B).
3. ✅ passou → próximo lote. ❌ quebrou → rodar o bloco de ROLLBACK que vai comentado no fim de cada migração (volta a tabela para allow-all na hora) e investigar qual caminho não manda o token.

Cada migração de lote **dropa a policy allow-all pelo nome exato** (senão a permissiva se soma por OR e a restritiva não vale nada) e cria a nova.

## Ordem dos lotes

| Lote | Alvo | Objetivo | Migração |
|---|---|---|---|
| **A — Canário** | `cci_fornecedores` (admin ✅ aplicado), `cliente_administradoras` (webposto), `as_rede_grupo_produto` (autosystem) | Validar os 3 caminhos de token isoladamente | `112` ✅, `113` ▶, `114` ▶ |
| B — Admin-global | masks DRE/fluxo, plano_contas, motivos, fornecedores(já), catálogos, propostas/contratos | admin-only ou read-all/write-admin | — |
| C — Tenant Webposto | cci_webposto_venda(_item), empresas_api, mapeamentos, cliente_contas_bancarias | `cci_rede_bate` | — |
| D — Tenant Autosystem | as_rede_* (mapeamento/categoria/prefixo) | `cci_rede_bate` | — |
| E — Por empresa | nf_manifestacao, outra_conta_pagar, cliente_sangrias, pendências | `cci_pode_ver_cliente` | — |
| F — Sem RLS hoje | ofx_correlacao(_item), chave_api_produto_mix, as_rede_conta_caixa_banco, mapeamento_vendas_autosystem, as_rede_produto_mix, bpo_conciliacoes_caixas | `enable rls` + policy juntos | — |
| G — Filhas indiretas | *_item, *_produto, *_arquivo, comentarios/anexos, mensagens | via FK do pai | — |
| H — Segredos | chaves_api, as_rede, configuracoes_*, password_reset_tokens, cci_usuarios_sistema | **só depois da Fase 4** (tirar segredos do browser) | — |

Lotes C–G podem correr em paralelo por domínio depois que o Canário (A) confirmar os 3 caminhos.

## Notas de risco (do MAPA_TENANT)

- **Admin precisa ver tudo** → nunca esquecer o `cci_is_admin()` nas tabelas de tenant.
- **Sessões antigas** (pré-Fase 2, sem token) viram anon → serão **negadas** quando o RLS apertar. Comunicar/forçar re-login antes de fechar os lotes de dados que o cliente usa, ou aceitar que quem não relogou precisa relogar.
- **`cliente_id` cruza os dois tenants** → usar sempre `cci_pode_ver_cliente` (resolve via `clientes`), nunca comparar `cliente_id` direto.
- **`as_rede_produto_mix` usa `rede_id`** (não `as_rede_id`).
- **Column-level nos segredos**: em `cci_usuarios_sistema`/`chaves_api`/`as_rede`, RLS de linha não basta — `senha`/`chave`/`*_enc` nunca podem ir pro cliente (tratar por view/coluna na Fase 4/H).
