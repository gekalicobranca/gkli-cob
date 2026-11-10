-- Identidade compartilhada pelos dois importadores. Não modifica cadastros em lote.
create or replace function public.token_unidade_importacao(p_valor text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select regexp_replace(
    regexp_replace(regexp_replace(normalize(upper(trim(coalesce(p_valor,''))), NFD), U&'[\0300-\036f]', '', 'g'), '[^A-Z0-9]', '', 'g'),
    '(^|[^0-9])0+([0-9])', '\1\2', 'g');
$$;

create or replace function public.identidade_unidade_importacao(p_unidade text,p_bloco text)
returns jsonb language plpgsql immutable parallel safe set search_path = '' as $$
declare u text:=public.token_unidade_importacao(p_unidade); b text; local_unidade text; raw text:=regexp_replace(normalize(upper(trim(coalesce(p_bloco,''))),NFD),U&'[\0300-\036f]','','g');
begin
  if raw='' or raw ~ '^(0+|SEM\s*BLOCO|N/?A)$' then b:='';
  elsif raw in ('GARAGEM','GARAGENS','VG') then b:='VG';
  else b:=public.token_unidade_importacao(regexp_replace(raw,'^(TORRE|BLOCO|BL|EDIFICIO)\s+','','i')); end if;
  local_unidade:=u;
  if b ~ '[A-Z]' and left(u,length(b))=b and substring(u from length(b)+1) ~ '^(\d|L\d)' then
    local_unidade:=public.token_unidade_importacao(substring(u from length(b)+1));
  end if;
  return jsonb_build_object('unidade',u,'bloco',b,'local',local_unidade,'completa',case when b<>'' then b||local_unidade else u end);
end;
$$;

create or replace function public.identidades_unidades_compativeis_importacao(a jsonb,b jsonb)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select a->>'unidade'<>'' and b->>'unidade'<>'' and case
    when a->>'bloco'<>'' and b->>'bloco'<>'' then a->>'bloco'=b->>'bloco' and a->>'local'=b->>'local'
    when a->>'bloco'='' and b->>'bloco'='' then a->>'unidade'=b->>'unidade'
    when a->>'bloco'='' then a->>'unidade' ~ '[A-Z]' and a->>'unidade'=b->>'completa'
    else b->>'unidade' ~ '[A-Z]' and b->>'unidade'=a->>'completa' end;
$$;

-- Preenche somente zeros de máscara; nunca corta dígitos significativos.
create or replace function public.formatar_mascara_importacao(p_valor text,p_mascara text)
returns text language plpgsql immutable parallel safe set search_path = '' as $$
declare v text:=upper(trim(coalesce(p_valor,''))); m text:=upper(trim(coalesce(p_mascara,'')));
  pattern text:='^'; i int:=1; j int; n int; ch text; captures text[]; resultado text:=''; digits text;
begin
  if m='' then return nullif(v,''); end if;
  if public.valor_corresponde_mascara(v,m) then return v; end if;
  while i<=length(m) loop
    ch:=substr(m,i,1);
    if ch='0' then
      j:=i; while j<=length(m) and substr(m,j,1)='0' loop j:=j+1; end loop;
      pattern:=pattern||'([0-9]+)'; i:=j;
    else
      if ch='A' then pattern:=pattern||'([A-Z])';
      elsif ch='*' then pattern:=pattern||'(.)';
      else
        if strpos(E'\\.^$|?*+(){}[]',ch)>0 then ch:=E'\\'||ch; end if;
        pattern:=pattern||'('||ch||')';
      end if;
      i:=i+1;
    end if;
  end loop;
  captures:=regexp_match(v,pattern||'$');
  if captures is null then return null; end if;
  i:=1; n:=1;
  while i<=length(m) loop
    if substr(m,i,1)='0' then
      j:=i; while j<=length(m) and substr(m,j,1)='0' loop j:=j+1; end loop;
      digits:=coalesce(nullif(ltrim(captures[n],'0'),''),'0');
      if length(digits)>j-i then return null; end if;
      resultado:=resultado||lpad(digits,j-i,'0'); i:=j;
    else resultado:=resultado||captures[n]; i:=i+1; end if;
    n:=n+1;
  end loop;
  return resultado;
end;
$$;

create index if not exists idx_unidades_identidade_importacao
  on public.unidades(condominio_id, (public.identidade_unidade_importacao(identificacao,bloco)->>'completa'));

create or replace function public.garantir_unidade_importacao(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  cid uuid:=nullif(p_payload->>'condominio_id','')::uuid;
  carteira uuid:=nullif(p_payload->>'carteira_id','')::uuid;
  hint uuid:=nullif(p_payload->>'unidade_id','')::uuid;
  c public.condominios; u public.unidades; alvo jsonb; normalized jsonb; ids uuid[];
  identificacao text:=trim(coalesce(nullif(p_payload->>'identificacao',''),p_payload->>'unidade',''));
  bloco text:=nullif(trim(p_payload->>'bloco'),''); unidade_mask text; bloco_mask text; criada boolean:=false;
begin
  if cid is null or carteira is null or identificacao='' then raise exception 'Linha sem carteira, condomínio ou identificação de unidade.'; end if;
  -- RLS e carteira do condomínio são respeitadas; a função não eleva privilégios.
  select * into c from public.condominios where id=cid;
  if not found or c.carteira_id is distinct from carteira then raise exception 'Condomínio indisponível ou fora da carteira informada.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('importacao-unidade:'||cid::text,0));
  alvo:=public.identidade_unidade_importacao(identificacao,bloco);
  if alvo->>'unidade'='' then raise exception 'Identificação de unidade vazia após normalização.'; end if;
  select array_agg(x.id) into ids from public.unidades x
    where x.condominio_id=cid
      and public.identidade_unidade_importacao(x.identificacao,x.bloco)->>'completa'=alvo->>'completa'
      and public.identidades_unidades_compativeis_importacao(alvo,public.identidade_unidade_importacao(x.identificacao,x.bloco));
  if coalesce(cardinality(ids),0)>1 then raise exception 'Unidade ambígua após normalização. Revise os cadastros antes de importar.'; end if;
  if hint is not null and exists(select 1 from public.unidades where id=hint) and hint is distinct from ids[1] then
    raise exception 'Unidade da prévia não corresponde ao condomínio, bloco e identificação da linha.';
  end if;
  if coalesce(cardinality(ids),0)=1 then
    select * into strict u from public.unidades where id=ids[1] for update;
    if u.carteira_id is distinct from carteira then raise exception 'Unidade fora da carteira informada.'; end if;
    normalized:=public.identidade_unidade_importacao(u.identificacao,u.bloco);
    unidade_mask:=coalesce(public.formatar_mascara_importacao(u.identificacao,c.mascara_unidade),public.formatar_mascara_importacao(normalized->>'local',c.mascara_unidade),public.formatar_mascara_importacao(normalized->>'completa',c.mascara_unidade));
    bloco_mask:=public.formatar_mascara_importacao(case when nullif(trim(c.mascara_bloco),'') is null then u.bloco else coalesce(nullif(normalized->>'bloco',''),'0') end,c.mascara_bloco);
  else
    -- Número sem bloco nunca autoriza adivinhar uma torre, nem criar outra cópia.
    if exists(select 1 from public.unidades x cross join lateral (select public.identidade_unidade_importacao(x.identificacao,x.bloco) k) q
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

revoke all on function public.token_unidade_importacao(text), public.identidade_unidade_importacao(text,text), public.identidades_unidades_compativeis_importacao(jsonb,jsonb), public.formatar_mascara_importacao(text,text), public.garantir_unidade_importacao(jsonb) from public,anon;
grant execute on function public.token_unidade_importacao(text), public.identidade_unidade_importacao(text,text), public.identidades_unidades_compativeis_importacao(jsonb,jsonb), public.formatar_mascara_importacao(text,text), public.garantir_unidade_importacao(jsonb) to authenticated,service_role;

notify pgrst, 'reload schema';
