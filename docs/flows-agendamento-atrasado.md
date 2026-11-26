# Agenda vencida no detalhamento dos Flows

26/11/2026: mensagens de cobrança ainda agendadas cujo horário passou exibem **Agendamento atrasado**, em amarelo, e **Horário vencido; aguardando processamento.** A indicação usa o instante absoluto de `agendada_para` (ou `scheduled_at` legado), preservando o horário original. A comparação é atualizada a cada 30 segundos enquanto o Flow estiver expandido. Mensagens enviadas ou separadas para conferência não recebem esse rótulo.

Trata-se de apresentação operacional. Status persistido, reservas, contadores agregados, histórico, bloqueios e regras de envio permanecem inalterados. Não há execução de worker, ativação, mudança de transporte ou reenvio.

Arquivos: `agendamento-atrasado.ts`, `flow-cobranca-workbench.tsx` e `validate-flow-agendamento-atrasado.ts`. Publicação pendente.

Validação: três testes passaram; TypeScript, ESLint dos arquivos alterados e git diff --check passaram. Nenhuma alteração de dados em produção.
