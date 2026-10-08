-- Atipass na fila exclusiva de PDFs; preserva as políticas existentes.
begin;
alter table public.agente_acordos_configuracoes drop constraint agente_acordos_configuracoes_administradora_check;
alter table public.agente_acordos_configuracoes add constraint agente_acordos_configuracoes_administradora_check check (administradora in ('Manager','Lello','BBZ','ATIPASS'));
alter table public.agente_acordos_execucoes drop constraint agente_acordos_execucoes_administradora_check;
alter table public.agente_acordos_execucoes add constraint agente_acordos_execucoes_administradora_check check (administradora in ('Manager','Lello','BBZ','ATIPASS'));
alter table public.agente_acordos_workers drop constraint agente_acordos_workers_nome_check;
alter table public.agente_acordos_workers add constraint agente_acordos_workers_nome_check check (nome in ('manager-acordos','lello-acordos','bbz-acordos','atipass-acordos'));
create or replace function public.reivindicar_agente_acordos_portal(p_worker_id uuid,p_administradora text)
returns setof public.agente_acordos_execucoes language sql security invoker set search_path=public as $$
  with proxima as (
    select id from public.agente_acordos_execucoes where status='pendente' and administradora=p_administradora
    and p_administradora in ('Lello','BBZ','ATIPASS') order by created_at,id for update skip locked limit 1
  )
  update public.agente_acordos_execucoes e set status='em_execucao',etapa='coleta',iniciado_em=now(),worker_id=p_worker_id
  from proxima where e.id=proxima.id returning e.*;
$$;
revoke all on function public.reivindicar_agente_acordos_portal(uuid,text) from public,anon,authenticated;
grant execute on function public.reivindicar_agente_acordos_portal(uuid,text) to service_role;
commit;
