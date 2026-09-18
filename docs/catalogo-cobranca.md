# Catálogo de cobrança

Na tela **Cobranças**, o botão **Catálogo PDF** baixa o documento com os filtros de busca, administradora, condomínio, unidade e vencimentos. Inclui cobrança, jurídico e pré-jurídico independentemente do filtro de status da fila. Respeita as carteiras permitidas ao usuário e as políticas de acesso do banco.

- Carteiras e condomínios ordenados por nome; unidades por soma decrescente das cotas elegíveis, com desempate por bloco e unidade.
- Capa com carteira, data-base em São Paulo, totais e índice de páginas. Índices grandes continuam nas páginas seguintes.
- Cada condomínio começa em nova página. Tabelas longas repetem a identificação da unidade e os títulos das colunas.
- Cotas vencidas com atraso maior ou igual a `inicio_cobranca_dias` (30 dias quando não informado). D+0 inclui apenas vencidas. Não há restrição adicional ao ano corrente.
- Exclui cotas quitadas, pagas, canceladas, renegociadas, suspensas, com status de acordo e valores não positivos. O total usa `valor_atualizado`, com fallback para `valor_original` apenas quando o atualizado não está informado; não recalcula encargos.
- Jurídico tem precedência sobre pré-jurídico. Os indicativos consideram o cadastro de ação judicial da unidade, os estados das cobranças e os casos de pré-jurídico/distribuição, inclusive fora do período filtrado.
- Responsável, celular e e-mail vêm do cadastro da unidade. Dados ausentes aparecem como “Não informado”.

Validação: `npx tsx scripts/validate-catalogo-cobranca.ts` e `npm run typecheck`. O script gera PDFs sintéticos em `tmp/pdfs/` para revisão de capa, índice extenso, quebra de condomínio, continuação das cotas e resultado vazio.
