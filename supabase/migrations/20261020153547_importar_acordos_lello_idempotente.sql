-- Identidade da fonte separada dos acordos legados. Não altera pagamentos já registrados.
create table public.acordos_fontes_lello (
  codigo_condominio text not null check (codigo_condominio ~ '^[0-9]+$'),
  numero_acordo text not null check (numero_acordo ~ '^[0-9]+$'),
  acordo_id uuid not null unique references public.acordos(id) on delete restrict,
  condominio_id uuid not null references public.condominios(id) on delete restrict,
  carteira_id uuid not null references public.carteiras(id) on delete restrict,
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  fonte_json jsonb not null,
  criado_em timestamptz not null default now(),
  primary key (codigo_condominio, numero_acordo)
);
create index acordos_fontes_lello_condominio_idx on public.acordos_fontes_lello(condominio_id);
create index acordos_fontes_lello_carteira_idx on public.acordos_fontes_lello(carteira_id);
create index acordos_fontes_lello_unidade_idx on public.acordos_fontes_lello(unidade_id);
alter table public.acordos_fontes_lello enable row level security;
revoke all on public.acordos_fontes_lello from public, anon, authenticated;
grant select, insert on public.acordos_fontes_lello to service_role;

create or replace function public.importar_acordo_lello(
  p_condominio uuid, p_codigo text, p_dados jsonb, p_aplicar boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_carteira uuid; v_unidade uuid; v_ids uuid[]; v_acordo uuid; v_vinculo public.acordos_fontes_lello;
  v_unidade_portal text := p_dados->>'unidade'; v_numero text := p_dados->>'numero';
  v_data date; v_consulta timestamptz; v_hoje date;
  v_total bigint; v_pago bigint; v_saldo bigint; v_soma bigint; v_soma_paga bigint;
  v_parcelas jsonb; v_assinatura jsonb; v_existente record;
  v_tipo text; v_status text; v_status_financeiro text; v_motivo text;
  v_qtd integer; v_qtd_paga integer; v_qtd_aberta integer;
begin
  if coalesce(p_codigo,'') !~ '^[0-9]+$' or coalesce(v_numero,'') !~ '^[0-9]+$'
    or coalesce(v_unidade_portal,'') !~ '^[A-Za-z0-9-]{1,20}$' or p_dados->>'codigo' is distinct from p_codigo
    or jsonb_typeof(p_dados->'parcelas') is distinct from 'array' or jsonb_array_length(p_dados->'parcelas') not between 1 and 1000
    or coalesce(p_dados->>'data_acordo','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_dados->>'total_centavos','') !~ '^\d+$'
    or coalesce(p_dados->>'pago_centavos','') !~ '^\d+$'
    or coalesce(p_dados->>'saldo_centavos','') !~ '^\d+$'
    or coalesce(p_dados->>'parcelas_pagas','') !~ '^\d+$'
    or coalesce(p_dados->>'parcelas_abertas','') !~ '^\d+$' then raise exception 'Fonte Lello inválida'; end if;
  v_consulta := (p_dados->>'consultado_em')::timestamptz;
  if v_consulta is null or v_consulta < now() - interval '24 hours' or v_consulta > now() + interval '5 minutes' then raise exception 'Coleta Lello ausente, vencida ou futura'; end if;
  v_hoje := (v_consulta at time zone 'America/Sao_Paulo')::date;
  v_data := (p_dados->>'data_acordo')::date;
  if v_data > v_hoje then raise exception 'Data do acordo futura'; end if;
  v_total := (p_dados->>'total_centavos')::bigint; v_pago := (p_dados->>'pago_centavos')::bigint; v_saldo := (p_dados->>'saldo_centavos')::bigint;
  if v_total <> v_pago + v_saldo or v_total <= 0 then raise exception 'Totais Lello inválidos'; end if;
  if exists (select 1 from jsonb_array_elements(p_dados->'parcelas') p where
    coalesce(p->>'valor_centavos','') !~ '^\d+$' or coalesce(p->>'vencimento','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p->>'status','') not in ('Contabilizado','Pendente')
    or ((p->>'status' = 'Contabilizado') <> (nullif(p->>'data_pagamento','') is not null))
    or (p->>'data_pagamento')::date > v_hoje) then raise exception 'Parcela Lello inválida'; end if;
  select sum((p->>'valor_centavos')::bigint), coalesce(sum((p->>'valor_centavos')::bigint) filter (where p->>'status'='Contabilizado'),0), count(*), count(*) filter (where p->>'status'='Contabilizado'),count(*) filter(where p->>'status'='Pendente'),
    jsonb_agg(jsonb_build_array((p->>'vencimento')::date,(p->>'valor_centavos')::bigint) order by (p->>'vencimento')::date,(p->>'valor_centavos')::bigint)
    into v_soma,v_soma_paga,v_qtd,v_qtd_paga,v_qtd_aberta,v_assinatura from jsonb_array_elements(p_dados->'parcelas') p;
  if v_soma <> v_total or v_soma_paga <> v_pago or v_qtd_paga <> (p_dados->>'parcelas_pagas')::int or v_qtd_aberta <> (p_dados->>'parcelas_abertas')::int then raise exception 'Parcelas divergem do resumo Lello'; end if;
  -- Serializa a identificação de legados, inclusive quando números externos diferentes competem pelo mesmo acordo.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('importacao-lello:'||p_condominio::text,0));
  select c.carteira_id into v_carteira from public.condominios c
    join public.agente_acordos_configuracoes cfg on cfg.condominio_id=c.id and cfg.carteira_id=c.carteira_id
    where c.id=p_condominio and c.status='ativo' and cfg.administradora='Lello' and cfg.habilitado
    and exists(select 1 from jsonb_array_elements(cfg.alvos_portal) t where t->>'codigo'=p_codigo);
  if v_carteira is null then raise exception 'Condomínio ou alvo Lello não habilitado'; end if;
  select * into v_vinculo from public.acordos_fontes_lello where codigo_condominio=p_codigo and numero_acordo=v_numero;
  if found then
    if v_vinculo.condominio_id<>p_condominio or v_vinculo.carteira_id<>v_carteira or v_vinculo.fonte_json->>'unidade'<>v_unidade_portal then raise exception 'Número externo já vinculado a outro escopo'; end if;
    return jsonb_build_object('acao','ja_vinculado','acordo_id',v_vinculo.acordo_id);
  end if;
  -- Primeiro código literal. Zeros de máscara somente sem bloco; nunca adivinhar torre pelo nome.
  select array_agg(id) into v_ids from public.unidades where condominio_id=p_condominio and carteira_id=v_carteira and upper(trim(identificacao))=upper(v_unidade_portal);
  if coalesce(cardinality(v_ids),0)=0 then
    select array_agg(id) into v_ids from public.unidades where condominio_id=p_condominio and carteira_id=v_carteira
      and coalesce(trim(bloco),'') ~ '^(0*|SEM BLOCO)$'
      and regexp_replace(upper(trim(identificacao)),'^0+','')=regexp_replace(upper(v_unidade_portal),'^0+','');
  end if;
  if coalesce(cardinality(v_ids),0)<>1 then return jsonb_build_object('acao','revisao','motivo','Unidade ausente ou ambígua','candidatos',v_ids); end if;
  v_unidade := v_ids[1];
  perform 1 from public.unidades where id=v_unidade for update;
  -- Bloqueia os acordos atuais antes de comparar cronogramas e pagamentos.
  perform 1 from public.acordos where unidade_id=v_unidade for update;
  if coalesce(p_dados->>'tipo_portal','') not in ('Amigável','Pré-Jurídico') then
    return jsonb_build_object('acao','revisao','motivo','Acordo judicial exige conferir processo e vínculo antes do cadastro');
  end if;
  v_tipo := 'extrajudicial';
  select array_agg(a.id) into v_ids from public.acordos a where a.unidade_id=v_unidade and a.condominio_id=p_condominio and a.carteira_id=v_carteira
    and a.tipo=v_tipo and a.data_acordo=v_data and round(a.valor_acordado*100)=v_total
    and (select jsonb_agg(jsonb_build_array(p.vencimento,round(p.valor*100)::bigint) order by p.vencimento,round(p.valor*100)::bigint) from public.parcelas_acordo p where p.acordo_id=a.id and p.status<>'cancelada')=v_assinatura;
  if coalesce(cardinality(v_ids),0)>1 then return jsonb_build_object('acao','revisao','motivo','Mais de um acordo legado compatível','candidatos',v_ids); end if;
  if cardinality(v_ids)=1 then
    v_acordo := v_ids[1];
    select * into v_existente from public.acordos where id=v_acordo;
    if exists(select 1 from public.acordos_fontes_lello where acordo_id=v_acordo) then
      return jsonb_build_object('acao','revisao','motivo','Legado já associado a outro número externo','acordo_id',v_acordo);
    end if;
    if v_existente.status in ('cancelado','renegociado','quebrado','quitado') and v_saldo>0 then
      return jsonb_build_object('acao','revisao','motivo','Acordo encerrado no GKLI; preservar decisão e pagamentos','acordo_id',v_acordo);
    end if;
    if p_aplicar then
      insert into public.acordos_fontes_lello values(p_codigo,v_numero,v_acordo,p_condominio,v_carteira,v_unidade,p_dados,now());
    end if;
    return jsonb_build_object('acao',case when p_aplicar then 'vinculado_legado' else 'vincular_legado' end,'acordo_id',v_acordo);
  end if;
  -- Qualquer indício de que seja o mesmo acordo impede criação automática. Não basta a ausência do número externo.
  select array_agg(a.id) into v_ids from public.acordos a where a.unidade_id=v_unidade and a.condominio_id=p_condominio and a.carteira_id=v_carteira and (
    a.data_acordo=v_data or round(a.valor_acordado*100)=v_total
    or a.status in ('ativo','em_dia','em_atraso','vencido','quebrado')
    or a.observacoes like '%LELLO-'||p_codigo||'-'||v_unidade_portal||'-'||v_numero||'%'
    or exists(select 1 from public.parcelas_acordo p join jsonb_array_elements(p_dados->'parcelas') x on p.vencimento=(x->>'vencimento')::date and round(p.valor*100)=(x->>'valor_centavos')::bigint where p.acordo_id=a.id and p.status<>'cancelada')
  );
  if coalesce(cardinality(v_ids),0)>0 then return jsonb_build_object('acao','revisao','motivo','Possível acordo existente; datas, valores ou parcelas exigem conciliação','candidatos',v_ids); end if;
  if exists(select 1 from public.unidades where id=v_unidade and acao_judicial) then
    return jsonb_build_object('acao','revisao','motivo','Unidade sinalizada com ação judicial');
  end if;
  v_status := case when v_saldo=0 then 'quitado' when exists(select 1 from jsonb_array_elements(p_dados->'parcelas') p where p->>'status'='Pendente' and (p->>'vencimento')::date<v_hoje) then 'em_atraso' else 'em_dia' end;
  v_status_financeiro := case when v_saldo=0 then 'quitado' when v_status='em_atraso' then 'vencido' when v_pago>0 then 'parcial' else 'em_aberto' end;
  if not p_aplicar then return jsonb_build_object('acao','cadastrar','unidade_id',v_unidade,'parcelas',v_qtd,'saldo_centavos',v_saldo); end if;
  insert into public.acordos(carteira_id,condominio_id,unidade_id,tipo,valor_acordado,data_acordo,status,status_financeiro,quantidade_parcelas,fluxo_status,observacoes,ultima_sincronizacao_status_em)
    values(v_carteira,p_condominio,v_unidade,v_tipo,v_total/100.0,v_data,v_status,v_status_financeiro,v_qtd,'acordo_efetivado',
      'Importação automática conferida na Lello. Identificador: LELLO-'||p_codigo||'-'||v_unidade_portal||'-'||v_numero||'. Tipo na fonte: '||(p_dados->>'tipo_portal')||'. Fonte: '||coalesce(p_dados->>'fonte','')||'. Consulta: '||v_consulta::text,now()) returning id into v_acordo;
  insert into public.parcelas_acordo(acordo_id,numero,valor,vencimento,status,data_pagamento,observacoes)
    select v_acordo,n::int,(p->>'valor_centavos')::bigint/100.0,(p->>'vencimento')::date,
      case when p->>'status'='Contabilizado' then 'paga' when (p->>'vencimento')::date<v_hoje then 'vencida' else 'aberta' end,
      (p->>'data_pagamento')::date,'Fonte: Lello '||p_codigo||', acordo '||v_numero||'; consulta '||v_consulta::text
    from jsonb_array_elements(p_dados->'parcelas') with ordinality as x(p,n);
  insert into public.acordos_fontes_lello values(p_codigo,v_numero,v_acordo,p_condominio,v_carteira,v_unidade,p_dados,now());
  return jsonb_build_object('acao','cadastrado','acordo_id',v_acordo,'parcelas',v_qtd,'saldo_centavos',v_saldo);
end;
$$;
revoke all on function public.importar_acordo_lello(uuid,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.importar_acordo_lello(uuid,text,jsonb,boolean) to service_role;
comment on function public.importar_acordo_lello(uuid,text,jsonb,boolean) is 'Importa acordo e parcelas em uma transação; chave externa única e comparação conservadora de legados. Não altera pagamentos existentes nem envia mensagens.';

