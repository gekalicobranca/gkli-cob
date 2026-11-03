begin;
set local lock_timeout='5s';
alter table public.cobrancas
  add column arquivada_em timestamptz,
  add column arquivamento_motivo text,
  add constraint cobrancas_arquivo_operacional_completo check (
    (arquivada_em is null and arquivamento_motivo is null) or
    (arquivada_em is not null and length(trim(arquivamento_motivo))>=10 and automacao_bloqueada is true)
  );
comment on column public.cobrancas.arquivada_em is 'Retirada operacional auditada, sem excluir registros financeiros ou vínculos históricos.';
create index cobrancas_operacionais_sem_arquivo_idx on public.cobrancas(carteira_id,status_operacional,id)
where duplicada_de_id is null and arquivada_em is null;

create function public.proteger_arquivo_operacional_cobranca() returns trigger
language plpgsql set search_path='' as $$
begin
  if TG_OP='DELETE' then
    if old.arquivada_em is not null then raise exception 'Cobrança retirada preservada para histórico; exclusão proibida.'; end if;
    return old;
  end if;
  if TG_OP='UPDATE' and old.arquivada_em is not null and
    (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
    raise exception 'Cobrança retirada da operação: histórico protegido contra edição.';
  end if;
  if (TG_OP='INSERT' and new.arquivada_em is not null) or
     (TG_OP='UPDATE' and (new.arquivada_em is distinct from old.arquivada_em or new.arquivamento_motivo is distinct from old.arquivamento_motivo)) then
    if auth.uid() is not null or current_setting('role',true) in ('anon','authenticated') then
      raise exception 'Retirada operacional exige execução administrativa auditada.' using errcode='42501';
    end if;
    if new.arquivada_em is null or new.automacao_bloqueada is not true or coalesce(new.status_operacional,new.status) <> 'suspenso' then
      raise exception 'Retirada exige cobrança suspensa e automação bloqueada.';
    end if;
    if TG_OP='UPDATE' and
      (to_jsonb(new)-array['arquivada_em','arquivamento_motivo','updated_at']) is distinct from
      (to_jsonb(old)-array['arquivada_em','arquivamento_motivo','updated_at']) then
      raise exception 'Retirada não pode alterar valores, pagamentos ou demais campos.';
    end if;
  end if;
  return new;
end $$;
create trigger zzz_proteger_arquivo_operacional_cobranca before insert or update or delete on public.cobrancas
for each row execute function public.proteger_arquivo_operacional_cobranca();

create function public.auditar_arquivo_operacional_cobranca() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,usuario_nome,antes,depois,diferencas)
  values(new.carteira_id,'cobranca',new.id,'cobranca.arquivada','Cobrança retirada da operação',new.arquivamento_motivo,
    'Operação administrativa autorizada',to_jsonb(old),to_jsonb(new),
    jsonb_build_object('arquivada_em',jsonb_build_object('antes',old.arquivada_em,'depois',new.arquivada_em),
      'arquivamento_motivo',jsonb_build_object('antes',old.arquivamento_motivo,'depois',new.arquivamento_motivo)));
  return new;
end $$;
create trigger auditar_arquivo_operacional_cobranca after update of arquivada_em on public.cobrancas
for each row when(old.arquivada_em is null and new.arquivada_em is not null)
execute function public.auditar_arquivo_operacional_cobranca();
revoke all on function public.proteger_arquivo_operacional_cobranca(),public.auditar_arquivo_operacional_cobranca() from public,anon,authenticated;

create or replace view public.cobrancas_canonicas with(security_invoker=true) as
select * from public.cobrancas where duplicada_de_id is null and arquivada_em is null;
notify pgrst,'reload schema';
commit;
