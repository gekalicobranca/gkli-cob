-- A verificação de origem anterior é por comando/lote, não N leituras do relatório.
create or replace function public.impedir_importacao_cessao_espaco()
returns trigger language plpgsql set search_path='' as $fn$
begin
  if coalesce(new.excluida_por_cessao_espaco,false)
    or public.origem_tem_cessao_espaco(jsonb_build_object('observacoes',new.observacoes)) then
    raise exception using errcode='23514',message='Cessão/locação de espaço excluída da captação em todos os condomínios.';
  end if;
  return new;
end $fn$;

drop trigger b_impedir_reimportacao_cessao_conhecida on public.cobrancas;
create or replace function public.impedir_reimportacao_cessao_conhecida() returns trigger
language plpgsql set search_path='' as $fn$
declare condominio uuid;
begin
  for condominio in select distinct n.condominio_id from novas_cobrancas n loop
    if exists (
      select 1 from public.captacao_recibos_cessao_espaco(array[condominio]) r
      join novas_cobrancas n on n.condominio_id=r.condominio_id and n.carteira_id=r.carteira_id
      join public.unidades u on u.id=n.unidade_id and u.condominio_id=n.condominio_id and u.carteira_id=n.carteira_id
      where ltrim(upper(trim(u.identificacao)),'0')=ltrim(upper(trim(r.unidade)),'0')
        and coalesce(nullif(upper(trim(u.bloco)),''),'0')=r.bloco
        and upper((regexp_match(coalesce(n.observacoes,''),'(?i)recibo\s*:?\s*(?:(?:AE|AJ|J|A|D|B|P)\s+)?([a-z0-9][a-z0-9._/-]*)(?=\s|\||$)'))[1])=r.recibo
    ) then
      raise exception using errcode='23514',message='Recibo de cessão/locação de espaço identificado na composição original. Reimportação proibida.';
    end if;
  end loop;
  return null;
end $fn$;
create trigger b_impedir_reimportacao_cessao_conhecida after insert on public.cobrancas
  referencing new table as novas_cobrancas for each statement execute function public.impedir_reimportacao_cessao_conhecida();

create or replace function public.validar_exclusao_cessao_captacao()
returns trigger language plpgsql set search_path='' as $fn$
begin
  if coalesce(new.status,'') not in ('concluido','concluido_com_alertas') then return new; end if;
  if TG_OP='UPDATE' and old.status in ('concluido','concluido_com_alertas') then return new; end if;
  if jsonb_typeof(new.preview_json->'cobrancas')='array' and (
    exists (select 1 from jsonb_array_elements(new.preview_json->'cobrancas') i where public.origem_tem_cessao_espaco(i))
    or exists (
      select 1 from public.captacao_recibos_cessao_espaco(array[new.condominio_id]) r
      join jsonb_array_elements(new.preview_json->'cobrancas') i
        on ltrim(upper(trim(i->>'unidade')),'0')=ltrim(upper(trim(r.unidade)),'0')
        and coalesce(nullif(upper(trim(i->>'bloco')),''),'0')=r.bloco
        and upper(regexp_replace(trim(i->>'recibo'),'^(AE|AJ|J|A|D|B|P)[[:space:]]+','','i'))=r.recibo
      where r.carteira_id=new.carteira_id
    )
  ) then
    raise exception using errcode='23514',message='Captação contém recibo de cessão/locação de espaço. Refaça a prévia para aplicar a exclusão antes de confirmar.';
  end if;
  return new;
end $fn$;
