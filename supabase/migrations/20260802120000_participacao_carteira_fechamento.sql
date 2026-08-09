alter table if exists public.carteiras
  add column if not exists percentual_participacao_resultado numeric(8,4) not null default 0
  check (percentual_participacao_resultado between 0 and 100);

alter table if exists public.fechamento_periodos
  add column if not exists percentual_redutor_imposto numeric(8,4) not null default 0
  check (percentual_redutor_imposto between 0 and 100);

alter table if exists public.fechamento_carteiras
  add column if not exists valor_repasse numeric(14,2) not null default 0,
  add column if not exists percentual_redutor_imposto numeric(8,4) not null default 0,
  add column if not exists valor_redutor_imposto numeric(14,2) not null default 0,
  add column if not exists valor_repasse_liquido numeric(14,2) not null default 0,
  add column if not exists percentual_participacao numeric(8,4) not null default 0,
  add column if not exists valor_participacao numeric(14,2) not null default 0;

comment on column public.carteiras.percentual_participacao_resultado is
  'Percentual da carteira aplicado ao repasse liquido no fechamento mensal.';

comment on column public.fechamento_periodos.percentual_redutor_imposto is
  'Percentual de imposto deduzido do repasse antes da participacao das carteiras.';

create or replace function public.apurar_participacao_carteiras(p_periodo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo public.fechamento_periodos%rowtype;
begin
  select * into v_periodo
    from public.fechamento_periodos
   where id = p_periodo_id
   for update;

  if not found then
    raise exception 'Periodo de fechamento nao encontrado.';
  end if;

  if v_periodo.status in ('fechado', 'faturado', 'cancelado') then
    raise exception 'Periodo % nao permite nova apuracao.', v_periodo.status;
  end if;

  update public.fechamento_carteiras fc
     set valor_repasse = calculo.valor_repasse,
         percentual_redutor_imposto = v_periodo.percentual_redutor_imposto,
         valor_redutor_imposto = round(calculo.valor_repasse * v_periodo.percentual_redutor_imposto / 100, 2),
         valor_repasse_liquido = calculo.valor_repasse_liquido,
         percentual_participacao = calculo.percentual_participacao,
         valor_participacao = round(calculo.valor_repasse_liquido * calculo.percentual_participacao / 100, 2)
    from (
      select
        fc2.id,
        coalesce(sum(fd.valor_despesa), 0)::numeric as valor_repasse,
        round(coalesce(sum(fd.valor_despesa), 0) * (100 - v_periodo.percentual_redutor_imposto) / 100, 2) as valor_repasse_liquido,
        coalesce(c.percentual_participacao_resultado, 0)::numeric as percentual_participacao
      from public.fechamento_carteiras fc2
      left join public.fechamento_despesas fd
        on fd.periodo_id = fc2.periodo_id
       and fd.carteira_id is not distinct from fc2.carteira_id
      left join public.carteiras c on c.id = fc2.carteira_id
      where fc2.periodo_id = p_periodo_id
      group by fc2.id, c.percentual_participacao_resultado
    ) calculo
   where fc.id = calculo.id;

  update public.fechamento_periodos
     set total_comissoes = coalesce((
           select sum(valor_participacao)
             from public.fechamento_carteiras
            where periodo_id = p_periodo_id
         ), 0),
         updated_at = now()
   where id = p_periodo_id;
end;
$$;

revoke all on function public.apurar_participacao_carteiras(uuid) from public;
grant execute on function public.apurar_participacao_carteiras(uuid) to authenticated;
