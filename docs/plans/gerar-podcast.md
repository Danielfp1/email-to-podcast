# Plano: botão para gerar o podcast

**Status:** em andamento.
**Task Notion:** [[FEAT] botão para gerar o podcast](https://app.notion.com/p/FEAT-bot-o-para-gerar-o-podcast-3fe71e25165981f6a224e4203751823e)

## Objetivo

Na página que já pede a senha (`APP_SECRET`), um painel com o botão **Gerar podcast** dispara a mesma geração do cron: pasta Outlook **Feed**, MP3 no Blob, item no RSS.
O cron das 08:00 (São Paulo) continua em `GET /api/cron` com `CRON_SECRET`. A página não envia esse segredo.
E-mail que chegou na pasta **Feed** depois do cron do dia entra nessa chamada. O XML do feed não gera áudio.

## Decisões

- Rota nova `POST /api/run-feed`. Autorização só com `isAuthorized` (`Authorization: Bearer` + `APP_SECRET`). `GET` responde 405.
- O handler chama `runFeed()` e devolve o mesmo JSON do cron: `demo`, `processed`, `published`, `pendingJobs`, `pendingMessages`, `elapsedMs`, `elapsedSec`. Falha: status 502 e `{ error }`.
- `/api/cron` não passa a aceitar `APP_SECRET`. O agendamento da Vercel e o PowerShell com `CRON_SECRET` ficam como estão.
- Na Vercel a função usa `maxDuration` 300 e `includeFiles` iguais aos de `api/cron.ts`. O budget interno de ~230 s (`cronDeadlineMs`) vale no deploy; no `npm run dev` não vale.
- O botão não fica em loop. Se `pendingJobs` > 0, o texto pede outro clique.
- A senha é a mesma já digitada no topo (`sessionStorage`). Sem campo novo e sem `CRON_SECRET` no cliente.

## Inputs

Nenhum segredo neste arquivo. Código no repo `email-to-podcast`.

- Página: `src/App.tsx` (senha), `src/TtsPanel.tsx` (padrão de `fetch` com Bearer), classes `.panel` e `.actions`.
- Geração: `lib/run-feed.ts` (`runFeed`), `lib/handle-cron.ts`, `lib/auth.ts` (`isAuthorized`).
- API local: `scripts/dev-api.ts` (hoje registra `/api/cron`). Proxy do Vite: `vite.config.ts` (`/api` → `127.0.0.1:3001`).
- Deploy: `vercel.json` (`api/cron.ts` com `maxDuration` 300). Pasta Outlook: `Feed` (`OUTLOOK_FOLDER`).
- Referência do cron manual: `docs/setup.md` (timeout) e `docs/feed.md` (não abrir o XML para gerar).

## Checklist

- [x] `POST /api/run-feed` exige `APP_SECRET` (401 sem senha, 500 se o servidor não tiver a variável, 405 em GET) e chama `runFeed()`
- [x] `vercel.json`: `api/run-feed.ts` com `maxDuration` 300 e `includeFiles` iguais ao cron
- [x] `scripts/dev-api.ts` registra `POST /api/run-feed`
- [x] Painel abaixo da transcrição: botão **Gerar podcast**, estado **Gerando…**, usa a senha já digitada
- [x] O painel mostra `processed`, `published`, `pendingJobs` e `demo`; se `pendingJobs` > 0, pede outro clique; se `demo` for true, avisa que não há login do Outlook
- [x] `docs/feed.md` e `docs/setup.md`: o botão é o caminho manual; `Invoke-WebRequest` em `/api/cron` continua; abrir o XML não gera MP3

## Teste

1. `npm run dev`. Sem senha, o botão mostra o pedido para informar a senha e não chama a API.
2. Senha errada: a página mostra não autorizado.
3. Senha certa, com e-mail novo na pasta **Feed**: a resposta tem `demo: false` e `published` > 0. O item aparece no RSS depois de atualizar o app de podcast.
4. Segunda chamada sem e-mail novo: `processed` e `published` em 0. Nada duplicado no feed.
5. Se `pendingJobs` > 0, um novo clique continua o lote até zerar.
6. `GET /api/run-feed` (com ou sem senha) responde 405. `GET /api/cron` sem `CRON_SECRET` continua 401.

## Fora de escopo

- Logout, retenção de MP3, aviso de login caído e página de portfólio (`docs/plans/etapa-5.md`).
- Mudar o horário do cron (`0 11 * * *`) ou aceitar `APP_SECRET` em `/api/cron`.
- Mostrar a URL do feed ou o `RSS_TOKEN` na página.
- Gerar de novo um e-mail que já está no cursor (`e2p:mail:cursor`).
