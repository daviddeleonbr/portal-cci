# Modo manutenção

Página estática em [`public/em-manutencao.html`](public/em-manutencao.html) servida pela Vercel.
Quando ativo, **qualquer rota** do domínio (`/`, `/cliente/login`, `/admin`, etc.) cai nela.
Rotas `/api/*` continuam funcionando normalmente (webhooks/cron seguem operando).

## Por que precisamos de **2 mudanças** no vercel.json

A ordem de roteamento da Vercel é:

1. Redirects
2. Rewrites
3. **Filesystem (`index.html`, `assets/`, etc.)**

A raiz `/` é servida pelo `index.html` estático **antes** do rewrite catch-all atuar.
Por isso usamos:

- **Redirect** explícito para `/` (precedência absoluta sobre static files)
- **Rewrite** catch-all para qualquer outra rota (`/cliente/...`, `/admin/...`, etc.)

## Ativar (modo manutenção)

Em [`vercel.json`](vercel.json), garantir os 2 blocos:

```json
{
  "redirects": [
    { "source": "/", "destination": "/em-manutencao.html", "permanent": false }
  ],
  "rewrites": [
    { "source": "/api/quality/:path*",       "destination": "https://web.qualityautomacao.com.br/INTEGRACAO/:path*" },
    { "source": "/api/asaas-sandbox/:path*", "destination": "https://api-sandbox.asaas.com/v3/:path*" },
    { "source": "/api/asaas/:path*",         "destination": "https://api.asaas.com/v3/:path*" },
    { "source": "/((?!api/).*)",             "destination": "/em-manutencao.html" }
  ]
}
```

Commit + push. A Vercel publica em ~30s.

> Ao acessar `https://dominio/`, o navegador é redirecionado (HTTP 307) para `/em-manutencao.html`.
> A URL muda visualmente — para página de manutenção isso é aceitável e até deixa explícito o estado.

## Desativar (modo normal)

Em [`vercel.json`](vercel.json), remover o bloco `redirects` e voltar o destino do catch-all para `/index.html`:

```json
{
  "rewrites": [
    { "source": "/api/quality/:path*",       "destination": "https://web.qualityautomacao.com.br/INTEGRACAO/:path*" },
    { "source": "/api/asaas-sandbox/:path*", "destination": "https://api-sandbox.asaas.com/v3/:path*" },
    { "source": "/api/asaas/:path*",         "destination": "https://api.asaas.com/v3/:path*" },
    { "source": "/((?!api/).*)",             "destination": "/index.html" }
  ]
}
```

Commit + push.

## Limpando cache da Vercel após mudar

A Vercel pode reter `x-vercel-cache: HIT` da resposta antiga. Se depois do push o `/` continuar mostrando o estado anterior:

1. Dashboard → Deployments → deploy do commit → menu **`⋯`** → **Redeploy** (desmarcar "Use existing Build Cache").
2. Ou faça um commit dummy: `git commit --allow-empty -m "redeploy" && git push`.

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

## Observações

- A página **não depende** do bundle React, do Supabase ou de fontes externas — funciona mesmo se o backend estiver fora.
- `https://dominio/em-manutencao.html` é **sempre** acessível direto (estáticos têm precedência), útil para preview sem ativar o modo.
- `<meta name="robots" content="noindex">` bloqueia indexação durante a janela.
