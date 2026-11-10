alter table public.acordos add column if not exists quebra_confirmacao jsonb;
comment on column public.acordos.quebra_confirmacao is 'Confirmacao documental da administradora e do ajuste de pagamentos, saldo residual e cotas. Nao recalcula saldos.';
create or replace function public.validar_confirmacao_quebra_acordo()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.status in ('quebrado','rompido') and (TG_OP='INSERT' or old.status is distinct from new.status) then
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
revoke all on function public.validar_confirmacao_quebra_acordo() from public,anon;
create trigger acordo_exigir_confirmacao_quebra
before insert or update of status on public.acordos
for each row execute function public.validar_confirmacao_quebra_acordo();
