# Feed RSS

Como o podcast funciona **hoje**. Planos: [`plans/README.md`](plans/README.md). Setup Azure/Redis/Blob: [`setup.md`](setup.md).

## Título e episódios

O canal chama **Feed**. O título de cada item é a data em São Paulo, `dd/mm/aaaa`. Partes de um job longo: `04/09/2026 (1/3)`.

O assunto do e-mail **não** vira título. O TTS fala “Assunto: …” e o mesmo nome vai para as shownotes.

- **Digest:** vários e-mails curtos (até 7500 caracteres com o prefixo de assunto) num job só.
- **Série:** cada e-mail acima do teto vira job próprio, fatiado; as partes `(N/M)` publicam juntas no mesmo cron. No áudio: “Parte N de M.”

Dois jobs no mesmo dia podem ter o mesmo título; o `guid` distingue.

## Shownotes e capítulos

O item RSS leva descrição com `M:SS` no **início da linha** (AntennaPod, Pocket Casts, Overcast, Castro costumam transformar isso em pulo). Apps que entendem Podcasting 2.0 também leem o JSON de capítulos (`<podcast:chapters>` no Blob). Apple e Spotify são irregulares.

Exemplo:

```
0:00 Newsletter A
1:10 Imagem #1
     https://…
3:42 Relatório B
4:01 Link #1
     https://…
```

O TTS não soletra URL: fala “link N” ou “imagem N”. Imagem `cid:` (embutida no Outlook) é anunciada, sem rehospedar o arquivo no Blob.

## Capa

Capa do **programa** (canal), não de cada episódio.

- Variável `PODCAST_IMAGE_URL` (JPEG/PNG público), ou
- arquivo `public/cover.jpg` no repo (quadrado, em geral 1400×1400 ou maior)

Sem os dois, o RSS ainda aponta para `/cover.jpg`. No telefone use o domínio do deploy; `localhost` no app de podcast não carrega a arte da sua máquina.

## Demo (sem Outlook)

Episódio de exemplo no RSS quando **não** há login Microsoft.

Precisa de Redis, Blob e `RSS_TOKEN`. A lista de episódios tem que estar vazia e o Redis **sem** refresh token (`e2p:graph:refresh`).

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:3001/api/cron" -Headers @{ Authorization = "Bearer <CRON_SECRET>" } -TimeoutSec 120
```

Resposta com `"demo": true`. Na primeira vez `processed`/`published` 1; depois 0 (já existe item).

Feed local (Vite faz proxy): `http://localhost:5173/feed/<RSS_TOKEN>.xml`. A primeira leitura do XML também gera o demo se a lista estiver vazia.

No deploy: o mesmo `/api/cron` no domínio Hobby, depois `/feed/<RSS_TOKEN>.xml`.

## Desconectar (hoje)

Não há rota de logout. O login é o refresh token na chave Redis `e2p:graph:refresh`.

No console Upstash (CLI ou Data Browser):

```
DEL e2p:graph:refresh
```

O cron seguinte responde `"demo": true`. Episódios já publicados continuam. Para o feed voltar só ao exemplo:

```
DEL e2p:graph:refresh
DEL e2p:feed:items
```

Opcional: `DEL e2p:mail:cursor` e `DEL e2p:mail:pending` para zerar o progresso da pasta Feed.

Para revogar o app na Microsoft: [account.microsoft.com](https://account.microsoft.com) → Privacidade → Apps e serviços.

Rota autenticada de logout: [`plans/etapa-5.md`](plans/etapa-5.md) (pendente).
