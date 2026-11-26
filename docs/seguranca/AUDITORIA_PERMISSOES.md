# Auditoria de permissões e acessos (26/11/2026)

Levantamento feito antes da reestruturação da tela de permissões. Nada foi alterado
ainda. Referências: catálogos em `src/services/usuariosSistemaService.js`, guardas em
`src/components/auth/RequireAuth.jsx`, rotas em `src/App.jsx`, menus em
`src/components/layout/Sidebar.jsx` e `src/components/layout/cliente/clienteNavegacao.js`,
banco nas migrations `111`, `129`, `130`, `146`, `149` e nas que citam cada chave.

## 1. Como funciona hoje

**Onde ficam as permissões.** Coluna `cci_usuarios_sistema.permissoes` (text[]), lista de
chaves. As chaves válidas só existem no código (`PERMISSOES_ADMIN`, 26 chaves;
`PERMISSOES_CLIENTE`, 32 chaves + 6 de abas). O banco não tem catálogo, então aceita
qualquer texto.

**Como chegam ao banco.** No login (`auth-login` → `_shared/auth-jwt.ts`) as chaves vão
para o claim `cci_permissoes` e as empresas para `empresas_permitidas`. As políticas
leem via `cci_tem_permissao(chave)`, `cci_empresa_liberada(id)` e `cci_pode_ver_cliente(id)`.

**Papéis que existem de fato.**

| Papel | Como é identificado | O que limita no banco |
|---|---|---|
| Admin da plataforma N3 | `tipo=admin`, `nivel_admin=3` (ou `is_master`) | nada; gere N2/N1/clientes, muda nível |
| Admin N2 | `nivel_admin=2` | gere N1 e clientes |
| Admin N1 | `nivel_admin=1` | não gere usuários; **resto igual ao N3** |
| Administrador do cliente | cliente com `gerenciar_usuarios` | gere clientes da própria rede |
| Usuário do cliente | cliente com as chaves marcadas | por chave (só em parte das tabelas) e por empresa |
| Somente consulta | não existe como papel; só nas chaves `sangrias_consultar`, `conferencia_recebimentos_consultar` | — |

`cci_is_admin()` só olha `cci_tipo='admin'`. **Todo admin passa em todas as políticas**,
inclusive o N1. As chaves de admin só escondem menus (exceção: Banco Inter, migrations 188/190).

## 2. Falhas de segurança encontradas (backend)

| # | Gravidade | Onde | O que acontece |
|---|---|---|---|
| S1 | **Crítica** | `cci_admin_definir_senha` (130:47) | Qualquer usuário cliente troca a senha de qualquer outro cliente da mesma rede, **mesmo sem `gerenciar_usuarios`** → toma a conta dele. |
| S2 | **Crítica** | idem | Qualquer admin, inclusive N1, troca a senha de qualquer pessoa, inclusive de um N3. |
| S3 | Alta | `cci_gerir_criar/atualizar_usuario` (149:94,151) | Gerente do cliente concede **qualquer** chave, mesmo as que ele não tem (sem verificação de subconjunto). |
| S4 | Alta | idem (149:98,161) | Gerente restrito a 2 empresas cria/edita usuário com acesso a todas (`empresas_permitidas = null`). |
| S5 | Alta | `cci_pode_gerir_usuario` (149:74) | Gerente do cliente edita **a si mesmo**: pode se dar todas as chaves e todas as empresas. |
| S6 | Alta | `cci_gerir_atualizar_usuario` (149:193) | O update aplica `chave_api_id`/`as_rede_id` do payload: um gerente consegue **mover um usuário para outra rede**. |
| S7 | Média | idem (149:151) | Omitir `permissoes` no payload zera as permissões do usuário. |
| S8 | Média | `cascata_revogar_permissoes` (095:28) | Sem checagem de quem chama, execução liberada a `public`. Hoje provavelmente falha (UPDATE revogado na 149), mas não deveria estar exposta. |
| S9 | Média | RLS de tabelas do cliente (119, 120, 113, 177) | `outra_conta_pagar`, `nf_manifestacao`, `bpo_conciliacoes_caixas`, `cliente_administradoras`, `as_rede_conta_cartao`: qualquer usuário da empresa **lê e grava**, sem precisar da chave correspondente. |
| S10 | Média | RLS `usuarios_sel` (129:42) | Qualquer cliente lê as permissões e empresas de todos os usuários da rede (sem precisar de `gerenciar_usuarios`). |
| S11 | Baixa | Edge Functions autosystem-* | Só algumas checam chave (`autosystem-vendas`, `-nfe-manifestacao`, `-produto-busca`); as demais checam só a rede. |

## 3. Falhas no frontend

| # | Onde | O que acontece |
|---|---|---|
| F1 | `CciUsuarios.jsx:407-413` | Desmarcar a última empresa deixa a lista vazia, e vazia = **acesso total**. Não há como "nenhuma empresa"; o service também converte `[]` em `null` (`usuariosSistemaService.js:303,310`). |
| F2 | `App.jsx:135-221` | Nenhuma rota de admin checa chave; só `RequireAdmin`. Quem digita a URL entra. |
| F3 | `App.jsx:309` | `/tela-cheia/cliente/dre` sem `RequirePermissaoCliente` (a `/dre` normal exige `dre`). |
| F4 | `App.jsx:254,283` | `/cliente/*/usuarios` sem guarda de rota (checado só dentro da página). |
| F5 | `clienteNavegacao.js:59` | "Outras contas" aparece no Autosystem, mas a rota só existe no Webposto (cai em `/`). |
| F6 | `ModalDetalhePedido.jsx:56` | Checa `permissoes.includes('admin')`, chave que não existe em catálogo. |
| F7 | `ClienteEstoques` Webposto | As abas `estoques_*` só valem no Autosystem. |

## 4. Matriz de permissões

Legenda de **proteção**: R = guarda de rota · M = só menu · P = checagem na página ·
**DB** = política/RPC no banco. Ação: V visualização · C criação · E edição · X exclusão ·
A aprovação · Adm administração · Rst acesso restrito.

### Cliente (`PERMISSOES_CLIENTE`)

| Módulo proposto | Chave | Ação | Proteção | Observação |
|---|---|---|---|---|
| Principal | `dashboard` | V | R, DB (RPCs webposto) | |
| Principal | `tarefas` | V/E | R, P | também define quem pode ser responsável |
| Principal | `pendencias` | V | R | |
| Relatórios | `dre` | V | R | tela cheia sem guarda (F3) |
| Relatórios | `fluxo_caixa` | V | R | |
| Relatórios | `relatorios_bi` | V | R | |
| Comercial | `comercial_vendas` | V | R, DB, Edge | |
| Comercial | `comercial_operacao` | V | R | |
| Comercial | `comercial_produtividade` (+ abas rank/pista/conveniência) | V | R, P | abas filtradas por ERP |
| Estoque | `comercial_estoques` (+ abas) | V | R, P | abas só no Autosystem (F7) |
| Compras | `compras` | C | R | só Autosystem |
| Compras | `compras_liberar` | A | P | |
| Operacional | `sangrias` | C/E | R, P, **DB** | |
| Operacional | `sangrias_consultar` | V | R, **DB** | |
| Operacional | `sangrias_tarefa_deposito` | C | P, **DB** | já separada da contagem |
| Operacional | `fechamento_caixa` | V | R, P | também controla o resumo do dia |
| Operacional | `lmc` | V | R | só Webposto |
| Operacional | `lmc_editar` | E | P, **DB** | |
| Operacional | `notas_fiscais` | V/E | R, Edge | tabela `nf_manifestacao` sem chave (S9) |
| Operacional | `documentos` | V | R | sem item de menu |
| Operacional | `bpo` | V | R | |
| Financeiro | `financeiro` | V | R, P | contas a pagar + receber + cards do dashboard |
| Financeiro | `bpo_contas_pagar` | V | R | leitura no banco só por empresa |
| Financeiro | `bpo_contas_pagar_autorizar` | A | P, **DB** | |
| Financeiro | `bpo_contas_receber` | V | R, P | |
| Financeiro | `outras_contas` | V/C/E/X | R | tabela grava sem chave (S9); menu quebrado no AS (F5) |
| Financeiro | `acessos` | V/C/E · Rst | R, **DB** | senhas de adquirentes |
| Gestão de usuários | `gerenciar_usuarios` | Adm | P, **DB** (com falhas S1, S3–S6) | |
| Administração | `trocar_empresa` | — | P | |
| Administração | `configuracoes` | Adm | R | |

Chaves que existem só no banco, **fora do catálogo** (não dá para marcar na tela):
`conferencia_recebimentos`, `conferencia_recebimentos_consultar` (migrations 206/208).

### Admin (`PERMISSOES_ADMIN`)

Nenhuma chave de admin é checada no banco (exceto Banco Inter) nem em rota (F2).

| Módulo proposto | Chave | Ação | Proteção | Observação |
|---|---|---|---|---|
| Principal | `dashboard` | V | M | |
| Principal | `fiscal` | V | M, P | também esconde o conteúdo do Dashboard |
| Cadastros | `clientes`, `colaboradores`, `fornecedores`, `plano_contas`, `motivos` | V/C/E/X | M, P (abas) | |
| Gestão de usuários | `usuarios` | Adm | M | na prática quem manda é o nível N2+ |
| Financeiro (CCI) | `contas_pagar` | V/C/E | M | libera o item Financeiro inteiro |
| Financeiro (CCI) | `contas_receber` | V | **nenhuma** | chave sem uso no front; usada no banco (Inter) |
| Financeiro (CCI) | `banco_inter` | V/A | P, **DB** | |
| Relatórios | `relatorios_cliente` | V | M | DRE, Fluxo, Análise de lançamentos |
| Relatórios | `relatorios_bi` | V | M | |
| Relatórios | `analise_ia` | V | M, P | |
| Operacional (BPO) | `tarefas` | V/C/E | M | |
| Operacional (BPO) | `conciliacao_caixas` | V/E | M | |
| Operacional (BPO) | `lmc` | V | M | |
| Operacional (BPO) | `notas_fiscais` | E/A | M | |
| Financeiro (BPO) | `bpo_contas_pagar`, `bpo_contas_receber`, `outras_contas` | V/E | M | |
| Financeiro (BPO) | `acessos` | V/E · Rst | M | senhas dos clientes; no banco todo admin vê |
| Financeiro (BPO) | `caixa_administrativo` | V/E | M | |
| Administração | `parametros` | Adm | M | também libera "Geral" (configurações) |
| Administração | `uso_portal` | V | M | |
| Administração | `webposto_sync` | Adm | M | |

Rotas de admin **sem chave nem no menu**: `/admin/contratos`, `/admin/pendencias`,
`/admin/portal-demo`, `/admin/boletos`, `/admin/notas-fiscais`, `/admin/relatorios`,
`/admin/fiscal/agendamento`, `/admin/bpo/alteracoes-caixas`.

## 5. Permissões que juntam ações diferentes

- `financeiro` (cliente): contas a pagar, contas a receber e os cards do dashboard.
- `outras_contas` (cliente): ver, lançar, editar e excluir.
- `acessos` (cliente): ver senhas e editar.
- `notas_fiscais` (cliente): ver e manifestar.
- `contas_pagar` (admin): todo o Financeiro da CCI.
- `relatorios_cliente` (admin): DRE, Fluxo, Análise de lançamentos.
- `parametros` (admin): Parâmetros e Configurações gerais.

As de sangrias já estão bem separadas (contar, consultar, criar tarefa de depósito).

## 6. Empresas × permissões

As permissões valem para **todas** as empresas liberadas ao usuário. Não existe permissão
por empresa (ex.: lança sangria na A e só consulta na B) e não há filial/departamento no
modelo. A restrição por empresa é aplicada no banco onde a tabela tem `cliente_id`
(`cci_pode_ver_cliente`); tabelas só por rede (`chave_api_id`/`as_rede_id`) não restringem
por empresa.

## 7. O que já foi feito (26/11/2026)

- **Migration 234** (aplicada): S1, S2, S3, S4, S5, S6, S7, S8 corrigidos. Troca de senha só
  por quem gere o alvo; quem não é N3 só acrescenta permissões que tem; gerente restrito só
  libera as empresas dele; gerente não edita a si mesmo nem troca a rede de um usuário;
  payload sem `permissoes` mantém as atuais; `cascata_revogar_permissoes` fechada.
- **Rotas** (F2–F5): rotas do admin protegidas pela mesma regra do menu
  (`src/components/layout/adminNavegacao.js`, `RequirePermissaoAdmin`); admin sem
  Dashboard vai para a 1ª página permitida; `/cliente/*/usuarios` exige
  `gerenciar_usuarios`; DRE em tela cheia exige `dre`; "Outras contas" só no Webposto.
- **F1**: não é mais possível desmarcar a última empresa (lista vazia = acesso total).
- **Migration 235** (aplicada): `cci_perfis_permissao`, modelos editáveis pela CCI (N2/N3).
- **Tela nova**: `PainelAcessosUsuario` (admin e gerente do cliente), `EditorPermissoes`
  (módulos da seção 4, busca, dependências, restritas, +/− do que muda), `ModelosPermissao`.
  Organização em `src/utils/permissoesCatalogo.js`.
- **Migration 238** (redes do admin N1): coluna `cci_usuarios_sistema.acesso_redes`
  (null = todas; `{chaves_api, as_redes, empresas}`), RPC `cci_definir_acesso_redes`
  (quem gere o alvo), RLS em `clientes`, `chaves_api`, `as_rede`, `empresas_api` lendo
  a restrição do banco (`cci_admin_acesso()`, vale na hora). Aba **Redes** no painel de
  acessos (`AbaRedesAdmin`, helpers em `src/utils/acessoRedes.js`). N2/N3 ignoram.

### Pendente
- Redes do admin N1 nas **tabelas de dados** por `cliente_id`/rede (vendas, tarefas,
  conciliações, contas…) e nas Edge Functions autosystem (`autorizarRede` deixa todo admin
  passar). Hoje o N1 restrito só não chega nelas porque os seletores saem dos catálogos.
- S9: exigir a chave no RLS de `outra_conta_pagar`, `nf_manifestacao`,
  `bpo_conciliacoes_caixas`, `cliente_administradoras`, `as_rede_conta_cartao`.
- S10: restringir a leitura de `cci_usuarios_sistema` pelo cliente a quem tem `gerenciar_usuarios`.
- S11: checagem por chave nas Edge Functions autosystem-* restantes.
- Chaves de admin no banco (hoje todo admin passa em `cci_is_admin()`).
- `conferencia_recebimentos(_consultar)` existe no banco e não está no catálogo.
- Dividir permissões que juntam ações (seção 5).
