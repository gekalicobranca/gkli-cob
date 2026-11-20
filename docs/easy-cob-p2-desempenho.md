# Easy Cob — medição local da P2

Em quatro sessões concorrentes, o cenário de 500 cobranças teve prévia p95 de 391 ms e confirmação p95 de 4,46 s. No Maestro, a rajada de 500 itens chegou a 10,48 s de espera p95 até o worker assumir a execução. O ensaio recuperou 92 de 92 respostas descartadas após commit. Esses valores servem de referência de regressão para este laboratório.

## Easy Cap

Cada linha reúne cinco rodadas de quatro operadores simulados em sessões independentes, com o mesmo perfil de acesso e um condomínio distinto por sessão. A base cresce de 10 para 100 e depois 500 cobranças por condomínio. O mesmo arquivo é reapresentado com uma nova conversão em cada rodada, exercitando criação e atualização. Há três recibos por unidade, exceto no último grupo incompleto. As quatro prévias terminam antes de as quatro confirmações começarem. Todas as 60 confirmações terminaram com o número esperado de cobranças criadas ou atualizadas.

| Cobranças por arquivo | XLSX (bytes) | Prévia p50 / p95 / máx. (ms) | Confirmação p50 / p95 / máx. (ms) | Recuperação p50 / p95 / máx. (ms) |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 10.380 | 25,83 / 50,27 / 88,97 | 144,94 / 514,55 / 657,09 | 13,02 / 17,07 / 17,19 |
| 100 | 23.686 | 88,55 / 118,10 / 122,67 | 578,35 / 1.017,92 / 1.283,83 | 50,67 / 60,92 / 62,20 |
| 500 | 87.506 | 286,04 / 390,92 / 427,80 | 2.754,84 / 4.461,28 / 5.227,05 | 198,07 / 239,26 / 248,97 |

A prévia inclui parser XLSX do modelo manual, validação, plano, snapshot SQL, digest, assinatura e gravação da conversão. A confirmação inclui releitura do JSON, verificações de assinatura e digest, reconstrução do plano e RPC transacional até a resposta após commit. O relógio monotônico de cada chamada começa na entrada do método, num processo Node compartilhado. Geração da planilha, upload, autenticação HTTP, PostgREST, cache do Next.js, OCR e rede externa ficam fora desses tempos.

## Easy Flow

O particionador de produção recebeu grupos repetidos de 1, 3, 7, 12, 21 e 40 cobranças por unidade. O perfil exercita tanto o alvo de 20 quanto a preservação de uma unidade maior. O ensaio verificou a cobertura de todos os IDs na ordem original e que cada unidade ficou em uma única parte.

| Cobranças selecionadas | Partes | Cobranças por parte p50 / p95 / máx. | Bytes da lista JSON de IDs por parte p50 / p95 / máx. |
| ---: | ---: | ---: | ---: |
| 10 | 1 | 10 / 10 / 10 | 391 / 391 / 391 |
| 100 | 5 | 16 / 40 / 40 | 625 / 1.561 / 1.561 |
| 500 | 24 | 12 / 40 / 40 | 469 / 1.561 / 1.561 |
| 5.000 | 239 | 12 / 40 / 40 | 469 / 1.561 / 1.561 |

Em um segundo cenário, quatro Flows montaram e liberaram 60 cobranças cada no banco, agrupadas por unidade. Os 16 manifestos de e-mail sintéticos mediram 1.875 bytes no p50 e 2.146 no p95 e no máximo. O tamanho do manifesto inclui conteúdo e destinatário fictícios. O cenário de 5.000 mede a divisão do plano em memória.

## Espera na fila do Maestro

Três rajadas independentes de cada tamanho. Cada rajada tem um pedido confirmado com o consentimento do Maestro. Quatro consumidores locais dividem os itens disponíveis, fazem o claim com o trigger real de revalidação e aguardam 20 ms de serviço simulado antes do próximo item. A espera é a diferença entre os timestamps de commit da criação do item e do seu claim, ambos no relógio do PostgreSQL. Todos os 1.830 itens tiveram claim confirmado.

| Itens por rajada | Itens medidos | Espera p50 | Espera p95 | Máxima |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 30 | 49,37 ms | 150,92 ms | 152,53 ms |
| 100 | 300 | 547,57 ms | 998,26 ms | 1.082,05 ms |
| 500 | 1.500 | 5.211,06 ms | 10.478,96 ms | 11.892,79 ms |

A disponibilidade imediata dos quatro consumidores e o serviço fixo de 20 ms são hipóteses do ensaio. Inicialização sob demanda, polling do worker instalado, login no portal e duração real da coleta podem alterar a espera. A P1 documenta separadamente a duração das travas do Maestro.

## Recuperação

| Falha injetada | Recuperações / respostas descartadas | Critério |
| --- | ---: | --- |
| Cap, após confirmação | 60 / 60 | Consulta por conversão, carteira e operador encontra um recibo. Replay da mesma operação retorna o mesmo resumo e sinaliza confirmação anterior. |
| Flow, após montagem | 16 / 16 | Replay da parte retorna a posição e a quantidade de mensagens já montadas. |
| Flow, após liberação | 16 / 16 | Replay retorna a quantidade liberada. Reconciliação termina em concluído com uma entrada de agenda por mensagem esperada. |

Para o Flow, a duração combinada dos 32 replays foi de 53,06 ms no p50, 230,55 ms no p95 e 326,52 ms no máximo. O percentual observado de 100% mede recuperação de perda de resposta após commit. Falhas de provider, indisponibilidade prolongada e execuções legadas exigem cenários distintos.

## Reprodução e limites

A partir da raiz do worktree, com Node 24, binários do PostgreSQL 17 e o pacote `pg` instalado no diretório de dependências do laboratório:

```powershell
node --import tsx scripts/medir-easy-p2.mjs <diretorio-bin-postgres> <diretorio-de-dependencias>
```

Execução registrada com PostgreSQL 17.11 e Node 24.16.0 no Windows, em um Intel Core i7-1260P com 16 processadores lógicos. O roteiro cria um cluster em loopback com porta e senha aleatórias, instala a fixture operacional e a migration de retenção P2, emite agregados e encerra o cluster. Usa dados sintéticos, parser e particionador do projeto, RPCs transacionais e substitutos locais para coleta e agenda. Percentis são por posto mais próximo, sem excluir a primeira rodada. Os volumes e a distribuição de unidades são hipóteses de carga. Um SLA de operação requer calibrar distribuição de arquivos, concorrência, capacidade dos workers e tempos de serviço no ambiente alvo.
