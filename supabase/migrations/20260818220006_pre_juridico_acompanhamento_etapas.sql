create table public.pre_juridico_casos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.carteiras(id) on delete restrict,
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  condominio_id uuid references public.condominios(id) on delete set null,
  unidade_id uuid references public.unidades(id) on delete set null,
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  responsavel_id uuid references public.profiles(id) on delete set null,
  etapa text not null default 'aguardando_documentos',
  escritorio_juridico text,
  prazo_etapa date,
  protocolo_envio text,
  numero_processo text,
  tribunal text,
  foro text,
  observacoes text,
  enviado_juridico_em timestamptz,
  judicializado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pre_juridico_casos_acordo_id_key unique (acordo_id),
  constraint pre_juridico_casos_etapa_check check (etapa in (
    'aguardando_documentos',
    'aguardando_administradora',
    'aguardando_sindico',
    'pronto_juridico',
    'enviado_juridico',
    'analise_juridica',
    'pendencia_juridica',
    'autorizado_ajuizamento',
    'judicializado'
  )),
  constraint pre_juridico_casos_processo_check check (
    etapa <> 'judicializado' or nullif(trim(numero_processo), '') is not null
  )
);

create index pre_juridico_casos_carteira_etapa_idx
  on public.pre_juridico_casos (carteira_id, etapa, updated_at desc);
create index pre_juridico_casos_condominio_id_idx on public.pre_juridico_casos (condominio_id);
create index pre_juridico_casos_unidade_id_idx on public.pre_juridico_casos (unidade_id);
create index pre_juridico_casos_cobranca_id_idx on public.pre_juridico_casos (cobranca_id);
create index pre_juridico_casos_responsavel_id_idx on public.pre_juridico_casos (responsavel_id);

create trigger trg_pre_juridico_casos_updated_at
before update on public.pre_juridico_casos
for each row execute function public.set_updated_at();

alter table public.pre_juridico_casos enable row level security;

create policy pre_juridico_casos_select_carteira
  on public.pre_juridico_casos for select to authenticated
  using ((select public.current_user_can_access_carteira(carteira_id)));

create policy pre_juridico_casos_insert_carteira
  on public.pre_juridico_casos for insert to authenticated
  with check ((select public.current_user_can_access_carteira(carteira_id)));

create policy pre_juridico_casos_update_carteira
  on public.pre_juridico_casos for update to authenticated
  using ((select public.current_user_can_access_carteira(carteira_id)))
  with check ((select public.current_user_can_access_carteira(carteira_id)));

grant select, insert, update on public.pre_juridico_casos to authenticated;

comment on table public.pre_juridico_casos is
  'Acompanha a passagem operacional de acordos do pre-juridico ate a judicializacao.';
