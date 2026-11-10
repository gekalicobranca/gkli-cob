begin;

alter table public.mensagens add column unidade_id uuid references public.unidades(id) on delete set null;
update public.mensagens m set unidade_id=c.unidade_id
from public.cobrancas c where m.cobranca_id=c.id and m.unidade_id is null;
update public.mensagens m set unidade_id=i.unidade_id
from public.lote_itens i join public.unidades u on u.id=i.unidade_id
where m.lote_item_id=i.id and m.unidade_id is null and m.carteira_id=u.carteira_id;
alter table public.mensagens drop constraint mensagens_cobranca_id_fkey;
alter table public.mensagens add constraint mensagens_cobranca_id_fkey
  foreign key (cobranca_id) references public.cobrancas(id) on delete set null;
create index idx_mensagens_unidade_historico on public.mensagens(unidade_id,created_at desc);
create function public.mensagem_vincular_unidade() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.cobranca_id is not null then
    select c.unidade_id into new.unidade_id from public.cobrancas c where c.id=new.cobranca_id;
  end if;
  return new;
end $$;
revoke all on function public.mensagem_vincular_unidade() from public,anon,authenticated;
create trigger mensagem_vincular_unidade before insert or update of cobranca_id on public.mensagens
for each row execute function public.mensagem_vincular_unidade();

alter table public.maestro_flow_montagens add column reguas_por_parte uuid[];

create or replace function public.maestro_flow_enfileirar_ativacao() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.payload->>'origem' in ('maestro','easy_maestro') and new.status='pronto' and new.total_mensagens>0
    and exists(select 1 from maestro_flow_controle where carteira_id=new.carteira_id and ativo) then
    insert into maestro_flow_ativacoes(flow_id,carteira_id) values(new.id,new.carteira_id) on conflict do nothing;
  end if;
  return new;
end $$;

-- Mantém as validações operacionais da fila e usa a mesma agenda da ativação manual.
do $migration$
declare src text; inicio integer; fim integer;
begin
  src := pg_get_functiondef('public.maestro_flow_ativar(uuid,text)'::regprocedure);
  if position($a$f.payload->>'origem' is distinct from 'maestro'$a$ in src)=0 then
    raise exception 'Validação da origem do flow fora da versão esperada.';
  end if;
  src := replace(src,$a$f.payload->>'origem' is distinct from 'maestro'$a$,
    $a$coalesce(f.payload->>'origem','') not in ('maestro','easy_maestro')$a$);
  inicio := position($a$if exists(select 1 from mensagens where cobranca_flow_id=f.id and canal<>'email')$a$ in src);
  fim := position('n := email_ativar_flow' in src);
  if inicio=0 or fim<=inicio then raise exception 'Validação dos canais fora da versão esperada.'; end if;
  src := left(src,inicio-1)||$validacao$
   if exists(select 1 from mensagens m where m.cobranca_flow_id=f.id and
     (m.status<>'pendente_aprovacao' or m.canal is null or m.canal not in ('email','whatsapp')
     or (m.canal='email' and coalesce(nullif(m.email_destinatario,''),m.destinatario,'') !~ '^[^[:space:]@;,]+@[^[:space:]@;,]+[.][^[:space:]@;,]+$')
     or (m.canal='whatsapp' and regexp_replace(coalesce(nullif(m.whatsapp_numero,''),m.destinatario,''),'[^0-9]','','g') !~ '^(55)?[1-9][0-9]9[0-9]{8}$')
     or not public.flow_cobranca_mensagem_elegivel(m))) then
     raise exception 'Mensagem, destinatário ou cobrança não elegível para ativação.';
   end if;
   $validacao$||substr(src,fim);
  execute src;
end $migration$;

create function public.maestro_cobrancas_substituiveis(p_conversao uuid) returns uuid[]
language sql stable security invoker set search_path='' as $$
  select coalesce(array_agg(c.id order by c.id),'{}'::uuid[])
  from public.conversoes_relatorio v
  join public.cobrancas c on c.condominio_id=v.condominio_id and c.carteira_id=v.carteira_id
  join public.unidades u on u.id=c.unidade_id and u.condominio_id=v.condominio_id
  where v.id=p_conversao and v.origem like 'captacao_automatizada:%'
    and c.conversao_relatorio_id is distinct from v.id
    and c.status_operacional in ('novo','regular','em_cobranca_ativa')
    and c.arquivada_em is null and c.duplicada_de_id is null
    and not coalesce(c.automacao_bloqueada,false) and not coalesce(u.acao_judicial,false)
    and coalesce(c.status_financeiro,'em_aberto') not in ('quitado','pago','baixado','cancelado','renegociado','parcial')
    and c.data_pagamento is null and coalesce(c.valor_pago,0)=0
    and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
    and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
    and not exists(select 1 from public.scanner_baixas s where s.cobranca_id=c.id)
    and not exists(select 1 from public.cobrancas d where d.duplicada_de_id=c.id)
    and (not (v.preview_json ? 'escopoBlocosMaestro') or upper(trim(u.bloco)) in (
      select upper(trim(value)) from jsonb_array_elements_text(v.preview_json->'escopoBlocosMaestro')
    ))
    and (nullif(v.preview_json->>'blocoPadraoCaptacao','') is null
      or upper(trim(u.bloco))=upper(trim(v.preview_json->>'blocoPadraoCaptacao')))
$$;

-- A nova finalização é usada exclusivamente por captações conferidas pelo Maestro.
-- Exclusão, novas cobranças e parcelas são gravadas em uma única transação.
create function public.maestro_substituir_captacao(
  p_conversao uuid, p_inicio timestamptz, p_ids uuid[], p_importadas jsonb, p_valores jsonb, p_novas jsonb, p_parcelas jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  imp public.conversoes_relatorio;
  ids uuid[]; flows uuid[]; mensagens_ids uuid[];
  removidas integer; canceladas integer; preservadas integer; sem_recibo integer;
  resultado jsonb;
begin
  select * into strict imp from public.conversoes_relatorio where id=p_conversao for update;
  if imp.origem not like 'captacao_automatizada:%'
    or imp.preview_json->>'captacaoAutomatizada' is distinct from 'true'
    or imp.status is distinct from 'processando' or imp.atualizado_em is distinct from p_inicio
    or imp.preview_json ? 'conciliacaoMaestro' then
    raise exception 'Conversão não pertence ao processamento atual do Maestro.';
  end if;
  if imp.preview_json->>'relatorioCompleto'='false' or imp.preview_json->>'parcial'='true'
    or coalesce(imp.preview_json->>'recorteRegua','todos')<>'todos'
    or jsonb_typeof(p_importadas) is distinct from 'array'
    or jsonb_array_length(p_importadas) is distinct from imp.total_cobrancas
    or (jsonb_array_length(p_importadas)=0 and imp.preview_json->>'semPendencias' is distinct from 'true')
    or (imp.preview_json ? 'escopoBlocosMaestro' and jsonb_typeof(imp.preview_json->'escopoBlocosMaestro') is distinct from 'array')
    or (imp.condominio_id='cb988811-e0ea-45d6-990b-6476271eb109'::uuid and not (imp.preview_json ? 'escopoBlocosMaestro')) then
    raise exception 'Relatório ou escopo incompleto para substituir cobranças.';
  end if;

  perform id from public.condominios where id=imp.condominio_id and carteira_id=imp.carteira_id for update;
  if not found then raise exception 'Condomínio fora da carteira da conversão.'; end if;
  perform c.id from public.cobrancas c
    where c.condominio_id=imp.condominio_id and c.carteira_id=imp.carteira_id order by c.id for update;
  ids := public.maestro_cobrancas_substituiveis(p_conversao);
  if ids is distinct from p_ids then raise exception 'As cobranças mudaram durante a captação. Reprocesse o relatório.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_importadas) i(unidade_id uuid,vencimento date)
    where i.vencimento is null or not exists(select 1 from public.unidades u
      where u.id=i.unidade_id and u.condominio_id=imp.condominio_id)) then
    raise exception 'Há lançamentos sem vencimento ou unidade do condomínio.';
  end if;

  with recibos as materialized (
    select i.unidade_id,public.cobranca_recibo_identidade('Recibo '||i.recibo) recibo
    from jsonb_to_recordset(p_importadas) i(unidade_id uuid,recibo text)
  )
  select count(*),count(*) filter (where not exists(select 1 from recibos r
    where r.unidade_id=c.unidade_id and r.recibo=public.cobranca_recibo_identidade(c.observacoes)))
  into preservadas,sem_recibo
  from public.cobrancas c join public.unidades u on u.id=c.unidade_id
  where c.condominio_id=imp.condominio_id and c.carteira_id=imp.carteira_id
    and c.conversao_relatorio_id is distinct from imp.id and c.arquivada_em is null
    and c.duplicada_de_id is null and not(c.id=any(ids))
    and (not (imp.preview_json ? 'escopoBlocosMaestro') or upper(trim(u.bloco)) in (
      select upper(trim(value)) from jsonb_array_elements_text(imp.preview_json->'escopoBlocosMaestro')
    ))
    and (nullif(imp.preview_json->>'blocoPadraoCaptacao','') is null
      or upper(trim(u.bloco))=upper(trim(imp.preview_json->>'blocoPadraoCaptacao')));

  -- A conciliação existente atualiza apenas os valores selecionados, sem tratar ausências.
  resultado := public.maestro_conciliar_cobrancas(p_conversao,p_inicio,p_importadas,p_valores,false);
  if coalesce(resultado->>'motivo','') <> 'Ausências não arquivadas: captação parcial ou com linhas a conferir.' then
    raise exception 'As cobranças preservadas mudaram durante a captação: %', resultado->>'motivo';
  end if;

  select coalesce(array_agg(m.id),'{}'::uuid[]) into mensagens_ids from public.mensagens m
    where m.cobranca_id=any(ids) or coalesce(m.payload->'cobranca_ids','[]'::jsonb) ?| (ids::text[]);
  perform m.id from public.mensagens m where m.id=any(mensagens_ids) order by m.id for update;
  if exists(select 1 from public.mensagens m where m.id=any(mensagens_ids) and m.status='em_envio')
    or exists(select 1 from public.email_tentativas t where t.mensagem_id=any(mensagens_ids) and t.estado='em_envio')
    or exists(select 1 from public.whatsapp_web_envios t where t.mensagem_id=any(mensagens_ids) and t.estado='reservado') then
    raise exception 'Há mensagens em envio. Reprocesse a captação após a conclusão.';
  end if;
  select coalesce(array_agg(distinct f),'{}'::uuid[]) into flows from (
    select cobranca_flow_id f from public.mensagens where id=any(mensagens_ids)
    union select cobranca_flow_id from public.lote_itens where cobranca_id=any(ids)
  ) q where f is not null;
  update public.mensagens set status='cancelada',status_operacional='cancelada',cancelado_em=now(),
    cancelada_em=now(),agendada_para=null,scheduled_at=null,motivo_cancelamento='Cobrança substituída na captação'
    where id=any(mensagens_ids) and status in ('rascunho','pendente_aprovacao','aprovada','agendada','falha');
  get diagnostics canceladas=row_count;
  delete from public.email_agenda a using public.mensagens m
    where a.mensagem_id=m.id and m.id=any(mensagens_ids) and m.status='cancelada';
  update public.flow_progressao set status='cancelado',token=null,lease_ate=null,
    erro='Cobrança substituída na captação.',updated_at=now()
    where cobranca_ids && ids and status in ('pendente','processando','atencao');
  update public.maestro_flow_montagens m set status='atencao', token=null,lease_ate=null,
    erro='Cobranças substituídas em captação posterior.',updated_at=now()
    where m.status in ('pendente','processando') and m.conversao_id<>p_conversao
      and m.condominio_id=imp.condominio_id and m.carteira_id=imp.carteira_id
      and (exists(select 1 from public.cobrancas c where c.id=any(ids) and c.conversao_relatorio_id=m.conversao_id)
        or exists(select 1 from jsonb_array_elements(coalesce(m.plano,'[]'::jsonb)) parte where parte ?| (ids::text[])));
  update public.central_pendencias set status='resolvida',resolvido_em=now()
    where (cobranca_id=any(ids) or (entidade_tipo='cobranca' and entidade_id=any(ids)))
      and status in ('aberta','em_tratamento');

  delete from public.cobrancas where id=any(ids);
  get diagnostics removidas=row_count;
  update public.cobranca_flows f set
    total_pendentes=(select count(*) from public.mensagens m where m.cobranca_flow_id=f.id and m.status in ('pendente_aprovacao','aprovada')),
    total_agendadas=(select count(*) from public.mensagens m where m.cobranca_flow_id=f.id and m.status='agendada'),
    total_falhas=(select count(*) from public.mensagens m where m.cobranca_flow_id=f.id and m.status='falha'),
    proximo_disparo_em=(select min(m.agendada_para) from public.mensagens m where m.cobranca_flow_id=f.id and m.status='agendada'),
    status=case when f.status in ('pronto','em_execucao','pausado') and not exists(
      select 1 from public.mensagens m where m.cobranca_flow_id=f.id and m.status in ('pendente_aprovacao','aprovada','agendada','falha')
    ) then 'cancelado' else f.status end
    where f.id=any(flows);

  insert into public.cobrancas(id,carteira_id,condominio_id,unidade_id,competencia,valor_original,valor_atualizado,
    multa,correcao,juros,vencimento,status,status_operacional,status_financeiro,automacao_bloqueada,observacoes,origem_importacao,conversao_relatorio_id)
  select n.id,imp.carteira_id,imp.condominio_id,n.unidade_id,n.competencia,n.valor_original,n.valor_atualizado,
    n.multa,n.correcao,n.juros,n.vencimento,n.status,n.status_operacional,n.status_financeiro,n.automacao_bloqueada,n.observacoes,n.origem_importacao,p_conversao
  from jsonb_populate_recordset(null::public.cobrancas,p_novas) n;
  insert into public.cobranca_parcelas(cobranca_id,conversao_relatorio_id,data_vencimento,referencia,valor_original,valor_atualizado,status,origem_linha_json)
  select p.cobranca_id,p_conversao,p.data_vencimento,p.referencia,p.valor_original,p.valor_atualizado,p.status,p.origem_linha_json
  from jsonb_populate_recordset(null::public.cobranca_parcelas,p_parcelas) p;

  resultado := (resultado-'motivo')||jsonb_build_object('removidas',removidas,'mensagensCanceladas',canceladas,
    'preservadas',preservadas,'semReciboCorrespondente',sem_recibo,
    'criadas',jsonb_array_length(p_novas),'parcelasCriadas',jsonb_array_length(p_parcelas));
  update public.conversoes_relatorio set limpeza_maestro_em=now(),preview_json=jsonb_set(preview_json,'{conciliacaoMaestro}',resultado)
    where id=p_conversao;
  return resultado;
end $$;

revoke all on function public.maestro_cobrancas_substituiveis(uuid),
 public.maestro_substituir_captacao(uuid,timestamptz,uuid[],jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.maestro_cobrancas_substituiveis(uuid),
 public.maestro_substituir_captacao(uuid,timestamptz,uuid[],jsonb,jsonb,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
