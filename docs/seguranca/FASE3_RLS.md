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
| **B1 — Admin-only** | contas_pagar, lancamentos, notas/asaas, propostas, contratos, agendamentos_nf, nfse, motivos, servicos, precificacao | `cci_is_admin()` (read+write) | `115` ▶ |
| **B2 — Config DRE/Fluxo** | plano_contas, mascaras/grupos/mapeamentos DRE e Fluxo | read `true` · write `cci_is_admin()` | `116` ▶ |
| **C — Tenant Webposto** | cci_webposto_venda(_item), empresas_api, mapeamentos, cliente_contas_bancarias, extratos, pendencias, sync_* | select `admin or chave_api_id` · write admin | `117` ▶ |
| **D — Tenant Autosystem** | as_rede_conta_categoria/receber/prefixo | select `admin or as_rede_id` · write admin | `118` ▶ |
| **E — Por empresa (+ escrita cliente)** | clientes, nf_manifestacao, outra_conta_pagar, cliente_sangrias, pendencia_visualizacao, mapeamento_manual(_fluxo) | `cci_pode_ver_cliente(cliente_id)` (using **e** with check) | `119` ▶ |
| **F — Sem RLS hoje** | ofx_correlacao(_item), chave_api_produto_mix, as_rede_conta_caixa_banco, mapeamento_vendas_autosystem, as_rede_produto_mix, **bpo_conciliacoes_caixas** (grava do cliente!) | `enable rls` + policy juntos | `120` ▶ |
| **G1 — Filhas indiretas** | nf_manifestacao_produto/_arquivo, outra_conta_arquivo, cci_pendencia_resposta, cci_pedidos_compra(_item) | helpers `cci_pode_ver_<pai>()` | `121` ▶ |
| **G2 — Ambos / per-usuário** | melhorias(_comentarios/_anexos), suporte(_conversa/_mensagem), uso_portal, notificacoes, mensagens_iniciais(_views), relatorios_bi(_usuario), reunioes(_kpis) | rede / usuario_id / via pai | `122` ▶ |
| **Público** | cci_orcamento_solicitacoes (insert público), cci_contato (leitura pública) | insert `true` / select `true` · resto admin | `123` ▶ |

**Após os lotes 112–123, TODAS as tabelas não-segredo têm RLS real.** Só falta o **Lote H (segredos)** — que depende da **Fase 4** (tirar as chaves Quality/Asaas/Anthropic do navegador), senão a policy trava features que ainda leem essas chaves no cliente.

### Pendência à parte: policies de Storage (buckets)
Os buckets `extratos_bancarios`, `nf_manifestacao`, `outras-contas`, `melhorias`, suporte (anexos) ainda têm policy allow-all em `storage.objects` (separadas das tabelas). Fazer um lote de Storage por tenant depois — fora do escopo destas migrations de tabela.
| H — Segredos | chaves_api, as_rede, configuracoes_*, password_reset_tokens, cci_usuarios_sistema | **só depois da Fase 4** (tirar segredos do browser) | — |

Lotes C–G podem correr em paralelo por domínio depois que o Canário (A) confirmar os 3 caminhos.

### ⚠️ Achados para os próximos lotes (nomes de policy fora do padrão)
Ao dropar, usar o nome EXATO — **não** assumir "Allow all for &lt;tabela&gt;":
- `"todos"` em **3 tabelas**: `cci_orcamento_solicitacoes`, `cci_pedidos_compra`, `cci_pedidos_compra_item` → `drop policy "todos" on <tabela>` qualificado.
- `p_webposto_venda_all` / `p_webposto_venda_item_all` / `p_webposto_sync_config_all` / `p_webposto_sync_job_all` / `p_webposto_sync_config_rede_all`.
- `p_pendencias_all` / `p_pendencia_resp_all` / `p_pendencia_visualiz_all`.
- `p_suporte_conversa_all` / `p_suporte_mensagem_all`.
- `"Allow all for rel_bi_usuario"` (tabela `cliente_relatorios_bi_usuario`).
- `cci_uso_portal`: DUAS policies (`"Insert allowed for cci_uso_portal"` + `"Select allowed for cci_uso_portal"`).

> **Adiado do Lote C:** `cci_pedidos_compra` — apesar das colunas webposto, é lido/escrito pelo portal **Autosystem** (`ClienteCompras`). Vai no lote de escrita-do-cliente com `with check` do próprio tenant.

### Tabelas ESCRITAS pelo portal do cliente (policy precisa de `with check` do próprio tenant)
notificacoes, cci_mensagens_iniciais_views, cci_pendencia_resposta, cci_pendencia_visualizacao, cci_pedidos_compra(_item), cci_sangrias/`cliente_sangrias_fechamento`, nf_manifestacao(_produto/_arquivo), outra_conta_pagar(_arquivo), cci_melhorias(_comentarios/_anexos), cci_suporte_conversa/_mensagem, cci_uso_portal, **bpo_conciliacoes_caixas**.

### Leituras públicas (pré-login) — manter acesso
`cci_orcamento_solicitacoes` (insert público do form), `cci_contato` (insert landing). `clientes` era lido pré-auth no login antigo — no fluxo novo é lido já com token, mas confirmar que nenhuma página pública lê `clientes`.

## Notas de risco (do MAPA_TENANT)

- **Admin precisa ver tudo** → nunca esquecer o `cci_is_admin()` nas tabelas de tenant.
- **Sessões antigas** (pré-Fase 2, sem token) viram anon → serão **negadas** quando o RLS apertar. Comunicar/forçar re-login antes de fechar os lotes de dados que o cliente usa, ou aceitar que quem não relogou precisa relogar.
- **`cliente_id` cruza os dois tenants** → usar sempre `cci_pode_ver_cliente` (resolve via `clientes`), nunca comparar `cliente_id` direto.
- **`as_rede_produto_mix` usa `rede_id`** (não `as_rede_id`).
- **Column-level nos segredos**: em `cci_usuarios_sistema`/`chaves_api`/`as_rede`, RLS de linha não basta — `senha`/`chave`/`*_enc` nunca podem ir pro cliente (tratar por view/coluna na Fase 4/H).
