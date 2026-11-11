create or replace function public.validar_confirmacao_quebra_acordo()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.status in ('quebrado','rompido') and (TG_OP='INSERT' or old.status is distinct from new.status) then
   if TG_OP = 'UPDATE'
     and new.fluxo_status in ('rompido_retomar_cobranca','rompido_suspender','rompido_pre_juridico','rompido_judicializar')
     and new.quebra_confirmacao->>'origem' = 'rompimento_assistido'
     and auth.uid() is not null
     and new.quebra_confirmacao->>'confirmado_por' = auth.uid()::text
     and not (public.acordo_homologado(old) and exists (
       select 1 from public.parcelas_acordo p where p.acordo_id = old.id
       and (p.data_pagamento is not null or lower(p.status) in ('paga','pago','quitada','quitado'))
     )) then
       return new;
   end if;
   if jsonb_typeof(new.quebra_confirmacao) is distinct from 'object'
     or length(trim(coalesce(new.quebra_confirmacao->>'referencia','')))<10
     or length(trim(coalesce(new.quebra_confirmacao->>'ajuste_financeiro_referencia','')))<10
     or new.quebra_confirmacao->>'pagamentos_conferidos' is distinct from 'true'
     or new.quebra_confirmacao->>'cotas_reconciliadas' is distinct from 'true'
     or nullif(new.quebra_confirmacao->>'confirmado_por','') is null
     or nullif(new.quebra_confirmacao->>'confirmado_em','') is null then
       raise exception 'Quebra exige confirmacao da administradora e conciliacao de pagamentos, saldo residual e cotas.';
   end if;
   if auth.uid() is not null and new.quebra_confirmacao->>'confirmado_por' is distinct from auth.uid()::text then
     raise exception 'Responsavel pela confirmacao diverge do usuario autenticado.' using errcode='42501';
   end if;
 end if;
 return new;
end $$;
