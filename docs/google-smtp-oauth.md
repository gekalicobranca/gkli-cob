# Google OAuth por carteira

O SMTP Gmail usa XOAUTH2 com acesso offline. A renovação ocorre no servidor antes do envio. Os refresh tokens são protegidos com AES-256-GCM em uma tabela acessível apenas ao service_role. Senhas SMTP existentes continuam funcionando nas demais carteiras.

## Configuração Google Cloud

1. Crie ou selecione um projeto da organização e configure o Google Auth Platform (marca, público e acesso a dados).
2. Crie um cliente OAuth do tipo **Aplicativo da Web**.
3. Cadastre exatamente este URI de redirecionamento autorizado:
   `https://gkli-cob.vercel.app/api/integracoes/google-smtp/callback`
4. O fluxo solicita `openid`, `email` e `https://mail.google.com/`. SMTP exige este último escopo, que é restrito. Para distribuição externa, confira os requisitos de verificação Google; para app interno, use projeto da organização e usuários da mesma organização. O administrador Workspace pode precisar permitir o aplicativo.
5. Em modo de teste externo, adicione `operacao@azevedoaraujoadvs.com.br` como usuário de teste. Tokens de apps externos em Testing com esses escopos expiram em sete dias: não trate esse modo como conexão permanente.

## Variáveis do servidor (Vercel Production)

- `GOOGLE_SMTP_CLIENT_ID`: ID do cliente Web.
- `GOOGLE_SMTP_CLIENT_SECRET`: segredo do cliente, nunca no chat ou repositório.
- `GOOGLE_SMTP_REDIRECT_URI`: URI acima.
- `GOOGLE_SMTP_ENCRYPTION_KEY`: 32 bytes aleatórios codificados em base64, mantidos estáveis. Perder/trocar essa chave exige reconectar as contas.

Depois de definir as variáveis, faça novo deploy. Aplique a migração `20260922180000_google_smtp_oauth.sql` antes de publicar o código.

## Conexão

Em Configurações > Integrações, selecione a carteira, salve o e-mail pretendido e clique **Conectar com Google**. Autorize com a mesma conta. A conexão é ativada após a autorização, e a senha antiga é removida dessa configuração. O processo não envia e-mail. O envio de teste é uma ação separada com destinatário explícito.

O retorno valida sessão, state com expiração de dez minutos, PKCE, acesso à carteira, e-mail verificado, escopo concedido e versão do cadastro. Falhas de renovação bloqueiam o envio, sem usar outra conta como fallback.

Referências: https://developers.google.com/identity/protocols/oauth2/web-server e https://developers.google.com/workspace/gmail/imap/xoauth2-protocol
