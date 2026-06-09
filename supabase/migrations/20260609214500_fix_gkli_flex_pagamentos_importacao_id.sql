-- Keep salary payments generated from imports traceable to their source import.
alter table gkli_flex.pagamentos
  add column if not exists importacao_id uuid references gkli_flex.importacoes(id) on delete set null;

create index if not exists idx_gkli_flex_pagamentos_importacao_id
  on gkli_flex.pagamentos(importacao_id);
