# Solicitar Orçamento — INATIVO (uso futuro)

A feature de **"Solicite um orçamento"** (wizard multi-passo na landing + tela admin
para visualizar leads) está **desativada** no momento. O código permanece no projeto
pra reativação rápida quando necessário.

A landing voltou ao botão **"Agendar diagnóstico"** (modal com WhatsApp/Email).

## Arquivos mantidos no projeto

### Frontend
- `src/pages/SolicitarOrcamento.jsx` — Wizard de 4 passos
  - Passo 1: Nome, WhatsApp, E-mail (todos obrigatórios)
  - Passo 2: O que deseja melhorar
  - Passo 3: Quantidade de empresas + tabela com dados por empresa
    (litros, faturamento, contas bancárias, cartão frota, adquirentes,
    funcionários, custo médio, **conveniência** via modal)
  - Passo 4: Revisão + envio
- `src/pages/AdminOrcamentoSolicitacoes.jsx` — Listagem admin com filtros,
  modal de detalhe, botões WhatsApp/Imprimir/Excluir, status do funil
- `src/services/orcamentoSolicitacoesService.js` — CRUD + `empresaNova()`

### Backend (migrations)
- `supabase/migrations/084_orcamento_solicitacoes.sql` — Tabela inicial
- `supabase/migrations/085_orcamento_postos.sql` — Email obrigatório, remove
  campos do simulador antigo, adiciona coluna `postos` (JSONB array)

## Como reativar

### 1) Aplicar migrations no Supabase
```bash
supabase db push
```
(ou aplicar manualmente as migrations 084 e 085 pelo painel)

### 2) Descomentar no [`src/App.jsx`](../src/App.jsx)

**4 trechos** precisam ser descomentados:

```jsx
// 1. Import da landing
import SolicitarOrcamento from './pages/SolicitarOrcamento';

// 2. Import do admin
import AdminOrcamentoSolicitacoes from './pages/AdminOrcamentoSolicitacoes';

// 3. Rota pública
<Route path="/solicitar-orcamento" element={<SolicitarOrcamento />} />

// 4. Rota admin
<Route path="/admin/orcamento-solicitacoes" element={<AdminOrcamentoSolicitacoes />} />
```

### 3) Adicionar item na sidebar admin

Em [`src/components/layout/Sidebar.jsx`](../src/components/layout/Sidebar.jsx), na
seção "Comunicações":

```jsx
{
  section: 'Comunicações',
  items: [
    { name: 'Solicitações de Orçamento', href: '/admin/orcamento-solicitacoes', icon: FileText },
    { name: 'Pendências', href: '/admin/pendencias', icon: AlertTriangle },
    // ...
  ],
},
```

### 4) Trocar botões da landing pra navegar pra rota

Em [`src/pages/LandingPage.jsx`](../src/pages/LandingPage.jsx):

```jsx
// Substituir:
const EV_ABRIR_AGENDAR = 'cci:abrir-agendar';
function dispararAgendar() {
  window.dispatchEvent(new CustomEvent(EV_ABRIR_AGENDAR));
}

// Por:
function abrirOrcamento() {
  window.location.href = '/solicitar-orcamento';
}
```

E nos 3 botões, trocar `onClick={dispararAgendar}` por `onClick={abrirOrcamento}` e
o texto "Agendar diagnóstico" / "Agendar diagnóstico gratuito" por
"Solicite um orçamento".

Opcional: remover o `<ModalAgendar />` do JSX e a função `ModalAgendar` +
`OpcaoIndisponivel` se quiser limpar.

## Estrutura de dados (postos / empresas)

Cada item do array `postos` (JSONB na tabela) tem o formato:

```js
{
  nome: 'Posto Itapoá',
  litrosMes: 300000,
  faturamentoMes: 1500000,
  contasBancarias: 3,
  possuiCartaoFrota: true,
  cartoesFrota: 'Ticket Log, Sem Parar',
  adquirentes: 'Cielo, Stone, Getnet',
  funcionarios: 2,
  custoMedioFuncionario: 3800,
  possuiConveniencia: true,
  faturamentoConveniencia: 50000,
}
```

## Status do funil (admin)

| Status | Significado |
|---|---|
| `nova` | Solicitação recém-chegada, não vista |
| `em_analise` | Admin já abriu, está montando proposta |
| `proposta_enviada` | Proposta enviada por WhatsApp/E-mail |
| `aceita` | Cliente aceitou |
| `recusada` | Cliente recusou |
| `arquivada` | Sem retorno / lixeira lógica |
