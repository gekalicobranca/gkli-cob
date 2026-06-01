-- Documenta a decisao operacional sobre parcelas de acordo.
-- `parcelas_acordo` e a fonte de verdade usada pelo app.
-- `acordos_parcelas` permanece apenas para compatibilidade/legado.

comment on table public.parcelas_acordo is
  'Fonte de verdade operacional para parcelas de acordo no app GKLI Cob.';

comment on table public.acordos_parcelas is
  'Tabela legada/compatibilidade. Novas regras financeiras devem usar public.parcelas_acordo.';
