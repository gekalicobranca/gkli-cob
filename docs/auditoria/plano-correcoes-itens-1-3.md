> Atualização de publicação: correções disponíveis em produção em 02/11/2026. Evidências em [registro da publicação](publicacao-autorizacao-itens-1-3-2026-11-02.md). O relato local abaixo registra a etapa anterior.

# Plano de correções - itens 1, 2 e 3

Implementação local de 02/11/2026. Sem deploy e sem alteração de dados de produção.
Estes números se referem ao plano de cinco correções, não ao item anterior de
autorização/perfis. Alterações paralelas existentes na pasta foram preservadas.

## 1. Aprovação do síndico

- A configuração vigente do condomínio decide a necessidade de aprovação. O limite
  continua sendo o cadastrado: quantidade acima de um limite positivo exige aprovação;
  limite zero mantém a política anterior sem essa exigência automática. Entrada não
  aumenta a contagem de parcelas; o plano aceita uma única entrada de número zero.
- A RPC financeira recalcula a regra sob bloqueio do condomínio, ignorando o indicador
  de aprovação enviado pelo cliente. A aplicação consulta o estado efetivamente salvo
  antes de preparar termo e pedido de boletos, inclusive em mudança concorrente da configuração.
- Proposta acima do limite fica em `aguardando_aprovacao_sindico`, sem documento do
  devedor ou solicitação de boletos. Triggers protegem formalização, mensagens, campo
  de aprovação e acréscimos de parcelas por chamadas diretas ao banco.
- Apenas administrador/gestor pode registrar a decisão recebida do síndico, com evidência.
  A RPC bloqueia o acordo e as parcelas, valida estado e pagamentos e registra decisão
  imutável. Repetição, decisão contrária e conta sem autorização são recusadas.
- Rejeição cancela somente parcelas não pagas, libera cobranças ainda em negociação e
  devolve exatamente o crédito anteriormente reservado, quando houver. Acordo com
  pagamento exige revisão e não pode ser rejeitado automaticamente. Pagamentos não
  são apagados nem substituídos.
- Após aprovação, o detalhe do acordo permite preparar a formalização. Essa operação
  pode ser retomada sem repetir a decisão. Preparar documentos não significa enviá-los.
- Aumento do número aprovado de parcelas exige nova proposta; a aprovação não pode
  ser removida por edição de campos. Nenhum percentual ou limite comercial foi alterado.

Migração: `20261102174844_auditoria_aprovacao_sindico.sql`.
A função financeira atual é preservada por alteração com âncoras verificadas, mantendo
locks, proteção de duplicidade e suporte a múltiplas unidades.

## 2. Máquina de estados do pré-jurídico

Fluxo principal:

`aguardando_documentos -> aguardando_sindico -> confirmar_juridico -> enviado_juridico
-> analise_juridica -> autorizado_ajuizamento -> pronto_juridico -> judicializado`.

Análise pode ir para pendência e retornar. Novo caso começa na confirmação de propriedade.
Os caminhos genérico e específicos passam pelo mesmo trigger de validação.

- Certidão recebida e seu registro são obrigatórios para sair da propriedade;
  procuração assinada e seu registro, para sair da procuração.
- Procuração confirmada, registro recebido e laudo enviado são exigidos antes do envio
  ao jurídico. São confirmações operacionais declaradas por usuário autorizado, sem
  inferência de recebimento a partir de documento apenas gerado.
- Operador prepara documentos e confirma recebimentos. Administrador/gestor registra
  revisão/autorização jurídica e confirma a distribuição. A autorização registra evidência,
  usuário e data; os campos não podem ser preenchidos por um payload arbitrário.
- CNJ aceita formato canônico ou 20 dígitos, com verificação MOD 97-10, tanto em
  TypeScript quanto no banco. A ação genérica não judicializa: utiliza-se a confirmação
  específica de distribuição.
- Distribuição válida muda etapa/status/CNJ no mesmo comando. O trigger existente
  atualiza a unidade e somente as cobranças canônicas vinculadas ao pré-jurídico,
  preservando débitos novos alheios ao caso e cobranças pagas.
- RPC com lock e versão esperada rejeita atualização concorrente/obsoleta. Os formulários
  enviam a versão exibida. Confirmações e procurações em lote usam uma transação;
  falha em um caso desfaz o lote inteiro.
- Histórico próprio guarda versão, estado anterior/novo, responsável e evidências no
  mesmo commit. Workers podem confirmar envio de procuração já gerada, sem fabricar
  revisão jurídica ou avançar etapas.
- Casos legados já em distribuição, sem os requisitos novos, não são aprovados por
  backfill. Administrador/gestor pode reabrir a conferência documental, com histórico.

Migração: `20261102174848_auditoria_pre_juridico_estados.sql`.

## 3. Vencimentos e datas civis

- `lib/core/data-civil.ts` é compartilhado por simulador, Server Action e propostas Keila.
- Datas são strings civis YYYY-MM-DD, estritamente validadas, sem normalização de
  30/02 ou 31/04. O mês de destino usa o menor entre o dia original e seu último dia.
  Exemplo: 31/01/2026, 28/02/2026, 31/03/2026, 30/04/2026.
- A referência operacional de hoje é America/Sao_Paulo. Prazos em dias, janela de
  reemissão e classificação do vencimento não dependem do fuso do servidor.
- Entrada, primeiro vencimento e alterações de vencimento são validados no servidor.
  A RPC financeira também exige formato civil e usa a validação de calendário do PostgreSQL.
- O simulador não cria prévia válida para datas inexistentes; criação é bloqueada.
  Datas e valores de parcelas já existentes não são recalculados em massa.

## Validação e reprodução

- `npm run test:audit-1-3`: módulos reais de simulador e Server Action com dependências
  simuladas; funções reais e triggers das novas migrações executados em PGlite.
- Abrange limite abaixo/exato/acima, limite zero, entrada, alteração concorrente de
  configuração, falta de aprovação, duas decisões em fila, rejeição com pagamentos,
  crédito, tentativa de aumentar parcelamento aprovado e datas inválidas.
- Abrange todos os passos principais do pré-jurídico, pendência, saltos, falta de
  documentos, revisão não autorizada, CNJ inválido/válido, distribuição e histórico,
  conflito de versão, rollback de lote e reabertura de caso legado.
- Datas: dias 28 a 31, fevereiro, anos bissextos/seculares, março, agosto, vários meses,
  fusos distintos e virada do dia em São Paulo. Prévia do simulador é comparada à
  Server Action real; datas persistidas pela RPC são comparadas à função compartilhada.
- Regressões relevantes: `validate-custo-boleto.ts`, `validate-pre-juridico-eligibilidade.ts`,
  `validate-keila-acordos.ts`, suíte de autorização e script local dos itens 4/5.
- TypeScript verificado sobre código versionado e novos arquivos, excluindo cópias
  locais ignoradas; ESLint nos arquivos afetados; `git diff --check`.

As evidências ficam em `outputs/auditoria-itens123/`. PGlite tem uma conexão: a disputa
de decisões é exercitada em fila. A execução com conexões PostgreSQL independentes,
os provedores de envio e o teste E2E de navegador ficam para homologação. Não houve
consulta às administradoras, envio de mensagens ou execução de build com arquivos de ambiente.

## Homologação antes de publicar

1. Aplicar migrações pendentes em homologação na ordem e conferir funções, constraints,
   grants e triggers existentes. O ambiente implantado não foi inspecionado nesta tarefa.
2. Testar operador e gestor em carteiras distintas, criação acima do limite, decisão com
   evidência, preparação pós-aprovação e recuperação após falha de preparação.
3. Conferir casos legados incompletos antes da distribuição; não preencher confirmações
   ou autorizações automaticamente. Exercitar conflitos com duas conexões independentes.
4. Conferir envio efetivo e boletos com os provedores, além do simulador no navegador.
5. Publicar aplicação e migrações em janela coordenada. Nenhuma delas foi publicada aqui.

Referência do CNJ: https://atos.cnj.jus.br/atos/detalhar/119 (Resolução 65, Anexo VIII).
