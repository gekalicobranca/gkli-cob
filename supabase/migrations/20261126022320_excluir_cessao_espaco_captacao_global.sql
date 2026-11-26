-- Regra global de entrada. Não altera/exclui cobranças ou acordos existentes.
create or replace function public.origem_tem_cessao_espaco(p_origem jsonb)
returns boolean language plpgsql immutable set search_path='' as $fn$
declare campo text; texto text; filho jsonb;
begin
  if jsonb_typeof(p_origem) is distinct from 'object' then return false; end if;
  foreach campo in array array['tipo','natureza','natureza_da_cobranca','tipo_cobranca','tipo_de_cobranca',
    'historico','descricao','observacoes','obs','detalhesOrigem','detalhes_origem'] loop
    texto := lower(translate(coalesce(p_origem->>campo,''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'));
    texto := trim(regexp_replace(texto,'[[:space:]]+',' ','g'));
    if texto in ('cessao_espaco','locacao_espaco','cessao_de_espaco','locacao_de_espaco')
      or texto ~ '\m(cessao|locacao|aluguel)\M.{0,100}\m(espaco|salao|area)\M' then return true; end if;
  end loop;
  foreach campo in array array['tiposCobranca','tipos_cobranca'] loop
    if jsonb_typeof(p_origem->campo)='array' then
      for filho in select value from jsonb_array_elements(p_origem->campo) loop
        if public.origem_tem_cessao_espaco(jsonb_build_object('tipo',filho)) then return true; end if;
      end loop;
    end if;
  end loop;
  foreach campo in array array['composicaoOrigem','composicao_origem','parcelas'] loop
    if jsonb_typeof(p_origem->campo)='array' then
      for filho in select value from jsonb_array_elements(p_origem->campo) loop
        if public.origem_tem_cessao_espaco(filho) then return true; end if;
      end loop;
    end if;
  end loop;
  return false;
end $fn$;

create or replace function public.impedir_importacao_cessao_espaco()
returns trigger language plpgsql set search_path='' as $fn$
declare previa jsonb; recibo text; unidade text; bloco text;
begin
  if coalesce(new.excluida_por_cessao_espaco,false)
    or public.origem_tem_cessao_espaco(jsonb_build_object('observacoes',new.observacoes)) then
    raise exception using errcode='23514', message='Cessão/locação de espaço excluída da captação em todos os condomínios.';
  end if;
  -- Defesa para callers antigos que guardam somente o recibo nas observações.
  if new.conversao_relatorio_id is not null then
    select r.preview_json into previa from public.conversoes_relatorio r
      where r.id=new.conversao_relatorio_id and r.carteira_id=new.carteira_id and r.condominio_id=new.condominio_id;
    recibo := (regexp_match(coalesce(new.observacoes,''),'(?i)recibo\s*:?\s*(?:(?:AE|AJ|J|A|D|B|P)\s+)?([0-9]{5,})'))[1];
    select u.identificacao,u.bloco into unidade,bloco from public.unidades u
      where u.id=new.unidade_id and u.condominio_id=new.condominio_id and u.carteira_id=new.carteira_id;
    if recibo is not null and unidade is not null then
      if exists (select 1 from jsonb_array_elements(
        (case when jsonb_typeof(previa->'cobrancas')='array' then previa->'cobrancas' else '[]'::jsonb end)
        || (case when jsonb_typeof(previa->'exclusaoCessaoEspaco'->'recibos')='array' then previa->'exclusaoCessaoEspaco'->'recibos' else '[]'::jsonb end)) as itens(item)
        where regexp_replace(item->>'recibo','[^0-9]','','g')=recibo
          and ltrim(upper(trim(item->>'unidade')),'0')=ltrim(upper(trim(unidade)),'0')
          and coalesce(nullif(upper(trim(item->>'bloco')),''),'0')=coalesce(nullif(upper(trim(bloco)),''),'0')
          and public.origem_tem_cessao_espaco(item)) then
          raise exception using errcode='23514',message='Recibo de cessão/locação de espaço identificado na composição original; captação proibida.';
      end if;
    end if;
  end if;
  return new;
end $fn$;

drop trigger if exists a_impedir_importacao_cessao_villa_lobos on public.cobrancas;
create trigger a_impedir_importacao_cessao_espaco before insert on public.cobrancas
  for each row execute function public.impedir_importacao_cessao_espaco();

revoke all on function public.origem_tem_cessao_espaco(jsonb) from public,anon;
grant execute on function public.origem_tem_cessao_espaco(jsonb) to authenticated,service_role;
revoke all on function public.impedir_importacao_cessao_espaco() from public,anon;

-- A RPC transacional do Easy também pode reutilizar uma cobrança existente,
-- sem passar por INSERT. Recusar a conclusão desfaz o commit inteiro nesse caso.
create or replace function public.validar_exclusao_cessao_captacao()
returns trigger language plpgsql set search_path='' as $fn$
begin
  if coalesce(new.status,'') not in ('concluido','concluido_com_alertas') then return new; end if;
  if TG_OP='UPDATE' and old.status in ('concluido','concluido_com_alertas') then return new; end if;
  if jsonb_typeof(new.preview_json->'cobrancas')='array' and exists (
    select 1 from jsonb_array_elements(new.preview_json->'cobrancas') i
    where public.origem_tem_cessao_espaco(i)
  ) then
    raise exception using errcode='23514',message='Captação contém cessão/locação de espaço. Refaça a prévia para aplicar a exclusão antes de confirmar.';
  end if;
  return new;
end $fn$;
create trigger validar_exclusao_cessao_captacao before insert or update of status on public.conversoes_relatorio
  for each row execute function public.validar_exclusao_cessao_captacao();
revoke all on function public.validar_exclusao_cessao_captacao() from public,anon;
