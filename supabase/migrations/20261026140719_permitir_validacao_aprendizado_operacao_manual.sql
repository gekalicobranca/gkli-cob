-- Os gatilhos de mensagens também executam nas operações humanas autenticadas.
-- Estes predicados são SECURITY INVOKER: continuam sujeitos às políticas RLS
-- do usuário e não autorizam envios nem alterações de dados por si próprios.
grant execute on function public.agentes_aprendizado_mensagem_elegivel(public.mensagens),
  public.agentes_aprendizado_aviso_autorizado(public.mensagens),
  public.agentes_aprendizado_acordos(public.central_pendencias)
to authenticated;

-- Falhar se uma alteração futura tiver elevado o privilégio destes predicados.
do $$
begin
  if exists (select 1 from pg_proc
    where oid in (
      'public.agentes_aprendizado_mensagem_elegivel(public.mensagens)'::regprocedure,
      'public.agentes_aprendizado_aviso_autorizado(public.mensagens)'::regprocedure,
      'public.agentes_aprendizado_acordos(public.central_pendencias)'::regprocedure
    ) and prosecdef) then
    raise exception 'Os predicados de aprendizado devem permanecer SECURITY INVOKER';
  end if;
end $$;
