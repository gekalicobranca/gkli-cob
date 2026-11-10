-- Mantém autorização por carteira e perfil; admite somente dois acessos compartilhados conferidos.
alter policy acordos_exec_solicitar on public.agente_acordos_execucoes with check (
  public.current_user_can_access_carteira(carteira_id)
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('admin','operador'))
  and solicitado_por=(select auth.uid()) and status='pendente' and etapa='fila' and origem='manual'
  and iniciado_em is null and finalizado_em is null and worker_id is null and mensagem is null
  and storage_path is null and nome_pdf is null and tamanho_pdf is null and hash_pdf is null
  and exists(select 1 from public.agente_acordos_configuracoes c join public.condominios co on co.id=c.condominio_id
    where c.condominio_id=agente_acordos_execucoes.condominio_id and c.carteira_id=agente_acordos_execucoes.carteira_id
    and c.codigo_cliente=agente_acordos_execucoes.codigo_cliente and c.administradora=agente_acordos_execucoes.administradora
    and c.habilitado and co.status='ativo' and co.carteira_id=c.carteira_id and (
      lower(co.administradora)=lower(c.administradora)
      or (c.administradora='Lello' and c.alvos_portal=jsonb_build_array(jsonb_build_object('codigo','62430','nome','FOLLOW THE EUREKA BUILDING'))
        and c.condominio_id='13290a44-ec8d-4232-81e7-711196547f91' and co.administradora='HUBERT/Lello' and c.codigo_cliente='62430')
      or (c.administradora='Lello' and c.alvos_portal=jsonb_build_array(jsonb_build_object('codigo','62751','nome','VILLA NATURA'))
        and c.condominio_id='cd36f759-d5be-436d-a415-5976bd8958cc' and co.administradora='Hubert' and c.codigo_cliente='62751')
    ))
);

