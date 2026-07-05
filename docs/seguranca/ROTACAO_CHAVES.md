# Checklist de rotação de chaves (Fase 6)

Tudo que foi **legível por anônimo** na era pré-Fase 3 deve ser tratado como **vazado** e rotacionado. Um atacante pode ter copiado esses segredos a qualquer momento antes do fechamento do RLS. Rotacionar não é opcional — só o RLS não "des-vaza" o que já saiu.

Marque cada item ao concluir. Ordem = mais sensível primeiro.

---

## 1. Senhas de usuários (`cci_usuarios_sistema`) — ALTA

- [ ] **Senha seed do admin** (`admin123`, commitada na migration `016`): trocar imediatamente a senha do admin master. Está no histórico do git.
- [ ] **Demais usuários**: as senhas eram dumpáveis por anon (`select senha from cci_usuarios_sistema`). Considere **forçar redefinição** de todos:
  - Caminho suave: comunicar os usuários e usar o fluxo "Esqueci a senha" (agora server-side, `auth-reset`).
  - Caminho forte: um script (service_role) que zera `senha_hash` dos usuários cliente → viram "primeiro acesso" no próximo login. Avaliar impacto antes.
- Onde troca: tela **Admin › Usuários do Sistema** (a senha nova já grava com hash via self-heal no login; ou via `cci_definir_senha` server-side).

## 2. Credenciais dos ERPs Autosystem (`as_rede`) — ALTA

Cada rede tem IP/banco/usuário/**senha** do Postgres do cliente + **token** do túnel HTTPS, que eram decifráveis por anon (via `as_rede_decrypt`, fechado na migration `107` — mas o que saiu, saiu).

- [ ] Para **cada rede Autosystem**: pedir ao cliente/DBA para **trocar a senha do usuário Postgres** usado na integração.
- [ ] Trocar o **token do túnel HTTPS** (Cloudflare) das redes que usam modo HTTPS.
- Onde atualiza: **Admin › cadastro da rede Autosystem** (grava cifrado via RPC `as_rede_set_credenciais`).
- Coordenação: **com o cliente** (é o banco dele).

## 3. Chave de criptografia do Vault (`as_rede_encryption_key`) — ALTA

A v1 dessa chave estava **hardcoded na migration `030`** (`'cci-as-rede-encryption-key-v1-change-in-prod'`) — está no histórico do git. Foi migrada para o Vault na `031`, mas se o valor semeado no Vault for essa mesma string, tudo que está cifrado é decifrável por quem lê o git.

- [ ] Conferir o valor atual em `vault.secrets` (`name = 'as_rede_encryption_key'`). Se for a string da `030`, **rotacionar**.
- [ ] Rotação = **re-encriptar** todas as credenciais `*_enc` das redes com uma chave nova:
  1. Gerar uma chave nova forte e guardá-la no Vault com um nome novo (ex.: `as_rede_encryption_key_v2`).
  2. Rodar uma migração/função (service_role) que, para cada rede, decifra com a chave antiga e re-cifra com a nova (ajustando `as_rede_crypto_key()` para apontar para a v2).
  3. Validar login/consulta Autosystem antes de descartar a chave antiga.
- Nota: como já vamos rotacionar as senhas dos ERPs (item 2), o re-encrypt pode ser feito **junto** com a regravação das credenciais novas — mais simples que decifrar as antigas.

## 4. Chave da Quality API (`chaves_api.chave`) — ALTA

Uma por rede Webposto; eram legíveis por anon (`select chave from chaves_api`).

- [ ] Para **cada rede Webposto**: solicitar à **Quality** (ou ao provedor) a **emissão de uma chave nova** e revogar a antiga.
- Onde atualiza: **Admin › cadastro da rede/chave** (`chaves_api.chave`).
- Coordenação: **com a Quality / a rede**.

## 5. Token do Asaas (`configuracoes_asaas.api_key`) — MÉDIA

- [ ] Gerar um **novo access token** no painel do Asaas e revogar o antigo.
- Onde atualiza: **Admin › Notas Fiscais › configuração do Asaas**.
- Coordenação: painel Asaas.

## 6. Chave Anthropic (`configuracoes_ia.api_key`) — MÉDIA

- [ ] Gerar uma **nova API key** em console.anthropic.com e revogar a antiga (risco = fraude de billing).
- Onde atualiza: **Admin › Configurações › IA** (a `ia-proxy` lê a chave nova da tabela via service_role).

---

## Não precisam de rotação (não foram expostos a anon)

- **`SUPABASE_SERVICE_ROLE_KEY`** e **`APP_JWT_SECRET`**: vivem no ambiente das Edge Functions / no Vault (cron), nunca em tabela legível por anon. Rotacionar é opcional; se rotacionar o `APP_JWT_SECRET`, **todas as sessões caem** (todo mundo re-loga).

## Depois de rotacionar tudo

- [ ] Rodar a auditoria "deny by default": para cada tabela de segredo, um `select` com a anon key crua deve dar negado/vazio.
- [ ] Considerar **reescrever o histórico do git** (ou ao menos rotacionar) para os segredos hardcoded nas migrations `016` (senha admin) e `030` (chave de cripto) — eles permanecem no histórico mesmo após a rotação.
