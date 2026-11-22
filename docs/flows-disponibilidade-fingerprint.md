# Disponibilidade e histórico da chave de mensagem

Correção de 22/11/2026, sobre `417deab8`, em worktree isolada. Publicação solicitada pelo usuário. Nenhum registro de mensagem, Flow, lote ou conciliação é alterado por esta correção.

## Regra compartilhada

A montagem sequencial usa a primeira etapa ativa, ordenada por delay, ordem e ID. A chave é montada com `criarReguaFingerprint`, usando contexto `regua_cobranca`, cobrança, referência de etapa, canal e ciclo. A referência de etapas default preserva o mesmo fallback de `normalizarEtapaId` usado pelo processador. A disponibilidade manual usa `cicloReferencia`; a revalidação de criação usa o ciclo mensal ou o ciclo de fechamento quando explicitamente solicitado pelo caminho Easy. Não se modificou a semântica dos ciclos existentes.

`fingerprint-disponibilidade.ts` utiliza `primeiraEtapaFlow`, `normalizarEtapaId`, `criarReguaFingerprint` e `cicloReferencia`, as mesmas funções da geração. Consulta chaves em `mensagens` sem filtro de status e em `lote_itens` com `mensagem_id` preenchido, cobrindo também consolidações. Mensagens canceladas, rascunhos, enviadas ou falhas continuam ocupando a chave. Itens sem mensagem não ocupam a chave por si só. Outra etapa, canal ou ciclo não é bloqueado por essa verificação, sem dispensar as demais proteções por cobrança/canal.

As consultas usam partes de 40 chaves, até quatro partes concorrentes e paginação de 500 registros, sem expor conteúdo ou destinatários. Falha na consulta não equivale a ausência de histórico.

O filtro retorna as réguas impedidas por cobrança antes dos totais e da paginação. `reguasDisponiveis` aplica o resultado também ao agrupamento e seleção por condomínio. A validação de criação reconsulta a chave antes de iniciar o processamento; a verificação original do processador e as constraints permanecem intactas para concorrência ou mudanças após a seleção.

## Revisão geral de consistência

Foram revisados e exercitados os critérios de prazo/D+, pausas ativas e escopo de conciliação, canais e carteiras, responsável/contatos, vínculos de Flow e mensagens órfãs, pendências por unidade/régua, chave histórica, primeira etapa, ciclo, seleção em todas as páginas e revalidação de seleção antiga. A revisão não libera mensagens bloqueadas nem muda critérios de acordo/judicialização ou regras financeiras.

43 testes locais passaram nos scripts `validate-flow-fingerprint-disponibilidade`, `validate-flow-performance`, `validate-flow-canais`, `validate-flow-pausas`, `validate-flow-email-pendente-unidade`, `validate-flow-prazo-regua`, `validate-flow-reativacao`, `validate-flow-condominio` e `validate-acordos-conciliacao`.

O caso real do Bosque Marajoara foi conferido somente em leitura: o lote rejeitado aponta para uma mensagem cancelada cuja chave coincide com cobrança, primeira etapa atual, canal e ciclo mensal. O histórico foi preservado.

Mudanças de dados após abrir a tela e concorrência continuam exigindo revalidação no servidor. Não é possível prometer ausência de todo erro operacional por filtro de disponibilidade; a proteção final de geração continua necessária. Não foram executados envios para testar. Nenhuma migration foi necessária.
