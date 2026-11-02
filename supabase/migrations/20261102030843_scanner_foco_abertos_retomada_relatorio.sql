-- Menos trabalho repetido, retomada de documentos e contagens por execução.
create function public.scanner_cobranca_aberta(b jsonb) returns boolean language sql immutable set search_path=public as $$
 select coalesce(b->>'status_financeiro','em_aberto') not in ('quitado','pago','paga','cancelado','cancelada','renegociado','renegociada')
 and coalesce(b->>'status','') not in ('pago','paga','quitado','cancelado','cancelada','renegociado','renegociada','substituida')
 and (nullif(b->>'data_pagamento','') is null or b->>'status_financeiro'='parcial')
$$;
create function public.scanner_parcela_aberta(p jsonb) returns boolean language sql immutable set search_path=public as $$
 select p->>'status' in ('aberta','vencida') and nullif(p->>'data_pagamento','') is null
$$;
alter table public.scanner_configuracoes add column financeiro_proxima_tentativa timestamptz,add column financeiro_falhas integer not null default 0;
create table public.scanner_historicos (
 configuracao_id uuid not null references public.scanner_configuracoes(id),unidade_portal text not null,
 visitados text[] not null,atualizado_em timestamptz not null default now(),primary key(configuracao_id,unidade_portal),
 check(cardinality(visitados)<=1000)
);
create table public.scanner_lotes (
 token uuid primary key,configuracao_id uuid not null references public.scanner_configuracoes(id),
 iniciado_em timestamptz not null,concluido_em timestamptz not null default now(),cursor_inicio int not null,cursor_fim int not null,
 falhou boolean not null,observacoes jsonb not null
);
create index scanner_lotes_data on public.scanner_lotes(concluido_em desc);
create index scanner_lotes_config on public.scanner_lotes(configuracao_id);
create table public.scanner_rechecagens_pagos (
 id uuid primary key default gen_random_uuid(),configuracao_id uuid not null references public.scanner_configuracoes(id),
 unidade_id uuid not null references public.unidades(id),evidencia_id uuid not null references public.scanner_evidencias(id),
 conferido_em timestamptz not null default now(),itens jsonb not null
);
create index scanner_rechecagens_unidade on public.scanner_rechecagens_pagos(configuracao_id,unidade_id,conferido_em desc);
create index scanner_rechecagens_evidencia on public.scanner_rechecagens_pagos(evidencia_id);
create index scanner_rechecagens_unit on public.scanner_rechecagens_pagos(unidade_id);

alter table public.scanner_historicos enable row level security;
revoke all on public.scanner_historicos from public,anon,authenticated,service_role;
grant select on public.scanner_historicos to authenticated,service_role;
create policy scanner_historicos_admin on public.scanner_historicos for select to authenticated using((select public.current_user_is_admin()));

alter table public.scanner_lotes enable row level security;
revoke all on public.scanner_lotes from public,anon,authenticated,service_role;
grant select on public.scanner_lotes to authenticated,service_role;
create policy scanner_lotes_admin on public.scanner_lotes for select to authenticated using((select public.current_user_is_admin()));

alter table public.scanner_rechecagens_pagos enable row level security;
revoke all on public.scanner_rechecagens_pagos from public,anon,authenticated,service_role;
grant select on public.scanner_rechecagens_pagos to authenticated,service_role;
create policy scanner_rechecagens_pagos_admin on public.scanner_rechecagens_pagos for select to authenticated using((select public.current_user_is_admin()));
grant insert,update,delete on public.scanner_historicos to service_role;
grant insert on public.scanner_lotes,public.scanner_rechecagens_pagos to service_role;
revoke all on function public.scanner_cobranca_aberta(jsonb),public.scanner_parcela_aberta(jsonb) from public,anon;
grant execute on function public.scanner_cobranca_aberta(jsonb),public.scanner_parcela_aberta(jsonb) to authenticated,service_role;
create function public.scanner_pago_rechecagem_pendente(p_configuracao uuid,p_unidade uuid,p_item uuid) returns boolean
language sql stable security invoker set search_path=public as $$
 select not exists(select 1 from public.scanner_rechecagens_pagos r where r.configuracao_id=p_configuracao and r.unidade_id=p_unidade and r.conferido_em>now()-interval '7 days' and r.itens @> jsonb_build_array(jsonb_build_object('id',p_item)))
$$;
revoke all on function public.scanner_pago_rechecagem_pendente(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.scanner_pago_rechecagem_pendente(uuid,uuid,uuid) to service_role;
CREATE OR REPLACE FUNCTION public.scanner_conciliar_pagamentos(p_evidencia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e public.scanner_evidencias;s public.scanner_configuracoes;c public.condominios;
 u uuid;n integer;alvo record;d jsonb;p jsonb;l jsonb;linhas jsonb:='[]';itens jsonb:='[]';resumo jsonb;
 audit_id uuid;v_baixa jsonb;resultado text:='processado';motivo text;estado text;fonte jsonb; candidatos jsonb;
 bbz_gp jsonb;bbz_p jsonb;bbz_v record;bbz_prova jsonb;vinculos text[];recibo text; valor bigint; total integer; detalhe boolean; rechecagem boolean:=false; pagos jsonb:='[]';
begin
 select * into e from public.scanner_evidencias where id=p_evidencia for update;
 if not found or e.tipo<>'pagamentos' then raise exception 'Evidência financeira inexistente';end if;
 if e.conciliacao_status<>'pendente' then return jsonb_build_object('resultado',e.conciliacao_status,'reutilizado',true);end if;
 select * into s from public.scanner_configuracoes where id=e.configuracao_id;
 select * into c from public.condominios where id=s.condominio_id;
 perform pg_advisory_xact_lock(hashtextextended(c.id::text,720));
 if not s.ativo or c.status<>'ativo' then return jsonb_build_object('resultado','pausado');end if;
 if e.observado_em<now()-interval '24 hours' or e.observado_em>now()+interval '5 minutes' then resultado:='evidencia_antiga';end if;
 if exists(select 1 from public.scanner_evidencias x where x.configuracao_id=e.configuracao_id and x.tipo='pagamentos' and x.unidade_portal=e.unidade_portal and (x.observado_em,x.id)>(e.observado_em,e.id)) then resultado:='superado';end if;
 if not(e.unidade_portal=any(s.unidades)) or e.dados->>'codigo' is distinct from s.codigo_portal or e.dados->>'unidade' is distinct from e.unidade_portal then resultado:='revisao_escopo';end if;
 if resultado='processado' then
  select count(*),min(x.id::text)::uuid into n,u from public.unidades x
  where x.condominio_id=c.id and x.carteira_id=c.carteira_id and (
   (s.portal<>'lello' and x.id::text=e.unidade_portal) or
   (s.portal='lello' and (
    (upper(trim(x.identificacao))=upper(e.unidade_portal) and coalesce(trim(x.bloco),'') in ('','0','00','000','SEM BLOCO')) or
    exists(select 1 from public.acordos_fontes_lello f where f.unidade_id=x.id and f.condominio_id=c.id and f.carteira_id=c.carteira_id and f.codigo_condominio=s.codigo_portal and f.fonte_json->>'unidade'=e.unidade_portal) or
    exists(select 1 from public.lello_vinculos_safira v join public.acordos a on a.id=v.acordo_id where a.unidade_id=x.id and a.condominio_id=c.id and a.carteira_id=c.carteira_id and v.unidade_externa=e.unidade_portal and v.revogado_em is null and s.codigo_portal='63004')
   ))
  );
  if n<>1 then resultado:='revisao_vinculo';u:=null;end if;
 end if;
 if resultado='processado' then
  -- Somente dados explícitos de recebimento; ausência no filtro nunca é pagamento.
  begin
   if s.portal='lello' and e.dados->>'status' is distinct from 'inconclusivo' then
    for d in select value from jsonb_array_elements(coalesce(e.dados->'recebimentos','[]')) loop
     if d->>'unidade' is distinct from e.unidade_portal or coalesce(d->>'acordo_externo','') !~ '^[0-9]+$'
      or split_part(d->>'fonte','?',1)<>'https://portal.lellocondominios.com.br/relatorios/Acordo.do'
      or (regexp_match(d->>'fonte','[?&]codCondo=([^&]+)'))[1] is distinct from s.codigo_portal
      or (regexp_match(d->>'fonte','[?&]codUnidade=([^&]+)'))[1] is distinct from e.unidade_portal
      or (regexp_match(d->>'fonte','[?&]codAcordo=([^&]+)'))[1] is distinct from d->>'acordo_externo' then raise exception 'Documento fora do escopo';end if;
     if d->>'tipo'='recebimento' then
      if nullif(d->>'recibo_consultado','') is null or (regexp_match(d->>'fonte','[?&]numrecibo=([^&]+)'))[1] is distinct from d->>'recibo_consultado' then raise exception 'Recibo sem origem única';end if;
      linhas:=linhas||jsonb_build_array(jsonb_build_object('tipo','parcela','acordo',d->>'acordo_externo','numero',d->'numero','recibo',d->>'recibo_consultado','vencimento',d->>'vencimento','data',d->>'data_pagamento','valor',d->'valor_original_centavos','pago',d->'valor_pago_centavos','confirmado',d->'confirmado_na_fonte','status',d->>'status','fonte',d->>'fonte','detalhe',true));
     elsif d->>'tipo'='acordo' then
      if (d->>'total_centavos')::bigint<>(d->>'pago_centavos')::bigint+(d->>'saldo_centavos')::bigint then raise exception 'Totais divergentes';end if;
      if (select sum((x->>'valor_centavos')::bigint) from jsonb_array_elements(d->'parcelas') x) is distinct from (d->>'total_centavos')::bigint
       or (select coalesce(sum((x->>'valor_centavos')::bigint)filter(where x->>'status'='Contabilizado'),0) from jsonb_array_elements(d->'parcelas') x) is distinct from (d->>'pago_centavos')::bigint then raise exception 'Parcelas divergentes';end if;
      for p in select value from jsonb_array_elements(d->'parcelas') loop
       linhas:=linhas||jsonb_build_array(jsonb_build_object('tipo','parcela','acordo',d->>'acordo_externo','vencimento',p->>'vencimento','data',p->>'data_pagamento','valor',p->'valor_centavos','pago',case when p->>'status'='Contabilizado' then p->'valor_centavos' else '0'::jsonb end,'confirmado',p->>'status'='Contabilizado','status',p->>'status','fonte',d->>'fonte','detalhe',false));
      end loop;
     end if;
    end loop;
   elsif s.portal in ('manager','bbz') and e.dados->>'status'='consultado' then
    if e.dados->>'fonte' is distinct from (case s.portal when 'manager' then 'https://atentum-s9.webware.com.br/bin/rt/gExtratoUnidade.asp' when 'bbz' then 'https://servc9.webware.com.br/bin/rt/gExtratoUnidade.asp' end) or nullif(e.dados->>'referencia_portal','') is null then raise exception 'Fonte financeira não validada';end if;
    for d in select value from jsonb_array_elements(coalesce(e.dados->'pagamentos','[]')) loop
     if d->>'componentes_conferidos' is distinct from 'true' then continue;end if;
     linhas:=linhas||jsonb_build_array(jsonb_build_object('tipo',case d->>'natureza' when 'cobranca' then 'cobranca' when 'parcela_acordo' then 'parcela' else 'indefinida' end,'recibo',d->>'recibo','numero',d->'numero_parcela','acordo',d->>'acordo_externo','vencimento',to_date(d->>'vencimento','DD/MM/YYYY')::text,'data',to_date(d->>'data_pagamento','DD/MM/YYYY')::text,'valor',d->'valor_original_centavos','pago',round((d->>'valor_pago')::numeric*100),'confirmado',true,'status','Contabilizado','fonte',e.dados->>'fonte','detalhe',true));
    end loop;
   end if;
   if s.portal='bbz' and e.dados->'vinculos_bbz' is not null then
    bbz_prova:=e.dados->'vinculos_bbz';
    if bbz_prova->>'referencia' is distinct from e.dados->>'referencia_portal' then raise exception 'Referência do acordo BBZ diverge';end if;
    perform public.scanner_bbz_vincular_recibos(c.id,u,bbz_prova);
    for bbz_gp in select value from jsonb_array_elements(bbz_prova->'processos') where value->>'completa'='true' loop
     for bbz_p in select value from jsonb_array_elements(bbz_gp->'parcelas') loop
      for bbz_v in select v.* from public.scanner_bbz_recibos_parcelas v where v.unidade_id=u and v.condominio_id=c.id and v.carteira_id=c.carteira_id and v.processo=bbz_gp->>'processo' and v.numero=(bbz_p->>'numero')::integer and v.quantidade=(bbz_gp->>'quantidade')::integer and v.revogado_em is null and public.scanner_bbz_recibo_parcela(v.parcela_id)=v.recibo loop
       linhas:=linhas||jsonb_build_array(jsonb_build_object('tipo','parcela','recibo',bbz_v.recibo,'numero',bbz_v.numero,'acordo',bbz_v.processo,'vencimento',bbz_p->>'vencimento','data',bbz_p->>'data_recebimento','valor',bbz_p->'valor','pago',bbz_p->'recebido','confirmado',((bbz_p->>'recebido')::bigint>0 and nullif(bbz_p->>'data_recebimento','') is not null),'status',case when (bbz_p->>'recebido')::bigint>0 and nullif(bbz_p->>'data_recebimento','') is not null then 'Contabilizado' else 'Pendente' end,'fonte',bbz_prova->>'fonte_grade','detalhe',true));
      end loop;
     end loop;
    end loop;
   end if;
   if jsonb_array_length(linhas)>1000 then raise exception 'Fonte excede orçamento';end if;
   for l in select value from jsonb_array_elements(linhas) loop
    if coalesce(l->>'valor','') !~ '^[0-9]+$' or coalesce(l->>'pago','') !~ '^[0-9]+$' or nullif(l->>'vencimento','') is null then raise exception 'Valores ou datas inválidos';end if;
    perform (l->>'vencimento')::date;
    perform (l->>'valor')::bigint,(l->>'pago')::bigint;
    if nullif(l->>'numero','') is not null then perform (l->>'numero')::int;end if;
    if nullif(l->>'data','') is not null and (l->>'data')::date>(e.observado_em at time zone 'America/Sao_Paulo')::date then raise exception 'Pagamento futuro';end if;
   end loop;
  exception when data_exception or raise_exception then linhas:='[]';resultado:='fonte_inconclusiva';end;
  -- Pagos: rechecagem semanal separada, sem passar pelo aplicador de baixas.
  rechecagem:=true;
  -- Orçamento diário só considera itens ainda em aberto.
  select (select count(*) from public.cobrancas b where b.unidade_id=u and b.condominio_id=c.id and b.carteira_id=c.carteira_id and b.duplicada_de_id is null and public.scanner_cobranca_aberta(to_jsonb(b)))
    +(select count(*) from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id and public.scanner_parcela_aberta(to_jsonb(p.*))) into total;
  if total>200 then resultado:='limite_excedido';end if;
  if total<=200 then
   perform 1 from public.cobrancas b where b.unidade_id=u and b.condominio_id=c.id and b.carteira_id=c.carteira_id for share;
   perform 1 from public.acordos a where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id for share;
   perform 1 from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id for share of p;
   for alvo in
    select 'cobranca'::text tipo,b.id,null::uuid acordo_id,null::int numero,b.vencimento,round(b.valor_original*100)::bigint valor,round(coalesce(b.valor_atualizado,b.valor_original)*100)::bigint valor_pagamento,b.status,b.data_pagamento,b.updated_at,b.observacoes,public.scanner_cobranca_aberta(to_jsonb(b)) em_aberto,b.status_financeiro
    from public.cobrancas b where b.unidade_id=u and b.condominio_id=c.id and b.carteira_id=c.carteira_id and b.duplicada_de_id is null and (public.scanner_cobranca_aberta(to_jsonb(b)) or (rechecagem and (b.status_financeiro='quitado' or b.status in ('paga','pago','quitado')) and public.scanner_pago_rechecagem_pendente(s.id,u,b.id)))
    union all
    select 'parcela',p.id,a.id,p.numero,p.vencimento,round(p.valor*100)::bigint,round(p.valor*100)::bigint,p.status,p.data_pagamento,p.updated_at,p.observacoes,public.scanner_parcela_aberta(to_jsonb(p.*)),null::text
    from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id and (public.scanner_parcela_aberta(to_jsonb(p.*)) or (rechecagem and p.status='paga' and public.scanner_pago_rechecagem_pendente(s.id,u,p.id)))
    order by em_aberto desc,tipo,id limit 250
   loop
    estado:='inconclusivo';motivo:='Sem recebimento explícito compatível; ausência no portal não confirma pagamento.';fonte:=null;candidatos:='[]';
    recibo:=case when s.portal='bbz' and alvo.tipo='parcela' then public.scanner_bbz_recibo_parcela(alvo.id) else public.cobranca_recibo_arquivo(alvo.observacoes) end;vinculos:='{}';
    if alvo.tipo='parcela' and s.portal='lello' then
     select array_agg(distinct ref) into vinculos from (
      select f.numero_acordo ref from public.acordos_fontes_lello f where f.acordo_id=alvo.acordo_id and f.codigo_condominio=s.codigo_portal and f.unidade_id=u and f.condominio_id=c.id and f.carteira_id=c.carteira_id
      union select v.acordo_externo from public.lello_vinculos_safira v where v.acordo_id=alvo.acordo_id and v.unidade_externa=e.unidade_portal and v.revogado_em is null and s.codigo_portal='63004'
     ) refs;
     select coalesce(jsonb_agg(x),'[]') into candidatos from jsonb_array_elements(linhas) x where x->>'tipo'='parcela' and x->>'acordo'=any(vinculos) and x->>'vencimento'=alvo.vencimento::text and (nullif(x->>'numero','') is null or (x->>'numero')::int=alvo.numero);
     if coalesce(cardinality(vinculos),0)=0 then motivo:='Acordo sem vínculo externo homologado.';end if;
    elsif s.portal in ('manager','bbz') and recibo is not null then
     select coalesce(jsonb_agg(x),'[]') into candidatos from jsonb_array_elements(linhas) x where x->>'tipo'=alvo.tipo and x->>'recibo'=recibo;
    end if;
    -- Resumo e recibo detalhado do mesmo acordo não são dois recebimentos.
    if exists(select 1 from jsonb_array_elements(candidatos) x where x->>'detalhe'='true') then
     select jsonb_agg(x) into candidatos from jsonb_array_elements(candidatos) x where x->>'detalhe'='true';
    end if;
    n:=jsonb_array_length(candidatos);
    if n>1 then estado:='ambiguo';motivo:='Mais de um recebimento corresponde ao item; revisão necessária.';
    elsif n=1 then
     fonte:=candidatos->0;
     -- Nenhuma coincidência de valor/data sozinha autoriza o vínculo.
     if s.portal in ('manager','bbz') then
      select (select count(*) from public.cobrancas q where q.unidade_id=u and q.condominio_id=c.id and q.carteira_id=c.carteira_id and q.duplicada_de_id is null and public.cobranca_recibo_arquivo(q.observacoes)=recibo)
       +(select count(*) from public.parcelas_acordo q join public.acordos a on a.id=q.acordo_id where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id and (case when s.portal='bbz' then coalesce(public.cobranca_recibo_arquivo(q.observacoes),public.scanner_bbz_recibo_parcela(q.id)) else public.cobranca_recibo_arquivo(q.observacoes) end)=recibo) into n;
     elsif alvo.tipo='parcela' then
      select count(*) into n from public.parcelas_acordo q where q.acordo_id=alvo.acordo_id and q.vencimento=alvo.vencimento and round(q.valor*100)::bigint=alvo.valor;
      if (select count(distinct aid) from (
       select f.acordo_id aid from public.acordos_fontes_lello f where f.codigo_condominio=s.codigo_portal and f.numero_acordo=fonte->>'acordo' and f.unidade_id=u and f.condominio_id=c.id and f.carteira_id=c.carteira_id
       union select v.acordo_id from public.lello_vinculos_safira v join public.acordos a on a.id=v.acordo_id where s.codigo_portal='63004' and v.acordo_externo=fonte->>'acordo' and v.unidade_externa=e.unidade_portal and v.revogado_em is null and a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id
      ) refs)<>1 then n:=0;end if;
     end if;
     if n<>1 then estado:='ambiguo';motivo:='Identidade financeira duplicada no app.';
     elsif alvo.status in ('cancelada','cancelado','renegociada','renegociado','substituida') then estado:='revisao';motivo:='Item encerrado ou substituído no app.';
     elsif fonte->>'vencimento' is distinct from alvo.vencimento::text or (fonte->>'valor')::bigint is distinct from alvo.valor then estado:='divergente';motivo:='Vencimento ou valor original diverge do app.';
     elsif alvo.tipo='parcela' and nullif(fonte->>'numero','') is not null and (fonte->>'numero')::int<>alvo.numero then estado:='divergente';motivo:='Número da parcela diverge da fonte.';
     elsif fonte->>'confirmado' is distinct from 'true' or fonte->>'status' is distinct from 'Contabilizado' or nullif(fonte->>'data','') is null or (fonte->>'pago')::bigint<=0 then motivo:='Fonte não confirma recebimento contabilizado com data e valor positivo.';
     elsif (fonte->>'pago')::bigint<>alvo.valor_pagamento then estado:='divergente';motivo:='Recebimento parcial ou com valor diferente; não valida quitação integral.';
     elsif alvo.data_pagamento is not null and alvo.data_pagamento::text<>fonte->>'data' then estado:='divergente';motivo:='Data de pagamento do app diverge da fonte.';
     else estado:='validado';motivo:='Pagamento integral identificado na fonte e conciliado com vínculo único, vencimento e valor do app.';end if;
    end if;
    if not alvo.em_aberto and jsonb_array_length(pagos)>=50 then continue;end if;
    itens:=itens||jsonb_build_array(jsonb_build_object('tipo',alvo.tipo,'id',alvo.id,'acordo_id',alvo.acordo_id,'resultado',estado,'motivo',motivo,'app',to_jsonb(alvo)-'observacoes','fonte',fonte,'baixa_automatica_elegivel',estado='validado' and alvo.em_aberto));
    if not alvo.em_aberto then pagos:=pagos||jsonb_build_array(itens->-1);itens:=itens-(-1);end if;
   end loop;
  end if;
  if jsonb_array_length(pagos)>0 then
   insert into public.scanner_rechecagens_pagos(configuracao_id,unidade_id,evidencia_id,itens) values(s.id,u,e.id,pagos);
  end if;
  if total=0 and resultado='processado' then resultado:='sem_itens_em_aberto';end if;
 end if;
 select coalesce(jsonb_object_agg(chave,quantidade),'{}') into resumo from (select x->>'resultado' chave,count(*) quantidade from jsonb_array_elements(itens) x group by 1) contagens;
 insert into public.scanner_conciliacao_auditoria(evidencia_id,observado_em,unidade_id,resultado,resumo,itens) values(e.id,e.observado_em,u,resultado,resumo,itens) on conflict do nothing returning id into audit_id;
 update public.scanner_evidencias set conciliacao_status=resultado where id=e.id;
 if audit_id is not null then v_baixa:=public.scanner_aplicar_baixas(audit_id);else v_baixa:=jsonb_build_object('resultado','observacao_ja_auditada','aplicadas',0);end if;
 return jsonb_build_object('resultado',resultado,'resumo',resumo,'itens',jsonb_array_length(itens),'rechecagens_pagos',jsonb_array_length(pagos),'baixa_automatica',true,'baixa',v_baixa);
end $function$;

CREATE OR REPLACE FUNCTION public.scanner_analise_reivindicar(p_token uuid, p_autorizacao uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e public.scanner_evidencias;s public.scanner_configuracoes;c public.condominios;a public.scanner_analises;
 u uuid;entrada jsonb;minutos int;v_dia date:=(now() at time zone 'America/Sao_Paulo')::date;usos int;extra boolean:=false;limite_extra int;
begin
 if p_token is null then raise exception 'Token obrigatório';end if;
 minutos:=extract(hour from now() at time zone 'America/Sao_Paulo')::int*60+extract(minute from now() at time zone 'America/Sao_Paulo')::int;
 if p_autorizacao is null and (minutos<30 or minutos>=325) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('scanner_interpretacao',726));
 insert into public.scanner_ia_orcamento values(v_dia,0) on conflict do nothing;
 select chamadas into usos from public.scanner_ia_orcamento o where o.dia=v_dia for update;
 if p_autorizacao is not null then
  select ex.limite into limite_extra from public.scanner_ia_extras ex join public.scanner_lotes_manuais m on m.token=ex.token
  where ex.token=p_autorizacao and m.iniciado_em is not null and m.encerrado_em is null and m.expira_em>now() for update of ex;
  extra:=found;
 end if;
 if extra then
  select chamadas into usos from public.scanner_ia_extras where token=p_autorizacao;
  if usos>=limite_extra then return null;end if;
 elsif usos>=20 then return null;end if;
 select x.* into e from public.scanner_evidencias x join public.scanner_configuracoes cfg on cfg.id=x.configuracao_id join public.condominios d on d.id=cfg.condominio_id
 where x.tipo='pagamentos' and cfg.ativo and d.status='ativo' and x.observado_em>=now()-interval '24 hours' and x.observado_em<=now()
 and x.dados->>'codigo'=cfg.codigo_portal and x.dados->>'unidade'=x.unidade_portal and x.unidade_portal=any(cfg.unidades)
 and (p_autorizacao is null or exists(select 1 from public.scanner_lotes_manuais m where m.token=p_autorizacao and m.configuracao_id=cfg.id and m.iniciado_em is not null and m.encerrado_em is null and m.expira_em>now() and x.unidade_portal=any(m.unidades)))
 and (
 exists(select 1 from jsonb_array_elements(coalesce(x.dados->'recebimentos','[]')) doc where nullif(doc->>'acordo_externo','') is not null or nullif(doc->>'recibo_consultado','') is not null)
 or exists(select 1 from jsonb_array_elements(coalesce(x.dados->'pagamentos','[]')) doc where nullif(doc->>'recibo','') is not null)
 or exists(select 1 from jsonb_array_elements(coalesce(x.dados->'leitura_auxiliar'->'tabelas','[]')) t where jsonb_array_length(coalesce(t->'linhas','[]'))>0)
 )
 and exists(select 1 from public.scanner_conciliacao_auditoria ca where ca.evidencia_id=x.id and ca.observado_em=x.observado_em and exists(select 1 from jsonb_array_elements(ca.itens) j where j->>'resultado'<>'validado'))
 and not exists(select 1 from public.scanner_evidencias nova where nova.configuracao_id=x.configuracao_id and nova.tipo=x.tipo and nova.unidade_portal=x.unidade_portal and (nova.observado_em,nova.id)>(x.observado_em,x.id))
 and not exists(select 1 from public.scanner_analises an where an.evidencia_id=x.id and an.observado_em=x.observado_em and an.versao='interpretacao-v1' and (an.estado in ('concluida','superada') or an.tentativas>=3 or an.reservado_ate>now() or an.proxima_tentativa>now()))
 order by x.observado_em desc,x.id limit 1 for update of x skip locked;
 if not found then return null;end if;
 select * into s from public.scanner_configuracoes where id=e.configuracao_id;
 select * into c from public.condominios where id=s.condominio_id;
 select ca.unidade_id into u from public.scanner_conciliacao_auditoria ca where ca.evidencia_id=e.id and ca.observado_em=e.observado_em order by ca.conferido_em desc limit 1;
 if not exists(select 1 from public.unidades where id=u and condominio_id=c.id and carteira_id=c.carteira_id) then u:=null;end if;
 entrada:=jsonb_build_object('portal',s.portal,'codigo',s.codigo_portal,'unidade_portal',e.unidade_portal,'evidencia_sha256',e.sha256,'observado_em',e.observado_em,'dados',e.dados,
 'prioridade_humana',exists(select 1 from public.central_pendencias cp where cp.condominio_id=c.id and cp.unidade_id=u and cp.status not in ('resolvida','cancelada') and cp.payload->>'estado' in ('atendimento_humano','revisao_identidade')),
 'judicial',coalesce((select acao_judicial from public.unidades where id=u),true),
 'cobrancas',coalesce((select jsonb_agg(t) from(select b.id,b.vencimento,round(b.valor_original*100)::bigint valor_centavos,b.status_financeiro,b.status_operacional,b.automacao_bloqueada,b.updated_at,public.cobranca_recibo_arquivo(b.observacoes) recibo from public.cobrancas b where b.unidade_id=u and b.condominio_id=c.id and b.carteira_id=c.carteira_id and public.scanner_cobranca_aberta(to_jsonb(b)) order by b.vencimento desc,b.id limit 40)t),'[]'),
 'acordos',coalesce((select jsonb_agg(t) from(select aa.id,aa.status,aa.tipo,aa.updated_at,aa.quantidade_parcelas,round(aa.valor_acordado*100)::bigint total_centavos,
  (select jsonb_agg(jsonb_build_object('id',pp.id,'numero',pp.numero,'vencimento',pp.vencimento,'valor_centavos',round(pp.valor*100)::bigint,'status',pp.status,'data_pagamento',pp.data_pagamento) order by pp.numero,pp.id) from public.parcelas_acordo pp where pp.acordo_id=aa.id) parcelas
 from public.acordos aa where aa.unidade_id=u and aa.condominio_id=c.id and aa.carteira_id=c.carteira_id order by aa.id limit 15)t),'[]'));
 insert into public.scanner_analises(evidencia_id,configuracao_id,condominio_id,unidade_id,observado_em,evidencia_sha256,estado,token,reservado_ate,entrada)
 values(e.id,s.id,c.id,u,e.observado_em,e.sha256,'em_execucao',p_token,now()+interval '90 seconds',entrada)
 on conflict(evidencia_id,observado_em,versao) do update set estado='em_execucao',token=p_token,reservado_ate=excluded.reservado_ate,tentativas=scanner_analises.tentativas+1,entrada=excluded.entrada returning * into a;
 if extra then update public.scanner_ia_extras set chamadas=chamadas+1 where token=p_autorizacao;
 else update public.scanner_ia_orcamento o set chamadas=chamadas+1 where o.dia=v_dia;end if;
 return jsonb_build_object('id',a.id,'token',p_token,'entrada',entrada);
end $function$;

CREATE OR REPLACE FUNCTION public.scanner_concluir(p_token uuid, p_cursor integer, p_evidencias jsonb, p_erro boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare c public.scanner_controle; s public.scanner_configuracoes; e jsonb; parcial boolean; fim integer; acesso text;
begin
 if p_token is null then raise exception 'Token obrigatório'; end if;
 select * into c from public.scanner_controle where id for update;
 if c.token is distinct from p_token or c.reservado_ate <= now() then raise exception 'Reserva do scanner expirada'; end if;
 select * into s from public.scanner_configuracoes where id=c.configuracao_id for update;
 if p_cursor is null or p_evidencias is null or p_cursor < s.cursor or p_cursor > least(s.cursor+20,cardinality(s.unidades))
 or jsonb_typeof(p_evidencias)<>'array' or jsonb_array_length(p_evidencias)>40 then raise exception 'Lote inválido'; end if;
 parcial:=exists(select 1 from jsonb_array_elements(p_evidencias) j where j->>'tipo'='pagamentos' and j->'dados'->'historico_progresso'->>'pendente'='true');
 fim:=p_cursor+case when parcial then 1 else 0 end;
 if fim>least(s.cursor+20,cardinality(s.unidades)) then raise exception 'Lote inválido';end if;
 if parcial and not exists(select 1 from jsonb_array_elements(p_evidencias) j where j->>'tipo'='pagamentos' and j->>'unidade_portal'=s.unidades[fim] and j->'dados'->'historico_progresso'->>'pendente'='true') then raise exception 'Retomada fora do cursor';end if;
 for e in select value from jsonb_array_elements(p_evidencias) loop
   if not (e->>'unidade_portal'=any(s.unidades[s.cursor+1:fim])) then raise exception 'Unidade fora do lote'; end if;
   insert into public.scanner_evidencias(configuracao_id,unidade_portal,tipo,dados,sha256)
   values(s.id,e->>'unidade_portal',e->>'tipo',e->'dados',e->>'sha256') on conflict(configuracao_id,unidade_portal,tipo,sha256) do update set
 observado_em=excluded.coletado_em,
 conciliacao_status=case when excluded.tipo='pagamentos' then 'pendente' else scanner_evidencias.conciliacao_status end;
   if e->>'tipo'='pagamentos' and s.portal='lello' then
   if e->'dados'->'historico_progresso'->>'pendente'='true' then
    insert into public.scanner_historicos(configuracao_id,unidade_portal,visitados)
    values(s.id,e->>'unidade_portal',array(select jsonb_array_elements_text(e->'dados'->'historico_progresso'->'visitados')))
    on conflict(configuracao_id,unidade_portal) do update set visitados=excluded.visitados,atualizado_em=now();
   elsif e->'dados' ? 'historico_progresso' then
    delete from public.scanner_historicos where configuracao_id=s.id and unidade_portal=e->>'unidade_portal';
   end if;
  end if;
 end loop;
 if (select count(distinct (value->>'unidade_portal',value->>'tipo')) from jsonb_array_elements(p_evidencias)) <> (fim-s.cursor)*2 then
   raise exception 'Unidades incompletas: exigidas evidências de contatos e pagamentos';
 end if;
 insert into public.scanner_lotes(token,configuracao_id,iniciado_em,cursor_inicio,cursor_fim,falhou,observacoes)
 values(p_token,s.id,c.reservado_ate-interval '5 minutes',s.cursor,p_cursor,p_erro,
 (select coalesce(jsonb_agg(jsonb_build_object('unidade',j->>'unidade_portal','diagnostico',j->'dados'->>'diagnostico','status',j->'dados'->>'status','parcial',j->'dados'->'historico_progresso'->'pendente')),'[]')
 from jsonb_array_elements(p_evidencias) j where j->>'tipo'='pagamentos'));
 acesso:=case
 when exists(select 1 from jsonb_array_elements(p_evidencias) j where j->>'tipo'='pagamentos' and j->'dados'->>'diagnostico'='sem_acesso') then 'sem_acesso'
 when exists(select 1 from jsonb_array_elements(p_evidencias) j where j->>'tipo'='pagamentos' and j->'dados'->>'status'='consultado') then 'consultado' end;
 update public.scanner_configuracoes set
 financeiro_proxima_tentativa=case when acesso='sem_acesso' then now()+interval '6 hours'*power(4,least(financeiro_falhas,2)) when acesso='consultado' then null else financeiro_proxima_tentativa end,
 financeiro_falhas=case when acesso='sem_acesso' then financeiro_falhas+1 when acesso='consultado' then 0 else financeiro_falhas end,
 retomada_prioritaria_ate=case when p_cursor>s.cursor and not p_erro then null else retomada_prioritaria_ate end,
 cursor=case when p_cursor=cardinality(unidades) then 0 else p_cursor end,
 falhas=case when p_erro then falhas+1 else 0 end,
 ativo=ativo and not(p_erro and falhas>=2),
 proxima_execucao=now()+case when p_erro then interval '30 minutes' * power(2,least(falhas,3))
 when p_cursor=cardinality(unidades) then interval '24 hours' else interval '15 minutes' end,
 ultimo_resultado=case when p_erro then 'Falha no portal; lote interrompido. Após três falhas, reativar após revisão.'
 when p_cursor=s.cursor then 'Lote adiado sem coleta; verificar pausa ou outro coletor em execução.'
 else 'Evidências coletadas; disponíveis para conferência.' end
 where id=s.id;
 update public.scanner_controle set token=null,reservado_ate=null,configuracao_id=null,
 proxima_execucao=now()+interval '15 minutes' where id;
end $function$;

-- Somente referências já homologadas de itens abertos da unidade; sem importar cobranças.
create function public.scanner_alvos_lello(p_configuracao uuid) returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_object_agg(unidade,jsonb_build_object('acordos',acordos,'recibos',recibos)),'{}') from (
 select e.unidade,
 coalesce((select jsonb_agg(distinct f.numero_acordo) from public.acordos_fontes_lello f
 join public.parcelas_acordo p on p.acordo_id=f.acordo_id
 where f.condominio_id=s.condominio_id and f.codigo_condominio=s.codigo_portal and f.fonte_json->>'unidade'=e.unidade and public.scanner_parcela_aberta(to_jsonb(p.*))),'[]') acordos,
 coalesce((select jsonb_agg(distinct public.cobranca_recibo_arquivo(b.observacoes)) from public.cobrancas b join public.unidades u on u.id=b.unidade_id
 where b.condominio_id=s.condominio_id and u.identificacao=e.unidade and coalesce(trim(u.bloco),'') in ('','0','00','000','SEM BLOCO') and public.scanner_cobranca_aberta(to_jsonb(b)) and public.cobranca_recibo_arquivo(b.observacoes) is not null),'[]') recibos
 from public.scanner_configuracoes s cross join lateral unnest(s.unidades) e(unidade) where s.id=p_configuracao and s.portal='lello'
 ) alvos
$$;
revoke all on function public.scanner_alvos_lello(uuid) from public,anon,authenticated;
grant execute on function public.scanner_alvos_lello(uuid) to service_role;

create function public.scanner_resumo_dia(p_dia date default (now() at time zone 'America/Sao_Paulo')::date) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare inicio timestamptz:=p_dia::timestamp at time zone 'America/Sao_Paulo';fim timestamptz:=(p_dia+1)::timestamp at time zone 'America/Sao_Paulo'; r jsonb;
begin
 if current_user<>'service_role' and not public.current_user_is_admin() then raise exception 'Administrador obrigatório';end if;
 with cad as (select * from public.scanner_cadastro_auditoria where atualizado_em>=inicio and atualizado_em<fim),
 campos as (
 select a.evidencia_id,k,
 coalesce(a.antes->'unidade'->>k,'') antes,coalesce(a.depois->'unidade'->>k,'') depois
 from cad a cross join unnest(array['responsavel_nome','responsavel_documento','telefone','email']) k where a.resultado='atualizado'
 ), lotes as (select * from public.scanner_lotes where concluido_em>=inicio and concluido_em<fim),
 conferencias as (select * from public.scanner_conciliacao_auditoria where conferido_em>=inicio and conferido_em<fim),
 itens as (
 select j,case
 when a.resultado in ('fonte_inconclusiva','revisao_escopo','revisao_vinculo') then 'revisao'
 when j->>'resultado' in ('divergente','ambiguo','revisao') then 'revisao'
 when e.dados->>'diagnostico' in ('sem_acesso','acesso_adiado') then 'sem_acesso'
 when j->>'resultado'='validado' then 'validado'
 when j->>'motivo' ilike '%vínculo%' then 'revisao'
 else 'sem_correspondencia' end categoria
 from conferencias a join public.scanner_evidencias e on e.id=a.evidencia_id cross join lateral jsonb_array_elements(a.itens) j
 )
 select jsonb_build_object(
 'dia',p_dia,'lotes',(select count(*) from lotes),'unidades_consultadas',(select coalesce(sum(jsonb_array_length(observacoes)),0) from lotes),
 'cadastros_atualizados',(select count(*) from cad where resultado='atualizado'),
 'campos_preenchidos',(select count(*) from campos where trim(antes)='' and trim(depois)<>''),
 'campos_corrigidos',(select count(*) from campos where trim(antes)<>'' and antes<>depois and
 case when k in ('telefone','responsavel_documento') then regexp_replace(antes,'[^0-9]','','g')<>regexp_replace(depois,'[^0-9]','','g')
 else lower(regexp_replace(trim(antes),'\s+',' ','g'))<>lower(regexp_replace(trim(depois),'\s+',' ','g')) end),
 'campos_formatados',(select count(*) from campos where antes<>depois and trim(antes)<>'' and
 case when k in ('telefone','responsavel_documento') then regexp_replace(antes,'[^0-9]','','g')=regexp_replace(depois,'[^0-9]','','g')
 else lower(regexp_replace(trim(antes),'\s+',' ','g'))=lower(regexp_replace(trim(depois),'\s+',' ','g')) end),
 'baixas',(select count(*) from public.scanner_baixas where confirmado_em>=inicio and confirmado_em<fim),
 'itens_abertos_verificados',(select count(*) from itens),
 'itens_sem_acesso',(select count(*) from itens where categoria='sem_acesso'),
 'itens_sem_correspondencia',(select count(*) from itens where categoria='sem_correspondencia'),
 'itens_para_revisao',(select count(*) from itens where categoria='revisao'),
 'itens_validados',(select count(*) from itens where categoria='validado'),
 'rechecagens_pagos',(select coalesce(sum(jsonb_array_length(itens)),0) from public.scanner_rechecagens_pagos where conferido_em>=inicio and conferido_em<fim),
 'ia_concluidas',(select count(*) from public.scanner_analises where concluido_em>=inicio and concluido_em<fim and resultado->>'ia_status'='analisada'),
 'historicos_parciais',(select count(*) from lotes l cross join lateral jsonb_array_elements(l.observacoes) o where o->>'parcial'='true'),
 'medicao_lotes_desde',(select min(concluido_em) from public.scanner_lotes)
 ) into r;
 return r;
end $$;
revoke all on function public.scanner_resumo_dia(date) from public,anon;
grant execute on function public.scanner_resumo_dia(date) to authenticated,service_role;
