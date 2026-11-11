-- Alternate flow preparation/progression; leave the nighttime email job intact.
-- Odd minutes avoid email dispatch at 00,10,20,30,40,50.
-- Preserve active flags and commands (including Sao Paulo weekday checks).
begin;
set local lock_timeout = '5s';

do $$
declare
  target record;
  existing record;
begin
  for target in select * from (values
    ('gkli-maestro-flows', '1-59/4 * * * *'),
    ('gkli-flow-progressao', '3-59/4 * * * *')
  ) as schedules(jobname, schedule) loop
    if (select count(*) from cron.job where jobname = target.jobname) <> 1 then
      raise exception 'Expected exactly one cron job named %', target.jobname;
    end if;
    select jobid, schedule into existing from cron.job where jobname = target.jobname;
    if existing.schedule not in ('*/2 * * * *', target.schedule) then
      raise exception 'Unexpected schedule for %: %', target.jobname, existing.schedule;
    end if;
    perform cron.alter_job(existing.jobid, schedule := target.schedule);
  end loop;
end $$;

commit;
