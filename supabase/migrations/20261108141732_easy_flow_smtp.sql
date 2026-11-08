begin;
create table public.easy_flow_execucoes (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios(id),
  carteira_id uuid not null references public.carteiras(id),
  criado_por uuid not null,
  regua_id uuid not null references public.reguas(id),
  smtp_config_id uuid references public.integracoes_smtp_config(id),
  status text not null default 'preview' check(status in ('preview','montando','entre_partes','pronto','liberando','concluido','atencao','cancelado')),
  plano jsonb not null, versoes jsonb not null, config_version text not null, resumo jsonb not null,
  parte integer not null default 0 check(parte>=0),
  flow_ids uuid[] not null default '{}',
  mensagens integer not null default 0 check(mensagens>=0),
  liberadas integer not null default 0 check(liberadas>=0),
  erro text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index easy_flow_condominio_em_andamento on public.easy_flow_execucoes(condominio_id)
  where status in ('preview','montando','entre_partes','pronto','liberando');
create index easy_flow_ids_idx on public.easy_flow_execucoes using gin(flow_ids);
create index easy_flow_carteira_idx on public.easy_flow_execucoes(carteira_id,created_at desc);
alter table public.easy_flow_execucoes enable row level security;
revoke all on public.easy_flow_execucoes from public,anon,authenticated;
grant select,insert,update on public.easy_flow_execucoes to service_role;
comment on table public.easy_flow_execucoes is 'Montagem Easy Flow e escolha SMTP, exclusivamente do servidor. Nenhuma credencial é copiada.';

-- Preserva a implementação instalada (inclusive rotas administrativas e scanner).
-- Mantém o OID público para que todos os consumidores passem pela escolha Easy.
do $$
declare src text;
begin
  src:=pg_get_functiondef('public.email_smtp_candidatas(uuid)'::regprocedure);
  if position('FUNCTION public.email_smtp_candidatas(' in src)=0 then raise exception 'Definição SMTP incompatível; revisar antes de migrar.';end if;
  execute replace(src,'FUNCTION public.email_smtp_candidatas(','FUNCTION public.email_smtp_candidatas_padrao(');
end $$;
create or replace function public.email_smtp_candidatas(p_mensagem uuid)
returns table(config_id uuid,conta text,preferencia integer)
language plpgsql stable security invoker set search_path='' as $$
declare m public.mensagens; escolha public.easy_flow_execucoes; condo uuid;
begin
  select * into strict m from public.mensagens where id=p_mensagem;
  -- A continuação herda a conta pela ligação financeira do job, nunca pelo payload da mensagem.
  with recursive origem(id,nivel,caminho) as (
    select m.cobranca_flow_id,0,array[m.cobranca_flow_id]
    union all
    select p.flow_origem_id,o.nivel+1,o.caminho||p.flow_origem_id
      from origem o join public.cobranca_flows f on f.id=o.id
      join public.flow_progressao p on p.lote_id=f.lote_id and p.carteira_id=f.carteira_id
      where not p.flow_origem_id=any(o.caminho)
  )
  select e.* into escolha from origem o join public.easy_flow_execucoes e on o.id=any(e.flow_ids)
    where e.smtp_config_id is not null order by o.nivel limit 1;
  if found then
    select c.condominio_id into condo from public.cobrancas c where c.id=m.cobranca_id and c.carteira_id=m.carteira_id;
    if escolha.carteira_id is distinct from m.carteira_id or escolha.condominio_id is distinct from condo then
      raise exception 'Escolha SMTP Easy fora da carteira ou condomínio da mensagem.';
    end if;
    return query select b.config_id,b.conta,b.preferencia from public.email_smtp_candidatas_padrao(p_mensagem) b
      join public.integracoes_smtp_config s on s.id=b.config_id
      where b.config_id=escolha.smtp_config_id and s.ativo and s.carteira_id=m.carteira_id;
    if not found then raise exception 'Conta SMTP selecionada no Easy Flow indisponível ou incompatível com a rota do condomínio.';end if;
    return;
  end if;
  return query select * from public.email_smtp_candidatas_padrao(p_mensagem);
end $$;
revoke all on function public.email_smtp_candidatas_padrao(uuid),public.email_smtp_candidatas(uuid) from public,anon,authenticated;
grant execute on function public.email_smtp_candidatas_padrao(uuid),public.email_smtp_candidatas(uuid) to service_role;
notify pgrst,'reload schema';
commit;
