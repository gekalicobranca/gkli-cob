# Exportações de acordos

O Excel e o relatório executivo usam as parcelas completas em `parcelas_lista`, carregadas pela consulta que calcula a saúde dos acordos. Os dois geradores recebem somente os acordos que passaram pelos filtros da listagem. O período de vencimentos continua sendo aplicado pelo gerador na apresentação das parcelas.

Em 27/11/2026, as rotas foram medidas localmente com Todas as origens, registros sintéticos, duas parcelas por acordo e latência simulada de 25 ms por página. Na repetição após aquecimento, o Excel e o PDF extrajudiciais passaram de 22,14 s e 17,02 s para 13,83 s e 13,63 s. Nos judiciais, de 0,75 s e 2,26 s para 0,60 s e 1,81 s. As contagens lidas nos arquivos foram 5.113 e 136 em ambas as versões. As consultas de parcelas por arquivo caíram de 104 para 52 e de 4 para 2, respectivamente. A duração em produção da nova versão ainda depende de publicação e medição.
