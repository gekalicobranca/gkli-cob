-- Sugestões são um artefato de revisão. Nenhuma função financeira consulta esta tabela.
create table public.scanner_analises (
 id uuid primary key default gen_random_uuid(),evidencia_id uuid not null references public.scanner_evidencias(id),
 configuracao_id uuid not null references public.scanner_configuracoes(id),condominio_id uuid not null references public.condominios(id),
 unidade_id uuid references public.unidades(id),observado_em timestamptz not null,evidencia_sha256 text not null,
 versao text not null default 'interpretacao-v1',estado text not null check(estado in ('em_execucao','concluida','falha','superada')),
 token uuid not null,reservado_ate timestamptz not null,tentativas integer not null default 1 check(tentativas between 1 and 3),
 proxima_tentativa timestamptz not null default now(),entrada jsonb not null,resultado jsonb,
 modelo text,criado_em timestamptz not null default now(),concluido_em timestamptz,
 unique(evidencia_id,observado_em,versao),
 check(resultado is null or (resultado->>'baixa_permitida'='false' and resultado->>'aplicacao_automatica'='false'))
);
create index scanner_analises_config on public.scanner_analises(configuracao_id);
create index scanner_analises_condo on public.scanner_analises(condominio_id);
create index scanner_analises_unidade on public.scanner_analises(unidade_id);
create index scanner_analises_criado on public.scanner_analises(criado_em desc);
create table public.scanner_ia_orcamento(dia date primary key,chamadas integer not null default 0 check(chamadas between 0 and 20));
alter table public.scanner_analises enable row level security;
alter table public.scanner_ia_orcamento enable row level security;
revoke all on public.scanner_analises,public.scanner_ia_orcamento from public,anon,authenticated,service_role;
grant select on public.scanner_analises to authenticated;
grant select,insert,update on public.scanner_analises,public.scanner_ia_orcamento to service_role;
create policy scanner_analises_admin on public.scanner_analises for select to authenticated using((select public.current_user_is_admin()));
comment on table public.scanner_ia_orcamento is 'Orçamento interno do executor; sem política de acesso ao cliente intencionalmente.';

create function public.scanner_analise_reivindicar(p_token uuid,p_autorizacao uuid default null) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare e public.scanner_evidencias;s public.scanner_configuracoes;c public.condominios;a public.scanner_analises;
 u uuid;entrada jsonb;minutos int;v_dia date:=(now() at time zone 'America/Sao_Paulo')::date;usos int;
begin
 if p_token is null then raise exception 'Token obrigatório';end if;
 minutos:=extract(hour from now() at time zone 'America/Sao_Paulo')::int*60+extract(minute from now() at time zone 'America/Sao_Paulo')::int;
 if p_autorizacao is null and (minutos<30 or minutos>=325) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('scanner_interpretacao',726));
 insert into public.scanner_ia_orcamento values(v_dia,0) on conflict do nothing;
 select chamadas into usos from public.scanner_ia_orcamento o where o.dia=v_dia for update;
 if usos>=20 then return null;end if;
 select x.* into e from public.scanner_evidencias x join public.scanner_configuracoes cfg on cfg.id=x.configuracao_id join public.condominios d on d.id=cfg.condominio_id
 where x.tipo='pagamentos' and cfg.ativo and d.status='ativo' and x.observado_em>=now()-interval '24 hours' and x.observado_em<=now()
 and x.dados->>'codigo'=cfg.codigo_portal and x.dados->>'unidade'=x.unidade_portal and x.unidade_portal=any(cfg.unidades)
 and (p_autorizacao is null or exists(select 1 from public.scanner_lotes_manuais m where m.token=p_autorizacao and m.configuracao_id=cfg.id and m.iniciado_em is not null and m.encerrado_em is null and m.expira_em>now() and x.unidade_portal=any(m.unidades)))
 and exists(select 1 from public.scanner_conciliacao_auditoria ca where ca.evidencia_id=x.id and ca.observado_em=x.observado_em and (ca.resultado<>'processado' or exists(select 1 from jsonb_array_elements(ca.itens) j where j->>'resultado'<>'validado')))
 and not exists(select 1 from public.scanner_evidencias nova where nova.configuracao_id=x.configuracao_id and nova.tipo=x.tipo and nova.unidade_portal=x.unidade_portal and (nova.observado_em,nova.id)>(x.observado_em,x.id))
 and not exists(select 1 from public.scanner_analises an where an.evidencia_id=x.id and an.observado_em=x.observado_em and an.versao='interpretacao-v1' and (an.estado in ('concluida','superada') or an.tentativas>=3 or an.reservado_ate>now() or an.proxima_tentativa>now()))
 order by x.observado_em desc,x.id limit 1 for update of x skip locked;
 if not found then return null;end if;
 select * into s from public.scanner_configuracoes where id=e.configuracao_id;
 select * into c from public.condominios where id=s.condominio_id;
 select ca.unidade_id into u from public.scanner_conciliacao_auditoria ca where ca.evidencia_id=e.id and ca.observado_em=e.observado_em order by ca.conferido_em desc limit 1;
 if not exists(select 1 from public.unidades where id=u and condominio_id=c.id and carteira_id=c.carteira_id) then u:=null;end if;
 entrada:=jsonb_build_object('portal',s.portal,'codigo',s.codigo_portal,'unidade_portal',e.unidade_portal,'evidencia_sha256',e.sha256,'observado_em',e.observado_em,'dados',e.dados,
 'prioridade_humana',exists(select 1 from public.central_pendencias cp where cp.condominio_id=c.id and cp.unidade_id=u and cp.status not in ('resolvida','cancelada') and cp.payload->>'estado' in ('atendimento_humano','revisao_identidade')),
 'judicial',coalesce((select acao_judicial from public.unidades where id=u),true),
 'cobrancas',coalesce((select jsonb_agg(t) from(select b.id,b.vencimento,round(b.valor_original*100)::bigint valor_centavos,b.status_financeiro,b.status_operacional,b.automacao_bloqueada,b.updated_at,public.cobranca_recibo_arquivo(b.observacoes) recibo from public.cobrancas b where b.unidade_id=u and b.condominio_id=c.id and b.carteira_id=c.carteira_id order by b.vencimento desc,b.id limit 40)t),'[]'),
 'acordos',coalesce((select jsonb_agg(t) from(select aa.id,aa.status,aa.tipo,aa.updated_at,aa.quantidade_parcelas,round(aa.valor_acordado*100)::bigint total_centavos,
  (select jsonb_agg(jsonb_build_object('id',pp.id,'numero',pp.numero,'vencimento',pp.vencimento,'valor_centavos',round(pp.valor*100)::bigint,'status',pp.status,'data_pagamento',pp.data_pagamento) order by pp.numero,pp.id) from public.parcelas_acordo pp where pp.acordo_id=aa.id) parcelas
 from public.acordos aa where aa.unidade_id=u and aa.condominio_id=c.id and aa.carteira_id=c.carteira_id order by aa.id limit 15)t),'[]'));
 insert into public.scanner_analises(evidencia_id,configuracao_id,condominio_id,unidade_id,observado_em,evidencia_sha256,estado,token,reservado_ate,entrada)
 values(e.id,s.id,c.id,u,e.observado_em,e.sha256,'em_execucao',p_token,now()+interval '90 seconds',entrada)
 on conflict(evidencia_id,observado_em,versao) do update set estado='em_execucao',token=p_token,reservado_ate=excluded.reservado_ate,tentativas=scanner_analises.tentativas+1,entrada=excluded.entrada returning * into a;
 update public.scanner_ia_orcamento o set chamadas=chamadas+1 where o.dia=v_dia;
 return jsonb_build_object('id',a.id,'token',p_token,'entrada',entrada);
end$$;

create function public.scanner_analise_concluir(p_token uuid,p_resultado jsonb,p_modelo text) returns text
language plpgsql security invoker set search_path=public as $$
declare a public.scanner_analises;e public.scanner_evidencias;situacao text;
begin
 select * into a from public.scanner_analises where token=p_token and estado='em_execucao' for update;
 if not found or a.reservado_ate<=now() then raise exception 'Reserva de interpretação inválida';end if;
 if jsonb_typeof(p_resultado)<>'object' or p_resultado->>'baixa_permitida' is distinct from 'false' or p_resultado->>'aplicacao_automatica' is distinct from 'false' or jsonb_typeof(p_resultado->'sugestoes') is distinct from 'array' or jsonb_array_length(p_resultado->'sugestoes')>20 then raise exception 'Resultado não é uma sugestão de revisão';end if;
 select * into e from public.scanner_evidencias where id=a.evidencia_id for share;
 situacao:=case when e.observado_em is distinct from a.observado_em or e.sha256 is distinct from a.evidencia_sha256
 or not exists(select 1 from public.scanner_configuracoes sc join public.condominios cc on cc.id=sc.condominio_id where sc.id=a.configuracao_id and sc.ativo and cc.status='ativo')
 or exists(select 1 from public.scanner_evidencias x where x.configuracao_id=e.configuracao_id and x.tipo=e.tipo and x.unidade_portal=e.unidade_portal and (x.observado_em,x.id)>(e.observado_em,e.id))
 or exists(select 1 from jsonb_array_elements(a.entrada->'cobrancas') b left join public.cobrancas atual on atual.id=(b->>'id')::uuid where atual.id is null or atual.updated_at is distinct from (b->>'updated_at')::timestamptz)
 or exists(select 1 from jsonb_array_elements(a.entrada->'acordos') aa left join public.acordos atual on atual.id=(aa->>'id')::uuid where atual.id is null or atual.updated_at is distinct from (aa->>'updated_at')::timestamptz or (select count(*) from public.parcelas_acordo p where p.acordo_id=atual.id)<>jsonb_array_length(coalesce(aa->'parcelas','[]'))
 or exists(select 1 from jsonb_array_elements(coalesce(aa->'parcelas','[]')) pp left join public.parcelas_acordo p on p.id=(pp->>'id')::uuid where p.id is null or p.vencimento is distinct from (pp->>'vencimento')::date or round(p.valor*100)::bigint is distinct from (pp->>'valor_centavos')::bigint or p.status is distinct from pp->>'status' or p.data_pagamento is distinct from (pp->>'data_pagamento')::date))
 then 'superada' else 'concluida' end;
 update public.scanner_analises set estado=situacao,resultado=p_resultado,modelo=left(p_modelo,100),concluido_em=now() where id=a.id;
 return situacao;
end$$;
revoke all on function public.scanner_analise_reivindicar(uuid,uuid),public.scanner_analise_concluir(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.scanner_analise_reivindicar(uuid,uuid),public.scanner_analise_concluir(uuid,jsonb,text) to service_role;
