begin;

alter table public.condominios
  add column pre_juridico_minimo_cotas integer not null default 5
    check (pre_juridico_minimo_cotas >= 1);

create function public.pre_juridico_unidades_com_minimo(p_unidades uuid[])
returns setof uuid language sql stable security invoker set search_path = '' as $$
  select u.id
  from public.unidades u
  join public.condominios c on c.id = u.condominio_id and c.carteira_id = u.carteira_id
  join public.carteiras ct on ct.id = c.carteira_id
  join public.cobrancas b on b.unidade_id = u.id and b.condominio_id = c.id and b.carteira_id = c.carteira_id
  where u.id = any(p_unidades) and c.status = 'ativo'
    and c.pre_juridico_habilitado and ct.pre_juridico_habilitado
    and not u.acao_judicial and nullif(trim(u.numero_processo), '') is null
    and u.conducao_processo not in ('nosso_escritorio', 'outro_advogado')
    and b.vencimento < (now() at time zone 'America/Sao_Paulo')::date
    and b.status_financeiro in ('em_aberto', 'vencido', 'parcial') and b.data_pagamento is null
    and b.status_operacional in ('regular','novo','em_cobranca_ativa','em_negociacao','possivel_acordo','pre_distribuicao','pre_juridico')
    and b.arquivada_em is null and b.duplicada_de_id is null and b.duplicidade_arquivada_em is null
    and not coalesce(b.excluida_por_cessao_espaco, false)
    and not coalesce(c.bloqueio_garantidora_habilitado and
      b.vencimento between c.bloqueio_garantidora_inicio and c.bloqueio_garantidora_fim, false)
    and not exists (select 1 from public.acordos a where a.unidade_id = u.id and a.tipo = 'judicial')
    and not exists (select 1 from public.acordos a where a.cobranca_id = b.id and a.status not in ('cancelado', 'renegociado'))
    and not exists (select 1 from public.acordo_cobrancas v join public.acordos a on a.id = v.acordo_id
      where v.cobranca_id = b.id and a.status not in ('cancelado', 'renegociado'))
  group by u.id, c.pre_juridico_minimo_cotas
  having count(distinct coalesce(public.cobranca_recibo_arquivo(b.observacoes), b.id::text)) >= c.pre_juridico_minimo_cotas;
$$;

revoke all on function public.pre_juridico_unidades_com_minimo(uuid[]) from public, anon, authenticated;
grant execute on function public.pre_juridico_unidades_com_minimo(uuid[]) to service_role;

do $$
declare
  definicao text := pg_get_functiondef('public.easy_espelhamento_entregar_pre(uuid,uuid,uuid)'::regprocedure);
  antiga text := $s$if cardinality(vencidas)<2 then raise exception 'São necessárias duas cotas vencidas em aberto.'; end if;$s$;
begin
  if strpos(definicao, antiga) = 0 then raise exception 'Regra de encaminhamento do Espelhamento mudou.'; end if;
  execute replace(definicao, antiga, $s$
  if cardinality(vencidas) < condominio.pre_juridico_minimo_cotas then
    raise exception 'O mínimo deste condomínio é de % cotas vencidas em aberto. Refaça a conferência.', condominio.pre_juridico_minimo_cotas;
  end if;$s$);
end;
$$;

notify pgrst, 'reload schema';
commit;
