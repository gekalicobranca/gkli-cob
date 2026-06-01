-- GKLI Cobrança — fluxo formal de acordo, aceite público e solicitação de boletos
-- Aplicar no Supabase antes de usar as novas telas/rotas públicas.

alter table public.condominios
  add column if not exists parcelas_acordo_sem_aprovacao_sindico integer not null default 0,
  add column if not exists dias_reemissao_parcela_acordo_atrasada integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'condominios_parcelas_acordo_sem_aprovacao_sindico_chk') then
    alter table public.condominios
      add constraint condominios_parcelas_acordo_sem_aprovacao_sindico_chk
      check (parcelas_acordo_sem_aprovacao_sindico >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'condominios_dias_reemissao_parcela_acordo_atrasada_chk') then
    alter table public.condominios
      add constraint condominios_dias_reemissao_parcela_acordo_atrasada_chk
      check (dias_reemissao_parcela_acordo_atrasada >= 0);
  end if;
end $$;

alter table public.acordos
  add column if not exists fluxo_status text not null default 'aguardando_aceite_devedor',
  add column if not exists exige_aprovacao_sindico boolean not null default false,
  add column if not exists sindico_aprovado_em timestamptz,
  add column if not exists devedor_aceito_em timestamptz,
  add column if not exists boletos_solicitados_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'acordos_fluxo_status_chk') then
    alter table public.acordos
      add constraint acordos_fluxo_status_chk
      check (fluxo_status in (
        'aguardando_aprovacao_sindico',
        'aprovado_sindico_aguardando_aceite_devedor',
        'aguardando_aceite_devedor',
        'aceito_aguardando_boletos',
        'boletos_solicitados',
        'boletos_recebidos',
        'acordo_efetivado',
        'cancelado'
      ));
  end if;
end $$;

create table if not exists public.acordos_termos (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  carteira_id uuid references public.carteiras(id),
  tipo_aceite text not null check (tipo_aceite in ('devedor', 'sindico')),
  status text not null default 'pendente' check (status in ('pendente', 'visualizado', 'aceito', 'recusado', 'expirado')),
  token text not null unique,
  destinatario_nome text,
  destinatario_documento text,
  destinatario_email text,
  titulo text not null,
  corpo text not null,
  visualizado_em timestamptz,
  aceito_em timestamptz,
  aceite_ip text,
  aceite_user_agent text,
  expira_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acordos_termos_acordo_id_idx on public.acordos_termos(acordo_id);
create index if not exists acordos_termos_token_idx on public.acordos_termos(token);

create table if not exists public.acordos_aceites (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  termo_id uuid references public.acordos_termos(id) on delete set null,
  tipo_aceite text not null check (tipo_aceite in ('devedor', 'sindico')),
  nome text not null,
  documento text,
  ip text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists acordos_aceites_acordo_id_idx on public.acordos_aceites(acordo_id);

comment on column public.condominios.parcelas_acordo_sem_aprovacao_sindico is 'Quantidade de parcelas que pode ser feita sem aprovação pública do síndico. 0 = sem trava.';
comment on column public.condominios.dias_reemissao_parcela_acordo_atrasada is 'Dias após vencimento em que a reemissão de parcela vencida é permitida. 0 = não permite.';
comment on table public.acordos_termos is 'Termos públicos de aprovação/aceite do acordo, com token sem autenticação.';
comment on table public.acordos_aceites is 'Carimbos formais de aceite público: nome, documento, IP, user-agent e payload.';
