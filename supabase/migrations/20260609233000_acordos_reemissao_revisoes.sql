-- Structured reissue/reopening flow for agreement installments.

create table if not exists public.acordos_revisoes (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.carteiras(id),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  parcela_id uuid references public.parcelas_acordo(id) on delete set null,
  pendencia_id uuid references public.central_pendencias(id) on delete set null,
  tipo text not null default 'reemissao_parcela',
  status text not null default 'pendente_ajuste',
  valor_anterior numeric(14,2) not null default 0,
  valor_novo numeric(14,2),
  vencimento_anterior date,
  vencimento_novo date,
  motivo text,
  resumo_devedor text,
  boleto_url text,
  mensagem_resumo_id uuid references public.mensagens(id) on delete set null,
  criado_por uuid references public.profiles(id) on delete set null,
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint acordos_revisoes_tipo_check
    check (tipo in ('reemissao_parcela')),
  constraint acordos_revisoes_status_check
    check (status in (
      'pendente_ajuste',
      'ajuste_registrado',
      'boleto_solicitado',
      'boleto_enviado',
      'concluida',
      'cancelada'
    )),
  constraint acordos_revisoes_valores_check
    check (valor_anterior >= 0 and (valor_novo is null or valor_novo >= 0))
);

create index if not exists acordos_revisoes_acordo_id_idx
  on public.acordos_revisoes(acordo_id);

create index if not exists acordos_revisoes_parcela_id_idx
  on public.acordos_revisoes(parcela_id);

create index if not exists acordos_revisoes_pendencia_id_idx
  on public.acordos_revisoes(pendencia_id);

create index if not exists acordos_revisoes_status_idx
  on public.acordos_revisoes(status);

create unique index if not exists acordos_revisoes_reemissao_aberta_idx
  on public.acordos_revisoes(parcela_id)
  where tipo = 'reemissao_parcela'
    and status in ('pendente_ajuste', 'ajuste_registrado', 'boleto_solicitado', 'boleto_enviado');

alter table public.parcelas_acordo
  add column if not exists valor_original_reemissao numeric(14,2),
  add column if not exists vencimento_original_reemissao date,
  add column if not exists reemitida_em timestamptz,
  add column if not exists reemissao_revisao_id uuid references public.acordos_revisoes(id) on delete set null;

create index if not exists parcelas_acordo_reemissao_revisao_id_idx
  on public.parcelas_acordo(reemissao_revisao_id);

alter table public.acordos
  drop constraint if exists acordos_fluxo_status_chk;

alter table public.acordos
  add constraint acordos_fluxo_status_chk
  check (
    fluxo_status in (
      'rascunho',
      'aguardando_aprovacao_sindico',
      'aprovado_sindico_aguardando_aceite_devedor',
      'aguardando_aceite_devedor',
      'aceito_aguardando_boletos',
      'boletos_solicitados',
      'boletos_recebidos',
      'boletos_enviados',
      'acordo_efetivado',
      'reaberto_reemissao',
      'reemissao_ajuste_registrado',
      'reemissao_boleto_solicitado',
      'reemissao_boleto_enviado',
      'cancelado',
      'reprovado_sindico',
      'rompido_retomar_cobranca',
      'rompido_suspender',
      'rompido_judicializar'
    )
  ) not valid;

alter table public.acordos_revisoes enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'acordos_revisoes'
      and policyname = 'acordos_revisoes_select_carteira'
  ) then
    create policy acordos_revisoes_select_carteira
      on public.acordos_revisoes
      for select
      to authenticated
      using (public.current_user_can_access_carteira(carteira_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'acordos_revisoes'
      and policyname = 'acordos_revisoes_insert_carteira'
  ) then
    create policy acordos_revisoes_insert_carteira
      on public.acordos_revisoes
      for insert
      to authenticated
      with check (public.current_user_can_access_carteira(carteira_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'acordos_revisoes'
      and policyname = 'acordos_revisoes_update_carteira'
  ) then
    create policy acordos_revisoes_update_carteira
      on public.acordos_revisoes
      for update
      to authenticated
      using (public.current_user_can_access_carteira(carteira_id))
      with check (public.current_user_can_access_carteira(carteira_id));
  end if;
end $$;
