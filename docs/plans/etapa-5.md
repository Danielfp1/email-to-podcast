# Plano: email-to-podcast etapa 5 — operação

Status: **a implementar** no repositório GitHub `email-to-podcast`.

Desconectar **hoje** (apagar chave no Redis): [`../feed.md`](../feed.md).

## Contexto

O feed já publica RSS. Falta operação contínua: o Blob não pode crescer sem teto, o login Microsoft some em silêncio, e não há URL para desconectar o Outlook.
Página curta no portfólio (sem URL do feed pessoal) e limpeza extra de e-mail entram nesta etapa.

## Checklist

- [ ] Apagar MP3s velhos no Blob (retenção, ex. 30 dias)
- [ ] Aviso quando o login Microsoft tiver caído (página ou e-mail, não WhatsApp)
- [ ] Logout autenticado com `APP_SECRET`: apagar `e2p:graph:refresh` (rota ou comando; hoje só `DEL` no Upstash)
- [ ] Página curta no portfólio: problema, restrições, recorte, link do GitHub (sem URL do feed pessoal)
- [ ] Ajustes finos de limpeza de e-mail (assinatura, threads)
