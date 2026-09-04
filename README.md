# email-to-podcast

Serviço TypeScript na Vercel Hobby: ouvir texto, transcrever recados curtos e, depois, a pasta Outlook **Feed** como podcast RSS. Este repositório é o código público. A instância com a caixa pessoal não entra no portfólio.

## Etapas 1 e 2 — texto ↔ áudio

Cola um texto na página, o servidor gera um MP3 com voz pt-BR (Microsoft Edge TTS) e você baixa o arquivo. No outro painel, envia um áudio curto (arquivo ou gravação) e vê a transcrição. Autenticação: header `Authorization: Bearer` com `APP_SECRET`.

A transcrição chama o Gemini (`gemini-2.5-flash`) na faixa gratuita do AI Studio. Clipes longos ou qualidade tipo Whisper `small` no PC **não** são o alvo Hobby: o limite é recado curto (3 minutos, 8 MB).

Um cron diário (08:00 em São Paulo) lê a pasta Outlook **Feed**, gera MP3s no Vercel Blob e publica RSS em `/feed/<RSS_TOKEN>.xml`. Sem login Microsoft, o feed devolve um episódio de exemplo.

```mermaid
flowchart LR
  ui[Pagina React]
  tts["POST /api/tts"]
  stt["POST /api/stt"]
  gemini[Gemini flash]
  cron["GET /api/cron"]
  graph[Microsoft Graph]
  blob[Vercel Blob]
  rss["GET /feed/token.xml"]
  ui --> tts
  ui --> stt
  stt --> gemini
  cron --> graph
  cron --> blob
  rss --> blob
```

## Como rodar local

1. Copie `.env.example` para `.env` e preencha pelo menos `APP_SECRET` (qualquer string longa) e `GEMINI_API_KEY` ([AI Studio](https://aistudio.google.com/apikey), faixa gratuita com conta Google). RSS, Redis, Blob e Azure: [`docs/setup-etapa-3.md`](docs/setup-etapa-3.md).
2. `npm install`
3. `npm run dev` — UI em `http://localhost:5173`, API em `http://127.0.0.1:3001`.

A senha na página é o mesmo `APP_SECRET`. Ela fica só no `sessionStorage`, não no bundle.

No deploy, os segredos só no painel Vercel (Production e Preview). Não prefixe com `VITE_`.

## Deploy (Hobby, projeto separado)

Projeto Vercel **`email-to-podcast`**, à parte do portfólio. Login Outlook e callback usam o domínio **desse** projeto (`/api/auth/login?secret=<APP_SECRET>` e `/api/auth/callback`).

Feed (não divulgue o token): `/feed/<RSS_TOKEN>.xml`. Cron: a Vercel chama `GET /api/cron` com `CRON_SECRET`.

## Etapa 3 — Azure, Redis e Blob

Setup completo (o que cada serviço faz, Marketplace vs Storage, Azure Preview/manifesto, nomes `KV_*` → `UPSTASH_*`): [`docs/setup-etapa-3.md`](docs/setup-etapa-3.md).

## Etapa 4 — shownotes, timestamps e capa

Checklist: [`docs/etapa-4.md`](docs/etapa-4.md).

O item do RSS usa a data `dd/mm/aaaa` no título (partes: `04/09/2026 (1/3)`). Assunto, links e imagens vão para as **shownotes**, com `M:SS` no começo da linha — AntennaPod, Pocket Casts, Overcast e Castro costumam transformar isso em pulo clicável. Apps que entendem Podcasting 2.0 também leem o JSON de capítulos (`<podcast:chapters>`). Apple e Spotify são irregulares nisso.

Capa do programa: variável `PODCAST_IMAGE_URL` ou arquivo `public/cover.jpg` (quadrado JPEG/PNG, em geral 1400×1400 ou maior). Sem o arquivo e sem a variável, o RSS ainda aponta para `/cover.jpg`.

O TTS não soletra URL: fala “link N” ou “imagem N”. Imagem `cid:` (embutida no Outlook) é anunciada, mas nesta etapa não é rehospedada no Blob.

## O que não vai para o Git

`APP_SECRET`, `GEMINI_API_KEY`, tokens Microsoft, token do RSS, tokens de Blob e Redis, prints da pasta Feed. Se vazar no histórico, rotacionar.

Mesmo com o código aberto, `/api/tts`, `/api/stt` e `/api/cron` continuam com segredo. Sem isso o Hobby vira TTS/STT grátis para o mundo.

## Licença

MIT. A síntese usa [`msedge-tts`](https://www.npmjs.com/package/msedge-tts) (MIT), não o pacote AGPL `edge-tts-universal`. A transcrição usa a [Gemini API](https://ai.google.dev/gemini-api/docs/audio) (`gemini-2.5-flash`).

Áudio e texto passam por Vercel, Blob, Redis, Microsoft Graph, pelo serviço de voz da Microsoft e pelo Gemini. Na faixa gratuita o Google pode usar o conteúdo para melhorar os produtos. Não é um produto para terceiros.
