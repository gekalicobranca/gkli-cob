-- Saneamento operacional de cobranças
-- Cria a fila de divergências cadastrais detectadas durante a importação de cobranças.

create table if not exists public.saneamento_cobrancas (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.carteiras(id),
  condominio_id uuid not null references public.condominios(id),
  unidade_id uuid references public.unidades(id),
  unidade_sugerida_id uuid references public.unidades(id),
  cobranca_id uuid references public.cobrancas(id),
  importacao_id uuid references public.importacoes(id),
  conversao_relatorio_id uuid references public.conversoes_relatorio(id),

  tipo text not null check (
    tipo in (
      'responsavel_divergente',
      'responsavel_ausente',
      'unidade_nao_encontrada',
      'possivel_correspondencia'
    )
  ),
  status text not null default 'pendente' check (
    status in ('pendente', 'resolvido', 'ignorado')
  ),

  unidade_relatorio text not null,
  bloco_relatorio text,
  responsavel_relatorio text,
  responsavel_documento_relatorio text,

  unidade_cadastro text,
  bloco_cadastro text,
  responsavel_cadastro text,
  responsavel_documento_cadastro text,

  score_sugestao integer not null default 0 check (score_sugestao >= 0 and score_sugestao <= 100),
  observacao_resolucao text,
  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

create index if not exists saneamento_cobrancas_status_idx
  on public.saneamento_cobrancas (status, tipo, created_at desc);

create index if not exists saneamento_cobrancas_carteira_condominio_idx
  on public.saneamento_cobrancas (carteira_id, condominio_id, status);

create index if not exists saneamento_cobrancas_importacao_idx
  on public.saneamento_cobrancas (importacao_id);

create index if not exists saneamento_cobrancas_unidade_idx
  on public.saneamento_cobrancas (unidade_id);

create unique index if not exists saneamento_cobrancas_pendente_unico_idx
  on public.saneamento_cobrancas (
    tipo,
    condominio_id,
    coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid),
    unidade_relatorio,
    status
  )
  where status = 'pendente';

create or replace function public.set_saneamento_cobrancas_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_saneamento_cobrancas_updated_at on public.saneamento_cobrancas;
create trigger trg_saneamento_cobrancas_updated_at
before update on public.saneamento_cobrancas
for each row execute function public.set_saneamento_cobrancas_updated_at();
