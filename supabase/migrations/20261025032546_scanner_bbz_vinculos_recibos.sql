-- Vínculo de identidade somente. Não altera parcelas, acordos, cobranças ou recebimentos.
create table public.scanner_bbz_vinculacoes (
 id uuid primary key default gen_random_uuid(),condominio_id uuid not null references public.condominios(id),
 unidade_id uuid not null references public.unidades(id),observado_em timestamptz not null,evidencia jsonb not null,
 itens jsonb not null default '[]',criado_em timestamptz not null default now()
);
create index scanner_bbz_vinculacoes_unidade on public.scanner_bbz_vinculacoes(unidade_id,criado_em desc);
create table public.scanner_bbz_recibos_parcelas (
 parcela_id uuid primary key references public.parcelas_acordo(id),acordo_id uuid not null references public.acordos(id),
 condominio_id uuid not null references public.condominios(id),carteira_id uuid not null,unidade_id uuid not null references public.unidades(id),
 recibo text not null check(recibo~'^[0-9]{6,}$'),processo text not null check(processo~'^[0-9]{6,}$'),codigo text not null,
 numero integer not null,quantidade integer not null,vencimento date not null,valor_centavos bigint not null,
 vinculacao_id uuid not null references public.scanner_bbz_vinculacoes(id),criado_em timestamptz not null default now(),
 revogado_em timestamptz,unique(condominio_id,recibo)
);
create index scanner_bbz_recibos_acordo on public.scanner_bbz_recibos_parcelas(acordo_id);
create index scanner_bbz_recibos_unidade on public.scanner_bbz_recibos_parcelas(unidade_id);
create index scanner_bbz_recibos_vinculacao on public.scanner_bbz_recibos_parcelas(vinculacao_id);
alter table public.scanner_bbz_vinculacoes enable row level security;
alter table public.scanner_bbz_recibos_parcelas enable row level security;
revoke all on public.scanner_bbz_vinculacoes,public.scanner_bbz_recibos_parcelas from public,anon,authenticated;
grant select on public.scanner_bbz_vinculacoes,public.scanner_bbz_recibos_parcelas to authenticated;
grant all on public.scanner_bbz_vinculacoes,public.scanner_bbz_recibos_parcelas to service_role;
create policy scanner_bbz_vinculacoes_admin on public.scanner_bbz_vinculacoes for select to authenticated using((select public.current_user_is_admin()));
create policy scanner_bbz_recibos_admin on public.scanner_bbz_recibos_parcelas for select to authenticated using((select public.current_user_is_admin()));

create function public.scanner_bbz_processos(obs text,codigo text) returns text[] language sql immutable security invoker set search_path=public as $$
 select coalesce(array_agg(distinct m[2]),'{}') from regexp_matches(coalesce(obs,''),'BBZ:([0-9]+):([0-9]{6,})','g') m
 where ltrim(m[1],'0')=ltrim(codigo,'0')
$$;
revoke all on function public.scanner_bbz_processos(text,text) from public,anon,authenticated;
grant execute on function public.scanner_bbz_processos(text,text) to service_role;

create function public.scanner_bbz_recibo_parcela(p_parcela uuid) returns text language sql stable security invoker set search_path=public as $$
 select v.recibo from public.scanner_bbz_recibos_parcelas v
 join public.parcelas_acordo p on p.id=v.parcela_id join public.acordos a on a.id=p.acordo_id
 join public.condominios c on c.id=a.condominio_id
 where p.id=p_parcela and v.revogado_em is null and lower(c.administradora)='bbz'
 and v.acordo_id=a.id and v.condominio_id=a.condominio_id and v.carteira_id=a.carteira_id and v.unidade_id=a.unidade_id
 and a.quantidade_parcelas=v.quantidade and p.numero=v.numero and p.vencimento=v.vencimento and round(p.valor*100)::bigint=v.valor_centavos
 and public.scanner_bbz_processos(a.observacoes,v.codigo)=array[v.processo]
 and (public.cobranca_recibo_arquivo(p.observacoes) is null or public.cobranca_recibo_arquivo(p.observacoes)=v.recibo)
 and not exists(select 1 from public.cobrancas q where q.condominio_id=c.id and q.duplicada_de_id is null and public.cobranca_recibo_arquivo(q.observacoes)=v.recibo)
 and not exists(select 1 from public.parcelas_acordo q join public.acordos aq on aq.id=q.acordo_id where aq.condominio_id=c.id and q.id<>p.id and public.cobranca_recibo_arquivo(q.observacoes)=v.recibo)
$$;
revoke all on function public.scanner_bbz_recibo_parcela(uuid) from public,anon,authenticated;
grant execute on function public.scanner_bbz_recibo_parcela(uuid) to service_role;

create function public.scanner_bbz_vincular_recibos(p_condominio uuid,p_unidade uuid,p_evidencia jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare c public.condominios;u public.unidades;codigo text;pacote uuid;b jsonb;g jsonb;gp jsonb;
 candidatos jsonb;grade_app jsonb;grade_fonte jsonb;alvo record;n integer;v_itens jsonb:='[]';estado text;motivo text;pid uuid;aid uuid;v public.scanner_bbz_recibos_parcelas;
begin
 select * into c from public.condominios where id=p_condominio;
 select * into u from public.unidades where id=p_unidade and condominio_id=c.id and carteira_id=c.carteira_id;
 select codigo_cliente into codigo from public.agente_acordos_configuracoes where condominio_id=c.id and administradora='BBZ';
 if c.status is distinct from 'ativo' or lower(c.administradora) is distinct from 'bbz' or u.id is null or codigo is null then raise exception 'Escopo BBZ não confirmado';end if;
 if p_evidencia->>'versao' is distinct from '1' or coalesce(p_evidencia->>'sha256','') !~ '^[a-f0-9]{64}$'
 or p_evidencia->>'fonte_boletos' is distinct from 'https://portalwm.webware.com.br/relatorioboleto/recibos'
 or p_evidencia->>'fonte_grade' is distinct from ('https://servc9.webware.com.br/bin/rt/gAcordo.asp?u='||(p_evidencia->>'referencia'))
 or p_evidencia->>'baixa_permitida' is distinct from 'false'
 or (p_evidencia->>'consultado_em')::timestamptz not between now()-interval '24 hours' and now()+interval '5 minutes'
 or ltrim(split_part(p_evidencia->>'referencia','/',1),'0')<>ltrim(coalesce(nullif(u.bloco,''),'0'),'0')
 or ltrim(split_part(p_evidencia->>'referencia','/',3),'0')<>ltrim(u.identificacao,'0')
 or p_evidencia->>'referencia' !~ '^[A-Za-z0-9]+/[A-Za-z0-9]+/[A-Za-z0-9]+$'
 or jsonb_typeof(p_evidencia->'boletos') is distinct from 'array' or jsonb_array_length(p_evidencia->'boletos')>200
 or jsonb_typeof(p_evidencia->'processos') is distinct from 'array' or jsonb_array_length(p_evidencia->'processos')>200 then raise exception 'Evidência BBZ inválida ou vencida';end if;
 perform pg_advisory_xact_lock(hashtextextended(c.id::text,719));
 perform 1 from public.acordos a where a.unidade_id=u.id and a.condominio_id=c.id and a.carteira_id=c.carteira_id for share;
 perform 1 from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.unidade_id=u.id and a.condominio_id=c.id and a.carteira_id=c.carteira_id for share of p;
 insert into public.scanner_bbz_vinculacoes(condominio_id,unidade_id,observado_em,evidencia) values(c.id,u.id,(p_evidencia->>'consultado_em')::timestamptz,p_evidencia) returning id into pacote;
 for b in select value from jsonb_array_elements(p_evidencia->'boletos') loop
  estado:='revisao';motivo:='Não há vínculo único com processo e grade integral do app.';pid:=null;aid:=null;
  select coalesce(jsonb_agg(jsonb_build_object('grade',x,'parcela',p)),'[]') into candidatos
  from jsonb_array_elements(p_evidencia->'processos') x cross join lateral jsonb_array_elements(x->'parcelas') p
  where p->>'numero'=b->>'numero' and x->>'quantidade'=b->>'quantidade' and p->>'vencimento'=b->>'vencimento' and p->>'valor'=b->>'valor';
  if b->>'recibo' !~ '^[0-9]{6,}$' or (b->>'valor')::bigint<=0 then motivo:='Recibo ou valor inválido.';
  elsif (select count(*) from jsonb_array_elements(p_evidencia->'boletos') x where x->>'recibo'=b->>'recibo')<>1 or jsonb_array_length(candidatos)>1 then estado:='ambiguo';motivo:='Recibo ou parcela corresponde a mais de uma identidade na fonte.';
  elsif jsonb_array_length(candidatos)=1 then
   g:=candidatos->0->'grade';gp:=candidatos->0->'parcela';
   if g->>'completa' is distinct from 'true' or jsonb_array_length(g->'parcelas')<>(g->>'quantidade')::integer then motivo:='Grade parcial; nenhuma extrapolação permitida.';
   else
    select count(*),min(a.id::text)::uuid into n,aid from public.acordos a
    where a.unidade_id=u.id and a.condominio_id=c.id and a.carteira_id=c.carteira_id and public.scanner_bbz_processos(a.observacoes,codigo)=array[g->>'processo'];
    if n<>1 then estado:=case when n>1 then 'ambiguo' else 'revisao' end;motivo:='Processo externo ausente, conflitante ou repetido no app.';
    else
     select jsonb_agg(jsonb_build_object('numero',p.numero,'vencimento',p.vencimento,'valor',round(p.valor*100)::bigint) order by p.numero) into grade_app from public.parcelas_acordo p where p.acordo_id=aid;
     select jsonb_agg(jsonb_build_object('numero',(p->>'numero')::integer,'vencimento',p->>'vencimento','valor',(p->>'valor')::bigint) order by (p->>'numero')::integer) into grade_fonte from jsonb_array_elements(g->'parcelas') p;
     if grade_app is distinct from grade_fonte or (select a.quantidade_parcelas from public.acordos a where id=aid) is distinct from (g->>'quantidade')::integer or (select round(a.valor_acordado*100)::bigint from public.acordos a where id=aid) is distinct from (select sum((p->>'valor')::bigint) from jsonb_array_elements(g->'parcelas') p) or (select count(distinct p.numero) from public.parcelas_acordo p where p.acordo_id=aid)<>(g->>'quantidade')::integer then motivo:='Grade completa do app diverge da fonte.';
     else
      select p.id,p.status,public.cobranca_recibo_arquivo(p.observacoes) recibo into alvo from public.parcelas_acordo p where p.acordo_id=aid and p.numero=(b->>'numero')::integer;
      pid:=alvo.id;
      select count(*) into n from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.unidade_id=u.id and a.condominio_id=c.id and a.carteira_id=c.carteira_id and p.numero=(b->>'numero')::integer and p.vencimento=(b->>'vencimento')::date and round(p.valor*100)::bigint=(b->>'valor')::bigint;
      if n<>1 then estado:='ambiguo';motivo:='Identidade da parcela repetida no app.';
      elsif alvo.status in ('cancelada','cancelado','renegociada','renegociado','substituida') or (alvo.recibo is not null and alvo.recibo<>b->>'recibo') then motivo:='Parcela encerrada ou com outro recibo; preservar para revisão.';
      elsif exists(select 1 from public.cobrancas q where q.condominio_id=c.id and q.duplicada_de_id is null and public.cobranca_recibo_arquivo(q.observacoes)=b->>'recibo')
       or exists(select 1 from public.parcelas_acordo q join public.acordos a on a.id=q.acordo_id where a.condominio_id=c.id and q.id<>pid and public.cobranca_recibo_arquivo(q.observacoes)=b->>'recibo') then estado:='ambiguo';motivo:='Recibo já pertence a outro item financeiro.';
      else
       select * into v from public.scanner_bbz_recibos_parcelas where parcela_id=pid or (condominio_id=c.id and recibo=b->>'recibo') limit 1;
       if found then
        if v.parcela_id=pid and v.recibo=b->>'recibo' and v.revogado_em is null and public.scanner_bbz_recibo_parcela(pid)=v.recibo then estado:='reutilizado';motivo:='Vínculo existente reconfirmado.';
        else motivo:='Vínculo existente diferente ou revogado; não sobrescrever.';end if;
       else
        insert into public.scanner_bbz_recibos_parcelas(parcela_id,acordo_id,condominio_id,carteira_id,unidade_id,recibo,processo,codigo,numero,quantidade,vencimento,valor_centavos,vinculacao_id)
        values(pid,aid,c.id,c.carteira_id,u.id,b->>'recibo',g->>'processo',codigo,(b->>'numero')::integer,(b->>'quantidade')::integer,(b->>'vencimento')::date,(b->>'valor')::bigint,pacote);
        estado:='vinculado';motivo:='Recibo de acordo, número/quantidade, grade integral e processo externo correspondem unicamente. Pagamento não inferido.';
       end if;
      end if;
     end if;
    end if;
   end if;
  end if;
  v_itens:=v_itens||jsonb_build_array(jsonb_build_object('recibo',b->>'recibo','parcela_id',pid,'acordo_id',aid,'resultado',estado,'motivo',motivo,'baixa_permitida',false));
 end loop;
 update public.scanner_bbz_vinculacoes set itens=v_itens where id=pacote;
 return jsonb_build_object('vinculacao_id',pacote,'itens',v_itens,'baixa_permitida',false);
end $$;
revoke all on function public.scanner_bbz_vincular_recibos(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.scanner_bbz_vincular_recibos(uuid,uuid,jsonb) to service_role;

-- A conciliação usa apenas vínculos auditados ainda compatíveis com a parcela.
create or replace function public.scanner_conciliar_pagamentos(p_evidencia uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare e public.scanner_evidencias;s public.scanner_configuracoes;c public.condominios;
 u uuid;n integer;alvo record;d jsonb;p jsonb;l jsonb;linhas jsonb:='[]';itens jsonb:='[]';resumo jsonb;
 resultado text:='processado';motivo text;estado text;fonte jsonb; candidatos jsonb;
 bbz_gp jsonb;bbz_p jsonb;bbz_v record;bbz_prova jsonb;vinculos text[];recibo text; valor bigint; total integer; detalhe boolean;
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
