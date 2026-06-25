create table if not exists public.mensageria_logs (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid null references public.carteiras(id) on delete set null,
  lote_id uuid null references public.lotes(id) on delete set null,
  lote_item_id uuid null references public.lote_itens(id) on delete set null,
  mensagem_id uuid null references public.mensagens(id) on delete set null,
  evento text not null,
  status_anterior text null,
  status_novo text null,
  descricao text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.mensageria_logs add column if not exists carteira_id uuid null references public.carteiras(id) on delete set null;
alter table public.mensageria_logs add column if not exists lote_id uuid null references public.lotes(id) on delete set null;
alter table public.mensageria_logs add column if not exists lote_item_id uuid null references public.lote_itens(id) on delete set null;
alter table public.mensageria_logs add column if not exists mensagem_id uuid null references public.mensagens(id) on delete set null;
alter table public.mensageria_logs add column if not exists evento text;
alter table public.mensageria_logs add column if not exists status_anterior text null;
alter table public.mensageria_logs add column if not exists status_novo text null;
alter table public.mensageria_logs add column if not exists descricao text null;
alter table public.mensageria_logs add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.mensageria_logs add column if not exists created_at timestamptz not null default now();

create index if not exists idx_mensageria_logs_carteira_created
  on public.mensageria_logs (carteira_id, created_at desc);

create index if not exists idx_mensageria_logs_lote_created
  on public.mensageria_logs (lote_id, created_at desc);

create index if not exists idx_mensageria_logs_mensagem_created
  on public.mensageria_logs (mensagem_id, created_at desc);

create index if not exists idx_mensageria_logs_evento_created
  on public.mensageria_logs (evento, created_at desc);

alter table public.mensageria_logs enable row level security;

drop policy if exists mensageria_logs_authenticated_read on public.mensageria_logs;
create policy mensageria_logs_authenticated_read
  on public.mensageria_logs
  for select
  to authenticated
  using (true);

drop policy if exists mensageria_logs_authenticated_insert on public.mensageria_logs;
create policy mensageria_logs_authenticated_insert
  on public.mensageria_logs
  for insert
  to authenticated
  with check (true);
