-- O serviço valida perfil e carteira antes de chamar esta operação.
create function public.easy_excluir_cobranca(p_id uuid, p_carteira uuid, p_motivo text, p_operador uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  c public.cobrancas%rowtype;
begin
  if length(trim(coalesce(p_motivo,''))) < 10 or p_operador is null then
    raise exception 'Informe o operador e um motivo de pelo menos 10 caracteres.';
  end if;
  select * into strict c from public.cobrancas where id=p_id and carteira_id=p_carteira for update;
  if c.arquivada_em is not null or c.duplicada_de_id is not null or c.data_pagamento is not null
    or coalesce(c.valor_pago,0) <> 0 or c.status_financeiro is distinct from 'em_aberto'
    or coalesce(c.status_operacional,c.status,'') not in ('novo','regular','em_cobranca_ativa','suspenso')
    or exists(select 1 from public.acordo_cobrancas where cobranca_id=p_id)
    or exists(select 1 from public.acordos where cobranca_id=p_id) then
    raise exception 'A situação atual da cobrança impede a exclusão.';
  end if;
  -- Não alterar a operação de comunicação ou conciliação pelo atalho de exclusão.
  if exists(select 1 from public.mensagens m where m.cobranca_id=p_id
      or coalesce(m.payload->'cobranca_ids','[]'::jsonb) ? p_id::text)
    or exists(select 1 from public.lote_itens where cobranca_id=p_id)
    or exists(select 1 from public.flow_progressao where p_id=any(cobranca_ids))
    or exists(select 1 from public.scanner_baixas where cobranca_id=p_id) then
    raise exception 'Cobrança com comunicação, flow ou conciliação vinculada exige revisão operacional antes da exclusão.';
  end if;
  update public.cobrancas set status='suspenso',status_operacional='suspenso',automacao_bloqueada=true where id=p_id;
  update public.cobrancas set arquivada_em=now(),arquivamento_motivo=trim(p_motivo)||' · Operador '||p_operador::text where id=p_id;
end $$;
revoke all on function public.easy_excluir_cobranca(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.easy_excluir_cobranca(uuid,uuid,text,uuid) to service_role;
