create function public.maestro_arquivar_montagens_concluidas(p_montagem_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[];
  arquivadas integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role in ('admin', 'gestor', 'operador')
  ) then
    raise exception 'Sem permissão para arquivar montagens.';
  end if;

  select array_agg(distinct id) into ids from unnest(p_montagem_ids) id;
  if coalesce(cardinality(ids), 0) = 0 or cardinality(ids) > 1000 or array_position(ids, null) is not null then
    raise exception 'Selecione entre 1 e 1000 montagens.';
  end if;

  perform 1 from public.maestro_flow_montagens
    where id = any(ids) and public.current_user_can_access_carteira(carteira_id) is true
    order by id for update;
  if (select count(*) from public.maestro_flow_montagens
    where id = any(ids) and public.current_user_can_access_carteira(carteira_id) is true
      and status = 'concluido' and arquivado_em is null) <> cardinality(ids) then
    raise exception 'Seleção contém montagem indisponível, sem permissão ou que não está concluída. Atualize a lista.';
  end if;

  update public.maestro_flow_montagens set arquivado_em = now() where id = any(ids);
  get diagnostics arquivadas = row_count;
  return arquivadas;
end;
$$;

revoke all on function public.maestro_arquivar_montagens_concluidas(uuid[]) from public, anon;
grant execute on function public.maestro_arquivar_montagens_concluidas(uuid[]) to authenticated;

notify pgrst, 'reload schema';
