# Implantação programada de administradoras no scanner

Autorização do usuário em 02/11/2026: programar as integrações restantes, exceto os condomínios sem acesso. O cronograma desta implantação é acompanhado neste chat e no arquivo `scripts/scanner/programacao-administradoras.json`. O arquivo registra intenção e progresso de implantação; não habilita coleta por si só.

São dezenove condomínios candidatos, agrupados em Graiche (3), BBZ (1), Atipass (1), Villágua (1), HFlex (2), OMA (5), Verti (2), Habitacional (3) e Villa Natura/portal Lello (1). As credenciais vêm da receita existente ou do ambiente local. Presença de credencial indica acesso disponível para tentativa de validação; não confirma permissão para o cadastro, extrato ou unidade pretendida.

A implantação avança a cada madrugada, a partir de 03/11/2026 às 00h30, horário de São Paulo, por uma administradora de cada vez. Reaproveitar o acesso dos agentes remotos, desenvolver a leitura das capacidades efetivamente disponíveis, testar e validar uma amostra pequena antes de ativar cada condomínio. Cadastro indisponível deve ser separado das consultas financeiras, conforme Graiche/SELL. Não executar os workers de captação como substituto do scanner.

Cada alvo só termina em `integrado` após código publicado, executor local atualizado e validação real com identificação exata do condomínio/unidade e evidências verificadas. Registrar testes, resultado e limitações. Se o portal recusar o acesso, registrar `sem_acesso` e retirá-lo da programação até nova liberação. Acesso válido com leitura ainda não implementada fica `integracao_pendente`; não anunciar como scanner ativo. Não alterar estados para simular conclusão.

Preservar os lotes de até vinte unidades já existentes no app, janela 00h30–05h25, pausa global mínima de quinze minutos, rodízio, travas, reservas, cursores e checkpoints. Novos adaptadores não podem abrir relatórios de inadimplência, importar cobranças ou presumir pagamento por ausência de cota/acordo. Baixa exige recibo explícito, unidade e vínculo inequívocos, valores e data efetiva, conferência transacional e auditoria. Sugestões duvidosas vão para revisão. Os relatórios permanecem destinados ao responsável e à Edi pela conta de cobrança autorizada.

O usuário reincluiu o Jerivás em 02/11/2026, revogando a exclusão anterior da programação. Sua integração deve permitir conferência e relatório também dos acordos judiciais, com revisão humana obrigatória e sem baixa automática. A reinclusão na programação não dispensa a validação das capacidades do portal nem altera acordos ou pagamentos existentes.

Exclusões confirmadas: K360 Humberto I Comercial, K360 Residencial e O Parque Torre do Cipó não constam na relação do acesso BBZ: seus portais foram corrigidos para BBZ e ficaram inativos, com `pendente_acesso`. Moema Flat Service tem portal `SEM ACESSO`. Demais cadastros sem acesso/receita ou sem unidades também ficam fora.

O trabalho de implantação usa um checkout isolado e preserva as alterações locais existentes. A raiz `C:\Users\Gekali\gkli-cob` contém modificações de outros trabalhos; não limpar, restaurar, sobrescrever ou incluir essas alterações nos commits. Só copiar ao executor os arquivos próprios já verificados. Não encerrar ou alterar processos de outros agentes.

## Progresso de 03/11/2026 — Graiche

Jerivás integrado: código publicado e executor atualizado; amostra real da unidade 111/B3 validada às 00h47, com reserva global e trava compartilhada. O filtro oferece a unidade, o que não homologa a identidade do contrato. Configuração ativa para a unidade do acordo vigente, com relatório judicial habilitado, revisão humana obrigatória e baixa automática bloqueada. O relatório de uma revisão foi enviado à Camila, com cópia para Edi; servidor confirmou o envio uma única vez. Nenhum pagamento, cadastro ou cobrança foi alterado pela validação.

A conferência judicial no servidor também verifica a carteira e o condomínio atuais da unidade, protegendo os relatórios contra dados de vinculação desatualizados. As funções financeiras anteriores permaneceram preservadas. Suíte do scanner: 85 testes aprovados; testes específicos de escopo judicial e TypeScript aprovados.

Elo: tentativa única de autenticação às 01h03 foi recusada pela Graiche. Configuração inativa e `pendente_acesso`; alvo registrado como `sem_acesso` e excluído de novas tentativas até atualização/liberação das credenciais. Nenhuma consulta de inadimplência, cadastro ou baixa executada.

Las Ventanas: corrigida a carteira desatualizada da receita, mediante identificação exata do mesmo condomínio e confirmação de ausência de execuções abertas. Credenciais e dados financeiros não foram alterados. Validação às 01h18 confirmou autenticação e condomínio; a tela de Acordos Online não disponibilizou o seletor de unidades em vinte segundos. Continua `integracao_pendente`, inativo, para diagnóstico do formato/retorno; não classificar como acesso recusado nem como scanner integrado.

As três validações foram sequenciais, com reserva global e trava Graiche, uma unidade de amostra por condomínio e pausa global de pelo menos quinze minutos entre elas. A pausa e a reserva foram liberadas para a rotina normal, sem alterar seus horários, limites ou cursores.
