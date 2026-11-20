# Easy Cob — retenção de prévias e temporários

Implementação local, posterior às sete migrations da candidata P0/P1. A migration `20261120000100_easy_retencao_previas.sql` instala as verificações de prazo e a função de manutenção. A instalação não executa limpeza nem cria cron.

| Material | Prazo e tratamento |
| --- | --- |
| Easy Cap, protocolo 2, em prévia | Sete dias desde `atualizado_em`. A tentativa de confirmação vencida reverte integralmente. A manutenção cancela a prévia e substitui o conteúdo de trabalho por um marcador com data, operador, protocolo, assinatura e hashes. Mantém o ID da conversão, totais e carteira. |
| Cap concluído ou com evidências | O plano assinado participa da verificação de replay. Conversão, plano, resultado e vínculos financeiros ficam preservados. São excluídos da seleção os casos com recibo, limpeza anterior, cobranças, parcelas ou histórico do síndico vinculados, assim como versões antigas e estados inconclusivos. |
| Easy Flow, protocolo 3, sem montagem | Sete dias da criação da prévia, inclusive quando há consultas posteriores. O primeiro commit de montagem vencida reverte. Para um resumo descartado manualmente, os sete dias contam da última atualização. A manutenção encerra o resumo, remove suas reservas e esvazia o plano, as versões de trabalho, a amostra e a lista de cobranças das partes. |
| Flow com efeitos, legado ou divergência | Contadores, vínculos com Flow, mensagens ou itens, marcas de montagem/liberação, hashes de artefatos e eventos adicionais excluem a execução da limpeza. IDs de execução e parte, snapshots, eventos, recibos e chaves de operação são preservados. |
| PDF de homologação ou cancelamento | A prévia do PDF é lida em memória. A P1 grava o documento de cancelamento na transação que registra o resultado. Documentos vinculados e relatórios originais dos agentes são evidência. A rotina não varre buckets. PDFs legados em `acordos-pdfs/easy/debitos/` podem estar referenciados pela timeline mesmo quando o acordo não foi cancelado. A idade do objeto não comprova que é órfão. |
| Cópias locais de trabalho do Espelhar | Limpeza ao terminar, inclusive em erro. Na próxima coleta, pastas do novo formato que restaram após interrupção são elegíveis depois de 24 horas, somente quando o processo proprietário já terminou. Pastas antigas sem identificação do processo exigem conferência manual. |

Os prazos de sete dias e 24 horas são parâmetros operacionais desta implementação. Recibos, auditoria, documentos definitivos e chaves idempotentes ficam fora da expiração por idade.

## Operação por carteira

No banco isolado com as migrations aplicadas, a forma de dois parâmetros apenas conta os candidatos do lote. Substitua o UUID por uma carteira do ambiente. Execute cada chamada em sua própria transação.

```sql
select public.easy_expirar_previas('00000000-0000-0000-0000-000000000001', 'cap');
select public.easy_expirar_previas('00000000-0000-0000-0000-000000000001', 'flow');
```

Para aplicar, use o terceiro parâmetro `true`. O quarto define o tamanho do lote, de 1 a 100, com padrão 50. O retorno é a quantidade efetivamente selecionada naquela chamada. Outras transações podem mudar a contagem entre simulação e aplicação. Repita em transações separadas até retornar zero. Somente o papel de serviço e o proprietário da função têm acesso. A aquisição de trava tem limite de três segundos. Um timeout exige aguardar e repetir o lote. A expiração não autoriza envio, reabertura, confirmação de captação ou exclusão de evidência.

## Validação

`scripts/validate-easy-p2-retencao.ts` usa banco em memória com as migrations do Cap e do Flow, incluindo o modelo de recuperação da P1. Exercita simulação, carteira distinta, bloqueio de confirmação e montagem vencidas, descarte repetido, replay do recibo confirmado, evento com chave idempotente, proteção de Flow liberado e restrição de papel. Para os temporários, usa pastas e processos sintéticos. A homologação estrutural utilizou somente o dump de schema de 19/11 já disponível localmente e um PostgreSQL 17 descartável em loopback.
