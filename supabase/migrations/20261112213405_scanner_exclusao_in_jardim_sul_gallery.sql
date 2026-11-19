begin;
set local lock_timeout='5s';

alter table public.scanner_configuracoes
  add column excluido_em timestamptz,
  add constraint scanner_configuracoes_excluido_inativo
    check (excluido_em is null or not ativo);

comment on column public.scanner_configuracoes.excluido_em is
  'Exclusão explícita do scanner. Exige configuração inativa e exclui o condomínio da seleção de saldos.';

CREATE OR REPLACE FUNCTION public.scanner_saldos_alvos()
 RETURNS TABLE(unidade_id uuid, condominio_id uuid, carteira_id uuid, identificacao text, bloco text, condominio text, receita_id uuid, portal text, configuracao jsonb, cobrancas jsonb, saldo_centavos bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 with base as (
 select u.id unidade_id,u.condominio_id,u.carteira_id,u.identificacao,u.bloco,c.nome condominio,
 jsonb_agg(jsonb_build_object('id',b.id,'vencimento',b.vencimento,'original_centavos',round(coalesce(b.valor_original,0)*100)::bigint,
 'atual_centavos',round(coalesce(b.valor_atualizado,b.valor_original,0)*100)::bigint,
 'status',coalesce(b.status_operacional,b.status),'recibo',public.cobranca_recibo_arquivo(b.observacoes)) order by b.id) cobrancas,
 round(sum(coalesce(b.valor_atualizado,b.valor_original,0))*100)::bigint saldo_centavos
 from public.unidades u join public.condominios c on c.id=u.condominio_id and c.carteira_id=u.carteira_id
 join public.cobrancas b on b.unidade_id=u.id and b.condominio_id=u.condominio_id and b.carteira_id=u.carteira_id
 where c.status='ativo' and not coalesce(u.acao_judicial,false) and nullif(trim(u.numero_processo),'') is null
 and b.duplicada_de_id is null and b.status_financeiro='em_aberto' and b.data_pagamento is null
 and coalesce(b.status_operacional,b.status) in ('novo','em_cobranca_ativa','regular')
 and not exists(select 1 from public.pre_juridico_casos p where p.unidade_id=u.id)
 and not exists(select 1 from public.cobrancas x where x.unidade_id=u.id and x.duplicada_de_id is null
  and x.status_financeiro='em_aberto' and x.data_pagamento is null
  and (x.status in ('pre_juridico','pre_distribuicao','judicializado') or x.status_operacional in ('pre_juridico','pre_distribuicao','judicializado')))
 and not exists(select 1 from public.acordos a where a.unidade_id=u.id and a.tipo='judicial' and a.status not in ('cancelado','quitado','renegociado'))
 and not exists(select 1 from public.central_pendencias p where p.unidade_id=u.id and p.tipo='conciliacao_pesquisa_judicial' and p.status not in ('resolvida','cancelada'))
 group by u.id,c.nome having sum(coalesce(b.valor_atualizado,b.valor_original,0))>10000
 )
 select b.unidade_id,b.condominio_id,b.carteira_id,b.identificacao,b.bloco,b.condominio,r.id,
 case r.script_key when 'captacao_lello' then 'lello' when 'manager_atentum_cotas_pendentes' then 'manager'
 when 'bbz_condopro_clock_vila_romana' then 'bbz' when 'captacao_hflex' then 'hflex' when 'verti_winker_inadimplencia' then 'winker' end,
 jsonb_build_object('codigo_portal',coalesce(r.config_json->>'codigo_portal',r.config_json->>'codigo_cliente'),
 'perfil_acesso',coalesce(s.perfil_acesso,'PADRAO')),b.cobrancas,b.saldo_centavos
 from base b left join lateral(select a.id,a.script_key,a.config_json from public.agente_receitas a
 where a.ativo and a.config_json->>'condominio_id'=b.condominio_id::text
 and a.script_key in ('captacao_lello','manager_atentum_cotas_pendentes','bbz_condopro_clock_vila_romana','captacao_hflex','verti_winker_inadimplencia')
 and coalesce(a.config_json->>'coleta_segmentada','false')<>'true'
 order by a.id limit 1)r on true
 left join public.scanner_configuracoes s on s.condominio_id=b.condominio_id
 where s.excluido_em is null;
$function$;

with excluido as (
  update public.scanner_configuracoes s
  set ativo=false,
      excluido_em=now(),
      retomada_prioritaria_ate=null,
      ultimo_resultado='Excluído das execuções do scanner a pedido do usuário em 12/11/2026.'
  from public.condominios c
  where c.id=s.condominio_id
    and upper(c.nome)='CONDOMINIO IN JARDIM SUL GALLERY'
    and upper(c.administradora)='BBZ'
    and s.portal='bbz'
  returning s.id
)
update public.scanner_evidencias e
set cadastro_status=case when e.tipo='contatos' and e.cadastro_status='pendente' then 'pausado' else e.cadastro_status end,
    conciliacao_status=case when e.tipo='pagamentos' and e.conciliacao_status='pendente' then 'pausado' else e.conciliacao_status end
from excluido
where e.configuracao_id=excluido.id
  and ((e.tipo='contatos' and e.cadastro_status='pendente') or (e.tipo='pagamentos' and e.conciliacao_status='pendente'));

notify pgrst, 'reload schema';
commit;
