begin;

create function public.easy_maestro_captar(
  p_carteiras uuid[], p_administradora text, p_usuario uuid, p_lote uuid,
  p_montar_flow boolean, p_condominios uuid[]
)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  criadas integer;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  receitas_painel jsonb;
  receitas_disponiveis uuid[];
begin
  if p_usuario is null or p_lote is null or nullif(p_administradora, '') is null then
    raise exception 'Pedido de captação inválido.';
  end if;
  -- Usa a mesma trava da agenda mensal e das chamadas anteriores do Easy.
  perform pg_advisory_xact_lock(15102026, 1912);
  if exists (select 1 from public.automacao_controle where chave = 'captacao_global' and ativo is false) then
    raise exception 'A captação está desligada no Maestro.';
  end if;

  if p_condominios is not null then
    if cardinality(p_condominios) = 0 then
      raise exception 'Selecione pelo menos um condomínio para captar.';
    end if;
    if exists (select 1 from public.agente_execucoes where easy_maestro_lote_id = p_lote and solicitado_por = p_usuario) then
      return 0;
    end if;

    receitas_painel := public.easy_maestro_painel(p_carteiras, p_administradora)->'receitas';
    if exists (
      select 1 from jsonb_array_elements(receitas_painel) r
      where (r->>'easy')::boolean and (
        r->>'estado' in ('fila', 'captando', 'importando') or (
          r->>'estado' = 'importado' and (r->>'montarFlow')::boolean
          and coalesce(r->>'montagemStatus', '') not in ('concluido', 'atencao')
        )
      )
    ) then
      raise exception 'Aguarde a captação ou montagem de flow em andamento nesta administradora.';
    end if;

    select array(
      select (r->>'id')::uuid from jsonb_array_elements(receitas_painel) r
      where (r->>'condominioId')::uuid = any(p_condominios) and (r->>'liberada')::boolean
        and r->>'estado' not in ('fila', 'captando', 'importando')
    ) into receitas_disponiveis;
    if cardinality(receitas_disponiveis) = 0 then
      raise exception 'Nenhum dos condomínios selecionados está disponível para captar agora.';
    end if;
  elsif not exists (
    select 1 from public.easy_maestro_janelas(p_carteiras, p_administradora, hoje) r
    where r.liberacao_em <= hoje
  ) then
    raise exception 'Nenhum condomínio desta administradora está liberado pela régua de cobrança.';
  end if;

  with novas as (
    insert into public.agente_execucoes (
      receita_id, administradora_id, carteira_id, condominio_id, solicitado_por,
      status, tentativas, origem, easy_maestro_lote_id, easy_maestro_montar_flow
    )
    select r.receita_id, r.administradora_id, r.carteira_id, r.condominio_id, p_usuario,
      'pendente', 0, 'maestro', p_lote, coalesce(p_montar_flow, false)
    from public.easy_maestro_janelas(p_carteiras, p_administradora, hoje) r
    where r.liberacao_em <= hoje
      and (p_condominios is null or r.receita_id = any(receitas_disponiveis))
      and not exists (
        select 1 from public.agente_execucoes e where e.receita_id = r.receita_id
          and (e.easy_maestro_lote_id = p_lote or (
            e.status in ('pendente', 'em_execucao')
            and (e.agendado_para is null or e.agendado_para <= now() or e.status = 'em_execucao')
          ))
      )
    returning id
  )
  insert into public.agente_logs (execucao_id, step, nivel, mensagem)
  select id, 'fila', 'info', 'Captação solicitada pelo Easy Maestro. Aguardando agente remoto.' from novas;
  get diagnostics criadas = row_count;
  return criadas;
end;
$$;

create or replace function public.easy_maestro_captar(
  p_carteiras uuid[], p_administradora text, p_usuario uuid, p_lote uuid
)
returns integer
language sql security invoker set search_path = '' as $$
  select public.easy_maestro_captar(p_carteiras, p_administradora, p_usuario, p_lote, false, null::uuid[]);
$$;

revoke all on function public.easy_maestro_captar(uuid[], text, uuid, uuid, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.easy_maestro_captar(uuid[], text, uuid, uuid, boolean, uuid[]) to service_role;
notify pgrst, 'reload schema';
commit;
