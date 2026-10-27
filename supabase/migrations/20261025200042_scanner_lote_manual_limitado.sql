-- Exceção explícita e descartável por token; a rotina continua exclusivamente noturna.
create table public.scanner_lotes_manuais (
 token uuid primary key,configuracao_id uuid not null references public.scanner_configuracoes(id),
 solicitado_em timestamptz not null default now(),expira_em timestamptz not null,
 motivo text not null check(length(motivo)>10),iniciado_em timestamptz,encerrado_em timestamptz,
 unidades text[],check(expira_em>solicitado_em and expira_em<=solicitado_em+interval '15 minutes')
);
create index scanner_lotes_manuais_config on public.scanner_lotes_manuais(configuracao_id);
alter table public.scanner_lotes_manuais enable row level security;
revoke all on public.scanner_lotes_manuais from public,anon,authenticated,service_role;
grant select on public.scanner_lotes_manuais to service_role;
grant update(iniciado_em,encerrado_em,unidades) on public.scanner_lotes_manuais to service_role;
-- A criação de uma autorização exige acesso administrativo direto ao banco.
do $$declare f text;antigo text;novo text;begin
 f:=pg_get_functiondef('public.scanner_reivindicar(uuid)'::regprocedure);
 antigo:='if horario < time ''00:30'' or horario >= time ''05:25'' then return; end if;';
 novo:='if (horario < time ''00:30'' or horario >= time ''05:25'') and not exists(select 1 from public.scanner_lotes_manuais m where m.token=p_token and m.expira_em>now() and m.iniciado_em is null and m.encerrado_em is null) then return; end if;
 if exists(select 1 from public.scanner_lotes_manuais m where m.token=p_token and (m.expira_em<=now() or m.iniciado_em is not null or m.encerrado_em is not null)) then return;end if;';
 if position(antigo in f)=0 then raise exception 'Guarda de reserva inesperada';end if;
 f:=replace(f,antigo,novo);
 antigo:='where s.ativo and';
 novo:='where (not exists(select 1 from public.scanner_lotes_manuais m where m.token=p_token) or exists(select 1 from public.scanner_lotes_manuais m where m.token=p_token and m.configuracao_id=s.id)) and s.ativo and';
 if position(antigo in f)=0 then raise exception 'Seletor de reserva inesperado';end if;
 f:=replace(f,antigo,novo);
 f:=replace(f,'return next v;','update public.scanner_lotes_manuais set iniciado_em=now(),unidades=v.unidades[v.cursor+1:least(v.cursor+20,cardinality(v.unidades))] where token=p_token and iniciado_em is null; return next v;');
 execute f;
 f:=pg_get_functiondef('public.scanner_aplicar_baixas(uuid)'::regprocedure);
 antigo:='if minutos<30 or minutos>=330 then return jsonb_build_object(''resultado'',''fora_da_janela'',''aplicadas'',0);end if;';
 novo:='if (minutos<30 or minutos>=330) and not exists(select 1 from public.scanner_lotes_manuais m join public.scanner_evidencias ev on ev.id=audit.evidencia_id where m.token=execucao and m.configuracao_id=ev.configuracao_id and m.iniciado_em is not null and m.encerrado_em is null and m.expira_em>now() and ev.observado_em>=m.iniciado_em and ev.unidade_portal=any(m.unidades)) then return jsonb_build_object(''resultado'',''fora_da_janela'',''aplicadas'',0);end if;';
 if position(antigo in f)=0 then raise exception 'Guarda de baixa inesperada';end if;
 execute replace(f,antigo,novo);
end$$;
