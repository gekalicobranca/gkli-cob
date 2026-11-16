begin;
create table public.acordo_documentos (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  carteira_id uuid not null references public.carteiras(id),
  nome text not null check (length(nome) between 1 and 180),
  tipo text not null check (tipo in ('application/pdf','image/png','image/jpeg')),
  documento bytea not null check (octet_length(documento) between 5 and 3145728),
  criado_por uuid references public.profiles(id),
  origem text not null default 'app' check (origem in ('app','integracao')),
  criado_em timestamptz not null default now()
);
create index acordo_documentos_acordo_idx on public.acordo_documentos(acordo_id, criado_em desc);
alter table public.acordo_documentos enable row level security;
revoke all on public.acordo_documentos from public, anon, authenticated;
grant select (id, acordo_id, carteira_id, nome, tipo, criado_por, criado_em) on public.acordo_documentos to authenticated;
create policy acordo_documentos_leitura on public.acordo_documentos for select to authenticated
  using (public.current_user_can_access_carteira(carteira_id));

create function public.acordo_anexar_documento(p_acordo uuid, p_nome text, p_tipo text, p_base64 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.acordos%rowtype; v_bytes bytea; v_id uuid;
begin
  select * into a from public.acordos where id=p_acordo;
  if not found or auth.uid() is null or public.current_user_can_access_carteira(a.carteira_id) is not true
     or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','gestor','operador')) then
    raise exception 'Sem permissão para anexar documentos ao acordo.';
  end if;
  if length(btrim(coalesce(p_nome,''))) not between 1 and 180 or length(coalesce(p_base64,'')) > 4194304 then
    raise exception 'Nome ou tamanho do documento inválido.';
  end if;
  v_bytes := decode(p_base64,'base64');
  if octet_length(v_bytes) not between 5 and 3145728 or not (
    (p_tipo='application/pdf' and substring(v_bytes from 1 for 5)=decode('255044462d','hex')) or
    (p_tipo='image/png' and substring(v_bytes from 1 for 8)=decode('89504e470d0a1a0a','hex')) or
    (p_tipo='image/jpeg' and substring(v_bytes from 1 for 3)=decode('ffd8ff','hex'))
  ) then raise exception 'Arquivo inválido. Use PDF, PNG ou JPEG de até 3 MB.'; end if;
  insert into public.acordo_documentos(acordo_id,carteira_id,nome,tipo,documento,criado_por)
    values(a.id,a.carteira_id,btrim(p_nome),p_tipo,v_bytes,auth.uid()) returning id into v_id;
  return v_id;
end $$;
create function public.acordo_baixar_documento(p_id uuid)
returns table(nome text,tipo text,base64 text) language sql stable security definer set search_path = '' as $$
  select d.nome,d.tipo,encode(d.documento,'base64') from public.acordo_documentos d
  where d.id=p_id and auth.uid() is not null and public.current_user_can_access_carteira(d.carteira_id)
$$;
revoke all on function public.acordo_anexar_documento(uuid,text,text,text), public.acordo_baixar_documento(uuid) from public, anon;
grant execute on function public.acordo_anexar_documento(uuid,text,text,text), public.acordo_baixar_documento(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
