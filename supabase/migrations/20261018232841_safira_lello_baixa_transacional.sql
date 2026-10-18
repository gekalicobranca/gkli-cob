-- Executor privado: não concede ao navegador a capacidade de homologar ou baixar.
create table public.lello_vinculos_safira (
 id uuid primary key default gen_random_uuid(), acordo_id uuid not null unique references public.acordos(id),
 acordo_externo text not null unique check(acordo_externo ~ '^[0-9]+$'), unidade_externa text not null,
 cronograma jsonb not null, evidencia_sha256 text not null check(evidencia_sha256 ~ '^[a-f0-9]{64}$'),
 storage_path text not null, consultado_em timestamptz not null, homologado_em timestamptz not null default now(), revogado_em timestamptz
);
create table public.lello_recebimentos_safira (
 id uuid primary key default gen_random_uuid(), vinculo_id uuid not null references public.lello_vinculos_safira(id),
 parcela_id uuid not null unique references public.parcelas_acordo(id), recibo_externo text not null unique,
 parcela_externa text not null unique, data_pagamento date not null, valor_centavos bigint not null check(valor_centavos>0),
 evidencia_sha256 text not null check(evidencia_sha256 ~ '^[a-f0-9]{64}$'), storage_path text not null,
 consultado_em timestamptz not null, registrado_em timestamptz not null default now()
);
create index lello_recebimentos_safira_vinculo_idx on public.lello_recebimentos_safira(vinculo_id);
comment on table public.lello_vinculos_safira is 'Homologação exclusiva do executor Safira. RLS sem políticas de cliente é intencional.';
comment on table public.lello_recebimentos_safira is 'Ledger imutável de confirmações Lello; recibo e parcela únicos. Acesso restrito ao executor.';
alter table public.lello_vinculos_safira enable row level security;
alter table public.lello_recebimentos_safira enable row level security;
revoke all on public.lello_vinculos_safira,public.lello_recebimentos_safira from public,anon,authenticated;
grant select,insert,update on public.lello_vinculos_safira,public.lello_recebimentos_safira to service_role;
insert into storage.buckets(id,name,public) values('lello-evidencias','lello-evidencias',false) on conflict(id) do nothing;

create function public.safira_homologar_lello(p_acordo uuid,p_externo text,p_unidade text,p_cronograma jsonb,p_sha text,p_path text,p_consultado timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.acordos%rowtype; atual jsonb; v public.lello_vinculos_safira%rowtype;
begin
 if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'Executor privado obrigatório.' using errcode='42501'; end if;
 if p_consultado is null or p_consultado>now() or p_consultado<now()-interval '24 hours'
   or p_sha is null or p_sha !~ '^[a-f0-9]{64}$' or p_path is distinct from 'safira/'||p_sha||'.html'
   or not exists(select 1 from storage.objects where bucket_id='lello-evidencias' and name=p_path)
   or p_externo is null or p_externo !~ '^[0-9]+$' then raise exception 'Evidência inválida ou vencida.'; end if;
 select * into a from public.acordos where id=p_acordo for update;
 if not found or a.condominio_id is distinct from '2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53'::uuid
   or a.carteira_id is distinct from 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'::uuid
   or a.tipo is distinct from 'extrajudicial' or coalesce(a.status,'') not in ('ativo','em_dia','em_atraso','vencido') then raise exception 'Acordo fora do piloto vigente.'; end if;
 perform 1 from public.unidades where id=a.unidade_id and condominio_id=a.condominio_id and carteira_id=a.carteira_id
   and identificacao=p_unidade and acao_judicial is false for update;
 if not found then raise exception 'Unidade divergente ou judicializada.'; end if;
 perform 1 from public.parcelas_acordo where acordo_id=a.id order by id for update;
 select jsonb_agg(jsonb_build_object('vencimento',vencimento,'valor_centavos',round(valor*100)::bigint) order by vencimento,round(valor*100)) into atual
   from public.parcelas_acordo where acordo_id=a.id;
 if atual is null or p_cronograma is distinct from atual or (select sum((x->>'valor_centavos')::bigint) from jsonb_array_elements(atual) x) <> round(a.valor_acordado*100)::bigint then raise exception 'Cronograma interno diverge da fonte homologada.'; end if;
 if exists(select 1 from public.acordos outro where outro.id<>a.id and outro.unidade_id=a.unidade_id
   and outro.condominio_id=a.condominio_id and outro.valor_acordado=a.valor_acordado
   and (select jsonb_agg(jsonb_build_object('vencimento',px.vencimento,'valor_centavos',round(px.valor*100)::bigint) order by px.vencimento,round(px.valor*100)) from public.parcelas_acordo px where px.acordo_id=outro.id)=atual)
   then raise exception 'Mais de um acordo interno corresponde ao cronograma.'; end if;
 select * into v from public.lello_vinculos_safira where acordo_id=a.id;
 if found then
   if v.revogado_em is not null or v.acordo_externo is distinct from p_externo or v.unidade_externa is distinct from p_unidade or v.cronograma is distinct from atual then raise exception 'Vínculo anterior diverge; revisão obrigatória.'; end if;
   return v.id;
 end if;
 insert into public.lello_vinculos_safira(acordo_id,acordo_externo,unidade_externa,cronograma,evidencia_sha256,storage_path,consultado_em)
 values(a.id,p_externo,p_unidade,atual,p_sha,p_path,p_consultado) returning * into v;
 insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,depois)
 values(a.carteira_id,'acordo',a.id,'lello.vinculo_homologado','Vínculo Lello homologado',to_jsonb(v));
 return v.id;
end $$;

create function public.safira_baixar_lello(p_vinculo uuid,p_parcela uuid,p_recibo text,p_parcela_externa text,p_numero integer,p_vencimento date,p_valor bigint,p_data date,p_sha text,p_path text,p_consultado timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.lello_vinculos_safira%rowtype; a public.acordos%rowtype; p public.parcelas_acordo%rowtype;
 recebido public.lello_recebimentos_safira%rowtype; atual jsonb; todas boolean; quitacao date; ids_cobrancas uuid[]; caso record; evento jsonb;
begin
 if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'Executor privado obrigatório.' using errcode='42501'; end if;
 select * into v from public.lello_vinculos_safira where id=p_vinculo;
 if not found or v.revogado_em is not null then raise exception 'Vínculo inexistente ou revogado.'; end if;
 -- Mesmo pedido já confirmado retorna o recibo gravado; nunca altera uma data antiga.
 select * into a from public.acordos where id=v.acordo_id for update;
 select * into v from public.lello_vinculos_safira where id=v.id for update;
 if v.revogado_em is not null then raise exception 'Vínculo revogado.'; end if;
 perform 1 from public.parcelas_acordo where acordo_id=a.id order by id for update;
 select * into p from public.parcelas_acordo where id=p_parcela and acordo_id=a.id;
 if not found then raise exception 'Parcela fora do vínculo.'; end if;
 select * into recebido from public.lello_recebimentos_safira where parcela_id=p.id;
 if found then
   if recebido.vinculo_id is distinct from v.id or recebido.recibo_externo is distinct from p_recibo or recebido.parcela_externa is distinct from p_parcela_externa
      or recebido.valor_centavos is distinct from p_valor or recebido.data_pagamento is distinct from p_data
      or p.numero is distinct from p_numero or p.vencimento is distinct from p_vencimento
      or p.status is distinct from 'paga' or p.data_pagamento is distinct from p_data then raise exception 'Repetição divergente ou registro financeiro alterado.'; end if;
   return jsonb_build_object('reutilizado',true,'recebimento_id',recebido.id);
 end if;
 if a.condominio_id is distinct from '2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53'::uuid
   or a.carteira_id is distinct from 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'::uuid or a.tipo is distinct from 'extrajudicial'
   or coalesce(a.status,'') not in ('ativo','em_dia','em_atraso','vencido') then raise exception 'Acordo não permite baixa automática.'; end if;
 perform 1 from public.unidades where id=a.unidade_id and condominio_id=a.condominio_id and carteira_id=a.carteira_id
   and identificacao=v.unidade_externa and acao_judicial is false for update;
 if not found then raise exception 'Unidade mudou ou está judicializada.'; end if;
 perform 1 from public.central_pendencias where condominio_id=a.condominio_id and carteira_id=a.carteira_id
   and status not in ('resolvida','cancelada') order by id for update;
 if exists(select 1 from public.central_pendencias where condominio_id=a.condominio_id and carteira_id=a.carteira_id
   and status not in ('resolvida','cancelada') and payload->>'estado'='atendimento_humano'
   and (unidade_id=a.unidade_id or coalesce(payload->'unidade_ids','[]'::jsonb) ? a.unidade_id::text)) then raise exception 'Prioridade humana ativa.'; end if;
 select array_agg(distinct id) into ids_cobrancas from (
   select cobranca_id as id from public.acordo_cobrancas where acordo_id=a.id
   union select a.cobranca_id where a.cobranca_id is not null
 ) c;
 perform 1 from public.cobrancas where id=any(coalesce(ids_cobrancas,'{}'::uuid[])) order by id for update;
 if exists(select 1 from public.cobrancas where id=any(coalesce(ids_cobrancas,'{}'::uuid[]))
   and (condominio_id is distinct from a.condominio_id or carteira_id is distinct from a.carteira_id
     or automacao_bloqueada is true or coalesce(status_operacional,status,'') in ('suspenso','judicializado','pre_juridico','pre_distribuicao'))) then raise exception 'Cobrança bloqueada ou fora do escopo.'; end if;
 if exists(select 1 from public.acordo_cobrancas ac join public.acordos outro on outro.id=ac.acordo_id
   where ac.cobranca_id=any(coalesce(ids_cobrancas,'{}'::uuid[])) and outro.id<>a.id and outro.status not in ('cancelado','quebrado','renegociado')) then raise exception 'Cobrança vinculada a outro acordo vigente.'; end if;
 select jsonb_agg(jsonb_build_object('vencimento',vencimento,'valor_centavos',round(valor*100)::bigint) order by vencimento,round(valor*100)) into atual from public.parcelas_acordo where acordo_id=a.id;
 if atual is distinct from v.cronograma then raise exception 'Cronograma mudou após homologação.'; end if;
 if p.status not in ('aberta','vencida') or p.status is null or p.data_pagamento is not null
   or p.tipo_parcela is distinct from 'parcela' or p.numero is distinct from p_numero or p.vencimento is distinct from p_vencimento
   or p_valor is null or p_valor<=0 or round(p.valor*100)::bigint is distinct from p_valor
   or p_data is null or p_data>(now() at time zone 'America/Sao_Paulo')::date
   or p_consultado is null or p_consultado>now() or p_consultado<now()-interval '24 hours'
   or p_data>(p_consultado at time zone 'America/Sao_Paulo')::date
   or p_recibo is null or p_recibo !~ '^[0-9]+$' or p_parcela_externa is null or p_parcela_externa !~ '^[0-9]+$'
   or p_sha is null or p_sha !~ '^[a-f0-9]{64}$' or p_path is distinct from 'safira/'||p_sha||'.html'
   or not exists(select 1 from storage.objects where bucket_id='lello-evidencias' and name=p_path)
   then raise exception 'Recebimento inconsistente, já registrado ou evidência inválida.'; end if;
 insert into public.lello_recebimentos_safira(vinculo_id,parcela_id,recibo_externo,parcela_externa,data_pagamento,valor_centavos,evidencia_sha256,storage_path,consultado_em)
 values(v.id,p.id,p_recibo,p_parcela_externa,p_data,p_valor,p_sha,p_path,p_consultado) returning * into recebido;
 update public.parcelas_acordo set status='paga',data_pagamento=p_data,updated_at=now() where id=p.id;
 select bool_and(status='paga' and data_pagamento is not null),max(data_pagamento) into todas,quitacao from public.parcelas_acordo where acordo_id=a.id;
 if todas and quitacao>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Quitação depende de revisar data histórica futura.'; end if;
 update public.acordos set status=case when todas then 'quitado' else status end,
   status_financeiro=case when todas then 'quitado' else 'parcial' end,
   data_quitacao=case when todas then quitacao else data_quitacao end,
   fluxo_status=case when devedor_aceito_em is not null then 'acordo_efetivado' else fluxo_status end,updated_at=now() where id=a.id;
 -- Mantém estados mais avançados; não altera réguas, mensagens nem suspensões.
 update public.cobrancas set status=case when todas or a.devedor_aceito_em is not null then 'acordo_efetivado' else 'acordo_firmado' end,
   status_operacional=case when todas or a.devedor_aceito_em is not null then 'acordo_efetivado' else 'acordo_firmado' end,updated_at=now()
   where id=any(coalesce(ids_cobrancas,'{}'::uuid[])) and coalesce(status_operacional,status,'') in ('novo','regular','em_cobranca_ativa','em_negociacao','possivel_acordo','acordo_firmado');
 evento:=jsonb_build_object('recebimento',to_jsonb(recebido),'status_anterior',p.status,'data_anterior',p.data_pagamento,'origem','dot_lello');
 insert into public.timeline_operacional(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,severidade,status_anterior,status_novo,condominio_id,unidade_id,acordo_id,origem,payload)
 values(a.carteira_id,'acordo',a.id,'acordo.parcela_paga','Pagamento Lello confirmado','Parcela '||p.numero||' confirmada com data efetiva e recibo Lello.','sucesso',p.status,'paga',a.condominio_id,a.unidade_id,a.id,'dot_lello',evento);
 insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,antes,depois)
 values(a.carteira_id,'acordo',a.id,'acordo.parcela_paga','Baixa transacional Lello',to_jsonb(p),evento);
 for caso in select * from public.central_pendencias where condominio_id=a.condominio_id and carteira_id=a.carteira_id
   and tipo='keila_atendimento' and status not in ('resolvida','cancelada')
   and (unidade_id=a.unidade_id or coalesce(payload->'unidade_ids','[]'::jsonb) ? a.unidade_id::text
      or exists(select 1 from jsonb_array_elements(coalesce(payload->'acordos','[]'::jsonb)) x where x->>'id'=a.id::text)) order by id
 loop
   update public.central_pendencias set payload=caso.payload||jsonb_build_object(
     'atividades',coalesce(caso.payload->'atividades','[]'::jsonb)||jsonb_build_array(jsonb_build_object('em',now(),'descricao','Pagamento confirmado na Lello, parcela '||p.numero||', acordo '||a.id||'. Recibo '||p_recibo||'. Nenhuma mensagem enviada.'))
   )||case when a.devedor_aceito_em is not null and caso.payload ? 'acordos' then jsonb_build_object('acordos',(
     select jsonb_agg(case when x->>'id'=a.id::text then x||jsonb_build_object('etapa','acordo_efetivado') else x end) from jsonb_array_elements(caso.payload->'acordos') x)) else '{}'::jsonb end,updated_at=now() where id=caso.id;
 end loop;
 return jsonb_build_object('reutilizado',false,'recebimento_id',recebido.id,'quitado',todas);
end $$;
revoke all on function public.safira_homologar_lello(uuid,text,text,jsonb,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.safira_baixar_lello(uuid,uuid,text,text,integer,date,bigint,date,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.safira_homologar_lello(uuid,text,text,jsonb,text,text,timestamptz),public.safira_baixar_lello(uuid,uuid,text,text,integer,date,bigint,date,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';

