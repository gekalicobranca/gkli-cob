begin;

-- A origem continua sendo Maestro para os coletores já instalados.
alter table public.agente_execucoes add column easy_maestro_lote_id uuid;
create unique index agente_execucoes_easy_maestro_lote_idx
  on public.agente_execucoes (easy_maestro_lote_id, receita_id)
  where easy_maestro_lote_id is not null;

create function public.easy_maestro_receitas(p_carteiras uuid[], p_administradora text)
returns table (
  administradora text, administradora_nome text, administradora_id uuid,
  receita_id uuid, receita_nome text, condominio_id uuid, condominio_nome text, carteira_id uuid
)
language sql stable security invoker set search_path = '' as $$
  select lower(trim(a.nome)), trim(a.nome), a.id, r.id, r.nome, c.id,
    coalesce(nullif(c.nome_operacional, ''), c.nome), c.carteira_id
  from public.agente_receitas r
  join public.agente_administradoras a on a.id = r.administradora_id and a.ativo
  join public.condominios c on c.id::text = r.config_json->>'condominio_id'
  where r.ativo and r.tipo_coleta = 'inadimplencia' and c.status = 'ativo'
    and c.carteira_id is not null
    and (p_carteiras is null or c.carteira_id = any(p_carteiras))
    and (p_administradora is null or lower(trim(a.nome)) = p_administradora)
    -- Coletores atendidos pela fila maestro_supervisor_fila.
    and r.script_key in (
      'bbz_condopro_clock_vila_romana', 'manager_atentum_cotas_pendentes',
      'villagua_condopro_square_guarulhos', 'verti_winker_inadimplencia',
      'captacao_atipass', 'captacao_lello', 'captacao_hflex', 'captacao_graiche'
    )
    and (r.script_key <> 'captacao_lello' or (
      coalesce(nullif(trim(r.config_json->>'codigo_portal'), ''), nullif(trim(r.config_json->>'codigo_cliente'), '')) is not null
      and coalesce(r.config_json->>'codigo_pendente', 'false') <> 'true'
    ));
$$;

create function public.easy_maestro_captar(p_carteiras uuid[], p_administradora text, p_usuario uuid, p_lote uuid)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare criadas integer;
begin
  if p_usuario is null or p_lote is null or nullif(p_administradora, '') is null then
    raise exception 'Pedido de captação inválido.';
  end if;
  -- A mesma trava da agenda mensal, para reutilizar execuções concorrentes.
  perform pg_advisory_xact_lock(15102026, 1912);
  if exists (select 1 from public.automacao_controle where chave = 'captacao_global' and ativo is false) then
    raise exception 'A captação está desligada no Maestro.';
  end if;
  if not exists (select 1 from public.easy_maestro_receitas(p_carteiras, p_administradora)) then
    raise exception 'Nenhuma captação automática disponível para esta administradora.';
  end if;

  with novas as (
    insert into public.agente_execucoes (
      receita_id, administradora_id, carteira_id, condominio_id, solicitado_por,
      status, tentativas, origem, easy_maestro_lote_id
    )
    select r.receita_id, r.administradora_id, r.carteira_id, r.condominio_id, p_usuario,
      'pendente', 0, 'maestro', p_lote
    from public.easy_maestro_receitas(p_carteiras, p_administradora) r
    where not exists (
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

create function public.easy_maestro_painel(p_carteiras uuid[], p_administradora text)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'ativo', not exists (select 1 from public.automacao_controle where chave = 'captacao_global' and ativo is false),
    'receitas', coalesce(jsonb_agg(jsonb_build_object(
      'administradora', r.administradora, 'administradoraNome', r.administradora_nome,
      'id', r.receita_id, 'nome', r.receita_nome,
      'condominioId', r.condominio_id, 'condominio', r.condominio_nome,
      'easy', e.easy_maestro_lote_id is not null,
      'estado', case
        when e.id is null then 'disponivel'
        when e.status = 'em_execucao' then 'captando'
        when e.status = 'pendente' then 'fila'
        when e.status in ('falha', 'cancelada', 'precisa_intervencao') then 'revisar'
        when v.status in ('concluido', 'concluido_com_alertas') then 'importado'
        when v.status in ('erro', 'falha', 'cancelado') then 'revisar'
        when exists (select 1 from public.agente_logs l where l.execucao_id = e.id and l.step = 'sem_inadimplencia') then 'sem_inadimplencia'
        when e.finalizado_em < now() - interval '5 minutes' then 'revisar'
        else 'importando'
      end,
      'detalhe', case
        when e.status in ('falha', 'cancelada', 'precisa_intervencao') then e.erro_mensagem
        when e.status in ('pendente', 'em_execucao') and e.easy_maestro_lote_id is null then 'Pedido já em andamento no Maestro.'
        when v.status = 'concluido_com_alertas' then 'Importação concluída com alertas.'
      end,
      'conversaoId', v.id, 'cobrancas', v.total_cobrancas, 'solicitadaEm', e.created_at
    ) order by r.administradora, r.condominio_nome, r.receita_nome), '[]'::jsonb)
  )
  from public.easy_maestro_receitas(p_carteiras, p_administradora) r
  left join lateral (
    select e.* from public.agente_execucoes e
    where e.receita_id = r.receita_id and e.carteira_id = r.carteira_id
      and e.condominio_id = r.condominio_id and (
        (e.origem in ('maestro', 'maestro_agendada', 'agenda_mensal')
          and (e.agendado_para is null or e.agendado_para <= now())) or (
          e.status in ('pendente', 'em_execucao')
          and (e.agendado_para is null or e.agendado_para <= now() or e.status = 'em_execucao')
        )
      )
    order by (e.status in ('pendente', 'em_execucao')) desc, e.created_at desc, e.id
    limit 1
  ) e on true
  left join lateral (
    select v.id, v.status, v.total_cobrancas
    from public.agente_arquivos a join public.conversoes_relatorio v on v.id = a.id
    where a.execucao_id = e.id and v.condominio_id = r.condominio_id and v.carteira_id = r.carteira_id
    order by a.created_at desc, a.id
    limit 1
  ) v on true;
$$;

revoke all on function public.easy_maestro_receitas(uuid[], text),
  public.easy_maestro_captar(uuid[], text, uuid, uuid), public.easy_maestro_painel(uuid[], text)
  from public, anon, authenticated;
grant execute on function public.easy_maestro_receitas(uuid[], text),
  public.easy_maestro_captar(uuid[], text, uuid, uuid), public.easy_maestro_painel(uuid[], text)
  to service_role;
notify pgrst, 'reload schema';
commit;
