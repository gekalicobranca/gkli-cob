begin;

alter table public.carteiras add column if not exists operador_id uuid references public.profiles(id) on delete set null;
alter table public.condominios
  add column if not exists grupo text check (grupo is null or length(grupo) between 1 and 120),
  add column if not exists operador_id uuid references public.profiles(id) on delete set null;
create index if not exists condominios_grupo_idx on public.condominios(grupo);
create index if not exists condominios_operador_idx on public.condominios(operador_id);

-- Only the names needed by the assignment selector; do not widen profiles RLS.
create function public.list_operadores_cadastro()
returns table(id uuid, nome text)
language sql stable security definer set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.nome), ''), 'Operador ' || left(p.id::text, 8))
  from public.profiles p
  where p.role in ('admin', 'gestor', 'operador')
    and exists (select 1 from public.profiles me where me.id = auth.uid()
      and me.role in ('admin', 'gestor', 'operador', 'leitura'))
  order by 2;
$$;
revoke all on function public.list_operadores_cadastro() from public;
grant execute on function public.list_operadores_cadastro() to authenticated;

create function public.validar_operador_cadastro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.operador_id is not null and not exists (
    select 1 from public.profiles where id = new.operador_id and role in ('admin', 'gestor', 'operador')
  ) then raise exception 'Selecione um operador válido.'; end if;
  return new;
end;
$$;
create trigger validar_operador_condominio before insert or update of operador_id on public.condominios
  for each row execute function public.validar_operador_cadastro();
create trigger validar_operador_carteira before insert or update of operador_id on public.carteiras
  for each row execute function public.validar_operador_cadastro();

create function public.normalizar_grupo_condominio()
returns trigger language plpgsql set search_path = public as $$
begin
  new.grupo := nullif(upper(regexp_replace(trim(new.grupo), '\s+', ' ', 'g')), '');
  return new;
end;
$$;
create trigger normalizar_grupo_condominio before insert or update of grupo on public.condominios
  for each row execute function public.normalizar_grupo_condominio();

-- New charges inherit the assignment, while an explicit assignment is preserved.
create function public.atribuir_operador_cobranca()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.operador_id is null then
    select coalesce(c.operador_id, ca.operador_id) into new.operador_id
    from public.carteiras ca
    left join public.condominios c on c.id = new.condominio_id and c.carteira_id = ca.id
    where ca.id = new.carteira_id;
  end if;
  return new;
end;
$$;
create trigger atribuir_operador_cobranca before insert on public.cobrancas
  for each row execute function public.atribuir_operador_cobranca();

comment on column public.condominios.grupo is 'Grupo de relacionamento opcional, compartilhado pelo nome normalizado.';
comment on column public.condominios.operador_id is 'Responsável específico; nulo herda dinamicamente o operador da carteira. Não altera permissões.';
commit;
