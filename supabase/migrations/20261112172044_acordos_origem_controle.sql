begin;

alter table public.acordos add column origem_controle text not null default 'carteira'
  check (origem_controle in ('carteira', 'externo', 'a_confirmar'));

comment on column public.acordos.origem_controle is
  'Autoria para controle interno, independente do tipo, homologação e origem dos dados. Somente carteira integra a operação da GEKALI.';

-- Atualiza apenas a criação do acordo na Lello. Um vínculo com acordo já
-- cadastrado conserva a autoria registrada.
do $migration$
declare
  definicao text := pg_get_functiondef('public.importar_acordo_lello(uuid,text,jsonb,boolean)'::regprocedure);
  colunas text := 'observacoes,ultima_sincronizacao_status_em)';
  valores text := '||v_consulta::text,now()) returning id into v_acordo;';
begin
  if position(colunas in definicao) = 0 or position(valores in definicao) = 0 then
    raise exception 'Definição incompatível de importar_acordo_lello';
  end if;
  execute replace(replace(definicao, colunas, 'observacoes,ultima_sincronizacao_status_em,origem_controle)'),
    valores, '||v_consulta::text,now(),''a_confirmar'') returning id into v_acordo;');
end;
$migration$;

-- Cobre tanto a apuração por data quanto os lançamentos vinculados da planilha.
do $migration$
declare
  definicao text := pg_get_functiondef('public.apurar_fechamento_mensal(uuid)'::regprocedure);
  planilha text := 'left join public.acordos a on a.id=x.acordo_id;';
  recebidos text := 'where p.data_pagamento is not null';
  bloqueio text := 'select * into v_periodo';
begin
  if position(planilha in definicao) = 0 or position(recebidos in definicao) = 0
      or position(bloqueio in definicao) = 0 then
    raise exception 'Definição incompatível de apurar_fechamento_mensal';
  end if;
  definicao := replace(definicao, planilha, $sql$left join public.acordos a on a.id=x.acordo_id
    where (x.acordo_id is null or a.origem_controle = 'carteira')
      and not exists (
        select 1 from public.parcelas_acordo p join public.acordos pa on pa.id = p.acordo_id
        where p.id = x.parcela_id and pa.origem_controle <> 'carteira'
      );$sql$);
  definicao := replace(definicao, recebidos, 'where a.origem_controle = ''carteira'' and p.data_pagamento is not null');
  execute replace(definicao, bloqueio, $sql$perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('acordos_origem_fechamento', 0));
  select * into v_periodo$sql$);
end;
$migration$;

create function public.acordo_validar_origem_operacional()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.acordo_id is not null
      and new.status in ('rascunho', 'pendente_aprovacao', 'aprovada', 'agendada')
      and exists (select 1 from public.acordos a
        where a.id = new.acordo_id and a.origem_controle <> 'carteira') then
    raise exception 'Envio bloqueado para acordo fora dos controles da GEKALI.';
  end if;
  return new;
end;
$$;
revoke all on function public.acordo_validar_origem_operacional() from public, anon, authenticated;

create trigger acordo_validar_origem_mensagem
before insert or update of status, acordo_id on public.mensagens
for each row execute function public.acordo_validar_origem_operacional();

create function public.acordo_proteger_origem()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if tg_op = 'UPDATE' then
    raise exception 'Altere a origem pelo registro de classificação do acordo.' using errcode = '42501';
  end if;
  if new.origem_controle <> 'carteira' and not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'gestor')
  ) then
    raise exception 'Somente administradores e gestores podem importar acordos com outra origem.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.acordo_proteger_origem() from public, anon, authenticated;

create trigger acordo_proteger_origem
before update of origem_controle on public.acordos
for each row when (old.origem_controle is distinct from new.origem_controle)
execute function public.acordo_proteger_origem();

create trigger acordo_validar_origem_no_cadastro
before insert on public.acordos
for each row when (new.origem_controle <> 'carteira')
execute function public.acordo_proteger_origem();

create function public.acordo_classificar_origem(p_acordo uuid, p_origem text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  acordo public.acordos%rowtype;
  usuario uuid := auth.uid();
  manutencao boolean := session_user in ('postgres', 'supabase_admin')
    and current_setting('role', true) in ('none', 'postgres', 'supabase_admin');
  nome_usuario text;
  periodo uuid;
  mensagens_canceladas uuid[];
begin
  select p.nome into nome_usuario from public.profiles p
  where p.id = usuario and p.role in ('admin', 'gestor');
  if not found and not manutencao then
    raise exception 'Somente administradores e gestores podem classificar acordos.' using errcode = '42501';
  end if;
  if p_origem is null or p_origem not in ('carteira', 'externo', 'a_confirmar')
      or coalesce(length(btrim(p_motivo)), 0) not between 3 and 500 then
    raise exception 'Informe uma origem válida e o motivo da classificação.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('acordos_origem_fechamento', 0));
  select * into acordo from public.acordos where id = p_acordo for update;
  if not found or (not manutencao and public.current_user_can_access_carteira(acordo.carteira_id) is not true) then
    raise exception 'Acordo não encontrado ou sem acesso.' using errcode = '42501';
  end if;
  if acordo.origem_controle = p_origem then return; end if;

  update public.acordos set origem_controle = p_origem where id = p_acordo;

  if p_origem <> 'carteira' then
    with canceladas as (
      update public.mensagens
      set status = 'cancelada', status_operacional = 'cancelada', cancelado_em = now(), cancelado_por = usuario,
        erro = 'Envio cancelado pela classificação de origem do acordo.'
      where acordo_id = p_acordo
        and status in ('rascunho', 'pendente_aprovacao', 'aprovada', 'agendada', 'falha')
      returning id
    )
    select array_agg(id) into mensagens_canceladas from canceladas;

    update public.lote_itens set status = 'cancelado', cancelado_em = now()
    where mensagem_id = any(mensagens_canceladas) and status <> 'enviado';
    delete from public.email_agenda where mensagem_id = any(mensagens_canceladas);

    update public.acordo_flows f
    set total_pendentes = m.pendentes, total_agendadas = m.agendadas, total_falhas = m.falhas,
      proximo_disparo_em = m.proximo,
      status = case
        when f.status in ('pausado', 'cancelado') or m.pendentes + m.agendadas > 0 then f.status
        when m.falhas > 0 then 'concluido_com_falhas'
        else 'concluido'
      end,
      concluido_em = case when m.pendentes + m.agendadas = 0 and f.status not in ('pausado', 'cancelado')
        then coalesce(f.concluido_em, now()) else f.concluido_em end
    from (
      select acordo_flow_id,
        count(*) filter (where status in ('rascunho', 'pendente_aprovacao', 'aprovada')) as pendentes,
        count(*) filter (where status = 'agendada') as agendadas,
        count(*) filter (where status = 'falha') as falhas,
        min(agendada_para) filter (where status = 'agendada') as proximo
      from public.mensagens where acordo_flow_id in (
        select acordo_flow_id from public.mensagens where id = any(mensagens_canceladas)
      )
      group by acordo_flow_id
    ) m
    where f.id = m.acordo_flow_id;
  end if;

  -- Recalcula somente competências editáveis que já foram apuradas e são
  -- afetadas pela entrada ou saída do acordo.
  if (acordo.origem_controle = 'carteira') <> (p_origem = 'carteira') then
    for periodo in
      select f.id from public.fechamento_periodos f
      where f.status in ('rascunho', 'aberto', 'em_conferencia', 'reaberto')
        and exists (select 1 from public.fechamento_auditoria fa
          where fa.periodo_id = f.id and fa.acao = 'apuracao_rpc')
        and (
          exists (select 1 from public.fechamento_pagamentos fp
            left join public.parcelas_acordo p on p.id = fp.parcela_id
            where fp.periodo_id = f.id and (fp.acordo_id = p_acordo or p.acordo_id = p_acordo))
          or (p_origem = 'carteira' and (
            (f.fonte_conferencia is null and exists (
              select 1 from public.parcelas_acordo p
              where p.acordo_id = p_acordo and p.data_pagamento::date between f.data_abertura and f.data_fechamento
            ))
            or exists (
              select 1 from jsonb_to_recordset(f.fonte_conferencia->'itens') x(acordo_id uuid, parcela_id uuid)
              left join public.parcelas_acordo p on p.id = x.parcela_id
              where x.acordo_id = p_acordo or p.acordo_id = p_acordo
            )
          ))
        )
      order by f.id
      for update of f
    loop
      perform public.apurar_fechamento_mensal(periodo);
    end loop;
  end if;

  insert into public.auditoria_eventos
    (carteira_id, entidade_tipo, entidade_id, evento_tipo, titulo, descricao, usuario_id, usuario_nome, antes, depois)
  values
    (acordo.carteira_id, 'acordo', p_acordo, 'acordo_origem_classificada', 'Origem do acordo classificada',
     btrim(p_motivo), usuario, nome_usuario, jsonb_build_object('origem_controle', acordo.origem_controle),
     jsonb_build_object('origem_controle', p_origem));
end;
$$;

revoke all on function public.acordo_classificar_origem(uuid, text, text) from public, anon;
grant execute on function public.acordo_classificar_origem(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
