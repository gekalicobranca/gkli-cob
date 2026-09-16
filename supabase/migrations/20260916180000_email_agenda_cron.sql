begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.email_processar_agenda()
returns bigint language plpgsql security definer set search_path=public as $$
declare v_token text; v_request bigint;
begin
  if not exists(select 1 from public.email_agenda a join public.mensagens m on m.id=a.mensagem_id
    where m.status='agendada' and a.agendada_para<=now()) then return null; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='gkli_email_agenda_token';
  if v_token is null then raise exception 'Credencial da agenda de e-mails não configurada.'; end if;
  select net.http_get(url:='https://gkli-cob.vercel.app/api/jobs/emails/disparar',
    headers:=jsonb_build_object('Authorization','Bearer '||v_token),timeout_milliseconds:=60000) into v_request;
  return v_request;
end $$;
revoke all on function public.email_processar_agenda() from public,anon,authenticated;
grant execute on function public.email_processar_agenda() to service_role;
select cron.schedule('gkli-email-agenda','*/10 12-20 * * *','select public.email_processar_agenda();');
-- Ativar após publicar o endpoint e instalar a credencial no Vault e na Vercel.
select cron.alter_job(jobid,active:=false) from cron.job where jobname='gkli-email-agenda';
commit;
