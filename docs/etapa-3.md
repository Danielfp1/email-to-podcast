# Plano: email-to-podcast etapa 3 — pasta Feed vira RSS

**Task Notion:** [[FEAT] email-to-podcast etapa 3 — pasta Feed vira RSS](https://app.notion.com/p/FEAT-email-to-podcast-etapa-3-pasta-Feed-vira-RSS-3ca71e25165981ea8f7beddd1f06ac74)

Status: **implementado** no repositório GitHub `email-to-podcast`.

Setup Azure / Redis / Blob: [`setup-etapa-3.md`](setup-etapa-3.md).

## Contexto

Serviço TypeScript na Vercel Hobby: a pasta Outlook Feed vira podcast RSS diário.
O cron (1×/dia, até 300 s) lê as mensagens, limpa HTML e gera MP3 no Blob.
E-mail longo vira partes de 7500 caracteres (`MAX_TTS_CHARS`, parágrafo ou frase), todas sintetizadas na mesma execução; o RSS só publica quando as partes daquele e-mail estiverem prontas.
Títulos no feed: Assunto (1/3). No áudio: “Parte N de M”. E-mail acima do teto não entra no digest do dia — vira série própria.
A página /api/tts usa o mesmo teto (60 s e MP3 na resposta). Redis guarda o último e-mail e, só se o lote não couber em 300 s, o que ficou para o dia seguinte.

## Checklist

- [x] App no Azure (conta Microsoft pessoal), escopo `Mail.Read`, OAuth com redirect na Vercel
- [x] Cron diário com `maxDuration` 300 s: pasta `Feed` → limpar HTML/assinatura → MP3 no Blob
- [x] `MAX_TTS_CHARS` 7500 na página e no cron; corte em parágrafo ou frase
- [x] Mesma execução: sintetizar partes em sequência, Blob, RSS só no fim (sem `1/3` órfão)
- [x] E-mail acima do teto sai do digest e vira série `Assunto (N/M)` com fala “Parte N de M”
- [x] Redis: último e-mail visto; cursor do lote só se o dia não couber em 300 s
- [x] `GET /feed/<token>.xml` estável para AntennaPod / Pocket Casts; token **não** no Git
- [x] Variável `OUTLOOK_FOLDER=Feed`
- [x] Modo demo: RSS de exemplo **sem** Graph, para o portfólio
