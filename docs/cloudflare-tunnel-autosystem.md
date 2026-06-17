# Conexão Autosystem via Cloudflare Tunnel

O portal CCI agora suporta 2 modos de conexão com o Postgres do cliente:

| Modo | Como configurar no portal | Esforço no cliente |
|---|---|---|
| **TCP** (padrão) | IP/DDNS + porta + banco + user/senha | Porta aberta no firewall |
| **HTTPS** | URL do proxy + token Bearer | Roda proxy + cloudflared (sem porta aberta) |

A escolha é por rede no wizard `/admin/cadastros → Clientes → Editar rede Autosystem → passo 2 (Conexão)`.

## Contrato HTTPS

O proxy do cliente precisa aceitar:

```
POST /query
Headers:
  Authorization: Bearer <token-configurado>
  Content-Type: application/json
Body:
  { "sql": "select codigo, nome from conta order by codigo",
    "params": [] }
Resposta (200):
  { "rows": [ { "codigo": "1", "nome": "Caixa" }, ... ] }
Resposta (erro):
  { "error": "mensagem" }
```

## Proxy de referência (Node.js)

Salve como `proxy.js`, instale `npm i express pg`, rode com `node proxy.js`.

```js
import express from 'express';
import pg from 'pg';

const PORT      = process.env.PORT      || 8080;
const TOKEN     = process.env.AUTH_TOKEN;            // ex: gere com openssl rand -hex 32
const PG_HOST   = process.env.PG_HOST   || 'localhost';
const PG_PORT   = Number(process.env.PG_PORT || 5432);
const PG_DB     = process.env.PG_DB     || 'autosystem';
const PG_USER   = process.env.PG_USER   || 'cci_readonly';
const PG_PASS   = process.env.PG_PASS;

if (!TOKEN || !PG_PASS) {
  console.error('Defina AUTH_TOKEN e PG_PASS no ambiente.');
  process.exit(1);
}

const pool = new pg.Pool({
  host: PG_HOST, port: PG_PORT, database: PG_DB,
  user: PG_USER, password: PG_PASS,
  max: 5,
  idleTimeoutMillis: 30_000,
});

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/query', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { sql, params } = req.body || {};
  if (!sql) return res.status(400).json({ error: 'sql é obrigatório' });

  try {
    const result = await pool.query(sql, params || []);
    res.json({ rows: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Healthcheck (sem auth, retorna 200 OK)
app.get('/health', (_, res) => res.send('ok'));

app.listen(PORT, () => console.log(`[cci-proxy] listening on :${PORT}`));
```

## Cloudflare Tunnel

No servidor do cliente:

```bash
# 1. Instalar cloudflared
# Windows: choco install cloudflared
# Linux:   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared

# 2. Autenticar (abre browser pra login Cloudflare)
cloudflared tunnel login

# 3. Criar túnel
cloudflared tunnel create cci-posto-x

# 4. Subir túnel publicando o proxy local na :8080
cloudflared tunnel route dns cci-posto-x posto-x.suaempresa.com.br
cloudflared tunnel run --url http://localhost:8080 cci-posto-x

# 5. (Opcional, recomendado) Subir como serviço pra rodar no boot
cloudflared service install
```

## Proxy em máquina separada do Postgres (mesma rede)

A doc até aqui assume **uma máquina só** (Postgres + proxy + cloudflared juntos). Mas é comum o cliente já ter o Postgres num servidor dedicado e querer rodar o proxy/cloudflared em **outra máquina** da LAN (um PC secundário, NAS, container, etc).

Vantagens:
- Não precisa instalar Node/cloudflared na máquina crítica do banco
- Reiniciar/atualizar o proxy não afeta o banco
- Mais uma camada — se a máquina do proxy for comprometida, o Postgres ainda está atrás de firewall + `pg_hba`

### Arquitetura multi-máquina

```
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ Máquina A — SERVIDOR DO BANCO  │   │ Máquina B — PROXY              │
│ IP local: 192.168.1.50         │   │ IP local: 192.168.1.60         │
│                                │   │                                │
│ Postgres (Autosystem) :5432    │←──│ proxy.js (Node) :8080          │
│ • listen_addresses = '<IP_A>'  │   │  PG_HOST = 192.168.1.50        │
│ • pg_hba.conf libera IP_B      │   │                                │
│ • Firewall: 5432 só pra IP_B   │   │ cloudflared (daemon)           │
│                                │   │  ingress: http://localhost:8080│
└────────────────────────────────┘   └──────────┬─────────────────────┘
                                                │ tunnel outbound
                                                ↓
                                     ┌──────────────────────┐
                                     │ Cloudflare           │
                                     │ banco-teste.tuneis…  │
                                     └──────────┬───────────┘
                                                ↓ HTTPS
                                     ┌──────────────────────┐
                                     │ Supabase Edge        │
                                     │ Functions            │
                                     └──────────────────────┘
```

### Máquina A — configurar Postgres pra aceitar conexão da máquina B

#### 1) `postgresql.conf`
Localiza o arquivo (no Windows costuma estar em `C:\Program Files\PostgreSQL\<versão>\data\postgresql.conf`).

```ini
# Trocar 'localhost' pelo IP da interface da rede interna
listen_addresses = '192.168.1.50'   # IP_A na LAN

# ou, mais permissivo (todas as interfaces):
# listen_addresses = '*'
```

Reinicia o serviço Postgres depois:
```powershell
Restart-Service postgresql-x64-15   # ajustar a versão
```

#### 2) `pg_hba.conf`
No mesmo diretório, adicionar linha autorizando apenas a máquina B. Use **`scram-sha-256`** (mais seguro que o `md5` legacy):

```
# TYPE  DATABASE      USER          ADDRESS           METHOD
host    autosystem    cci_readonly  192.168.1.60/32   scram-sha-256
```

`/32` = exatamente esse IP, ninguém mais. Recarrega sem reiniciar:
```sql
select pg_reload_conf();
```

#### 3) Usuário Postgres read-only (recomendação forte)

Numa sessão psql na máquina A, como `postgres`:

```sql
create user cci_readonly with password '<senha-forte>';
grant connect on database autosystem to cci_readonly;
grant usage on schema public to cci_readonly;
grant select on all tables in schema public to cci_readonly;
alter default privileges in schema public grant select on tables to cci_readonly;
```

Mesmo que o token Bearer vaze, atacante só consegue ler — não dropa tabelas nem altera dados.

#### 4) Firewall do Windows — abrir 5432 **só pra IP_B**

PowerShell de administrador:
```powershell
New-NetFirewallRule `
  -DisplayName "Postgres - permitir proxy CCI" `
  -Direction Inbound -Protocol TCP -LocalPort 5432 `
  -RemoteAddress 192.168.1.60 -Action Allow
```

⚠️ **NÃO use `-RemoteAddress Any`** — derrota o propósito. Restringe ao IP exato da máquina B.

### Máquina B — proxy e cloudflared

#### 1) Instalar Node e deps (igual ao cenário single-machine)
```powershell
mkdir C:\cci-proxy; cd C:\cci-proxy
npm init -y
npm install express pg
# Editar package.json e adicionar "type": "module"
```

Cria o `proxy.js` (mesmo código da seção anterior — sem mudanças).

#### 2) Variáveis de ambiente — `PG_HOST` aponta pra máquina A

A **única** diferença em relação ao single-machine:

```powershell
$env:AUTH_TOKEN = "<token>"
$env:PG_HOST    = "192.168.1.50"   # ← IP da máquina A, NÃO "localhost"
$env:PG_PORT    = "5432"
$env:PG_DB      = "autosystem"
$env:PG_USER    = "cci_readonly"
$env:PG_PASS    = "<senha do cci_readonly>"

node proxy.js
# Esperado: [cci-proxy] listening on :8080
```

#### 3) Cloudflared na máquina B

Igual ao cenário single-machine — o `cloudflared` roda na máquina B e aponta pra `localhost:8080` (o proxy local da PRÓPRIA máquina B):

```powershell
cloudflared tunnel login
cloudflared tunnel create cci-cliente-x
cloudflared tunnel route dns cci-cliente-x cliente-x.suaempresa.com.br
cloudflared tunnel run --url http://localhost:8080 cci-cliente-x
```

### Validação ponta a ponta

Execute na ordem — se um passo falhar, os seguintes vão falhar também:

```powershell
# 1) Máquina B alcança máquina A na porta 5432?
Test-NetConnection 192.168.1.50 -Port 5432
# Esperado: TcpTestSucceeded = True

# 2) Login direto no banco a partir da máquina B (sem proxy)
psql -h 192.168.1.50 -U cci_readonly -d autosystem
# Esperado: aceita senha e abre prompt. Erro "no pg_hba.conf entry for host"
# → revisar passo 2 da máquina A. "could not connect" → revisar firewall/listen_addresses.

# 3) Proxy local responde
curl http://localhost:8080/health
# Esperado: ok

# 4) Query através do proxy
curl -X POST http://localhost:8080/query `
  -H "Authorization: Bearer <token>" `
  -H "Content-Type: application/json" `
  -d '{\"sql\":\"select count(*) as n from empresa\"}'
# Esperado: {"rows":[{"n":"N"}]}

# 5) Healthcheck pelo túnel (qualquer máquina com internet)
curl https://cliente-x.suaempresa.com.br/health
# Esperado: ok
```

Depois disso, importar empresas pelo portal funciona normal.

### Trade-offs vs single-machine

| Aspecto | Single-machine | Multi-machine |
|---|---|---|
| Postgres aceita conexão externa? | ❌ Só localhost | ⚠️ Sim, mas restrito a 1 IP da LAN |
| Surface de ataque do banco | Mínima | Pequena — dependente do `pg_hba` + firewall |
| Isolamento de falhas | Acoplado | Independente |
| Esforço de config | Baixo | Médio (4 ajustes na máquina A) |

Multi-machine ainda é **muito mais seguro que o modo TCP "antigo"** (porta exposta na internet): o Postgres só aceita conexão da LAN, e a única exposição externa é o proxy HTTPS atrás do Cloudflare.

### Troubleshooting comum

| Sintoma | Causa provável | Onde olhar |
|---|---|---|
| `Test-NetConnection` falha | Firewall A bloqueando ou `listen_addresses` não inclui IP_A | `postgresql.conf` + regra do firewall |
| psql: "no pg_hba.conf entry for host 192.168.1.60" | Falta linha em `pg_hba.conf` | Revisar passo 2 da máquina A |
| psql: "password authentication failed" | Senha errada do `cci_readonly` | Resetar com `alter user cci_readonly password '...'` |
| Proxy responde mas query dá `relation "empresa" does not exist` | `cci_readonly` no banco errado ou schema errado | Verificar `$env:PG_DB` e grants |
| `curl https://...` retorna 502 + HTML do Cloudflare | Cloudflared não acha o proxy local | Reiniciar `cloudflared` na máquina B |

## Recomendações de segurança

- **Token de 32 bytes hex** (`openssl rand -hex 32`) — único por cliente. Guarde fora do código do proxy (env var ou Vault).
- **Usuário Postgres read-only** — o proxy só faz SELECT. Crie `cci_readonly` com `GRANT SELECT` nas tabelas necessárias.
- **Cloudflare Access** (opcional, recomendado) — adicione policy de mTLS ou IP allowlist no túnel. Mesmo se o token vazar, o request não passa do Cloudflare.
- **Rate limit no proxy** — adicione `express-rate-limit` se quiser bloquear flood.

## O que falta no portal pra usar HTTPS de fato

A UI já registra `https_url + token`. **As edge functions ainda fazem TCP direto.** Pra migrar uma edge function pra suportar HTTPS:

1. Helper em `_shared/`:
   ```ts
   export async function executarQuery(supabase, redeId, sql, params = []) {
     const { data: cred } = await supabase.rpc('as_rede_get_credenciais', { p_id: redeId });
     const c = Array.isArray(cred) ? cred[0] : cred;

     if (c.tipo_conexao === 'https') {
       const resp = await fetch(`${c.conexao_https_url}/query`, {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${c.conexao_https_token}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({ sql, params }),
       });
       const json = await resp.json();
       if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
       return json.rows;
     }

     // TCP (atual)
     const pg = new PgClient({
       hostname: c.conexao_ip, port: c.conexao_porta || 5432,
       database: c.conexao_banco, user: c.conexao_usuario,
       password: c.conexao_senha, tls: { enabled: false },
     });
     await pg.connect();
     try {
       const r = await pg.queryObject(sql, params);
       return r.rows;
     } finally { await pg.end(); }
   }
   ```

2. Cada edge function (`autosystem-contas`, `autosystem-vendas`, etc) substitui o bloco PgClient pela chamada `executarQuery(supabase, redeId, sql)`.

Posso fazer isso em onda — começando por uma edge mais usada (ex: `autosystem-contas-pagar`) e propagando. Avisa quando quiser que eu migre.
