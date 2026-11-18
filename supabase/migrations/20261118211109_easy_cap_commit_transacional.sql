begin;

create table public.easy_captacao_resultados (
  conversao_id uuid primary key references public.conversoes_relatorio(id),
  carteira_id uuid not null references public.carteiras(id),
  operador_id uuid not null,
  plano_hash text not null,
  plano_md5 text not null,
  resultado jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.easy_captacao_resultados enable row level security;
revoke all on public.easy_captacao_resultados from public,anon,authenticated,service_role;
grant select,insert on public.easy_captacao_resultados to service_role;
create index easy_cap_identidade_recibo_idx on public.cobrancas(unidade_id,public.cobranca_recibo_identidade(observacoes),vencimento);

-- Um só predicado para o resumo e o commit; recorte anual Easy preservado.
create function public.easy_captacao_substituiveis(p_condominio uuid,p_carteira uuid)
returns uuid[] language sql stable security invoker set search_path='' as $$
  select coalesce(array_agg(c.id order by c.id),'{}'::uuid[])
  from public.cobrancas c join public.unidades u on u.id=c.unidade_id
    and u.condominio_id=p_condominio and u.carteira_id=p_carteira
  where c.condominio_id=p_condominio and c.carteira_id=p_carteira
    and c.arquivada_em is null and c.duplicada_de_id is null
    and c.status_operacional in ('regular','novo','em_cobranca_ativa')
    and coalesce(c.status,'') not in ('quitado','pago','cancelado','baixado','renegociado')
    and coalesce(c.status_financeiro,'em_aberto') in ('em_aberto','vencido')
    and not coalesce(c.automacao_bloqueada,false) and not coalesce(u.acao_judicial,false)
    and c.data_pagamento is null and coalesce(c.valor_pago,0)=0
    and extract(year from c.vencimento)=extract(year from now() at time zone 'America/Sao_Paulo')
    and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
    and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
    and not exists(select 1 from public.scanner_baixas s where s.cobranca_id=c.id)
    and not exists(select 1 from public.cobrancas d where d.duplicada_de_id=c.id)
    and not exists(select 1 from public.cobranca_parcelas p where p.cobranca_id=c.id and
      (nullif(to_jsonb(p)->>'data_pagamento','') is not null
        or coalesce(nullif(to_jsonb(p)->>'valor_pago',''),'0')::numeric>0
        or to_jsonb(p)->>'status' in ('paga','pago','quitada','quitado','parcial','cancelada','cancelado')))
$$;

create or replace function public.easy_captacao_snapshot(p_condominio uuid,p_carteira uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with ids as(select public.easy_captacao_substituiveis(p_condominio,p_carteira) valores)
  select jsonb_build_object('protocolo',2,'ano',extract(year from now() at time zone 'America/Sao_Paulo')::int,
    'quantidade',cardinality(ids.valores),'valor',(select coalesce(sum(valor_atualizado),0) from public.cobrancas where id=any(ids.valores)),
    'versao',md5(jsonb_build_object(
      'dia',(now() at time zone 'America/Sao_Paulo')::date,'ids',ids.valores,
      'condominio',(select to_jsonb(c) from public.condominios c where id=p_condominio and carteira_id=p_carteira),
      'unidades',(select coalesce(jsonb_agg(to_jsonb(u) order by u.id),'[]') from public.unidades u where condominio_id=p_condominio),
      'cobrancas',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from public.cobrancas c where condominio_id=p_condominio),
      'parcelas',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.cobranca_parcelas p join public.cobrancas c on c.id=p.cobranca_id where c.condominio_id=p_condominio),
      'acordos',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.acordos a where condominio_id=p_condominio),
      'vinculos',(select coalesce(jsonb_agg(to_jsonb(a) order by a.cobranca_id,a.acordo_id),'[]') from public.acordo_cobrancas a join public.cobrancas c on c.id=a.cobranca_id where c.condominio_id=p_condominio),
      'baixas',(select coalesce(jsonb_agg(to_jsonb(b) order by b.cobranca_id),'[]') from public.scanner_baixas b join public.cobrancas c on c.id=b.cobranca_id where c.condominio_id=p_condominio)
    )::text)) from ids
$$;

create function public.easy_cap_registrar_evento(p_carteira uuid,p_tipo text,p_id uuid,p_operador uuid,p_conversao uuid,p_antes jsonb,p_depois jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.timeline_operacional(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,usuario_id,origem,payload)
    values(p_carteira,p_tipo,p_id,'easy_captacao.aplicada','Atualização transacional Easy Cap',p_operador,'importacao',
      jsonb_build_object('conversao_id',p_conversao,'antes',p_antes,'depois',p_depois));
  insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,usuario_id,antes,depois)
    values(p_carteira,p_tipo,p_id,'easy_captacao.aplicada','Atualização transacional Easy Cap',p_operador,p_antes,
      jsonb_build_object('conversao_id',p_conversao,'estado',p_depois));
end $$;

create function public.easy_captacao_confirmar(p_conversao uuid,p_operador uuid,p_assinatura text,p_plano_hash text)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' set statement_timeout='60s' as $$
declare
  v public.conversoes_relatorio; c public.condominios; u public.unidades; anterior public.cobrancas;
  recibo public.easy_captacao_resultados; plano jsonb; linha jsonb; parcela jsonb; antes jsonb; depois jsonb;
  ids uuid[]; vistos uuid[]:='{}'; mensagens_ids uuid[]; flows uuid[]; matches uuid[];
  v_cobranca_id uuid; item_recibo text; status_importado text; nota text; observacoes_importadas text;
  hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
  inicio integer; bloqueada boolean; fora boolean; judicial boolean; nome_tipo text;
  criadas integer:=0; atualizadas integer:=0; arquivadas integer:=0; ignoradas integer:=0; parcelas_criadas integer:=0;
  unidades_criadas integer:=0; contatos_atualizados integer:=0; canceladas integer:=0; historicos integer:=0;
  avisos jsonb; resultado jsonb; hash_sql text;
begin
  -- Barreira conservadora contra escritores que não compartilham advisory locks.
  -- Bloqueia escrita, não leitura; timeout provoca rollback, nunca commit parcial.
  lock table public.profiles,public.usuarios_carteiras,public.conversoes_relatorio,public.condominios,public.unidades,public.cobrancas,
    public.cobranca_parcelas,public.acordos,public.acordo_cobrancas,public.scanner_baixas,
    public.mensagens,public.email_tentativas,public.whatsapp_web_envios,public.email_agenda,
    public.flow_progressao,public.cobranca_flows,public.lote_itens,public.easy_flow_execucoes,
    public.maestro_flow_montagens,public.agente_receitas,public.agente_administradoras
    in share row exclusive mode;
  select * into strict v from public.conversoes_relatorio where id=p_conversao for update;
  if p_operador is null or v.origem is distinct from 'easy_captacao'
    or v.preview_json->'easyCaptacao'->>'operadorId' is distinct from p_operador::text
    or not exists(select 1 from public.profiles p where p.id=p_operador and p.role in ('admin','gestor','operador')
      and (p.role='admin' or exists(select 1 from public.usuarios_carteiras uc where uc.user_id=p.id and uc.carteira_id=v.carteira_id))) then
    raise exception 'Sem permissão para confirmar esta captação.' using errcode='42501';
  end if;
  if p_assinatura is null or length(p_assinatura)<>64 or p_plano_hash is null or length(p_plano_hash)<>64
    or p_assinatura is distinct from v.preview_json->'easyCaptacao'->>'assinatura'
    or p_plano_hash is distinct from v.preview_json->'easyCaptacao'->>'planoHash' then
    raise exception 'A prévia mudou. Envie o arquivo novamente.';
  end if;
  plano:=v.preview_json->'easyCaptacao'->'plano'; hash_sql:=md5(plano::text);
  select * into recibo from public.easy_captacao_resultados where conversao_id=v.id;
  if found then
    if recibo.operador_id<>p_operador or recibo.carteira_id<>v.carteira_id or recibo.plano_hash<>p_plano_hash or recibo.plano_md5<>hash_sql then
      raise exception 'A chave da operação pertence a outro plano.';
    end if;
    return recibo.resultado||jsonb_build_object('jaConfirmada',true);
  end if;
  if v.status is distinct from 'preview' or v.limpeza_maestro_em is not null
    or v.preview_json->'easyCaptacao'->'substituicao'->>'protocolo' is distinct from '2'
    or plano->>'versao' is distinct from '2'
    or jsonb_typeof(plano->'linhas') is distinct from 'array'
    or jsonb_array_length(plano->'linhas') not between 1 and 5000
    or jsonb_array_length(plano->'linhas') is distinct from v.total_cobrancas
    or (plano->>'quantidade')::int is distinct from v.total_cobrancas then
    raise exception 'A captação não está disponível para confirmação transacional.';
  end if;
  if (select sum((x->>'totalCentavos')::numeric) from jsonb_array_elements(plano->'linhas') x) is distinct from (plano->>'totalCentavos')::numeric
    or abs((plano->>'totalCentavos')::numeric-round(v.valor_total*100))>1 then
    raise exception 'O total do plano não confere com a conversão.';
  end if;
  if exists(select 1 from jsonb_array_elements(plano->'linhas') x group by upper(trim(x->>'bloco')),upper(trim(x->>'unidade')),
    coalesce(public.cobranca_recibo_identidade('Recibo '||(x->>'recibo')),x->>'vencimento') having count(*)>1) then
    raise exception 'O plano repete uma cobrança.';
  end if;
  select * into strict c from public.condominios where id=v.condominio_id and carteira_id=v.carteira_id for update;
  if c.status<>'ativo' or length(regexp_replace(coalesce(c.cnpj,''),'[^0-9]','','g'))<>14 then
    raise exception 'Condomínio indisponível ou sem CNPJ válido.';
  end if;
  if exists(select 1 from public.agente_receitas r join public.agente_administradoras a on a.id=r.administradora_id
    where r.ativo and a.ativo and coalesce(r.script_key,'')<>'' and r.config_json->>'condominio_id'=c.id::text) then
    raise exception 'O condomínio possui agente remoto. Utilize o Maestro.';
  end if;
  if exists(select 1 from public.easy_flow_execucoes where condominio_id=c.id and status in ('preview','montando','entre_partes','pronto','liberando','atencao'))
    or exists(select 1 from public.maestro_flow_montagens where condominio_id=c.id and status in ('pendente','processando','atencao'))
    or exists(select 1 from public.conversoes_relatorio where condominio_id=c.id and id<>v.id and status in ('processando','falha') and origem='easy_captacao') then
    raise exception 'Há execução pendente de conferência neste condomínio.';
  end if;
  if public.easy_captacao_snapshot(c.id,c.carteira_id) is distinct from v.preview_json->'easyCaptacao'->'substituicao' then
    raise exception 'A base, os contatos ou a configuração mudaram. Envie o arquivo novamente.';
  end if;
  ids:=public.easy_captacao_substituiveis(c.id,c.carteira_id);
  if exists(select 1 from public.flow_progressao where cobranca_ids&&ids and status='processando') then
    raise exception 'Há progressão de flow em processamento. Aguarde a conclusão.';
  end if;
  inicio:=greatest(0,coalesce(c.dias_apos_vencimento_regua,c.inicio_cobranca_dias,30));
  avisos:=coalesce(plano->'avisos','[]'::jsonb);
  nota:='Substituição transacional Easy Cap: '||v.id::text;

  select coalesce(array_agg(m.id order by m.id),'{}') into mensagens_ids from public.mensagens m
    where m.carteira_id=c.carteira_id and (m.cobranca_id=any(ids) or coalesce(m.payload->'cobranca_ids','[]'::jsonb) ?| ids::text[]);
  if exists(select 1 from public.mensagens where id=any(mensagens_ids) and status in ('em_envio','incerto'))
    or exists(select 1 from public.email_tentativas where mensagem_id=any(mensagens_ids) and estado in ('em_envio','incerto'))
    or exists(select 1 from public.whatsapp_web_envios where mensagem_id=any(mensagens_ids) and estado in ('reservado','incerto')) then
    raise exception 'Há envio em andamento ou incerto. Confira as mensagens antes de captar.';
  end if;
  for linha in select value from jsonb_array_elements(plano->'linhas') loop
    if nullif(trim(linha->>'unidade'),'') is null or length(linha->>'unidade')>500
      or (linha->>'vencimento') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (linha->>'totalCentavos')::numeric not between 1 and 99999999999999
      or (linha->>'principalCentavos')::numeric not between 0 and 99999999999999
      or (linha->>'multaCentavos')::numeric<0 or (linha->>'jurosCentavos')::numeric<0 or (linha->>'correcaoCentavos')::numeric<0 then
      raise exception 'Há linha inválida no plano de captação.';
    end if;
    perform (linha->>'vencimento')::date;
    select array_agg(id order by id) into matches from public.unidades
      where condominio_id=c.id and carteira_id=c.carteira_id
      and upper(trim(identificacao))=upper(trim(linha->>'unidade')) and upper(trim(coalesce(bloco,'')))=upper(trim(linha->>'bloco'));
    if cardinality(matches)>1 then raise exception 'Há unidades ambíguas no cadastro. Revise a base antes de captar.'; end if;
    antes:=null;
    if coalesce(cardinality(matches),0)=0 then
      if exists(select 1 from public.unidades where condominio_id=c.id and
        regexp_replace(upper(trim(identificacao)),'^0+(?=[0-9])','')=regexp_replace(upper(trim(linha->>'unidade')),'^0+(?=[0-9])','')
        and upper(trim(coalesce(bloco,'')))=upper(trim(linha->>'bloco'))) then
        raise exception 'Há unidade equivalente com outra identificação. Confira o cadastro antes de captar.';
      end if;
      insert into public.unidades(carteira_id,condominio_id,identificacao,bloco,responsavel_nome,email,telefone,status)
        values(c.carteira_id,c.id,linha->>'unidade',nullif(linha->>'bloco',''),coalesce(nullif(linha->>'responsavel',''),'Responsável não identificado'),
          nullif(linha->>'email',''),nullif(linha->>'telefone',''),'ativa') returning * into u;
      unidades_criadas:=unidades_criadas+1; nome_tipo:='unidade_nao_encontrada';
    else
      select * into strict u from public.unidades where id=matches[1]; antes:=to_jsonb(u);nome_tipo:=null;
      if nullif(linha->>'responsavel','') is not null and nullif(trim(u.responsavel_nome),'') is not null
        and u.responsavel_nome<>'Responsável não identificado' and upper(trim(u.responsavel_nome))<>upper(trim(linha->>'responsavel')) then
        nome_tipo:='responsavel_divergente';
      end if;
      update public.unidades set
        responsavel_nome=case when nullif(trim(responsavel_nome),'') is null or responsavel_nome='Responsável não identificado'
          then coalesce(nullif(linha->>'responsavel',''),responsavel_nome) else responsavel_nome end,
        email=case when nullif(trim(email),'') is null then nullif(linha->>'email','') else email end,
        telefone=case when nullif(trim(telefone),'') is null then nullif(linha->>'telefone','') else telefone end
        where id=u.id returning * into u;
      if (antes-'updated_at') is distinct from (to_jsonb(u)-'updated_at') then contatos_atualizados:=contatos_atualizados+1; end if;
    end if;
    if antes is null or (antes-'updated_at') is distinct from (to_jsonb(u)-'updated_at') then
      perform public.easy_cap_registrar_evento(c.carteira_id,'unidade',u.id,p_operador,v.id,antes,to_jsonb(u));
    end if;
    if nome_tipo is not null and not exists(select 1 from public.saneamento_cobrancas s where s.condominio_id=c.id and s.unidade_id=u.id and s.tipo=nome_tipo and s.status='pendente') then
      insert into public.saneamento_cobrancas(carteira_id,condominio_id,unidade_id,conversao_relatorio_id,tipo,status,unidade_relatorio,bloco_relatorio,responsavel_relatorio,unidade_cadastro,bloco_cadastro,responsavel_cadastro,payload)
        values(c.carteira_id,c.id,u.id,v.id,nome_tipo,'pendente',linha->>'unidade',nullif(linha->>'bloco',''),nullif(linha->>'responsavel',''),u.identificacao,u.bloco,u.responsavel_nome,jsonb_build_object('origem','easy_captacao'));
    end if;
    judicial:=coalesce(u.acao_judicial,false);fora:=hoje-(linha->>'vencimento')::date<inicio;
    item_recibo:=public.cobranca_recibo_identidade('Recibo '||(linha->>'recibo'));
    -- Separar os planos permite usar o índice de recibo mesmo em condomínio
    -- com muitas cotas da mesma unidade; OR parametrizado pode virar scan amplo.
    if item_recibo is not null then
      select array_agg(b.id order by b.id) into matches from public.cobrancas b
        where b.condominio_id=c.id and b.carteira_id=c.carteira_id and b.unidade_id=u.id
          and public.cobranca_recibo_identidade(b.observacoes)=item_recibo
          and (to_jsonb(b)->>'duplicada_origem_excluida_id') is null;
    else
      select array_agg(b.id order by b.id) into matches from public.cobrancas b
        where b.condominio_id=c.id and b.carteira_id=c.carteira_id and b.unidade_id=u.id
          and b.vencimento=(linha->>'vencimento')::date and public.cobranca_recibo_identidade(b.observacoes) is null
          and (to_jsonb(b)->>'duplicada_origem_excluida_id') is null;
    end if;
    if cardinality(matches)>1 then raise exception 'Cobrança com identidade ambígua. Confira a base.'; end if;
    v_cobranca_id:=matches[1];
    if v_cobranca_id is not null then
      vistos:=array_append(vistos,v_cobranca_id);
      if not(v_cobranca_id=any(ids)) then ignoradas:=ignoradas+1;continue;end if;
      select * into strict anterior from public.cobrancas where id=v_cobranca_id;
      antes:=jsonb_build_object('cobranca',to_jsonb(anterior),'parcelas',
        (select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.cobranca_parcelas p where p.cobranca_id=v_cobranca_id));
    else antes:=null;end if;
    if fora and not judicial and v_cobranca_id is null then ignoradas:=ignoradas+1;continue;end if;
    bloqueada:=false;
    if c.bloqueio_garantidora_habilitado then
      if c.bloqueio_garantidora_inicio is null or c.bloqueio_garantidora_fim is null or c.bloqueio_garantidora_inicio>c.bloqueio_garantidora_fim then
        raise exception 'Período do Bloqueio Garantidora inválido.';
      end if;
      bloqueada:=(linha->>'vencimento')::date between c.bloqueio_garantidora_inicio and c.bloqueio_garantidora_fim
        or exists(select 1 from jsonb_array_elements(linha->'parcelas') p where (p->>'vencimento')::date between c.bloqueio_garantidora_inicio and c.bloqueio_garantidora_fim);
    end if;
    status_importado:=case when bloqueada then 'suspenso' when fora then 'regular'
      when judicial and exists(select 1 from jsonb_array_elements(plano->'linhas') x where upper(trim(x->>'unidade'))=upper(trim(linha->>'unidade')) and upper(trim(x->>'bloco'))=upper(trim(linha->>'bloco'))
        and hoje-(x->>'vencimento')::date>=inicio and (x->>'prioridadeJudicial')::int<(linha->>'prioridadeJudicial')::int) then 'judicializado'
      when judicial then 'novo' when (linha->>'hflex')::boolean then 'em_negociacao'
      when (linha->>'possivelAcordo')::boolean and not exists(select 1 from public.acordos where unidade_id=u.id and status in ('ativo','em_dia','em_atraso')) then 'possivel_acordo' else 'novo' end;
    observacoes_importadas:=(linha->>'observacoes')||case when bloqueada then ' | Suspensa automaticamente: vencimento abrangido pelo Bloqueio Garantidora.' else '' end;
    if v_cobranca_id is null then
      insert into public.cobrancas(carteira_id,condominio_id,unidade_id,competencia,valor_original,valor_atualizado,multa,juros,correcao,vencimento,status,status_operacional,status_financeiro,automacao_bloqueada,observacoes,origem_importacao,conversao_relatorio_id)
        values(c.carteira_id,c.id,u.id,linha->>'competencia',(linha->>'principalCentavos')::numeric/100,(linha->>'totalCentavos')::numeric/100,
          (linha->>'multaCentavos')::numeric/100,(linha->>'jurosCentavos')::numeric/100,(linha->>'correcaoCentavos')::numeric/100,(linha->>'vencimento')::date,
          status_importado,status_importado,'em_aberto',(linha->>'hflex')::boolean,observacoes_importadas,'conversao_relatorio',v.id) returning id into v_cobranca_id;
      criadas:=criadas+1;
    else
      update public.cobrancas set competencia=linha->>'competencia',valor_original=(linha->>'principalCentavos')::numeric/100,
        valor_atualizado=(linha->>'totalCentavos')::numeric/100,multa=(linha->>'multaCentavos')::numeric/100,
        juros=(linha->>'jurosCentavos')::numeric/100,correcao=(linha->>'correcaoCentavos')::numeric/100,vencimento=(linha->>'vencimento')::date,
        status=status_importado,status_operacional=status_importado,automacao_bloqueada=(linha->>'hflex')::boolean,
        observacoes=observacoes_importadas,conversao_relatorio_id=v.id,updated_at=now() where id=v_cobranca_id;
      atualizadas:=atualizadas+1;
      delete from public.cobranca_parcelas p where p.cobranca_id=v_cobranca_id;
    end if;
    select to_jsonb(b) into depois from public.cobrancas b where b.id=v_cobranca_id;
    if depois is null or depois->>'carteira_id' is distinct from c.carteira_id::text
      or depois->>'condominio_id' is distinct from c.id::text or depois->>'unidade_id' is distinct from u.id::text
      or (depois->>'valor_original')::numeric is distinct from (linha->>'principalCentavos')::numeric/100
      or (depois->>'valor_atualizado')::numeric is distinct from (linha->>'totalCentavos')::numeric/100
      or depois->>'status_operacional' is distinct from status_importado
      or coalesce(depois->>'status_financeiro','em_aberto') not in ('em_aberto','vencido')
      or nullif(depois->>'data_pagamento','') is not null or coalesce((depois->>'valor_pago')::numeric,0)<>0
      or nullif(depois->>'duplicada_de_id','') is not null or nullif(depois->>'arquivada_em','') is not null then
      raise exception 'A gravação da cobrança divergiu do plano ou alterou campos protegidos.';
    end if;
    for parcela in select value from jsonb_array_elements(linha->'parcelas') loop
      insert into public.cobranca_parcelas(cobranca_id,conversao_relatorio_id,data_vencimento,referencia,valor_original,valor_atualizado,status,origem_linha_json)
        values(v_cobranca_id,v.id,(parcela->>'vencimento')::date,parcela->>'referencia',(parcela->>'valorCentavos')::numeric/100,
          (parcela->>'valorCentavos')::numeric/100,'aberto',parcela->'origem');
      parcelas_criadas:=parcelas_criadas+1;
    end loop;
    perform public.easy_cap_registrar_evento(c.carteira_id,'cobranca',v_cobranca_id,p_operador,v.id,antes,
      jsonb_build_object('cobranca',(select to_jsonb(b) from public.cobrancas b where b.id=v_cobranca_id),'parcelas',
        (select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.cobranca_parcelas p where p.cobranca_id=v_cobranca_id)));
  end loop;

  -- Ausentes saem da operação, conservando parcelas, IDs e vínculos históricos.
  for anterior in select * from public.cobrancas where id=any(ids) and not(id=any(vistos)) order by id loop
    antes:=to_jsonb(anterior);
    update public.cobrancas b set status='suspenso',status_operacional='suspenso',automacao_bloqueada=true where id=anterior.id returning to_jsonb(b) into depois;
    if depois->>'status_operacional' is distinct from 'suspenso' or depois->>'status' is distinct from 'suspenso'
      or depois->>'automacao_bloqueada' is distinct from 'true'
      or (depois-array['status','status_operacional','automacao_bloqueada','updated_at']) is distinct from
        (antes-array['status','status_operacional','automacao_bloqueada','updated_at']) then
      raise exception 'A suspensão para arquivo alterou campos protegidos. Confira os gatilhos do domínio.';
    end if;
    update public.cobrancas set arquivada_em=now(),arquivamento_motivo=nota where id=anterior.id;
    perform public.easy_cap_registrar_evento(c.carteira_id,'cobranca',anterior.id,p_operador,v.id,antes,(select to_jsonb(b) from public.cobrancas b where b.id=anterior.id));
    arquivadas:=arquivadas+1;
  end loop;
  select coalesce(array_agg(distinct cobranca_flow_id) filter(where cobranca_flow_id is not null),'{}') into flows from public.mensagens where id=any(mensagens_ids);
  update public.mensagens set status='cancelada',status_operacional='cancelada',cancelado_em=now(),cancelada_em=now(),agendada_para=null,scheduled_at=null,motivo_cancelamento=nota
    where id=any(mensagens_ids) and status in ('rascunho','pendente_aprovacao','aprovada','agendada','falha');
  get diagnostics canceladas=row_count;
  delete from public.email_agenda a using public.mensagens m where a.mensagem_id=m.id and m.id=any(mensagens_ids) and m.status='cancelada';
  update public.flow_progressao set status='cancelado',token=null,lease_ate=null,erro=nota,updated_at=now() where cobranca_ids&&ids and status in ('pendente','processando','atencao');
  update public.cobranca_flows f set
    total_pendentes=(select count(*) from public.mensagens m where m.cobranca_flow_id=f.id and m.status in ('pendente_aprovacao','aprovada')),
    total_agendadas=(select count(*) from public.mensagens m where m.cobranca_flow_id=f.id and m.status='agendada'),
    total_falhas=(select count(*) from public.mensagens m where m.cobranca_flow_id=f.id and m.status='falha'),
    proximo_disparo_em=(select min(m.agendada_para) from public.mensagens m where m.cobranca_flow_id=f.id and m.status='agendada'),
    status=case when f.status in ('pronto','em_execucao','pausado') and not exists(select 1 from public.mensagens m where m.cobranca_flow_id=f.id and m.status in ('pendente_aprovacao','aprovada','agendada','falha')) then 'cancelado' else f.status end where f.id=any(flows);

  -- Histórico do relatório completo, incluindo linhas fora da régua e preservadas.
  insert into public.captacao_historica_sindico(origem,conversao_relatorio_id,item_key,fonte_arquivo,fonte_aba,condominio_id,carteira_id,unidade_id,competencia,referencia_em,data_entrada,valor,valor_principal,multa,juros,correcao,situacao,unidade_identificacao,bloco,metadata)
    select 'conversao_relatorio',v.id,histu.id::text,v.nome_arquivo,'easyCapTransacional',c.id,c.carteira_id,histu.id,
      to_char(case when extract(day from hoje)>=10 then hoje+interval '1 month' else hoje end,'YYYY-MM'),now(),hoje,
      sum((x->>'totalCentavos')::numeric)/100,sum((x->>'principalCentavos')::numeric)/100,sum((x->>'multaCentavos')::numeric)/100,
      sum((x->>'jurosCentavos')::numeric)/100,sum((x->>'correcaoCentavos')::numeric)/100,
      case when histu.acao_judicial then 'Ação judicial em trâmite' when exists(select 1 from public.acordos a where a.unidade_id=histu.id and a.status in ('ativo','em_dia','em_atraso')) then 'Acordo'
        when exists(select 1 from public.cobrancas b where b.unidade_id=histu.id and b.arquivada_em is null and b.duplicada_de_id is null and b.status_operacional='judicializado') then 'Ação judicial em trâmite'
        when exists(select 1 from public.cobrancas b where b.unidade_id=histu.id and b.arquivada_em is null and b.duplicada_de_id is null and b.status_operacional in ('acordo_firmado','acordo_efetivado')) then 'Acordo'
        when exists(select 1 from public.cobrancas b where b.unidade_id=histu.id and b.arquivada_em is null and b.duplicada_de_id is null and b.status_operacional='pre_juridico') then 'Pré-jurídico'
        when exists(select 1 from public.cobrancas b where b.unidade_id=histu.id and b.arquivada_em is null and b.duplicada_de_id is null and b.status_operacional='pre_distribuicao') then 'Pré-distribuição'
        when exists(select 1 from public.cobrancas b where b.unidade_id=histu.id and b.arquivada_em is null and b.duplicada_de_id is null and b.status_operacional in ('novo','em_cobranca_ativa','em_negociacao','possivel_acordo')) then 'Extrajudicial'
        when min((x->>'vencimento')::date)>hoje-inicio then 'Administrativo' else 'Extrajudicial' end,
      histu.identificacao,histu.bloco,jsonb_build_object('recibos',jsonb_agg(x->>'recibo'),'conversao_id',v.id)
    from jsonb_array_elements(plano->'linhas') x join public.unidades histu on histu.condominio_id=c.id and histu.carteira_id=c.carteira_id
      and upper(trim(histu.identificacao))=upper(trim(x->>'unidade')) and upper(trim(coalesce(histu.bloco,'')))=upper(trim(x->>'bloco')) group by histu.id;
  get diagnostics historicos=row_count;
  if ignoradas>0 then avisos:=avisos||jsonb_build_array('Há linhas preservadas ou fora da régua; confira os contadores.');end if;
  resultado:=jsonb_build_object('ok',true,'conversaoId',v.id,'resumo',jsonb_build_object('cobrancasCriadas',criadas,'cobrancasAtualizadas',atualizadas,
    'cobrancasAnterioresRemovidas',0,'cobrancasArquivadas',arquivadas,'cobrancasIgnoradas',ignoradas,'parcelasCriadas',parcelas_criadas,
    'unidadesCriadas',unidades_criadas,'contatosAtualizados',contatos_atualizados,'mensagensCanceladas',canceladas,
    'captacaoHistoricaCriada',historicos,'inconsistencias',avisos));
  perform public.easy_cap_registrar_evento(c.carteira_id,'condominio',c.id,p_operador,v.id,v.preview_json->'easyCaptacao'->'substituicao',resultado);
  update public.conversoes_relatorio set status=case when jsonb_array_length(avisos)>0 then 'concluido_com_alertas' else 'concluido' end,
    inconsistencias_json=avisos,limpeza_maestro_em=now(),atualizado_em=now() where id=v.id;
  insert into public.easy_captacao_resultados(conversao_id,carteira_id,operador_id,plano_hash,plano_md5,resultado)
    values(v.id,c.carteira_id,p_operador,p_plano_hash,hash_sql,resultado);
  return resultado;
end $$;

revoke all on function public.easy_captacao_snapshot(uuid,uuid),public.easy_captacao_substituiveis(uuid,uuid),public.easy_cap_registrar_evento(uuid,text,uuid,uuid,uuid,jsonb,jsonb),
  public.easy_captacao_confirmar(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.easy_captacao_snapshot(uuid,uuid),public.easy_captacao_substituiveis(uuid,uuid),public.easy_cap_registrar_evento(uuid,text,uuid,uuid,uuid,jsonb,jsonb),
  public.easy_captacao_confirmar(uuid,uuid,text,text) to service_role;
-- A RPC destrutiva antiga continua suspensa pela migration P0-A.
notify pgrst,'reload schema';
commit;
