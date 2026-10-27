-- Uma exceção exige autorização administrativa específica, expira com o lote e não muda a cota automática.
create table public.scanner_ia_extras (
 token uuid primary key references public.scanner_lotes_manuais(token),
 limite integer not null check(limite between 1 and 20),
 chamadas integer not null default 0 check(chamadas between 0 and limite),
 motivo text not null check(length(motivo)>20),criado_em timestamptz not null default now()
);
alter table public.scanner_ia_extras enable row level security;
revoke all on public.scanner_ia_extras from public,anon,authenticated,service_role;
grant select,update(chamadas) on public.scanner_ia_extras to service_role;
comment on table public.scanner_ia_extras is 'Exceções de IA autorizadas por lote. Sem acesso de cliente; executor não cria nem amplia limites.';
do $$declare f text;antigo text;novo text;begin
 f:=pg_get_functiondef('public.scanner_analise_reivindicar(uuid,uuid)'::regprocedure);
 if position('usos int;' in f)=0 then raise exception 'Declaração do orçamento inesperada';end if;
 f:=replace(f,'usos int;','usos int;extra boolean:=false;limite_extra int;');
 antigo:='if usos>=20 then return null;end if;';
 novo:='if p_autorizacao is not null then
  select ex.limite into limite_extra from public.scanner_ia_extras ex join public.scanner_lotes_manuais m on m.token=ex.token
  where ex.token=p_autorizacao and m.iniciado_em is not null and m.encerrado_em is null and m.expira_em>now() for update of ex;
  extra:=found;
 end if;
 if extra then
  select chamadas into usos from public.scanner_ia_extras where token=p_autorizacao;
  if usos>=limite_extra then return null;end if;
 elsif usos>=20 then return null;end if;';
 if position(antigo in f)=0 then raise exception 'Limite automático inesperado';end if;
 f:=replace(f,antigo,novo);
 antigo:='update public.scanner_ia_orcamento o set chamadas=chamadas+1 where o.dia=v_dia;';
 novo:='if extra then update public.scanner_ia_extras set chamadas=chamadas+1 where token=p_autorizacao;
 else update public.scanner_ia_orcamento o set chamadas=chamadas+1 where o.dia=v_dia;end if;';
 if position(antigo in f)=0 then raise exception 'Contador automático inesperado';end if;
 execute replace(f,antigo,novo);
end$$;
