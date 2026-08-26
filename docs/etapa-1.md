# Plano: email-to-podcast etapa 1 — texto vira áudio

**Task Notion:** [[FEAT] email-to-podcast etapa 1 — texto vira áudio](https://app.notion.com/p/FEAT-email-to-podcast-etapa-1-texto-vira-udio-3c871e25165981389cb2c3db12d534d3)

Status: **em andamento** no repositório GitHub `email-to-podcast`.

## Contexto

Serviço TypeScript na Vercel Hobby: cola texto no celular ou no PC e baixa um MP3 em voz pt-BR.
Esta etapa entrega a página (Vite + React) e o POST /api/tts, protegidos com APP_SECRET. Sem Outlook, Blob, RSS ou STT.
O deploy Hobby fica para conferência manual depois; o código e o README saem neste repo.
O frontend é React para a mesma URL receber STT na etapa 2, sem trocar de stack.

## Checklist

- [x] Repo TypeScript ESM, licença MIT, `.env.example`
- [x] Página Vite + React: texto, senha (APP_SECRET), botão, player e download MP3
- [x] `POST /api/tts`: texto → MP3 (voz pt-BR, msedge-tts em memória)
- [x] Proteger com `APP_SECRET` (Bearer); recusar sem segredo no servidor
- [ ] Deploy Hobby no projeto separado do portfólio; conferir no browser (desktop e telefone)
- [x] README inicial (estudo de caso + o que não commitar)
