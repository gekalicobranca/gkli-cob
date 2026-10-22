begin;

-- Mesma atribuição usada nas novas cobranças: registrar uma vez na criação.
-- Histórico e atribuições próprias explícitas nunca são recalculados.
create function public.atribuir_operador_acordo()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
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

revoke all on function public.atribuir_operador_acordo() from public, anon;
grant execute on function public.atribuir_operador_acordo() to authenticated, service_role;

create trigger atribuir_operador_acordo
before insert on public.acordos
for each row execute function public.atribuir_operador_acordo();

comment on function public.atribuir_operador_acordo() is
  'Novos acordos sem operador próprio herdam condomínio/carteira na criação. Não altera acordos existentes nem acompanha futuras trocas de responsável.';

commit;
