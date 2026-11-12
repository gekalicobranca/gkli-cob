begin;

create table public.easy_espelhamentos (
  id uuid primary key default gen_random_uuid(),
  lote uuid not null,
  condominio_id uuid not null references public.condominios(id),
  carteira_id uuid not null references public.carteiras(id),
  solicitado_por uuid not null,
  aplicar boolean not null default false,
  estado text not null default 'fila' check (estado in ('fila', 'processando', 'concluido', 'falha')),
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  tentativas integer not null default 0,
  resultado jsonb,
  unique (lote, condominio_id)
);
create unique index easy_espelhamentos_ativo_idx on public.easy_espelhamentos(condominio_id) where estado in ('fila', 'processando');
create index easy_espelhamentos_condominio_idx on public.easy_espelhamentos(condominio_id, criado_em desc);
alter table public.easy_espelhamentos enable row level security;
revoke all on public.easy_espelhamentos from public, anon, authenticated;
grant select, insert, update on public.easy_espelhamentos to service_role;

create function public.easy_espelhamento_condominios(p_carteiras uuid[])
returns table (id uuid, carteira_id uuid, nome text, nome_operacional text, carteira text)
language sql stable security invoker set search_path = '' as $$
  select c.id,c.carteira_id,c.nome,c.nome_operacional,ct.nome
  from public.condominios c join public.carteiras ct on ct.id=c.carteira_id
  join public.agente_acordos_configuracoes cfg on cfg.condominio_id=c.id and cfg.carteira_id=c.carteira_id and cfg.habilitado and cfg.administradora='Lello'
  join lateral (
    select min(nullif(r.config_json->>'codigo_portal','')) codigo
    from public.agente_receitas r join public.agente_administradoras a on a.id=r.administradora_id and a.ativo
    where r.ativo and r.script_key='captacao_lello' and r.carteira_id=c.carteira_id and r.config_json->>'condominio_id'=c.id::text
    having count(distinct nullif(r.config_json->>'codigo_portal',''))=1
  ) agente on true
  where c.status='ativo' and (p_carteiras is null or c.carteira_id=any(p_carteiras))
    and (select count(*) from jsonb_array_elements(cfg.alvos_portal) alvo where alvo->>'codigo'=agente.codigo)=1;
$$;

create function public.easy_espelhamento_painel(p_carteiras uuid[])
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome,'nomeOperacional',c.nome_operacional,'carteira',c.carteira,
    'ultimaConferenciaEm',consulta.concluido_em,'ultimoEspelhamentoEm',espelho.concluido_em,
    'execucao',case when recente.id is not null then jsonb_build_object('id',recente.id,'estado',recente.estado,'aplicar',recente.aplicar,
      'resultado',recente.resultado,'concluidoEm',recente.concluido_em) end) order by c.nome,c.id),'[]')
  from public.easy_espelhamento_condominios(p_carteiras) c
  left join lateral (select e.id,e.estado,e.aplicar,e.resultado,e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id order by e.criado_em desc,e.id desc limit 1) recente on true
  left join lateral (select e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id and e.estado='concluido' order by e.concluido_em desc limit 1) consulta on true
  left join lateral (select e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id and e.estado='concluido' and e.aplicar
      and e.resultado->'pendencias'='[]'::jsonb order by e.concluido_em desc limit 1) espelho on true;
$$;

create function public.easy_espelhamento_solicitar(p_carteiras uuid[], p_usuario uuid, p_lote uuid, p_condominios uuid[], p_aplicar boolean)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if p_usuario is null or p_lote is null or coalesce(cardinality(p_condominios),0) not between 1 and 500 then raise exception 'Pedido inválido.'; end if;
  if exists(select 1 from unnest(p_condominios) alvo where alvo not in (select id from public.easy_espelhamento_condominios(p_carteiras))) then
    raise exception 'Há condomínio sem agente habilitado ou fora das carteiras permitidas.';
  end if;
  insert into public.easy_espelhamentos(lote,condominio_id,carteira_id,solicitado_por,aplicar)
    select p_lote,c.id,c.carteira_id,p_usuario,coalesce(p_aplicar,false)
    from public.easy_espelhamento_condominios(p_carteiras) c where c.id=any(p_condominios)
    on conflict do nothing;
  get diagnostics n=row_count;
  return n;
end;
$$;
revoke all on function public.easy_espelhamento_condominios(uuid[]), public.easy_espelhamento_painel(uuid[]), public.easy_espelhamento_solicitar(uuid[],uuid,uuid,uuid[],boolean) from public, anon, authenticated;
grant execute on function public.easy_espelhamento_condominios(uuid[]), public.easy_espelhamento_painel(uuid[]), public.easy_espelhamento_solicitar(uuid[],uuid,uuid,uuid[],boolean) to service_role;

create function public.easy_espelhamento_reservar() returns setof public.easy_espelhamentos
language plpgsql security invoker set search_path = '' as $$
begin
  update public.easy_espelhamentos set estado='falha', concluido_em=now(),
    resultado=jsonb_build_object('erro','O agente perdeu a reserva. Solicite uma nova conferência.')
  where estado='processando' and iniciado_em < now() - interval '20 minutes' and tentativas >= 2;
  return query update public.easy_espelhamentos e
    set estado='processando', iniciado_em=now(), tentativas=e.tentativas+1
    where e.id=(
      select p.id from public.easy_espelhamentos p
      where p.estado='fila' or (p.estado='processando' and p.iniciado_em < now() - interval '20 minutes' and p.tentativas < 2)
      order by p.criado_em, p.id limit 1 for update skip locked
    ) returning e.*;
end;
$$;
revoke all on function public.easy_espelhamento_reservar() from public, anon, authenticated;
grant execute on function public.easy_espelhamento_reservar() to service_role;

create function public.easy_espelhamento_concluir(p_id uuid, p_tentativa integer, p_codigo text, p_resultado jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  pedido public.easy_espelhamentos%rowtype;
  condominio public.condominios%rowtype;
  cota public.cobrancas%rowtype;
  acordo public.acordos%rowtype;
  parcela public.parcelas_acordo%rowtype;
  unidade public.unidades%rowtype;
  item jsonb;
  vinculo jsonb;
  alteradas jsonb := '[]';
  recusadas jsonb := '[]';
  fonte jsonb;
  antes jsonb;
  alvo uuid;
  data_vencimento_portal date;
  operacao text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  referencia timestamptz := (p_resultado->>'consultadoEm')::timestamptz;
  em_garantia boolean;
begin
  select * into strict pedido from public.easy_espelhamentos where id=p_id and estado='processando' and tentativas=p_tentativa for update;
  if referencia is null or referencia < now() - interval '1 hour' or referencia > now() + interval '2 minutes' then
    raise exception 'Data da consulta inválida.';
  end if;
  select * into strict condominio from public.condominios c where c.id=pedido.condominio_id and c.carteira_id=pedido.carteira_id and c.status='ativo';
  if not exists(select 1 from public.agente_receitas r join public.agente_administradoras d on d.id=r.administradora_id
    where r.carteira_id=pedido.carteira_id and r.config_json->>'condominio_id'=pedido.condominio_id::text and r.ativo and d.ativo
      and r.script_key='captacao_lello' and r.config_json->>'codigo_portal'=p_codigo) then raise exception 'Receita remota da Lello indisponível.'; end if;

  if pedido.aplicar then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('importacao-lello:'||condominio.id::text,0));
    for item in select value from jsonb_array_elements(p_resultado->'alteracoes') loop
      begin
        select * into strict unidade from public.unidades u where u.id=(item->>'unidadeId')::uuid
          and u.condominio_id=condominio.id and u.carteira_id=pedido.carteira_id for update;
        if public.chave_unidade_lello(unidade.identificacao,unidade.bloco) is distinct from public.chave_unidade_lello(item->>'unidade',null) then
          raise exception 'Unidade divergente.';
        end if;
        antes := null;
        case item->>'tipo'
        when 'cota_aberta' then
          data_vencimento_portal := (item->>'vencimento')::date;
          if condominio.bloqueio_garantidora_habilitado and (condominio.bloqueio_garantidora_inicio is null or condominio.bloqueio_garantidora_fim is null or condominio.bloqueio_garantidora_inicio > condominio.bloqueio_garantidora_fim) then
            raise exception 'Período da garantidora inválido.';
          end if;
          em_garantia := coalesce(condominio.bloqueio_garantidora_habilitado and data_vencimento_portal between condominio.bloqueio_garantidora_inicio and condominio.bloqueio_garantidora_fim, false);
          operacao := case when unidade.acao_judicial then 'judicializado' when em_garantia then 'suspenso'
            when hoje-data_vencimento_portal >= greatest(0,coalesce(condominio.dias_apos_vencimento_regua,condominio.inicio_cobranca_dias,30)) then 'em_cobranca_ativa' else 'regular' end;
          if item->>'id' is null then
            if exists(select 1 from public.cobrancas c where c.condominio_id=condominio.id and c.unidade_id=unidade.id and c.vencimento=data_vencimento_portal
              and (public.cobranca_recibo_arquivo(c.observacoes) is null or public.cobranca_recibo_arquivo(c.observacoes)=item->>'recibo')) then
              raise exception 'Já existe cota ou recibo na unidade e no vencimento.';
            end if;
            insert into public.cobrancas(carteira_id,condominio_id,unidade_id,vencimento,competencia,valor_original,valor_atualizado,multa,juros,correcao,
              status,status_operacional,status_financeiro,observacoes,observacao_financeira,origem_importacao,automacao_bloqueada)
            values(pedido.carteira_id,condominio.id,unidade.id,data_vencimento_portal,to_char(data_vencimento_portal,'YYYY-MM'),(item->>'principal')::numeric/100,(item->>'total')::numeric/100,
              (item->>'multa')::numeric/100,(item->>'juros')::numeric/100,(item->>'correcao')::numeric/100,
              operacao,operacao,'em_aberto','Recibo: '||(item->>'recibo'),case when em_garantia then 'Vencimento abrangido pelo Bloqueio Garantidora.' end,
              'espelhamento_lello',operacao <> 'em_cobranca_ativa') returning id into alvo;
            insert into public.cobranca_parcelas(cobranca_id,data_vencimento,referencia,valor_original,valor_atualizado,status)
            values(alvo,data_vencimento_portal,item->>'recibo',(item->>'principal')::numeric/100,(item->>'total')::numeric/100,'aberto');
          else
            select * into strict cota from public.cobrancas c where c.id=(item->>'id')::uuid and c.condominio_id=condominio.id
              and c.carteira_id=pedido.carteira_id and c.unidade_id=unidade.id and c.vencimento=data_vencimento_portal and c.updated_at=(item->>'rev')::timestamptz
              and c.arquivada_em is null and c.duplicada_de_id is null and not coalesce(c.excluida_por_cessao_espaco,false) for update;
            if cota.status_financeiro not in ('em_aberto','vencido','parcial') or cota.data_pagamento is not null
              or exists(select 1 from public.acordos a where a.cobranca_id=cota.id and a.status<>'cancelado')
              or exists(select 1 from public.acordo_cobrancas l join public.acordos a on a.id=l.acordo_id where l.cobranca_id=cota.id and a.status<>'cancelado') then
              raise exception 'Situação da cota mudou.';
            end if;
            alvo := cota.id;
            antes := jsonb_build_object('status',cota.status,'principal',cota.valor_original,'total',cota.valor_atualizado);
            if cota.status_operacional not in ('novo','regular','em_cobranca_ativa') then operacao := cota.status_operacional; end if;
            update public.cobrancas set status=operacao,status_operacional=operacao,valor_original=(item->>'principal')::numeric/100,
              valor_atualizado=(item->>'total')::numeric/100,multa=(item->>'multa')::numeric/100,juros=(item->>'juros')::numeric/100,correcao=(item->>'correcao')::numeric/100,
              observacoes=case when public.cobranca_recibo_arquivo(cota.observacoes) is not null then cota.observacoes else concat_ws(E'\n','Recibo: '||(item->>'recibo'),cota.observacoes) end,
              automacao_bloqueada=cota.automacao_bloqueada or operacao in ('regular','judicializado','suspenso') where id=alvo;
            if (select count(*) from public.cobranca_parcelas where cobranca_id=alvo) = 1 then
              update public.cobranca_parcelas set valor_original=(item->>'principal')::numeric/100,valor_atualizado=(item->>'total')::numeric/100
                where cobranca_id=alvo and data_vencimento=data_vencimento_portal and status='aberto';
            end if;
          end if;
        when 'cota_paga' then
          select * into strict cota from public.cobrancas c where c.id=(item->>'id')::uuid and c.condominio_id=condominio.id and c.carteira_id=pedido.carteira_id
            and c.unidade_id=unidade.id and c.vencimento=(item->>'vencimento')::date and c.updated_at=(item->>'rev')::timestamptz
            and c.arquivada_em is null and c.duplicada_de_id is null and c.status_financeiro in ('em_aberto','vencido','parcial')
            and c.data_pagamento is null and coalesce(c.valor_pago,0)=0 and public.cobranca_recibo_arquivo(c.observacoes)=item->>'recibo' for update;
          if exists(select 1 from public.acordos a where a.cobranca_id=cota.id and a.status<>'cancelado')
            or exists(select 1 from public.acordo_cobrancas l join public.acordos a on a.id=l.acordo_id where l.cobranca_id=cota.id and a.status<>'cancelado')
            or (item->>'dataPagamento')::date > hoje or (item->>'valorPago')::numeric<=0 then raise exception 'Baixa direta em conflito.'; end if;
          alvo := cota.id;
          antes := jsonb_build_object('status',cota.status,'statusFinanceiro',cota.status_financeiro);
          update public.cobrancas set status=case when unidade.acao_judicial then 'judicializado' else 'quitado' end,
            status_operacional=case when unidade.acao_judicial then 'judicializado' else 'quitado' end,
            status_financeiro='quitado',data_pagamento=(item->>'dataPagamento')::date,valor_pago=(item->>'valorPago')::numeric/100,
            automacao_bloqueada=true,proxima_acao_em=null where id=alvo;
          update public.cobranca_parcelas set status='quitado' where cobranca_id=alvo and data_vencimento=cota.vencimento and status='aberto';
        when 'parcela_paga' then
          select a.* into strict acordo from public.acordos a join public.acordos_fontes_lello f on f.acordo_id=a.id
            where a.id=(item->>'acordoId')::uuid and a.unidade_id=unidade.id and a.condominio_id=condominio.id and a.carteira_id=pedido.carteira_id
              and a.status not in ('cancelado','renegociado','quebrado','suspenso') and f.numero_acordo=item->>'numero' and f.codigo_condominio=p_codigo for update of a;
          select * into strict parcela from public.parcelas_acordo where id=(item->>'id')::uuid and acordo_id=acordo.id
            and updated_at=(item->>'rev')::timestamptz and vencimento=(item->>'vencimento')::date and status<>'cancelada'
            and abs(valor-(item->>'valorPago')::numeric/100)<=1 for update;
          if (item->>'dataPagamento')::date > hoje then raise exception 'Data de pagamento futura.'; end if;
          alvo := parcela.id;
          antes := jsonb_build_object('status',parcela.status,'pagamento',parcela.data_pagamento,'valor',parcela.valor);
          update public.parcelas_acordo set status='paga',data_pagamento=(item->>'dataPagamento')::date,valor=(item->>'valorPago')::numeric/100 where id=alvo;
          if not exists(select 1 from public.parcelas_acordo where acordo_id=acordo.id and status not in ('paga','cancelada')) then
            update public.acordos set status='quitado',status_financeiro='quitado',ultima_sincronizacao_status_em=now(),
              data_quitacao=(select max(data_pagamento) from public.parcelas_acordo where acordo_id=acordo.id and status='paga') where id=acordo.id;
          else
            update public.acordos set status_financeiro='parcial',ultima_sincronizacao_status_em=now() where id=acordo.id and status<>'quitado';
          end if;
        when 'acordo_cancelado' then
          select a.* into strict acordo from public.acordos a join public.acordos_fontes_lello f on f.acordo_id=a.id
            where a.id=(item->>'id')::uuid and a.unidade_id=unidade.id and a.condominio_id=condominio.id and a.carteira_id=pedido.carteira_id
              and a.updated_at=(item->>'rev')::timestamptz and a.cobranca_id is null and f.numero_acordo=item->>'numero' and f.codigo_condominio=p_codigo for update of a;
          if exists(select 1 from public.acordo_cobrancas where acordo_id=acordo.id)
            or exists(select 1 from public.parcelas_acordo where acordo_id=acordo.id and (data_pagamento is not null or status='paga')) then
            raise exception 'Cancelamento em conflito com vínculo ou pagamento.';
          end if;
          alvo := acordo.id;
          antes := jsonb_build_object('status',acordo.status);
          update public.parcelas_acordo set status='cancelada' where acordo_id=acordo.id;
          update public.acordos set status='cancelado',status_financeiro='em_aberto',fluxo_status='cancelado',data_quitacao=null,
            motivo_encerramento='Cancelado sem pagamento no demonstrativo da Lello.',ultima_sincronizacao_status_em=now() where id=acordo.id;
        when 'vinculo', 'acordo_novo' then
          if item->>'tipo'='acordo_novo' then
            fonte := jsonb_build_object('codigo',p_codigo,'unidade',item->>'unidade','numero',item->>'numero','tipo_portal',item->>'tipoPortal',
              'consultado_em',referencia,'data_acordo',item->>'data','total_centavos',item->'total','pago_centavos',item->'pago','saldo_centavos',item->'saldo',
              'parcelas_pagas',(select count(*) from jsonb_array_elements(item->'parcelas') p where p->>'situacao'='Contabilizado'),
              'parcelas_abertas',(select count(*) from jsonb_array_elements(item->'parcelas') p where p->>'situacao'='Pendente'),
              'composicao',item->'composicao','fonte','https://portal.lellocondominios.com.br/relatorios/Acordo.do?codCondo='||p_codigo||'&codUnidade='||(item->>'unidade')||'&codAcordo='||(item->>'numero'),
              'parcelas',(select jsonb_agg(jsonb_build_object('vencimento',p->>'vencimento','valor_centavos',p->'valor','status',p->>'situacao','data_pagamento',p->>'pagamento') order by (p->>'numero')::integer) from jsonb_array_elements(item->'parcelas') p));
            fonte := public.importar_acordo_lello(condominio.id,p_codigo,fonte,true);
            if fonte->>'acao' not in ('cadastrado','vinculado_legado','ja_vinculado') then raise exception 'Identidade do acordo requer revisão.'; end if;
            select * into strict acordo from public.acordos where id=(fonte->>'acordo_id')::uuid and unidade_id=unidade.id and condominio_id=condominio.id for update;
          else
            select a.* into strict acordo from public.acordos a join public.acordos_fontes_lello f on f.acordo_id=a.id
              where a.id=(item->>'id')::uuid and a.unidade_id=unidade.id and a.condominio_id=condominio.id and a.carteira_id=pedido.carteira_id
                and f.numero_acordo=item->>'numero' and f.codigo_condominio=p_codigo for update of a;
          end if;
          if acordo.status not in ('ativo','em_dia','em_atraso','vencido','quitado') then raise exception 'Acordo sem situação compatível para vínculo.'; end if;
          alvo := acordo.id;
          for vinculo in select value from jsonb_array_elements(case when item->>'tipo'='acordo_novo' then item->'composicao'
            else jsonb_build_array(jsonb_build_object('id',item->'cotaId','rev',item->'cotaRev','recibo',item->'recibo','principal',item->'principal','vencimento',item->'vencimento')) end) loop
            select * into strict cota from public.cobrancas c where c.id=(vinculo->>'id')::uuid and c.unidade_id=unidade.id and c.condominio_id=condominio.id
              and c.carteira_id=pedido.carteira_id and c.updated_at=(vinculo->>'rev')::timestamptz and c.arquivada_em is null and c.duplicada_de_id is null
              and c.vencimento=(vinculo->>'vencimento')::date and c.valor_original=(vinculo->>'principal')::numeric/100
              and c.data_pagamento is null and coalesce(c.valor_pago,0)=0 and public.cobranca_recibo_arquivo(c.observacoes)=vinculo->>'recibo' for update;
            if exists(select 1 from public.acordos a where a.cobranca_id=cota.id and a.id<>acordo.id and a.status<>'cancelado')
              or exists(select 1 from public.acordo_cobrancas l join public.acordos a on a.id=l.acordo_id where l.cobranca_id=cota.id and a.id<>acordo.id and a.status<>'cancelado') then
              raise exception 'Cota vinculada a outro acordo.';
            end if;
            insert into public.acordo_cobrancas(acordo_id,cobranca_id,valor_original_no_acordo,valor_atualizado_no_acordo,valor_total_no_acordo)
              values(acordo.id,cota.id,cota.valor_original,cota.valor_original,cota.valor_original) on conflict do nothing;
            operacao := case when unidade.acao_judicial then 'judicializado' else 'acordo_efetivado' end;
            update public.cobrancas set status=operacao,status_operacional=operacao,
              status_financeiro=case when acordo.status='quitado' then 'quitado' else 'renegociado' end,
              automacao_bloqueada=true,proxima_acao_em=null where id=cota.id;
            if acordo.status='quitado' then update public.cobranca_parcelas set status='quitado' where cobranca_id=cota.id and status='aberto'; end if;
          end loop;
          if acordo.status='quitado' and acordo.data_quitacao is null then
            update public.acordos set data_quitacao=(select max(data_pagamento) from public.parcelas_acordo where acordo_id=acordo.id and status='paga') where id=acordo.id;
          end if;
        else raise exception 'Alteração não suportada.';
        end case;
        insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,usuario_id,antes,depois)
          values(pedido.carteira_id,case when item->>'tipo' like 'cota_%' then 'cobranca' when item->>'tipo'='parcela_paga' then 'parcela_acordo' else 'acordo' end,
            alvo,'easy_espelhamento_lello','Espelhamento da administradora',pedido.solicitado_por,antes,item||jsonb_build_object('execucao',pedido.id,'consultadoEm',referencia));
        alteradas := alteradas || jsonb_build_array(item);
      exception when others then
        recusadas := recusadas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('tipo',item->>'tipo','unidade',item->>'unidade',
          'referencia',coalesce(item->>'recibo',item->>'numero'),'vencimento',item->>'vencimento',
          'motivo','Não foi possível aplicar com o estado atual do app. Confira o vínculo e os dados da cobrança antes de repetir.')));
      end;
    end loop;
  end if;
  update public.easy_espelhamentos set estado='concluido',concluido_em=now(),
    resultado=(p_resultado-'alteracoes')||jsonb_build_object('alteracoes',case when pedido.aplicar then alteradas else p_resultado->'alteracoes' end,
      'aplicadas',jsonb_array_length(alteradas),'pendencias',coalesce(p_resultado->'pendencias','[]'::jsonb)||recusadas) where id=pedido.id;
end;
$$;
revoke all on function public.easy_espelhamento_concluir(uuid,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.easy_espelhamento_concluir(uuid,integer,text,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
