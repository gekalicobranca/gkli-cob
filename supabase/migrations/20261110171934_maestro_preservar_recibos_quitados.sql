-- Permite conciliar o valor da cota quitada com o recibo da captação sem
-- alterar seu estado, as parcelas pagas ou os vínculos com acordos.
do $migration$
declare
  fonte text := pg_get_functiondef('public.maestro_conciliar_cobrancas(uuid,timestamptz,jsonb,jsonb,boolean)'::regprocedure);
  filtro_financeiro text := $antigo$       or coalesce(anterior.status_financeiro,'') in ('quitado','pago','cancelado','baixado')$antigo$;
  filtro_operacional text := $antigo$       or coalesce(anterior.status_operacional,'') in ('quitado','pago','cancelado','baixado')$antigo$;
  filtro_parcela text := $antigo$          where p.cobranca_id=anterior.id and p.status='aberto' and p.data_vencimento=anterior.vencimento$antigo$;
begin
  if position(filtro_financeiro in fonte)=0 or position(filtro_operacional in fonte)=0
     or position(filtro_parcela in fonte)=0 then
    raise exception 'A conciliação do Maestro está fora da versão esperada.';
  end if;

  fonte := replace(fonte, filtro_financeiro, $novo$       or coalesce(anterior.status_financeiro,'') in ('cancelado','baixado')$novo$);
  fonte := replace(fonte, filtro_operacional, $novo$       or coalesce(anterior.status_operacional,'') in ('cancelado','baixado')
       or (
         (coalesce(anterior.status_financeiro,'') in ('quitado','pago')
          or coalesce(anterior.status_operacional,'') in ('quitado','pago'))
         and (
           select count(*) from jsonb_to_recordset(p_importadas) i(
             unidade_id uuid, vencimento date, recibo text, valor_original numeric
           )
           where i.unidade_id=anterior.unidade_id and i.vencimento=anterior.vencimento
             and round(i.valor_original,2)=round(coalesce(anterior.valor_original,anterior.valor_atualizado),2)
             and public.cobranca_recibo_identidade('Recibo '||i.recibo)=public.cobranca_recibo_identidade(anterior.observacoes)
         ) <> 1
       )$novo$);
  fonte := replace(fonte, filtro_parcela, filtro_parcela || $novo$
            and coalesce(anterior.status_financeiro,'') not in ('quitado','pago')
            and coalesce(anterior.status_operacional,'') not in ('quitado','pago')$novo$);
  execute fonte;
end
$migration$;
