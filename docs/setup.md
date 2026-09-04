# Setup — Azure, Redis e Blob

Setup do `email-to-podcast` na Vercel Hobby. A hospedagem continua na Vercel. Não cite a URL do deploy no Git; use o domínio do **seu** projeto nas URIs de redirect e no login. RSS, demo e capa: [`feed.md`](feed.md).

```mermaid
flowchart LR
  graph[Azure Graph]
  redis[Upstash Redis]
  tts[Edge TTS]
  blob[Vercel Blob]
  rss[RSS]
  graph -->|"le a pasta Feed"| tts
  tts --> blob
  redis -->|"cursor login lista"| rss
  blob -->|"URL do MP3"| rss
```

## O que cada peça faz

O serviço **não** guarda e-mail no disco da função. Cada serviço cobre uma função.

### Azure (Microsoft Graph)

Permissão de **ler** a caixa Outlook. É um **registro de aplicativo** no Microsoft Entra ID (não Aplicativo Web, Functions, Static Web App nem VM).

Com o login feito, o cron lista a pasta **Feed**, pega assunto e corpo. Sem Azure o Outlook não abre. Não guarda MP3.

Você **não** cola token da caixa no env. O login na Microsoft gera access + refresh; o servidor guarda o refresh no Redis.

### Redis (Upstash)

Memória **pequena**: texto, IDs, tokens. Refresh da Microsoft, último e-mail processado, fila se o cron estourar 300 s, lista de episódios do RSS (título, URL do MP3, data).

Sem Redis o cron não lembra o login nem o índice do feed. Não serve para áudio.

Cria-se no **Marketplace**, não na aba Storage do projeto (lá só aparece Blob).

### Blob (Vercel)

**Arquivos**: cada MP3 do TTS. O RSS aponta `enclosure` para uma URL pública. Sem Blob o podcast não tem o que baixar.

Cria-se em **Storage → Blob** (produto da Vercel), não no Marketplace do Upstash.

### O que você inventa

| Variável | Função |
|---|---|
| `APP_SECRET` | Senha da página e do `/api/auth/login` |
| `RSS_TOKEN` | Pedaço secreto de `/feed/<RSS_TOKEN>.xml`. Não vai para o Git nem para o portfólio |
| `CRON_SECRET` | A Vercel manda `Authorization: Bearer` no cron; muitas vezes ela já cria a var |
| `GEMINI_API_KEY` | Transcrição (etapa 2) |
| `PODCAST_IMAGE_URL` | Capa do canal no RSS (opcional). Sem ela, o feed aponta para `/cover.jpg` |

`VERCEL_OIDC_TOKEN` no `.env.local` vem do `vercel env pull`. JWT curto. **Não** substitui Redis. No Blob novo, na **nuvem** o SDK pode autenticar com OIDC + `BLOB_STORE_ID`.

---

## 1. Redis — Marketplace (Upstash)

1. Abra [vercel.com/marketplace](https://vercel.com/marketplace) (dashboard: **Integrations** / **Marketplace** — não a aba Storage).
2. **Upstash** → **Install**.
3. Time: o mesmo da conta Hobby do projeto `email-to-podcast`.
4. Produto: **Redis** (não Vector, Queue nem Search).
5. Writes e reads: **a mesma região das Functions**. Hobby costuma ser `iad1` → **us-east-1** nos dois. Não misture Brasil e EUA.
6. Eviction ao encher o disco: **desligado** (senão some refresh ou índice do feed).
7. Ambientes: **Production** e **Development**. Preview opcional (mesmo Redis misturaria teste com o feed real).
8. **Custom Prefix:** vazio. Prefixo quebra os nomes que o código espera.
9. Conectar **só** o projeto `email-to-podcast`.

A integração cria `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`.

O código lê **outros nomes**. Em **Settings → Environment Variables** (Production e Development), crie:

| Criar | Copiar de |
|---|---|
| `UPSTASH_REDIS_REST_URL` | `KV_REST_API_URL` (`https://…upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | `KV_REST_API_TOKEN` |

Ignore `KV_REST_API_READ_ONLY_TOKEN` (o cron faz `SET`). `KV_URL` e `REDIS_URL` são `redis://`; este app usa HTTP REST. Pode deixar as `KV_*` no projeto.

Se `KV_REST_API_URL` não aparecer: [console Upstash](https://console.upstash.com) → o Redis → **REST API**.

---

## 2. Blob — Storage da Vercel

Não está no Marketplace.

1. Projeto **`email-to-podcast`** → aba **Storage**.
2. **Create Database** / **Create Store** (não Install Integration).
3. Escolha **Blob** (não Redis, não Postgres).
4. Access: **Public** (o app de podcast baixa o MP3 sem login).
5. Região alinhada às Functions.
6. Production e Development; prefixo vazio.
7. Se a aba do projeto estiver vazia: menu do **time** → **Storage** → Create Blob → **Connect to Project** → `email-to-podcast`.
8. CLI, pasta do repo já com `vercel link`:

```bash
vercel blob create-store email-to-podcast --access public
```

Em Environment Variables:

- `BLOB_READ_WRITE_TOKEN` — começa com `vercel_blob_rw_`. Na página da **store**: Settings → tokens → Reveal / criar token, se o fluxo novo só mostrou o id.
- `BLOB_STORE_ID` — id da store. Na Vercel, com OIDC, o SDK usa isso. O código trata Blob como ligado se existir **qualquer um** dos dois.

No PC: copie para o `.env` ou `vercel env pull` **depois** da store existir.

---

## 3. Azure — registro de aplicativo

1. [portal.azure.com](https://portal.azure.com) → **Registros de aplicativo** → **Novo registro**.
2. Tipos de conta: **contas Microsoft pessoais** (ou org + pessoais, se a opção só-pessoal não aparecer).
3. URI de redirecionamento: plataforma **Web**,  
   `https://<seu-dominio>/api/auth/callback`
4. **Permissões de API** (não Configuração de token) → Microsoft Graph → **delegadas** (não aplicativo):
   - **Mail.Read** (Mail)
   - **offline_access** (OpenId; busca `offline`). Sem isso no login, não vem refresh. O código ainda pede `openid offline_access Mail.Read` na URL.
5. **Certificados e segredos** → novo segredo → copie o **Valor** na hora (não o **ID do segredo**). Se o Valor já estiver `*****`, gere outro.

| No portal | Variável na Vercel |
|---|---|
| ID do aplicativo (cliente) | `AZURE_CLIENT_ID` (GUID público) |
| Segredo → coluna **Valor** | `AZURE_CLIENT_SECRET` |
| `AZURE_REDIRECT_URI` | a mesma URL de callback |
| `AZURE_TENANT` | `consumers` (contas pessoais) |
| `OUTLOOK_FOLDER` | `Feed` |

Depois do deploy:

`https://<seu-dominio>/api/auth/login?secret=<APP_SECRET>`

A tela da Microsoft autoriza; o refresh fica no Redis. Some ~90 dias parado — entra de novo na mesma URL.

### Authentication (Preview)

O menu **Authentication (Preview)** serve para o **redirect**, não para o manifesto.

1. Plataforma **Web** (não SPA) → **Editar**.
2. URI: `https://<seu-dominio>/api/auth/callback` (igual ao `AZURE_REDIRECT_URI`, sem barra extra no fim).
3. **Supported accounts** nesta mesma tela: contas **pessoais**, ou org **e** pessoais. Não deixe só “este diretório”.
4. Guia **Configurações** (concessão implícita): **não** marcar tokens implícitos. O app usa código + secret.

Se Supported accounts não for clicável no Preview: *switch to the old experience* / experiência antiga.

Portal: [portal.azure.com](https://portal.azure.com) · [Registros de aplicativo](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)

### Conta pessoal e `AZURE_TENANT`

O código usa `login.microsoftonline.com/<tenant>/`. Padrão: `consumers`.

| Tipo no Azure (`signInAudience`) | `AZURE_TENANT` |
|---|---|
| Só contas Microsoft pessoais (`PersonalMicrosoftAccount`) | `consumers` |
| Qualquer diretório **e** contas pessoais (`AzureADandPersonalMicrosoftAccount`) | `common` |
| Só este diretório (`AzureADMyOrg`) | conta pessoal **não entra** |

Erro **`unauthorized_client`**: *The client does not exist or is not enabled for consumers* — o app não aceita conta pessoal e/ou o tenant está `consumers` com registro só corporativo. Ajuste Supported accounts (ou manifesto, abaixo) e alinhe `AZURE_TENANT`. Não é senha errada.

### Manifesto (`requestedAccessTokenVersion`)

Ao mudar para contas pessoais, o portal pode falhar:

`Property api.requestedAccessTokenVersion is invalid`

Conta pessoal exige token **v2**. Faça **antes** de salvar Supported accounts:

1. No app, menu **Gerenciar** → **Manifesto** (não Configuração do token, não Authentication Preview).
2. No JSON, bloco `"api"` → `"requestedAccessTokenVersion": 2` (não `null`).
3. **Salvar**.
4. Voltar em Authentication → Supported accounts → pessoais (ou org + pessoais) → salvar.

Se ainda falhar, no mesmo manifesto altere `signInAudience` **junto** com a versão 2:

- só pessoal: `"signInAudience": "PersonalMicrosoftAccount"`
- org + pessoal: `"signInAudience": "AzureADandPersonalMicrosoftAccount"`

Salvar uma vez. Redeploy se mudou `AZURE_TENANT`. Login de novo.

---

## Timeout do cron (`FUNCTION_INVOCATION_TIMEOUT`)

Hobby mata `/api/cron` aos **300 s**. O PowerShell só mostra o erro da Vercel; não é falha do `Invoke-WebRequest` em si.

Na primeira execução real (login Outlook ok, pasta **Feed** com e-mails) o TTS de um lote grande ou de uma fatia de 7500 caracteres pode passar de 5 minutos. Sem gravar a fila no Redis antes, o próximo disparo recomeça do zero e estoura de novo.

O código na **Vercel** para o TTS ~230 s, grava o que já foi feito e responde JSON. O que não coube fica em `pendingJobs`.

No `npm run dev` (`scripts/dev-api.ts`) esse budget **não** vale: o lote pode ir até o fim numa chamada. O `Invoke-WebRequest` local ainda precisa de `-TimeoutSec` alto (o padrão é 100 s) só para o PowerShell esperar o JSON.

1. Redeploy depois dessa correção.
2. Chame o cron de novo com timeout **maior que 300 s** (o padrão do PowerShell é 100 s e corta a leitura da resposta):

```powershell
Invoke-WebRequest -Uri "https://<seu-dominio>/api/cron" -Headers @{ Authorization = "Bearer <CRON_SECRET>" } -TimeoutSec 320
```

Use `https://`. `http://` vira 308 e o PowerShell reclama.

3. Corpo esperado: `demo`, `processed`, `published`, `pendingJobs`, `elapsedMs`, `elapsedSec`. `demo: true` = sem refresh Graph. `pendingJobs` > 0 = rode de novo até zerar (o agendado das 08:00 SP também continua o lote). `elapsedSec` é o tempo de parede dessa corrida (no PC, ordem de grandeza para a Vercel; o teto Hobby continua 300 s).
4. Logs: Vercel → projeto → **Logs**, filtro `/api/cron`.

Não abra o XML do feed no navegador para “forçar” o cron. Assinar o RSS só lê o índice; quem gera MP3 é o `/api/cron`.

---

## Ordem sugerida

1. Redis (Marketplace) + aliases `UPSTASH_*`
2. Blob (Storage) + `BLOB_READ_WRITE_TOKEN` e/ou `BLOB_STORE_ID`
3. `RSS_TOKEN` e `CRON_SECRET`
4. Azure + `AZURE_*`
5. Redeploy (vars novas não entram no deploy antigo)
6. Abrir `/api/auth/login?secret=…`
7. Assinar `/feed/<RSS_TOKEN>.xml` no app de podcast (URL não listada)

Lista canônica: [`.env.example`](../.env.example).
