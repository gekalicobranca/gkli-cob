begin;

-- O prazo de uso vale mesmo antes da próxima passagem da manutenção.
create function public.easy_cap_verificar_prazo() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'A prévia Easy Cap expirou. Leia o arquivo novamente.' using errcode='P0E01';
end $$;

create trigger easy_cap_prazo before update of status on public.conversoes_relatorio
for each row when (old.origem='easy_captacao' and old.status='preview'
  and old.preview_json#>>'{easyCaptacao,substituicao,protocolo}'='2'
  and new.status in ('concluido','concluido_com_alertas','processando')
  and old.atualizado_em <= statement_timestamp()-interval '7 days')
execute function public.easy_cap_verificar_prazo();

create function public.easy_flow_verificar_prazo() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.easy_flow_execucoes r where r.id=new.execucao_id and r.protocolo=3
    and r.status='preview' and r.parte=0 and r.created_at<=statement_timestamp()-interval '7 days') then
    raise exception 'A prévia Easy Flow expirou. Descarte o resumo e prepare outro.' using errcode='P0E01';
  end if;
  return new;
end $$;

create trigger easy_flow_prazo before update of montada_em on public.easy_flow_partes
for each row when (old.montada_em is null and new.montada_em is not null)
execute function public.easy_flow_verificar_prazo();

revoke all on function public.easy_cap_verificar_prazo(),public.easy_flow_verificar_prazo() from public,anon,authenticated;

-- Um lote e uma carteira por transação. A simulação retorna somente a contagem.
create function public.easy_expirar_previas(p_carteira uuid, p_tipo text, p_aplicar boolean default false, p_limite integer default 50)
returns integer language plpgsql security invoker set search_path='' set lock_timeout='3s' as $$
declare
  corte timestamptz := statement_timestamp() - interval '7 days';
  ids uuid[];
begin
  if p_carteira is null or p_tipo is null or p_tipo not in ('cap','flow')
    or p_aplicar is null or p_limite is null or p_limite not between 1 and 100 then
    raise exception 'Informe carteira, tipo e limite de 1 a 100.';
  end if;

  if p_tipo='cap' then
    if p_aplicar then
      lock table public.conversoes_relatorio in share row exclusive mode;
    end if;
    select array(select c.id from public.conversoes_relatorio c
      where c.carteira_id=p_carteira and c.origem='easy_captacao' and c.status='preview'
        and c.atualizado_em<=corte and c.limpeza_maestro_em is null
        and c.preview_json#>>'{easyCaptacao,substituicao,protocolo}'='2'
        and c.preview_json#>'{easyCaptacao,plano}' is not null
        and not exists(select 1 from public.easy_captacao_resultados x where x.conversao_id=c.id)
        and not exists(select 1 from public.cobrancas x where x.conversao_relatorio_id=c.id)
        and not exists(select 1 from public.cobranca_parcelas x where x.conversao_relatorio_id=c.id)
        and not exists(select 1 from public.captacao_historica_sindico x where x.conversao_relatorio_id=c.id)
      order by c.atualizado_em,c.id limit p_limite) into ids;
    if p_aplicar then
      update public.conversoes_relatorio c set status='cancelado', atualizado_em=statement_timestamp(),
        inconsistencias_json='[]', preview_json=jsonb_build_object('easyCaptacao',jsonb_build_object(
          'expiradaEm',statement_timestamp(),'operadorId',c.preview_json#>'{easyCaptacao,operadorId}',
          'arquivoSha256',c.preview_json#>'{easyCaptacao,arquivoSha256}','planoHash',c.preview_json#>'{easyCaptacao,planoHash}',
          'assinatura',c.preview_json#>'{easyCaptacao,assinatura}','substituicao',jsonb_build_object('protocolo',2)))
      where c.id=any(ids);
    end if;
  else
    if p_aplicar then perform public.easy_flow_travar(); end if;
    select array(select r.id from public.easy_flow_execucoes r
      where r.carteira_id=p_carteira and r.protocolo=3 and r.status in ('preview','cancelado')
        and (case when r.status='preview' then r.created_at else r.updated_at end)<=corte and r.parte=0 and r.liberadas=0 and r.mensagens=0 and cardinality(r.flow_ids)=0
        and jsonb_array_length(r.plano)>0
        and not exists(select 1 from public.easy_flow_partes p where p.execucao_id=r.id and
          (p.montada_em is not null or p.liberada_em is not null or p.flow_id is not null or p.lote_id is not null
           or cardinality(p.mensagem_ids)>0 or p.manifesto_hash is not null or p.artefatos_hash is not null
           or p.snapshot_liberacao is not null or p.liberada_por is not null or p.resultado_liberacao is not null))
        and not exists(select 1 from public.easy_flow_eventos e where e.execucao_id=r.id and
          (e.evento not in ('iniciada','resumo_descartado') or e.operacao_id is not null))
        and not exists(select 1 from public.cobranca_flows f where f.payload->>'easy_execucao_id'=r.id::text)
        and not exists(select 1 from public.lote_itens i where i.payload->>'easy_execucao_id'=r.id::text)
        and not exists(select 1 from public.mensagens m where m.payload->>'easy_execucao_id'=r.id::text)
      order by r.updated_at,r.id limit p_limite) into ids;
    if p_aplicar then
      delete from public.easy_flow_reservas where execucao_id=any(ids);
      -- Preserva a identidade (execucao_id,indice), o snapshot e todos os eventos.
      update public.easy_flow_partes set cobranca_ids='{}' where execucao_id=any(ids);
      update public.easy_flow_execucoes set status='cancelado',plano='[]',versoes='{}',
        resumo=jsonb_set(resumo,'{amostra}','[]') || jsonb_build_object('expiradaEm',statement_timestamp()), updated_at=statement_timestamp() where id=any(ids);
    end if;
  end if;
  return cardinality(ids);
end $$;

revoke all on function public.easy_expirar_previas(uuid,text,boolean,integer) from public,anon,authenticated,service_role;
grant execute on function public.easy_expirar_previas(uuid,text,boolean,integer) to service_role;
notify pgrst,'reload schema';
commit;
