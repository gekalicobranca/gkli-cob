begin;

create table public.keila_graph_cursor (
  id boolean primary key default true check (id),
  desde timestamptz not null,
  proxima_url text,
  revisao bigint not null default 0
);

create table public.keila_graph_recebimentos (
  message_id text primary key,
  conversation_id text not null,
  remetente text not null,
  caso_id uuid references public.central_pendencias(id) on delete set null,
  recebido_em timestamptz not null
);

create index keila_graph_recebimentos_conversa_idx
  on public.keila_graph_recebimentos (conversation_id, remetente, recebido_em desc);
create index keila_graph_recebimentos_caso_idx on public.keila_graph_recebimentos (caso_id);
create index if not exists unidades_email_normalizado_idx on public.unidades (lower(btrim(email))) where email is not null;

alter table public.keila_graph_cursor enable row level security;
alter table public.keila_graph_recebimentos enable row level security;
revoke all on public.keila_graph_cursor, public.keila_graph_recebimentos from public, anon, authenticated;
grant select, insert, update on public.keila_graph_cursor to service_role;
grant select, insert on public.keila_graph_recebimentos to service_role;

-- Os gatilhos de proteção continuam classificando o caso. Só o enfileiramento
-- de avisos fica suspenso durante a transação de entrada do Graph.
drop trigger keila_enfileirar_aviso_boletos on public.central_pendencias;
create trigger keila_enfileirar_aviso_boletos
after insert or update of payload on public.central_pendencias for each row
when (new.tipo = 'keila_atendimento' and current_setting('gkli.keila_graph_leitura', true) is distinct from 'on')
execute function public.keila_enfileirar_aviso_boletos();

drop trigger zz_agentes_aprendizado_encaminhar on public.central_pendencias;
create trigger zz_agentes_aprendizado_encaminhar
after insert or update of payload,status,unidade_id on public.central_pendencias for each row
when (new.tipo in ('keila_atendimento','lidia_atendimento') and current_setting('gkli.keila_graph_leitura', true) is distinct from 'on')
execute function public.agentes_aprendizado_encaminhar();

create function public.keila_graph_unidade(p_remetente text) returns uuid
language sql stable security invoker set search_path = '' as $$
  select case when count(*) = 1 then
    (array_agg(id) filter (where condominio_id = '2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53'))[1] end
  from (
    select id, condominio_id from public.unidades
    where email is not null and lower(btrim(email)) = lower(btrim(p_remetente))
    limit 2
  ) correspondencias;
$$;

create function public.keila_graph_registrar(
  p_message_id text, p_conversation_id text, p_internet_message_id text,
  p_remetente text, p_recebido_em timestamptz, p_assunto text, p_url text,
  p_intencao text, p_revisao text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_condominio constant uuid := '2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53';
  v_carteira constant uuid := 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3';
  v_conta constant text := 'keila@gekali.com.br';
  v_unidade public.unidades;
  v_caso public.central_pendencias;
  v_candidatos uuid[];
  v_id uuid;
  v_email jsonb;
  v_vinculo jsonb;
  v_payload jsonb;
  v_atividade jsonb;
  v_chave text;
  v_revisao text := coalesce(p_revisao, '');
  v_acao text;
  v_resumo text;
  v_novo boolean;
  v_eh_recente boolean;
  v_modo_anterior text;
begin
  if coalesce(length(p_message_id), 0) not between 1 and 1000
    or coalesce(length(p_conversation_id), 0) not between 1 and 1000
    or coalesce(length(p_internet_message_id), 0) > 1000
    or coalesce(length(p_remetente), 0) not between 3 and 254
    or p_remetente !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or coalesce(p_assunto, '') !~* '(^|[^[:alnum:]_])safira($|[^[:alnum:]_])' or length(p_assunto) > 500
    or p_assunto ~ '[[:cntrl:]]'
    or coalesce(p_intencao, '') not in ('debitos','parcelamento','outro')
    or v_revisao not in ('','anexo','conteudo','pedido_boleto')
    or p_recebido_em is null or p_recebido_em > now() + interval '5 minutes'
    or coalesce(p_url, '') !~ '^https://(outlook\.office\.com|outlook\.office365\.com|outlook\.live\.com|outlook\.cloud\.microsoft)/'
    or length(p_url) > 4000
  then raise exception 'Retorno Graph inválido'; end if;

  if not exists (
    select 1 from public.keila_graph_cursor k join public.condominios c on c.id = v_condominio
    where k.id and c.carteira_id = v_carteira and c.operacao_virtual_habilitada
      and p_recebido_em >= greatest(k.desde, c.keila_retornos_desde)
      and c.keila_retornos_desde is not null
  ) then raise exception 'Piloto Graph indisponível para esta data'; end if;

  perform pg_advisory_xact_lock(hashtextextended('keila-graph:' || lower(p_remetente), 0));
  select caso_id into v_id from public.keila_graph_recebimentos where message_id = p_message_id;
  if found then return v_id; end if;

  select * into v_unidade from public.unidades u
    where u.id = public.keila_graph_unidade(p_remetente)
      and u.condominio_id = v_condominio and u.carteira_id = v_carteira
      and lower(btrim(u.email)) = lower(btrim(p_remetente))
    for update;

  if v_unidade.id is null then
    v_revisao := 'vinculo';
  elsif coalesce(v_unidade.acao_judicial, false) then
    v_revisao := 'judicial';
  else
    v_caso.condominio_id := v_condominio;
    v_caso.carteira_id := v_carteira;
    v_caso.unidade_id := v_unidade.id;
    v_caso.payload := '{}'::jsonb;
    if jsonb_array_length(public.agentes_aprendizado_acordos(v_caso)) > 0 then
      v_revisao := 'acordo';
    end if;
  end if;

  if v_revisao = '' then
    select array_agg(c.id) into v_candidatos from public.central_pendencias c
    where c.tipo = 'keila_atendimento' and c.condominio_id = v_condominio and c.carteira_id = v_carteira
      and c.status not in ('resolvida','cancelada')
      and (c.unidade_id = v_unidade.id or c.payload->'unidade_ids' ? v_unidade.id::text);
    if cardinality(v_candidatos) = 1 then
      select * into v_caso from public.central_pendencias c where c.id = v_candidatos[1] for update;
      if v_caso.status in ('resolvida','cancelada') or v_caso.tipo <> 'keila_atendimento'
        or v_caso.payload->>'estado' in ('atendimento_humano','concluido')
        or v_caso.payload->'unidade_ids' is distinct from jsonb_build_array(v_unidade.id)
        or exists (
          select 1 from jsonb_array_elements(coalesce(v_caso.payload->'emails','[]'::jsonb)) e
          where lower(e->>'remetente') is distinct from lower(p_remetente)
        )
      then v_revisao := 'atendimento'; end if;
    elsif cardinality(v_candidatos) > 1 then
      v_revisao := 'atendimento';
    end if;
  end if;

  if v_revisao <> '' then
    -- A revisão mantém a unidade sugerida como referência. O vínculo financeiro
    -- fica para o operador, sem acionar avisos automáticos de acordo ou boletos.
    select c.* into v_caso from public.keila_graph_recebimentos r
    join public.central_pendencias c on c.id = r.caso_id
    where r.conversation_id = p_conversation_id and r.remetente = lower(p_remetente)
      and c.tipo = 'keila_atendimento' and c.carteira_id = v_carteira and c.condominio_id = v_condominio
      and c.status not in ('resolvida','cancelada') and c.unidade_id is null
      and c.payload->'unidade_ids' = '[]'::jsonb and c.payload->>'estado' = 'atendimento_humano'
    order by r.recebido_em desc limit 1 for update of c;
  end if;

  v_novo := v_caso.id is null;
  v_id := coalesce(v_caso.id, gen_random_uuid());
  v_chave := 'graph:' || v_conta || ':' || p_message_id;
  v_resumo := case p_intencao
    when 'debitos' then 'Solicitou informações sobre os débitos.'
    when 'parcelamento' then 'Solicitou informações sobre parcelamento.'
    else 'Novo retorno para conferência no Outlook.' end;
  v_acao := case v_revisao
    when 'vinculo' then 'Conferir o vínculo do remetente com uma única unidade do Safira.'
    when 'anexo' then 'Conferir manualmente a mensagem e os documentos no Outlook.'
    when 'judicial' then 'Encaminhar o retorno para revisão da equipe responsável pelo caso judicial.'
    when 'acordo' then 'Conferir o retorno com Carol e preservar o histórico do acordo.'
    when 'pedido_boleto' then 'Conferir com a equipe o pedido de boleto no Outlook.'
    when 'atendimento' then 'Conciliar o novo retorno com os atendimentos da unidade.'
    when 'conteudo' then 'Revisar o pedido original e definir o próximo passo.'
    else 'Conferir o novo retorno e consultar a Lello antes de preparar a resposta.' end;
  if v_revisao <> '' and v_unidade.id is not null then
    v_acao := v_acao || ' Unidade sugerida ' || v_unidade.identificacao || '.';
  end if;

  v_email := jsonb_build_object(
    'chave', v_chave, 'nome', coalesce(v_unidade.responsavel_nome, ''),
    'remetente', lower(p_remetente), 'recebido_em', to_char(timezone('UTC', p_recebido_em), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'assunto', p_assunto, 'resumo', v_resumo, 'webmail_url', p_url
  );
  v_vinculo := jsonb_strip_nulls(jsonb_build_object(
    'conta', v_conta, 'conversation_id', p_conversation_id, 'message_id', p_message_id,
    'internet_message_id', p_internet_message_id, 'interlocutor', coalesce(v_unidade.responsavel_nome, '')
  ));
  v_atividade := jsonb_build_object('em', now(), 'descricao', 'Retorno do Outlook registrado via Microsoft Graph. ' || v_acao);
  v_payload := coalesce(v_caso.payload, '{}'::jsonb);
  select not exists (
    select 1 from jsonb_array_elements(coalesce(v_payload->'emails','[]'::jsonb)) e
    where (e->>'recebido_em')::timestamptz > p_recebido_em
  ) into v_eh_recente;
  if v_novo or v_eh_recente then
    if jsonb_typeof(v_payload->'resposta_aprovada') is distinct from 'object' then
      v_payload := v_payload - 'resposta_simulada' - 'resposta_email_chave' - 'resposta_anexos' - 'conferencia_proposta';
    end if;
    v_payload := v_payload || jsonb_build_object(
      'estado', case when v_revisao <> '' then 'atendimento_humano' else 'em_analise' end,
      'intencao', case when v_revisao <> '' then 'outro' else p_intencao end,
      'proxima_acao', v_acao
    );
  end if;
  v_payload := v_payload || jsonb_build_object(
    'versao', 1, 'modo', 'supervisionado', 'envio_permitido', false,
    'unidade_ids', case when v_revisao <> '' then '[]'::jsonb else jsonb_build_array(v_unidade.id) end,
    'emails', (select jsonb_agg(e order by (e->>'recebido_em')::timestamptz, e->>'chave')
      from jsonb_array_elements(coalesce(v_payload->'emails','[]'::jsonb) || jsonb_build_array(v_email)) e),
    'atividades', coalesce(v_payload->'atividades','[]'::jsonb) || jsonb_build_array(v_atividade),
    'acompanhamento', coalesce(v_payload->'acompanhamento','{"pendencias":[]}'::jsonb) ||
      jsonb_build_object('conversas', coalesce(v_payload#>'{acompanhamento,conversas}','[]'::jsonb) || jsonb_build_array(v_vinculo))
  );

  v_modo_anterior := current_setting('gkli.keila_graph_leitura', true);
  perform set_config('gkli.keila_graph_leitura', 'on', true);
  if v_novo then
    insert into public.central_pendencias (
      id, carteira_id, condominio_id, unidade_id, origem, tipo, status, prioridade,
      titulo, descricao, entidade_tipo, entidade_id, payload
    ) values (
      v_id, v_carteira, v_condominio, case when v_revisao = '' then v_unidade.id end,
      'mensageria', 'keila_atendimento', 'em_tratamento', 'normal',
      case when v_revisao = '' then 'Retorno do Safira · unidade ' || v_unidade.identificacao
        else 'Retorno do Safira · revisão humana' end,
      v_acao, 'condominio', v_condominio, v_payload
    );
  else
    update public.central_pendencias set payload = v_payload,
      descricao = v_payload->>'proxima_acao', updated_at = now() where id = v_id;
  end if;
  perform set_config('gkli.keila_graph_leitura', coalesce(v_modo_anterior, ''), true);

  insert into public.keila_graph_recebimentos(message_id, conversation_id, remetente, caso_id, recebido_em)
  values(p_message_id, p_conversation_id, lower(p_remetente), v_id, p_recebido_em);
  return v_id;
end;
$$;

revoke all on function public.keila_graph_unidade(text),
  public.keila_graph_registrar(text,text,text,text,timestamptz,text,text,text,text) from public, anon, authenticated;
grant execute on function public.keila_graph_unidade(text),
  public.keila_graph_registrar(text,text,text,text,timestamptz,text,text,text,text) to service_role;

notify pgrst, 'reload schema';

commit;
