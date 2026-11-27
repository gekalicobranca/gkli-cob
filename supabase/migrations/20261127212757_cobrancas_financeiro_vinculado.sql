-- Vinculado conserva o débito e exclui a cota dos agregados gerais.
-- Não faz backfill: a classificação existente é aplicada em operação auditada,
-- depois da publicação dos consumidores que reconhecem o novo status.
alter table public.cobrancas
  add column if not exists status_financeiro_antes_vinculo text;

alter table public.cobrancas drop constraint if exists cobrancas_status_financeiro_check;
alter table public.cobrancas add constraint cobrancas_status_financeiro_check
  check (status_financeiro in ('em_aberto','parcial','quitado','vencido','renegociado','vinculado'));
alter table public.cobrancas add constraint cobrancas_financeiro_antes_vinculo_check
  check (status_financeiro_antes_vinculo is null or status_financeiro_antes_vinculo in ('em_aberto','parcial','vencido'));

comment on column public.cobrancas.status_financeiro_antes_vinculo is
  'Situação pendente anterior a Vinculado, para retorno ao fluxo sem presumir quitação. Valores e pagamentos não são alterados.';

create or replace function public.cobranca_classificar_financeiro_vinculado()
returns trigger language plpgsql set search_path = '' as $$
declare
  operacional text := coalesce(nullif(new.status_operacional,''),new.status);
begin
  if new.arquivada_em is not null or new.duplicada_de_id is not null then return new; end if;
  if operacional in ('judicializado','suspenso') and new.status_financeiro in ('em_aberto','parcial','vencido') then
    if tg_op='UPDATE' and old.status_financeiro='vinculado'
       and new.status_financeiro='em_aberto' and old.status_financeiro_antes_vinculo is not null then
      -- Um refresh de origem não desfaz um estado parcial/vencido já preservado.
      new.status_financeiro_antes_vinculo := old.status_financeiro_antes_vinculo;
    else
      new.status_financeiro_antes_vinculo := new.status_financeiro;
    end if;
    new.status_financeiro := 'vinculado';
  elsif new.status_financeiro='vinculado' then
    if operacional in ('judicializado','suspenso') then
      new.status_financeiro_antes_vinculo := coalesce(new.status_financeiro_antes_vinculo,'em_aberto');
    else
      new.status_financeiro := coalesce(new.status_financeiro_antes_vinculo,'em_aberto');
      new.status_financeiro_antes_vinculo := null;
    end if;
  else
    -- Quitado e renegociado continuam sendo estados financeiros distintos.
    new.status_financeiro_antes_vinculo := null;
  end if;
  return new;
end $$;

-- Depois dos classificadores operacionais e da proteção judicial já existentes.
create trigger zzzz_cobranca_financeiro_vinculado
before insert or update on public.cobrancas
for each row execute function public.cobranca_classificar_financeiro_vinculado();

create or replace function public.cobranca_auditar_financeiro_vinculado()
returns trigger language plpgsql set search_path = '' as $$
declare
  imagem_antes jsonb := null;
  evento jsonb;
  acao text;
  operacao text := coalesce(nullif(current_setting('gkli.operacao',true),''),txid_current()::text);
begin
  if tg_op='UPDATE' then
    if (old.status_financeiro,old.status_financeiro_antes_vinculo)
       is not distinct from (new.status_financeiro,new.status_financeiro_antes_vinculo) then return new; end if;
    if old.status_financeiro<>'vinculado' and new.status_financeiro<>'vinculado' then return new; end if;
    imagem_antes := to_jsonb(old);
  elsif new.status_financeiro<>'vinculado' then return new;
  end if;
  acao := case when new.status_financeiro='vinculado' then 'cobranca.financeiro_vinculado' else 'cobranca.financeiro_desvinculado' end;
  evento := jsonb_build_object('operacao',operacao,'regra','financeiro_vinculado_v1',
    'antes',imagem_antes,'depois',to_jsonb(new),
    'nota','Classificação financeira sem alteração de valor, recebimento ou vínculos de acordo. Valores vinculados ficam fora dos totais gerais.');
  insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,usuario_id,antes,depois,diferencas)
  values(new.carteira_id,'cobranca',new.id,acao,'Classificação financeira Vinculado',auth.uid(),imagem_antes,to_jsonb(new),
    jsonb_build_object('operacao',operacao,'regra','financeiro_vinculado_v1','status_financeiro_antes_vinculo',new.status_financeiro_antes_vinculo));
  insert into public.timeline_operacional(carteira_id,entidade_tipo,entidade_id,cobranca_id,condominio_id,unidade_id,
    evento_tipo,titulo,descricao,severidade,origem,usuario_id,payload)
  values(new.carteira_id,'cobranca',new.id,new.id,new.condominio_id,new.unidade_id,
    acao,'Classificação financeira Vinculado','Valores e pagamentos preservados; classificação com antes/depois.','info','sistema',auth.uid(),evento);
  return new;
end $$;

create trigger cobranca_auditar_financeiro_vinculado
after insert or update on public.cobrancas
for each row execute function public.cobranca_auditar_financeiro_vinculado();

revoke all on function public.cobranca_classificar_financeiro_vinculado() from public;
revoke all on function public.cobranca_auditar_financeiro_vinculado() from public;

-- O scanner também não deve tratar Vinculado como pendência financeira aberta.
create or replace function public.scanner_cobranca_aberta(b jsonb)
returns boolean language sql immutable set search_path = 'public' as $$
 select coalesce(b->>'status_financeiro','em_aberto') not in ('quitado','pago','paga','cancelado','cancelada','renegociado','renegociada','vinculado')
 and coalesce(b->>'status','') not in ('pago','paga','quitado','cancelado','cancelada','renegociado','renegociada','substituida')
 and (nullif(b->>'data_pagamento','') is null or b->>'status_financeiro'='parcial')
$$;

