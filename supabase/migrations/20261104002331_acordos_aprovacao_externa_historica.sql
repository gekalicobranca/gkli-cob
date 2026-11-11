-- Agreements already formalized by an administrator carry their own approval
-- evidence. This does not record or impersonate an internal trustee decision.
create table public.acordos_aprovacoes_externas (
  acordo_id uuid primary key references public.acordos(id),
  carteira_id uuid not null,
  condominio_id uuid not null references public.condominios(id),
  unidade_id uuid not null references public.unidades(id),
  administradora text not null,
  contrato_externo text not null,
  fonte_url text not null check (fonte_url ~ '^https://'),
  evidencia_sha256 text not null check (evidencia_sha256 ~ '^[a-f0-9]{64}$'),
  evidencia text not null check (length(trim(evidencia)) >= 30),
  autorizacao text not null check (length(trim(autorizacao)) >= 30),
  valor_acordado numeric not null check (valor_acordado > 0),
  grade jsonb not null check (jsonb_typeof(grade)='array' and jsonb_array_length(grade)>0),
  reconhecido_em timestamptz not null default now(),
  unique (condominio_id,unidade_id,administradora,contrato_externo)
);
alter table public.acordos_aprovacoes_externas enable row level security;
revoke all on public.acordos_aprovacoes_externas from public,anon,authenticated;
grant select on public.acordos_aprovacoes_externas to authenticated;
create policy aprovacoes_externas_leitura on public.acordos_aprovacoes_externas
  for select to authenticated using (public.current_user_can_access_carteira(carteira_id));
grant select,insert on public.acordos_aprovacoes_externas to service_role;

create function public.acordo_tem_aprovacao_externa(p_id uuid)
returns boolean language sql stable set search_path='' as $fn$
 select exists (
   select 1 from public.acordos_aprovacoes_externas e
   join public.acordos a on a.id=e.acordo_id
   where a.id=p_id and a.carteira_id=e.carteira_id
     and a.condominio_id=e.condominio_id and a.unidade_id=e.unidade_id
     and a.valor_acordado=e.valor_acordado
     and a.quantidade_parcelas=jsonb_array_length(e.grade)
     and e.grade=(select jsonb_agg(jsonb_build_object(
       'numero',p.numero,'valor',p.valor,'vencimento',p.vencimento) order by p.numero)
       from public.parcelas_acordo p where p.acordo_id=a.id)
 );
$fn$;
revoke all on function public.acordo_tem_aprovacao_externa(uuid) from public,anon,authenticated;
grant execute on function public.acordo_tem_aprovacao_externa(uuid) to service_role;

-- Keep the existing approval checks intact except for independently recorded,
-- exact-contract administrator evidence. Abort if the audited anchors changed.
do $patch$
declare src text; anchor text;
begin
 src:=replace(pg_get_functiondef('public.proteger_aprovacao_sindico()'::regprocedure),E'\r','');
 anchor:='if old.exige_aprovacao_sindico and not coalesce(new.exige_aprovacao_sindico,false) then';
 if position(anchor in src)=0 then raise exception 'Approval guard changed; review required';end if;
 src:=replace(src,anchor,'if old.exige_aprovacao_sindico and not coalesce(new.exige_aprovacao_sindico,false) and not public.acordo_tem_aprovacao_externa(old.id) then');
 -- Bind evidence to immutable financial scope; changes require a new contract.
 anchor:='declare decisao_alterada boolean;';
 if position(anchor in src)=0 then raise exception 'Approval declaration changed';end if;
 src:=replace(src,anchor,'declare decisao_alterada boolean; evidencia_externa public.acordos_aprovacoes_externas%rowtype;');
 anchor:=E'begin\n  if tg_op=''INSERT'' then';
 if position(anchor in src)=0 then raise exception 'Approval entry changed';end if;
 src:=replace(src,anchor,$entry$begin
  if tg_op='UPDATE' then
    select * into evidencia_externa from public.acordos_aprovacoes_externas where acordo_id=old.id;
    if found and (new.carteira_id is distinct from evidencia_externa.carteira_id
      or new.condominio_id is distinct from evidencia_externa.condominio_id
      or new.unidade_id is distinct from evidencia_externa.unidade_id
      or new.valor_acordado is distinct from evidencia_externa.valor_acordado
      or new.quantidade_parcelas is distinct from jsonb_array_length(evidencia_externa.grade)) then
      raise exception 'Contrato externo comprovado: alteracao de escopo exige novo contrato.';
    end if;
  end if;
  if tg_op='INSERT' then$entry$);
 execute src;
 src:=replace(pg_get_functiondef('public.validar_parcelas_aprovacao_sindico()'::regprocedure),E'\r','');
 anchor:='if coalesce(limite,0)>0 and quantidade>limite and not coalesce(a.exige_aprovacao_sindico,false) then';
 if position(anchor in src)=0 then raise exception 'Installment guard changed; review required';end if;
 src:=replace(src,anchor,'if coalesce(limite,0)>0 and quantidade>limite and not coalesce(a.exige_aprovacao_sindico,false) and not public.acordo_tem_aprovacao_externa(a.id) then');
 execute src;
end $patch$;

create function public.proteger_grade_aprovacao_externa()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare aid uuid;
begin
 aid:=case when tg_op='DELETE' then old.acordo_id else new.acordo_id end;
 if exists(select 1 from public.acordos_aprovacoes_externas where acordo_id=aid)
   and not public.acordo_tem_aprovacao_externa(aid) then
   raise exception 'Grade difere do contrato externo comprovado; registre nova renegociacao.';
 end if;
 if tg_op='UPDATE' and old.acordo_id is distinct from new.acordo_id
   and exists(select 1 from public.acordos_aprovacoes_externas where acordo_id=old.acordo_id)
   and not public.acordo_tem_aprovacao_externa(old.acordo_id) then
   raise exception 'Parcela pertence ao contrato externo comprovado.';
 end if;
 return null;
end $fn$;
revoke all on function public.proteger_grade_aprovacao_externa() from public,anon,authenticated;
create trigger proteger_grade_aprovacao_externa after insert or update or delete
on public.parcelas_acordo for each row execute function public.proteger_grade_aprovacao_externa();
