-- Store parsed salary receipt items generated during import confirmation.
create table if not exists gkli_flex.recibo_pagamento_itens (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references gkli_flex.importacoes(id) on delete cascade,
  pagamento_id uuid not null references gkli_flex.pagamentos(id) on delete cascade,
  empregado_nome text not null,
  competencia text not null,
  cargo text,
  valor_liquido numeric(14, 2) not null,
  vencimento_sugerido date not null,
  status text not null default 'gerado',
  payload_original jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recibo_pagamento_itens_status_check
    check (status in ('gerado', 'revisado', 'cancelado'))
);

create index if not exists idx_gkli_flex_recibo_pagamento_itens_importacao
  on gkli_flex.recibo_pagamento_itens(importacao_id);

create index if not exists idx_gkli_flex_recibo_pagamento_itens_pagamento
  on gkli_flex.recibo_pagamento_itens(pagamento_id);

create trigger set_recibo_pagamento_itens_updated_at
  before update on gkli_flex.recibo_pagamento_itens
  for each row
  execute function gkli_flex.set_updated_at();
