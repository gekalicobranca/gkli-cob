alter table public.regua_jobs
  drop constraint if exists regua_jobs_tipo_check;

alter table public.regua_jobs
  add constraint regua_jobs_tipo_check
  check (tipo in ('regua_cobranca', 'regua_acordo', 'regua_pre_juridico', 'scheduler'));
