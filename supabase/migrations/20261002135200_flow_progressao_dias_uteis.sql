begin;

select cron.alter_job(
  jobid,
  command := $$
    select case
      when extract(isodow from timezone('America/Sao_Paulo', now())) between 1 and 5
        then public.flow_progressao_tick()
    end;
  $$
)
from cron.job
where jobname = 'gkli-flow-progressao';

select cron.alter_job(
  jobid,
  command := $$
    select case
      when extract(isodow from timezone('America/Sao_Paulo', now())) between 1 and 5
        then public.email_processar_agenda()
    end;
  $$
)
from cron.job
where jobname = 'gkli-email-agenda';

commit;
