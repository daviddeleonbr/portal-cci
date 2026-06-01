# Modo manutenção

Página estática em [`public/em-manutencao.html`](public/em-manutencao.html) servida pela Vercel.
Quando ativa, **qualquer rota** do domínio (`/`, `/cliente/login`, `/admin`, etc.) cai nela.
Rotas `/api/*` continuam funcionando normalmente (webhooks/cron seguem operando).

## Ativar

Em [`vercel.json`](vercel.json), trocar o destino do catch-all:

```diff
- { "source": "/((?!api/).*)", "destination": "/index.html" }
+ { "source": "/((?!api/).*)", "destination": "/em-manutencao.html" }
```

Commit + push. A Vercel publica em ~30s.

## Desativar

Reverter a mesma linha:

```diff
- { "source": "/((?!api/).*)", "destination": "/em-manutencao.html" }
+ { "source": "/((?!api/).*)", "destination": "/index.html" }
```

Commit + push.

## Editar a mensagem de previsão

Em [`public/em-manutencao.html`](public/em-manutencao.html), bloco marcado:

```html
<!-- EDITE AQUI: previsão de retorno -->
<div class="eta">
  <span class="eta-label">Previsão de retorno</span>
  Voltamos em alguns minutos.        <!-- ← trocar este texto -->
</div>
<!-- /EDITE AQUI -->
```

Exemplos: `Previsto retorno às 14h`, `Voltamos amanhã às 8h`, `Janela estimada: 30 minutos`.

## Testar antes do push

```bash
npx vite build
npx vite preview
```

Abrir direto: <http://localhost:4173/em-manutencao.html>

Para simular o kill-switch local: editar o `vercel.json` apontando para
`/em-manutencao.html`, rodar `vercel dev` e conferir que rotas como `/cliente/login`
servem a página de manutenção.

## Observações

- A página **não depende** do bundle React, do Supabase ou de fontes externas — funciona mesmo se o backend estiver fora.
- `https://dominio/em-manutencao.html` é **sempre** acessível direto (estáticos têm precedência), útil para preview sem ativar o modo.
- A página retorna HTTP 200 (não 503). Como a janela é curta, o risco de SEO é desprezível; o `<meta name="robots" content="noindex">` já bloqueia indexação.
