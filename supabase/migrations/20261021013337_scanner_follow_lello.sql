-- Cadastro compartilhado autorizado somente para Follow, código Lello confirmado.
create or replace function public.scanner_reivindicar(p_token uuid) returns setof public.scanner_configuracoes
language plpgsql security invoker set search_path=public as $$
declare v public.scanner_configuracoes; c public.scanner_controle; horario time;
begin
 if p_token is null then raise exception 'Token obrigatório'; end if;
 horario := (now() at time zone 'America/Sao_Paulo')::time;
 if horario < time '00:30' or horario >= time '05:25' then return; end if;
 select * into c from public.scanner_controle where id for update;
 if c.proxima_execucao > now() or c.reservado_ate > now() then return; end if;
 if c.token is not null then
   update public.scanner_controle set token=null,reservado_ate=null,proxima_execucao=now()+interval '30 minutes' where id;
   return;
 end if;
 select s.* into v from public.scanner_configuracoes s join public.condominios d on d.id=s.condominio_id
 where s.ativo and s.proxima_execucao<=now() and d.status='ativo' and (
   lower(d.administradora)='lello' or (
     d.id='13290a44-ec8d-4232-81e7-711196547f91'::uuid
     and lower(d.administradora)='hubert/lello' and s.codigo_portal='62430'
   )
 )
 order by s.proxima_execucao,s.id limit 1 for update of s skip locked;
 if not found then return; end if;
 update public.scanner_controle set token=p_token,configuracao_id=v.id,reservado_ate=now()+interval '5 minutes' where id;
 return next v;
end $$;
revoke all on function public.scanner_reivindicar(uuid) from public,anon,authenticated;
grant execute on function public.scanner_reivindicar(uuid) to service_role;
