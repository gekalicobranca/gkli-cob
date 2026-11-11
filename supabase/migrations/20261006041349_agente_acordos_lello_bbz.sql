-- Amplia somente a fila exclusiva de PDFs; não altera tabelas financeiras ou Maestro.
begin;
alter table public.agente_acordos_configuracoes drop constraint agente_acordos_configuracoes_administradora_check;
alter table public.agente_acordos_configuracoes add constraint agente_acordos_configuracoes_administradora_check check (administradora in ('Manager','Lello','BBZ'));
alter table public.agente_acordos_configuracoes alter column codigo_cliente drop not null;
alter table public.agente_acordos_configuracoes add column alvos_portal jsonb not null default '[]'::jsonb;
alter table public.agente_acordos_configuracoes add column motivo_pendente text;
alter table public.agente_acordos_configuracoes add constraint acordos_alvos_validos check (
  jsonb_typeof(alvos_portal) = 'array' and
  (not habilitado or (codigo_cliente is not null and (administradora='Manager' or jsonb_array_length(alvos_portal)>0)))
);
alter table public.agente_acordos_execucoes add column administradora text not null default 'Manager' check (administradora in ('Manager','Lello','BBZ'));
alter table public.agente_acordos_workers drop constraint agente_acordos_workers_nome_check;
alter table public.agente_acordos_workers add constraint agente_acordos_workers_nome_check check (nome in ('manager-acordos','lello-acordos','bbz-acordos'));

alter policy acordos_exec_solicitar on public.agente_acordos_execucoes with check (
  public.current_user_can_access_carteira(carteira_id)
  and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','operador'))
  and solicitado_por=auth.uid() and status='pendente' and etapa='fila' and origem='manual'
  and iniciado_em is null and finalizado_em is null and worker_id is null and mensagem is null
  and storage_path is null and nome_pdf is null and tamanho_pdf is null and hash_pdf is null
  and exists (select 1 from public.agente_acordos_configuracoes c join public.condominios co on co.id=c.condominio_id
    where c.condominio_id=agente_acordos_execucoes.condominio_id
    and c.carteira_id=agente_acordos_execucoes.carteira_id and c.codigo_cliente=agente_acordos_execucoes.codigo_cliente
    and c.administradora=agente_acordos_execucoes.administradora
    and c.habilitado and co.status='ativo' and lower(co.administradora)=lower(c.administradora) and co.carteira_id=c.carteira_id)
);

-- Compatível com o consumidor Manager existente, inclusive se já estiver rodando.
create or replace function public.reivindicar_agente_acordos(p_worker_id uuid)
returns setof public.agente_acordos_execucoes language sql security invoker set search_path=public as $$
  with proxima as (
    select id from public.agente_acordos_execucoes where status='pendente' and administradora='Manager'
    order by created_at,id for update skip locked limit 1
  )
  update public.agente_acordos_execucoes e set status='em_execucao',etapa='coleta',iniciado_em=now(),worker_id=p_worker_id
  from proxima where e.id=proxima.id returning e.*;
$$;
create function public.reivindicar_agente_acordos_portal(p_worker_id uuid,p_administradora text)
returns setof public.agente_acordos_execucoes language sql security invoker set search_path=public as $$
  with proxima as (
    select id from public.agente_acordos_execucoes where status='pendente' and administradora=p_administradora
    and p_administradora in ('Lello','BBZ') order by created_at,id for update skip locked limit 1
  )
  update public.agente_acordos_execucoes e set status='em_execucao',etapa='coleta',iniciado_em=now(),worker_id=p_worker_id
  from proxima where e.id=proxima.id returning e.*;
$$;
revoke all on function public.reivindicar_agente_acordos_portal(uuid,text) from public,anon,authenticated;
grant execute on function public.reivindicar_agente_acordos_portal(uuid,text) to service_role;
commit;
