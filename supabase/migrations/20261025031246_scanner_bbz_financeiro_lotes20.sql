-- Histórico BBZ homologado; preserva horários, pausas, reserva e ausência de baixa.
create or replace function public.scanner_conciliar_pagamentos(p_evidencia uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare e public.scanner_evidencias;s public.scanner_configuracoes;c public.condominios;
 u uuid;n integer;alvo record;d jsonb;p jsonb;l jsonb;linhas jsonb:='[]';itens jsonb:='[]';resumo jsonb;
 resultado text:='processado';motivo text;estado text;fonte jsonb; candidatos jsonb;
 vinculos text[];recibo text; valor bigint; total integer; detalhe boolean;
begin
 select * into e from public.scanner_evidencias where id=p_evidencia for update;
 if not found or e.tipo<>'pagamentos' then raise exception 'Evidência financeira inexistente';end if;
 if e.conciliacao_status<>'pendente' then return jsonb_build_object('resultado',e.conciliacao_status,'reutilizado',true);end if;
 select * into s from public.scanner_configuracoes where id=e.configuracao_id;
 select * into c from public.condominios where id=s.condominio_id;
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
   if jsonb_array_length(linhas)>1000 then raise exception 'Fonte excede orçamento';end if;
   for l in select value from jsonb_array_elements(linhas) loop
    if coalesce(l->>'valor','') !~ '^[0-9]+$' or coalesce(l->>'pago','') !~ '^[0-9]+$' or nullif(l->>'vencimento','') is null then raise exception 'Valores ou datas inválidos';end if;
    perform (l->>'vencimento')::date;
    perform (l->>'valor')::bigint,(l->>'pago')::bigint;
    if nullif(l->>'numero','') is not null then perform (l->>'numero')::int;end if;
    if nullif(l->>'data','') is not null and (l->>'data')::date>(e.observado_em at time zone 'America/Sao_Paulo')::date then raise exception 'Pagamento futuro';end if;
   end loop;
  exception when data_exception or raise_exception then linhas:='[]';resultado:='fonte_inconclusiva';end;
  -- Somente itens que já existem no app, limitados a 200 por unidade.
  select (select count(*) from public.cobrancas b where b.unidade_id=u and b.condominio_id=c.id and b.carteira_id=c.carteira_id and b.duplicada_de_id is null)
    +(select count(*) from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id) into total;
  if total>200 then resultado:='limite_excedido';end if;
  if total<=200 then
   perform 1 from public.cobrancas b where b.unidade_id=u and b.condominio_id=c.id and b.carteira_id=c.carteira_id for share;
   perform 1 from public.acordos a where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id for share;
   perform 1 from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id for share of p;
   for alvo in
    select 'cobranca'::text tipo,b.id,null::uuid acordo_id,null::int numero,b.vencimento,round(b.valor_original*100)::bigint valor,round(coalesce(b.valor_atualizado,b.valor_original)*100)::bigint valor_pagamento,b.status,null::date data_pagamento,b.updated_at,b.observacoes
    from public.cobrancas b where b.unidade_id=u and b.condominio_id=c.id and b.carteira_id=c.carteira_id and b.duplicada_de_id is null
    union all
    select 'parcela',p.id,a.id,p.numero,p.vencimento,round(p.valor*100)::bigint,round(p.valor*100)::bigint,p.status,p.data_pagamento,p.updated_at,p.observacoes
    from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id
   loop
    estado:='inconclusivo';motivo:='Sem recebimento explícito compatível; ausência no portal não confirma pagamento.';fonte:=null;candidatos:='[]';
    recibo:=public.cobranca_recibo_arquivo(alvo.observacoes);vinculos:='{}';
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
       +(select count(*) from public.parcelas_acordo q join public.acordos a on a.id=q.acordo_id where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id and public.cobranca_recibo_arquivo(q.observacoes)=recibo) into n;
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
    itens:=itens||jsonb_build_array(jsonb_build_object('tipo',alvo.tipo,'id',alvo.id,'acordo_id',alvo.acordo_id,'resultado',estado,'motivo',motivo,'app',to_jsonb(alvo)-'observacoes','fonte',fonte,'baixa_permitida',false));
   end loop;
  end if;
  if total=0 then resultado:='sem_itens_no_app';end if;
 end if;
 select coalesce(jsonb_object_agg(chave,quantidade),'{}') into resumo from (select x->>'resultado' chave,count(*) quantidade from jsonb_array_elements(itens) x group by 1) contagens;
 insert into public.scanner_conciliacao_auditoria(evidencia_id,observado_em,unidade_id,resultado,resumo,itens) values(e.id,e.observado_em,u,resultado,resumo,itens) on conflict do nothing;
 update public.scanner_evidencias set conciliacao_status=resultado where id=e.id;
 return jsonb_build_object('resultado',resultado,'resumo',resumo,'itens',jsonb_array_length(itens),'baixa_permitida',false);
end $$;
revoke all on function public.scanner_conciliar_pagamentos(uuid) from public,anon,authenticated;
grant execute on function public.scanner_conciliar_pagamentos(uuid) to service_role;

-- Uma nova observação da mesma evidência renova a conferência, preservando seu hash e o histórico.
create or replace function public.scanner_concluir(p_token uuid,p_cursor integer,p_evidencias jsonb,p_erro boolean)
returns void language plpgsql security invoker set search_path=public as $$
declare c public.scanner_controle; s public.scanner_configuracoes; e jsonb;
begin
 if p_token is null then raise exception 'Token obrigatório'; end if;
 select * into c from public.scanner_controle where id for update;
 if c.token is distinct from p_token or c.reservado_ate <= now() then raise exception 'Reserva do scanner expirada'; end if;
 select * into s from public.scanner_configuracoes where id=c.configuracao_id for update;
 if p_cursor is null or p_evidencias is null or p_cursor < s.cursor or p_cursor > least(s.cursor+20,cardinality(s.unidades))
 or jsonb_typeof(p_evidencias)<>'array' or jsonb_array_length(p_evidencias)>40 then raise exception 'Lote inválido'; end if;
 for e in select value from jsonb_array_elements(p_evidencias) loop
   if not (e->>'unidade_portal'=any(s.unidades[s.cursor+1:p_cursor])) then raise exception 'Unidade fora do lote'; end if;
   insert into public.scanner_evidencias(configuracao_id,unidade_portal,tipo,dados,sha256)
   values(s.id,e->>'unidade_portal',e->>'tipo',e->'dados',e->>'sha256') on conflict(configuracao_id,unidade_portal,tipo,sha256) do update set
 observado_em=excluded.coletado_em,
 conciliacao_status=case when excluded.tipo='pagamentos' then 'pendente' else scanner_evidencias.conciliacao_status end;
 end loop;
 if (select count(distinct (value->>'unidade_portal',value->>'tipo')) from jsonb_array_elements(p_evidencias)) <> (p_cursor-s.cursor)*2 then
   raise exception 'Unidades incompletas: exigidas evidências de contatos e pagamentos';
 end if;
 update public.scanner_configuracoes set
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
end $$;

revoke all on function public.scanner_concluir(uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.scanner_concluir(uuid,integer,jsonb,boolean) to service_role;
