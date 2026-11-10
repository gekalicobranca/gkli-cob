SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.apurar_participacao_carteiras(p_periodo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_periodo public.fechamento_periodos%rowtype;
begin
  -- Match the legitimate admin/gestor action and trusted maintenance callers.
  if not (
    (session_user in ('postgres','supabase_admin')
      and coalesce(current_setting('role',true),'none') in ('none','postgres','supabase_admin'))
    or coalesce(current_setting('role',true),'')='service_role'
    or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','gestor'))
  ) then
    raise exception 'Somente gestores podem apurar a participacao das carteiras.' using errcode='42501';
  end if;
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
$function$;

REVOKE EXECUTE ON FUNCTION public.apurar_participacao_carteiras(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apurar_participacao_carteiras(uuid) TO authenticated, service_role;

-- Views must use the caller's existing table grants and wallet RLS.
ALTER VIEW public.v_cobrancas_bloqueio_planilha_adm SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.v_cobrancas_bloqueio_planilha_adm FROM PUBLIC, anon;
ALTER VIEW public.vw_analytics_executivo_p45 SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_analytics_executivo_p45 FROM PUBLIC, anon;
ALTER VIEW public.vw_bi_aging SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_bi_aging FROM PUBLIC, anon;
ALTER VIEW public.vw_bi_condominios SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_bi_condominios FROM PUBLIC, anon;
ALTER VIEW public.vw_bi_operacional SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_bi_operacional FROM PUBLIC, anon;
ALTER VIEW public.vw_bi_status SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_bi_status FROM PUBLIC, anon;
ALTER VIEW public.vw_carteira_operacional_p43 SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_carteira_operacional_p43 FROM PUBLIC, anon;
ALTER VIEW public.vw_cobrancas_financeiro SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_cobrancas_financeiro FROM PUBLIC, anon;
ALTER VIEW public.vw_cobrancas_operacional SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_cobrancas_operacional FROM PUBLIC, anon;
ALTER VIEW public.vw_cockpit_experimental SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_cockpit_experimental FROM PUBLIC, anon;
ALTER VIEW public.vw_cockpit_inteligente SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_cockpit_inteligente FROM PUBLIC, anon;
ALTER VIEW public.vw_cockpit_operacional_core SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_cockpit_operacional_core FROM PUBLIC, anon;
ALTER VIEW public.vw_cockpit_sindico_avancado SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_cockpit_sindico_avancado FROM PUBLIC, anon;
ALTER VIEW public.vw_dashboard_executivo_p41 SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_dashboard_executivo_p41 FROM PUBLIC, anon;
ALTER VIEW public.vw_funil_operacional_p42 SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_funil_operacional_p42 FROM PUBLIC, anon;
ALTER VIEW public.vw_mensageria_fila_operacional SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_mensageria_fila_operacional FROM PUBLIC, anon;
ALTER VIEW public.vw_portal_sindico_cobrancas SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_portal_sindico_cobrancas FROM PUBLIC, anon;
ALTER VIEW public.vw_portal_sindico_resumo SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON public.vw_portal_sindico_resumo FROM PUBLIC, anon;
