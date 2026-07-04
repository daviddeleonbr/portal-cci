# Mapa de Tenant — RLS Remediation (supabase/migrations 001–108)

> **Nota de execução:** este é o insumo da Fase 3. Ele diz, para cada tabela, qual coluna liga a linha a um dono (`chave_api_id`, `as_rede_id`, `cliente_id`) ou se é admin-global/segredo. As colunas `nota_policy` pressupõem que a **Fase 2 já emita um JWT com claims de tenant** (`chave_api_id`/`as_rede_id`/`cliente_id`/`cci_tipo`) — hoje `auth.jwt()->>'...'` não existe (login é anon puro). **Atenção:** habilitar RLS nas 7 tabelas hoje "sem RLS" só é seguro junto com a policy real da Fase 3 — ligar RLS sem policy nega o acesso do app (anon) e quebra a feature. Não fazer isoladamente.

**Escopo:** 78 tabelas encontradas em `create table` nas migrations.

Regra de classificação: `chave_api_id`+`as_rede_id` juntos → `TENANT_AMBOS`; só `chave_api_id` → `TENANT_WEBPOSTO`; só `as_rede_id` → `TENANT_AUTOSYSTEM`; só `cliente_id` → `POR_EMPRESA`; sem coluna de dono → `ADMIN_GLOBAL`; singletons de credencial/senha → `SEGREDO`.

## 1. Tabela mestre

| tabela | classe | tenant_column (file:line) | sensib. | rls_atual (file:line) | nota_policy |
|---|---|---|---|---|---|
| chaves_api | SEGREDO | `id` = próprio tenant Webposto; guarda `chave` (003:6/11) | ALTA | sim `using(true)` (003:62) | admin-only; `revoke from anon`; coluna `chave` só via service_role |
| as_rede | SEGREDO | `id` = próprio tenant AS; `conexao_senha_enc` (031:17/27) | ALTA | sim `using(true)` (030:37 / 031:53) | admin-only; nunca expor `*_enc`; leitura via RPC `as_rede_get_credenciais` |
| configuracoes_ia | SEGREDO | NENHUMA (singleton id=1; `api_key` sk-ant) (047:13/15) | ALTA | sim `using(true)` (implícito legado)¹ | admin-only p/ escrita; `api_key` nunca p/ anon |
| configuracoes_asaas | SEGREDO | NENHUMA (singleton; `api_key`) (004:6/9) | ALTA | sim `using(true)` (004:87) | admin-only; revoke anon |
| password_reset_tokens | SEGREDO | `usuario_id`→cci_usuarios_sistema (042:15) | ALTA | sim `using(true)` (042:26) | service_role only (token dá reset de senha) |
| cci_usuarios_sistema | SEGREDO | própria linha; `senha` + `chave_api_id`/`as_rede_id`/`cliente_id` (016:17/19; 017:12; 033:13) | ALTA | sim `using(true)` (016:43) | `id = jwt.usuario_id` p/ self; admin p/ resto; senha nunca p/ anon |
| cci_contas_pagar | ADMIN_GLOBAL | NENHUMA (financeiro interno CCI) (012:42) | ALTA | sim `using(true)` (012:89) | `jwt.cci_tipo='admin'` |
| cci_lancamentos_contabeis | ADMIN_GLOBAL | NENHUMA (partidas dobradas CCI) (013:91) | ALTA | sim `using(true)` (013:111) | `jwt.cci_tipo='admin'` |
| notas_fiscais_asaas | ADMIN_GLOBAL | `config_id`→configuracoes_asaas (004:39) | ALTA | sim `using(true)` (004:89) | admin-only (NF emitidas pela CCI; PII/fiscal) |
| cci_orcamento_solicitacoes | ADMIN_GLOBAL | NENHUMA (leads landing; PII prospect) (084:5) | ALTA | sim `using(true)` (084:46) | insert público (form), select admin-only |
| cci_contratos | ADMIN_GLOBAL | `cliente_id` opcional s/ força (105:14) | ALTA | sim `using(true)` + grant anon (105:43/44) | `jwt.cci_tipo='admin'` |
| agendamentos_nf | ADMIN_GLOBAL | `cliente_id` **soft, sem FK** + `config_id` (088:14/18) | ALTA | sim `using(true)` + grant anon (088:129/132) | admin-only; PII tomador; ver §3 |
| nfse_agendamentos | ADMIN_GLOBAL | `cliente_id` opcional→clientes (029:14) | ALTA | sim `using(true)` (029:55) | admin-only; PII tomador |
| cci_plano_contas | ADMIN_GLOBAL | NENHUMA (plano contábil CCI) (012:7) | MEDIA | sim `using(true)` (012:87) | admin r/w; talvez read p/ todos |
| cci_fornecedores | ADMIN_GLOBAL | NENHUMA (012:26) | MEDIA | sim `using(true)` (012:88) | `jwt.cci_tipo='admin'` |
| cci_motivos_movimentacao | ADMIN_GLOBAL | NENHUMA (013:47) | MEDIA | sim `using(true)` (013:78) | `jwt.cci_tipo='admin'` |
| asaas_customers | ADMIN_GLOBAL | `config_id`→configuracoes_asaas (004:25) | MEDIA | sim `using(true)` (004:88) | admin-only |
| cci_propostas | ADMIN_GLOBAL | `cliente_id` opcional (092:16) | MEDIA | sim `using(true)` + grant anon (092:87/90) | `jwt.cci_tipo='admin'` |
| cci_proposta_itens | ADMIN_GLOBAL | INDIRETO `proposta_id`→cci_propostas (092:60) | MEDIA | sim `using(true)` + grant anon (092:88/91) | via proposta_id → cci_propostas |
| notificacoes | ADMIN_GLOBAL | `usuario_id`→cci_usuarios_sistema (044:11) | MEDIA | sim `using(true)` (044:26) | per-user: `usuario_id = jwt.usuario_id`; ver §2 |
| mascaras_dre | ADMIN_GLOBAL | NENHUMA (001:6) | BAIXA | sim `using(true)` (001:69) | admin r/w; read p/ todos |
| grupos_dre | ADMIN_GLOBAL | NENHUMA (001:17) | BAIXA | sim `using(true)` (001:70) | admin r/w |
| mapeamento_contas | ADMIN_GLOBAL | NENHUMA (via grupo_dre_id) (001:31) | BAIXA | sim `using(true)` (001:71) | admin r/w |
| mapeamento_vendas_dre | ADMIN_GLOBAL | NENHUMA (via mascara_id) (008:6) | BAIXA | sim `using(true)` (008:32) | admin r/w |
| mascaras_fluxo_caixa | ADMIN_GLOBAL | NENHUMA (010:9) | BAIXA | sim `using(true)` (010:69) | admin r/w |
| grupos_fluxo_caixa | ADMIN_GLOBAL | NENHUMA (010:25) | BAIXA | sim `using(true)` (010:70) | admin r/w |
| mapeamento_contas_fluxo | ADMIN_GLOBAL | NENHUMA (010:39) | BAIXA | sim `using(true)` (010:71) | admin r/w |
| cci_contato | ADMIN_GLOBAL | NENHUMA (singleton landing público) (043:11) | BAIXA | sim `using(true)` (043:30) | read público; write admin |
| cci_mensagens_iniciais | ADMIN_GLOBAL | NENHUMA (`publico_alvo` filtra) (053:14) | BAIXA | sim `using(true)` (053:39) | read p/ todos; write admin |
| cci_mensagens_iniciais_views | ADMIN_GLOBAL | `usuario_id`→cci_usuarios_sistema (053:45) | BAIXA | sim `using(true)` (053:53) | per-user; ver §2 |
| cci_servicos_oferecidos | ADMIN_GLOBAL | NENHUMA (catálogo) (091:10) | BAIXA | sim `using(true)` + grant anon (091:40/43) | admin r/w |
| cci_precificacao_vinculo | ADMIN_GLOBAL | NENHUMA (catálogo) (103:11) | BAIXA | sim `using(true)` + grant anon (103:18/21) | admin r/w |
| cliente_contas_bancarias | TENANT_WEBPOSTO | `chave_api_id` (era cliente_id, migrado 020) (020:21) | ALTA | sim `using(true)` (019:34) | `chave_api_id = jwt.chave_api_id` |
| cci_webposto_venda | TENANT_WEBPOSTO | `chave_api_id` (068:16) | ALTA | sim `using(true)` (068:115) | `chave_api_id = jwt.chave_api_id` |
| cci_webposto_venda_item | TENANT_WEBPOSTO | `chave_api_id` (FK composta p/ venda) (068:31/50) | ALTA | sim `using(true)` (068:116) | `chave_api_id = jwt.chave_api_id` |
| extratos_bancarios | TENANT_WEBPOSTO | `chave_api_id` + `cliente_id` (ambos nullable) (021:9/10) | ALTA | sim `using(true)` (021:31) | `chave_api_id = jwt.chave`; ver §2 (cliente pode ser AS) |
| ofx_correlacao | TENANT_WEBPOSTO | `chave_api_id` + `cliente_id` (046:18/19) | ALTA | **não — RLS não habilitada** (046, sem policy) | `chave_api_id = jwt.chave`; **habilitar RLS** |
| ofx_correlacao_item | TENANT_WEBPOSTO | INDIRETO `correlacao_id`→ofx_correlacao (046:34) | ALTA | **não — RLS não habilitada** (046) | via correlacao_id; **habilitar RLS** |
| empresas_api | TENANT_WEBPOSTO | `chave_api_id` (003:20) | MEDIA | sim `using(true)` (003:63) | `chave_api_id = jwt.chave_api_id` |
| mapeamento_empresa_contas | TENANT_WEBPOSTO | `chave_api_id` (003:36) | MEDIA | sim `using(true)` (003:64) | `chave_api_id = jwt.chave_api_id` |
| mapeamento_empresa_contas_fluxo | TENANT_WEBPOSTO | `chave_api_id` (011:9) | MEDIA | sim `using(true)` (011:30) | `chave_api_id = jwt.chave_api_id` |
| cliente_administradoras | TENANT_WEBPOSTO | `chave_api_id` (104:13) | MEDIA | sim `using(true)` + grant anon (104:31/34) | `chave_api_id = jwt.chave_api_id` |
| cci_pendencias | TENANT_WEBPOSTO | `chave_api_id` OR `cliente_id` (CHECK) (082:13/14/27) | MEDIA | sim `using(true)` + grant anon (082:65/68) | `chave_api_id = jwt.chave` OR via cliente; ver §2 |
| cci_pendencia_resposta | TENANT_WEBPOSTO | INDIRETO `pendencia_id`→cci_pendencias (082:38) | MEDIA | sim `using(true)` + grant anon (082:66/69) | via pendencia_id |
| cci_pedidos_compra | TENANT_WEBPOSTO | `chave_api_id` + `cliente_id` (086:11/12) | MEDIA | sim `using(true)` (086:83) | `chave_api_id = jwt.chave`; ver §2 |
| cci_pedidos_compra_item | TENANT_WEBPOSTO | INDIRETO `pedido_id`→cci_pedidos_compra (086:49) | MEDIA | sim `using(true)` (086:84) | via pedido_id |
| chave_api_produto_mix | TENANT_WEBPOSTO | `chave_api_id` (PK) (045:14) | BAIXA | **não — RLS não habilitada** (045) | `chave_api_id = jwt.chave`; **habilitar RLS** |
| cci_webposto_sync_config | TENANT_WEBPOSTO | `chave_api_id` (068:60) | BAIXA | sim `using(true)` (068:117) | `chave_api_id = jwt.chave` (ou admin only) |
| cci_webposto_sync_job | TENANT_WEBPOSTO | `chave_api_id` (068:74) | BAIXA | sim `using(true)` (068:118) | admin/worker; `chave_api_id = jwt.chave` |
| cci_webposto_sync_config_rede | TENANT_WEBPOSTO | `chave_api_id` (PK) (070:13) | BAIXA | sim `using(true)` (070:26) | admin/worker |
| as_rede_grupo_produto | TENANT_AUTOSYSTEM | `as_rede_id` (034:11) | MEDIA | sim `using(true)` (034:49) | `as_rede_id = jwt.as_rede_id` |
| as_rede_conta_categoria | TENANT_AUTOSYSTEM | `as_rede_id` (037:12) | MEDIA | sim `using(true)` (037:45) | `as_rede_id = jwt.as_rede_id` |
| as_rede_conta_receber_categoria | TENANT_AUTOSYSTEM | `as_rede_id` (059:22) | MEDIA | sim `using(true)` (059:41) | `as_rede_id = jwt.as_rede_id` |
| as_rede_categoria_prefixo | TENANT_AUTOSYSTEM | `as_rede_id` (060:23) | MEDIA | sim `using(true)` (060:42) | `as_rede_id = jwt.as_rede_id` |
| as_rede_conta_caixa_banco | TENANT_AUTOSYSTEM | `as_rede_id` (PK) (050:20) | MEDIA | **não — RLS não habilitada** (050) | `as_rede_id = jwt.as_rede`; **habilitar RLS** |
| mapeamento_vendas_autosystem | TENANT_AUTOSYSTEM | `as_rede_id` (049:20) | MEDIA | **não — RLS não habilitada** (049) | `as_rede_id = jwt.as_rede`; **habilitar RLS** |
| as_rede_produto_mix | TENANT_AUTOSYSTEM | `rede_id`→as_rede (nome difere!) (040:12) | BAIXA | **não — RLS não habilitada** (040) | `rede_id = jwt.as_rede`; **habilitar RLS** |
| cliente_sangrias_fechamento | POR_EMPRESA | `cliente_id`→clientes (015:9) | ALTA | sim `using(true)` (015:32) | via cliente_id → clientes |
| bpo_conciliacoes_caixas | POR_EMPRESA | `cliente_id`→clientes (026:7) | ALTA | **não — RLS não habilitada** (026) | via cliente_id; **habilitar RLS** |
| nf_manifestacao | POR_EMPRESA | `cliente_id`→clientes (061:20) | ALTA | sim `using(true)` (061:107) | via cliente_id → clientes (fiscal) |
| nf_manifestacao_produto | POR_EMPRESA | INDIRETO `nf_manifestacao_id` (061:74) | ALTA | sim `using(true)` (061:109) | via nf_manifestacao_id |
| nf_manifestacao_arquivo | POR_EMPRESA | INDIRETO `nf_manifestacao_id` (061:91) | ALTA | sim `using(true)` (061:111) | via nf_manifestacao_id |
| outra_conta_pagar | POR_EMPRESA | `cliente_id`→clientes (065:13) | ALTA | sim `using(true)` (065:75) | via cliente_id → clientes |
| outra_conta_arquivo | POR_EMPRESA | INDIRETO `outra_conta_id` (065:62) | ALTA | sim `using(true)` (065:77) | via outra_conta_id |
| mapeamento_manual_contas | POR_EMPRESA | `cliente_id` + `as_rede_id` (backfill) (006:8; 048:19) | MEDIA | sim `using(true)` (006:29) | `as_rede_id = jwt.as_rede` OR via cliente_id; ver §2 |
| mapeamento_manual_contas_fluxo | POR_EMPRESA | `cliente_id` + `as_rede_id` (011:35; 048:37) | MEDIA | sim `using(true)` (011:55) | `as_rede_id = jwt.as_rede` OR via cliente_id; ver §2 |
| cci_pendencia_visualizacao | POR_EMPRESA | `cliente_id` + `pendencia_id` (083:24) | BAIXA | sim `using(true)` + grant anon (083:33/36) | via cliente_id → clientes |
| clientes | POR_EMPRESA | `chave_api_id` (005:31) + `as_rede_id` (032:8) — é o próprio registro de empresa | MEDIA | sim `using(true)` (005:51) | `chave_api_id = jwt.chave OR as_rede_id = jwt.as_rede`; raiz do mapa |
| cliente_relatorios_bi | TENANT_AMBOS | `chave_api_id` XOR `as_rede_id` (+`cliente_id`) (028:11; 041:18) | MEDIA | sim `using(true)` (028:31) | `chave_api_id = jwt.chave OR as_rede_id = jwt.as_rede` |
| cci_uso_portal | TENANT_AMBOS | `chave_api_id`+`as_rede_id`+`cliente_id` (telemetria) (058:21-23) | BAIXA | parcial (só insert+select `using(true)`) (058:40/42) | insert livre; select admin/rede |
| cci_melhorias | TENANT_AMBOS | `chave_api_id`+`as_rede_id`+`empresa_id` (todos nullable) (054:18-20) | MEDIA | sim `using(true)` (054:44) | `chave_api_id=jwt.chave OR as_rede_id=jwt.as_rede`; nullable = global |
| cci_melhorias_comentarios | TENANT_AMBOS | INDIRETO `melhoria_id`→cci_melhorias (054:52) | BAIXA | sim `using(true)` (054:65) | via melhoria_id |
| cci_melhorias_anexos | TENANT_AMBOS | INDIRETO `melhoria_id`→cci_melhorias (099:15) | BAIXA | sim `using(true)` (099:34) | via melhoria_id |
| cci_reunioes | TENANT_AMBOS | `chave_api_id` XOR `as_rede_id` (CHECK `rede_tipo`) (055:15/16) | MEDIA | sim `using(true)` (055:45) | `chave_api_id=jwt.chave OR as_rede_id=jwt.as_rede` |
| cci_reunioes_kpis | TENANT_AMBOS | INDIRETO `reuniao_id`→cci_reunioes (055:50) | MEDIA | sim `using(true)` (055:68) | via reuniao_id |
| cci_suporte_conversa | TENANT_AMBOS | `usuario_cliente_id` + `chave_api_id`/`as_rede_id`/`cliente_id` (066:20/23-25) | MEDIA | sim `using(true)` (066:118) | `usuario_cliente_id = jwt.usuario_id` (ou rede) |
| cci_suporte_mensagem | TENANT_AMBOS | INDIRETO `conversa_id`→cci_suporte_conversa (066:60) | MEDIA | sim `using(true)` (066:123) | via conversa_id |
| cliente_relatorios_bi_usuario | TENANT_AMBOS | INDIRETO `relatorio_id`+`usuario_id` (bridge) (041:33/34) | MEDIA | sim `using(true)` (041:44) | via relatorio_id → cliente_relatorios_bi; ver §2 |

¹ `configuracoes_ia` (047) não emite policy própria na sua migration; herda default do schema (tratar como exposta). Confirmar estado real no banco.

## 2. ⚠️ Tabelas de atenção especial (tenant indireto / ambíguo)

- **7 tabelas SEM RLS habilitada** (expostas via grants default do `public`): `ofx_correlacao`, `ofx_correlacao_item`, `chave_api_produto_mix`, `as_rede_conta_caixa_banco`, `mapeamento_vendas_autosystem`, `as_rede_produto_mix`, `bpo_conciliacoes_caixas`. Precisam de `enable row level security` — **mas só junto da policy real da Fase 3** (ligar sem policy quebra o acesso anon do app).
- **Filhas 100% indiretas (tenant só via FK ao pai)** — policy com subselect ou `security definer`: `ofx_correlacao_item`, `nf_manifestacao_produto`/`_arquivo`, `outra_conta_arquivo`, `cci_pendencia_resposta`, `cci_pedidos_compra_item`, `cci_proposta_itens`, `cci_reunioes_kpis`, `cci_melhorias_comentarios`/`_anexos`, `cci_suporte_mensagem`, `cci_mensagens_iniciais_views`, `notificacoes`, `cliente_relatorios_bi_usuario`.
- **`cliente_id` cruza os dois tenants**: `clientes` tem `chave_api_id` (Webposto) e `as_rede_id` (Autosystem). Qualquer tabela ancorada só em `cliente_id` (nf_manifestacao, outra_conta_pagar, cliente_sangrias_fechamento, bpo_conciliacoes_caixas, cci_pendencia_visualizacao) precisa resolver `cliente_id -> clientes.(chave_api_id | as_rede_id)`. A sessão carrega `clientesRede` (várias empresas), então não é `cliente_id = jwt.cliente_id` direto.
- **`chave_api_id` + `cliente_id` sem `as_rede_id`** (`extratos_bancarios`, `ofx_correlacao`, `cci_pendencias`, `cci_pedidos_compra`): o `cliente_id` pode ser empresa Autosystem, mas não há coluna de rede AS. Decidir se são Webposto-only ou precisam de `as_rede_id` denormalizado.
- **Per-usuário, não per-rede** (`notificacoes`, `cci_mensagens_iniciais_views`, `cliente_relatorios_bi_usuario`): dono é `usuario_id` → `usuario_id = jwt.usuario_id`.
- **`agendamentos_nf.cliente_id` é soft (sem FK)** (088:18) — snapshot proposital; não confiar como tenant. É ferramenta admin.
- **`cci_usuarios_sistema` / `chaves_api` / `as_rede`**: são tenant E segredo. Self-service (`id = jwt.usuario_id`) tem que conviver com colunas que jamais vão para anon (`senha`, `chave`, `conexao_senha_enc`). Tratar por column-level/views, não só RLS de linha.
- **Naming trap**: `as_rede_produto_mix` usa `rede_id` (não `as_rede_id`) (040:12).

## 3. Candidatas a coluna de tenant denormalizada (dado de cliente, tenant fraco/ausente)

- `agendamentos_nf` — só `cliente_id` soft sem FK; adicionar FK real ou `chave_api_id`/`as_rede_id` antes de RLS.
- `nfse_agendamentos` — `cliente_id` opcional (`on delete set null`): linhas órfãs sem dono.
- `cci_propostas` / `cci_contratos` — `cliente_id` opcional; hoje CRM admin.
- Filhas indiretas do §2 se beneficiariam de tenant denormalizado (copiar do pai) para evitar subselect — bom exemplo já existente: `cci_webposto_venda_item` que traz `chave_api_id` denormalizado.

## 4. Contagem por classe

| classe | nº tabelas |
|---|---|
| ADMIN_GLOBAL | 25 |
| TENANT_WEBPOSTO | 19 |
| TENANT_AMBOS | 11 |
| POR_EMPRESA | 10 |
| TENANT_AUTOSYSTEM | 7 |
| SEGREDO | 6 |
| **Total** | **78** |

Cortes transversais:
- **RLS allow-all `using(true)`**: 71 tabelas.
- **RLS NÃO habilitada (abertas via grant default)**: 7 tabelas (§2, prioridade — junto da policy).
- **`grant ... to anon` explícito**: `cci_servicos_oferecidos` (091:43), `cci_precificacao_vinculo` (103:21), `cci_contratos` (105:44), `cliente_administradoras` (104:34), `cci_propostas`/`cci_proposta_itens` (092:90/91), `agendamentos_nf` (088:132), `cci_pendencias`/`cci_pendencia_resposta` (082:68/69), `cci_pendencia_visualizacao` (083:36).
- **Sensibilidade ALTA**: 21 tabelas (todas SEGREDO + financeiro/fiscal/PII).
