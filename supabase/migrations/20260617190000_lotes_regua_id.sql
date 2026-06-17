alter table public.lotes
  add column if not exists regua_id uuid null references public.reguas(id) on delete set null;

create index if not exists idx_lotes_regua_id
  on public.lotes(regua_id);

