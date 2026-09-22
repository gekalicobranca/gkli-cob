# Fechamentos → Fiscal do Core

## Comportamento

A migração `20260913180000_fiscal_core_envios.sql` cria uma fila persistente no Cob. Ao passar para `fechado`, o fechamento insere a fila na mesma transação. São consideradas as linhas positivas e pendentes de `fechamento_faturamentos_omie`, sem notas já enviadas, autorizadas ou canceladas, dentro das carteiras autorizadas ao gestor. A tabela mantém seu nome histórico; esta integração não chama Omie ou outro emissor.

O ato de fechar tenta entregar uma rodada ao Core. O painel **Fiscal do Core** permite consultar totais, últimas dez atualizações, IDs recebidos e pendências, além de processar novas rodadas/reenvios. Cada rodada processa até 20 itens e deixa de reservar novos após 20 segundos; a chamada em andamento pode concluir depois desse limite. Filas maiores exigem novas rodadas pelo botão. Não foi instalado agendamento ou worker permanente.

Uma ordem entregue fica **pendente de revisão** no Core. A entrega não emite nota e não marca automaticamente o fechamento como faturado.

## Rastreio e consistência

- Chave natural: `cob:<periodo_id>:<carteira_id_cob>:<condominio_id>:<tipo_faturamento>`.
- O ID da linha de faturamento não integra a chave: ele muda quando a apuração recria a base.
- Dados do emissor, tomador, competência e valor são capturados da base apurada. Valor é convertido para texto no PostgreSQL, sem arredondamento em JavaScript.
- Carteira de destino depende de mapeamento explícito entre UUIDs do Cob e do Core. Não há associação por semelhança de nome.
- A fila congela o corpo antes da primeira tentativa HTTP. Uma falha de resposta preserva os dados e a referência para a confirmação idempotente no Core.
- Reservas duram dois minutos, possuem identificador próprio e excluem itens já tentados na rodada. Uma execução antiga não pode sobrescrever o resultado de outra reserva.
- `409` vira `conflito` e exige conciliação; não é reenviado automaticamente.
- A fila, resultados e auditoria são persistidos no banco. Falha de auditoria desfaz a atualização de entrega.
- Após congelar uma entrega, a base fica protegida contra exclusão ou mudança dos valores e partes, e o período não pode ser reaberto/cancelado ou trocar competência silenciosamente. Antes do congelamento, a preparação atualiza dados corrigidos e remove itens que deixaram de existir/ser elegíveis.
- Antes do congelamento o banco verifica novamente o status do período e os dados atuais da base, protegendo a janela entre reserva e envio.
- A marcação como faturado é bloqueada enquanto houver entregas pendentes na fila.

## Acesso

O painel segue `requireGestor`. O banco restringe consulta e funções a perfis `admin`/`gestor` e à função existente `current_user_can_access_carteira`. `authenticated` não possui escrita direta na fila; as operações de preparação, reserva e conclusão passam pelas funções autorizadas. A integração não usa o service_role do Core no Cob.

No Core, preparar um usuário técnico ativo com acesso ao módulo Fiscal, permissão `fiscal.cob.write` e os vínculos das carteiras de destino. A permissão de inserção manual e o acesso global não são necessários. As credenciais são utilizadas somente pelo servidor do Cob para obter uma sessão no Auth do Core; o cliente renova a sessão uma vez ao receber 401. Respostas de erro e logs não incluem senha, token ou corpo retornado pelo provedor de autenticação.

## Configuração e ativação

1. Banco do Core `dkgwaitonzdlopvzvmyh` retomado pelo usuário e validado como ativo em 13/09/2026.
2. Aplicar a migração `20260913170000_core_fiscal_ordens.sql` no Core e preparar os acessos do usuário técnico.
3. Publicar a versão do Core que contém `POST /api/fiscal/cob/ordens`.
4. Configurar, somente no servidor do Cob, as variáveis de `.env.example`: `GKLI_CORE_FISCAL_URL`, `GKLI_CORE_FISCAL_AUTH_URL`, `GKLI_CORE_FISCAL_PUBLIC_KEY`, `GKLI_CORE_FISCAL_EMAIL`, `GKLI_CORE_FISCAL_PASSWORD` e `GKLI_CORE_FISCAL_CARTEIRAS`.
5. Aplicar a migração da fila no banco do Cob e publicar a versão correspondente. Testar um fechamento de homologação com dados válidos. Preparar um fechamento já fechado é permitido pelo botão; nenhum histórico é enviado em massa pela instalação.

URL do app e URL do Auth aceitam origem HTTPS sem caminhos ou credenciais. HTTP é permitido apenas em localhost para desenvolvimento. Redirecionamentos HTTP são recusados para não encaminhar credenciais a destinos inesperados.

Ativação concluída em 13/09/2026: ambas as migrações foram aplicadas remotamente e registradas no histórico; Core e Cob publicados. As seis variáveis estão configuradas em produção no servidor do Cob. As cinco carteiras possuem mapeamento explícito para os mesmos UUIDs no Core; o usuário técnico possui apenas `fiscal.cob.write` e acesso a essas carteiras.

Configuração atual: GEKALI e Valente Gomes usam o CNPJ emissor `53477547000149`; razão social GEKALI COBRANCA LTDA, município SAO PAULO/SP, confirmados pelo cartão CNPJ fornecido em 13/09/2026. Genske Advogados e Azevedo Araújo não enviam pelo Core (`fiscal_core_habilitado=false`). Sindsmart permanece sem alteração. A migração `20260913200000_fiscal_core_carteiras.sql` aplica o controle na preparação, reserva e congelamento, mantendo o histórico consultável. Dez testes do adaptador e fila passaram após essa alteração. Dados de fechamento já apurados não foram reescritos: depois de completar o cadastro, reapurar o período aberto antes de fechar.

A instalação não enviou histórico; a fila foi verificada vazia e o período existente permaneceu aberto. RLS da fila está habilitado e escrita direta por `authenticated` foi confirmada como negada.

A publicação do Cob foi preparada em `C:\Users\Gekali\gkli-cob-fiscal-release`, ramo `codex/fiscal-core-activation`, sobre a versão que já estava em produção (`4493de7`), incorporando somente esta integração. Deployment ativo: `dpl_6EbBFG2dvLBuaFH6Y3o83eceqjcK`, https://gkli-cob.vercel.app. As demais alterações locais do checkout original foram preservadas.

## Validação e limites

`npm run test:fiscal` executa testes do adaptador, cliente HTTP e a migração real em PostgreSQL via PGlite com os contratos mínimos das tabelas existentes. Cobre escopo, duplicidade, recuperação de reserva, erro de rede, renovação de sessão, congelamento, mudança de origem antes do envio, auditoria e proteção de estado. PGlite serializa operações; homologação deve incluir conexões concorrentes reais.

`npm run typecheck` e `npm run build` verificam a integração com a aplicação. As alterações anteriores no checkout do Cob foram preservadas; falhas preexistentes nas verificações gerais devem ser distinguidas dos arquivos desta entrega.

Resultado desta rodada: 9 testes do Cob e 15 testes do Core passaram; o build completo do Cob terminou com sucesso, incluindo verificação de tipos. Foi removido apenas `.next/dev/types/validator.ts`, artefato gerado antigo que referenciava rotas removidas do portal do síndico. O prebuild regenerou o snapshot de esquema conforme o comando já existente no projeto.

Conciliação/cancelamento de ordens do Core, alterações após entrega e processamento contínuo da fila são evoluções posteriores. Até existir esse fluxo, não remover o corpo congelado nem trocar a chave para contornar um conflito.

## Arquivos

- `features/fechamento/fiscal/*`: adaptação, autenticação/HTTP, processamento da fila e painel.
- `features/fechamento/actions.ts`: tentativa de entrega após fechar.
- `app/app/gestao/fechamento/[id]/page.tsx`: painel da fila.
- `supabase/migrations/20260913180000_fiscal_core_envios.sql`: fila, funções, permissões, gatilhos e proteção da origem.
- `scripts/validate-fiscal-core.ts`, `package.json`, `package-lock.json`: testes e dependência PGlite.
- `lib/backup/schema-files.generated.ts`: snapshot de esquema regenerado pelo prebuild existente.
- `.env.example`, `docs/fiscal-core.md`: configuração e operação.
