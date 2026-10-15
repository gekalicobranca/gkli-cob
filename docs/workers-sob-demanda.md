# Supervisor operacional

A tarefa local mantém o nome histórico `GKLI-Maestro-Supervisor`, mas supervisiona
os oito coletores do Maestro, cinco filas de PDFs (Manager, Lello, BBZ, Atipass,
HFlex), importação de relatórios e o worker de WhatsApp Cloud quando liberado.
No máximo duas filas trabalham simultaneamente, compartilhando o mesmo limite.
Os subprocessos encerram ao terminar o trabalho. Sem pedidos, fica apenas o supervisor.

Uma RPC privada consulta as filas a cada 30 segundos. Nenhum navegador é aberto
para consultar se há trabalho. A rotina mensal do Maestro mantém seus horários,
pausa global, receita ativa e travas. As filas de PDF preservam claims atômicos,
validação dos cadastros e isolamento dos executores manuais.

O supervisor observa a pasta de relatórios por eventos e confere o manifesto ao
consultar as filas. Arquivos elegíveis seguem o padrão `NOME_YYYY-MM-DD.xls[x]`.
Na primeira instalação, arquivos preexistentes ficam registrados e não são
reimportados. Chegadas e alterações posteriores iniciam um importador restrito
ao arquivo escolhido. O manifesto persiste as pendências durante reinícios.
Os relatórios aninhados em `Downloads/maestro/` mantêm seu pipeline próprio.
O importador encerra após um ciclo e possui trava compartilhada com execuções manuais.
As configurações de confirmação/importação e processamento de régua não são alteradas.

O WhatsApp está pausado em três níveis: tarefa Windows desabilitada, controles
das sessões desabilitados e chave privada `workers_controles.whatsapp=false`.
O dispatcher Cloud e o claim Web também conferem essa chave, bloqueando chamadas
avulsas. Não há partida automática do WhatsApp até liberação explícita.
Para uma futura retomada, o administrador precisa liberar essa chave e os controles
das sessões desejadas. Esta instalação não libera nem reconecta nenhuma sessão.

E-mails continuam sendo jobs hospedados, sem daemon local. O cron executa das
22h às 06h de Brasília, exclusivamente, e só chama o dispatcher quando há fila.
As reservas e a autorização final preservam cotas, cadência e bloqueios judiciais.

No Thunderbird, alarmes pontuais substituem o timer periódico. Sem fila habilitada,
não existe alarme. Fora da janela noturna, agenda o próximo despertar às 22h sem
consultar o app; durante a noite, considera a próxima reserva e consulta no máximo
a cada cinco minutos quando ocioso. Recuperação de confirmação pendente continua
permitida sem repetir o envio. Testes explicitamente solicitados mantêm o comportamento
manual existente. A extensão 0.2.0 está em `output/thunderbird/` e no perfil local instalado.

Logs, estado e manifesto ficam em `.codex-tmp/maestro-supervisor/`. Falhas mantêm
espera progressiva e resultados não confirmados nunca são repetidos automaticamente.
O computador dos portais precisa ficar ligado, com login no Windows. Thunderbird
precisa estar aberto para enviar pela conta local; SMTP hospedado não depende dele.
