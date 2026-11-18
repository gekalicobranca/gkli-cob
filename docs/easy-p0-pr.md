## Problema e comportamento

Uma falha durante Easy Cap podia substituir a base antes de terminar a importação. Easy Flow podia deixar artefatos ou agenda sem registrar o resultado, tornando uma repetição insegura.

Easy Cap passa a aplicar unidades, contatos, cobranças/parcelas, arquivo/auditoria e conclusão numa transação. Easy Flow usa ledger por parte e grava montagem pausada e liberação/agendamento junto dos respectivos recibos. A repetição recupera efeitos confirmados; divergências e envios incertos ficam bloqueados para revisão, sem recriação ou reenvio automático.

Inclui contenção do legado, proteção de reservas nos percursos compartilhados, autorização no banco e reconciliação de projeções. Preserva as regras da `main` para marcadores de captação manual e ciclo de cobrança. Não muda providers nem executa entrega externa.

## Banco e publicação

Aplicar, em janela autorizada e após homologação isolada, somente:

1. `20261118205314_easy_p0_contencao.sql`
2. `20261118211109_easy_cap_commit_transacional.sql`
3. `20261118220528_easy_flow_transacional.sql`

Roteiro, preflight, manifesto, condições de avanço e reversão: `docs/easy-p0-publicacao.md`. Não reverter para o consumidor destrutivo, apagar recibos ou reenviar comandos incertos. Sem acesso ou alteração de produção nesta preparação.

## Validação

Testes locais de Postgres WASM e fronteiras reais cobrem rollback, perda de resposta, replay, permissões, reservas, partes sucessivas, alterações concorrentes e estados incertos. Compatibilidade de marcadores e fechamento SQL/TypeScript também é verificada. Comandos e resultados finais estão no relatório da candidata.

- 65 testes distintos passaram (63 negócio/regressão + 2 publicação).
- Typecheck, build local, ESLint dirigido e diff/manifesto passaram.
- `npm run test:easy-p0-publicacao` reúne a matriz para reprodução.
- Snapshot de backup regenerado localmente; lockfile e dependências preservados.

## Condições ainda pendentes para merge

- Homologar schema completo, grants/triggers e calendário/SMTP vigentes em banco isolado.
- Testar concorrência entre sessões reais, painel/Maestro, workers com envio desabilitado e volume/locks.
- Conferir navegador, checks `quality`/Vercel, isolamento da Preview e SHA testado.
- Confirmar janela autorizada, drenagem do legado e readiness do banco antes do merge.

Manter este PR em rascunho enquanto essas condições não estiverem satisfeitas. Liberação para agenda não significa entrega confirmada pelo provider.
