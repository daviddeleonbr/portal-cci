# Matriz de fumaça — validação manual

Não há testes automatizados. Esta matriz é a rede de segurança rodada **após cada fase** (e após cada lote da Fase 3). Rode em staging primeiro, depois em produção. Marque ✅/❌ e a data.

## Como usar

- Colar uma cópia desta tabela no PR/commit de cada fase com o resultado.
- Qualquer ❌ **bloqueia** o avanço para a próxima fase/lote.
- Na Fase 3+, o "teste negativo" é obrigatório: confirmar que um usuário NÃO vê dados de outro tenant.

## Autenticação e sessão

| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| A1 | Login admin (email+senha válidos) | Entra no `/admin`, sidebar conforme permissões | |
| A2 | Login admin com senha errada | Erro "E-mail ou senha inválidos" | |
| A3 | Login cliente Webposto | Entra em `/cliente/webposto/*`, empresas da rede carregadas | |
| A4 | Login cliente Autosystem | Entra em `/cliente/autosystem/*`, empresas da rede carregadas | |
| A5 | Login com usuário inativo | Erro "Usuário inativo" | |
| A6 | Portal errado (cliente no login admin e vice-versa) | Erro de portal | |
| A7 | Admin + cliente logados ao mesmo tempo (duas abas/keys) | Ambas as sessões funcionam independentes | |
| A8 | Modo demo (admin → portal cliente fictício) | Nomes mascarados, valores reais, botão voltar ao admin | |
| A9 | Logout limpa sessão e cache Webposto | localStorage/IndexedDB limpos, sem vazamento entre sessões | |
| A10 | Troca de empresa ativa no header do cliente | Relatórios recarregam para a empresa escolhida | |

## Leitura por portal (uma por módulo)

| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| L1 | Admin: listar clientes/empresas | Lista carrega | |
| L2 | Admin: DRE de uma empresa | Relatório monta a partir da máscara padrão | |
| L3 | Admin: Fluxo de Caixa | Relatório monta | |
| L4 | Cliente Webposto: Vendas | Dados via Quality/cache | |
| L5 | Cliente Autosystem: Vendas | Query live no Postgres do cliente OK | |
| L6 | Análise com IA (qualquer relatório) | Retorna insights | |
| L7 | NF: agendamentos e emissão | Lista + emissão manual | |
| L8 | Propostas/Contratos: gerar e visualizar A4 | Relatório pagina certo | |

## Escrita/CRUD (uma por módulo)

| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| E1 | Admin: cadastrar/editar cliente (email+endereço) | Salva | |
| E2 | Admin: cadastrar rede Autosystem (credenciais) | `as_rede_create_full` grava cifrado | |
| E3 | Admin: editar credenciais Autosystem | `as_rede_set_credenciais` OK | |
| E4 | Cliente: lançamento/conciliação (conforme permissão) | Salva | |
| E5 | Reset de senha (fluxo completo) | Token gerado, senha trocada, login novo OK | |

## Teste negativo de isolamento (Fase 3+)

| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| N1 | Cliente A tenta ler `clientes` do tenant B (via app) | Vazio | |
| N2 | Chamada crua ao PostgREST com a anon key em tabela sensível | Negado / vazio | |
| N3 | `rpc('as_rede_decrypt', ...)` como anon | Negado (já fechado na migration 107) | |
| N4 | Edge Function `autosystem-*` com `rede_id` de outro tenant | Rejeitado (Fase 5) | |
| N5 | Ler `cci_usuarios_sistema.senha`/`senha_hash` como anon | Negado (Fase 3) | |
