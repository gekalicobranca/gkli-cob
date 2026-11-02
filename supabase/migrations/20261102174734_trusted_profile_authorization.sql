-- Authorization item 1. Existing roles, payments and carteira links are preserved.
begin;
alter table public.profiles enable row level security;

-- Keep own-name edits and trusted admin provisioning; protect identity and role.
create or replace function public.protect_profile_authority()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role')
     and not public.current_user_is_admin() then
    if tg_op <> 'UPDATE' then
      raise exception 'Profile provisioning requires an administrator' using errcode = '42501';
    end if;
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from old.role then
      raise exception 'Profile authority is protected' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_authority() from public, anon, authenticated;
create trigger profiles_protect_authority before insert or update on public.profiles
for each row execute function public.protect_profile_authority();

-- Auth creation alone grants no application profile. Admin provisioning actions
-- explicitly upsert profiles; a failed provision stays closed. Never trust metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Preserve incomplete historical records for explicit administrative repair.
-- NOT VALID still checks every subsequent insert/update.
alter table public.profiles add constraint profiles_trusted_role_required
check (role is not null and role in ('admin', 'gestor', 'operador', 'leitura', 'sindico')) not valid;

-- SECURITY DEFINER avoids recursion through profile RLS. Object names are qualified.
create or replace function public.current_user_can_access_carteira(p_carteira_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_user_is_admin() or (
    p_carteira_id is not null
    and exists (select 1 from public.profiles p where p.id = auth.uid()
      and p.role in ('gestor', 'operador', 'leitura', 'sindico'))
    and exists (select 1 from public.usuarios_carteiras uc
      where uc.user_id = auth.uid() and uc.carteira_id = p_carteira_id)
  );
$$;
revoke all on function public.current_user_can_access_carteira(uuid) from public, anon;
grant execute on function public.current_user_can_access_carteira(uuid) to authenticated;

commit;
