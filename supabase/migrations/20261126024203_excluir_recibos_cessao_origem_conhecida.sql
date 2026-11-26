-- Composição já conhecida impede a volta por planilha que omite o histórico.
create function public.captacao_recibos_cessao_espaco(p_condominios uuid[], p_unidade text default null,
  p_bloco text default null, p_recibo text default null)
returns table(carteira_id uuid,condominio_id uuid,unidade text,bloco text,recibo text)
language sql stable set search_path='' as $fn$
  select distinct r.carteira_id,r.condominio_id,i->>'unidade',coalesce(nullif(upper(trim(i->>'bloco')),''),'0'),
    upper(regexp_replace(trim(i->>'recibo'),'^(AE|AJ|J|A|D|B|P)[[:space:]]+','','i'))
  from public.conversoes_relatorio r cross join lateral jsonb_array_elements(
    (case when jsonb_typeof(r.preview_json->'cobrancas')='array' then r.preview_json->'cobrancas' else '[]'::jsonb end)
    || (case when jsonb_typeof(r.preview_json->'exclusaoCessaoEspaco'->'recibos')='array' then r.preview_json->'exclusaoCessaoEspaco'->'recibos' else '[]'::jsonb end)) i
  where r.condominio_id=any(p_condominios) and nullif(trim(i->>'recibo'),'') is not null
    and (p_unidade is null or ltrim(upper(trim(i->>'unidade')),'0')=ltrim(upper(trim(p_unidade)),'0'))
    and (p_bloco is null or coalesce(nullif(upper(trim(i->>'bloco')),''),'0')=coalesce(nullif(upper(trim(p_bloco)),''),'0'))
    and (p_recibo is null or upper(regexp_replace(trim(i->>'recibo'),'^(AE|AJ|J|A|D|B|P)[[:space:]]+','','i'))=upper(p_recibo))
    and public.origem_tem_cessao_espaco(i);
$fn$;
revoke all on function public.captacao_recibos_cessao_espaco(uuid[],text,text,text) from public,anon;
grant execute on function public.captacao_recibos_cessao_espaco(uuid[],text,text,text) to authenticated,service_role;

create function public.impedir_reimportacao_cessao_conhecida() returns trigger
language plpgsql set search_path='' as $fn$
declare recibo text; unidade text; bloco text;
begin
  recibo := (regexp_match(coalesce(new.observacoes,''),'(?i)recibo\s*:?\s*(?:(?:AE|AJ|J|A|D|B|P)\s+)?([a-z0-9][a-z0-9._/-]*)(?=\s|\||$)'))[1];
  if recibo is null then return new; end if;
  select u.identificacao,u.bloco into unidade,bloco from public.unidades u
    where u.id=new.unidade_id and u.carteira_id=new.carteira_id and u.condominio_id=new.condominio_id;
  if unidade is not null and exists (select 1 from public.captacao_recibos_cessao_espaco(
    array[new.condominio_id],unidade,coalesce(bloco,'0'),recibo) r where r.carteira_id=new.carteira_id) then
    raise exception using errcode='23514',message='Recibo de cessão/locação de espaço já identificado na origem. Reimportação proibida.';
  end if;
  return new;
end $fn$;
create trigger b_impedir_reimportacao_cessao_conhecida before insert on public.cobrancas
  for each row execute function public.impedir_reimportacao_cessao_conhecida();
revoke all on function public.impedir_reimportacao_cessao_conhecida() from public,anon;

create or replace function public.validar_exclusao_cessao_captacao()
returns trigger language plpgsql set search_path='' as $fn$
begin
  if coalesce(new.status,'') not in ('concluido','concluido_com_alertas') then return new; end if;
  if TG_OP='UPDATE' and old.status in ('concluido','concluido_com_alertas') then return new; end if;
  if jsonb_typeof(new.preview_json->'cobrancas')='array' and exists (
    select 1 from jsonb_array_elements(new.preview_json->'cobrancas') i
    where public.origem_tem_cessao_espaco(i) or (
      nullif(trim(i->>'recibo'),'') is not null and nullif(trim(i->>'unidade'),'') is not null
      and exists (select 1 from public.captacao_recibos_cessao_espaco(array[new.condominio_id],
        i->>'unidade',coalesce(i->>'bloco','0'),
        regexp_replace(trim(i->>'recibo'),'^(AE|AJ|J|A|D|B|P)[[:space:]]+','','i')) r
        where r.carteira_id=new.carteira_id)
    )
  ) then
    raise exception using errcode='23514',message='Captação contém recibo de cessão/locação de espaço. Refaça a prévia para aplicar a exclusão antes de confirmar.';
  end if;
  return new;
end $fn$;
