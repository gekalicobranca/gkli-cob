-- Fila exclusiva de documentos: nenhuma escrita em acordos, parcelas ou captação.
create table public.agente_acordos_configuracoes (
  condominio_id uuid primary key references public.condominios(id),
  carteira_id uuid not null references public.carteiras(id),
  codigo_cliente text not null check (codigo_cliente ~ '^[0-9]+$'),
  administradora text not null default 'Manager' check (administradora = 'Manager'),
  habilitado boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.agente_acordos_execucoes (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.agente_acordos_configuracoes(condominio_id),
  carteira_id uuid not null references public.carteiras(id),
  codigo_cliente text not null,
  status text not null default 'pendente' check (status in ('pendente','em_execucao','sucesso','falha','cancelada')),
  etapa text not null default 'fila',
  origem text not null default 'manual' check (origem in ('manual','validacao_inicial')),
  solicitado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  worker_id uuid,
  mensagem text,
  storage_path text,
  nome_pdf text,
  tamanho_pdf bigint,
  hash_pdf text,
  check (status <> 'sucesso' or (storage_path is not null and nome_pdf is not null))
);
create unique index agente_acordos_uma_pendente on public.agente_acordos_execucoes(condominio_id) where status in ('pendente','em_execucao');
create index agente_acordos_historico on public.agente_acordos_execucoes(carteira_id, created_at desc);
create index agente_acordos_por_condominio on public.agente_acordos_execucoes(condominio_id, created_at desc);
create table public.agente_acordos_workers (
  nome text primary key check (nome = 'manager-acordos'),
  worker_id uuid not null,
  ultimo_sinal timestamptz not null default now()
);
alter table public.agente_acordos_configuracoes enable row level security;
alter table public.agente_acordos_execucoes enable row level security;
alter table public.agente_acordos_workers enable row level security;
revoke all on public.agente_acordos_configuracoes, public.agente_acordos_execucoes, public.agente_acordos_workers from anon, authenticated;
grant select on public.agente_acordos_configuracoes, public.agente_acordos_execucoes, public.agente_acordos_workers to authenticated;
grant insert on public.agente_acordos_execucoes to authenticated;
grant all on public.agente_acordos_configuracoes, public.agente_acordos_execucoes, public.agente_acordos_workers to service_role;
create policy acordos_config_leitura on public.agente_acordos_configuracoes for select to authenticated using (public.current_user_can_access_carteira(carteira_id));
create policy acordos_exec_leitura on public.agente_acordos_execucoes for select to authenticated using (public.current_user_can_access_carteira(carteira_id));
create policy acordos_exec_solicitar on public.agente_acordos_execucoes for insert to authenticated with check (
  public.current_user_can_access_carteira(carteira_id)
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','operador'))
  and solicitado_por = auth.uid() and status = 'pendente' and etapa = 'fila' and origem = 'manual'
  and iniciado_em is null and finalizado_em is null and worker_id is null and mensagem is null
  and storage_path is null and nome_pdf is null and tamanho_pdf is null and hash_pdf is null
  and exists (select 1 from public.agente_acordos_configuracoes c join public.condominios co on co.id = c.condominio_id
    where c.condominio_id = agente_acordos_execucoes.condominio_id
    and c.carteira_id = agente_acordos_execucoes.carteira_id and c.codigo_cliente = agente_acordos_execucoes.codigo_cliente
    and c.habilitado and co.status = 'ativo' and lower(co.administradora) = 'manager' and co.carteira_id = c.carteira_id)
);
create policy acordos_worker_leitura on public.agente_acordos_workers for select to authenticated using (true);
create function public.reivindicar_agente_acordos(p_worker_id uuid)
returns setof public.agente_acordos_execucoes language sql security invoker set search_path = public as $$
  with proxima as (
    select id from public.agente_acordos_execucoes where status = 'pendente' order by created_at, id for update skip locked limit 1
  )
  update public.agente_acordos_execucoes e set status = 'em_execucao', etapa = 'coleta', iniciado_em = now(), worker_id = p_worker_id
  from proxima where e.id = proxima.id returning e.*;
$$;
revoke all on function public.reivindicar_agente_acordos(uuid) from public, anon, authenticated;
grant execute on function public.reivindicar_agente_acordos(uuid) to service_role;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('acordos-pdfs','acordos-pdfs',false,15728640,array['application/pdf']) on conflict(id) do nothing;
