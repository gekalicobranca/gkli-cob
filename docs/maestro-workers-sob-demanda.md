# Workers do Maestro sob demanda

O supervisor também atende PDFs e importações; veja `workers-sob-demanda.md`.

O supervisor é o único processo de coleta que permanece ligado. A cada 30 segundos,
uma RPC consulta apenas pedidos pendentes com receita ativa e horário liberado.
Na mesma RPC, a cada cinco minutos, cria as agendas mensais de Brasília, preservando
competência, dia, horário, pausa global e a validação dos códigos Lello.

Quando há trabalho, inicia uma fila finita para a administradora. Essa fila mantém
a mesma trava do executor manual e abre um coletor para cada pedido específico.
Cada coletor executa uma única vez e encerra; a fila também encerra ao terminar os
pedidos liberados. Não mantém navegador ou coletor esperando novas solicitações.
Por padrão, no máximo duas administradoras coletam simultaneamente; configure
`MAESTRO_MAX_WORKERS` entre 1 e 8 se necessário.

Horários futuros não iniciam processos. A pausa global continua permitindo as
origens manuais já autorizadas e suspende as automáticas. SELL mantém seu executor
manual específico. O observador da pasta Downloads é independente; continua
disponível com `npm run captacao:worker` quando necessário.

Aplicar a migração `20261015191240_maestro_supervisor_sob_demanda.sql` antes de instalar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agente-automatico/install-supervisor.ps1
```

A tarefa `GKLI-Maestro-Supervisor` inicia no login e recupera o supervisor se encerrar.
O computador precisa permanecer ligado e com a conta do Windows conectada.
Os comandos antigos `start-workers.ps1` e `run-worker.ps1` iniciam o supervisor.
Não executar consumidores antigos permanentemente em outro computador.

Logs e estado ficam em `.codex-tmp/maestro-supervisor/`. A trava única impede dois
supervisores locais; as travas por administradora são compartilhadas com o protocolo
manual `gkli-maestro:`. O claim condicional no banco é obrigatório: perder a disputa
nunca autoriza coletar o pedido assumido por outro processo.

Falha de conexão suspende novas partidas e aumenta o intervalo até cinco minutos.
Uma coleta assumida que encerra sem resultado confirmado vai para
`precisa_intervencao`, preservando arquivos e importações. Nunca retorna à fila
automaticamente. Se o banco falhar durante a conferência, a execução continua
bloqueando novas coletas daquela administradora até revisão, sem presumir reenvio seguro.

O encerramento normal do supervisor aguarda as filas em andamento. Os workers de
WhatsApp e os respectivos agendamentos não fazem parte deste supervisor.
