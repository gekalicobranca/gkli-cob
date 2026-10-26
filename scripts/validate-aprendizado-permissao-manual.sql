-- Executar como administrador do banco: toda a simulação é revertida.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub',
  (select id from public.profiles where role='admin' order by id limit 1),
  'role','authenticated')::text, true);
set local role authenticated;
do $$
declare
  unidade public.unidades;
  mensagem public.mensagens;
begin
  select u.* into strict unidade from public.unidades u
  join public.condominios c on c.id=u.condominio_id
  where c.nome='CONDOMÍNIO NEW WAY' and u.identificacao='001402';
  mensagem.id:=gen_random_uuid();
  mensagem.carteira_id:=unidade.carteira_id;
  mensagem.contexto:='acordo'; mensagem.canal:='email'; mensagem.payload:='{}';
  if public.agentes_aprendizado_mensagem_elegivel(mensagem) is not true then
    raise exception 'Mensagem manual normal foi bloqueada';
  end if;
  mensagem.payload:='{"agente_virtual":"keila"}';
  if public.agentes_aprendizado_mensagem_elegivel(mensagem) is not false then
    raise exception 'Mensagem automática sem caso foi autorizada';
  end if;
  mensagem.payload:='{"aprendizado":{"regra":"sem_acordo_anterior_v1"}}';
  if public.agentes_aprendizado_mensagem_elegivel(mensagem) is not false then
    raise exception 'Aviso sem comprovação foi autorizado';
  end if;
  insert into public.mensagens(carteira_id,contexto,canal,status,status_operacional,
    destinatario,email_destinatario,email_assunto,conteudo,conteudo_renderizado,payload)
  values(unidade.carteira_id,'acordo','email','rascunho','rascunho',
    'validacao@example.invalid','validacao@example.invalid',
    'Validação revertida','Validação revertida','Validação revertida','{}');
end $$;
reset role;
do $$
begin
  if exists(select 1 from pg_proc where oid in (
    'public.agentes_aprendizado_mensagem_elegivel(public.mensagens)'::regprocedure,
    'public.agentes_aprendizado_aviso_autorizado(public.mensagens)'::regprocedure,
    'public.agentes_aprendizado_acordos(public.central_pendencias)'::regprocedure
  ) and (prosecdef or has_function_privilege('anon',oid,'execute')
    or not has_function_privilege('authenticated',oid,'execute'))) then
    raise exception 'Permissões ou SECURITY INVOKER inconsistentes';
  end if;
end $$;
rollback;
