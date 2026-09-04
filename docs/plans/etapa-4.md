# Plano: email-to-podcast etapa 4 — shownotes, timestamps e capa

**Task Notion:** [[FEAT] email-to-podcast etapa 4 — shownotes, timestamps e capa](https://app.notion.com/p/FEAT-email-to-podcast-etapa-4-shownotes-timestamps-e-capa-3d171e2516598116bab5e04e8aa715c0)

Status: **implementado** no repositório GitHub `email-to-podcast`.

Como o feed opera hoje: [`../feed.md`](../feed.md).

## Contexto

O RSS passa a ter corpo do episódio (shownotes) e capítulos Podcasting 2.0, além da capa do canal.
O título do item é só a data `dd/mm/aaaa` (São Paulo); partes longas continuam `04/09/2026 (1/3)` no mesmo cron.
O assunto do e-mail não vira título: vai para o áudio (“Assunto: …”) e para as shownotes, com timestamp.
Links e imagens saem do texto falado (TTS diz “link N” / “imagem N”) e entram na descrição com `M:SS` no início da linha.
Digest de e-mails curtos e série de e-mail longo **continuam separados**. Não há um episódio único por dia.

## Checklist

- [x] Graph lê HTML (sem `Prefer` texto); parser extrai links/imagens e roteiro sem URL
- [x] Título RSS = `dd/mm/aaaa`; assunto só no áudio e nas shownotes
- [x] Digest vs série e partes `(N/M)` no mesmo dia; RSS só com o job completo
- [x] TTS por segmento no digest, concat MP3; cues relativos a `0:00` de cada parte
- [x] Shownotes + `<podcast:chapters>` (JSON no Blob)
- [x] Capa do canal (`itunes:image` / `<image>`): `PODCAST_IMAGE_URL` ou `/cover.jpg`
- [x] Demo sem Graph: título com a data, descrição de exemplo
