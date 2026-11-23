begin;

alter table public.agente_execucoes
  add column work_caso_id uuid references public.central_pendencias(id) on delete restrict,
  drop constraint agente_execucoes_status_check,
  add constraint agente_execucoes_status_check check (
    status in ('pendente','em_execucao','sucesso','falha','precisa_intervencao','cancelada','aguardando_work')
  ),
  add constraint agente_execucoes_work_check check (
    (status <> 'aguardando_work' or origem = 'work_github')
    and (origem <> 'work_github' or work_caso_id is not null)
  );

create unique index agente_execucoes_work_pendente
  on public.agente_execucoes (work_caso_id)
  where status = 'aguardando_work' and origem = 'work_github';

create function public.keila_work_anexar(
  p_execucao uuid, p_caso uuid, p_nome text, p_tipo text, p_sha text, p_tamanho bigint
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_exec public.agente_execucoes%rowtype;
  v_caso public.central_pendencias%rowtype;
  v_path text := p_execucao::text || '/' || p_sha || '.xlsx';
  v_id uuid;
begin
  select * into v_caso from public.central_pendencias
    where id = p_caso and tipo = 'keila_atendimento' for update;
  select * into v_exec from public.agente_execucoes
    where id = p_execucao and origem = 'work_github' and work_caso_id = p_caso for update;
  if v_caso.id is null or v_exec.id is null
    or v_caso.payload->>'execucao_id' is distinct from p_execucao::text
    or v_caso.carteira_id is distinct from v_exec.carteira_id
    or v_caso.condominio_id is distinct from v_exec.condominio_id then
    raise exception 'Execução fora do atendimento.';
  end if;

  if v_exec.status = 'sucesso' then
    select id into v_id from public.agente_arquivos
      where execucao_id = p_execucao and hash_arquivo = p_sha;
    if v_id is not null then return v_id; end if;
  end if;
  if v_exec.status <> 'aguardando_work' or v_caso.status in ('resolvida','cancelada')
    or v_caso.payload->>'estado' in ('atendimento_humano','concluido') then
    raise exception 'Atendimento indisponível para receber o relatório.';
  end if;
  if p_sha !~ '^[0-9a-f]{64}$' or p_tamanho not between 1 and 4000000 or not exists (
    select 1 from storage.objects o join storage.buckets b on b.id = o.bucket_id
    where b.id = 'agente-relatorios' and not b.public and o.name = v_path and o.metadata->>'size' = p_tamanho::text
  ) then
    raise exception 'Arquivo indisponível no armazenamento privado.';
  end if;

  insert into public.agente_arquivos
    (execucao_id, nome_arquivo, tipo_arquivo, storage_path, tamanho_bytes, hash_arquivo, status_validacao)
  values
    (p_execucao, p_nome, p_tipo, v_path, p_tamanho, p_sha, 'aguardando_validacao')
  returning id into v_id;
  update public.agente_execucoes set status = 'sucesso', finalizado_em = now(), erro_mensagem = null
    where id = p_execucao;
  insert into public.agente_logs (execucao_id, step, nivel, mensagem)
    values (p_execucao, 'work_retorno', 'info', 'Relatório do Work anexado ao atendimento, aguardando conferência.');
  return v_id;
end;
$$;

revoke all on function public.keila_work_anexar(uuid,uuid,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.keila_work_anexar(uuid,uuid,text,text,text,bigint) to service_role;
notify pgrst, 'reload schema';
commit;
