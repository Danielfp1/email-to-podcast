# Plano: email-to-podcast etapa 2 — áudio vira texto

Status: **em andamento** no repositório GitHub `email-to-podcast` (deploy Hobby do projeto).

## Contexto

Serviço TypeScript na Vercel Hobby: a mesma página da etapa 1 envia um áudio curto e mostra a transcrição.
Esta etapa entrega o `POST /api/stt` (ogg/mp3/wav/webm/m4a, até 3 min) e o painel na UI, com o mesmo `APP_SECRET`. Sem Outlook, Blob ou RSS.
A transcrição é HTTP via Gemini (`gemini-2.5-flash`, faixa gratuita do AI Studio). Não roda Whisper na função.

## Checklist

- [x] `POST /api/stt`: multipart `audio` → JSON `{ text }` (Gemini `gemini-2.5-flash`, pt)
- [x] Mesma autenticação da etapa 1 (`Authorization: Bearer` + `APP_SECRET`)
- [x] Página: senha compartilhada, arquivo, gravação curta, transcrição e copiar
- [x] Deploy Hobby; conferir no browser (desktop e telefone)
- [x] README: aviso de que clipes longos e Whisper `small` no PC não são o alvo Hobby
