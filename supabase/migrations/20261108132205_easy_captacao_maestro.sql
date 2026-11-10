begin;
-- Mesmos status, recorte anual e vínculos preservados pela limpeza do Maestro.
create function public.easy_captacao_snapshot(p_condominio uuid, p_carteira uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('ano',extract(year from now() at time zone 'America/Sao_Paulo')::integer,
    'quantidade',count(*),'valor',coalesce(sum(c.valor_atualizado),0),
    'versao',md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb)::text))
  from public.cobrancas c where c.condominio_id=p_condominio and c.carteira_id=p_carteira
    and c.duplicada_de_id is null and c.status_operacional in ('regular','novo','em_cobranca_ativa')
    and extract(year from c.vencimento)=extract(year from now() at time zone 'America/Sao_Paulo')
    and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
    and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
    and not exists(select 1 from public.cobrancas d where d.duplicada_de_id=c.id);
$$;

create function public.easy_preparar_captacao(p_conversao uuid, p_versao text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare conv public.conversoes_relatorio; atual jsonb; resultado jsonb;
begin
  select * into strict conv from public.conversoes_relatorio where id=p_conversao for update;
  if conv.origem<>'easy_captacao' or conv.preview_json->'easyCaptacao' is null then
    raise exception 'Captação Easy inválida.';
  end if;
  if conv.status<>'preview' or conv.limpeza_maestro_em is not null then
    raise exception 'Esta captação já foi confirmada ou está em processamento. Consulte o resultado antes de tentar novamente.';
  end if;
  perform id from public.condominios where id=conv.condominio_id and carteira_id=conv.carteira_id for update;
  if not found then raise exception 'Condomínio fora da carteira.'; end if;
  if exists(select 1 from public.conversoes_relatorio c where c.condominio_id=conv.condominio_id
    and c.id<>p_conversao and c.origem='easy_captacao' and c.status='processando') then
    raise exception 'Já existe uma captação em processamento para este condomínio. Aguarde o resultado.';
  end if;
  if exists(select 1 from public.agente_receitas r join public.agente_administradoras a on a.id=r.administradora_id
    where r.ativo and a.ativo and coalesce(r.script_key,'')<>'' and r.config_json->>'condominio_id'=conv.condominio_id::text) then
    raise exception 'Este condomínio já possui agente remoto. Utilize o Maestro.';
  end if;
  perform id from public.cobrancas where condominio_id=conv.condominio_id and carteira_id=conv.carteira_id order by id for update;
  atual:=public.easy_captacao_snapshot(conv.condominio_id,conv.carteira_id);
  if p_versao is null or atual->>'versao'<>p_versao
    or atual->>'ano' is distinct from conv.preview_json->'easyCaptacao'->'substituicao'->>'ano' then
    raise exception 'As cobranças mudaram após a leitura. Envie o arquivo novamente para conferir um resumo atualizado.';
  end if;
  resultado:=public.maestro_substituir_cobrancas_conversao(p_conversao);
  update public.conversoes_relatorio set status='processando', atualizado_em=now() where id=p_conversao;
  return resultado;
end $$;
revoke all on function public.easy_captacao_snapshot(uuid,uuid),public.easy_preparar_captacao(uuid,text) from public,anon,authenticated;
grant execute on function public.easy_captacao_snapshot(uuid,uuid),public.easy_preparar_captacao(uuid,text) to service_role;
alter function public.easy_preparar_captacao(uuid,text) set statement_timeout='60s';
notify pgrst,'reload schema';
commit;
