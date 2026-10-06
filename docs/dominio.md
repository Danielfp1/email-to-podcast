# Domínio do email-to-podcast

Host no projeto Vercel `email-to-podcast`: `email-to-podcast.dan-figueiredo.com.br`.

URI de callback, igual à variável `AZURE_REDIRECT_URI` (sem barra no fim):

`https://email-to-podcast.dan-figueiredo.com.br/api/auth/callback`

No registro do aplicativo no Azure, plataforma **Web**, a URI de redirecionamento é essa mesma string. O login continua em `/api/auth/login` nesse host.

O `.com.br` só responde depois que o nameserver no Registro.br for `ns1.vercel-dns.com` e `ns2.vercel-dns.com`. O passo está em `project-hub/docs/dominio.md`. Até lá, gravar a URI no Azure não completa o login.

Sem segredo neste arquivo. `AZURE_CLIENT_SECRET`, `APP_SECRET` e o restante ficam nas variáveis do projeto, como em [`setup.md`](setup.md).
