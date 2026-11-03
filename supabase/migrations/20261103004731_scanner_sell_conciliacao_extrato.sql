begin;

-- SELL usa o extrato Webware homologado, preservando todos os critérios de
-- recibo, identidade, integralidade, data efetiva, exclusividade e auditoria.
-- A Graiche fornece somente conferência de acordos e continua sem baixa.
alter table public.scanner_baixas drop constraint scanner_baixas_portal_check;
alter table public.scanner_baixas add constraint scanner_baixas_portal_check
 check(portal in ('lello','manager','bbz','sell'));

do $$
declare src text;ancora text;
begin
 src:=pg_get_functiondef('public.scanner_conciliar_pagamentos(uuid)'::regprocedure);
 if position('s.portal in (''manager'',''bbz'')' in src)=0
 or position('when ''bbz'' then ''https://servc9.webware.com.br/bin/rt/gExtratoUnidade.asp'' end' in src)=0 then
  raise exception 'Conciliação financeira mudou; revisar antes de habilitar SELL.';
 end if;
 src:=replace(src,'s.portal in (''manager'',''bbz'')','s.portal in (''manager'',''bbz'',''sell'')');
 src:=replace(src,'when ''bbz'' then ''https://servc9.webware.com.br/bin/rt/gExtratoUnidade.asp'' end',
  'when ''bbz'' then ''https://servc9.webware.com.br/bin/rt/gExtratoUnidade.asp'' when ''sell'' then ''https://servc9.webware.com.br/bin/rt/gExtratoUnidade.asp'' end');
 ancora:='for d in select value from jsonb_array_elements(coalesce(e.dados->''pagamentos'',''[]'')) loop';
 if position(ancora in src)=0 then raise exception 'Âncora do extrato não encontrada.';end if;
 src:=replace(src,ancora,$guard$
    if s.portal='sell' and not exists(select 1 from public.unidades ux where ux.id=u and ux.condominio_id=c.id and ux.carteira_id=c.carteira_id
     and coalesce(e.dados->>'referencia_portal','') ~ '^[a-zA-Z0-9]+/[a-zA-Z0-9]+/[a-zA-Z0-9]+$'
     and coalesce(nullif(ltrim(upper(split_part(e.dados->>'referencia_portal','/',1)),'0'),''),'0')=coalesce(nullif(ltrim(upper(trim(ux.bloco)),'0'),''),'0')
     and coalesce(nullif(ltrim(upper(split_part(e.dados->>'referencia_portal','/',3)),'0'),''),'0')=coalesce(nullif(ltrim(upper(trim(ux.identificacao)),'0'),''),'0'))
     then raise exception 'Identidade financeira SELL diverge da unidade do app.';end if;
    $guard$||ancora);
 execute src;

 src:=pg_get_functiondef('public.scanner_aplicar_baixas(uuid)'::regprocedure);
 ancora:='s.portal=''manager'' and public.cobranca_recibo_arquivo(p.observacoes)';
 if position(ancora in src)=0 then raise exception 'Âncora da baixa não encontrada.';end if;
 src:=replace(src,ancora,'s.portal in (''manager'',''sell'') and public.cobranca_recibo_arquivo(p.observacoes)');
 src:=replace(src,'Recibo Manager diverge da parcela.','Recibo Webware diverge da parcela.');
 execute src;
end $$;

-- CREATE OR REPLACE preserva os grants existentes; não abre RPC ao cliente.
revoke all on function public.scanner_conciliar_pagamentos(uuid),public.scanner_aplicar_baixas(uuid) from public,anon,authenticated;
grant execute on function public.scanner_conciliar_pagamentos(uuid),public.scanner_aplicar_baixas(uuid) to service_role;
notify pgrst,'reload schema';
commit;
