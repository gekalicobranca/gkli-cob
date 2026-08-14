alter table public.unidades
  add column if not exists credito_administradora numeric(14,2) not null default 0;

alter table public.unidades
  add constraint unidades_credito_administradora_nao_negativo_check
  check (credito_administradora >= 0);

comment on column public.unidades.credito_administradora is
  'Saldo de credito reconhecido pela administradora e disponivel para abatimento em novo acordo.';

alter table public.acordos
  add column if not exists credito_administradora_utilizado numeric(14,2) not null default 0;

alter table public.acordos
  add constraint acordos_credito_administradora_utilizado_nao_negativo_check
  check (credito_administradora_utilizado >= 0);

comment on column public.acordos.credito_administradora_utilizado is
  'Credito da unidade consumido na formacao deste acordo.';

create or replace function public.consumir_credito_unidade_no_acordo(
  p_unidade_id uuid,
  p_acordo_id uuid,
  p_valor numeric
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_credito numeric(14,2);
  v_unidade_acordo uuid;
begin
  if p_valor is null or round(p_valor, 2) <= 0 then
    raise exception 'Valor de credito deve ser maior que zero.';
  end if;

  select unidade_id into v_unidade_acordo
    from public.acordos where id = p_acordo_id for update;

  if v_unidade_acordo is null or v_unidade_acordo <> p_unidade_id then
    raise exception 'Acordo nao pertence a unidade informada.';
  end if;

  select credito_administradora into v_credito
    from public.unidades where id = p_unidade_id for update;

  if v_credito is null then raise exception 'Unidade nao encontrada.'; end if;
  if v_credito < round(p_valor, 2) then
    raise exception 'Credito disponivel foi alterado. Atualize a simulacao.';
  end if;

  update public.unidades
     set credito_administradora = round(credito_administradora - p_valor, 2)
   where id = p_unidade_id;

  update public.acordos
     set credito_administradora_utilizado = round(p_valor, 2)
   where id = p_acordo_id;

  return round(v_credito - p_valor, 2);
end;
$$;

revoke all on function public.consumir_credito_unidade_no_acordo(uuid, uuid, numeric) from public, anon;
grant execute on function public.consumir_credito_unidade_no_acordo(uuid, uuid, numeric) to authenticated;
