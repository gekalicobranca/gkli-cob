create function public.easy_espelhamento_liberacao(c public.condominios, hoje date)
returns date
language sql immutable strict security invoker set search_path = ''
as $$
  select public.easy_maestro_liberacao(
    hoje, greatest(0, coalesce(c.dias_apos_vencimento_regua, c.inicio_cobranca_dias, 30)), c.vencimento_cota_dia
  );
$$;

revoke all on function public.easy_espelhamento_liberacao(public.condominios, date) from public, anon, authenticated;
grant execute on function public.easy_espelhamento_liberacao(public.condominios, date) to service_role;

CREATE OR REPLACE FUNCTION public.easy_espelhamento_painel_resumo(p_carteiras uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome,'nomeOperacional',c.nome_operacional,'carteira',ct.nome,
    'administradoras',catalogo.administradoras,'agendado',c.easy_espelhamento_agendado,
    'liberacaoEm',janela.liberacao_em,'liberado',coalesce(janela.liberacao_em <= janela.hoje,false),
    'cotasEmCobrancaAtiva',cotas.total,
    'ultimaConferenciaEm',consulta.concluido_em,'ultimoEspelhamentoEm',espelho.concluido_em,
    'execucao',case when recente.id is not null then jsonb_build_object('id',recente.id,'estado',recente.estado,'aplicar',recente.aplicar,
      'resumo',recente.resumo,'concluidoEm',recente.concluido_em) end) order by cotas.total,coalesce(nullif(c.nome_operacional,''),c.nome),c.id),'[]')
  from (select r.condominio_id, jsonb_agg(distinct r.administradora order by r.administradora) administradoras
        from public.easy_espelhamento_receitas(p_carteiras) r group by r.condominio_id) catalogo
  join public.condominios c on c.id=catalogo.condominio_id
  join public.carteiras ct on ct.id=c.carteira_id
  cross join lateral (
    select (now() at time zone 'America/Sao_Paulo')::date as hoje,
           public.easy_espelhamento_liberacao(c,(now() at time zone 'America/Sao_Paulo')::date) as liberacao_em
  ) janela
  cross join lateral (
    select count(*) as total from public.cobrancas cb
    where cb.condominio_id=c.id and cb.carteira_id=c.carteira_id
      and cb.status_operacional='em_cobranca_ativa'
      and cb.status_financeiro in ('em_aberto','parcial','vencido')
      and cb.arquivada_em is null and cb.duplicada_de_id is null
  ) cotas
  left join lateral (select e.id,e.estado,e.aplicar,e.resumo,e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id order by e.criado_em desc,e.id desc limit 1) recente on true
  left join lateral (select e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id and e.estado='concluido' order by e.concluido_em desc limit 1) consulta on true
  left join lateral (select e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id and e.estado='concluido' and e.aplicar
      and e.resumo->'pendencias'='0'::jsonb order by e.concluido_em desc limit 1) espelho on true;
$function$;

CREATE OR REPLACE FUNCTION public.easy_espelhamento_solicitar_administradora(p_carteiras uuid[], p_usuario uuid, p_lote uuid, p_condominios uuid[], p_aplicar boolean, p_administradora text, p_demonstrativo jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_usuario is null or p_lote is null or nullif(p_administradora,'') is null or coalesce(cardinality(p_condominios),0) not between 1 and 500 then raise exception 'Pedido inválido.'; end if;
  if exists(select 1 from unnest(p_condominios) alvo where alvo not in (select condominio_id from public.easy_espelhamento_receitas(p_carteiras) where administradora=p_administradora)) then
    raise exception 'Condomínio fora das carteiras permitidas ou da administradora selecionada.';
  end if;
  if exists (
    select 1 from public.condominios c
    where c.id=any(p_condominios)
      and (public.easy_espelhamento_liberacao(c,hoje) <= hoje) is not true
      and not exists (
        select 1 from public.easy_espelhamentos e
        where e.lote=p_lote and e.condominio_id=c.id and e.carteira_id=c.carteira_id
      )
  ) then
    raise exception 'Há condomínio ainda fora da janela da régua de cobrança. Atualize a lista.';
  end if;
  if p_demonstrativo is not null and (cardinality(p_condominios)<>1 or not exists(select 1 from public.condominios c where c.id=p_condominios[1]
    and regexp_replace(coalesce(c.cnpj,''),'[^0-9]','','g')=p_demonstrativo->>'cnpj') or coalesce(p_demonstrativo->>'sha256','') !~ '^[a-f0-9]{64}$') then
    raise exception 'O demonstrativo deve pertencer ao único condomínio selecionado.';
  end if;
  insert into public.easy_espelhamentos(lote,condominio_id,carteira_id,solicitado_por,aplicar,administradora,demonstrativo_repasses)
    select distinct p_lote,r.condominio_id,r.carteira_id,p_usuario,coalesce(p_aplicar,false),p_administradora,p_demonstrativo
    from public.easy_espelhamento_receitas(p_carteiras) r where r.condominio_id=any(p_condominios) and r.administradora=p_administradora
    on conflict do nothing;
  get diagnostics n=row_count;
  return n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.easy_espelhamento_agendar(p_usuario uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date; total integer;
begin
  if not exists(select 1 from public.profiles p where p.id=p_usuario and p.role in ('admin','gestor')) then
    raise exception 'Operador do agendamento indisponível.';
  end if;
  insert into public.easy_espelhamentos(lote,condominio_id,carteira_id,solicitado_por,aplicar,data_agendada,administradora)
    select gen_random_uuid(),c.id,c.carteira_id,p_usuario,false,hoje,alvo.administradora
    from public.condominios c
    join (select r.condominio_id,min(r.administradora) administradora from public.easy_espelhamento_receitas(null) r
          group by r.condominio_id having count(distinct r.administradora)=1) alvo on c.id=alvo.condominio_id
    where c.easy_espelhamento_agendado and public.easy_espelhamento_liberacao(c,hoje)=hoje
      and not exists(select 1 from public.easy_espelhamentos e where e.condominio_id=c.id and e.estado in ('fila','processando'))
    on conflict do nothing;
  get diagnostics total=row_count;
  return total;
end;
$function$;
