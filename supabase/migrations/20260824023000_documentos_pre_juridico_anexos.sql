insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-pre-juridico',
  'documentos-pre-juridico',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.documentos_gerados (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid null references public.carteiras(id) on delete set null,
  lote_id uuid null references public.lotes(id) on delete set null,
  lote_item_id uuid null references public.lote_itens(id) on delete set null,
  mensagem_id uuid null references public.mensagens(id) on delete set null,
  acordo_id uuid null references public.acordos(id) on delete set null,
  cobranca_id uuid null references public.cobrancas(id) on delete set null,
  condominio_id uuid null references public.condominios(id) on delete set null,
  unidade_id uuid null references public.unidades(id) on delete set null,
  tipo text not null check (tipo in (
    'laudo_pre_juridico',
    'procuracao_pre_juridico',
    'lista_administradora_pre_juridico'
  )),
  nome_arquivo text not null,
  content_type text not null default 'application/pdf',
  storage_bucket text not null default 'documentos-pre-juridico',
  storage_path text not null,
  tamanho_bytes integer not null default 0,
  checksum_sha256 text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists documentos_gerados_storage_unique_idx
  on public.documentos_gerados (storage_bucket, storage_path);

create index if not exists documentos_gerados_mensagem_idx
  on public.documentos_gerados (mensagem_id);

create index if not exists documentos_gerados_lote_idx
  on public.documentos_gerados (lote_id, tipo);

create table if not exists public.mensagem_anexos (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  documento_id uuid not null references public.documentos_gerados(id) on delete cascade,
  ordem integer not null default 1,
  created_at timestamptz not null default now(),
  unique (mensagem_id, documento_id)
);

create index if not exists mensagem_anexos_mensagem_idx
  on public.mensagem_anexos (mensagem_id, ordem);

alter table public.documentos_gerados enable row level security;
alter table public.mensagem_anexos enable row level security;

drop policy if exists documentos_gerados_select_carteira on public.documentos_gerados;
create policy documentos_gerados_select_carteira
  on public.documentos_gerados for select to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_can_access_carteira(carteira_id)
  );

drop policy if exists mensagem_anexos_select_carteira on public.mensagem_anexos;
create policy mensagem_anexos_select_carteira
  on public.mensagem_anexos for select to authenticated
  using (
    exists (
      select 1
      from public.documentos_gerados d
      where d.id = mensagem_anexos.documento_id
        and (
          public.current_user_is_admin()
          or public.current_user_can_access_carteira(d.carteira_id)
        )
    )
  );

grant select on public.documentos_gerados to authenticated;
grant select on public.mensagem_anexos to authenticated;

comment on table public.documentos_gerados is
  'Metadados dos PDFs gerados pelo app e armazenados em bucket privado para rastreabilidade e anexos de mensagens.';

comment on table public.mensagem_anexos is
  'Vínculo entre mensagens operacionais e documentos gerados que devem seguir como anexos.';
