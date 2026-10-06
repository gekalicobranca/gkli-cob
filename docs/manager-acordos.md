# Agente Manager — acordos em aberto

Agente local independente que segue o vídeo de 06/10/2026: seleciona o cliente, abre **Conteúdo → Acordos Online → Acompanhamento de Acordo: Somente em Aberto**, escolhe **Todas unidades** e clica em **Avançar**.

## Execução

Na raiz do projeto, com Node e Chrome instalados:

```powershell
node scripts/manager-acordos/worker.mjs --listar
node scripts/manager-acordos/worker.mjs --codigo 656
node scripts/manager-acordos/worker.mjs --codigo 656,626
node scripts/manager-acordos/worker.mjs --todos
```

Alternativa PowerShell: `./scripts/manager-acordos/run.ps1 -Codigo 656` ou `-Todos`.

O navegador roda em segundo plano por padrão. Use `--mostrar-navegador` (PowerShell: `-MostrarNavegador`) para acompanhar a execução. Sem opções, apenas lista os clientes; não coleta automaticamente.

## Credenciais e resultados

As credenciais podem ficar em `.env.manager-acordos.local`, arquivo ignorado pelo Git:

```dotenv
MANAGER_ACORDOS_USUARIO=
MANAGER_ACORDOS_SENHA=
```

Se não forem configuradas, a coleta lê somente as credenciais `AGENTE_MANAGER_USUARIO` e `AGENTE_MANAGER_SENHA` existentes em `.env.local`. Não altera nenhum dos arquivos. O coletor `worker.mjs` não carrega chaves Supabase.

Cada execução cria uma pasta em `Downloads/manager-acordos`, com PDF, HTML e JSON por código e `resumo.json` com sucessos e falhas. `--saida` permite escolher outra pasta exclusiva. O PDF é gerado a partir da tabela extraída, com todas as linhas e cabeçalho repetido, sem o diálogo de impressão do Windows.

A lista própria `scripts/manager-acordos/condominios.json` contém os 32 condomínios ativos levantados em 06/10/2026, excluindo Comoditá (BBZ), Viso Moema (OMA) e os inativos. São 31 códigos distintos: K360 Comercial e Residencial compartilham 652 e geram um único relatório com os dois vínculos. Essa lista é um retrato: novos cadastros ou inativações exigem atualizá-la antes da coleta. São Manuel permanece disponível neste agente independente mesmo com a receita de inadimplência desativada.

## Separação da inadimplência

- Não usa as filas, receitas, execuções, arquivos, buckets, heartbeats, controle global ou agendamentos do Maestro.
- Não importa helpers dos workers de inadimplência. O coletor não escreve no banco; o consumidor da fila grava somente documentos e seu próprio histórico.
- Usa um navegador novo, sem perfil persistente, cookies ou sessões compartilhadas.
- Não altera nem cria acordos, parcelas, pagamentos ou baixas no GKLI COB.
- A coleta manual executa uma vez e encerra. O consumidor da fila permanece disponível em processo próprio. Nenhum deles integra o inicializador dos workers nem cria tarefa no Windows.
- Trava própria impede duas execuções simultâneas deste agente na mesma pasta. Se o processo for encerrado à força, confira se já terminou antes de remover manualmente `.manager-acordos.lock`.

O filtro da administradora é **Somente em Aberto**. Ele pode incluir parcelas já pagas de acordos que ainda têm saldo. O JSON preserva os valores e datas de recebimento do portal; não transforma essas informações em baixas. O período do débito não é tratado como data de criação do acordo.

O parser usa centavos inteiros, identifica as continuações de parcelas e confere subtotais e total geral. Preserva rótulos especiais, como entrada, bloqueio judicial ou faixa de parcelas, conforme aparecem no portal. Uma tela inesperada ou totais divergentes registra falha, evitando um resultado de sucesso incompleto. Nesse caso, salva apenas a tabela em um JSON de diagnóstico para revisão. A execução completa pode continuar com os outros clientes, e o resumo registra cada falha.

## Validação

```powershell
node --test scripts/manager-acordos/relatorio.test.mjs
```

Referência do PDF e dos frames: [documentação Playwright](https://playwright.dev/docs/api/class-page).

Validação realizada em 06/10/2026: oito testes automatizados e coleta real dos 31 códigos, cobrindo 32 condomínios. Foram encontrados 209 acordos e 783 linhas de parcelas (alguns rótulos representam faixas de parcelas). Os 31 PDFs, com 59 páginas no total, foram conferidos quanto à presença dos processos. A relação consolidada da validação está em `Downloads/manager-acordos/validacao-completa-2026-10-06`. Os workers de inadimplência e o Maestro permanecem independentes.

## Página e fila de PDFs

**Automação → Agentes de acordos** (`/app/agente-acordos`) segue o modelo visual do Maestro: indicadores, filtros por carteira/condomínio/status, pipeline expansível e histórico. Nesta etapa, só resgata PDFs; não há importação de acordos nem baixas.

`actions.ts` solicita uma execução por condomínio na tabela exclusiva `agente_acordos_execucoes`. A RLS confere a carteira, o perfil no banco e o código da configuração. A fila aceita apenas uma execução pendente por condomínio. O PDF fica no bucket privado `acordos-pdfs`; o download verifica o acesso à carteira antes de ler o documento.

Inicie o consumidor local separadamente:

```powershell
node --env-file=.env.local scripts/manager-acordos/fila.mjs
# ou ./scripts/manager-acordos/run-fila.ps1
```

Esse processo usa as chaves Supabase de `.env.local` para ler a fila própria e armazenar PDFs. Consulta o cadastro atual antes de coletar, recusando inativos, outra administradora ou carteira alterada. O navegador é criado pelo coletor em uma sessão exclusiva. HTML e JSON de apoio permanecem em `Downloads/manager-acordos-fila`. Sem o consumidor online, os pedidos aguardam na fila. Sua presença é registrada somente em `agente_acordos_workers`. Não há agendamento automático.

Após encerramento forçado, confira o PID em `Downloads/manager-acordos-fila/.fila.lock` antes de remover uma trava residual. Uma execução interrompida deve ser revisada antes de reenfileirar; não há repetição automática de execuções em andamento.

Para disponibilizar uma coleta manual previamente validada (sem importar dados financeiros):

```powershell
node --env-file=.env.local scripts/manager-acordos/publicar-pdfs.mjs C:/caminho/da/coleta
```

O script cadastra as configurações próprias, envia os PDFs e registra resultados de consulta. Reexecutá-lo com os mesmos PDFs não duplica o histórico inicial. Atualizações de carteira ou código exigem revisar a configuração própria e o manifesto antes do próximo resgate.
