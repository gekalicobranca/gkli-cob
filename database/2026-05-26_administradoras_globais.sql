-- GKLI Cobrança — Administradoras como cadastro global
-- Objetivo: neutralizar a migração N:N criada para administradoras x carteiras.
-- A partir deste pacote, o código NÃO filtra administradoras por carteira.
--
-- Seguro para rodar mesmo se a tabela não existir.
-- Observação: a coluna administradoras.carteira_id, se existir, é mantida por compatibilidade/legado.

begin;

drop table if exists public.administradoras_carteiras;

commit;
