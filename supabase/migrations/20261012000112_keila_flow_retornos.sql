-- Routing starts when explicitly enabled on a condominium; no historical replay.
alter table public.condominios add column if not exists keila_retornos_desde timestamptz;

create or replace function public.keila_encaminhar_retorno_flow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  destino record;
  caso uuid;
  chave text;
  retorno jsonb;
  email jsonb;
begin
  if new.retorno_registrado_em is null or new.cobranca_flow_id is null
     or new.canal not in ('email', 'whatsapp') then return new; end if;
  if tg_op = 'UPDATE' and new.retorno_registrado_em is not distinct from old.retorno_registrado_em
     and new.retorno_observacao is not distinct from old.retorno_observacao then return new; end if;

  -- The originating item identifies the condominium even for consolidated charges.
  select c.id, c.carteira_id, c.nome, i.unidade_id into destino
  from public.lote_itens i
  join public.condominios c on c.id = i.condominio_id
  join public.cobranca_flows f on f.id = new.cobranca_flow_id
  where i.id = new.lote_item_id and i.lote_id = f.lote_id
    and c.carteira_id = new.carteira_id and f.carteira_id = c.carteira_id
    and c.operacao_virtual_habilitada and c.keila_retornos_desde <= new.retorno_registrado_em
    and f.iniciado_em is not null and f.status <> 'cancelado';
  if not found then return new; end if;

  caso := pg_catalog.md5('keila:flow-retorno:' || new.id::text)::uuid;
  chave := new.id::text || ':' || new.retorno_registrado_em::text;
  retorno := pg_catalog.jsonb_build_object('chave', chave, 'canal', new.canal,
    'remetente', new.destinatario, 'recebido_em', new.retorno_registrado_em,
    'resumo', coalesce(new.retorno_observacao, 'Retorno registrado sem texto.'),
    'mensagem_id', new.id, 'flow_id', new.cobranca_flow_id,
    'tipo', new.retorno_tipo, 'origem', new.retorno_origem);
  email := pg_catalog.jsonb_build_object('chave', chave, 'nome', '', 'remetente', new.destinatario,
    'recebido_em', new.retorno_registrado_em, 'assunto', 'Retorno do flow de cobrança',
    'resumo', coalesce(new.retorno_observacao, 'Retorno registrado sem texto.'));

  insert into public.central_pendencias as p
    (id, carteira_id, condominio_id, unidade_id, origem, tipo, status, prioridade,
     titulo, descricao, entidade_tipo, entidade_id, payload)
  values (caso, destino.carteira_id, destino.id, destino.unidade_id, 'mensageria',
    'keila_atendimento', 'em_tratamento', 'normal',
    'Retorno ' || new.canal || ' — ' || destino.nome,
    'Keila: analisar o retorno do flow e preparar o atendimento.', 'condominio', destino.id,
    pg_catalog.jsonb_build_object('versao', 1, 'estado', 'em_analise', 'intencao', 'outro',
      'unidade_ids', case when destino.unidade_id is null then '[]'::jsonb else pg_catalog.jsonb_build_array(destino.unidade_id) end,
      'emails', case when new.canal = 'email' then pg_catalog.jsonb_build_array(email) else '[]'::jsonb end,
      'retornos', pg_catalog.jsonb_build_array(retorno),
      'atividades', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('em', now(),
        'descricao', 'Retorno encaminhado automaticamente à Keila pelo flow.')),
      'proxima_acao', 'Analisar o retorno do flow e preparar o atendimento.',
      'envio_permitido', false, 'modo', 'supervisionado'))
  on conflict (id) do update set
    payload = p.payload || pg_catalog.jsonb_build_object(
      'retornos', coalesce(p.payload->'retornos', '[]'::jsonb) || pg_catalog.jsonb_build_array(retorno),
      'emails', coalesce(p.payload->'emails', '[]'::jsonb) || case when new.canal = 'email' then pg_catalog.jsonb_build_array(email) else '[]'::jsonb end,
      'atividades', coalesce(p.payload->'atividades', '[]'::jsonb) || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('em', now(), 'descricao', 'Novo retorno recebido pelo flow.'))),
    updated_at = now()
  where p.tipo = 'keila_atendimento'
    and not coalesce(p.payload->'retornos', '[]'::jsonb) @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('chave', chave));
  return new;
end;
$$;
-- Trigger-only entry point; callers cannot supply arbitrary message IDs.
revoke all on function public.keila_encaminhar_retorno_flow() from public, anon, authenticated;
create trigger keila_retorno_flow after insert or update of retorno_registrado_em, retorno_observacao
on public.mensagens for each row execute function public.keila_encaminhar_retorno_flow();
