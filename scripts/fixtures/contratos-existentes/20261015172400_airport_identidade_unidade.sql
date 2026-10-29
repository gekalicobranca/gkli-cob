-- Regra explícita do Airport; outros condomínios mantêm sua identidade atual.
create or replace function public.padronizar_unidade_airport(p_unidade text,p_bloco text,p_condominio uuid)
returns jsonb language plpgsql immutable set search_path='' as $$
declare u text; b text; pu text; pb text; n text;
begin
 if p_condominio is distinct from '3d99c59b-5e23-497a-837d-ce5dc152708a'::uuid then return jsonb_build_object('identificacao',p_unidade,'bloco',p_bloco);end if;
 u:=public.token_unidade_importacao(p_unidade);
 b:=regexp_replace(normalize(upper(trim(coalesce(p_bloco,''))),NFD),U&'[\0300-\036f]','','g');
 b:=regexp_replace(b,'^(TORRE|BLOCO|BL|EDIFICIO)\s+','','i');
 pb:=case when b in ('H','HOTEL') then 'H' when b in ('S','SUITE','SUITES') then 'S' end;
 pu:=case when u ~ '^[HS][0-9]{1,4}$' then left(u,1) end;
 if (b<>'' and b !~ '^(0+|SEM\s*BLOCO|N/?A)$' and pb is null) or (pu is not null and pb is not null and pu<>pb) then raise exception 'Prefixo e bloco incompatíveis no Airport.';end if;
 n:=case when pu is not null then substring(u from 2) else u end;
 if coalesce(pu,pb) is null or n !~ '^[0-9]{1,4}$' then raise exception 'Informe H/HOTEL ou S/SUITES para a unidade do Airport.';end if;
 return jsonb_build_object('identificacao',coalesce(pu,pb)||lpad(n,4,'0'),'bloco',null);
end $$;

create or replace function public.identidade_unidade_importacao(p_unidade text,p_bloco text,p_condominio uuid)
returns jsonb language sql immutable set search_path='' as $$
 select public.identidade_unidade_importacao(v->>'identificacao',v->>'bloco') from (select public.padronizar_unidade_airport(p_unidade,p_bloco,p_condominio) v) q;
$$;
revoke all on function public.padronizar_unidade_airport(text,text,uuid),public.identidade_unidade_importacao(text,text,uuid) from public,anon;
grant execute on function public.padronizar_unidade_airport(text,text,uuid),public.identidade_unidade_importacao(text,text,uuid) to authenticated,service_role;

create or replace function public.garantir_unidade_importacao(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  cid uuid:=nullif(p_payload->>'condominio_id','')::uuid;
  carteira uuid:=nullif(p_payload->>'carteira_id','')::uuid;
  hint uuid:=nullif(p_payload->>'unidade_id','')::uuid;
  c public.condominios; u public.unidades; alvo jsonb; normalized jsonb; ids uuid[];
  identificacao text:=trim(coalesce(nullif(p_payload->>'identificacao',''),p_payload->>'unidade',''));
  bloco text:=nullif(trim(p_payload->>'bloco'),''); unidade_mask text; bloco_mask text; criada boolean:=false; canon jsonb;
begin
  if cid is null or carteira is null or identificacao='' then raise exception 'Linha sem carteira, condomínio ou identificação de unidade.'; end if;
  -- RLS e carteira do condomínio são respeitadas; a função não eleva privilégios.
  select * into c from public.condominios where id=cid;
  if not found or c.carteira_id is distinct from carteira then raise exception 'Condomínio indisponível ou fora da carteira informada.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('importacao-unidade:'||cid::text,0));
  canon:=public.padronizar_unidade_airport(identificacao,bloco,cid); identificacao:=canon->>'identificacao'; bloco:=canon->>'bloco';
  alvo:=public.identidade_unidade_importacao(identificacao,bloco,cid);
  if alvo->>'unidade'='' then raise exception 'Identificação de unidade vazia após normalização.'; end if;
  select array_agg(x.id) into ids from public.unidades x
    where x.condominio_id=cid
      and public.identidade_unidade_importacao(x.identificacao,x.bloco,cid)->>'completa'=alvo->>'completa'
      and public.identidades_unidades_compativeis_importacao(alvo,public.identidade_unidade_importacao(x.identificacao,x.bloco,cid));
  if coalesce(cardinality(ids),0)>1 then raise exception 'Unidade ambígua após normalização. Revise os cadastros antes de importar.'; end if;
  if hint is not null and exists(select 1 from public.unidades where id=hint) and hint is distinct from ids[1] then
    raise exception 'Unidade da prévia não corresponde ao condomínio, bloco e identificação da linha.';
  end if;
  if coalesce(cardinality(ids),0)=1 then
    select * into strict u from public.unidades where id=ids[1] for update;
    if u.carteira_id is distinct from carteira then raise exception 'Unidade fora da carteira informada.'; end if;
    canon:=public.padronizar_unidade_airport(u.identificacao,u.bloco,cid);
    normalized:=public.identidade_unidade_importacao(u.identificacao,u.bloco,cid);
    unidade_mask:=coalesce(public.formatar_mascara_importacao(canon->>'identificacao',c.mascara_unidade),public.formatar_mascara_importacao(normalized->>'local',c.mascara_unidade),public.formatar_mascara_importacao(normalized->>'completa',c.mascara_unidade));
    bloco_mask:=public.formatar_mascara_importacao(case when nullif(trim(c.mascara_bloco),'') is null then canon->>'bloco' else coalesce(nullif(normalized->>'bloco',''),'0') end,c.mascara_bloco);
  else
    -- Número sem bloco nunca autoriza adivinhar uma torre, nem criar outra cópia.
    if exists(select 1 from public.unidades x cross join lateral (select public.identidade_unidade_importacao(x.identificacao,x.bloco,cid) k) q
      where x.condominio_id=cid and (
        (alvo->>'bloco'='' and q.k->>'bloco'<>'' and alvo->>'unidade'=q.k->>'local') or
        (alvo->>'bloco'<>'' and q.k->>'bloco'='' and alvo->>'local'=q.k->>'unidade'))) then
      raise exception 'Há unidade semelhante sem evidência suficiente do bloco. Informe ou revise o bloco antes de importar.';
    end if;
    unidade_mask:=coalesce(public.formatar_mascara_importacao(identificacao,c.mascara_unidade),public.formatar_mascara_importacao(alvo->>'local',c.mascara_unidade),public.formatar_mascara_importacao(alvo->>'completa',c.mascara_unidade));
    bloco_mask:=public.formatar_mascara_importacao(case when nullif(trim(c.mascara_bloco),'') is null then bloco else coalesce(nullif(alvo->>'bloco',''),'0') end,c.mascara_bloco);
  end if;
  if unidade_mask is null or not public.valor_corresponde_mascara(unidade_mask,c.mascara_unidade) or not public.valor_corresponde_mascara(bloco_mask,c.mascara_bloco) then
    raise exception 'Formato incompatível com a máscara do condomínio. Revise a unidade e o bloco.';
  end if;
  normalized:=public.identidade_unidade_importacao(unidade_mask,bloco_mask);
  if not public.identidades_unidades_compativeis_importacao(alvo,normalized) then raise exception 'Máscara alteraria a identidade da unidade. Revise o cadastro.'; end if;
  if coalesce(cardinality(ids),0)=1 then
    -- Atualiza apenas máscara, no mesmo ID. Responsável/contatos, status e vínculos permanecem intactos.
    if u.identificacao is distinct from unidade_mask or u.bloco is distinct from bloco_mask then
      update public.unidades set identificacao=unidade_mask,bloco=bloco_mask where id=u.id;
    end if;
  else
    insert into public.unidades(carteira_id,condominio_id,identificacao,bloco,responsavel_nome,responsavel_documento,telefone,email,status,observacoes)
    values(carteira,cid,unidade_mask,bloco_mask,nullif(trim(p_payload->>'responsavel_nome'),''),nullif(trim(p_payload->>'responsavel_documento'),''),nullif(trim(p_payload->>'telefone'),''),nullif(trim(p_payload->>'email'),''),'ativa',coalesce(nullif(p_payload->>'observacoes_criacao',''),'Criada por importação.')) returning * into u;
    criada:=true;
  end if;
  return jsonb_build_object('id',u.id,'criada',criada,'reutilizada',not criada);
end;
$$;


notify pgrst, 'reload schema';
