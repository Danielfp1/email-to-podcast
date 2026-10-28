# Plano: erros na página e doc do msedge-tts

**Status:** em andamento.
**Task Notion:** [[FEAT] erros na página e doc do msedge-tts](https://app.notion.com/p/FEAT-erros-na-p-gina-e-doc-do-msedge-tts-3ff71e25165981809ec4f12b51dd79e3)

## Objetivo

Quando `pendingJobs` sobra por falha (voz `429`/`403`, Blob token/store), a página mostra a mensagem curta do erro em vez de só “Clique de novo”. Documentar por que o `msedge-tts` foi para 2.1.0 e como o Blob local depende do token certo.

## Decisões

- Campo opcional `warning` no JSON de **sucesso** (200) de `runFeed` / cron / `run-feed`: texto de `err.message` (sem token, sem stack). O `console.error` no servidor permanece.
- Parar por **budget** (~230 s) continua sem `warning`: só `pendingJobs` e o texto pedindo outro clique.
- Parar por **catch** em TTS/Blob: preenche `warning` e ainda pode ter `pendingJobs` > 0 (fila preservada).
- `502` com `{ error }` (Redis, Blob “não configurado”, etc.) já existe; o painel já exibe — não mudar o contrato de falha total.
- `msedge-tts` no repo já está em `^2.1.0`; a doc registra o motivo e exige essa versão mínima. Garantir `package-lock.json` na 2.1.x no commit (sem patch manual em `node_modules`).

## Inputs

Nenhum segredo neste arquivo. Repo `email-to-podcast`.

- Fila: `lib/run-feed.ts` — `fillParts` engole erro no `catch`; `runFeed` devolve só contadores.
- Handlers: `lib/handle-run-feed.ts`, `lib/handle-cron.ts` — passam o JSON de `runFeed` adiante.
- UI: `src/PodcastPanel.tsx` — hoje só mostra “Clique de novo” se `pendingJobs` > 0.
- Doc: `docs/setup.md` (Blob, timeout); `package.json` (`msedge-tts`).
- Env local: `dev:api` carrega `.env` depois `.env.local` (o segundo vence).

## Checklist

- [x] `fillParts` / `processJobs` / `runFeed` propagam `warning` (última falha de TTS/Blob); budget sem `warning`
- [x] `PodcastPanel`: se vier `warning`, mostra em `.error`; se `pendingJobs` > 0 sem `warning`, mantém o pedido de outro clique; se os dois, mostra o erro e deixa claro que a fila ainda existe
- [x] `docs/setup.md`: seção curta — Edge TTS exige `msedge-tts` ≥ 2.1.0 (em out/2026 a Microsoft mudou o host/handshake; 2.0.7 dava `403`); nota de `429` (limite por IP, esperar); Blob no PC precisa de `BLOB_READ_WRITE_TOKEN` válido e `.env.local` sobrescreve `.env` (store inexistente / access denied)
- [x] Confirmar `package-lock.json` com `msedge-tts` 2.1.x alinhado ao `package.json`

## Teste

1. Forçar falha de Blob (token inválido ou store morta): resposta 200 com `pendingJobs` ≥ 1 e `warning` contendo o texto do SDK; a página mostra esse texto.
2. Budget: sem alterar o código de deadline, o comportamento “só clique de novo” permanece quando não houve `catch`.
3. `502` (ex.: Redis ausente) continua só com `{ error }`, como hoje.
4. Conferir no doc o parágrafo do `msedge-tts` 2.1.0 e o aviso `.env` / `.env.local`.

## Fora de escopo

- Trocar provedor de TTS (Azure Speech pago, etc.).
- Retry automático / backoff no cliente.
- Logout, retenção, etapa 5.
- Commit ou deploy (só quando você pedir).
