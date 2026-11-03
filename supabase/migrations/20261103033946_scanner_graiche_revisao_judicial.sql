begin;

-- Opt-in de relatório, sem modificar conciliador, aplicador de baixas ou acordos.
alter table public.scanner_configuracoes add column relatorio_judicial boolean not null default false;
alter table public.scanner_configuracoes add constraint scanner_relatorio_judicial_portal
 check(not relatorio_judicial or portal='graiche');

create function public.scanner_relatorio_judicial_permitido(p_configuracao uuid,p_acordo uuid,p_evidencia uuid,p_lote uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from public.scanner_configuracoes s
  join public.condominios c on c.id=s.condominio_id and c.status='ativo'
  join public.acordos a on a.id=p_acordo and a.condominio_id=c.id and a.carteira_id=c.carteira_id
  join public.scanner_evidencias e on e.id=p_evidencia and e.configuracao_id=s.id and e.unidade_portal=a.unidade_id::text
  where s.id=p_configuracao and s.ativo and s.portal='graiche' and s.relatorio_judicial
   and a.tipo='judicial' and a.status in ('ativo','em_dia','em_atraso','vencido')
   and e.tipo='pagamentos' and e.observado_em between now()-interval '24 hours' and now()+interval '5 minutes'
   and e.dados->>'codigo'=s.codigo_portal and e.dados->>'unidade'=e.unidade_portal
   and e.dados->>'status'='inconclusivo' and e.dados->'conferencia_acordos'->>'versao'='1'
   and split_part(e.dados->'conferencia_acordos'->>'fonte','?',1)='https://servc9-1.webware.com.br/bin/rt/gAcordo.asp'
   and e.dados->'conferencia_acordos'->>'situacao' in ('unidade_nao_disponivel','unidade_disponivel','identidade_ambigua')
   and (p_lote is null or exists(select 1 from public.scanner_lotes l where l.token=p_lote and l.configuracao_id=s.id
    and l.concluido_em is not null and e.observado_em between l.iniciado_em and l.concluido_em+interval '1 second'))
 )
$$;
revoke all on function public.scanner_relatorio_judicial_permitido(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.scanner_relatorio_judicial_permitido(uuid,uuid,uuid,uuid) to service_role;

do $$declare src text;ancora text:='and a.tipo<>''judicial'') then';begin
 src:=pg_get_functiondef('public.scanner_registrar_relatorio_email(text,uuid,uuid,uuid,text,text,jsonb,jsonb)'::regprocedure);
 if position(ancora in src)=0 then raise exception 'Regra de escopo do relatório mudou; revisar migração.';end if;
 execute replace(src,ancora,$regra$
 and (a.tipo<>'judicial' or (
  j->>'tipo_revisao'='judicial' and j->>'baixa_permitida'='false' and j->>'revisao_humana_obrigatoria'='true'
  and public.scanner_relatorio_judicial_permitido(s.id,a.id,nullif(j->>'evidencia_id','')::uuid,p_lote)
 ))) then$regra$);
end $$;
notify pgrst,'reload schema';
commit;
