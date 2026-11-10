-- Documentary protection without manufacturing original debt receipts.
create table public.judicial_cotas_periodos (
 id uuid primary key default gen_random_uuid(),
 carteira_id uuid not null references public.carteiras(id),
 condominio_id uuid not null references public.condominios(id),
 unidade_id uuid not null references public.unidades(id),
 numero_processo text not null,
 competencia date not null check (extract(day from competencia)=1),
 fonte jsonb not null,
 ativo boolean not null default true,
 created_at timestamptz not null default now(),
 unique(carteira_id,condominio_id,unidade_id,numero_processo,competencia)
);
alter table public.judicial_cotas_periodos enable row level security;
revoke all on public.judicial_cotas_periodos from public,anon,authenticated;
grant all on public.judicial_cotas_periodos to service_role;
create index judicial_cotas_periodos_lookup on public.judicial_cotas_periodos(unidade_id,competencia) where ativo;

create function public.judicial_competencia_confirmada(valor text, vencimento date)
returns date language plpgsql immutable set search_path='' as $$
declare v text := btrim(coalesce(valor,''));
begin
 if v='' then return date_trunc('month',vencimento)::date; end if;
 if v ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-[0-9]{2})?$' then
  return make_date(substring(v,1,4)::int,substring(v,6,2)::int,1);
 elsif v ~ '^(0[1-9]|1[0-2])/[0-9]{4}$' then
  return make_date(substring(v,4,4)::int,substring(v,1,2)::int,1);
 end if;
 return null;
end $$;
revoke all on function public.judicial_competencia_confirmada(text,date) from public,anon,authenticated;
grant execute on function public.judicial_competencia_confirmada(text,date) to service_role;

-- Internal lookup must also protect imports made by ordinary authenticated users.
create function public.judicial_proteger_cota_confirmada()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists (select 1 from public.judicial_cotas_periodos p
  where p.ativo and p.carteira_id=new.carteira_id and p.condominio_id=new.condominio_id
   and p.unidade_id=new.unidade_id
   and p.competencia=public.judicial_competencia_confirmada(new.competencia,new.vencimento)) then
  new.automacao_bloqueada := true;
  if coalesce(new.status_financeiro,'') not in ('quitado','renegociado')
   and coalesce(new.status,'') not in ('acordo_firmado','acordo_efetivado') then
   new.status := 'judicializado'; new.status_operacional := 'judicializado';
  end if;
  if position('[PERIODO_JUDICIAL_CONFIRMADO]' in coalesce(new.observacoes,''))=0 then
   new.observacoes := concat_ws(E'\n',nullif(new.observacoes,''),'[PERIODO_JUDICIAL_CONFIRMADO] Competência abrangida por acordo judicial; cobrança automática bloqueada.');
  end if;
 end if;
 return new;
end $$;
revoke all on function public.judicial_proteger_cota_confirmada() from public,anon,authenticated;
create trigger zz_judicial_proteger_cota_confirmada
before insert or update on public.cobrancas
for each row execute function public.judicial_proteger_cota_confirmada();

