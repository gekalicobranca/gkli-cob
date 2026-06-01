-- Correção preventiva para a tela /app/condominios e detalhe do Condomínio Integral.
-- Motivo: o front atual consulta campos adicionados em sprints recentes. Se a base não tiver
-- essas colunas, o Supabase retorna erro e o link de Condomínios aparenta estar quebrado.

alter table public.condominios
  add column if not exists nome_operacional text,
  add column if not exists classificacao_operacional text,
  add column if not exists regua_cobranca_id uuid null,
  add column if not exists regua_acordo_id uuid null,
  add column if not exists parcelas_acordo_sem_aprovacao_sindico integer not null default 0,
  add column if not exists dias_reemissao_parcela_acordo_atrasada integer not null default 0;

-- Compatibilidade com pacote anterior que criou o campo com nome diferente (...atraso).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'condominios'
      and column_name = 'dias_reemissao_parcela_acordo_atraso'
  ) then
    update public.condominios
       set dias_reemissao_parcela_acordo_atrasada = coalesce(dias_reemissao_parcela_acordo_atrasada, dias_reemissao_parcela_acordo_atraso, 0)
     where dias_reemissao_parcela_acordo_atrasada is null
        or dias_reemissao_parcela_acordo_atrasada = 0;
  end if;
end $$;

update public.condominios
   set nome_operacional = nome
 where nome_operacional is null
    or btrim(nome_operacional) = '';

update public.condominios
   set classificacao_operacional = 'prata'
 where classificacao_operacional is null
    or classificacao_operacional not in ('ouro', 'prata', 'bronze');

alter table public.condominios
  alter column classificacao_operacional set default 'prata',
  alter column classificacao_operacional set not null;

alter table public.condominios
  drop constraint if exists condominios_classificacao_operacional_check,
  add constraint condominios_classificacao_operacional_check
    check (classificacao_operacional in ('ouro', 'prata', 'bronze'));

alter table public.condominios
  drop constraint if exists condominios_parcelas_acordo_sem_aprovacao_sindico_check,
  add constraint condominios_parcelas_acordo_sem_aprovacao_sindico_check
    check (parcelas_acordo_sem_aprovacao_sindico >= 0 and parcelas_acordo_sem_aprovacao_sindico <= 120);

alter table public.condominios
  drop constraint if exists condominios_dias_reemissao_parcela_acordo_atrasada_check,
  add constraint condominios_dias_reemissao_parcela_acordo_atrasada_check
    check (dias_reemissao_parcela_acordo_atrasada >= 0 and dias_reemissao_parcela_acordo_atrasada <= 365);

create index if not exists condominios_nome_operacional_idx
  on public.condominios using btree (nome_operacional);

create index if not exists condominios_classificacao_operacional_idx
  on public.condominios using btree (classificacao_operacional);

create index if not exists idx_condominios_regua_cobranca
  on public.condominios(regua_cobranca_id);

create index if not exists idx_condominios_regua_acordo
  on public.condominios(regua_acordo_id);

-- Só adiciona FKs se a tabela de réguas já existir.
do $$
begin
  if to_regclass('public.reguas') is not null then
    if not exists (select 1 from pg_constraint where conname = 'condominios_regua_cobranca_id_fkey') then
      alter table public.condominios
        add constraint condominios_regua_cobranca_id_fkey
        foreign key (regua_cobranca_id) references public.reguas(id) on delete set null;
    end if;

    if not exists (select 1 from pg_constraint where conname = 'condominios_regua_acordo_id_fkey') then
      alter table public.condominios
        add constraint condominios_regua_acordo_id_fkey
        foreign key (regua_acordo_id) references public.reguas(id) on delete set null;
    end if;
  end if;
end $$;
