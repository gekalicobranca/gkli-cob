create table if not exists public.captacao_historica_sindico (
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  fonte_arquivo text not null,
  fonte_aba text not null,
  fonte_linha integer check (fonte_linha is null or fonte_linha > 0),
  fonte_hash text,
  conversao_relatorio_id uuid references public.conversoes_relatorio(id) on delete set null,
  item_key text not null,
  condominio_id uuid not null references public.condominios(id) on delete restrict,
  carteira_id uuid references public.carteiras(id) on delete set null,
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  competencia text not null check (competencia ~ '^[0-9]{4}-[0-9]{2}$'),
  referencia_em timestamptz not null default now(),
  data_entrada date not null,
  valor numeric(14,2) not null check (valor >= 0),
  valor_principal numeric(14,2),
  multa numeric(14,2),
  correcao numeric(14,2),
  juros numeric(14,2),
  debito_descricao text,
  debito_inicial text,
  debito_final text,
  situacao text not null default 'Histórico conciliado',
  unidade_identificacao text not null,
  bloco text,
  uso_sistema text not null default 'liberada' check (uso_sistema in ('liberada')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origem, fonte_arquivo, fonte_aba, fonte_linha),
  unique (conversao_relatorio_id, item_key)
);

create index if not exists idx_captacao_historica_sindico_condominio_competencia
  on public.captacao_historica_sindico (condominio_id, competencia);

create index if not exists idx_captacao_historica_sindico_unidade
  on public.captacao_historica_sindico (unidade_id);

create index if not exists idx_captacao_historica_sindico_conversao
  on public.captacao_historica_sindico (conversao_relatorio_id);

alter table public.captacao_historica_sindico enable row level security;

drop policy if exists captacao_historica_sindico_select on public.captacao_historica_sindico;
create policy captacao_historica_sindico_select
  on public.captacao_historica_sindico
  for select
  to authenticated
  using (
    public.current_user_is_admin()
    or exists (
      select 1
      from public.portal_sindico_condominios psc
      join public.portal_sindico_usuarios psu on psu.id = psc.portal_usuario_id
      where psu.user_id = (select auth.uid())
        and psu.status = 'ativo'
        and psc.status = 'ativo'
        and psc.condominio_id = captacao_historica_sindico.condominio_id
    )
  );

drop policy if exists captacao_historica_sindico_admin_all on public.captacao_historica_sindico;
create policy captacao_historica_sindico_admin_all
  on public.captacao_historica_sindico
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

comment on table public.captacao_historica_sindico is
  'Linhas historicas de captacao liberadas para exibicao ao sindico apos conciliacao de qualidade.';

comment on column public.captacao_historica_sindico.uso_sistema is
  'A tabela aceita apenas linhas liberadas; registros incompletos ficam fora do sistema e permanecem no material de conciliacao.';
