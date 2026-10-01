# Revisão de performance do módulo de flows

Revisão iniciada em 01/10/2026. Correção de carregamento publicada no commit
`6947297`, deployment `CkULbLXETmtT61bmoFGGooGz9u3Q`. A aba Gerar flows de
e-mail abriu em produção na sessão autenticada, sem o erro informado.

O principal gargalo está na preparação da lista para gerar flows: o servidor
lê todas as cobranças do recorte, busca os vínculos em pequenos grupos e só
então calcula a disponibilidade. A maior melhoria será fazer essa seleção
no banco e entregar resumos por condomínio; reduzir apenas o tamanho da página
no React não elimina o trabalho anterior.

## Medições iniciais

Uma execução por área, com os dados reais, após a correção, a partir da máquina
local. Escopo administrativo, sem filtro de carteira ou condomínio. Os valores
abaixo medem as funções de consulta, não o tempo completo de renderização da
Vercel. Não são p95 nem teste de carga. Rede, cache e alterações concorrentes
dos dados influenciam os tempos.

| Área | Tempo | Consultas HTTP | Registros recebidos | JSON recebido |
| --- | ---: | ---: | ---: | ---: |
| Acompanhar e-mail | 1,36 s | 2 | 22 | 22,9 kB |
| Gerar e-mail | 18,95 s | 69 | 7.842 | 3,77 MB |
| Saneamento e-mail, primeira página | 3,45 s | 7 | 309 | 157,7 kB |
| Acordos | 1,52 s | 3 | 273 | 262,3 kB |

Gerar consultou 2.318 cobranças e 5.225 itens de lotes, embora tenha retornado
zero cobranças novas e zero ativas disponíveis. Foram 29 consultas de vínculos
e outras 29 de mensagens órfãs; todas as consultas de órfãs retornaram vazias.
Isso mostra trabalho proporcional ao conjunto candidato, mesmo com resultado
final vazio. Não é justificativa para retirar a checagem de órfãs: ela impede
duplicidade de envio.

Acompanhar retornou 17 flows. Acordos retornou 272 parcelas e nenhum flow;
portanto a medição de acordos **não exercitou** o carregamento de itens de flows
e não permite concluir como essa área se comportará com muitos flows.

## Achados e prioridade

| Prioridade | Achado confirmado no código | Efeito | Direção proposta |
| --- | --- | --- | --- |
| Alta | `features/flows/cobranca/queries.ts`, `todasCobrancas`/`carregarPagina`: Gerar lê o conjunto inteiro mesmo quando recebe `page` | Tempo e memória crescem com todas as cobranças dos filtros | Seleção e elegibilidade no banco, agregados por condomínio, detalhes sob demanda |
| Alta | `features/flows/cobranca/vinculos-canais.ts`: grupos de 80 cobranças, quatro grupos concorrentes, duas famílias de consultas por grupo | Muitas viagens entre aplicação e banco; joins repetidos para o mesmo flow/régua | Consulta conjunta de canais ocupados ou anti-join sobre candidatos; retornar resultados agregados |
| Alta | `flow-cobranca-workbench.tsx:171`: recria um `Set` de todos os condomínios dentro do filtro de cada cobrança | Inicialização quadrática em número de cobranças | Calcular o conjunto uma vez e usar `Set` para IDs selecionados/processados |
| Alta | `flow-cobranca-workbench.tsx:232`: a régua do grupo é recalculada dentro do filtro de cada cobrança; arrays derivados mudam a cada render | Repetição de agrupamentos, consultas de réguas e ordenações; memoização perde efeito | Derivar grupos e opções de régua uma vez por mudança de dados/seleção |
| Alta | `features/flows/acordos/queries.ts`: limita a lista a 100 flows e procura vínculos apenas desses flows; limita parcelas a 500 e itens a 5.000 | Com volume maior, disponibilidade pode ignorar vínculo fora do recorte; totais podem estar incompletos | Separar monitor de disponibilidade, paginar e conferir vínculo da parcela em todo o escopo no banco |
| Média | `components/flows/cobranca/maestro-montagens.tsx`: lê todos os flows dos condomínios de até 100 montagens, com payload completo | Custos crescentes com histórico; o refresh de 30 s repete a leitura | Contadores por condomínio/montagem e projeções pequenas, com detalhes sob demanda |
| Média | Saneamento pagina cobranças antes de classificá-las, e só então encontra as pendências | Páginas vazias ou esparsas e avaliação parcial por página | Consulta específica de saneamento; aplicar elegibilidade antes de paginar o resultado |
| Média | Exportação do saneamento materializa todas as cobranças e depois a planilha em uma requisição | Memória e duração crescem com volume; limite de 300 s não resolve a causa | Exportação em job com progresso, snapshot e download posterior para volumes grandes |
| Média | Gerar e “Selecionar todos dos filtros” enviam registros completos e muitas entradas ocultas ao navegador | JSON, DOM e estado do React crescem junto com todas as cobranças | Seleção por filtros/condomínios no servidor, com resumo e execução por partes |

## Primeira etapa: ganhos pequenos sem mudar regras

1. Remover os cálculos quadráticos do workbench, estabilizar dependências dos
   `useMemo` e substituir buscas repetidas em arrays por `Set`/`Map`.
2. No Maestro, projetar `payload->>condominio_id` em vez do payload completo.
   Retornar tamanho do plano e contagens de pendências em vez de conteúdo que
   só é necessário ao expandir detalhes.
3. Fazer o refresh do Maestro seguir o padrão do status dos workers: não
   atualizar quando a aba está oculta e não sobrepor requisições demoradas.
4. Instrumentar as consultas no servidor com duração, quantidade de registros
   e tamanho de resposta, sem contatos ou payloads. Separar métricas por canal,
   área e presença de filtros. Comparar com os diagnósticos deste documento.

Esses passos reduzem custo de renderização e tráfego, mas não eliminam a
varredura completa de Gerar. Não atribuir a eles uma melhoria de latência
antes de medir.

## Segunda etapa: consulta adequada ao volume

O contrato desejado para Gerar tem três partes:

- **Resumo:** total e valor de cobranças elegíveis, unidades e contagens por
  carteira/condomínio, calculados no banco com os mesmos filtros e regras.
- **Lista:** página de condomínios, com quantidade, valor e réguas disponíveis.
  Ao expandir um condomínio, carregar seus detalhes por cursor estável. Uma
  unidade não pode ser dividida entre partes incompatíveis.
- **Seleção/execução:** registrar no servidor os filtros e condomínios
  selecionados; executar em jobs por partes com progresso. Revalidar
  elegibilidade e conflito de canal na criação, mesmo se o resumo estiver
  em cache. Retomada deve preservar partes concluídas.

Evitar paginar cobranças brutas e filtrar vínculos depois: isso produz páginas
vazias e pode quebrar a seleção completa do condomínio. Evitar buscar tudo
apenas para mostrar indicadores: agregação deve acontecer no banco.

A regra de canais deve continuar considerando canais salvos no Flow, réguas
legadas, mensagens consolidadas, tentativas sem mensagem e mensagens órfãs
pendentes. Réguas mistas ocupam todos os canais; vínculo sem canal conhecido
mantém o bloqueio conservador. Escopo do usuário e arquivamento de duplicidades
precisam ser aplicados antes de contagens e paginação.

## Índices a avaliar antes de criar qualquer migração

Há índices nas migrações para status/vencimento de cobranças, flows por
carteira/criação e itens por flow/criação. Isso não confirma os índices
efetivamente instalados ou escolhidos pelo banco em produção.

Verificar `pg_indexes` e planos de execução para:

- vínculos: `lote_itens(cobranca_id, id)` com predicado
  `cobranca_flow_id IS NOT NULL`;
- órfãs pendentes: `mensagens(cobranca_id, id)` com predicado compatível com
  `cobranca_flow_id IS NULL` e os status consultados;
- cobranças canônicas por carteira/condomínio, status e ordem
  `(vencimento, id)`, considerando os dois campos de status atuais;
- flows por condomínio extraído do JSON, carteira, status e ordem;
- fila do Maestro por carteira/status/`updated_at` e arquivamento.

Os candidatos acima são hipóteses para conferir com planos, não instruções
para criar todos os índices. Índices aumentam custo de escrita e espaço.
Normalizar campos consultados frequentemente, como condomínio e canal, pode
ser melhor que multiplicar índices sobre JSON. Uma mudança deve preencher
registros legados e preservar as regras atuais antes de trocar a consulta.

O acesso SQL pelo conector foi negado, e a CLI encontrou uma limitação de IPv6
na conexão disponível. Nesta revisão não foram executados `EXPLAIN`, alterações
de schema ou criação de índices em produção.

## Validação das próximas mudanças

Metas propostas, a confirmar com medições na Vercel: primeira tela de Gerar em
até 3 s no p95, resposta inicial até 300 kB, consultas limitadas pelo tamanho
da página e zero duplicidade de comunicação. Comparar cenários de 10 mil,
50 mil e 100 mil cobranças em ambiente de teste, incluindo resultado vazio,
réguas mistas, saneamento, filtros e usuários com escopos diferentes.

Preservar testes de totais completos, paginação estável, seleção por
condomínio, divisão por unidade, autorização e revalidação contra criação
concorrente. A medição inicial não valida concorrência nem p95.

## Como repetir o diagnóstico

O script `scripts/profile-flows.ts` executa apenas as consultas de leitura.
Não chama criação, ativação, progresso de jobs ou dispatch de mensagens.
O relatório contém apenas tempos e volumes, sem IDs de clientes, URLs de
consultas, contatos ou conteúdos. Usa o cliente administrativo local; as
medições sem filtros representam todo o escopo administrativo.

```powershell
node --env-file=.env.local --import tsx scripts/profile-flows.ts --mode monitor
node --env-file=.env.local --import tsx scripts/profile-flows.ts --mode gerar
node --env-file=.env.local --import tsx scripts/profile-flows.ts --mode saneamento
node --env-file=.env.local --import tsx scripts/profile-flows.ts --mode acordos
```

Opções: `--canal email|whatsapp`, `--carteira UUID`, `--condominio UUID`,
`--timeout 180000` e `--output caminho.json`. Histórico: `--mode historico`.
Rodar uma área de cada vez para não confundir disputa entre diagnósticos com
o tempo normal da área.

Os bytes medidos são do corpo descomprimido recebido; não representam tamanho
comprimido na rede nem o payload serializado do React. Os tempos somados por
tabela podem exceder o tempo total, pois algumas consultas são concorrentes.
