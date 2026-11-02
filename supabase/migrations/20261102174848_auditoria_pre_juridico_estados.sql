begin;
alter table public.pre_juridico_casos
  add column versao integer not null default 0,
  add column juridico_revisado_em timestamptz,
  add column juridico_revisado_por uuid references public.profiles(id),
  add column ajuizamento_autorizado_em timestamptz,
  add column ajuizamento_autorizado_por uuid references public.profiles(id);

create function public.cnj_valido(p_cnj text) returns boolean
language sql immutable set search_path='' as $$
select case when p_cnj ~ '^[0-9]{20}$' then
  mod((substr(p_cnj,1,7)||substr(p_cnj,10,11)||substr(p_cnj,8,2))::numeric,97)=1 else false end
$$;

create table public.pre_juridico_transicoes (
  id uuid primary key default gen_random_uuid(), caso_id uuid not null references public.pre_juridico_casos(id),
  carteira_id uuid not null, versao integer not null, anterior text, atual text not null,
  responsavel_id uuid references public.profiles(id), registrado_em timestamptz not null default now(),
  evidencia jsonb not null, unique(caso_id,versao)
);
alter table public.pre_juridico_transicoes enable row level security;
create policy pre_transicoes_select on public.pre_juridico_transicoes for select to authenticated
using (public.current_user_can_access_carteira(carteira_id));
grant select on public.pre_juridico_transicoes to authenticated;
revoke insert,update,delete on public.pre_juridico_transicoes from anon,authenticated;

create function public.proteger_etapa_pre_juridico()
returns trigger language plpgsql security definer set search_path='' as $$
declare papel text; mudou boolean;
begin
  if tg_op='INSERT' then
    if not (auth.uid() is null and current_setting('role',true) in ('service_role','postgres'))
      and (not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','gestor','operador'))
        or public.current_user_can_access_carteira(new.carteira_id) is not true) then
      raise exception 'Sem permissão para criar este caso.' using errcode='42501';
    end if;
    if new.etapa<>'aguardando_documentos' or coalesce(new.distribuicao_status,'')='distribuido' then
      raise exception 'Novos casos devem começar na confirmação de propriedade.';
    end if;
    new.juridico_revisado_em:=null; new.juridico_revisado_por:=null;
    new.ajuizamento_autorizado_em:=null; new.ajuizamento_autorizado_por:=null;
    new.distribuido_em:=null; new.judicializado_em:=null; new.distribuicao_cnj:=null;
    new.versao:=0; return new;
  end if;
  select role into papel from public.profiles where id=auth.uid();
  -- Delivery workers may acknowledge sending an already generated document,
  -- but cannot advance stages or manufacture legal confirmations.
  if auth.uid() is null and current_setting('role',true) in ('service_role','postgres')
    and old.procuracao_status='gerada' and new.procuracao_status='enviada'
    and (to_jsonb(new)-array['procuracao_status','updated_at'])=(to_jsonb(old)-array['procuracao_status','updated_at']) then
    new.versao:=old.versao+1; return new;
  end if;
  if papel is null or papel not in ('admin','gestor','operador')
    or public.current_user_can_access_carteira(old.carteira_id) is not true then
    raise exception 'Sem permissão para atualizar este caso.' using errcode='42501';
  end if;
  if new.carteira_id is distinct from old.carteira_id or new.unidade_id is distinct from old.unidade_id
    or new.condominio_id is distinct from old.condominio_id or new.cobranca_id is distinct from old.cobranca_id then
    raise exception 'O vínculo do caso não pode ser alterado durante o processamento.';
  end if;
  mudou:=new.etapa is distinct from old.etapa;
  if old.etapa='judicializado' then raise exception 'Caso judicializado não permite nova transição.'; end if;
  if mudou and not (case old.etapa
    when 'aguardando_administradora' then new.etapa='aguardando_documentos'
    when 'aguardando_documentos' then new.etapa='aguardando_sindico'
    when 'aguardando_sindico' then new.etapa='confirmar_juridico'
    when 'confirmar_juridico' then new.etapa='enviado_juridico'
    when 'enviado_juridico' then new.etapa='analise_juridica'
    when 'analise_juridica' then new.etapa in ('pendencia_juridica','autorizado_ajuizamento')
    when 'pendencia_juridica' then new.etapa='analise_juridica'
    when 'autorizado_ajuizamento' then new.etapa='pronto_juridico'
    when 'pronto_juridico' then new.etapa in ('judicializado','analise_juridica','aguardando_documentos')
    else false end) then raise exception 'Transição pré-jurídica inválida: % -> %.',old.etapa,new.etapa; end if;
  if new.etapa not in ('aguardando_documentos','aguardando_administradora') then
    if new.certidao_status is distinct from 'recebida' or new.certidao_recebida_em is null then
      raise exception 'Confirme o recebimento da certidão de propriedade.';
    end if;
  end if;
  if new.etapa not in ('aguardando_documentos','aguardando_administradora','aguardando_sindico') then
    if new.procuracao_status is distinct from 'assinada' or new.procuracao_assinada_em is null then
      raise exception 'Confirme a procuração assinada antes de avançar.';
    end if;
  end if;
  if new.etapa in ('enviado_juridico','analise_juridica','pendencia_juridica','autorizado_ajuizamento','pronto_juridico','judicializado') then
    if not (new.juridico_procuracao_assinada_confirmada and new.juridico_registro_recebido and new.juridico_laudo_enviado) then
      raise exception 'Confirme procuração, registro e laudo antes do envio ao jurídico.';
    end if;
  end if;
  -- Only a manager/admin may sign the legal review or confirm distribution.
  if mudou and (old.etapa='pronto_juridico' or new.etapa in ('analise_juridica','autorizado_ajuizamento','pronto_juridico','judicializado')) then
    if papel not in ('admin','gestor') then raise exception 'Revisão e distribuição exigem administrador ou gestor.' using errcode='42501'; end if;
  end if;
  if mudou and old.etapa='pronto_juridico' and new.etapa in ('analise_juridica','aguardando_documentos') then
    new.distribuicao_status:=null; new.distribuicao_cnj:=null; new.distribuido_em:=null;
    new.juridico_revisado_em:=null; new.juridico_revisado_por:=null;
    new.ajuizamento_autorizado_em:=null; new.ajuizamento_autorizado_por:=null;
  end if;
  if mudou and new.etapa='autorizado_ajuizamento' then
    if length(trim(coalesce(new.observacoes,'')))<3 then raise exception 'Registre a evidência da revisão e autorização jurídica.'; end if;
    new.juridico_revisado_em:=now(); new.juridico_revisado_por:=auth.uid();
    new.ajuizamento_autorizado_em:=now(); new.ajuizamento_autorizado_por:=auth.uid();
  elsif (new.juridico_revisado_em is distinct from old.juridico_revisado_em
     or new.juridico_revisado_por is distinct from old.juridico_revisado_por
     or new.ajuizamento_autorizado_em is distinct from old.ajuizamento_autorizado_em
     or new.ajuizamento_autorizado_por is distinct from old.ajuizamento_autorizado_por)
     and not (mudou and old.etapa='pronto_juridico' and new.etapa in ('analise_juridica','aguardando_documentos')) then
    raise exception 'Revisão jurídica deve ser registrada pela transição autorizada.';
  end if;
  if new.etapa in ('pronto_juridico','judicializado') then
    if new.juridico_revisado_em is null or new.ajuizamento_autorizado_em is null
      or new.juridico_revisado_por is null or new.ajuizamento_autorizado_por is null then
      raise exception 'Revisão e autorização jurídica obrigatórias antes da distribuição.';
    end if;
    if new.etapa='pronto_juridico' then
      new.distribuicao_status:='solicitado';
      new.distribuicao_solicitada_em:=coalesce(old.distribuicao_solicitada_em,now());
    end if;
  end if;
  if new.etapa='judicializado' then
    if new.unidade_id is null or public.cnj_valido(new.distribuicao_cnj) is not true
      or new.distribuicao_status is distinct from 'distribuido' then
      raise exception 'Distribuição válida com CNJ e unidade é obrigatória para judicializar.';
    end if;
    new.numero_processo:=new.distribuicao_cnj;
    new.distribuido_em:=now(); new.judicializado_em:=now();
  elsif coalesce(new.distribuicao_status,'')='distribuido' then
    raise exception 'A confirmação da distribuição deve concluir a judicialização atomicamente.';
  end if;
  new.versao:=old.versao+1; new.responsavel_id:=auth.uid();
  return new;
end $$;
create trigger aa_proteger_etapa_pre_juridico before insert or update on public.pre_juridico_casos
for each row execute function public.proteger_etapa_pre_juridico();

create function public.auditar_etapa_pre_juridico()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.pre_juridico_transicoes(caso_id,carteira_id,versao,anterior,atual,responsavel_id,evidencia)
  values(new.id,new.carteira_id,new.versao,old.etapa,new.etapa,auth.uid(),jsonb_build_object(
    'certidao',new.certidao_status,'procuracao',new.procuracao_status,'cnj',new.distribuicao_cnj,'observacoes',new.observacoes));
  return new;
end $$;
create trigger auditar_etapa_pre_juridico after update on public.pre_juridico_casos
for each row execute function public.auditar_etapa_pre_juridico();

-- Compare-and-swap under a row lock. All fields not in the whitelist are rejected.
create function public.atualizar_caso_pre_juridico(p_id uuid,p_versao integer,p_dados jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare caso public.pre_juridico_casos; novo public.pre_juridico_casos;
begin
  select * into caso from public.pre_juridico_casos where id=p_id for update;
  if not found or public.current_user_can_access_carteira(caso.carteira_id) is not true then raise exception 'Caso não encontrado ou sem acesso.'; end if;
  if p_versao is null or caso.versao<>p_versao then raise exception 'Caso alterado por outro operador. Atualize a página.' using errcode='40001'; end if;
  if jsonb_typeof(p_dados) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_dados) k
    where k not in ('etapa','observacoes','escritorio_juridico','numero_processo','prazo_etapa','protocolo_envio','tribunal','foro',
      'distribuicao_status','distribuicao_solicitada_em','distribuicao_cnj','distribuido_em','responsavel_id','enviado_juridico_em','judicializado_em',
      'juridico_procuracao_assinada_confirmada','juridico_registro_recebido','juridico_laudo_enviado',
      'certidao_status','certidao_solicitada_em','certidao_recebida_em','procuracao_status','procuracao_gerada_em','procuracao_assinada_em',
      'procuracao_lote_id','procuracao_lote_criado_em','procuracao_flow_id')) then raise exception 'Campos de atualização inválidos.'; end if;
  novo:=jsonb_populate_record(caso,p_dados);
  update public.pre_juridico_casos set etapa=novo.etapa,observacoes=novo.observacoes,escritorio_juridico=novo.escritorio_juridico,
    numero_processo=novo.numero_processo,prazo_etapa=novo.prazo_etapa,protocolo_envio=novo.protocolo_envio,tribunal=novo.tribunal,foro=novo.foro,
    distribuicao_status=novo.distribuicao_status,distribuicao_solicitada_em=novo.distribuicao_solicitada_em,
    distribuicao_cnj=novo.distribuicao_cnj,distribuido_em=novo.distribuido_em,
    responsavel_id=novo.responsavel_id,enviado_juridico_em=novo.enviado_juridico_em,judicializado_em=novo.judicializado_em,
    juridico_procuracao_assinada_confirmada=novo.juridico_procuracao_assinada_confirmada,
    juridico_registro_recebido=novo.juridico_registro_recebido,juridico_laudo_enviado=novo.juridico_laudo_enviado,
    certidao_status=novo.certidao_status,certidao_solicitada_em=novo.certidao_solicitada_em,certidao_recebida_em=novo.certidao_recebida_em,
    procuracao_status=novo.procuracao_status,procuracao_gerada_em=novo.procuracao_gerada_em,procuracao_assinada_em=novo.procuracao_assinada_em,
    procuracao_lote_id=novo.procuracao_lote_id,procuracao_lote_criado_em=novo.procuracao_lote_criado_em,procuracao_flow_id=novo.procuracao_flow_id
  where id=caso.id;
end $$;
create function public.atualizar_casos_pre_juridico(p_alteracoes jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
  if jsonb_typeof(p_alteracoes) is distinct from 'array' or jsonb_array_length(p_alteracoes)<1 then
    raise exception 'Selecione ao menos um caso.';
  end if;
  for item in select value from jsonb_array_elements(p_alteracoes) order by value->>'id' loop
    perform public.atualizar_caso_pre_juridico((item->>'id')::uuid,(item->>'versao')::integer,item->'dados');
  end loop;
end $$;
revoke all on function public.atualizar_casos_pre_juridico(jsonb) from public,anon;
grant execute on function public.atualizar_casos_pre_juridico(jsonb) to authenticated;
revoke all on function public.proteger_etapa_pre_juridico(),public.auditar_etapa_pre_juridico() from public,anon,authenticated;
revoke all on function public.atualizar_caso_pre_juridico(uuid,integer,jsonb) from public,anon;
grant execute on function public.atualizar_caso_pre_juridico(uuid,integer,jsonb) to authenticated;
revoke all on function public.cnj_valido(text) from public,anon;
grant execute on function public.cnj_valido(text) to authenticated;
notify pgrst,'reload schema';
commit;
