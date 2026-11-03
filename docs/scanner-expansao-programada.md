# Implantação programada de administradoras no scanner

Autorização do usuário em 02/11/2026: programar as integrações restantes, exceto os condomínios sem acesso. O cronograma desta implantação é acompanhado neste chat e no arquivo `scripts/scanner/programacao-administradoras.json`. O arquivo registra intenção e progresso de implantação; não habilita coleta por si só.

São dezoito condomínios candidatos, agrupados em Graiche (2), BBZ (1), Atipass (1), Villágua (1), HFlex (2), OMA (5), Verti (2), Habitacional (3) e Villa Natura/portal Lello (1). As credenciais vêm da receita existente ou do ambiente local. Presença de credencial indica acesso disponível para tentativa de validação; não confirma permissão para o cadastro, extrato ou unidade pretendida.

A implantação avança a cada madrugada, a partir de 03/11/2026 às 00h30, horário de São Paulo, por uma administradora de cada vez. Reaproveitar o acesso dos agentes remotos, desenvolver a leitura das capacidades efetivamente disponíveis, testar e validar uma amostra pequena antes de ativar cada condomínio. Cadastro indisponível deve ser separado das consultas financeiras, conforme Graiche/SELL. Não executar os workers de captação como substituto do scanner.

Cada alvo só termina em `integrado` após código publicado, executor local atualizado e validação real com identificação exata do condomínio/unidade e evidências verificadas. Registrar testes, resultado e limitações. Se o portal recusar o acesso, registrar `sem_acesso` e retirá-lo da programação até nova liberação. Acesso válido com leitura ainda não implementada fica `integracao_pendente`; não anunciar como scanner ativo. Não alterar estados para simular conclusão.

Preservar os lotes de até vinte unidades já existentes no app, janela 00h30–05h25, pausa global mínima de quinze minutos, rodízio, travas, reservas, cursores e checkpoints. Novos adaptadores não podem abrir relatórios de inadimplência, importar cobranças ou presumir pagamento por ausência de cota/acordo. Baixa exige recibo explícito, unidade e vínculo inequívocos, valores e data efetiva, conferência transacional e auditoria. Sugestões duvidosas vão para revisão. Os relatórios permanecem destinados ao responsável e à Edi pela conta de cobrança autorizada.

Exclusões confirmadas: Jerivás continua reservado ao agente judicial. K360 Humberto I Comercial, K360 Residencial e O Parque Torre do Cipó não constam na relação do acesso BBZ: seus portais foram corrigidos para BBZ e ficaram inativos, com `pendente_acesso`. Moema Flat Service tem portal `SEM ACESSO`. Demais cadastros sem acesso/receita ou sem unidades também ficam fora.

O trabalho de implantação usa um checkout isolado e preserva as alterações locais existentes. A raiz `C:\Users\Gekali\gkli-cob` contém modificações de outros trabalhos; não limpar, restaurar, sobrescrever ou incluir essas alterações nos commits. Só copiar ao executor os arquivos próprios já verificados. Não encerrar ou alterar processos de outros agentes.
