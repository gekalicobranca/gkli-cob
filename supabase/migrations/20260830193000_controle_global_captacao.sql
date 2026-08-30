create table if not exists public.automacao_controle (
  chave text primary key,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

insert into public.automacao_controle (chave, ativo)
values ('captacao_global', true)
on conflict (chave) do nothing;

alter table public.automacao_controle enable row level security;

drop policy if exists automacao_controle_authenticated_select on public.automacao_controle;
create policy automacao_controle_authenticated_select
  on public.automacao_controle for select to authenticated using (true);

drop policy if exists automacao_controle_authenticated_update on public.automacao_controle;
create policy automacao_controle_authenticated_update
  on public.automacao_controle for update to authenticated using (true) with check (true);

comment on table public.automacao_controle is
  'Chaves globais de liga/desliga para os motores de automação.';
