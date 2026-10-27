-- Baixa integral com identidade e origem auditadas. Execução exclusiva do scanner noturno.
alter table public.cobrancas add column if not exists data_pagamento date;
alter table public.cobrancas add column if not exists valor_pago numeric(14,2);
alter table public.scanner_conciliacao_auditoria add column baixa jsonb not null default '{"resultado":"nao_executada"}'::jsonb;
create table public.scanner_baixas (
 id uuid primary key default gen_random_uuid(),conciliacao_id uuid not null references public.scanner_conciliacao_auditoria(id),
 evidencia_id uuid not null references public.scanner_evidencias(id),execucao_id uuid not null,
 tipo text not null check(tipo in ('cobranca','parcela')),item_id uuid not null,
 acordo_id uuid references public.acordos(id),cobranca_id uuid references public.cobrancas(id),parcela_id uuid references public.parcelas_acordo(id),
 condominio_id uuid not null references public.condominios(id),unidade_id uuid not null references public.unidades(id),carteira_id uuid not null,
 portal text not null check(portal in ('lello','manager','bbz')),recibo text not null,
 confirmado_por text not null default 'scanner_noturno' check(confirmado_por='scanner_noturno'),
 operador_portal text,confirmado_em timestamptz not null default now(),observado_em timestamptz not null,
 data_pagamento date not null,valor_pago_centavos bigint not null check(valor_pago_centavos>0),
 evidencia_sha256 text not null,fonte jsonb not null,antes jsonb not null,depois jsonb not null,
 unique(tipo,item_id),unique(portal,condominio_id,recibo),
 check((tipo='cobranca' and cobranca_id is not null and cobranca_id=item_id and parcela_id is null and acordo_id is null) or (tipo='parcela' and parcela_id is not null and parcela_id=item_id and acordo_id is not null and cobranca_id is null))
);
create index scanner_baixas_condominio on public.scanner_baixas(condominio_id);
create index scanner_baixas_conciliacao on public.scanner_baixas(conciliacao_id);
create index scanner_baixas_evidencia on public.scanner_baixas(evidencia_id);
create index scanner_baixas_acordo on public.scanner_baixas(acordo_id);
create index scanner_baixas_cobranca on public.scanner_baixas(cobranca_id);
create index scanner_baixas_parcela on public.scanner_baixas(parcela_id);
create index scanner_baixas_unidade on public.scanner_baixas(unidade_id,confirmado_em desc);
create index scanner_baixas_data on public.scanner_baixas(confirmado_em desc);
alter table public.scanner_baixas enable row level security;
revoke all on public.scanner_baixas from public,anon,authenticated;
grant select on public.scanner_baixas to authenticated;
grant select,insert on public.scanner_baixas to service_role;
create policy scanner_baixas_admin on public.scanner_baixas for select to authenticated using((select public.current_user_is_admin()));

create function public.scanner_aplicar_baixas(p_conciliacao uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare audit public.scanner_conciliacao_auditoria;e public.scanner_evidencias;s public.scanner_configuracoes;c public.condominios;u public.unidades;
 p public.parcelas_acordo;a public.acordos;b public.cobrancas;j jsonb;f jsonb;pagamento date;valor bigint;
 resultado text;motivo text;antes jsonb;depois jsonb;acordo_antes jsonb;vinculadas_antes jsonb;vinculadas_depois jsonb;payload jsonb;
 ids uuid[];todas boolean;quitacao date;baixa_id uuid;mensagem record;aplicados integer:=0;revisoes integer:=0;ja integer:=0;
 eventos jsonb:='[]';execucao uuid:=coalesce(nullif(current_setting('app.scanner_execucao',true),'')::uuid,gen_random_uuid());minutos integer;
begin
 select * into audit from public.scanner_conciliacao_auditoria where id=p_conciliacao for update;
 if not found then raise exception 'Conciliação inexistente';end if;
 if audit.baixa->>'resultado'='concluida' then return audit.baixa||jsonb_build_object('reutilizado',true,'aplicadas',0);end if;
 minutos:=extract(hour from now() at time zone 'America/Sao_Paulo')::integer*60+extract(minute from now() at time zone 'America/Sao_Paulo')::integer;
 if minutos<30 or minutos>=330 then return jsonb_build_object('resultado','fora_da_janela','aplicadas',0);end if;
 select * into e from public.scanner_evidencias where id=audit.evidencia_id for update;
 select * into s from public.scanner_configuracoes where id=e.configuracao_id;
 select * into c from public.condominios where id=s.condominio_id;
 select * into u from public.unidades where id=audit.unidade_id and condominio_id=c.id and carteira_id=c.carteira_id;
 if not s.ativo or c.status<>'ativo' or u.id is null or e.tipo<>'pagamentos' or not(e.unidade_portal=any(s.unidades)) or e.dados->>'codigo' is distinct from s.codigo_portal or e.dados->>'unidade' is distinct from e.unidade_portal or e.observado_em is distinct from audit.observado_em
 or e.observado_em<now()-interval '24 hours' or e.observado_em>now()+interval '5 minutes'
 or audit.conferido_em<now()-interval '5 minutes' or audit.resultado<>'processado'
 or exists(select 1 from public.scanner_evidencias x where x.configuracao_id=s.id and x.tipo='pagamentos' and x.unidade_portal=e.unidade_portal and (x.observado_em,x.id)>(e.observado_em,e.id)) then
  return jsonb_build_object('resultado','revisao_evidencia','aplicadas',0);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(c.id::text,720));
 for j in select value from jsonb_array_elements(audit.itens) where value->>'resultado'='validado' order by value->>'acordo_id',value->>'tipo',value->>'id' loop
  resultado:='revisao';motivo:='Identidade, evidência ou estado atual não autoriza baixa automática.';f:=j->'fonte';ids:='{}';baixa_id:=null;
  pagamento:=nullif(f->>'data','')::date;valor:=(f->>'pago')::bigint;antes:=null;depois:=null;acordo_antes:=null;vinculadas_antes:=null;vinculadas_depois:=null;
  <<item>> begin
   if f->>'confirmado' is distinct from 'true' or f->>'status' is distinct from 'Contabilizado' or coalesce(f->>'recibo','') !~ '^[0-9]+$' or pagamento is null or pagamento>(e.observado_em at time zone 'America/Sao_Paulo')::date or pagamento>(now() at time zone 'America/Sao_Paulo')::date or valor<=0 then motivo:='Recebimento exige recibo explícito, valor integral e data efetiva; resumo não autoriza baixa.';exit item;end if;
   if exists(select 1 from public.scanner_baixas x where x.tipo=j->>'tipo' and x.item_id=(j->>'id')::uuid) then
    if (j->>'tipo'='parcela' and exists(select 1 from public.parcelas_acordo q join public.scanner_baixas x on x.parcela_id=q.id where q.id=(j->>'id')::uuid and q.status='paga' and q.data_pagamento=x.data_pagamento)) or (j->>'tipo'='cobranca' and exists(select 1 from public.cobrancas q join public.scanner_baixas x on x.cobranca_id=q.id where q.id=(j->>'id')::uuid and q.status_financeiro='quitado' and q.data_pagamento=x.data_pagamento)) then resultado:='ja_registrada';motivo:='Baixa já auditada; repetição sem nova alteração.';
    else motivo:='Registro alterado após baixa auditada; intervenção exige revisão, sem reaplicar.';end if;
    exit item;
   end if;
   if u.acao_judicial is distinct from false or exists(select 1 from public.central_pendencias cp where cp.carteira_id=c.carteira_id and cp.condominio_id=c.id and cp.status not in ('resolvida','cancelada') and cp.payload->>'estado'='atendimento_humano' and (cp.unidade_id=u.id or coalesce(cp.payload->'unidade_ids','[]'::jsonb) ? u.id::text)) then motivo:='Unidade judicializada ou com prioridade humana; revisar recebimento.';exit item;end if;
   if j->>'tipo'='parcela' then
    select * into a from public.acordos where id=(j->>'acordo_id')::uuid and unidade_id=u.id and condominio_id=c.id and carteira_id=c.carteira_id for update;
    if not found then exit item;end if;
    perform 1 from public.parcelas_acordo where acordo_id=a.id order by id for update;
    select * into p from public.parcelas_acordo where id=(j->>'id')::uuid and acordo_id=a.id;
    if not found then exit item;end if;
    if p.status='paga' or p.data_pagamento is not null then resultado:='ja_baixada';motivo:='Pagamento preexistente preservado; o scanner não assume sua autoria.';exit item;end if;
    if p.status not in ('aberta','vencida') or a.status not in ('ativo','em_dia','em_atraso','vencido') or a.tipo<>'extrajudicial' or a.status_financeiro='quitado'
     or coalesce(a.observacoes,'') ~ 'DUPLICIDADE_ACORDO_CONCILIADA|EXCLUIR_SOMA_DIVIDA_SUBSTITUICAO_PENDENTE'
     or p.updated_at is distinct from (j->'app'->>'updated_at')::timestamptz or p.status is distinct from j->'app'->>'status'
     or p.vencimento is distinct from (j->'app'->>'vencimento')::date or round(p.valor*100)::bigint is distinct from (j->'app'->>'valor')::bigint
     or p.numero is distinct from (j->'app'->>'numero')::integer or round(p.valor*100)::bigint is distinct from valor then exit item;end if;
    if s.portal='bbz' and public.scanner_bbz_recibo_parcela(p.id) is distinct from f->>'recibo' then motivo:='Vínculo do recibo BBZ mudou.';exit item;end if;
    if s.portal='manager' and public.cobranca_recibo_arquivo(p.observacoes) is distinct from f->>'recibo' then motivo:='Recibo Manager diverge da parcela.';exit item;end if;
    if s.portal='lello' and not exists(
     select 1 from public.acordos_fontes_lello af where af.acordo_id=a.id and af.unidade_id=u.id and af.carteira_id=c.carteira_id and af.condominio_id=c.id and af.codigo_condominio=s.codigo_portal and af.numero_acordo=f->>'acordo'
     union all select 1 from public.lello_vinculos_safira lv where lv.acordo_id=a.id and lv.unidade_externa=e.unidade_portal and lv.acordo_externo=f->>'acordo' and lv.revogado_em is null and s.codigo_portal='63004'
    ) then motivo:='Vínculo externo Lello mudou.';exit item;end if;
    select array_agg(distinct x) into ids from (select ac.cobranca_id x from public.acordo_cobrancas ac where ac.acordo_id=a.id union select a.cobranca_id where a.cobranca_id is not null) q;
    perform 1 from public.cobrancas where id=any(coalesce(ids,'{}')) order by id for update;
    if exists(select 1 from public.cobrancas q where q.id=any(coalesce(ids,'{}')) and (q.carteira_id<>c.carteira_id or q.condominio_id<>c.id or q.unidade_id<>u.id or q.duplicada_de_id is not null or q.automacao_bloqueada is true or coalesce(q.status_operacional,q.status) in ('suspenso','judicializado','pre_juridico','pre_distribuicao','acordo_quebrado')))
     or exists(select 1 from public.acordo_cobrancas ac join public.acordos outro on outro.id=ac.acordo_id where ac.cobranca_id=any(coalesce(ids,'{}')) and outro.id<>a.id and outro.status not in ('cancelado','quebrado','renegociado')) or exists(select 1 from public.acordos outro where outro.cobranca_id=any(coalesce(ids,'{}')) and outro.id<>a.id and outro.status not in ('cancelado','quebrado','renegociado')) then motivo:='Cobrança vinculada tem bloqueio, duplicidade ou outro acordo vigente.';exit item;end if;
    antes:=to_jsonb(p);acordo_antes:=to_jsonb(a);
    select jsonb_agg(to_jsonb(q) order by q.id) into vinculadas_antes from public.cobrancas q where q.id=any(coalesce(ids,'{}'));
    update public.parcelas_acordo set status='paga',data_pagamento=pagamento where id=p.id returning to_jsonb(parcelas_acordo.*) into depois;
    select bool_and(pa.status='paga' and pa.data_pagamento is not null and pa.data_pagamento<=(now() at time zone 'America/Sao_Paulo')::date)
      and count(*) filter(where pa.tipo_parcela='parcela')=a.quantidade_parcelas
      and count(distinct pa.numero) filter(where pa.tipo_parcela='parcela')=a.quantidade_parcelas
      and (not coalesce(a.possui_entrada,false) or count(*) filter(where pa.tipo_parcela='entrada' and round(pa.valor*100)=round(a.valor_entrada*100))=1)
      and a.valor_acordado>0 and sum(round(pa.valor*100))>=round(a.valor_acordado*100),max(pa.data_pagamento)
      into todas,quitacao from public.parcelas_acordo pa where pa.acordo_id=a.id;
    update public.acordos set status=case when coalesce(todas,false) then 'quitado' else status end,status_financeiro=case when coalesce(todas,false) then 'quitado' else 'parcial' end,data_quitacao=case when coalesce(todas,false) then quitacao else data_quitacao end where id=a.id;
    update public.cobrancas set status=case when coalesce(todas,false) then 'acordo_efetivado' else 'acordo_firmado' end,status_operacional=case when coalesce(todas,false) then 'acordo_efetivado' else 'acordo_firmado' end
     where id=any(coalesce(ids,'{}')) and coalesce(status_operacional,status) in ('novo','regular','em_cobranca_ativa','em_negociacao','possivel_acordo','acordo_firmado');
    select jsonb_agg(to_jsonb(q) order by q.id) into vinculadas_depois from public.cobrancas q where q.id=any(coalesce(ids,'{}'));
    depois:=jsonb_build_object('parcela',depois,'acordo',(select to_jsonb(aa) from public.acordos aa where aa.id=a.id),'cobrancas',vinculadas_depois);
    antes:=jsonb_build_object('parcela',antes,'acordo',acordo_antes,'cobrancas',vinculadas_antes);
   elsif j->>'tipo'='cobranca' then
    select * into b from public.cobrancas where id=(j->>'id')::uuid and unidade_id=u.id and condominio_id=c.id and carteira_id=c.carteira_id for update;
    if not found then exit item;end if;
    if b.status_financeiro='quitado' or b.data_pagamento is not null then resultado:='ja_baixada';motivo:='Pagamento preexistente preservado; o scanner não assume sua autoria.';exit item;end if;
    if b.duplicada_de_id is not null or b.automacao_bloqueada is true or b.status_financeiro not in ('em_aberto','vencido') or coalesce(b.status_operacional,b.status) not in ('novo','regular','em_cobranca_ativa','em_negociacao','possivel_acordo','aberto','aberta')
     or b.updated_at is distinct from (j->'app'->>'updated_at')::timestamptz or b.vencimento is distinct from (j->'app'->>'vencimento')::date or b.status is distinct from j->'app'->>'status'
     or round(b.valor_original*100)::bigint is distinct from (j->'app'->>'valor')::bigint or round(coalesce(b.valor_atualizado,b.valor_original)*100)::bigint is distinct from valor
     or public.cobranca_recibo_arquivo(b.observacoes) is distinct from f->>'recibo'
     or exists(select 1 from public.acordos aa where aa.cobranca_id=b.id) or exists(select 1 from public.acordo_cobrancas ac where ac.cobranca_id=b.id) then exit item;end if;
    antes:=to_jsonb(b);
    update public.cobrancas set status=coalesce(status_operacional,status),status_financeiro='quitado',data_pagamento=pagamento,valor_pago=valor/100.0,automacao_bloqueada=true where id=b.id returning to_jsonb(cobrancas.*) into depois;
   else exit item;end if;
   insert into public.scanner_baixas(conciliacao_id,evidencia_id,execucao_id,tipo,item_id,acordo_id,cobranca_id,parcela_id,condominio_id,unidade_id,carteira_id,portal,recibo,observado_em,data_pagamento,valor_pago_centavos,evidencia_sha256,fonte,antes,depois)
   values(audit.id,e.id,execucao,j->>'tipo',(j->>'id')::uuid,case when j->>'tipo'='parcela' then a.id end,case when j->>'tipo'='cobranca' then b.id end,case when j->>'tipo'='parcela' then p.id end,c.id,u.id,c.carteira_id,s.portal,f->>'recibo',e.observado_em,pagamento,valor,e.sha256,f,antes,depois) returning id into baixa_id;
   payload:=jsonb_build_object('baixa_id',baixa_id,'execucao_id',execucao,'evidencia_id',e.id,'evidencia_sha256',e.sha256,'parcela_id',case when j->>'tipo'='parcela' then p.id end,'confirmado_por','Scanner noturno','operador_portal',null,'observado_em',e.observado_em,'data_pagamento',pagamento,'valor_pago_centavos',valor,'fonte',f,'antes',antes,'depois',depois);
   insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,usuario_id,usuario_nome,antes,depois)
   values(c.carteira_id,case when j->>'tipo'='parcela' then 'acordo' else 'cobranca' end,case when j->>'tipo'='parcela' then a.id else b.id end,case when j->>'tipo'='parcela' then 'acordo.parcela_paga' else 'cobranca.pagamento_confirmado' end,'Pagamento confirmado pelo scanner noturno','Recebimento integral confirmado no portal; operador do portal não informado.',null,'Scanner noturno',antes,payload);
   insert into public.timeline_operacional(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,severidade,condominio_id,unidade_id,cobranca_id,acordo_id,origem,usuario_id,usuario_nome,payload)
   values(c.carteira_id,case when j->>'tipo'='parcela' then 'acordo' else 'cobranca' end,case when j->>'tipo'='parcela' then a.id else b.id end,case when j->>'tipo'='parcela' then 'acordo.parcela_paga' else 'cobranca.pagamento_confirmado' end,'Pagamento confirmado pelo scanner noturno','Data efetiva e valor recebidos do portal; nenhuma mensagem enviada.','sucesso',c.id,u.id,case when j->>'tipo'='cobranca' then b.id end,case when j->>'tipo'='parcela' then a.id end,'scanner',null,'Scanner noturno',payload);
   -- Cancela somente lembretes ainda não enviados do item pago; nunca envia mensagem.
   for mensagem in select m.id from public.mensagens m where m.status in ('rascunho','pendente_aprovacao','aprovada','agendada','falha') and m.carteira_id=c.carteira_id and ((j->>'tipo'='parcela' and coalesce(m.payload->>'parcela_id',m.payload#>>'{contexto,parcela_id}')=p.id::text) or (j->>'tipo'='cobranca' and m.cobranca_id=b.id)) order by m.id loop
    perform public.flow_cancelar_mensagem(mensagem.id);
   end loop;
   resultado:='aplicada';motivo:='Baixa integral e autoria do scanner registradas na mesma transação.';
  end item;
  if resultado='aplicada' then aplicados:=aplicados+1;elsif resultado in ('ja_baixada','ja_registrada') then ja:=ja+1;else revisoes:=revisoes+1;end if;
  eventos:=eventos||jsonb_build_array(jsonb_build_object('tipo',j->>'tipo','id',j->>'id','resultado',resultado,'motivo',motivo,'baixa_id',baixa_id));
 end loop;
 payload:=jsonb_build_object('resultado','concluida','aplicadas',aplicados,'ja_baixadas',ja,'revisoes',revisoes,'itens',eventos);
 update public.scanner_conciliacao_auditoria set baixa=payload where id=audit.id;
 return payload;
end $$;
revoke all on function public.scanner_aplicar_baixas(uuid) from public,anon,authenticated;
grant execute on function public.scanner_aplicar_baixas(uuid) to service_role;

-- A conferência e a baixa acontecem na mesma transação.
create or replace function public.scanner_conciliar_pagamentos(p_evidencia uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare e public.scanner_evidencias;s public.scanner_configuracoes;c public.condominios;
 u uuid;n integer;alvo record;d jsonb;p jsonb;l jsonb;linhas jsonb:='[]';itens jsonb:='[]';resumo jsonb;
 audit_id uuid;v_baixa jsonb;resultado text:='processado';motivo text;estado text;fonte jsonb; candidatos jsonb;
 bbz_gp jsonb;bbz_p jsonb;bbz_v record;bbz_prova jsonb;vinculos text[];recibo text; valor bigint; total integer; detalhe boolean;
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
  -- Somente itens que já existem no app, limitados a 200 por unidade.
  select (select count(*) from public.cobrancas b where b.unidade_id=u and b.condominio_id=c.id and b.carteira_id=c.carteira_id and b.duplicada_de_id is null)
    +(select count(*) from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id) into total;
  if total>200 then resultado:='limite_excedido';end if;
  if total<=200 then
   perform 1 from public.cobrancas b where b.unidade_id=u and b.condominio_id=c.id and b.carteira_id=c.carteira_id for share;
   perform 1 from public.acordos a where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id for share;
   perform 1 from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.unidade_id=u and a.condominio_id=c.id and a.carteira_id=c.carteira_id for share of p;
   for alvo in
    select 'cobranca'::text tipo,b.id,null::uuid acordo_id,null::int numero,b.vencimento,round(b.valor_original*100)::bigint valor,round(coalesce(b.valor_atualizado,b.valor_original)*100)::bigint valor_pagamento,b.status,b.data_pagamento,b.updated_at,b.observacoes
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
    itens:=itens||jsonb_build_array(jsonb_build_object('tipo',alvo.tipo,'id',alvo.id,'acordo_id',alvo.acordo_id,'resultado',estado,'motivo',motivo,'app',to_jsonb(alvo)-'observacoes','fonte',fonte,'baixa_automatica_elegivel',estado='validado'));
   end loop;
  end if;
  if total=0 then resultado:='sem_itens_no_app';end if;
 end if;
 select coalesce(jsonb_object_agg(chave,quantidade),'{}') into resumo from (select x->>'resultado' chave,count(*) quantidade from jsonb_array_elements(itens) x group by 1) contagens;
 insert into public.scanner_conciliacao_auditoria(evidencia_id,observado_em,unidade_id,resultado,resumo,itens) values(e.id,e.observado_em,u,resultado,resumo,itens) on conflict do nothing returning id into audit_id;
 update public.scanner_evidencias set conciliacao_status=resultado where id=e.id;
 if audit_id is not null then v_baixa:=public.scanner_aplicar_baixas(audit_id);else v_baixa:=jsonb_build_object('resultado','observacao_ja_auditada','aplicadas',0);end if;
 return jsonb_build_object('resultado',resultado,'resumo',resumo,'itens',jsonb_array_length(itens),'baixa_automatica',true,'baixa',v_baixa);
end $$;
revoke all on function public.scanner_conciliar_pagamentos(uuid) from public,anon,authenticated;
grant execute on function public.scanner_conciliar_pagamentos(uuid) to service_role;


create function public.scanner_processar_pagamentos(p_evidencia uuid,p_execucao uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
begin
 if p_execucao is null then raise exception 'Execução obrigatória';end if;
 perform set_config('app.scanner_execucao',p_execucao::text,true);
 return public.scanner_conciliar_pagamentos(p_evidencia);
end $$;
revoke all on function public.scanner_processar_pagamentos(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scanner_processar_pagamentos(uuid,uuid) to service_role;
